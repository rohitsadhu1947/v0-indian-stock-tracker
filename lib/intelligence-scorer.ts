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
    analystScore: number  // 0-10 (reduced - can be stale)
    targetUpsideScore: number  // 0-8
    newsSentimentScore: number  // 0-12 (increased - real-time data!)
  }
  reasoning: string[]
  /** False when there is no analyst report AND no news — the score is then
   *  meaningless and callers should exclude it rather than treat it as a
   *  low-but-real reading. */
  available: boolean
  /** Which inputs actually produced a score. */
  inputs: { analystReport: boolean; news: boolean }
}

/**
 * Calculate analyst rating score (0-10 points)
 * NOTE: Reduced weight since analyst reports can become stale quickly
 * News sentiment (real-time) now carries more weight
 */
function calculateAnalystScore(report: AnalystReport | null): { score: number, reason: string } {
  if (!report) {
    return { score: 0, reason: 'No analyst coverage' }
  }

  const daysSinceReport = Math.floor((Date.now() - new Date(report.reportDate).getTime()) / (1000 * 60 * 60 * 24))
  
  // Aggressive recency penalties - market conditions change fast!
  let recencyMultiplier = 1.0
  let ageLabel = 'Recent'
  
  if (daysSinceReport > 90) {
    recencyMultiplier = 0.25  // 75% penalty for very old reports (was 50%)
    ageLabel = '⚠️ Stale'
  } else if (daysSinceReport > 60) {
    recencyMultiplier = 0.4   // 60% penalty
    ageLabel = `${daysSinceReport}d old`
  } else if (daysSinceReport > 30) {
    recencyMultiplier = 0.6   // 40% penalty (was 20%)
    ageLabel = `${daysSinceReport}d old`
  } else if (daysSinceReport > 14) {
    recencyMultiplier = 0.85  // 15% penalty for 2-4 week old
    ageLabel = `${daysSinceReport}d old`
  }

  let baseScore = 0
  let ratingText = ''

  switch (report.rating) {
    case 'STRONG_BUY':
      baseScore = 10
      ratingText = 'Strong Buy'
      break
    case 'BUY':
      baseScore = 8
      ratingText = 'Buy'
      break
    case 'ACCUMULATE':
      baseScore = 6
      ratingText = 'Accumulate'
      break
    case 'HOLD':
      baseScore = 4
      ratingText = 'Hold'
      break
    case 'SELL':
    case 'STRONG_SELL':
      baseScore = 0
      ratingText = 'Sell'
      break
  }

  const finalScore = Math.round(baseScore * recencyMultiplier)
  
  return {
    score: finalScore,
    reason: `${report.source} says ${ratingText} (${ageLabel})`
  }
}

/**
 * Calculate target price upside score (0-8 points)
 * NOTE: Slightly reduced since target prices from old reports may be outdated
 */
function calculateUpsideScore(report: AnalystReport | null): { score: number, reason: string } {
  if (!report || !report.upside) {
    return { score: 0, reason: 'No target price available' }
  }

  const upside = report.upside

  if (upside >= 15) {
    return { score: 8, reason: `Strong upside: ${upside.toFixed(1)}% to ₹${report.targetPrice}` }
  } else if (upside >= 10) {
    return { score: 6, reason: `Good upside: ${upside.toFixed(1)}% to ₹${report.targetPrice}` }
  } else if (upside >= 5) {
    return { score: 4, reason: `Moderate upside: ${upside.toFixed(1)}% to ₹${report.targetPrice}` }
  } else if (upside >= 0) {
    return { score: 2, reason: `Limited upside: ${upside.toFixed(1)}%` }
  } else {
    return { score: 0, reason: `Target below current price (${upside.toFixed(1)}%)` }
  }
}

/**
 * Calculate news sentiment score (0-12 points)
 * NOTE: Increased weight! News sentiment is REAL-TIME data
 * Unlike analyst reports which can be months old
 */
function calculateNewsSentimentScore(sentimentScore: number): { score: number, reason: string } {
  // sentimentScore is expected to be -1 to 1 (from sentiment analysis)
  
  if (sentimentScore >= 0.6) {
    return { score: 12, reason: '🟢 Very bullish news sentiment' }
  } else if (sentimentScore >= 0.3) {
    return { score: 10, reason: '🟢 Bullish news sentiment' }
  } else if (sentimentScore >= 0.1) {
    return { score: 8, reason: '🟡 Slightly bullish news' }
  } else if (sentimentScore >= -0.1) {
    return { score: 6, reason: '⚪ Neutral news sentiment' }
  } else if (sentimentScore >= -0.3) {
    return { score: 4, reason: '🟠 Slightly bearish news' }
  } else if (sentimentScore >= -0.6) {
    return { score: 2, reason: '🔴 Bearish news sentiment' }
  } else {
    return { score: 0, reason: '🔴 Very bearish news sentiment' }
  }
}

/**
 * Calculate overall intelligence score
 */
export function calculateIntelligenceScore(
  analystReport: AnalystReport | null,
  newsSentiment: number = 0,
  options: { newsAvailable?: boolean } = {}
): IntelligenceScore {
  // Default true keeps older callers working; master-scorer passes the real flag.
  const newsAvailable = options.newsAvailable !== false

  const analystResult = calculateAnalystScore(analystReport)
  const upsideResult = calculateUpsideScore(analystReport)

  // No news at all is NOT the same as neutral news: neutral used to award 6/12
  // (5/25 after scaling), which is why every stock showed "intelligence 5".
  const sentimentResult = newsAvailable
    ? calculateNewsSentimentScore(newsSentiment)
    : { score: 0, reason: '⚪ No news found for this stock' }

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
    reasoning,
    available: analystReport !== null || newsAvailable,
    inputs: { analystReport: analystReport !== null, news: newsAvailable },
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

