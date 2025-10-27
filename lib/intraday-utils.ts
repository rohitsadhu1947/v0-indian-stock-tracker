// Intraday Trading Utilities

export interface IntradayCandle {
  timestamp: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface Position {
  symbol: string
  type: 'BUY' | 'SELL'
  entry_price: number
  quantity: number
  entry_time: Date
  target: number
  stop_loss: number
  current_price: number
  pnl: number
  pnl_percent: number
  status: 'open' | 'target_hit' | 'stop_loss_hit' | 'time_stop'
}

export interface IntradaySignal {
  symbol: string
  signal_type: 'BUY' | 'SELL' | 'EXIT' | 'HOLD'
  strength: number
  entry_price: number
  target: number
  stop_loss: number
  reasons: string[]
  risk_reward: number
  position_size_suggested: number
  risk_level?: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE'
  conditions_met?: number
  total_conditions?: number
}

// Calculate VWAP (Volume Weighted Average Price)
export function calculateVWAP(candles: IntradayCandle[]): number {
  if (!candles || candles.length === 0) return 0

  let totalPV = 0 // Price * Volume
  let totalVolume = 0

  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3
    totalPV += typicalPrice * candle.volume
    totalVolume += candle.volume
  }

  return totalVolume > 0 ? totalPV / totalVolume : 0
}

// Calculate Support and Resistance levels
export function calculateSupportResistance(candles: IntradayCandle[]): {
  support: number
  resistance: number
} {
  if (!candles || candles.length < 3) {
    return { support: 0, resistance: 0 }
  }

  const lows = candles.map(c => c.low).sort((a, b) => a - b)
  const highs = candles.map(c => c.high).sort((a, b) => b - a)

  // Support = Average of lowest 20% prices
  const supportIndex = Math.floor(lows.length * 0.2)
  const support = lows.slice(0, supportIndex).reduce((a, b) => a + b, 0) / supportIndex

  // Resistance = Average of highest 20% prices
  const resistanceIndex = Math.floor(highs.length * 0.2)
  const resistance = highs.slice(0, resistanceIndex).reduce((a, b) => a + b, 0) / resistanceIndex

  return { support, resistance }
}

// Check if stock is in momentum (moved 0.5-1% in first 15 minutes)
export function checkMomentum(
  candles: IntradayCandle[],
  marketOpenTime: Date
): { hasMomentum: boolean; movePercent: number } {
  if (!candles || candles.length < 2) {
    return { hasMomentum: false, movePercent: 0 }
  }

  // Get candles from first 15 minutes
  const fifteenMinAfterOpen = new Date(marketOpenTime.getTime() + 15 * 60 * 1000)
  const earlyCandles = candles.filter(c => c.timestamp <= fifteenMinAfterOpen)

  if (earlyCandles.length === 0) {
    return { hasMomentum: false, movePercent: 0 }
  }

  const openPrice = earlyCandles[0].open
  const currentPrice = earlyCandles[earlyCandles.length - 1].close

  const movePercent = ((currentPrice - openPrice) / openPrice) * 100
  const hasMomentum = Math.abs(movePercent) >= 0.5 && Math.abs(movePercent) <= 3

  return { hasMomentum, movePercent }
}

// Check volume confirmation (>2x average)
export function checkVolumeConfirmation(
  currentVolume: number,
  averageVolume: number
): boolean {
  return currentVolume > averageVolume * 2
}

// Generate intraday entry signal with 3 risk levels
export function generateIntradaySignal(
  symbol: string,
  candles: IntradayCandle[],
  currentPrice: number,
  rsi: number,
  marketOpenTime: Date,
  screenerLevel: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE' = 'CONSERVATIVE'
): IntradaySignal | null {
  // Minimum candles required based on screener level
  const minCandles = screenerLevel === 'CONSERVATIVE' ? 20 :
                    screenerLevel === 'MODERATE' ? 10 : 5
  
  if (!candles || candles.length < minCandles) {
    return null
  }

  const vwap = calculateVWAP(candles)
  const { support, resistance } = calculateSupportResistance(candles)
  const { hasMomentum, movePercent } = checkMomentum(candles, marketOpenTime)

  // Calculate average volume
  const avgVolume = candles.reduce((sum, c) => sum + c.volume, 0) / candles.length
  const currentVolume = candles[candles.length - 1].volume
  const hasVolumeConfirmation = checkVolumeConfirmation(currentVolume, avgVolume)

  const reasons: string[] = []
  let conditionsMet = 0
  let signalStrength = 0

  // Entry Condition 1: Momentum check (relaxed for aggressive)
  const momentumMet = screenerLevel === 'AGGRESSIVE' 
    ? Math.abs(movePercent) >= 0.3  // Any 0.3%+ move for aggressive
    : hasMomentum
  
  if (momentumMet) {
    reasons.push(`Momentum: ${movePercent > 0 ? '+' : ''}${movePercent.toFixed(2)}%`)
    signalStrength += 2
    conditionsMet++
  }

  // Entry Condition 2: Volume confirmation (relaxed for aggressive)
  const volumeThreshold = screenerLevel === 'AGGRESSIVE' ? 1.5 : 2.0  // 1.5x for aggressive, 2x for others
  const volumeConfirmed = currentVolume > avgVolume * volumeThreshold
  
  if (volumeConfirmed) {
    reasons.push(`Volume: ${(currentVolume / avgVolume).toFixed(1)}x avg`)
    signalStrength += 2
    conditionsMet++
  }

  // Entry Condition 3: RSI check (relaxed for aggressive)
  const rsiMin = screenerLevel === 'AGGRESSIVE' ? 30 : 40
  const rsiMax = screenerLevel === 'AGGRESSIVE' ? 75 : 70
  if (rsi >= rsiMin && rsi <= rsiMax) {
    reasons.push(`RSI: ${rsi.toFixed(0)} (Good range)`)
    signalStrength += 2
    conditionsMet++
  }

  // Entry Condition 4: Price above VWAP (relaxed for aggressive)
  const vwapThreshold = screenerLevel === 'AGGRESSIVE' ? 0.995 : 1.0
  const aboveVWAP = currentPrice > vwap * vwapThreshold
  if (aboveVWAP) {
    reasons.push(`${currentPrice > vwap ? 'Above' : 'Near'} VWAP (₹${vwap.toFixed(2)})`)
    signalStrength += 2
    conditionsMet++
  }

  // Entry Condition 5: Clear support level (relaxed for aggressive)
  const supportMargin = screenerLevel === 'AGGRESSIVE' ? 1.002 : 1.005 // 0.2-0.5% above support
  const hasSupport = support > 0 && currentPrice > support * supportMargin
  if (hasSupport) {
    reasons.push(`Support at ₹${support.toFixed(2)}`)
    signalStrength += 2
    conditionsMet++
  }

  // Determine minimum conditions required based on screener level
  const minConditions = screenerLevel === 'CONSERVATIVE' ? 5 : 
                       screenerLevel === 'MODERATE' ? 3 : 1  // Changed from 2 to 1 for aggressive
  const minStrength = screenerLevel === 'CONSERVATIVE' ? 10 : 
                     screenerLevel === 'MODERATE' ? 6 : 2  // Changed from 4 to 2 for aggressive

  // Debug logging for aggressive mode
  if (screenerLevel === 'AGGRESSIVE') {
    console.log(`${symbol}: ${conditionsMet} conditions met, strength: ${signalStrength}`)
  }

  // Generate signal if conditions met
  if (conditionsMet >= minConditions && signalStrength >= minStrength) {
    const stopLoss = support > 0 ? support * 0.995 : currentPrice * 0.99 // 0.5-1% below
    const target = currentPrice * 1.025 // 2.5% above
    const riskReward = (target - currentPrice) / (currentPrice - stopLoss)

    // Position sizing (risk 1% of capital)
    const riskAmount = 10000 // Assume 10k capital, risk 1% = 100
    const riskPerShare = currentPrice - stopLoss
    const positionSize = Math.floor(riskAmount / riskPerShare)

    return {
      symbol,
      signal_type: movePercent > 0 ? 'BUY' : 'SELL',
      strength: Math.min(5, Math.floor(signalStrength / 2)),
      entry_price: currentPrice,
      target,
      stop_loss: stopLoss,
      reasons,
      risk_reward: riskReward,
      position_size_suggested: positionSize,
      risk_level: screenerLevel,
      conditions_met: conditionsMet,
      total_conditions: 5,
    }
  }

  return null
}

// Check if position should be exited
export function checkExitSignal(
  position: Position,
  currentPrice: number,
  currentTime: Date
): { shouldExit: boolean; reason: string } {
  // Check target hit (2-3% profit)
  if (currentPrice >= position.target) {
    return { shouldExit: true, reason: 'Target Hit' }
  }

  // Check stop loss (0.5-1% loss)
  if (currentPrice <= position.stop_loss) {
    return { shouldExit: true, reason: 'Stop Loss Hit' }
  }

  // Check time stop (3:00 PM)
  const marketCloseTime = new Date(currentTime)
  marketCloseTime.setHours(15, 0, 0, 0) // 3:00 PM

  if (currentTime >= marketCloseTime) {
    return { shouldExit: true, reason: 'Time Stop (Market Close)' }
  }

  return { shouldExit: false, reason: '' }
}

// Calculate P&L for position
export function calculatePnL(position: Position, currentPrice: number): Position {
  const pnl = (currentPrice - position.entry_price) * position.quantity
  const pnl_percent = ((currentPrice - position.entry_price) / position.entry_price) * 100

  return {
    ...position,
    current_price: currentPrice,
    pnl,
    pnl_percent,
  }
}

// Detect gap up/down at market open
export function detectGap(
  previousDayClose: number,
  todayOpen: number
): { hasGap: boolean; gapPercent: number; gapType: 'GAP_UP' | 'GAP_DOWN' | 'NONE' } {
  const gapPercent = ((todayOpen - previousDayClose) / previousDayClose) * 100

  if (Math.abs(gapPercent) < 0.5) {
    return { hasGap: false, gapPercent, gapType: 'NONE' }
  }

  return {
    hasGap: true,
    gapPercent,
    gapType: gapPercent > 0 ? 'GAP_UP' : 'GAP_DOWN',
  }
}

// Market timing helper
export function isMarketHours(now: Date = new Date()): {
  isOpen: boolean
  phase: 'pre_market' | 'opening' | 'active' | 'closing' | 'closed'
  minutesToOpen?: number
  minutesToClose?: number
} {
  const hours = now.getHours()
  const minutes = now.getMinutes()
  const totalMinutes = hours * 60 + minutes

  const preMarketStart = 9 * 60 // 9:00 AM
  const marketOpen = 9 * 60 + 15 // 9:15 AM
  const activeTrading = 9 * 60 + 30 // 9:30 AM
  const marketClose = 15 * 60 + 30 // 3:30 PM

  if (totalMinutes < preMarketStart) {
    return {
      isOpen: false,
      phase: 'closed',
      minutesToOpen: marketOpen - totalMinutes,
    }
  } else if (totalMinutes < marketOpen) {
    return {
      isOpen: false,
      phase: 'pre_market',
      minutesToOpen: marketOpen - totalMinutes,
    }
  } else if (totalMinutes < activeTrading) {
    return {
      isOpen: true,
      phase: 'opening',
      minutesToClose: marketClose - totalMinutes,
    }
  } else if (totalMinutes < marketClose) {
    return {
      isOpen: true,
      phase: 'active',
      minutesToClose: marketClose - totalMinutes,
    }
  } else {
    return {
      isOpen: false,
      phase: 'closed',
    }
  }
}

