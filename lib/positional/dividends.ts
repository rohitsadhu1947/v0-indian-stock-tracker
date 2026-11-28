/**
 * The big dividend signal: when NSE first lists the ex-date of a dividend
 * worth 2% or more of the share price, buy near the next session's close,
 * hold through the ex-date to collect the dividend, and sell near the close
 * five sessions after it. Pure functions.
 *
 * Tested in research/results/dividend-and-dip.json.
 */
import { parseCorporateAction } from '@/lib/market-data/corporate-actions'
import { ROUND_TRIP_COST } from './core'
import { weekdaysBetween } from './splits'

export const DIVIDEND_SIGNAL = 'dividend-run-up'
/** The rule runs on the 750 most traded stocks, as tested. */
export const DIVIDEND_UNIVERSE = 750
/** The dividend must be at least this share of the price on the day it is listed. */
export const MIN_DIVIDEND_YIELD = 0.02
/** Sold at the close of this session, counting the ex-date as session 1. */
export const SESSIONS_FROM_EX = 6
/**
 * Weekdays needed between the listing and the ex-date. NSE now lists most
 * dividends only about three sessions ahead. With two sessions of notice the
 * rule still beat the average stock by 2.4% in testing; with one, by 1.7%
 * and little since 2023, so one is not enough.
 */
export const MIN_NOTICE_DAYS = 2
export const enoughNotice = (listedOn: string, exDate: string): boolean => weekdaysBetween(listedOn, exDate) >= MIN_NOTICE_DAYS

/** Tax taken off the dividend in the paper book: the 30% slab with cess, as in the test. */
export const DIVIDEND_TAX = 0.312

export interface DividendListing { symbol: string; exDate: string; purposes: string[]; amount: number }

/**
 * The cash dividends in a day's corporate-action rows, one per company and
 * ex-date with the rupees a share added up. Rows that also carry a split,
 * bonus, rights issue or restructuring are left out, as they were in the test.
 */
export function dividendListings(rows: ReadonlyArray<{ symbol: string; exDate: string; purpose: string }>): DividendListing[] {
  const out = new Map<string, DividendListing>()
  for (const r of rows) {
    const parsed = parseCorporateAction(r.purpose)
    if (!parsed.dividend?.amount || parsed.split || parsed.bonus || parsed.rights || parsed.restructure) continue
    const key = `${r.symbol}|${r.exDate}`
    const item = out.get(key) ?? { symbol: r.symbol, exDate: r.exDate, purposes: [], amount: 0 }
    if (item.purposes.includes(r.purpose)) continue
    item.purposes.push(r.purpose)
    item.amount += parsed.dividend.amount
    out.set(key, item)
  }
  return [...out.values()]
}

/** The dividend as a fraction of the price. Null without a price. */
export const dividendYield = (amount: number, close: number | null | undefined): number | null => (close && close > 0 ? amount / close : null)

export const isBigDividend = (yieldFraction: number | null): boolean => yieldFraction != null && yieldFraction >= MIN_DIVIDEND_YIELD

/** The session to sell on: the sixth from the ex-date, counting it. Null until that session has happened. `sessions` are oldest first. */
export function dividendExitDate(sessions: readonly string[], exDate: string): string | null {
  return sessions.filter(d => d >= exDate)[SESSIONS_FROM_EX - 1] ?? null
}

/** Sessions from the ex-date so far, counting it as 1. Zero before it. */
export const sessionsFromEx = (sessions: readonly string[], exDate: string, asOf: string): number => sessions.filter(d => d >= exDate && d <= asOf).length

/** Profit on a closed trade in percent: the price change, plus the dividend after tax, less costs. */
export function dividendNetPct(entryPrice: number, exitPrice: number, amount: number): number {
  return (exitPrice / entryPrice - 1 - ROUND_TRIP_COST + (amount * (1 - DIVIDEND_TAX)) / entryPrice) * 100
}
