/**
 * The split run-up signal: when NSE first lists the ex-date of a share split,
 * buy near the next session's close and sell near the close of the last
 * session before the ex-date. Pure functions.
 *
 * Tested in research/results/splits.json. Only real splits count (face value
 * goes down). NSE also shortens "special dividend" to SPL; those are not splits.
 */
import { parseCorporateAction } from '@/lib/market-data/corporate-actions'

export const SPLIT_SIGNAL = 'split-run-up'
/** The rule runs on the 750 most traded stocks, as tested. */
export const SPLIT_UNIVERSE = 750
/** Weekdays needed between the listing and the ex-date, so there is a day to buy and a later day to sell. */
export const MIN_DAYS_BEFORE_EX = 3

export interface SplitListing { symbol: string; exDate: string; purpose: string; from: number; to: number }

/** The real splits in a day's corporate-action rows, one per company and ex-date. */
export function splitListings(rows: ReadonlyArray<{ symbol: string; exDate: string; purpose: string }>): SplitListing[] {
  const out = new Map<string, SplitListing>()
  for (const r of rows) {
    const split = parseCorporateAction(r.purpose).split
    if (!split || !(split.to < split.from)) continue
    const key = `${r.symbol}|${r.exDate}`
    if (!out.has(key)) out.set(key, { symbol: r.symbol, exDate: r.exDate, purpose: r.purpose, from: split.from, to: split.to })
  }
  return [...out.values()]
}

const step = (iso: string, days: number) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d }
const isWeekday = (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6

/** The next weekday after a date. Holidays are not known in advance, so they count as weekdays. */
export function nextWeekday(iso: string): string {
  let d = step(iso, 1)
  while (!isWeekday(d)) d = step(d.toISOString().slice(0, 10), 1)
  return d.toISOString().slice(0, 10)
}

/** The last weekday before a date: the day to sell, unless it turns out to be a holiday. */
export function weekdayBefore(iso: string): string {
  let d = step(iso, -1)
  while (!isWeekday(d)) d = step(d.toISOString().slice(0, 10), -1)
  return d.toISOString().slice(0, 10)
}

/** Weekdays strictly between two dates. */
export function weekdaysBetween(after: string, before: string): number {
  let n = 0
  for (let d = nextWeekday(after); d < before; d = nextWeekday(d)) n++
  return n
}

/** Whether a split listed at the close of `listedOn` leaves enough days to trade. */
export const enoughTime = (listedOn: string, exDate: string): boolean => weekdaysBetween(listedOn, exDate) >= MIN_DAYS_BEFORE_EX

/** Whether `asOf` is the last session before the ex-date, as far as weekdays tell. */
export const isSellDay = (asOf: string, exDate: string): boolean => asOf < exDate && nextWeekday(asOf) >= exDate

/** "1 share becomes 5" from the face values. */
export function splitText(from: number, to: number): string {
  const ratio = from / to
  return `1 share becomes ${Number.isInteger(ratio) ? ratio : ratio.toFixed(2)}`
}
