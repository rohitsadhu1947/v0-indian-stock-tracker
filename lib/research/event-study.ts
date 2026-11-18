/**
 * What a stock's price did around an announcement, from minute bars. Pure
 * functions.
 *
 * The trade measured is the one a person with an alert could make: buy at
 * the open of the first minute that starts at least `delayMinutes` after the
 * announcement (or at the next session's open when the market is shut), and
 * sell a fixed time later.
 */

/** [start time in ms, open, high, low, close, volume] */
export type Candle = [number, number, number, number, number, number]

const IST_MS = 5.5 * 3600000
const MINUTE = 60000
/** The India calendar day a moment falls on. */
export const istDay = (ms: number): string => new Date(ms + IST_MS).toISOString().slice(0, 10)
const istMinutes = (ms: number): number => { const d = new Date(ms + IST_MS); return d.getUTCHours() * 60 + d.getUTCMinutes() }

export interface EventOutcome {
  /** Whether the entry was in the session the announcement came out in. */
  sameSession: boolean
  entryTime: number
  entryPrice: number
  /** Move from the last price before the announcement to the entry: what was gone before you could act. */
  runUpPct: number | null
  /** Return from the entry to the close of the bar ending this many minutes later, same session. */
  after: Record<number, number | null>
  /** To the close of the entry's session, and of the session after it. */
  toClosePct: number
  toNextClosePct: number | null
  /** Sell at the target or the stop within the entry's session, else at its close. The stop is taken when one bar touches both. */
  targetStopPct: number
  /** Times used, so the same windows can be measured on an index. */
  exits: { after: Record<number, number | null>; close: number; nextClose: number | null }
}

export const HORIZONS = [5, 15, 30, 60]

export function eventOutcome(
  candles: Candle[], announcedAt: number, opts: { delayMinutes?: number; targetPct?: number; stopPct?: number } = {}
): EventOutcome | null {
  const delay = opts.delayMinutes ?? 2, targetPct = opts.targetPct ?? 2, stopPct = opts.stopPct ?? 2
  if (!candles.length) return null

  // During the session: the first bar starting at least `delay` minutes later, if there is still time to trade that day
  const day = istDay(announcedAt)
  const minuteOfDay = istMinutes(announcedAt)
  let entry = -1, sameSession = false
  if (minuteOfDay >= 9 * 60 + 15 && minuteOfDay <= 15 * 60 + 15) {
    entry = candles.findIndex(c => c[0] >= announcedAt + delay * MINUTE && istDay(c[0]) === day)
    sameSession = entry >= 0
  }
  // Otherwise the first bar of the next session: the same day's open for news before 09:15, a later day's for the rest
  if (entry < 0) entry = candles.findIndex(c => c[0] > announcedAt && (minuteOfDay < 9 * 60 + 15 || istDay(c[0]) !== day))
  if (entry < 0) return null

  const entryTime = candles[entry][0], entryPrice = candles[entry][1]
  if (!(entryPrice > 0)) return null
  const entryDay = istDay(entryTime)
  let sessionEnd = entry
  while (sessionEnd + 1 < candles.length && istDay(candles[sessionEnd + 1][0]) === entryDay) sessionEnd++
  let nextEnd = -1
  if (sessionEnd + 1 < candles.length) {
    const nextDay = istDay(candles[sessionEnd + 1][0])
    nextEnd = sessionEnd + 1
    while (nextEnd + 1 < candles.length && istDay(candles[nextEnd + 1][0]) === nextDay) nextEnd++
  }

  let before: number | null = null
  for (let i = entry - 1; i >= 0; i--) if (candles[i][0] + MINUTE <= announcedAt) { before = candles[i][4]; break }

  const ret = (price: number) => (price / entryPrice - 1) * 100
  const after: Record<number, number | null> = {}, exitTimes: Record<number, number | null> = {}
  for (const h of HORIZONS) {
    let last = -1
    for (let i = entry; i <= sessionEnd && candles[i][0] < entryTime + h * MINUTE; i++) last = i
    // Only when the session really ran that long after the entry
    const full = last >= 0 && candles[sessionEnd][0] >= entryTime + (h - 1) * MINUTE
    after[h] = full ? ret(candles[last][4]) : null
    exitTimes[h] = full ? candles[last][0] : null
  }

  const target = entryPrice * (1 + targetPct / 100), stop = entryPrice * (1 - stopPct / 100)
  let targetStop = ret(candles[sessionEnd][4])
  for (let i = entry; i <= sessionEnd; i++) {
    if (candles[i][3] <= stop) { targetStop = -stopPct; break }
    if (candles[i][2] >= target) { targetStop = targetPct; break }
  }

  return {
    sameSession, entryTime, entryPrice,
    runUpPct: before && before > 0 ? (entryPrice / before - 1) * 100 : null,
    after,
    toClosePct: ret(candles[sessionEnd][4]),
    toNextClosePct: nextEnd >= 0 ? ret(candles[nextEnd][4]) : null,
    targetStopPct: targetStop,
    exits: { after: exitTimes, close: candles[sessionEnd][0], nextClose: nextEnd >= 0 ? candles[nextEnd][0] : null },
  }
}

/** Return of an index between the open of the bar at `from` and the close of the bar at `to`. Null when either bar is missing. */
export function windowReturn(candles: Candle[], from: number, to: number | null): number | null {
  if (to == null) return null
  const a = candles.find(c => c[0] >= from), b = [...candles].reverse().find(c => c[0] <= to)
  return a && b && b[0] >= a[0] && a[1] > 0 ? (b[4] / a[1] - 1) * 100 : null
}
