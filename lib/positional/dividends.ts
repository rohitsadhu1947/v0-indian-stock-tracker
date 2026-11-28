/**
 * The big dividend signal: when NSE first lists the ex-date of a dividend
 * worth 2% or more of the share price, buy near the next session's close and
 * sell near the close of the last session before the ex-date. Pure functions.
 *
 * Tested in research/results/dividend-and-dip.json. Holding past the ex-date
 * to collect the dividend lost money after tax, so the rule sells before it.
 * The gain depends on the notice NSE gives: about 1% with 3 to 5 sessions,
 * 2% to 3% with more, nothing with fewer than 3.
 */
import { parseCorporateAction } from '@/lib/market-data/corporate-actions'

export const DIVIDEND_SIGNAL = 'dividend-run-up'
/** The rule runs on the 750 most traded stocks, as tested. */
export const DIVIDEND_UNIVERSE = 750
/** The dividend must be at least this share of the price on the day it is listed. */
export const MIN_DIVIDEND_YIELD = 0.02
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
