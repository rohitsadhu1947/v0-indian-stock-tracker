/**
 * The caution after a share split or bonus: in testing a stock lagged the
 * average stock by about 5% over the 20 sessions from the ex-date
 * (research/results/splits.json, "afterExDate"). Pure functions.
 *
 * It is a flag for the reader. It changes no ranking and no order.
 */
import { parseCorporateAction } from '@/lib/market-data/corporate-actions'
import { roughDateAfter } from './core'

/** Sessions after the ex-date the caution lasts. */
export const CAUTION_SESSIONS = 20
/** How far ahead an upcoming split or bonus is flagged, in days. */
export const CAUTION_DAYS_AHEAD = 30

export interface Caution {
  kind: 'split' | 'bonus'
  exDate: string
  /** before: the ex-date is still ahead. after: inside the 20 sessions from it. */
  phase: 'before' | 'after'
  /** About when the 20 sessions end. */
  until: string
}

/** Whether NSE's description of a corporate action is a real split or a bonus. Splits win when it is both. */
export function cautionKind(purposes: readonly string[]): Caution['kind'] | null {
  const parsed = purposes.map(parseCorporateAction)
  if (parsed.some(p => p.split && p.split.to < p.split.from)) return 'split'
  return parsed.some(p => p.bonus) ? 'bonus' : null
}

/** The caution for one corporate action on a day, or null when the day is outside its window. */
export function cautionFor(purposes: readonly string[], exDate: string, today: string): Caution | null {
  const kind = cautionKind(purposes)
  if (!kind) return null
  const until = roughDateAfter(exDate, CAUTION_SESSIONS)
  if (today >= until) return null
  if (exDate > today) {
    const daysAhead = (Date.parse(exDate) - Date.parse(today)) / 86400000
    return daysAhead <= CAUTION_DAYS_AHEAD ? { kind, exDate, phase: 'before', until } : null
  }
  return { kind, exDate, phase: 'after', until }
}

const shortDate = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** One line for the page. */
export function cautionText(c: Caution): string {
  const what = c.kind === 'split' ? 'Share split' : 'Bonus issue'
  return c.phase === 'before'
    ? `${what} on ${shortDate(c.exDate)}. In testing, stocks lagged the average stock by about 5% in the 20 sessions after one.`
    : `${what} on ${shortDate(c.exDate)}. In testing, stocks lagged the average stock by about 5% in the 20 sessions after one. That window ends about ${shortDate(c.until)}.`
}
