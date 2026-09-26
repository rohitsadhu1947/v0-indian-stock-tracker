/**
 * Sleeve allocation for a risk mode and market regime, and the monthly
 * rebalance calendar.
 */

import { MODES, SLEEVE_FUNDS, type RiskMode } from './config'
import type { TrendRegime } from './regime'

export interface SleeveAllocation {
  momentum: number
  lowvol: number
  cash: number
  reason: string
}

export function allocateSleeves(mode: RiskMode, regime: TrendRegime | null): SleeveAllocation {
  const def = MODES[mode]

  if (def.trendFilter) {
    if (!regime) {
      return { momentum: 0, lowvol: 0, cash: 1, reason: 'Trend data unavailable: staying in cash until it is.' }
    }
    if (!regime.invested) {
      return {
        momentum: 0, lowvol: 0, cash: 1,
        reason: `NIFTY 200 is ${Math.abs(regime.distancePct).toFixed(1)}% below its 200-day average: defensive mode holds cash.`,
      }
    }
  }

  return {
    momentum: def.sleeves.momentum,
    lowvol: def.sleeves.lowvol,
    cash: 0,
    reason: def.trendFilter
      ? `NIFTY 200 is ${regime!.distancePct.toFixed(1)}% above its 200-day average: fully invested.`
      : `${def.label} mode is always invested.`,
  }
}

/** Sleeve weights mapped onto fund symbols. Unverified funds are left out. */
export function coreTargets(alloc: SleeveAllocation): {
  targets: Record<string, number>
  unfunded: Array<'momentum' | 'lowvol' | 'cash'>
} {
  const targets: Record<string, number> = {}
  const unfunded: Array<'momentum' | 'lowvol' | 'cash'> = []
  for (const sleeve of ['momentum', 'lowvol', 'cash'] as const) {
    const w = alloc[sleeve]
    if (w <= 0) continue
    const fund = SLEEVE_FUNDS[sleeve]
    if (fund) targets[fund] = (targets[fund] ?? 0) + w
    else if (sleeve !== 'cash') unfunded.push(sleeve) // cash without a fund just stays as cash
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
