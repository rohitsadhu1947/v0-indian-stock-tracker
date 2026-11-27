/**
 * The positional signal: buy a stock that jumps on its quarterly results and
 * hold it for 60 sessions. Pure functions.
 *
 * The rule and its settings are the ones tested in
 * research/results/positional.json (the "big jump on results" rule).
 */

export const SIGNAL = 'results-jump'
/** Rise over the two sessions around results, as a fraction. */
export const MIN_JUMP = 0.08
/** Rupees traded on the signal day against the average of the 20 sessions before. */
export const MIN_TURNOVER_RATIO = 3
/** Sessions held, counting the entry session as 1. */
export const HOLD_SESSIONS = 60
/** Delivery charges and slippage for buying and selling, as a fraction. */
export const ROUND_TRIP_COST = 0.0045

/**
 * A results jump on a stock in the bottom fifth of the 500 on 12-month
 * strength earned nothing in testing, so it is skipped
 * (research/results/combine.json).
 */
export const WEAK_BELOW = 0.2

/** A stock's return from 12 months ago to one month ago, as a fraction. Null without both prices. */
export function yearReturn(closeYearAgo: number | null | undefined, closeMonthAgo: number | null | undefined): number | null {
  return closeYearAgo && closeMonthAgo && closeYearAgo > 0 && closeMonthAgo > 0 ? closeMonthAgo / closeYearAgo - 1 : null
}

/** Where a return stands among all of them: 0 is the weakest, 1 the strongest. */
export function strengthRank(own: number, all: readonly number[]): number {
  if (all.length < 2) return 1
  return Math.min(1, all.filter(x => x < own).length / (all.length - 1))
}

export const isWeak = (rank: number | null | undefined): boolean => rank != null && rank < WEAK_BELOW

/** The rank in words, for the page and the Telegram message. */
export function strengthLabel(rank: number | null | undefined): string {
  if (rank == null) return 'not known'
  return rank >= 0.8 ? 'top fifth' : rank >= 0.6 ? 'second fifth' : rank >= 0.4 ? 'middle fifth' : rank >= 0.2 ? 'fourth fifth' : 'bottom fifth'
}

export interface Bar { date: string; close: number; turnover: number | null }

export interface JumpSignal {
  /** Rise over the two sessions, in percent. */
  jumpPct: number
  /** Rupees traded today against the 20-session average. */
  turnoverRatio: number
  resultsDate: string
}

/**
 * Whether the last bar is a signal. `bars` are the stock's sessions, oldest
 * first; `resultsDates` are the days its board met to approve results.
 * Results count when they fall on the last session or the one before.
 */
export function resultsJump(bars: Bar[], resultsDates: readonly string[]): JumpSignal | null {
  const i = bars.length - 1
  if (i < 22) return null
  const today = bars[i], before = bars[i - 1].date
  const resultsDate = resultsDates.find(d => d >= before && d <= today.date)
  if (!resultsDate) return null
  const jump = today.close / bars[i - 2].close - 1
  if (!(jump >= MIN_JUMP)) return null
  let sum = 0, count = 0
  for (let j = i - 20; j < i; j++) if (bars[j].turnover != null) { sum += bars[j].turnover!; count++ }
  if (count < 10 || today.turnover == null) return null
  const ratio = today.turnover / (sum / count)
  if (!(ratio >= MIN_TURNOVER_RATIO)) return null
  return { jumpPct: Math.round(jump * 1000) / 10, turnoverRatio: Math.round(ratio * 10) / 10, resultsDate }
}

/** The price a buy through the day is taken to get: the day's average traded price, kept inside its range. */
export function averagePrice(bar: { high: number; low: number; close: number; volume: number; turnover: number | null }): number {
  const vwap = bar.turnover && bar.volume > 0 ? bar.turnover / bar.volume : NaN
  return vwap >= bar.low && vwap <= bar.high ? vwap : (bar.high + bar.low + bar.close) / 3
}

/** Sessions held so far, counting the entry session as 1. `sessions` are the market's sessions, oldest first. */
export function sessionsHeld(sessions: readonly string[], entryDate: string, asOf: string): number {
  return sessions.filter(d => d >= entryDate && d <= asOf).length
}

/** Profit on a closed trade after costs, in percent. */
export function netPct(entryPrice: number, exitPrice: number): number {
  return (exitPrice / entryPrice - 1 - ROUND_TRIP_COST) * 100
}

/** The calendar date about `sessions` trading sessions after `from`: five sessions a week, ignoring holidays. */
export function roughDateAfter(from: string, sessions: number): string {
  const d = new Date(from + 'T00:00:00Z')
  let left = sessions
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1)
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) left--
  }
  return d.toISOString().slice(0, 10)
}
