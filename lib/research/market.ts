/**
 * Market history as the research harness sees it. Pure data and accessors
 * (no database), so strategies and the simulator can be tested on synthetic
 * markets.
 */
import type { DailyBar } from '@/lib/portfolio/momentum'
import { isoDate, lastAtOrBefore } from './dates'

export interface StockSeries {
  symbol: string
  dates: Int32Array            // sessions the stock traded, ascending
  /** Adjusted for splits, bonuses, demergers and extraordinary dividends: what the app stores. */
  close: Float64Array
  /**
   * The price an order placed during the session is assumed to get: the
   * day's volume-weighted average. The official open is not used because it
   * is sometimes a freak print nobody could trade at in size (Titan opened
   * 19% below its previous close on 14 Mar 2011 and closed unchanged).
   */
  fill: Float64Array
  /** The session's adjusted open, high and low. Used by the swing tests, where targets and stops are hit inside the day. */
  open: Float64Array
  high: Float64Array
  low: Float64Array
  turnover: Float64Array       // rupees traded
  /** Share of the day's volume taken into delivery, 0 to 1; NaN when NSE published none. */
  deliveryShare: Float64Array
  /** Multiply an adjusted price by this to include reinvested ordinary dividends. */
  dividendFactor: Float64Array
  /** Dates of board meetings called to approve financial results, ascending. */
  resultsDates: Int32Array
}

export interface IndexSeries {
  dates: Int32Array
  close: Float64Array
}

export interface Market {
  sessions: Int32Array                 // every trading session, ascending
  stocks: Map<string, StockSeries>
  indices: Map<string, IndexSeries>    // keyed by daily_bars symbol, e.g. "IDX:NIFTY 200"
  /** Point-in-time universe: month-end date -> symbols, most traded first. */
  universe: Map<number, string[]>
  universeDates: Int32Array
}

const isoCache = new Map<number, string>()
const iso = (d: number): string => {
  let s = isoCache.get(d)
  if (!s) isoCache.set(d, (s = isoDate(d)))
  return s
}

/** The universe as known on `date`: the latest month-end list on or before it. */
export function universeAsOf(market: Market, date: number, size: number): string[] {
  const i = lastAtOrBefore(market.universeDates, date)
  return i < 0 ? [] : market.universe.get(market.universeDates[i])!.slice(0, size)
}

/**
 * The last `count` bars on or before `date`, in the shape the app's scoring
 * code takes. Volume is turnover / close, so close x volume is rupees traded.
 */
export function barsUpTo(series: StockSeries, date: number, count: number): DailyBar[] {
  const end = lastAtOrBefore(series.dates, date)
  const start = Math.max(0, end - count + 1)
  const out: DailyBar[] = new Array(Math.max(0, end - start + 1))
  for (let i = start; i <= end; i++) {
    const volume = series.turnover[i] / series.close[i]
    const share = series.deliveryShare[i]
    out[i - start] = { date: iso(series.dates[i]), close: series.close[i], volume, deliveryQty: Number.isNaN(share) ? null : share * volume }
  }
  return out
}

export function indexBarsUpTo(series: IndexSeries, date: number, count: number): Array<{ date: string; close: number }> {
  const end = lastAtOrBefore(series.dates, date)
  const out: Array<{ date: string; close: number }> = []
  for (let i = Math.max(0, end - count + 1); i <= end; i++) out.push({ date: iso(series.dates[i]), close: series.close[i] })
  return out
}
