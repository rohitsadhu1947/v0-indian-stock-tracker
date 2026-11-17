/**
 * Live track record of the Monthly Plan's picks. Pure: data in, record out.
 *
 * The picks are replayed through the same simulator the backtests use
 * (lib/research/simulate.ts), so the live record and the backtest are
 * measured the same way: next-session fills, charges, slippage and tax.
 * The difference is that the picks come from frozen monthly_signals rows,
 * not from a ranking recomputed on today's data.
 */
import { PORTFOLIO_RULES } from './config'
import { lastAtOrBefore } from '@/lib/research/dates'
import type { IndexSeries, Market, StockSeries } from '@/lib/research/market'
import { simulate, type SimOptions, type Strategy } from '@/lib/research/simulate'

export interface FrozenSignal {
  signalDate: number          // YYYYMMDD, a month-end session
  picks: string[]             // best first
  trendInvested: boolean
}

/** Replays recorded picks. A month with no record keeps the book as it is. */
export function frozenStrategy(signals: FrozenSignal[], trendFilter: boolean): Strategy {
  const byDate = new Map(signals.map(s => [s.signalDate, s]))
  return {
    name: `Recorded picks${trendFilter ? ' + trend filter' : ''}`,
    targets(ctx) {
      const signal = byDate.get(ctx.date)
      if (!signal) return Object.fromEntries(ctx.holdings)
      if (trendFilter && !signal.trendInvested) return {}
      return Object.fromEntries(signal.picks.map(symbol => [symbol, 1 / PORTFOLIO_RULES.topN]))
    },
  }
}

export interface BarRow {
  symbol: string
  date: number
  low: number
  high: number
  close: number
  volume: number
  turnover: number | null
}

/** A research Market from daily_bars rows (stocks) and index closes. */
export function marketFromBars(stockRows: BarRow[], indexRows: Array<{ symbol: string; date: number; close: number }>, sessionIndex: string): Market {
  const group = <T extends { symbol: string }>(rows: T[]) => {
    const out = new Map<string, T[]>()
    for (const r of rows) out.set(r.symbol, [...(out.get(r.symbol) ?? []), r])
    return out
  }
  const stocks = new Map<string, StockSeries>()
  for (const [symbol, rows] of group(stockRows)) {
    rows.sort((a, b) => a.date - b.date)
    stocks.set(symbol, {
      symbol,
      dates: Int32Array.from(rows.map(r => r.date)),
      close: Float64Array.from(rows.map(r => r.close)),
      // The stored bars have closes only; the monthly replay never looks inside a session
      open: Float64Array.from(rows.map(r => r.close)),
      high: Float64Array.from(rows.map(r => r.close)),
      low: Float64Array.from(rows.map(r => r.close)),
      // The day's average price (rupees traded / shares traded), kept inside its range
      fill: Float64Array.from(rows.map(r => {
        const vwap = r.turnover && r.volume > 0 ? r.turnover / r.volume : r.close
        return Math.min(r.high, Math.max(r.low, vwap))
      })),
      turnover: Float64Array.from(rows.map(r => r.turnover ?? r.close * r.volume)),
      // daily_bars carries no ordinary-dividend series: returns here are price returns
      dividendFactor: Float64Array.from(rows.map(() => 1)),
      deliveryShare: Float64Array.from(rows.map(() => NaN)),
      resultsDates: new Int32Array(),
    })
  }
  const indices = new Map<string, IndexSeries>()
  for (const [symbol, rows] of group(indexRows)) {
    rows.sort((a, b) => a.date - b.date)
    indices.set(symbol, { dates: Int32Array.from(rows.map(r => r.date)), close: Float64Array.from(rows.map(r => r.close)) })
  }
  return {
    sessions: indices.get(sessionIndex)?.dates ?? new Int32Array(),
    stocks, indices, universe: new Map(), universeDates: new Int32Array(),
  }
}

export interface PickOutcome {
  symbol: string
  signalDate: number
  rank: number
  entryDate: number
  entryPrice: number
  /** Null while the pick is still held. */
  exitDate: number | null
  lastPrice: number
  returnPct: number
  /** The benchmark index over the same days. */
  benchmarkPct: number | null
}

/**
 * What happened to each pick from when it entered the book: bought the
 * session after its signal date, held until the session after the first
 * later signal that drops it (or still held). Before costs and tax.
 */
export function pickOutcomes(market: Market, signals: FrozenSignal[], benchmark: IndexSeries | undefined): PickOutcome[] {
  const ordered = [...signals].sort((a, b) => a.signalDate - b.signalDate)
  const sessions = market.sessions
  const sessionAfter = (date: number): number | null => {
    const i = lastAtOrBefore(sessions, date) + 1
    return i < sessions.length ? sessions[i] : null
  }
  const indexClose = (date: number): number | null => {
    if (!benchmark) return null
    const i = lastAtOrBefore(benchmark.dates, date)
    return i < 0 ? null : benchmark.close[i]
  }

  const out: PickOutcome[] = []
  for (let k = 0; k < ordered.length; k++) {
    const signal = ordered[k]
    const previous = k > 0 ? new Set(ordered[k - 1].picks) : new Set<string>()
    signal.picks.forEach((symbol, position) => {
      if (previous.has(symbol)) return // entered on an earlier signal
      const series = market.stocks.get(symbol)
      const entrySession = sessionAfter(signal.signalDate)
      if (!series || entrySession == null) return
      const entryIndex = lastAtOrBefore(series.dates, entrySession - 1) + 1
      if (entryIndex >= series.dates.length) return // not traded since

      const dropped = ordered.slice(k + 1).find(s => !s.picks.includes(symbol))
      const exitSession = dropped ? sessionAfter(dropped.signalDate) : null
      const exitIndex = exitSession != null ? lastAtOrBefore(series.dates, exitSession - 1) + 1 : -1
      const exited = exitIndex >= 0 && exitIndex < series.dates.length
      const lastIndex = exited ? exitIndex : series.dates.length - 1
      const lastPrice = exited ? series.fill[exitIndex] : series.close[lastIndex]

      const entryPrice = series.fill[entryIndex]
      const start = indexClose(series.dates[entryIndex]), end = indexClose(series.dates[lastIndex])
      out.push({
        symbol, signalDate: signal.signalDate, rank: position + 1,
        entryDate: series.dates[entryIndex], entryPrice,
        exitDate: exited ? series.dates[exitIndex] : null, lastPrice,
        returnPct: (lastPrice / entryPrice - 1) * 100,
        benchmarkPct: start && end ? (end / start - 1) * 100 : null,
      })
    })
  }
  return out
}

export interface BookRecord {
  returnPct: number
  maxDrawdownPct: number
}

export interface ModeRecord {
  started: number          // first signal date
  asOf: number             // latest session measured
  signals: number          // months recorded
  afterTax: BookRecord
  beforeTax: BookRecord
  withTrendFilterAfterTax: BookRecord
  /** Index price change over the same days, by daily_bars symbol. */
  benchmarks: Record<string, number | null>
  picks: PickOutcome[]
}

function bookRecord(equity: number[]): BookRecord {
  let peak = equity[0], worst = 0
  for (const v of equity) {
    peak = Math.max(peak, v)
    worst = Math.min(worst, v / peak - 1)
  }
  return { returnPct: (equity[equity.length - 1] / equity[0] - 1) * 100, maxDrawdownPct: worst * 100 }
}

/** The live record of one mode from its frozen signals. Null until a session after the first signal exists. */
export function modeRecord(
  market: Market, signals: FrozenSignal[], benchmarkSymbols: string[], options: Partial<SimOptions> = {}
): ModeRecord | null {
  if (!signals.length) return null
  const started = Math.min(...signals.map(s => s.signalDate))
  const sessions = market.sessions
  const end = sessions[sessions.length - 1]
  if (lastAtOrBefore(sessions, started) < 0 || !(end > started)) return null

  const run = (trendFilter: boolean, extra: Partial<SimOptions> = {}) =>
    simulate(market, frozenStrategy(signals, trendFilter), { ...options, ...extra, start: started, end })
  const afterTax = run(false)

  const change = (symbol: string): number | null => {
    const s = market.indices.get(symbol)
    if (!s) return null
    const a = lastAtOrBefore(s.dates, started), b = lastAtOrBefore(s.dates, end)
    return a < 0 || b < 0 ? null : (s.close[b] / s.close[a] - 1) * 100
  }
  return {
    started, asOf: end, signals: signals.length,
    afterTax: bookRecord(afterTax.equity),
    beforeTax: bookRecord(run(false, { tax: null }).equity),
    withTrendFilterAfterTax: bookRecord(run(true).equity),
    benchmarks: Object.fromEntries(benchmarkSymbols.map(s => [s, change(s)])),
    picks: pickOutcomes(market, signals, market.indices.get(benchmarkSymbols[0])),
  }
}
