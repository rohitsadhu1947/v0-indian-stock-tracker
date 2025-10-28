/**
 * Market Dashboard Utilities
 * 
 * Provides comprehensive market analysis including:
 * - Market overview (indices)
 * - Sector performance
 * - Market breadth
 * - Top movers
 * - Market sentiment
 * - Daily analysis
 */

export interface MarketIndex {
  name: string
  symbol: string
  current: number
  change: number
  changePercent: number
  open: number
  high: number
  low: number
  previousClose: number
}

export interface SectorPerformance {
  sector: string
  change: number
  topGainer: string
  topLoser: string
  stocksUp: number
  stocksDown: number
  volume: number
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
}

export interface MarketBreadth {
  advancers: number
  decliners: number
  unchanged: number
  advanceDeclineRatio: number
  stocksAt52WeekHigh: number
  stocksAt52WeekLow: number
  highLowRatio: number
  sentiment: 'STRONG_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONG_BEARISH'
}

export interface TopMover {
  symbol: string
  name: string
  current: number
  change: number
  changePercent: number
  volume: number
  sector: string
  reason?: string
}

export interface MarketSentiment {
  overall: 'VERY_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'VERY_BEARISH'
  score: number // 0-100
  factors: {
    technicals: number
    breadth: number
    volume: number
    news: number
    institutional: number
  }
  signals: string[]
  recommendation: string
}

export interface DailyMarketAnalysis {
  date: string
  openingAnalysis: string
  keyLevels: {
    niftySupport: number[]
    niftyResistance: number[]
    bankNiftySupport: number[]
    bankNiftyResistance: number[]
  }
  sectorsToWatch: string[]
  stocksToWatch: string[]
  tradingStrategy: string
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH'
  volatilityExpectation: 'LOW' | 'MODERATE' | 'HIGH'
  alerts: MarketAlert[]
}

export interface MarketAlert {
  type: 'INDEX' | 'SECTOR' | 'BREADTH' | 'INSTITUTIONAL' | 'NEWS' | 'VOLATILITY'
  severity: 'INFO' | 'WARNING' | 'CRITICAL'
  title: string
  message: string
  actionRequired?: string
  timestamp: Date
}

export interface FIIDIIData {
  date: string
  fiiEquity: {
    bought: number
    sold: number
    net: number
  }
  diiEquity: {
    bought: number
    sold: number
    net: number
  }
  trend: 'BUYING' | 'SELLING' | 'NEUTRAL'
  impact: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
}

export interface MarketDashboard {
  timestamp: Date
  indices: MarketIndex[]
  sectorPerformance: SectorPerformance[]
  marketBreadth: MarketBreadth
  topGainers: TopMover[]
  topLosers: TopMover[]
  mostActive: TopMover[]
  sentiment: MarketSentiment
  dailyAnalysis: DailyMarketAnalysis
  fiiDii?: FIIDIIData
  alerts: MarketAlert[]
}

/**
 * Calculate market breadth sentiment from advance/decline ratio
 */
export function calculateBreadthSentiment(breadth: MarketBreadth): MarketBreadth['sentiment'] {
  const ratio = breadth.advanceDeclineRatio
  const hlRatio = breadth.highLowRatio
  
  // Strong bullish: >2.5 A/D ratio and >2 H/L ratio
  if (ratio > 2.5 && hlRatio > 2) return 'STRONG_BULLISH'
  
  // Bullish: >1.5 A/D ratio and >1.5 H/L ratio
  if (ratio > 1.5 && hlRatio > 1.5) return 'BULLISH'
  
  // Bearish: <0.7 A/D ratio and <0.7 H/L ratio
  if (ratio < 0.7 && hlRatio < 0.7) return 'BEARISH'
  
  // Strong bearish: <0.4 A/D ratio and <0.5 H/L ratio
  if (ratio < 0.4 && hlRatio < 0.5) return 'STRONG_BEARISH'
  
  return 'NEUTRAL'
}

/**
 * Calculate overall market sentiment from multiple factors
 */
export function calculateMarketSentiment(
  indices: MarketIndex[],
  breadth: MarketBreadth,
  sectorPerformance: SectorPerformance[]
): MarketSentiment {
  const signals: string[] = []
  const factors = {
    technicals: 50,
    breadth: 50,
    volume: 50,
    news: 50,
    institutional: 50
  }
  
  // 1. Technical analysis (index movements)
  const nifty = indices.find(i => i.symbol === 'NIFTY50')
  if (nifty) {
    if (nifty.changePercent > 1.5) {
      factors.technicals = 80
      signals.push('📈 NIFTY up >1.5% - Strong bullish momentum')
    } else if (nifty.changePercent > 0.5) {
      factors.technicals = 65
      signals.push('✅ NIFTY positive - Mild bullish bias')
    } else if (nifty.changePercent < -1.5) {
      factors.technicals = 20
      signals.push('📉 NIFTY down >1.5% - Strong bearish pressure')
    } else if (nifty.changePercent < -0.5) {
      factors.technicals = 35
      signals.push('⚠️ NIFTY negative - Mild bearish bias')
    }
    
    // Check if near day high/low
    const dayRange = nifty.high - nifty.low
    const currentFromLow = nifty.current - nifty.low
    const percentFromLow = (currentFromLow / dayRange) * 100
    
    if (percentFromLow > 80) {
      signals.push('🚀 NIFTY near day high - Bullish strength')
      factors.technicals += 10
    } else if (percentFromLow < 20) {
      signals.push('⚠️ NIFTY near day low - Bearish pressure')
      factors.technicals -= 10
    }
  }
  
  // 2. Market breadth
  const adRatio = breadth.advanceDeclineRatio
  if (adRatio > 2) {
    factors.breadth = 80
    signals.push(`📊 Strong breadth: ${adRatio.toFixed(2)} A/D ratio`)
  } else if (adRatio > 1.5) {
    factors.breadth = 65
    signals.push(`✅ Positive breadth: ${adRatio.toFixed(2)} A/D ratio`)
  } else if (adRatio < 0.5) {
    factors.breadth = 20
    signals.push(`⚠️ Weak breadth: ${adRatio.toFixed(2)} A/D ratio`)
  } else if (adRatio < 0.7) {
    factors.breadth = 35
    signals.push(`📉 Negative breadth: ${adRatio.toFixed(2)} A/D ratio`)
  }
  
  // High/Low ratio
  if (breadth.highLowRatio > 2) {
    signals.push(`🎯 Strong momentum: ${breadth.stocksAt52WeekHigh} stocks at highs`)
    factors.breadth += 10
  } else if (breadth.highLowRatio < 0.5) {
    signals.push(`⚠️ Weak momentum: ${breadth.stocksAt52WeekLow} stocks at lows`)
    factors.breadth -= 10
  }
  
  // 3. Sector performance (volume as proxy for activity)
  const bullishSectors = sectorPerformance.filter(s => s.sentiment === 'BULLISH').length
  const bearishSectors = sectorPerformance.filter(s => s.sentiment === 'BEARISH').length
  const totalSectors = sectorPerformance.length
  
  if (totalSectors > 0) {
    const bullishPercent = (bullishSectors / totalSectors) * 100
    if (bullishPercent > 70) {
      factors.volume = 80
      signals.push(`🏆 ${bullishSectors}/${totalSectors} sectors bullish - Broad rally`)
    } else if (bullishPercent > 50) {
      factors.volume = 65
      signals.push(`✅ ${bullishSectors}/${totalSectors} sectors positive`)
    } else if (bullishPercent < 30) {
      factors.volume = 20
      signals.push(`⚠️ Only ${bullishSectors}/${totalSectors} sectors positive - Weakness`)
    }
  }
  
  // Calculate overall score
  const score = Math.round(
    (factors.technicals * 0.3) +
    (factors.breadth * 0.3) +
    (factors.volume * 0.2) +
    (factors.news * 0.1) +
    (factors.institutional * 0.1)
  )
  
  // Determine overall sentiment
  let overall: MarketSentiment['overall']
  let recommendation: string
  
  if (score >= 75) {
    overall = 'VERY_BULLISH'
    recommendation = 'Strong buy-side opportunity. Consider aggressive long positions with proper risk management.'
  } else if (score >= 60) {
    overall = 'BULLISH'
    recommendation = 'Positive market conditions. Focus on quality longs with momentum confirmation.'
  } else if (score >= 40) {
    overall = 'NEUTRAL'
    recommendation = 'Mixed signals. Wait for clear direction or focus on stock-specific opportunities.'
  } else if (score >= 25) {
    overall = 'BEARISH'
    recommendation = 'Cautious market. Reduce long exposure or consider defensive positions.'
  } else {
    overall = 'VERY_BEARISH'
    recommendation = 'High risk environment. Consider cash positions or hedging strategies.'
  }
  
  return {
    overall,
    score,
    factors,
    signals,
    recommendation
  }
}

/**
 * Generate daily market analysis based on current conditions
 */
export function generateDailyAnalysis(dashboard: Partial<MarketDashboard>): DailyMarketAnalysis {
  const now = new Date()
  const nifty = dashboard.indices?.find(i => i.symbol === 'NIFTY50')
  const bankNifty = dashboard.indices?.find(i => i.symbol === 'BANKNIFTY')
  
  // Calculate key levels using simple support/resistance logic
  const niftySupport = nifty ? [
    Math.round(nifty.current * 0.995), // 0.5% below
    Math.round(nifty.current * 0.99),  // 1% below
    Math.round(nifty.low)
  ] : []
  
  const niftyResistance = nifty ? [
    Math.round(nifty.current * 1.005), // 0.5% above
    Math.round(nifty.current * 1.01),  // 1% above
    Math.round(nifty.high)
  ] : []
  
  const bankNiftySupport = bankNifty ? [
    Math.round(bankNifty.current * 0.995),
    Math.round(bankNifty.current * 0.99),
    Math.round(bankNifty.low)
  ] : []
  
  const bankNiftyResistance = bankNifty ? [
    Math.round(bankNifty.current * 1.005),
    Math.round(bankNifty.current * 1.01),
    Math.round(bankNifty.high)
  ] : []
  
  // Identify sectors to watch (top performers)
  const sectorsToWatch = dashboard.sectorPerformance
    ?.sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 3)
    .map(s => s.sector) || []
  
  // Top stocks to watch (biggest movers with volume)
  const stocksToWatch = [
    ...(dashboard.topGainers?.slice(0, 3).map(s => s.symbol) || []),
    ...(dashboard.topLosers?.slice(0, 2).map(s => s.symbol) || [])
  ]
  
  // Generate opening analysis
  const sentiment = dashboard.sentiment?.overall || 'NEUTRAL'
  let openingAnalysis = ''
  
  if (sentiment === 'VERY_BULLISH') {
    openingAnalysis = '🚀 Market opens strong with broad-based buying. All sectors participate. Consider long positions on dips with momentum confirmation.'
  } else if (sentiment === 'BULLISH') {
    openingAnalysis = '📈 Market shows positive bias with selective buying. Focus on leading sectors and quality names.'
  } else if (sentiment === 'NEUTRAL') {
    openingAnalysis = '⚖️ Market lacks clear direction. Wait for decisive moves before committing. Stock-specific action likely.'
  } else if (sentiment === 'BEARISH') {
    openingAnalysis = '📉 Market faces selling pressure. Reduce exposure and focus on defensive sectors or cash.'
  } else {
    openingAnalysis = '🔴 Market under significant pressure. High caution advised. Consider hedging or staying aside.'
  }
  
  // Trading strategy based on sentiment
  let tradingStrategy = ''
  if (sentiment === 'VERY_BULLISH' || sentiment === 'BULLISH') {
    tradingStrategy = 'BUY-THE-DIP: Look for pullbacks to support levels in strong stocks. Trail stop-losses. Book partials at resistance.'
  } else if (sentiment === 'NEUTRAL') {
    tradingStrategy = 'RANGE-BOUND: Trade support-to-resistance moves. Tight stops. Quick profits. Avoid overnight risk.'
  } else {
    tradingStrategy = 'DEFENSIVE: Reduce longs. Consider shorts on weak stocks at resistance. Preserve capital. Wait for clarity.'
  }
  
  // Assess risk level
  const volatilityExpectation: DailyMarketAnalysis['volatilityExpectation'] = 
    dashboard.sentiment?.score && (dashboard.sentiment.score > 70 || dashboard.sentiment.score < 30) ? 'HIGH' : 'MODERATE'
  
  const riskLevel: DailyMarketAnalysis['riskLevel'] = 
    volatilityExpectation === 'HIGH' ? 'HIGH' : 
    sentiment === 'NEUTRAL' ? 'MODERATE' : 'LOW'
  
  // Generate alerts
  const alerts: MarketAlert[] = []
  
  if (dashboard.marketBreadth) {
    const breadth = dashboard.marketBreadth
    if (breadth.advanceDeclineRatio > 3) {
      alerts.push({
        type: 'BREADTH',
        severity: 'INFO',
        title: 'Exceptional Market Breadth',
        message: `Strong bullish breadth with ${breadth.advanceDeclineRatio.toFixed(2)} A/D ratio. Broad participation indicates healthy rally.`,
        actionRequired: 'Consider adding long exposure',
        timestamp: now
      })
    } else if (breadth.advanceDeclineRatio < 0.3) {
      alerts.push({
        type: 'BREADTH',
        severity: 'WARNING',
        title: 'Weak Market Breadth',
        message: `Poor breadth with ${breadth.advanceDeclineRatio.toFixed(2)} A/D ratio. Selling pressure is broad-based.`,
        actionRequired: 'Reduce long exposure, protect positions',
        timestamp: now
      })
    }
  }
  
  if (nifty) {
    if (nifty.changePercent > 2) {
      alerts.push({
        type: 'INDEX',
        severity: 'INFO',
        title: 'NIFTY Rallies >2%',
        message: `NIFTY at ${nifty.current.toFixed(2)} (+${nifty.changePercent.toFixed(2)}%). Strong bullish momentum.`,
        actionRequired: 'Trail stops on longs, book partials near resistance',
        timestamp: now
      })
    } else if (nifty.changePercent < -2) {
      alerts.push({
        type: 'INDEX',
        severity: 'WARNING',
        title: 'NIFTY Falls >2%',
        message: `NIFTY at ${nifty.current.toFixed(2)} (${nifty.changePercent.toFixed(2)}%). Significant weakness.`,
        actionRequired: 'Review all long positions, tighten stops',
        timestamp: now
      })
    }
  }
  
  return {
    date: now.toISOString().split('T')[0],
    openingAnalysis,
    keyLevels: {
      niftySupport,
      niftyResistance,
      bankNiftySupport,
      bankNiftyResistance
    },
    sectorsToWatch,
    stocksToWatch,
    tradingStrategy,
    riskLevel,
    volatilityExpectation,
    alerts
  }
}

/**
 * Format large numbers for display (e.g., 1.5Cr, 250L)
 */
export function formatVolume(volume: number): string {
  if (volume >= 10000000) { // 1 Crore
    return `${(volume / 10000000).toFixed(2)}Cr`
  } else if (volume >= 100000) { // 1 Lakh
    return `${(volume / 100000).toFixed(2)}L`
  } else if (volume >= 1000) {
    return `${(volume / 1000).toFixed(2)}K`
  }
  return volume.toString()
}

/**
 * Get color for sentiment
 */
export function getSentimentColor(sentiment: string): string {
  if (sentiment.includes('BULLISH') || sentiment.includes('BUYING')) return '#10b981'
  if (sentiment.includes('BEARISH') || sentiment.includes('SELLING')) return '#ef4444'
  return '#6b7280'
}

/**
 * Get emoji for sentiment
 */
export function getSentimentEmoji(sentiment: string): string {
  if (sentiment === 'VERY_BULLISH' || sentiment === 'STRONG_BULLISH') return '🚀'
  if (sentiment === 'BULLISH') return '📈'
  if (sentiment === 'NEUTRAL') return '⚖️'
  if (sentiment === 'BEARISH') return '📉'
  if (sentiment === 'VERY_BEARISH' || sentiment === 'STRONG_BEARISH') return '🔴'
  return '❓'
}

