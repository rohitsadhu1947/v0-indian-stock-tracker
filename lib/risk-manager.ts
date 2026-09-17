/**
 * 🛡️ SERVER-SIDE RISK MANAGER
 *
 * Enforces position limits, sector concentration, drawdown protection,
 * and circuit breaker logic. This is NOT advisory — it actively modifies
 * or rejects signals before they reach the user.
 *
 * Rules:
 * - Max 2% capital risk per trade
 * - Max 25% portfolio in a single sector
 * - Max positions based on regime (5 BEAR, 8 SIDEWAYS, 12 BULL)
 * - Reject new longs if portfolio drawdown > 10% from peak
 * - VIX > 25 → reduce all position sizes by 50%
 * - Kill switch: 5% single-day loss → halt new entries
 */

import { getSectorInfo } from './sector-mapping'

// ============================================================================
// TYPES
// ============================================================================

export interface RiskConfig {
  maxRiskPerTradePercent: number    // Max % of capital to risk per trade (default 2%)
  maxSectorExposurePercent: number  // Max % of portfolio in one sector (default 25%)
  maxDrawdownPercent: number        // Halt new entries beyond this drawdown (default 10%)
  dailyLossHaltPercent: number      // Kill switch: halt if daily loss exceeds this (default 5%)
  maxConsecutiveStopLosses: number  // Pause scanning after N consecutive SL hits (default 3)
  vixReduceThreshold: number        // VIX level to reduce position sizes (default 25)
  vixReduceFactor: number           // Multiply position sizes by this when VIX > threshold (default 0.5)
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  maxRiskPerTradePercent: 2.0,
  maxSectorExposurePercent: 25,
  maxDrawdownPercent: 10,
  dailyLossHaltPercent: 5,
  maxConsecutiveStopLosses: 3,
  vixReduceThreshold: 25,
  vixReduceFactor: 0.5,
}

export interface PortfolioState {
  totalCapital: number
  deployedCapital: number
  peakCapital: number               // Highest portfolio value recorded
  currentValue: number              // Current portfolio value
  todaysPnl: number                 // Today's P&L in absolute terms
  todaysStartValue: number          // Portfolio value at start of day
  openPositions: PortfolioPosition[]
  consecutiveStopLosses: number     // Count of consecutive SL hits
}

export interface PortfolioPosition {
  symbol: string
  sector: string
  entryPrice: number
  currentPrice: number
  quantity: number
  capitalDeployed: number
  unrealizedPnl: number
  stopLoss: number
}

export interface RiskCheckResult {
  allowed: boolean
  adjustedPositionSize: number      // May be reduced from original
  adjustedCapital: number           // Adjusted capital amount
  riskAmount: number                // Actual risk amount after adjustments
  rejectionReasons: string[]        // Why it was rejected (if not allowed)
  warnings: string[]                // Non-fatal warnings
  adjustments: string[]             // What was changed and why
  positionSizeMultiplier: number    // Overall multiplier applied (1.0 = no change)
}

export interface CircuitBreakerStatus {
  halt: boolean
  reason: string
  triggers: CircuitBreakerTrigger[]
  resumeAt?: Date
}

export interface CircuitBreakerTrigger {
  type: 'DAILY_LOSS' | 'DRAWDOWN' | 'CONSECUTIVE_SL' | 'HIGH_VIX'
  active: boolean
  message: string
  value?: number
  threshold?: number
}

// ============================================================================
// REGIME-BASED POSITION LIMITS
// ============================================================================

function getMaxPositions(regime: string): number {
  switch (regime) {
    case 'STRONG_BEAR': return 3
    case 'BEAR': return 5
    case 'SIDEWAYS': return 8
    case 'BULL': return 12
    case 'STRONG_BULL': return 15
    default: return 8 // Default to SIDEWAYS
  }
}

// ============================================================================
// POSITION LIMIT ENFORCEMENT
// ============================================================================

/**
 * Check if a new trade is allowed given current portfolio state and risk rules.
 * Returns adjusted position size or rejection with reasons.
 */
export function enforcePositionLimits(
  signal: {
    symbol: string
    sector?: string
    entryPrice: number
    stopLoss: number
    positionSize: number
    capitalRequired: number
  },
  portfolio: PortfolioState,
  config: RiskConfig = DEFAULT_RISK_CONFIG,
  context?: {
    regime?: string        // STRONG_BULL, BULL, SIDEWAYS, BEAR, STRONG_BEAR
    vixLevel?: number      // Current India VIX
  }
): RiskCheckResult {
  const rejectionReasons: string[] = []
  const warnings: string[] = []
  const adjustments: string[] = []
  let positionSizeMultiplier = 1.0

  const sector = signal.sector || getSectorInfo(signal.symbol)?.sector || 'Unknown'
  const regime = context?.regime || 'SIDEWAYS'

  // 1. Check circuit breaker first
  const circuitBreaker = checkCircuitBreaker(portfolio, config, context?.vixLevel)
  if (circuitBreaker.halt) {
    return {
      allowed: false,
      adjustedPositionSize: 0,
      adjustedCapital: 0,
      riskAmount: 0,
      rejectionReasons: [`🛑 CIRCUIT BREAKER: ${circuitBreaker.reason}`],
      warnings: [],
      adjustments: [],
      positionSizeMultiplier: 0,
    }
  }

  // 2. Max positions check
  const maxPositions = getMaxPositions(regime)
  if (portfolio.openPositions.length >= maxPositions) {
    rejectionReasons.push(
      `Max positions reached: ${portfolio.openPositions.length}/${maxPositions} (${regime} regime)`
    )
  }

  // 3. Max risk per trade
  const riskPerShare = Math.abs(signal.entryPrice - signal.stopLoss)
  const maxRiskAmount = portfolio.totalCapital * (config.maxRiskPerTradePercent / 100)
  let adjustedPositionSize = signal.positionSize

  if (riskPerShare > 0) {
    const maxSharesByRisk = Math.floor(maxRiskAmount / riskPerShare)
    if (adjustedPositionSize > maxSharesByRisk) {
      adjustedPositionSize = maxSharesByRisk
      adjustments.push(
        `Position reduced from ${signal.positionSize} to ${maxSharesByRisk} shares (${config.maxRiskPerTradePercent}% max risk)`
      )
    }
  }

  // 4. Sector concentration check
  const sectorExposure = portfolio.openPositions
    .filter(p => p.sector === sector)
    .reduce((sum, p) => sum + p.capitalDeployed, 0)

  const newSectorExposure = sectorExposure + (adjustedPositionSize * signal.entryPrice)
  const sectorExposurePercent = (newSectorExposure / portfolio.totalCapital) * 100

  if (sectorExposurePercent > config.maxSectorExposurePercent) {
    const allowedCapital = (portfolio.totalCapital * config.maxSectorExposurePercent / 100) - sectorExposure
    if (allowedCapital <= 0) {
      rejectionReasons.push(
        `Sector concentration exceeded: ${sector} at ${sectorExposurePercent.toFixed(1)}% (max ${config.maxSectorExposurePercent}%)`
      )
    } else {
      const maxSharesBySector = Math.floor(allowedCapital / signal.entryPrice)
      if (adjustedPositionSize > maxSharesBySector) {
        adjustedPositionSize = maxSharesBySector
        adjustments.push(
          `Position reduced to ${maxSharesBySector} shares (${sector} sector at ${sectorExposurePercent.toFixed(1)}%)`
        )
      }
    }
  }

  // 5. VIX-based reduction
  if (context?.vixLevel && context.vixLevel > config.vixReduceThreshold) {
    positionSizeMultiplier *= config.vixReduceFactor
    adjustedPositionSize = Math.floor(adjustedPositionSize * config.vixReduceFactor)
    warnings.push(
      `⚠️ HIGH VIX (${context.vixLevel.toFixed(1)} > ${config.vixReduceThreshold}): Position reduced by ${((1 - config.vixReduceFactor) * 100).toFixed(0)}%`
    )
    adjustments.push(
      `VIX adjustment: ${config.vixReduceFactor}x multiplier applied`
    )
  }

  // 6. Drawdown check (warning, not rejection — rejection happens via circuit breaker)
  const drawdownPercent = portfolio.peakCapital > 0
    ? ((portfolio.peakCapital - portfolio.currentValue) / portfolio.peakCapital) * 100
    : 0

  if (drawdownPercent > config.maxDrawdownPercent * 0.7) {
    warnings.push(
      `⚠️ Portfolio drawdown at ${drawdownPercent.toFixed(1)}% (halt at ${config.maxDrawdownPercent}%)`
    )
  }

  // 7. Capital availability
  const adjustedCapital = adjustedPositionSize * signal.entryPrice
  const availableCapital = portfolio.totalCapital - portfolio.deployedCapital
  if (adjustedCapital > availableCapital) {
    adjustedPositionSize = Math.floor(availableCapital / signal.entryPrice)
    if (adjustedPositionSize <= 0) {
      rejectionReasons.push(
        `Insufficient capital: need ₹${adjustedCapital.toLocaleString()}, available ₹${availableCapital.toLocaleString()}`
      )
    } else {
      adjustments.push(
        `Position reduced to ${adjustedPositionSize} shares (available capital: ₹${availableCapital.toLocaleString()})`
      )
    }
  }

  // Final checks
  if (adjustedPositionSize <= 0 && rejectionReasons.length === 0) {
    rejectionReasons.push('Position size reduced to 0 by risk constraints')
  }

  const riskAmount = adjustedPositionSize * riskPerShare

  return {
    allowed: rejectionReasons.length === 0 && adjustedPositionSize > 0,
    adjustedPositionSize: Math.max(0, adjustedPositionSize),
    adjustedCapital: Math.max(0, adjustedPositionSize * signal.entryPrice),
    riskAmount,
    rejectionReasons,
    warnings,
    adjustments,
    positionSizeMultiplier,
  }
}

// ============================================================================
// CIRCUIT BREAKER / KILL SWITCH
// ============================================================================

/**
 * Check if circuit breaker should be triggered.
 * Returns halt=true if new entries should be blocked.
 */
export function checkCircuitBreaker(
  portfolio: PortfolioState,
  config: RiskConfig = DEFAULT_RISK_CONFIG,
  vixLevel?: number
): CircuitBreakerStatus {
  const triggers: CircuitBreakerTrigger[] = []
  let halt = false
  let reason = ''

  // 1. Daily loss check
  if (portfolio.todaysStartValue > 0) {
    const dailyLossPercent = ((portfolio.todaysStartValue - portfolio.currentValue) / portfolio.todaysStartValue) * 100
    const trigger: CircuitBreakerTrigger = {
      type: 'DAILY_LOSS',
      active: dailyLossPercent >= config.dailyLossHaltPercent,
      message: `Daily loss: ${dailyLossPercent.toFixed(2)}% (threshold: ${config.dailyLossHaltPercent}%)`,
      value: dailyLossPercent,
      threshold: config.dailyLossHaltPercent,
    }
    triggers.push(trigger)
    if (trigger.active) {
      halt = true
      reason = `Portfolio down ${dailyLossPercent.toFixed(1)}% today — new entries halted`
    }
  }

  // 2. Drawdown from peak
  if (portfolio.peakCapital > 0) {
    const drawdownPercent = ((portfolio.peakCapital - portfolio.currentValue) / portfolio.peakCapital) * 100
    const trigger: CircuitBreakerTrigger = {
      type: 'DRAWDOWN',
      active: drawdownPercent >= config.maxDrawdownPercent,
      message: `Drawdown from peak: ${drawdownPercent.toFixed(2)}% (threshold: ${config.maxDrawdownPercent}%)`,
      value: drawdownPercent,
      threshold: config.maxDrawdownPercent,
    }
    triggers.push(trigger)
    if (trigger.active) {
      halt = true
      reason = reason || `Max drawdown breached: ${drawdownPercent.toFixed(1)}% from peak — new entries halted`
    }
  }

  // 3. Consecutive stop losses
  const slTrigger: CircuitBreakerTrigger = {
    type: 'CONSECUTIVE_SL',
    active: portfolio.consecutiveStopLosses >= config.maxConsecutiveStopLosses,
    message: `Consecutive stop losses: ${portfolio.consecutiveStopLosses} (threshold: ${config.maxConsecutiveStopLosses})`,
    value: portfolio.consecutiveStopLosses,
    threshold: config.maxConsecutiveStopLosses,
  }
  triggers.push(slTrigger)
  if (slTrigger.active) {
    halt = true
    reason = reason || `${portfolio.consecutiveStopLosses} consecutive stop losses — scanning paused for 1 hour`
  }

  // 4. High VIX
  if (vixLevel !== undefined) {
    const vixTrigger: CircuitBreakerTrigger = {
      type: 'HIGH_VIX',
      active: vixLevel > config.vixReduceThreshold,
      message: `India VIX: ${vixLevel.toFixed(1)} (reduction threshold: ${config.vixReduceThreshold})`,
      value: vixLevel,
      threshold: config.vixReduceThreshold,
    }
    triggers.push(vixTrigger)
    // VIX alone doesn't halt — just reduces size (handled in enforcePositionLimits)
  }

  return {
    halt,
    reason: reason || 'All systems normal',
    triggers,
    ...(halt && slTrigger.active ? { resumeAt: new Date(Date.now() + 60 * 60 * 1000) } : {}),
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Create an empty portfolio state for a given capital amount
 */
export function createEmptyPortfolio(totalCapital: number): PortfolioState {
  return {
    totalCapital,
    deployedCapital: 0,
    peakCapital: totalCapital,
    currentValue: totalCapital,
    todaysPnl: 0,
    todaysStartValue: totalCapital,
    openPositions: [],
    consecutiveStopLosses: 0,
  }
}

/**
 * Calculate current portfolio state from positions
 */
export function calculatePortfolioState(
  totalCapital: number,
  positions: PortfolioPosition[],
  peakCapital?: number,
  todaysStartValue?: number,
  consecutiveStopLosses: number = 0
): PortfolioState {
  const deployedCapital = positions.reduce((sum, p) => sum + p.capitalDeployed, 0)
  const unrealizedPnl = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0)
  const currentValue = totalCapital + unrealizedPnl

  return {
    totalCapital,
    deployedCapital,
    peakCapital: Math.max(peakCapital || totalCapital, currentValue),
    currentValue,
    todaysPnl: (todaysStartValue ? currentValue - todaysStartValue : 0),
    todaysStartValue: todaysStartValue || totalCapital,
    openPositions: positions,
    consecutiveStopLosses,
  }
}

/**
 * Format risk check result for logging / alerts
 */
export function formatRiskCheckSummary(result: RiskCheckResult): string {
  const parts: string[] = []

  if (!result.allowed) {
    parts.push(`🛑 REJECTED: ${result.rejectionReasons.join('; ')}`)
  } else {
    parts.push(`✅ ALLOWED: ${result.adjustedPositionSize} shares (₹${result.adjustedCapital.toLocaleString()})`)
  }

  if (result.adjustments.length > 0) {
    parts.push(`📊 Adjustments: ${result.adjustments.join('; ')}`)
  }

  if (result.warnings.length > 0) {
    parts.push(`⚠️ Warnings: ${result.warnings.join('; ')}`)
  }

  return parts.join('\n')
}
