/**
 * Turn raw NSE prices into a continuous series.
 *
 * A stated split or bonus is applied only if the price really moved by about
 * that ratio at the ex-date; a ratio the price contradicts is rejected and
 * reported rather than applied. Demergers and schemes of arrangement state no
 * ratio, so theirs is taken from the ex-date price move when it is large.
 */
import { parseCorporateAction, rightsPriceFactor, statedPriceFactor, type ParsedAction } from './corporate-actions'

export interface RawPriceBar {
  date: number      // YYYYMMDD
  open: number
  high: number
  low: number
  close: number
  volume: number
  value: number
}

export interface AdjustedBar extends RawPriceBar {
  /** Multiply raw prices by this to get split/bonus/demerger-adjusted prices. */
  priceFactor: number
  /** priceFactor with cash dividends reinvested: use for returns. */
  totalReturnFactor: number
  /** Split/bonus part only: raw share counts (volume, delivery) are divided by this. */
  shareFactor: number
}

export type EventStatus =
  | 'confirmed'     // stated ratio matches the price move
  | 'inferred'      // no stated ratio; taken from the price move
  | 'rejected'      // stated ratio contradicted by the price: NOT applied
  | 'dividend'      // ordinary cash dividend: total return only

export interface AdjustmentEvent {
  exDate: number            // first bar on the new basis
  status: EventStatus
  priceFactor: number       // 1 when nothing is applied
  shareFactor: number       // split/bonus part only: volume is divided by this
  dividend: number          // rupees per share, 0 when unknown
  purposes: string[]
  note?: string
}

/** How far the ex-date move may be from the stated ratio (log scale: about ±22%). */
const RATIO_TOLERANCE = 0.2
/** A demerger is adjusted from the price only when the ex-date drop exceeds this. */
const RESTRUCTURE_MIN_DROP = 0.12
/** A share consolidation with no stated ratio is adjusted when the ex-date open jumps this much. */
const CONSOLIDATION_MIN_JUMP = 1.5
const SEARCH_BARS = 3
const SEARCH_BARS_LATER = 12
/**
 * A dividend of at least this share of the price is "extraordinary" under
 * the exchange's rule for adjusting derivatives, and adjusts the price series
 * too, not only total return. Brokers' adjusted history follows the same rule.
 */
const EXTRAORDINARY_DIVIDEND = 0.02

function mergeActions(purposes: string[]): ParsedAction & { dividendAmounts: number[] } {
  const merged: ParsedAction = { restructure: false }
  const amounts = new Set<number>()
  for (const p of purposes) {
    const a = parseCorporateAction(p)
    merged.split ??= a.split
    merged.bonus ??= a.bonus
    if (a.rights && (!merged.rights || merged.rights.premium == null)) merged.rights = a.rights
    merged.restructure ||= a.restructure
    if (a.dividend?.amount) amounts.add(a.dividend.amount)
  }
  return { ...merged, dividendAmounts: [...amounts] }
}

/**
 * NSE may list one ex-date's dividend several times: as separate parts
 * ("DIV RS 2" and "SPL DIV RS 5", total 7), as a part plus the combined
 * figure ("DIV-RS.3" and "DIV-FIN RS3+INT RS120", total 123), or as a figure
 * and its correction ("DIV-RS 6" then "DIV-RE 0.60"). The reading closest to
 * the ex-date price drop is used.
 */
function dividendTotal(amounts: number[], cumClose: number, gap: number): number {
  if (!amounts.length) return 0
  const drop = (1 - gap) * cumClose
  const readings = [...amounts, amounts.reduce((s, x) => s + x, 0)]
  return readings.reduce((best, x) => (Math.abs(drop - x) < Math.abs(drop - best) ? x : best))
}

const logDistance = (a: number, b: number) => Math.abs(Math.log(a / b))

/**
 * Resolve the corporate actions of one security against its raw bars
 * (oldest first). `actions` maps an ex-date to every description NSE
 * published for it.
 */
export function resolveEvents(bars: RawPriceBar[], actions: Map<number, string[]>): AdjustmentEvent[] {
  const events: AdjustmentEvent[] = []
  const gapAt = (i: number) => bars[i].open / bars[i - 1].close
  const ratioApplied = new Set<number>()

  for (const [exDate, purposes] of [...actions.entries()].sort((a, b) => a[0] - b[0])) {
    const a = mergeActions(purposes)
    let i = bars.findIndex(b => b.date >= exDate)
    if (i <= 0) continue // listed after the action, or no price before it

    const stated = statedPriceFactor(a)
    if (stated != null) {
      const expected = stated * (rightsPriceFactor(a, bars[i - 1].close) ?? 1)
      // The ex-date in the file is occasionally off by a session or two
      const candidates = [i]
      for (let k = 1; k <= SEARCH_BARS; k++) candidates.push(i + k, i - k)
      // Ex-dates get postponed, and a consolidation can follow a trading halt
      for (let k = SEARCH_BARS + 1; k <= SEARCH_BARS_LATER; k++) candidates.push(i + k)
      const hit = candidates.find(j => j > 0 && j < bars.length && logDistance(gapAt(j), expected) <= RATIO_TOLERANCE)
      // A ratio near 1 is "confirmed" by any quiet day, so only trust a shifted date for real jumps
      if (hit == null || (hit !== i && Math.abs(Math.log(expected)) <= 2 * RATIO_TOLERANCE)) {
        events.push({
          exDate: bars[i].date, status: 'rejected', priceFactor: 1, shareFactor: 1, dividend: 0, purposes,
          note: `stated ratio ${stated.toFixed(4)} but price moved ${gapAt(i).toFixed(4)}`,
        })
        continue
      }
      // NSE lists a postponed action under both ex-dates; both resolve to the same bar
      if (ratioApplied.has(hit)) continue
      ratioApplied.add(hit)
      i = hit
    }

    const cumClose = bars[i - 1].close
    const gap = gapAt(i)
    const notes: string[] = []
    let priceFactor = stated ?? 1
    let status: EventStatus = 'confirmed'

    // The theoretical ex-rights price uses the premium as the issue price (the
    // face value is not in the text), which overstates the adjustment for an
    // issue at par. Without a split or bonus to confirm against, use it only
    // when the price agrees; otherwise take a large fall as it happened.
    const rights = rightsPriceFactor(a, cumClose)
    if (rights != null && (stated != null || logDistance(gap, rights) <= RATIO_TOLERANCE)) {
      priceFactor *= rights
      notes.push('rights issue (theoretical ex-rights price)')
    } else if (rights != null && gap <= 1 - RESTRUCTURE_MIN_DROP) {
      priceFactor *= gap
      notes.push('rights issue (ratio taken from the ex-date open)')
    }

    let dividend = plausibleDividend(dividendTotal(a.dividendAmounts, cumClose, gap), cumClose, gap)
    if (stated == null && a.restructure && (gap <= 1 - RESTRUCTURE_MIN_DROP || gap >= CONSOLIDATION_MIN_JUMP)) {
      // The ex-date open already reflects everything that went ex that day
      priceFactor = gap
      dividend = 0
      status = 'inferred'
      notes.push('ratio taken from the ex-date open')
    } else if (dividend / cumClose >= EXTRAORDINARY_DIVIDEND) {
      priceFactor *= 1 - dividend / cumClose
      notes.push(`extraordinary dividend Rs ${dividend} treated as a price adjustment`)
      dividend = 0
    }

    if (priceFactor !== 1) {
      events.push({
        exDate: bars[i].date, status, priceFactor, shareFactor: stated ?? 1, dividend, purposes,
        note: notes.join('; ') || undefined,
      })
    } else if (dividend > 0) {
      events.push({ exDate: bars[i].date, status: 'dividend', priceFactor: 1, shareFactor: 1, dividend, purposes })
    }
  }
  return events
}

/**
 * The dividend per share, or 0 when the figure cannot be right: above the
 * share price, or large while the price did not fall on the ex-date.
 */
function plausibleDividend(amount: number, cumClose: number, gap: number): number {
  const share = amount / cumClose
  if (!(amount > 0) || share >= 1) return 0
  if (share >= 0.2 && gap > 1 - share / 2) return 0
  return amount
}

/** Apply resolved events: factors accumulate backwards from the latest bar. */
export function applyAdjustments<T extends RawPriceBar>(bars: T[], events: AdjustmentEvent[]): Array<T & AdjustedBar> {
  const byDate = new Map<number, AdjustmentEvent[]>()
  for (const e of events) {
    if (e.status === 'rejected') continue
    byDate.set(e.exDate, [...(byDate.get(e.exDate) ?? []), e])
  }

  const out: Array<T & AdjustedBar> = new Array(bars.length)
  let price = 1, shares = 1, total = 1
  for (let i = bars.length - 1; i >= 0; i--) {
    const b = bars[i]
    out[i] = {
      ...b,
      open: b.open * price, high: b.high * price, low: b.low * price, close: b.close * price,
      volume: b.volume / shares,
      priceFactor: price,
      totalReturnFactor: total,
      shareFactor: shares,
    }
    // Events on this bar's date change the basis of every EARLIER bar
    for (const e of byDate.get(b.date) ?? []) {
      const prevClose = i > 0 ? bars[i - 1].close : 0
      const dividendFactor = e.dividend > 0 && prevClose > e.dividend ? 1 - e.dividend / prevClose : 1
      price *= e.priceFactor
      shares *= e.shareFactor
      total *= e.priceFactor * dividendFactor
    }
  }
  return out
}

const MIN_PRICE_FOR_GAP_CHECK = 5
const GAP_DOWN = 0.6
/** The close must still be within about 28% of the opening move for it to count as a new price basis. */
const PERSISTENCE_TOLERANCE = 0.25
const GAP_UP = 1.8

/** Ratios a split, bonus or consolidation produces. */
const CLEAN_RATIOS = [1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 6, 1 / 8, 1 / 10, 1 / 20, 1 / 25, 1 / 50, 1 / 100, 2 / 5, 3 / 5, 2, 4, 5, 10, 20, 100]

/**
 * NSE's corporate-action file misses some actions entirely (Shriram Finance's
 * 1:5 split of January 2025 is not in it). Between two consecutive sessions
 * NSE's price bands cap ordinary moves at 20%, so a larger overnight move in
 * a stock that traded the day before is a corporate action. The factor snaps
 * to a split ratio when the move is within about 6% of one (and then rescales
 * volume too); otherwise the move itself is used, as for a demerger.
 */
export function factorFromGap(gap: number): { priceFactor: number; shareFactor: number } | null {
  if (!(gap > 0) || (gap > GAP_DOWN && gap < GAP_UP)) return null
  const clean = CLEAN_RATIOS.find(r => logDistance(gap, r) <= 0.06)
  return clean ? { priceFactor: clean, shareFactor: clean } : { priceFactor: gap, shareFactor: 1 }
}

export interface UnexplainedGap {
  date: number
  gap: number   // open / previous close
}

/**
 * Large overnight moves that no resolved event accounts for, split into
 * those adjusted from the price (`inferred`: the stock traded the previous
 * session) and those left alone (`flagged`: trading resumed after a
 * suspension, where the new price is a real outcome for holders).
 *
 * @param tradedPreviousSession whether bars[i-1] is the market session right before bars[i]
 */
export function resolveUnannounced(
  bars: RawPriceBar[], events: AdjustmentEvent[], tradedPreviousSession: (i: number) => boolean
): { inferred: AdjustmentEvent[]; flagged: UnexplainedGap[] } {
  const explained = new Set(events.filter(e => e.status !== 'rejected' && e.priceFactor !== 1).map(e => e.exDate))
  const inferred: AdjustmentEvent[] = []
  const flagged: UnexplainedGap[] = []
  for (let i = 1; i < bars.length; i++) {
    // Below a few rupees one price tick is a large percentage move
    if (bars[i - 1].close < MIN_PRICE_FOR_GAP_CHECK || explained.has(bars[i].date)) continue
    const gap = bars[i].open / bars[i - 1].close
    const factor = factorFromGap(gap)
    // A freak opening print reverses within the session; a corporate action does not
    if (!factor || logDistance(bars[i].close / bars[i - 1].close, gap) > PERSISTENCE_TOLERANCE) continue
    if (tradedPreviousSession(i)) {
      inferred.push({
        exDate: bars[i].date, status: 'inferred', ...factor, dividend: 0, purposes: [],
        note: `not in NSE's corporate-action file; open was ${gap.toFixed(3)}x the previous close`,
      })
    } else {
      flagged.push({ date: bars[i].date, gap })
    }
  }
  return { inferred, flagged }
}
