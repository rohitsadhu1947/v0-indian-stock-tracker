/**
 * Whether the book is invested this month, and the monthly rebalance calendar.
 */
import type { TrendRegime } from './regime'

export interface Exposure {
  invested: boolean
  reason: string
}

/**
 * With the trend filter on, the whole book moves to cash while NIFTY 200 is
 * below its 200-day average (or when that cannot be determined).
 */
export function exposure(regime: TrendRegime | null, trendFilter: boolean): Exposure {
  if (!trendFilter) return { invested: true, reason: 'Trend filter off: always invested.' }
  if (!regime) return { invested: false, reason: 'Trend data unavailable: the trend filter holds cash until it is.' }
  return regime.invested
    ? { invested: true, reason: `NIFTY 200 is ${regime.distancePct.toFixed(1)}% above its 200-day average: fully invested.` }
    : { invested: false, reason: `NIFTY 200 is ${Math.abs(regime.distancePct).toFixed(1)}% below its 200-day average: the trend filter holds cash.` }
}

/**
 * Rebalance once per calendar month, on the first trading session.
 * `lastRebalance` is the date of the most recent rebalance (YYYY-MM-DD).
 */
export function rebalanceStatus(
  lastRebalance: string | null,
  today: string
): { due: boolean; reason: string } {
  if (!lastRebalance) return { due: true, reason: 'No rebalance recorded yet.' }
  if (lastRebalance.slice(0, 7) !== today.slice(0, 7)) {
    return { due: true, reason: `Last rebalanced ${lastRebalance}; a new month has started.` }
  }
  return { due: false, reason: `Already rebalanced this month (${lastRebalance}).` }
}
