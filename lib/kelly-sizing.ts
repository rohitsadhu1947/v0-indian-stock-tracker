/**
 * Kelly Criterion Position Sizing + Portfolio Heat Management
 *
 * Kelly Formula: Kelly% = W - [(1-W) / R]
 *   W = historical win rate
 *   R = avg win / avg loss ratio
 *
 * Uses half-Kelly for safety (full Kelly is too aggressive for real trading).
 *
 * Portfolio Heat = Sum of all positions' risk-to-stop as % of capital.
 * Max heat = 8% (institutional standard). Above that, no new positions.
 */

import logger from './logger'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface KellyResult {
  kellyPct: number        // Full Kelly % (too aggressive, for reference)
  halfKellyPct: number    // Half-Kelly % (recommended)
  suggestedSize: number   // Suggested position size in ₹
  maxShares: number       // Max shares at current price
  winRate: number         // Historical win rate used
  avgWinLossRatio: number // R ratio used
  confidence: 'HIGH' | 'MODERATE' | 'LOW'  // Based on sample size
  note: string
}

export interface PortfolioHeat {
  totalHeat: number       // % of capital at risk (sum of all position risks)
  heatStatus: 'COOL' | 'WARM' | 'HOT' | 'OVERHEATED'
  positionHeat: PositionHeat[]
  maxHeat: number         // Configured max (default 8%)
  roomForNew: number      // ₹ amount available for new positions before hitting max
  warning: string | null
}

export interface PositionHeat {
  symbol: string
  positionValue: number   // Current value of position
  riskToStop: number      // ₹ at risk to stop-loss
  heatContribution: number // % of capital this position risks
}

export interface TradeRecord {
  symbol: string
  pnl: number
  pnlPercent: number
  entryPrice: number
  exitPrice: number
  quantity: number
}

// ─── Kelly Criterion ────────────────────────────────────────────────────────

/**
 * Calculate Kelly criterion position size.
 * Uses historical trade data to determine optimal allocation.
 */
export function calculateKellySize(
  trades: TradeRecord[],
  capitalBase: number,
  currentPrice: number,
  opts: { maxPositionPct?: number; useHalfKelly?: boolean } = {},
): KellyResult {
  const { maxPositionPct = 15, useHalfKelly = true } = opts

  // Need at least 10 trades for meaningful Kelly calculation
  if (trades.length < 10) {
    // Default conservative sizing: 2-3% of capital
    const defaultPct = 2.5
    const suggestedSize = capitalBase * defaultPct / 100
    return {
      kellyPct: defaultPct * 2,
      halfKellyPct: defaultPct,
      suggestedSize,
      maxShares: currentPrice > 0 ? Math.floor(suggestedSize / currentPrice) : 0,
      winRate: 0,
      avgWinLossRatio: 0,
      confidence: 'LOW',
      note: `Insufficient trade history (${trades.length} trades, need 10+). Using default 2.5% of capital.`,
    }
  }

  const winners = trades.filter(t => t.pnl > 0)
  const losers = trades.filter(t => t.pnl <= 0)

  const winRate = winners.length / trades.length

  const avgWin = winners.length > 0
    ? winners.reduce((s, t) => s + Math.abs(t.pnlPercent), 0) / winners.length
    : 0
  const avgLoss = losers.length > 0
    ? losers.reduce((s, t) => s + Math.abs(t.pnlPercent), 0) / losers.length
    : 1 // Avoid division by zero

  const R = avgLoss > 0 ? avgWin / avgLoss : 1

  // Kelly formula: W - (1-W)/R
  let kellyPct = (winRate - (1 - winRate) / R) * 100

  // Kelly can be negative (meaning don't trade this strategy)
  if (kellyPct < 0) {
    return {
      kellyPct,
      halfKellyPct: 0,
      suggestedSize: 0,
      maxShares: 0,
      winRate,
      avgWinLossRatio: R,
      confidence: trades.length >= 30 ? 'HIGH' : 'MODERATE',
      note: `Negative Kelly (${kellyPct.toFixed(1)}%) — this strategy has negative expected value. Win rate ${(winRate * 100).toFixed(0)}%, R ${R.toFixed(2)}. Don't add new positions.`,
    }
  }

  // Cap at maxPositionPct (never put more than 15% in one stock)
  kellyPct = Math.min(kellyPct, maxPositionPct * 2) // Full Kelly cap
  const halfKellyPct = useHalfKelly ? Math.min(kellyPct / 2, maxPositionPct) : Math.min(kellyPct, maxPositionPct)

  const suggestedSize = capitalBase * halfKellyPct / 100
  const maxShares = currentPrice > 0 ? Math.floor(suggestedSize / currentPrice) : 0

  const confidence: KellyResult['confidence'] =
    trades.length >= 50 ? 'HIGH' :
    trades.length >= 20 ? 'MODERATE' : 'LOW'

  const note = `Kelly suggests ${halfKellyPct.toFixed(1)}% of capital (₹${formatINR(suggestedSize)}). ` +
    `Based on ${trades.length} trades: ${(winRate * 100).toFixed(0)}% win rate, ${R.toFixed(2)} R-ratio. ` +
    `Confidence: ${confidence.toLowerCase()} (${trades.length} sample trades).`

  return {
    kellyPct,
    halfKellyPct: Math.round(halfKellyPct * 100) / 100,
    suggestedSize: Math.round(suggestedSize),
    maxShares,
    winRate: Math.round(winRate * 1000) / 1000,
    avgWinLossRatio: Math.round(R * 100) / 100,
    confidence,
    note,
  }
}

// ─── Portfolio Heat ─────────────────────────────────────────────────────────

/**
 * Calculate portfolio heat — total risk exposure as % of capital.
 * Heat = Sum of (position size × distance-to-stop / capital)
 */
export function calculatePortfolioHeat(
  positions: {
    symbol: string
    currentPrice: number
    quantity: number
    stopLoss: number | null
    entryPrice: number
  }[],
  capitalBase: number,
  maxHeat = 8, // 8% default max
): PortfolioHeat {
  const positionHeat: PositionHeat[] = []
  let totalHeat = 0

  for (const pos of positions) {
    const positionValue = pos.currentPrice * pos.quantity
    // If no stop-loss, assume 10% risk (worst case estimate)
    const stopDist = pos.stopLoss && pos.stopLoss > 0
      ? Math.abs(pos.currentPrice - pos.stopLoss)
      : pos.currentPrice * 0.10

    const riskToStop = stopDist * pos.quantity
    const heatContribution = capitalBase > 0 ? (riskToStop / capitalBase) * 100 : 0

    totalHeat += heatContribution

    positionHeat.push({
      symbol: pos.symbol,
      positionValue,
      riskToStop: Math.round(riskToStop),
      heatContribution: Math.round(heatContribution * 100) / 100,
    })
  }

  totalHeat = Math.round(totalHeat * 100) / 100

  const heatStatus: PortfolioHeat['heatStatus'] =
    totalHeat >= maxHeat ? 'OVERHEATED' :
    totalHeat >= maxHeat * 0.75 ? 'HOT' :
    totalHeat >= maxHeat * 0.5 ? 'WARM' : 'COOL'

  // Room for new positions
  const roomPct = Math.max(0, maxHeat - totalHeat)
  const roomForNew = capitalBase * roomPct / 100

  let warning: string | null = null
  if (heatStatus === 'OVERHEATED') {
    warning = `Portfolio heat at ${totalHeat.toFixed(1)}% exceeds ${maxHeat}% max. NO new positions until heat drops. Consider tightening stops or reducing positions.`
  } else if (heatStatus === 'HOT') {
    warning = `Portfolio heat at ${totalHeat.toFixed(1)}% — approaching limit. Only take high-conviction trades with tight stops.`
  }

  // Sort by heat contribution descending
  positionHeat.sort((a, b) => b.heatContribution - a.heatContribution)

  return {
    totalHeat,
    heatStatus,
    positionHeat,
    maxHeat,
    roomForNew: Math.round(roomForNew),
    warning,
  }
}

/**
 * Suggest position size considering both Kelly and portfolio heat.
 * Returns the smaller of Kelly suggestion and heat-adjusted max.
 */
export function suggestPositionSize(
  kellyResult: KellyResult,
  heat: PortfolioHeat,
  currentPrice: number,
): { suggestedSize: number; maxShares: number; reason: string } {
  if (heat.heatStatus === 'OVERHEATED') {
    return {
      suggestedSize: 0,
      maxShares: 0,
      reason: `Portfolio overheated (${heat.totalHeat.toFixed(1)}% heat). Wait for positions to close or tighten stops before adding new risk.`,
    }
  }

  // Heat-adjusted max = room available * some fraction (don't use ALL the room)
  const heatAdjustedMax = heat.roomForNew * 0.5 // Use at most 50% of remaining room

  const size = Math.min(kellyResult.suggestedSize, heatAdjustedMax)
  const shares = currentPrice > 0 ? Math.floor(size / currentPrice) : 0

  let reason: string
  if (size < kellyResult.suggestedSize) {
    reason = `Heat-adjusted to ₹${formatINR(size)} (${shares} shares). Kelly suggests ₹${formatINR(kellyResult.suggestedSize)} but portfolio heat limits new risk.`
  } else {
    reason = `Kelly-optimal: ₹${formatINR(size)} (${shares} shares). Portfolio has room for this allocation.`
  }

  return { suggestedSize: Math.round(size), maxShares: shares, reason }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatINR(amount: number): string {
  if (amount >= 1e7) return `${(amount / 1e7).toFixed(2)} Cr`
  if (amount >= 1e5) return `${(amount / 1e5).toFixed(2)} L`
  return amount.toLocaleString('en-IN')
}
