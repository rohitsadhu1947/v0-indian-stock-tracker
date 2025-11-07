/**
 * Master Scoring System
 * Combines Technical (40%) + Fundamental (30%) + Intelligence (30%)
 * to generate high-conviction trading signals
 */

import type { MomentumSignal } from './momentum-scanner'
import { getFundamentals, calculateFundamentalScore, type FundamentalData, type FundamentalScore } from './fundamental-api'
import { calculateIntelligenceScore, convertDbReportToAnalystReport, type AnalystReport, type IntelligenceScore } from './intelligence-scorer'

export interface MasterScore {
  symbol: string
  exchange: string  // NSE/BSE
  totalScore: number  // 0-100
  tier: 'HIGH_CONVICTION' | 'MODERATE' | 'WATCH' | 'SKIP'
  
  technical: {
    score: number  // 0-40
    breakdown: {
      momentum: number  // 0-15 (RSI, MACD)
      breakout: number  // 0-10 (price action)
      volume: number    // 0-10 (volume surge)
      trend: number     // 0-5 (trend strength)
    }
    signals: string[]
  }
  
  fundamental: FundamentalScore
  
  intelligence: IntelligenceScore
  
  tradePlan: {
    entry: number
    stopLoss: number
    target1: number
    target2: number
    positionSize: number
    capitalRequired: number
    riskAmount: number
    riskPercent: number
  }
  
  reasoning: string[]  // Top 3-5 reasons why this trade
  timestamp: Date
}

/**
 * Calculate technical score from momentum signal (0-40 points)
 * 
 * The momentum scanner already does complex analysis and assigns a 0-100 momentum score.
 * We scale that to 0-40 for the master score.
 */
function calculateTechnicalScore(signal: MomentumSignal): {
  score: number
  breakdown: MasterScore['technical']['breakdown']
  signals: string[]
} {
  const signals: string[] = []
  
  // PRIMARY: Use the momentum scanner's overall score (0-100) and scale to 0-40
  const rawScore = signal.momentumScore || 0
  const technicalScore = Math.round((rawScore / 100) * 40)
  
  // Breakdown estimation (for display purposes)
  const momentumScore = Math.round(technicalScore * 0.375) // 37.5% of 40 = 15
  const breakoutScore = Math.round(technicalScore * 0.25)  // 25% of 40 = 10
  const volumeScore = Math.round(technicalScore * 0.25)    // 25% of 40 = 10
  const trendScore = Math.round(technicalScore * 0.125)    // 12.5% of 40 = 5
  
  // Add human-readable signals based on the momentum signal data
  signals.push(`${signal.signal} signal (${rawScore.toFixed(0)}/100 momentum)`)
  
  if (signal.rsi) {
    if (signal.rsi >= 60 && signal.rsi <= 70) {
      signals.push(`RSI ${signal.rsi.toFixed(1)} - bullish momentum`)
    } else if (signal.rsi > 70) {
      signals.push(`RSI ${signal.rsi.toFixed(1)} - strong (overbought)`)
    } else if (signal.rsi >= 50) {
      signals.push(`RSI ${signal.rsi.toFixed(1)} - building`)
    }
  }
  
  if (signal.volumeRatio && signal.volumeRatio > 1.5) {
    signals.push(`Volume ${signal.volumeRatio.toFixed(1)}x average - strong participation`)
  }
  
  if (signal.changePercent > 3) {
    signals.push(`Price up ${signal.changePercent.toFixed(1)}% - strong move`)
  }

  return {
    score: technicalScore,
    breakdown: {
      momentum: momentumScore,
      breakout: breakoutScore,
      volume: volumeScore,
      trend: trendScore
    },
    signals
  }
}

/**
 * Generate trade plan with stop-loss and targets
 */
function generateTradePlan(
  signal: MomentumSignal,
  capitalAvailable: number,
  maxRiskPercent: number = 2.0  // Max 2% risk per trade
): MasterScore['tradePlan'] {
  const entry = signal.current  // Use 'current' field (not 'currentPrice')
  
  // Determine if this is a BUY or SELL signal
  const isBuy = !signal.signal || signal.signal === 'BUY' || (signal.changePercent !== undefined && signal.changePercent >= 0)
  
  // Use provided values or calculate defaults based on BUY/SELL direction
  const stopLoss = signal.stopLoss || (
    isBuy 
      ? entry * 0.975   // 2.5% below for BUY
      : entry * 1.025   // 2.5% above for SELL
  )
  
  const target1 = signal.target1 || (
    isBuy
      ? entry * 1.04    // 4% above for BUY
      : entry * 0.96    // 4% below for SELL
  )
  
  const target2 = signal.target2 || (
    isBuy
      ? entry * 1.08    // 8% above for BUY
      : entry * 0.92    // 8% below for SELL
  )

  // Calculate position size based on risk
  const riskPerShare = Math.abs(entry - stopLoss)
  const maxRiskAmount = capitalAvailable * (maxRiskPercent / 100)
  const positionSize = Math.floor(maxRiskAmount / riskPerShare)
  
  // Calculate capital required
  const capitalRequired = positionSize * entry
  
  return {
    entry,
    stopLoss,
    target1,
    target2,
    positionSize,
    capitalRequired,
    riskAmount: maxRiskAmount,
    riskPercent: maxRiskPercent
  }
}

/**
 * Calculate master score for a momentum signal
 */
export async function calculateMasterScore(
  signal: MomentumSignal,
  analystReport?: any,  // From database
  newsSentiment: number = 0,
  capitalAvailable: number = 300000  // Default ₹3L
): Promise<MasterScore> {
  // 1. Calculate Technical Score (40 points)
  const technical = calculateTechnicalScore(signal)

  // 2. Calculate Fundamental Score (30 points)
  let fundamental: FundamentalScore
  try {
    const fundamentalData = await getFundamentals(signal.symbol)
    fundamental = calculateFundamentalScore(fundamentalData)
  } catch (error) {
    console.error(`Error fetching fundamentals for ${signal.symbol}:`, error)
    fundamental = calculateFundamentalScore(null)
  }

  // 3. Calculate Intelligence Score (30 points)
  const analystReportConverted = analystReport ? convertDbReportToAnalystReport(analystReport) : null
  const intelligence = calculateIntelligenceScore(analystReportConverted, newsSentiment)

  // 4. Calculate Total Score
  const totalScore = technical.score + fundamental.score + intelligence.score

  // 5. Determine Tier
  let tier: MasterScore['tier']
  if (totalScore >= 85) {
    tier = 'HIGH_CONVICTION'
  } else if (totalScore >= 75) {
    tier = 'MODERATE'
  } else if (totalScore >= 60) {
    tier = 'WATCH'
  } else {
    tier = 'SKIP'
  }

  // 6. Generate Trade Plan
  const tradePlan = generateTradePlan(signal, capitalAvailable)

  // 7. Build Reasoning (Top 3-5 reasons)
  const reasoning: string[] = []
  
  // Add top technical signal
  if (technical.signals.length > 0) {
    reasoning.push(`✅ ${technical.signals[0]}`)
  }
  
  // Add analyst view if strong
  if (intelligence.breakdown.analystScore >= 10 && intelligence.reasoning[0]) {
    reasoning.push(`✅ ${intelligence.reasoning[0]}`)
  }
  
  // Add fundamental quality
  if (fundamental.score >= 20) {
    reasoning.push(`✅ ${fundamental.reasoning}`)
  } else if (fundamental.score >= 10) {
    reasoning.push(`⚠️ ${fundamental.reasoning}`)
  }
  
  // Add additional technical signals
  if (technical.signals.length > 1) {
    reasoning.push(`✅ ${technical.signals[1]}`)
  }
  
  // Add upside if strong
  if (intelligence.breakdown.targetUpsideScore >= 8 && intelligence.reasoning[1]) {
    reasoning.push(`✅ ${intelligence.reasoning[1]}`)
  }

  return {
    symbol: signal.symbol,
    exchange: signal.exchange,  // Add exchange field
    totalScore: Math.round(totalScore),
    tier,
    technical: {
      score: technical.score,
      breakdown: technical.breakdown,
      signals: technical.signals
    },
    fundamental,
    intelligence,
    tradePlan,
    reasoning: reasoning.slice(0, 5),  // Max 5 reasons
    timestamp: new Date()
  }
}

/**
 * Batch calculate master scores for multiple signals
 * With timeout protection to prevent hanging
 */
export async function batchCalculateMasterScores(
  signals: MomentumSignal[],
  analystReports: Record<string, any> = {},
  capitalAvailable: number = 300000
): Promise<MasterScore[]> {
  console.log(`🎯 Starting master score calculation for ${signals.length} signals...`)
  
  // Process in batches of 5 to avoid overwhelming external APIs
  const batchSize = 5
  const allScores: MasterScore[] = []
  
  for (let i = 0; i < signals.length; i += batchSize) {
    const batch = signals.slice(i, i + batchSize)
    console.log(`  Processing batch ${Math.floor(i / batchSize) + 1} (${batch.length} signals)...`)
    
    const batchScores = await Promise.allSettled(
      batch.map(signal => 
        // Add 10 second timeout per signal
        Promise.race([
          calculateMasterScore(
            signal,
            analystReports[signal.symbol],
            0,  // TODO: Add news sentiment
            capitalAvailable
          ),
          new Promise<MasterScore>((_, reject) => 
            setTimeout(() => reject(new Error(`Timeout calculating ${signal.symbol}`)), 10000)
          )
        ])
      )
    )
    
    // Extract successful scores
    batchScores.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        allScores.push(result.value)
      } else {
        console.warn(`  ⚠️  Failed to score ${batch[idx].symbol}: ${result.reason.message}`)
        // Create a fallback score with just technical analysis
        const technical = calculateTechnicalScore(batch[idx])
        allScores.push({
          symbol: batch[idx].symbol,
          exchange: batch[idx].exchange,
          totalScore: technical.score, // Only technical score
          tier: technical.score >= 75 ? 'HIGH_CONVICTION' : technical.score >= 60 ? 'MODERATE' : 'WATCH',
          technical: {
            score: technical.score,
            breakdown: technical.breakdown,
            signals: technical.signals
          },
          fundamental: {
            score: 0,
            breakdown: { pe: 0, roe: 0, debt: 0, marketCap: 0 },
            reasoning: 'Fundamentals unavailable'
          },
          intelligence: {
            score: 0,
            breakdown: { analystScore: 0, targetUpsideScore: 0, newsScore: 0 },
            reasoning: []
          },
          tradePlan: generateTradePlan(batch[idx], capitalAvailable),
          reasoning: technical.signals.slice(0, 3),
          timestamp: new Date()
        })
      }
    })
    
    console.log(`  ✅ Batch complete (${allScores.length} total scored)`)
  }

  console.log(`🎯 Master score calculation complete: ${allScores.length} signals scored`)
  
  // Sort by total score (highest first)
  return allScores.sort((a, b) => b.totalScore - a.totalScore)
}

/**
 * Filter scores by tier
 */
export function filterByTier(scores: MasterScore[], tier: MasterScore['tier']): MasterScore[] {
  return scores.filter(score => score.tier === tier)
}

/**
 * Get high conviction and moderate signals
 */
export function categorizeSignals(
  scores: MasterScore[],
  customSymbols: string[] = []
): {
  highConviction: MasterScore[]
  moderate: MasterScore[]
  watch: MasterScore[]
} {
  return {
    highConviction: scores.filter(s => s.tier === 'HIGH_CONVICTION').slice(0, 5),  // Top 5
    moderate: scores.filter(s => s.tier === 'MODERATE').slice(0, 10),  // Top 10
    watch: scores.filter(s => 
      s.tier === 'WATCH' || 
      (s.tier === 'SKIP' && customSymbols.includes(s.symbol))  // Include SKIP only for custom stocks
    )
  }
}

