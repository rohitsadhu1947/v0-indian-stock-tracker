/**
 * Sleeve allocation for a risk mode and market regime, and the monthly
 * rebalance calendar.
 */

import { MODES, SLEEVE_FUNDS, type RiskMode, type Sleeve } from './config'
import type { TrendRegime } from './regime'

export interface SleeveAllocation {
  momentum: number
  lowvol: number
  value: number
  cash: number
  reason: string
}

const SLEEVES: Sleeve[] = ['momentum', 'lowvol', 'value']

/**
 * Sleeve weights for a mode. With the trend filter on, the whole book moves to
 * cash while NIFTY 200 is below its 200-day average (or when that cannot be
 * determined).
 */
export function allocateSleeves(mode: RiskMode, regime: TrendRegime | null, trendFilter: boolean): SleeveAllocation {
  const def = MODES[mode]
  const cash = (reason: string): SleeveAllocation => ({ momentum: 0, lowvol: 0, value: 0, cash: 1, reason })

  if (trendFilter) {
    if (!regime) return cash('Trend data unavailable: the trend filter holds cash until it is.')
    if (!regime.invested) {
      return cash(`NIFTY 200 is ${Math.abs(regime.distancePct).toFixed(1)}% below its 200-day average: the trend filter holds cash.`)
    }
  }

  return {
    ...def.sleeves,
    cash: 0,
    reason: trendFilter
      ? `NIFTY 200 is ${regime!.distancePct.toFixed(1)}% above its 200-day average: fully invested.`
      : 'Trend filter off: always invested.',
  }
}

/** Sleeve weights mapped onto fund symbols. Unverified funds are left out. */
export function coreTargets(alloc: SleeveAllocation): {
  targets: Record<string, number>
  unfunded: Sleeve[]
} {
  const targets: Record<string, number> = {}
  const unfunded: Sleeve[] = []
  for (const sleeve of SLEEVES) {
    const w = alloc[sleeve]
    if (w <= 0) continue
    const fund = SLEEVE_FUNDS[sleeve]
    if (fund) targets[fund] = (targets[fund] ?? 0) + w
    else unfunded.push(sleeve)
  }
  // Cash goes into a liquid fund when one is configured, else stays as cash
  if (alloc.cash > 0 && SLEEVE_FUNDS.cash) {
    targets[SLEEVE_FUNDS.cash] = (targets[SLEEVE_FUNDS.cash] ?? 0) + alloc.cash
  }
  return { targets, unfunded }
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
