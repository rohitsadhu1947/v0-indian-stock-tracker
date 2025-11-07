/**
 * 💰 MOMENTUM SWING SCANNER
 * 
 * This scanner identifies high-probability swing trade setups for 1-2% gains.
 * Target holding period: 1-7 days
 * 
 * EDGE: Systematic momentum + volume confirmation + clean technical structure
 */

export interface MomentumSignal {
  symbol: string
  exchange: string
  instrumentToken: string
  
  // Current metrics
  current: number
  change: number
  changePercent: number
  volume: number
  avgVolume: number
  volumeRatio: number // volume / avgVolume
  
  // Technical structure
  sma5: number
  sma10: number
  sma20: number
  rsi: number
  atr: number
  
  // Momentum score (0-100)
  momentumScore: number
  
  // Trading setup
  signal: 'STRONG_BUY' | 'BUY' | 'WATCH' | 'SKIP'
  confidence: number // 0-100
  
  // Entry/Exit levels
  entryPrice: number
  stopLoss: number
  target1: number // 1.5% target
  target2: number // 2.5% target (stretch)
  
  // Position sizing (for ₹3L capital)
  positionSize: number // Quantity to buy
  capitalRequired: number // Total investment
  riskAmount: number // Max loss if SL hit
  
  // Reasoning
  reasons: string[]
  warnings: string[]
  
  // Timeframe
  timeframe: string // "1-3 days", "3-7 days", etc.
  
  // Sector info
  sector: string
}

export interface MomentumScanResult {
  timestamp: Date
  totalScanned: number
  signalsFound: number
  strongBuyCount: number
  buyCount: number
  
  signals: MomentumSignal[]
  
  // Market context
  marketSentiment: 'STRONG' | 'MODERATE' | 'WEAK' | 'CHOPPY'
  niftyTrend: 'UP' | 'DOWN' | 'SIDEWAYS'
  
  // Portfolio suggestions
  recommendedCapitalAllocation: number
  maxPositions: number
}

/**
 * Calculate Simple Moving Average
 */
function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1]
  const slice = prices.slice(-period)
  return slice.reduce((sum, p) => sum + p, 0) / period
}

/**
 * Calculate RSI
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
 * Calculate ATR (Average True Range)
 */
function calculateATR(candles: any[], period: number = 14): number {
  if (candles.length < period) return 0
  
  const trueRanges = []
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high
    const low = candles[i].low
    const prevClose = candles[i - 1].close
    
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    )
    trueRanges.push(tr)
  }
  
  const recentTR = trueRanges.slice(-period)
  return recentTR.reduce((sum, tr) => sum + tr, 0) / period
}

/**
 * Check if stock is in clean uptrend
 */
function isInUptrend(sma5: number, sma10: number, sma20: number, current: number): boolean {
  // Clean uptrend: SMA5 > SMA10 > SMA20 and price > SMA5
  return current > sma5 && sma5 > sma10 && sma10 > sma20
}

/**
 * Check if there's momentum (recent strength)
 */
function hasMomentum(prices: number[], period: number = 5): boolean {
  if (prices.length < period) return false
  
  const recentPrices = prices.slice(-period)
  let upmoves = 0
  
  for (let i = 1; i < recentPrices.length; i++) {
    if (recentPrices[i] > recentPrices[i - 1]) upmoves++
  }
  
  // At least 60% up days in recent period
  return upmoves / (period - 1) >= 0.6
}

/**
 * Calculate momentum score (0-100)
 */
function calculateMomentumScore(
  current: number,
  sma5: number,
  sma10: number,
  sma20: number,
  rsi: number,
  volumeRatio: number,
  changePercent: number
): number {
  let score = 0
  
  // 1. Trend alignment (30 points)
  if (current > sma5 && sma5 > sma10 && sma10 > sma20) {
    score += 30
    
    // Bonus for strong separation
    const separation = ((sma5 - sma20) / sma20) * 100
    if (separation > 2) score += 5
    if (separation > 3) score += 5
  }
  
  // 2. RSI momentum (20 points)
  if (rsi > 50 && rsi < 70) score += 20 // Sweet spot
  else if (rsi >= 70 && rsi < 75) score += 15 // Overbought but still okay
  else if (rsi >= 45 && rsi <= 50) score += 10 // Building momentum
  
  // 3. Volume confirmation (25 points)
  if (volumeRatio > 1.5) score += 25
  else if (volumeRatio > 1.2) score += 18
  else if (volumeRatio > 1.0) score += 10
  else if (volumeRatio > 0.8) score += 5
  
  // 4. Recent price action (15 points)
  if (changePercent > 1 && changePercent < 5) score += 15
  else if (changePercent > 0.5 && changePercent <= 1) score += 10
  else if (changePercent > 0 && changePercent <= 0.5) score += 5
  
  // 5. Price position relative to SMA5 (10 points)
  const distanceFromSMA5 = ((current - sma5) / sma5) * 100
  if (distanceFromSMA5 > 0 && distanceFromSMA5 < 2) score += 10 // Close to support
  else if (distanceFromSMA5 >= 2 && distanceFromSMA5 < 4) score += 5
  
  return Math.min(100, score)
}

/**
 * Determine signal strength
 */
function determineSignal(momentumScore: number, rsi: number, volumeRatio: number): {
  signal: 'STRONG_BUY' | 'BUY' | 'WATCH' | 'SKIP'
  confidence: number
} {
  // STRONG_BUY: High score + volume + not overbought
  if (momentumScore >= 75 && rsi < 70 && volumeRatio > 1.3) {
    return { signal: 'STRONG_BUY', confidence: momentumScore }
  }
  
  // BUY: Good score + decent volume
  if (momentumScore >= 60 && rsi < 75 && volumeRatio > 1.0) {
    return { signal: 'BUY', confidence: momentumScore }
  }
  
  // WATCH: Decent score but missing some criteria
  if (momentumScore >= 45) {
    return { signal: 'WATCH', confidence: momentumScore }
  }
  
  return { signal: 'SKIP', confidence: momentumScore }
}

/**
 * Calculate entry and exit levels
 */
function calculateLevels(
  current: number,
  atr: number,
  sma5: number
): {
  entryPrice: number
  stopLoss: number
  target1: number
  target2: number
} {
  // Entry: Current price (market order) or wait for pullback to SMA5
  const entryPrice = current
  
  // Stop-loss: Below SMA5 OR 1.5 ATR, whichever is tighter
  const atrStop = current - (1.5 * atr)
  const smaStop = sma5 * 0.98 // 2% below SMA5
  const stopLoss = Math.max(atrStop, smaStop)
  
  // Targets: 1.5% and 2.5%
  const target1 = entryPrice * 1.015 // 1.5%
  const target2 = entryPrice * 1.025 // 2.5%
  
  return { entryPrice, stopLoss, target1, target2 }
}

/**
 * Calculate position size based on capital and risk
 */
function calculatePositionSize(
  capital: number,
  entryPrice: number,
  stopLoss: number,
  riskPercent: number = 1.5 // Max 1.5% risk per trade
): {
  positionSize: number
  capitalRequired: number
  riskAmount: number
} {
  // Max risk amount
  const riskAmount = capital * (riskPercent / 100)
  
  // Risk per share
  const riskPerShare = entryPrice - stopLoss
  
  // Position size
  let positionSize = Math.floor(riskAmount / riskPerShare)
  
  // Capital required
  let capitalRequired = positionSize * entryPrice
  
  // Don't use more than 33% of capital per trade (diversification)
  const maxCapitalPerTrade = capital * 0.33
  if (capitalRequired > maxCapitalPerTrade) {
    capitalRequired = maxCapitalPerTrade
    positionSize = Math.floor(capitalRequired / entryPrice)
  }
  
  return {
    positionSize,
    capitalRequired,
    riskAmount: positionSize * (entryPrice - stopLoss)
  }
}

/**
 * Generate reasons for the signal
 */
function generateReasons(
  momentumScore: number,
  rsi: number,
  volumeRatio: number,
  changePercent: number,
  current: number,
  sma5: number,
  sma10: number,
  sma20: number
): string[] {
  const reasons: string[] = []
  
  if (current > sma5 && sma5 > sma10 && sma10 > sma20) {
    reasons.push('✅ Clean uptrend (SMA alignment)')
  }
  
  if (volumeRatio > 1.5) {
    reasons.push(`✅ Strong volume (${volumeRatio.toFixed(1)}x average)`)
  } else if (volumeRatio > 1.2) {
    reasons.push(`✅ Above-average volume (${volumeRatio.toFixed(1)}x)`)
  }
  
  if (rsi > 50 && rsi < 70) {
    reasons.push(`✅ Healthy RSI (${rsi.toFixed(0)}) - room to run`)
  }
  
  if (changePercent > 1) {
    reasons.push(`✅ Positive momentum (+${changePercent.toFixed(1)}%)`)
  }
  
  if (momentumScore >= 75) {
    reasons.push('✅ High momentum score - strong setup')
  }
  
  const distanceFromSMA5 = ((current - sma5) / sma5) * 100
  if (distanceFromSMA5 < 2) {
    reasons.push('✅ Close to SMA5 support')
  }
  
  return reasons
}

/**
 * Generate warnings
 */
function generateWarnings(
  rsi: number,
  volumeRatio: number,
  changePercent: number,
  current: number,
  sma5: number
): string[] {
  const warnings: string[] = []
  
  if (rsi >= 75) {
    warnings.push('⚠️ Overbought RSI - be cautious')
  }
  
  if (volumeRatio < 0.8) {
    warnings.push('⚠️ Below-average volume - weak conviction')
  }
  
  if (changePercent > 5) {
    warnings.push('⚠️ Large move today - may need consolidation')
  }
  
  if (changePercent < -1) {
    warnings.push('⚠️ Negative day - wait for confirmation')
  }
  
  const distanceFromSMA5 = ((current - sma5) / sma5) * 100
  if (distanceFromSMA5 > 5) {
    warnings.push('⚠️ Extended from SMA5 - wait for pullback')
  }
  
  return warnings
}

/**
 * Estimate timeframe based on momentum and volatility
 */
function estimateTimeframe(momentumScore: number, atr: number, current: number): string {
  const atrPercent = (atr / current) * 100
  
  // High momentum + high volatility = quick trade
  if (momentumScore >= 75 && atrPercent > 2) {
    return '1-3 days (quick scalp)'
  }
  
  // Strong momentum + moderate volatility = short swing
  if (momentumScore >= 65) {
    return '3-5 days (short swing)'
  }
  
  // Decent momentum = regular swing
  if (momentumScore >= 50) {
    return '5-7 days (swing trade)'
  }
  
  return '7-10 days (position)'
}

/**
 * Main momentum scanner function
 */
export async function scanForMomentumSignals(
  stocksData: Array<{
    symbol: string
    exchange: string
    instrumentToken: string
    current: number
    change: number
    changePercent: number
    volume: number
    avgVolume: number
    candles: any[] // Historical candles (at least 30 days)
    sector?: string
  }>,
  capital: number = 300000, // Default ₹3L
  options: {
    minPrice?: number
    maxPrice?: number
    minVolume?: number
    maxPositions?: number
    customStocks?: string[] // Add custom stocks parameter
  } = {}
): Promise<MomentumScanResult> {
  const {
    minPrice = 50,
    maxPrice = 5000,
    minVolume = 100000,
    maxPositions = 5,
    customStocks = [] // Default to empty array
  } = options
  
  const signals: MomentumSignal[] = []
  let strongBuyCount = 0
  let buyCount = 0
  
  console.log(`🔍 Scanning ${stocksData.length} stocks for momentum signals...`)
  
  let filteredByPrice = 0
  let filteredByVolume = 0
  let filteredByCandles = 0
  let filteredByUptrend = 0
  let filteredByMomentum = 0
  let filteredByScore = 0
  
  for (const stock of stocksData) {
    try {
      // Check if this is a custom stock (user manually requested)
      const isCustomStock = customStocks.includes(stock.symbol)
      
      // Basic filters
      if (stock.current < minPrice || stock.current > maxPrice) {
        filteredByPrice++
        // Skip custom stocks if price is too extreme (< ₹5 or > ₹20,000)
        if (!isCustomStock || stock.current < 5 || stock.current > 20000) {
          continue
        }
      }
      if (stock.volume < minVolume) {
        filteredByVolume++
        if (!isCustomStock) continue // Force analyze custom stocks even with low volume
      }
      if (stock.candles.length < 30) {
        filteredByCandles++
        if (!isCustomStock) continue // Force analyze custom stocks even with limited data
      }
      
      // Calculate technical indicators
      const closes = stock.candles.map((c: any) => c.close)
      const sma5 = calculateSMA(closes, 5)
      const sma10 = calculateSMA(closes, 10)
      const sma20 = calculateSMA(closes, 20)
      const rsi = calculateRSI(closes, 14)
      const atr = calculateATR(stock.candles, 14)
      const volumeRatio = stock.avgVolume > 0 ? stock.volume / stock.avgVolume : 1
      
      // Check for uptrend and momentum (skip for custom stocks - "Force Analysis")
      if (!isCustomStock) {
        if (!isInUptrend(sma5, sma10, sma20, stock.current)) {
          filteredByUptrend++
          continue
        }
        if (!hasMomentum(closes, 5)) {
          filteredByMomentum++
          continue
        }
      } else {
        // Custom stock: Check but don't filter, just track
        if (!isInUptrend(sma5, sma10, sma20, stock.current)) {
          filteredByUptrend++
          console.log(`🔍 Custom stock ${stock.symbol}: Not in uptrend (force analyzing anyway)`)
        }
        if (!hasMomentum(closes, 5)) {
          filteredByMomentum++
          console.log(`🔍 Custom stock ${stock.symbol}: No momentum detected (force analyzing anyway)`)
        }
      }
      
      // Calculate momentum score
      const momentumScore = calculateMomentumScore(
        stock.current,
        sma5,
        sma10,
        sma20,
        rsi,
        volumeRatio,
        stock.changePercent
      )
      
      // Determine signal
      const { signal, confidence } = determineSignal(momentumScore, rsi, volumeRatio)
      
      // Skip low-quality signals (but not for custom stocks - always show them)
      if (signal === 'SKIP' && !isCustomStock) {
        filteredByScore++
        continue
      } else if (signal === 'SKIP' && isCustomStock) {
        filteredByScore++
        console.log(`🔍 Custom stock ${stock.symbol}: Low quality signal (force analyzing anyway)`)
      }
      
      // Calculate levels
      const { entryPrice, stopLoss, target1, target2 } = calculateLevels(
        stock.current,
        atr,
        sma5
      )
      
      // Calculate position size
      const { positionSize, capitalRequired, riskAmount } = calculatePositionSize(
        capital,
        entryPrice,
        stopLoss,
        1.5 // 1.5% max risk per trade
      )
      
      // Generate reasons and warnings
      const reasons = generateReasons(
        momentumScore,
        rsi,
        volumeRatio,
        stock.changePercent,
        stock.current,
        sma5,
        sma10,
        sma20
      )
      
      const warnings = generateWarnings(
        rsi,
        volumeRatio,
        stock.changePercent,
        stock.current,
        sma5
      )
      
      // Estimate timeframe
      const timeframe = estimateTimeframe(momentumScore, atr, stock.current)
      
      // Create signal
      const momentumSignal: MomentumSignal = {
        symbol: stock.symbol,
        exchange: stock.exchange,
        instrumentToken: stock.instrumentToken,
        current: stock.current,
        change: stock.change,
        changePercent: stock.changePercent,
        volume: stock.volume,
        avgVolume: stock.avgVolume,
        volumeRatio,
        sma5,
        sma10,
        sma20,
        rsi,
        atr,
        momentumScore,
        signal,
        confidence,
        entryPrice,
        stopLoss,
        target1,
        target2,
        positionSize,
        capitalRequired,
        riskAmount,
        reasons,
        warnings,
        timeframe,
        sector: stock.sector || 'Unknown'
      }
      
      signals.push(momentumSignal)
      
      if (signal === 'STRONG_BUY') strongBuyCount++
      if (signal === 'BUY') buyCount++
      
    } catch (error) {
      console.error(`Error scanning ${stock.symbol}:`, error)
    }
  }
  
  // Log filtering stats
  console.log(`📊 Filtering Summary:`)
  console.log(`   Price filter: ${filteredByPrice} stocks`)
  console.log(`   Volume filter: ${filteredByVolume} stocks`)
  console.log(`   Candles filter: ${filteredByCandles} stocks`)
  console.log(`   Uptrend filter: ${filteredByUptrend} stocks`)
  console.log(`   Momentum filter: ${filteredByMomentum} stocks`)
  console.log(`   Score filter: ${filteredByScore} stocks`)
  console.log(`   ✅ Passed all filters: ${signals.length} stocks`)
  
  // Sort by momentum score (highest first)
  signals.sort((a, b) => b.momentumScore - a.momentumScore)
  
  // Limit to top signals
  const topSignals = signals.slice(0, maxPositions * 3) // Show 3x max positions
  
  // Calculate market context (simplified)
  const avgMomentum = topSignals.length > 0
    ? topSignals.reduce((sum, s) => sum + s.momentumScore, 0) / topSignals.length
    : 0
  
  const marketSentiment: 'STRONG' | 'MODERATE' | 'WEAK' | 'CHOPPY' =
    avgMomentum >= 70 ? 'STRONG' :
    avgMomentum >= 55 ? 'MODERATE' :
    avgMomentum >= 40 ? 'WEAK' : 'CHOPPY'
  
  // Recommend capital allocation based on market strength
  const recommendedCapitalAllocation =
    marketSentiment === 'STRONG' ? 0.75 : // Use 75% of capital
    marketSentiment === 'MODERATE' ? 0.5 : // Use 50%
    marketSentiment === 'WEAK' ? 0.25 : 0.15 // Be cautious
  
  const result: MomentumScanResult = {
    timestamp: new Date(),
    totalScanned: stocksData.length,
    signalsFound: topSignals.length,
    strongBuyCount,
    buyCount,
    signals: topSignals,
    marketSentiment,
    niftyTrend: 'UP', // Will calculate this properly later
    recommendedCapitalAllocation,
    maxPositions
  }
  
  console.log(`✅ Found ${topSignals.length} momentum signals (${strongBuyCount} STRONG_BUY, ${buyCount} BUY)`)
  
  return result
}

/**
 * Get NIFTY 500 stock list (subset for now, will expand)
 */
export const NIFTY_500_SYMBOLS = [
  // Top liquid stocks first
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'HINDUNILVR', 'ITC', 'SBIN',
  'BHARTIARTL', 'KOTAKBANK', 'LT', 'AXISBANK', 'ASIANPAINT', 'MARUTI', 'TITAN',
  'SUNPHARMA', 'ULTRACEMCO', 'NESTLEIND', 'BAJFINANCE', 'HCLTECH', 'WIPRO', 'ADANIPORTS',
  'TATASTEEL', 'TATAMOTORS', 'NTPC', 'POWERGRID', 'M&M', 'JSWSTEEL', 'INDUSINDBK',
  'TECHM', 'HINDALCO', 'ONGC', 'GRASIM', 'BRITANNIA', 'CIPLA', 'DRREDDY', 'DIVISLAB',
  'BAJAJFINSV', 'EICHERMOT', 'HEROMOTOCO', 'SHREECEM', 'UPL', 'COALINDIA', 'BPCL',
  'BAJAJ-AUTO', 'TATACONSUM', 'APOLLOHOSP', 'HDFCLIFE', 'SBILIFE', 'PIDILITIND',
  'ADANIENT', 'DABUR', 'HAVELLS', 'MCDOWELL-N', 'SIEMENS', 'AMBUJACEM', 'DLF',
  'GODREJCP', 'VEDL', 'IOC', 'MARICO', 'GAIL', 'ICICIPRULI', 'BOSCHLTD', 'BERGEPAINT',
  'INDIGO', 'BANKBARODA', 'PNB', 'SAIL', 'NMDC', 'JINDALSTEL', 'HINDZINC', 'ACC',
  'BEL', 'CANBK', 'BIOCON', 'LUPIN', 'TORNTPHARM', 'COLPAL', 'PETRONET', 'PFC',
  'RECLTD', 'IDEA', 'ASHOKLEY', 'MOTHERSON', 'VOLTAS', 'ESCORTS', 'TVSMOTOR',
  // Add more as needed...
]

