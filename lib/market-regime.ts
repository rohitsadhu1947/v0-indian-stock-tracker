/**
 * 📊 MARKET REGIME DETECTOR
 * 
 * Analyzes NIFTY 50 to determine overall market conditions:
 * - BULL: Strong uptrend, aggressive buying opportunity
 * - BEAR: Downtrend, defensive positioning
 * - SIDEWAYS: Range-bound, mean reversion strategies
 * 
 * Uses multiple indicators for confirmation:
 * - Price vs SMAs (20, 50, 200)
 * - RSI levels
 * - Trend strength (ADX concept)
 * - Volatility regime
 */

export type MarketRegime = 'STRONG_BULL' | 'BULL' | 'SIDEWAYS' | 'BEAR' | 'STRONG_BEAR'

export interface RegimeAnalysis {
  regime: MarketRegime
  confidence: number  // 0-100
  
  // Current market metrics
  niftyPrice: number
  niftyChange: number
  niftyChangePercent: number
  
  // Technical indicators
  sma20: number
  sma50: number
  sma200: number
  rsi: number
  
  // Regime signals
  priceVsSma20: 'ABOVE' | 'BELOW'
  priceVsSma50: 'ABOVE' | 'BELOW'
  priceVsSma200: 'ABOVE' | 'BELOW'
  
  // Trend analysis
  trendStrength: number  // 0-100
  trendDirection: 'UP' | 'DOWN' | 'FLAT'
  
  // Volatility
  volatility: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME'
  volatilityPercent: number
  
  // Trading implications
  positionSizeMultiplier: number  // 0.5 (bear) to 1.5 (strong bull)
  riskTolerance: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE'
  recommendation: string
  
  // Supporting data
  signals: string[]
  warnings: string[]
  
  // Timestamp
  analyzedAt: Date
}

export interface HistoricalBar {
  date: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/**
 * Calculate Simple Moving Average
 */
function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1] || 0
  const slice = prices.slice(-period)
  return slice.reduce((a, b) => a + b, 0) / period
}

/**
 * Calculate RSI (Relative Strength Index)
 */
function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50

  let gains = 0
  let losses = 0

  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1]
    if (change > 0) gains += change
    else losses += Math.abs(change)
  }

  const avgGain = gains / period
  const avgLoss = losses / period

  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - (100 / (1 + rs))
}

/**
 * Calculate Average True Range (ATR) for volatility
 */
function calculateATR(bars: HistoricalBar[], period: number = 14): number {
  if (bars.length < period + 1) return 0
  
  const trueRanges: number[] = []
  
  for (let i = 1; i < bars.length; i++) {
    const high = bars[i].high
    const low = bars[i].low
    const prevClose = bars[i - 1].close
    
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    )
    trueRanges.push(tr)
  }
  
  // Simple average of last 'period' true ranges
  const recentTRs = trueRanges.slice(-period)
  return recentTRs.reduce((a, b) => a + b, 0) / recentTRs.length
}

/**
 * Calculate trend strength (simplified ADX concept)
 * Returns 0-100 where higher = stronger trend
 */
function calculateTrendStrength(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50
  
  // Calculate directional movement
  let upMoves = 0
  let downMoves = 0
  
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1]
    if (change > 0) upMoves += change
    else downMoves += Math.abs(change)
  }
  
  const totalMove = upMoves + downMoves
  if (totalMove === 0) return 0
  
  // Directional index (how one-sided the moves are)
  const directionality = Math.abs(upMoves - downMoves) / totalMove
  
  // Price range expansion
  const high = Math.max(...prices.slice(-period))
  const low = Math.min(...prices.slice(-period))
  const rangePercent = ((high - low) / prices[prices.length - 1]) * 100
  
  // Combine: strong trend = one direction + expanding range
  const strength = (directionality * 70) + (Math.min(rangePercent, 10) * 3)
  
  return Math.min(100, Math.max(0, strength))
}

/**
 * Determine volatility regime based on ATR percentage
 */
function getVolatilityRegime(atrPercent: number): 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME' {
  if (atrPercent < 0.8) return 'LOW'
  if (atrPercent < 1.5) return 'NORMAL'
  if (atrPercent < 2.5) return 'HIGH'
  return 'EXTREME'
}

/**
 * Main function: Analyze market regime from NIFTY 50 historical data
 */
export function analyzeMarketRegime(
  bars: HistoricalBar[],
  currentPrice?: number
): RegimeAnalysis {
  const signals: string[] = []
  const warnings: string[] = []
  
  // Extract close prices
  const closes = bars.map(b => b.close)
  const latestBar = bars[bars.length - 1]
  const price = currentPrice || latestBar.close
  const prevClose = bars[bars.length - 2]?.close || price
  
  // Calculate indicators
  const sma20 = calculateSMA(closes, 20)
  const sma50 = calculateSMA(closes, 50)
  const sma200 = calculateSMA(closes, 200)
  const rsi = calculateRSI(closes, 14)
  const atr = calculateATR(bars, 14)
  const trendStrength = calculateTrendStrength(closes, 14)
  
  // Price vs SMAs
  const priceVsSma20 = price > sma20 ? 'ABOVE' : 'BELOW'
  const priceVsSma50 = price > sma50 ? 'ABOVE' : 'BELOW'
  const priceVsSma200 = price > sma200 ? 'ABOVE' : 'BELOW'
  
  // Volatility
  const volatilityPercent = (atr / price) * 100
  const volatility = getVolatilityRegime(volatilityPercent)
  
  // Calculate change
  const change = price - prevClose
  const changePercent = (change / prevClose) * 100
  
  // Trend direction
  let trendDirection: 'UP' | 'DOWN' | 'FLAT' = 'FLAT'
  if (sma20 > sma50 && price > sma20) trendDirection = 'UP'
  else if (sma20 < sma50 && price < sma20) trendDirection = 'DOWN'
  
  // === REGIME SCORING ===
  let bullScore = 0
  let bearScore = 0
  
  // Price vs SMAs (major factor)
  if (priceVsSma20 === 'ABOVE') { bullScore += 15; signals.push('Price above SMA20') }
  else { bearScore += 15; signals.push('Price below SMA20') }
  
  if (priceVsSma50 === 'ABOVE') { bullScore += 20; signals.push('Price above SMA50') }
  else { bearScore += 20; signals.push('Price below SMA50') }
  
  if (priceVsSma200 === 'ABOVE') { bullScore += 25; signals.push('Price above SMA200 (long-term bull)') }
  else { bearScore += 25; signals.push('Price below SMA200 (long-term bear)') }
  
  // SMA alignment (golden cross / death cross)
  if (sma20 > sma50 && sma50 > sma200) {
    bullScore += 20
    signals.push('SMAs in bullish alignment (20>50>200)')
  } else if (sma20 < sma50 && sma50 < sma200) {
    bearScore += 20
    signals.push('SMAs in bearish alignment (20<50<200)')
  }
  
  // RSI
  if (rsi > 60) {
    bullScore += 10
    signals.push(`RSI bullish: ${rsi.toFixed(0)}`)
  } else if (rsi < 40) {
    bearScore += 10
    signals.push(`RSI bearish: ${rsi.toFixed(0)}`)
  } else {
    signals.push(`RSI neutral: ${rsi.toFixed(0)}`)
  }
  
  // Extreme RSI warnings
  if (rsi > 75) {
    warnings.push('⚠️ RSI overbought - potential pullback')
  } else if (rsi < 25) {
    warnings.push('⚠️ RSI oversold - potential bounce')
  }
  
  // Trend strength bonus
  if (trendStrength > 60) {
    if (trendDirection === 'UP') bullScore += 10
    else if (trendDirection === 'DOWN') bearScore += 10
    signals.push(`Strong ${trendDirection} trend (${trendStrength.toFixed(0)}%)`)
  }
  
  // Volatility adjustment
  if (volatility === 'EXTREME') {
    warnings.push('⚠️ Extreme volatility - reduce position sizes')
  } else if (volatility === 'HIGH') {
    warnings.push('⚠️ High volatility - use wider stops')
  }
  
  // === DETERMINE REGIME ===
  const netScore = bullScore - bearScore
  let regime: MarketRegime
  let confidence: number
  
  if (netScore >= 50) {
    regime = 'STRONG_BULL'
    confidence = Math.min(95, 70 + netScore / 2)
  } else if (netScore >= 20) {
    regime = 'BULL'
    confidence = Math.min(85, 60 + netScore)
  } else if (netScore <= -50) {
    regime = 'STRONG_BEAR'
    confidence = Math.min(95, 70 + Math.abs(netScore) / 2)
  } else if (netScore <= -20) {
    regime = 'BEAR'
    confidence = Math.min(85, 60 + Math.abs(netScore))
  } else {
    regime = 'SIDEWAYS'
    confidence = 60 + (20 - Math.abs(netScore))
  }
  
  // === TRADING IMPLICATIONS ===
  let positionSizeMultiplier: number
  let riskTolerance: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE'
  let recommendation: string
  
  switch (regime) {
    case 'STRONG_BULL':
      positionSizeMultiplier = 1.5
      riskTolerance = 'AGGRESSIVE'
      recommendation = 'Market in strong uptrend. Increase position sizes, buy dips, focus on momentum stocks.'
      break
    case 'BULL':
      positionSizeMultiplier = 1.2
      riskTolerance = 'MODERATE'
      recommendation = 'Market trending up. Normal position sizes, look for quality breakouts.'
      break
    case 'SIDEWAYS':
      positionSizeMultiplier = 0.8
      riskTolerance = 'MODERATE'
      recommendation = 'Market range-bound. Trade both sides, use tighter stops, focus on mean reversion.'
      break
    case 'BEAR':
      positionSizeMultiplier = 0.6
      riskTolerance = 'CONSERVATIVE'
      recommendation = 'Market trending down. Reduce exposure, avoid catching falling knives, consider hedging.'
      break
    case 'STRONG_BEAR':
      positionSizeMultiplier = 0.4
      riskTolerance = 'CONSERVATIVE'
      recommendation = 'Market in strong downtrend. Minimize long exposure, preserve capital, wait for reversal signals.'
      break
  }
  
  // Adjust for volatility
  if (volatility === 'EXTREME') {
    positionSizeMultiplier *= 0.7
  } else if (volatility === 'HIGH') {
    positionSizeMultiplier *= 0.85
  }
  
  return {
    regime,
    confidence,
    
    niftyPrice: price,
    niftyChange: change,
    niftyChangePercent: changePercent,
    
    sma20,
    sma50,
    sma200,
    rsi,
    
    priceVsSma20,
    priceVsSma50,
    priceVsSma200,
    
    trendStrength,
    trendDirection,
    
    volatility,
    volatilityPercent,
    
    positionSizeMultiplier,
    riskTolerance,
    recommendation,
    
    signals,
    warnings,
    
    analyzedAt: new Date()
  }
}

/**
 * Get regime color for UI
 */
export function getRegimeColor(regime: MarketRegime): string {
  switch (regime) {
    case 'STRONG_BULL': return '#10B981'  // Green
    case 'BULL': return '#34D399'          // Light green
    case 'SIDEWAYS': return '#F59E0B'      // Yellow/Orange
    case 'BEAR': return '#F87171'          // Light red
    case 'STRONG_BEAR': return '#EF4444'   // Red
  }
}

/**
 * Get regime emoji for display
 */
export function getRegimeEmoji(regime: MarketRegime): string {
  switch (regime) {
    case 'STRONG_BULL': return '🚀'
    case 'BULL': return '📈'
    case 'SIDEWAYS': return '↔️'
    case 'BEAR': return '📉'
    case 'STRONG_BEAR': return '🔻'
  }
}
