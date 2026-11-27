/**
 * Paper day trades from two F&O signals, tracked without placing orders.
 * Pure functions.
 *
 * The rules and the trade are the ones tested in
 * research/results/fo-daytrade.json: short at 09:20 the next session, buy
 * back at 15:15 or at a 3% stop.
 */
import { dayTrade, intradayCharges, minuteOf, type MinuteBar } from '@/lib/research/day-trade'

export type WatchSignal = 'ban-entry' | 'call-volume-spike'

export const SIGNAL_LABEL: Record<WatchSignal, string> = {
  'ban-entry': 'Enters the F&O ban list',
  'call-volume-spike': 'Call volume spike',
}

/** What the backtest found for each rule, 2015 to 2026, after the same costs. */
export const BACKTEST: Record<WatchSignal, { netPct: number; trades: number; note: string }> = {
  'ban-entry': { netPct: 0.30, trades: 1499, note: 'Lost money in 2025 and 2026.' },
  'call-volume-spike': { netPct: 0.16, trades: 1922, note: 'Flat since 2023.' },
}

export const STOP_PCT = 3
/** Charges plus 0.10% slippage on each side, as a fraction. */
export const COST = intradayCharges() + 0.002
const HISTORY = 20

export interface OptionVolume { calls: number; puts: number }

export interface FoundSignal {
  signal: WatchSignal
  symbol: string
  /** Figures behind the signal, for the page. */
  detail: Record<string, number>
}

/**
 * Signals at one close.
 * `history` holds each stock's option volume on earlier sessions, oldest
 * first; `sessions` is how many earlier sessions are on record. A stock
 * needs figures on all of the last 20.
 */
export function findSignals(input: {
  banToday: ReadonlySet<string> | null
  banNext: ReadonlySet<string> | null
  today: ReadonlyMap<string, OptionVolume>
  history: ReadonlyMap<string, OptionVolume[]>
  sessions: number
}): FoundSignal[] {
  const out: FoundSignal[] = []
  if (input.banToday && input.banNext) {
    for (const symbol of input.banNext) if (!input.banToday.has(symbol)) out.push({ signal: 'ban-entry', symbol, detail: {} })
  }
  if (input.sessions >= HISTORY) {
    for (const [symbol, now] of input.today) {
      const past = input.history.get(symbol) ?? []
      if (past.length < HISTORY) continue
      const recent = past.slice(-HISTORY)
      const usualCalls = recent.reduce((a, v) => a + v.calls, 0) / HISTORY, usualPuts = recent.reduce((a, v) => a + v.puts, 0) / HISTORY
      if (!(usualCalls > 0) || !(usualPuts > 0)) continue
      const callRatio = now.calls / usualCalls, putRatio = now.puts / usualPuts
      if (callRatio >= 5 && callRatio >= 2 * putRatio) {
        out.push({ signal: 'call-volume-spike', symbol, detail: { callRatio: Math.round(callRatio * 10) / 10, putRatio: Math.round(putRatio * 10) / 10 } })
      }
    }
  }
  return out.sort((a, b) => a.signal.localeCompare(b.signal) || a.symbol.localeCompare(b.symbol))
}

export interface PaperOutcome {
  entryPrice: number
  exitPrice: number
  stopped: boolean
  grossPct: number
  netPct: number
  /** The same trade without the stop, for comparison. */
  noStopGrossPct: number | null
}

/** What the short made on a session's minute bars. Null when the stock had no bar near 09:20. */
export function paperOutcome(bars: MinuteBar[]): PaperOutcome | null {
  const rule = { side: 'short' as const, entry: minuteOf('09:20'), exit: minuteOf('15:15') }
  const trade = dayTrade(bars, { ...rule, stopPct: STOP_PCT })
  if (!trade) return null
  const plain = dayTrade(bars, rule)
  return {
    entryPrice: trade.entryPrice, exitPrice: trade.exitPrice, stopped: trade.stopped,
    grossPct: trade.ret * 100, netPct: (trade.ret - COST) * 100, noStopGrossPct: plain ? plain.ret * 100 : null,
  }
}

export interface SignalTally { trades: number; wins: number; avgNetPct: number; totalNetPct: number }

/** Running totals of finished trades for one signal. */
export function tally(netPcts: number[]): SignalTally {
  const total = netPcts.reduce((a, b) => a + b, 0)
  return { trades: netPcts.length, wins: netPcts.filter(x => x > 0).length, avgNetPct: netPcts.length ? total / netPcts.length : 0, totalNetPct: total }
}

/** The trade date printed in NSE's ban list file, as YYYY-MM-DD. */
export function banListDate(csv: string): string | null {
  const m = /Trade Date\s+(\d{1,2})-([A-Za-z]{3})-(\d{4})/.exec(csv)
  const month = m && ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].indexOf(m[2].toUpperCase()) + 1
  return m && month ? `${m[3]}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}` : null
}

/** The 09:20 message for one short. `entryPrice` is the 09:20 price; `lastPrice` is the latest, when it differs. */
export function entryMessage(input: { symbol: string; signal: WatchSignal; entryPrice: number | null; lastPrice: number | null; exampleAmount: number }): string {
  const rupees = (n: number) => `Rs ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const name = input.symbol.replace(/[<>&]/g, ' ')
  const lines = [`<b>SELL SHORT ${name} now</b> (${SIGNAL_LABEL[input.signal].toLowerCase()})`]
  if (input.entryPrice) {
    const stop = Math.round(input.entryPrice * (1 + STOP_PCT / 100) * 100) / 100
    const moved = input.lastPrice && Math.abs(input.lastPrice / input.entryPrice - 1) >= 0.001 ? ` Now ${rupees(input.lastPrice)}.` : ''
    lines.push(
      `Entry: the 09:20 price was ${rupees(input.entryPrice)}.${moved}`,
      `Stop: place a stop-loss buy order at ${rupees(stop)} (${STOP_PCT}% above the 09:20 price).`,
      'Exit: buy back at 15:15 if the stop has not been hit.',
      `Shares: ${Math.floor(input.exampleAmount / input.entryPrice)} for Rs ${input.exampleAmount.toLocaleString('en-IN')}.`)
  } else {
    lines.push(
      'Entry: at the market price. Zerodha is not connected, so the app cannot read the price.',
      `Stop: place a stop-loss buy order ${STOP_PCT}% above your sell price.`,
      'Exit: buy back at 15:15 if the stop has not been hit.')
  }
  return lines.join('\n')
}
