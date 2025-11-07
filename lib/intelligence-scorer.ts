/**
 * Intelligence Scoring System
 * Combines analyst reports and news sentiment
 */

export interface AnalystReport {
  id: number
  symbol: string
  rating: 'STRONG_BUY' | 'BUY' | 'ACCUMULATE' | 'HOLD' | 'SELL' | 'STRONG_SELL'
  targetPrice: number
  currentPrice: number
  upside: number
  reportDate: Date
  source: string
  keyPoints?: string[]
}

export interface IntelligenceScore {
  score: number  // 0-30
  breakdown: {
    analystScore: number  // 0-15
    targetUpsideScore: number  // 0-10
    newsSentimentScore: number  // 0-5
  }
  reasoning: string[]
}

/**
 * Calculate analyst rating score (0-15 points)
 */
function calculateAnalystScore(report: AnalystReport | null): { score: number, reason: string } {
  if (!report) {
    return { score: 0, reason: 'No analyst coverage' }
  }

  const daysSinceReport = Math.floor((Date.now() - new Date(report.reportDate).getTime()) / (1000 * 60 * 60 * 24))
  
  // Recency factor (reports older than 90 days get penalized)
  let recencyMultiplier = 1.0
  if (daysSinceReport > 90) {
    recencyMultiplier = 0.5  // 50% penalty for old reports
  } else if (daysSinceReport > 30) {
    recencyMultiplier = 0.8  // 20% penalty for 1-3 month old reports
  }

  let baseScore = 0
  let ratingText = ''

  switch (report.rating) {
    case 'STRONG_BUY':
      baseScore = 15
      ratingText = 'Strong Buy'
      break
    case 'BUY':
      baseScore = 12
      ratingText = 'Buy'
      break
    case 'ACCUMULATE':
      baseScore = 9
      ratingText = 'Accumulate'
      break
    case 'HOLD':
      baseScore = 6
      ratingText = 'Hold'
      break
    case 'SELL':
    case 'STRONG_SELL':
      baseScore = 0
      ratingText = 'Sell'
      break
  }

  const finalScore = Math.round(baseScore * recencyMultiplier)
  const age = daysSinceReport < 30 ? 'Recent' : daysSinceReport < 90 ? `${daysSinceReport}d old` : 'Stale'
  
  return {
    score: finalScore,
    reason: `${report.source} says ${ratingText} (${age})`
  }
}

/**
 * Calculate target price upside score (0-10 points)
 */
function calculateUpsideScore(report: AnalystReport | null): { score: number, reason: string } {
  if (!report || !report.upside) {
    return { score: 0, reason: 'No target price available' }
  }

  const upside = report.upside

  if (upside >= 15) {
    return { score: 10, reason: `Strong upside: ${upside.toFixed(1)}% to ₹${report.targetPrice}` }
  } else if (upside >= 10) {
    return { score: 8, reason: `Good upside: ${upside.toFixed(1)}% to ₹${report.targetPrice}` }
  } else if (upside >= 5) {
    return { score: 5, reason: `Moderate upside: ${upside.toFixed(1)}% to ₹${report.targetPrice}` }
  } else if (upside >= 0) {
    return { score: 2, reason: `Limited upside: ${upside.toFixed(1)}%` }
  } else {
    return { score: 0, reason: `Target below current price (${upside.toFixed(1)}%)` }
  }
}

/**
 * Calculate news sentiment score (0-5 points)
 */
function calculateNewsSentimentScore(sentimentScore: number): { score: number, reason: string } {
  // sentimentScore is expected to be -1 to 1 (from sentiment analysis)
  
  if (sentimentScore >= 0.6) {
    return { score: 5, reason: 'Very bullish news sentiment' }
  } else if (sentimentScore >= 0.3) {
    return { score: 4, reason: 'Bullish news sentiment' }
  } else if (sentimentScore >= -0.3) {
    return { score: 3, reason: 'Neutral news sentiment' }
  } else if (sentimentScore >= -0.6) {
    return { score: 2, reason: 'Bearish news sentiment' }
  } else {
    return { score: 1, reason: 'Very bearish news sentiment' }
  }
}

/**
 * Calculate overall intelligence score
 */
export function calculateIntelligenceScore(
  analystReport: AnalystReport | null,
  newsSentiment: number = 0
): IntelligenceScore {
  const analystResult = calculateAnalystScore(analystReport)
  const upsideResult = calculateUpsideScore(analystReport)
  const sentimentResult = calculateNewsSentimentScore(newsSentiment)

  const totalScore = analystResult.score + upsideResult.score + sentimentResult.score

  const reasoning: string[] = []
  if (analystResult.score > 0) {
    reasoning.push(analystResult.reason)
  }
  if (upsideResult.score > 0) {
    reasoning.push(upsideResult.reason)
  }
  reasoning.push(sentimentResult.reason)

  return {
    score: totalScore,
    breakdown: {
      analystScore: analystResult.score,
      targetUpsideScore: upsideResult.score,
      newsSentimentScore: sentimentResult.score
    },
    reasoning
  }
}

/**
 * Convert database analyst report to IntelligenceScore format
 */
export function convertDbReportToAnalystReport(dbReport: any): AnalystReport | null {
  if (!dbReport || !dbReport.structuredData) {
    return null
  }

  const { structuredData } = dbReport
  
  // Map string ratings to enum
  let rating: AnalystReport['rating'] = 'HOLD'
  const ratingStr = (structuredData.rating || '').toUpperCase()
  
  if (ratingStr.includes('STRONG') && ratingStr.includes('BUY')) {
    rating = 'STRONG_BUY'
  } else if (ratingStr.includes('BUY')) {
    rating = 'BUY'
  } else if (ratingStr.includes('ACCUMULATE')) {
    rating = 'ACCUMULATE'
  } else if (ratingStr.includes('SELL')) {
    rating = 'STRONG_SELL'
  } else if (ratingStr.includes('HOLD')) {
    rating = 'HOLD'
  }

  return {
    id: dbReport.id,
    symbol: dbReport.symbol || structuredData.symbol || '',
    rating,
    targetPrice: structuredData.targetPrice || 0,
    currentPrice: structuredData.currentPrice || 0,
    upside: structuredData.upside || 0,
    reportDate: new Date(dbReport.reportDate || dbReport.createdAt),
    source: dbReport.source || 'Unknown',
    keyPoints: structuredData.keyPoints || []
  }
}

