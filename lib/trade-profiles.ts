/**
 * Trade profiles — how a signal becomes entry/stop/target/hold-time.
 *
 * One definition used by the live scanner AND the backtester, so what is
 * tested is what is traded.
 *
 * The original profile ("intraday") risks 2.5-3% to make 1.5%, i.e. it needs
 * a ~2:1 win rate just to break even. The swing profile aims for the 10-15%
 * per trade target with a stop sized from volatility (ATR), so reward/risk is
 * roughly 2:1 in the other direction.
 */

export type TradeProfileId = 'intraday' | 'swing'

export interface TradeProfile {
  id: TradeProfileId
  label: string
  description: string

  /** Target 1 / target 2 as a fraction of entry (0.10 = +10%). */
  target1Pct: number
  target2Pct: number

  /** Stop distance in ATRs, capped by maxStopPct so a volatile name cannot risk everything. */
  stopAtrMultiple: number
  maxStopPct: number
  /** Floor: a stop tighter than this gets shaken out by ordinary noise. */
  minStopPct: number

  /** Close the position after this many calendar days even without a hit. */
  maxHoldDays: number

  /** Risk per trade as a % of capital, and cap on capital in one position. */
  riskPercent: number
  maxCapitalPerTradePct: number
  maxPositions: number
}

export const TRADE_PROFILES: Record<TradeProfileId, TradeProfile> = {
  intraday: {
    id: 'intraday',
    label: 'Intraday / quick momentum',
    description: 'Original profile: +1.5% / +2.5% targets, 1.5 ATR stop, 1-7 day holds. Reward is smaller than risk.',
    target1Pct: 0.015,
    target2Pct: 0.025,
    stopAtrMultiple: 1.5,
    maxStopPct: 0.03,
    minStopPct: 0.01,
    maxHoldDays: 7,
    riskPercent: 1.5,
    maxCapitalPerTradePct: 0.33,
    maxPositions: 5,
  },

  swing: {
    id: 'swing',
    label: 'Swing (10-15% per trade)',
    description: 'Targets +10% / +15% with a 2.5 ATR stop capped at 6%, held up to 45 days. Aims for ~2:1 reward/risk.',
    target1Pct: 0.10,
    target2Pct: 0.15,
    stopAtrMultiple: 2.5,
    maxStopPct: 0.06,
    minStopPct: 0.03,
    maxHoldDays: 45,
    riskPercent: 1.5,
    maxCapitalPerTradePct: 0.25,
    maxPositions: 8,
  },
}

export const DEFAULT_PROFILE: TradeProfileId = 'swing'

export function getProfile(id: TradeProfileId | string | undefined): TradeProfile {
  return TRADE_PROFILES[(id as TradeProfileId)] ?? TRADE_PROFILES[DEFAULT_PROFILE]
}

/**
 * Entry, stop and targets for a long signal.
 * Stop = max(ATR-based, price - maxStopPct), then floored at minStopPct.
 */
export function calculateTradeLevels(params: {
  entryPrice: number
  atr: number
  profile: TradeProfile
}): { entryPrice: number; stopLoss: number; target1: number; target2: number; riskPercent: number; rewardRisk: number } {
  const { entryPrice, atr, profile } = params

  const atrStop = entryPrice - profile.stopAtrMultiple * (atr || 0)
  const widestAllowed = entryPrice * (1 - profile.maxStopPct)
  const tightestAllowed = entryPrice * (1 - profile.minStopPct)

  // Never risk more than maxStopPct, never less than minStopPct
  const stopLoss = Math.min(Math.max(atrStop, widestAllowed), tightestAllowed)

  const target1 = entryPrice * (1 + profile.target1Pct)
  const target2 = entryPrice * (1 + profile.target2Pct)

  const riskPercent = ((entryPrice - stopLoss) / entryPrice) * 100
  const rewardRisk = profile.target1Pct / ((entryPrice - stopLoss) / entryPrice)

  return { entryPrice, stopLoss, target1, target2, riskPercent, rewardRisk }
}

/**
 * Shares to buy: risk-based, capped by the per-trade capital limit.
 */
export function calculateTradeSize(params: {
  capital: number
  entryPrice: number
  stopLoss: number
  profile: TradeProfile
}): { quantity: number; capitalRequired: number; riskAmount: number } {
  const { capital, entryPrice, stopLoss, profile } = params
  const riskPerShare = entryPrice - stopLoss

  if (riskPerShare <= 0 || entryPrice <= 0 || capital <= 0) {
    return { quantity: 0, capitalRequired: 0, riskAmount: 0 }
  }

  const riskBudget = capital * (profile.riskPercent / 100)
  let quantity = Math.floor(riskBudget / riskPerShare)

  const maxCapital = capital * profile.maxCapitalPerTradePct
  if (quantity * entryPrice > maxCapital) {
    quantity = Math.floor(maxCapital / entryPrice)
  }

  return {
    quantity: Math.max(0, quantity),
    capitalRequired: quantity * entryPrice,
    riskAmount: quantity * riskPerShare,
  }
}
