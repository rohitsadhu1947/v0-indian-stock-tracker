/**
 * Point-in-time investable universe.
 *
 * NSE does not publish past index constituents as data, and testing a
 * strategy on today's NIFTY 500 only includes companies that survived and
 * grew (survivorship bias). Instead, at each month-end the universe is the
 * most actively traded stocks using only data available on that day, so it
 * contains the companies that later collapsed or were delisted.
 */

export interface LiquidityInput {
  symbol: string
  /** Bar dates (YYYYMMDD) and rupee turnover, oldest first. */
  dates: number[]
  turnover: number[]
}

export interface UniverseMember {
  symbol: string
  rank: number              // 1 = most traded
  medianTurnover: number    // rupees per day over the window
}

export interface UniverseOptions {
  windowSessions: number    // look-back in trading sessions
  minBars: number           // bars required inside the window
  size: number
}

export const DEFAULT_UNIVERSE: UniverseOptions = { windowSessions: 126, minBars: 100, size: 1000 }

/** Index of the last element <= target in an ascending array, or -1. */
export function lastAtOrBefore(sorted: number[], target: number): number {
  let lo = 0, hi = sorted.length - 1, ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid] <= target) { ans = mid; lo = mid + 1 } else hi = mid - 1
  }
  return ans
}

const median = (xs: number[]): number => {
  const s = xs.slice().sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * Members as of `asOf`, ranked by median daily turnover over the window.
 * `calendar` is every trading date, ascending. A stock must have traded on
 * the as-of date's last few sessions (not suspended or delisted) and on most
 * sessions in the window (not a new listing with no history).
 */
export function universeAsOf(
  stocks: LiquidityInput[], calendar: number[], asOf: number, opts: UniverseOptions = DEFAULT_UNIVERSE
): UniverseMember[] {
  const end = lastAtOrBefore(calendar, asOf)
  if (end < 0) return []
  const windowStart = calendar[Math.max(0, end - opts.windowSessions + 1)]
  const stillTrading = calendar[Math.max(0, end - 4)]

  const ranked: Array<Omit<UniverseMember, 'rank'>> = []
  for (const s of stocks) {
    const last = lastAtOrBefore(s.dates, asOf)
    if (last < 0 || s.dates[last] < stillTrading) continue
    const first = lastAtOrBefore(s.dates, windowStart - 1) + 1
    if (last - first + 1 < opts.minBars) continue
    ranked.push({ symbol: s.symbol, medianTurnover: median(s.turnover.slice(first, last + 1)) })
  }
  ranked.sort((a, b) => b.medianTurnover - a.medianTurnover || a.symbol.localeCompare(b.symbol))
  return ranked.slice(0, opts.size).map((m, i) => ({ ...m, rank: i + 1 }))
}

/** The last trading date of each calendar month. */
export function monthEnds(calendar: number[]): number[] {
  const out: number[] = []
  for (let i = 0; i < calendar.length; i++) {
    const month = Math.floor(calendar[i] / 100)
    if (i === calendar.length - 1 || Math.floor(calendar[i + 1] / 100) !== month) out.push(calendar[i])
  }
  return out
}
