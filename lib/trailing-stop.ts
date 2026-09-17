/**
 * 📈 TRAILING STOP SYSTEM
 *
 * Dynamically adjusts stop-loss levels as price moves in your favor.
 * Tighter stops in BEAR regime, wider in BULL.
 *
 * Methods:
 * - ATR-based (default): 2x ATR below high water mark
 * - Percentage-based: Fixed % below high water mark
 * - Chandelier Exit: ATR from the highest high
 */

// ============================================================================
// TYPES
// ============================================================================

export type TrailingStopMethod = 'ATR' | 'PERCENTAGE' | 'CHANDELIER'

export interface TrailingStopConfig {
  method: TrailingStopMethod
  atrMultiplier: number        // For ATR method (default varies by regime)
  percentageDistance: number    // For percentage method (e.g., 3 = 3%)
  chandelierPeriod: number     // Lookback for Chandelier exit (default 22)
}

export interface TrailingStopResult {
  stopPrice: number
  method: TrailingStopMethod
  distancePercent: number      // % distance from current price to stop
  riskRewardRatio: number      // (current - entry) / (current - stop)
  shouldTrail: boolean         // Whether stop should be moved up
  previousStop: number
  newStop: number
  signals: string[]
}

// ============================================================================
// DEFAULT CONFIG BY REGIME
// ============================================================================

export function getTrailingStopConfig(
  regime: string = 'SIDEWAYS',
  method: TrailingStopMethod = 'ATR'
): TrailingStopConfig {
  // Tighter stops in bear (protect profits), wider in bull (let winners run)
  const atrMultiplier = (() => {
    switch (regime) {
      case 'STRONG_BEAR': return 1.2
      case 'BEAR': return 1.5
      case 'SIDEWAYS': return 2.0
      case 'BULL': return 2.5
      case 'STRONG_BULL': return 3.0
      default: return 2.0
    }
  })()

  const percentageDistance = (() => {
    switch (regime) {
      case 'STRONG_BEAR': return 2.0
      case 'BEAR': return 2.5
      case 'SIDEWAYS': return 3.0
      case 'BULL': return 4.0
      case 'STRONG_BULL': return 5.0
      default: return 3.0
    }
  })()

  return {
    method,
    atrMultiplier,
    percentageDistance,
    chandelierPeriod: 22,
  }
}

// ============================================================================
// TRAILING STOP CALCULATION
// ============================================================================

/**
 * Calculate trailing stop price for a position.
 *
 * @param entryPrice - Original entry price
 * @param currentPrice - Current market price
 * @param highWaterMark - Highest price since entry
 * @param atr - Current Average True Range
 * @param previousStop - Previous stop-loss level
 * @param config - Trailing stop configuration
 */
export function calculateTrailingStop(
  entryPrice: number,
  currentPrice: number,
  highWaterMark: number,
  atr: number,
  previousStop: number,
  config: TrailingStopConfig = getTrailingStopConfig()
): TrailingStopResult {
  const signals: string[] = []
  let newStop = previousStop

  // Calculate stop based on method
  switch (config.method) {
    case 'ATR': {
      // ATR trailing: stop = highWaterMark - (ATR * multiplier)
      const atrStop = highWaterMark - (atr * config.atrMultiplier)
      newStop = Math.max(previousStop, atrStop) // Never lower the stop
      signals.push(`ATR trail: ${config.atrMultiplier}x ATR (${atr.toFixed(2)}) from high ${highWaterMark.toFixed(2)}`)
      break
    }

    case 'PERCENTAGE': {
      // Percentage trailing: stop = highWaterMark * (1 - distance%)
      const pctStop = highWaterMark * (1 - config.percentageDistance / 100)
      newStop = Math.max(previousStop, pctStop)
      signals.push(`Percentage trail: ${config.percentageDistance}% from high ${highWaterMark.toFixed(2)}`)
      break
    }

    case 'CHANDELIER': {
      // Chandelier Exit: highest high - ATR * multiplier
      // Similar to ATR but typically uses 3x ATR from the highest high
      const chandelierStop = highWaterMark - (atr * 3.0)
      newStop = Math.max(previousStop, chandelierStop)
      signals.push(`Chandelier Exit: 3x ATR (${atr.toFixed(2)}) from ${config.chandelierPeriod}-day high`)
      break
    }
  }

  // Ensure stop is never above current price
  if (newStop >= currentPrice) {
    newStop = currentPrice * 0.995 // Set 0.5% below current if stop goes above
    signals.push('⚠️ Stop capped below current price')
  }

  // Ensure stop is never below entry (once in profit)
  if (currentPrice > entryPrice * 1.02 && newStop < entryPrice) {
    // Once 2%+ in profit, move stop to at least breakeven
    newStop = Math.max(newStop, entryPrice * 1.001) // Tiny buffer above entry
    signals.push('🔒 Stop moved to breakeven (2%+ profit)')
  }

  const shouldTrail = newStop > previousStop
  const distancePercent = ((currentPrice - newStop) / currentPrice) * 100
  const profitPercent = ((currentPrice - entryPrice) / entryPrice) * 100
  const riskRewardRatio = profitPercent > 0 && distancePercent > 0
    ? profitPercent / distancePercent
    : 0

  if (shouldTrail) {
    const movePercent = ((newStop - previousStop) / previousStop) * 100
    signals.push(`📈 Stop trailed up by ${movePercent.toFixed(2)}%: ₹${previousStop.toFixed(2)} → ₹${newStop.toFixed(2)}`)
  }

  return {
    stopPrice: newStop,
    method: config.method,
    distancePercent,
    riskRewardRatio,
    shouldTrail,
    previousStop,
    newStop,
    signals,
  }
}

// ============================================================================
// BATCH TRAILING STOP UPDATE
// ============================================================================

/**
 * Update trailing stops for all open positions.
 * Returns positions with updated stop levels.
 */
export function updateTrailingStops(
  positions: Array<{
    symbol: string
    entryPrice: number
    currentPrice: number
    highWaterMark: number
    currentStop: number
    atr: number
  }>,
  regime: string = 'SIDEWAYS',
  method: TrailingStopMethod = 'ATR'
): Array<{
  symbol: string
  result: TrailingStopResult
}> {
  const config = getTrailingStopConfig(regime, method)

  return positions.map(pos => ({
    symbol: pos.symbol,
    result: calculateTrailingStop(
      pos.entryPrice,
      pos.currentPrice,
      pos.highWaterMark,
      pos.atr,
      pos.currentStop,
      config
    ),
  }))
}

/**
 * Check if a position should be stopped out
 */
export function shouldStopOut(
  currentPrice: number,
  stopPrice: number,
  isLong: boolean = true
): { stopped: boolean; message: string } {
  if (isLong) {
    if (currentPrice <= stopPrice) {
      return {
        stopped: true,
        message: `🛑 STOP HIT: Price ₹${currentPrice.toFixed(2)} ≤ Stop ₹${stopPrice.toFixed(2)}`,
      }
    }
  } else {
    if (currentPrice >= stopPrice) {
      return {
        stopped: true,
        message: `🛑 STOP HIT (SHORT): Price ₹${currentPrice.toFixed(2)} ≥ Stop ₹${stopPrice.toFixed(2)}`,
      }
    }
  }

  return { stopped: false, message: '' }
}
