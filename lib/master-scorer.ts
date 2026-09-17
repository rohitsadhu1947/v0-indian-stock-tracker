/**
 * Master Scoring System
 * Combines Technical (40%) + Fundamental (30%) + Intelligence (30%)
 * to generate high-conviction trading signals
 */

import type { MomentumSignal } from './momentum-scanner'
import { getFundamentals, calculateFundamentalScore, type FundamentalData, type FundamentalScore } from './fundamental-api'
import { calculateIntelligenceScore, convertDbReportToAnalystReport, type AnalystReport, type IntelligenceScore } from './intelligence-scorer'
import type { MacroSnapshot } from './macro-intelligence'
import { getMacroImpactForStock } from './macro-intelligence'

export interface MacroScore {
  score: number  // 0-15
  breakdown: {
    globalSentiment: number   // 0-4 (based on overallSentiment)
    stockSpecific: number     // 0-5 (sector-macro alignment)
    vixAdjustment: number     // -3 to +3
    currencyEffect: number    // -3 to +3
  }
  factors: string[]  // Human-readable factors
}

export interface MasterScore {
  symbol: string
  exchange: string  // NSE/BSE
  totalScore: number  // 0-100
  tier: 'HIGH_CONVICTION' | 'MODERATE' | 'WATCH' | 'SKIP'

  technical: {
    score: number  // 0-35 (was 0-40, reduced to make room for macro)
    breakdown: {
      momentum: number  // 0-13
      breakout: number  // 0-9
      volume: number    // 0-9
      trend: number     // 0-4
    }
    signals: string[]
  }

  fundamental: FundamentalScore  // 0-25 (was 0-30)

  intelligence: IntelligenceScore  // 0-25 (was 0-30)

  macro: MacroScore  // 0-15 (NEW)

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

function sanitizeNumber(value: number, fallback: number = 0): number {
  return Number.isFinite(value) ? value : fallback;
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
  
  // PRIMARY: Use the momentum scanner's overall score (0-100) and scale to 0-35
  // (was 0-40, reduced to make room for 15% macro alignment)
  const rawScore = signal.momentumScore || 0
  const technicalScore = Math.round((rawScore / 100) * 35)

  // Breakdown estimation (for display purposes)
  const momentumScore = Math.round(technicalScore * 0.375) // 37.5% of 35 = ~13
  const breakoutScore = Math.round(technicalScore * 0.25)  // 25% of 35 = ~9
  const volumeScore = Math.round(technicalScore * 0.25)    // 25% of 35 = ~9
  const trendScore = Math.round(technicalScore * 0.125)    // 12.5% of 35 = ~4
  
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
 * 
 * DIRECTION LOGIC:
 * - Current scanner generates BUY signals only (STRONG_BUY, BUY, WATCH, SKIP)
 * - Future: If we add SHORT signals, include 'SHORT', 'SELL', or 'STRONG_SELL' in signal.signal
 * - The trade plan will auto-adjust SL/targets based on direction
 */
function generateTradePlan(
  signal: MomentumSignal,
  capitalAvailable: number,
  maxRiskPercent: number = 2.0  // Max 2% risk per trade
): MasterScore['tradePlan'] {
  const entry = signal.current  // Use 'current' field (not 'currentPrice')
  
  // Determine trade direction
  // Check if signal explicitly indicates SHORT (future-proof)
  const signalType = (signal.signal as string)?.toUpperCase() || ''
  const isShort = signalType.includes('SHORT') || signalType.includes('SELL')
  
  // Use provided values from momentum scanner, or calculate defaults
  let stopLoss = signal.stopLoss
  let target1 = signal.target1
  let target2 = signal.target2
  
  if (isShort) {
    // SHORT/SELL TRADE: We profit when price goes DOWN
    // Stop loss should be ABOVE entry (we exit if price rises)
    if (!stopLoss || stopLoss <= entry) {
      stopLoss = entry * 1.025  // 2.5% above entry
    }
    // Targets should be BELOW entry (price falling is profitable)
    if (!target1 || target1 >= entry) {
      target1 = entry * 0.985  // 1.5% below
    }
    if (!target2 || target2 >= entry) {
      target2 = entry * 0.975  // 2.5% below
    }
    // Ensure target2 < target1 for shorts
    if (target2 >= target1) {
      target2 = target1 * 0.99  // 1% below target1
    }
  } else {
    // LONG/BUY TRADE: We profit when price goes UP
    // Stop loss should be BELOW entry (we exit if price falls)
    if (!stopLoss || stopLoss >= entry) {
      stopLoss = entry * 0.975  // 2.5% below entry
    }
    // Targets should be ABOVE entry (price rising is profitable)
    if (!target1 || target1 <= entry) {
      target1 = entry * 1.015  // 1.5% above
    }
    if (!target2 || target2 <= entry) {
      target2 = entry * 1.025  // 2.5% above
    }
    // Ensure target2 > target1 for longs
    if (target2 <= target1) {
      target2 = target1 * 1.01  // 1% above target1
    }
  }

  // Calculate position size based on risk
  const riskPerShare = Math.abs(entry - stopLoss)
  const maxRiskAmount = capitalAvailable * (maxRiskPercent / 100)
  const positionSize = riskPerShare > 0 ? Math.floor(maxRiskAmount / riskPerShare) : 0
  
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
 * Calculate macro alignment score (0-15 points)
 * Determines how well a stock aligns with current global macro conditions.
 */
function calculateMacroScore(
  symbol: string,
  macroSnapshot?: MacroSnapshot | null
): MacroScore {
  if (!macroSnapshot) {
    return {
      score: 8, // Neutral default (middle of 0-15)
      breakdown: { globalSentiment: 2, stockSpecific: 3, vixAdjustment: 0, currencyEffect: 0 },
      factors: ['Macro data unavailable — using neutral score'],
    }
  }

  const factors: string[] = []
  let globalSentiment = 2 // Base: neutral (0-4 range)
  let stockSpecific = 3   // Base: neutral (0-5 range)
  let vixAdjustment = 0   // -3 to +3
  let currencyEffect = 0  // -3 to +3

  // 1. Global sentiment score (0-4)
  switch (macroSnapshot.overallSentiment) {
    case 'STRONGLY_RISK_ON':
      globalSentiment = 4
      factors.push('🌍 Global markets strongly risk-on')
      break
    case 'RISK_ON':
      globalSentiment = 3
      factors.push('🌍 Global markets risk-on')
      break
    case 'NEUTRAL':
      globalSentiment = 2
      break
    case 'RISK_OFF':
      globalSentiment = 1
      factors.push('🌍 Global markets risk-off')
      break
    case 'STRONGLY_RISK_OFF':
      globalSentiment = 0
      factors.push('🌍 Global markets strongly risk-off')
      break
  }

  // 2. Stock-specific macro alignment (0-5)
  const stockImpact = getMacroImpactForStock(symbol, macroSnapshot)
  // Map -100 to +100 impact to 0-5 score
  stockSpecific = Math.round(((stockImpact.score + 100) / 200) * 5)
  stockSpecific = Math.max(0, Math.min(5, stockSpecific))
  if (stockImpact.factors.length > 0) {
    factors.push(...stockImpact.factors.slice(0, 2))
  }

  // 3. VIX adjustment (-3 to +3)
  if (macroSnapshot.volatility.indiaVix > 30) {
    vixAdjustment = -3
    factors.push(`⚠️ Extreme VIX (${macroSnapshot.volatility.indiaVix.toFixed(1)})`)
  } else if (macroSnapshot.volatility.indiaVix > 22) {
    vixAdjustment = -2
    factors.push(`⚠️ High VIX (${macroSnapshot.volatility.indiaVix.toFixed(1)})`)
  } else if (macroSnapshot.volatility.indiaVix > 17) {
    vixAdjustment = -1
  } else if (macroSnapshot.volatility.indiaVix < 12) {
    vixAdjustment = 2
    factors.push(`✅ Low VIX (${macroSnapshot.volatility.indiaVix.toFixed(1)}) — calm markets`)
  } else if (macroSnapshot.volatility.indiaVix < 14) {
    vixAdjustment = 1
  }

  // 4. Currency effect (-3 to +3)
  // This is already captured in stockSpecific via getMacroImpactForStock, so keep small
  if (Math.abs(macroSnapshot.currency.usdInrChange) > 0.5) {
    currencyEffect = macroSnapshot.currency.trend === 'WEAKENING' ? -1 : 1
  }

  // Total macro score (0-15)
  const rawScore = globalSentiment + stockSpecific + vixAdjustment + currencyEffect
  const score = Math.max(0, Math.min(15, rawScore))

  return {
    score,
    breakdown: { globalSentiment, stockSpecific, vixAdjustment, currencyEffect },
    factors,
  }
}

/**
 * Calculate master score for a momentum signal
 *
 * New weights: Technical 35% + Fundamental 25% + Intelligence 25% + Macro 15%
 */
export async function calculateMasterScore(
  signal: MomentumSignal,
  analystReport?: any,  // From database
  newsSentiment: number = 0,
  capitalAvailable: number = 300000,  // Default ₹3L
  macroSnapshot?: MacroSnapshot | null
): Promise<MasterScore> {
  // 1. Calculate Technical Score (35 points, was 40)
  const technical = calculateTechnicalScore(signal)

  // 2. Calculate Fundamental Score (25 points, was 30)
  let fundamental: FundamentalScore
  try {
    const fundamentalData = await getFundamentals(signal.symbol)
    fundamental = calculateFundamentalScore(fundamentalData)
    // Scale from 0-30 to 0-25
    fundamental = { ...fundamental, score: Math.round((fundamental.score / 30) * 25) }
  } catch (error) {
    console.error(`Error fetching fundamentals for ${signal.symbol}:`, error)
    fundamental = calculateFundamentalScore(null)
    fundamental = { ...fundamental, score: Math.round((fundamental.score / 30) * 25) }
  }

  // 3. Calculate Intelligence Score (25 points, was 30) with REAL news sentiment
  const analystReportConverted = analystReport ? convertDbReportToAnalystReport(analystReport) : null
  
  // Fetch actual news sentiment for the stock
  let actualNewsSentiment = newsSentiment // Use provided value as fallback
  
  try {
    // Fetch stock-specific news with pre-calculated sentiment
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3003'
    const newsResponse = await fetch(`${baseUrl}/api/news/quote?symbol=${signal.symbol}&limit=20`, {
      next: { revalidate: 300 } // Cache for 5 minutes
    })
    
    if (newsResponse.ok) {
      const newsData = await newsResponse.json()
      
      // API returns "news" not "articles", and pre-calculates sentiment
      if (newsData.success && newsData.news && newsData.news.length > 0) {
        // Use the pre-calculated aggregate sentiment from the API
        if (newsData.sentiment?.aggregate?.score !== undefined) {
          actualNewsSentiment = newsData.sentiment.aggregate.score
          const overall = newsData.sentiment.aggregate.overall || 'NEUTRAL'
          const posCount = newsData.sentiment.aggregate.positive || 0
          const negCount = newsData.sentiment.aggregate.negative || 0
          console.log(`📰 ${signal.symbol}: ${newsData.news.length} news items, sentiment: ${overall} (${posCount}+ ${negCount}-) score: ${actualNewsSentiment.toFixed(2)}`)
        } else {
          // Fallback: manually analyze if API didn't include sentiment
          const { analyzeSentiment, calculateAggregateSentiment } = await import('./sentiment-utils')
          const sentiments = newsData.news.slice(0, 10).map((article: any) => 
            analyzeSentiment(article.title)
          )
          const aggregate = calculateAggregateSentiment(sentiments)
          actualNewsSentiment = aggregate.score
          console.log(`📰 ${signal.symbol}: Analyzed ${sentiments.length} news articles, sentiment: ${actualNewsSentiment.toFixed(2)}`)
        }
      } else {
        console.log(`📰 ${signal.symbol}: No news found, using neutral sentiment`)
      }
    } else {
      console.log(`📰 ${signal.symbol}: News API returned ${newsResponse.status}, using neutral sentiment`)
    }
  } catch (error) {
    console.log(`⚠️ ${signal.symbol}: Failed to fetch news, using default sentiment`)
    // Continue with default/provided sentiment
  }
  
  let intelligence = calculateIntelligenceScore(analystReportConverted, actualNewsSentiment)
  // Scale from 0-30 to 0-25
  intelligence = { ...intelligence, score: Math.round((intelligence.score / 30) * 25) }

  // 4. Calculate Macro Alignment Score (15 points) — NEW
  const macro = calculateMacroScore(signal.symbol, macroSnapshot)

  // 5. Calculate Total Score (35 + 25 + 25 + 15 = 100)
  const totalScore = technical.score + fundamental.score + intelligence.score + macro.score

  // 6. Determine Tier
  let tier: MasterScore['tier']
  if (totalScore >= 75) {
    tier = 'HIGH_CONVICTION'
  } else if (totalScore >= 60) {
    tier = 'MODERATE'
  } else if (totalScore >= 45) {
    tier = 'WATCH'
  } else {
    tier = 'SKIP'
  }

  // 7. Generate Trade Plan
  const tradePlan = generateTradePlan(signal, capitalAvailable)

  // 8. Build Reasoning (Top 3-5 reasons)
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

  // Add top macro factor if impactful
  if (macro.factors.length > 0 && macro.score >= 10) {
    reasoning.push(`🌍 ${macro.factors[0]}`)
  } else if (macro.factors.length > 0 && macro.score <= 5) {
    reasoning.push(`⚠️ ${macro.factors[0]}`)
  }

  // Sanitize all numeric scores to prevent NaN/Infinity propagation
  const sanitizedTechnicalScore = sanitizeNumber(technical.score);
  const sanitizedFundamentalScore = sanitizeNumber(fundamental.score);
  const sanitizedIntelligenceScore = sanitizeNumber(intelligence.score);
  const sanitizedMacroScore = sanitizeNumber(macro.score);
  const sanitizedTotalScore = sanitizeNumber(totalScore);

  return {
    symbol: signal.symbol,
    exchange: signal.exchange,
    totalScore: Math.round(sanitizedTotalScore),
    tier,
    technical: {
      score: sanitizedTechnicalScore,
      breakdown: {
        momentum: sanitizeNumber(technical.breakdown.momentum),
        breakout: sanitizeNumber(technical.breakdown.breakout),
        volume: sanitizeNumber(technical.breakdown.volume),
        trend: sanitizeNumber(technical.breakdown.trend),
      },
      signals: technical.signals
    },
    fundamental: { ...fundamental, score: sanitizedFundamentalScore },
    intelligence: { ...intelligence, score: sanitizedIntelligenceScore },
    macro: { ...macro, score: sanitizedMacroScore },
    tradePlan,
    reasoning: reasoning.slice(0, 6),  // Max 6 reasons (added macro)
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
  capitalAvailable: number = 300000,
  macroSnapshot?: MacroSnapshot | null
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
            undefined,  // Let calculateMasterScore fetch news sentiment
            capitalAvailable,
            macroSnapshot  // Pass macro data for macro alignment scoring
          ),
          new Promise<MasterScore>((_, reject) => 
            setTimeout(() => reject(new Error(`Timeout calculating ${signal.symbol}`)), 20000) // Increased to 20s
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
        const fallbackMacro = calculateMacroScore(batch[idx].symbol, macroSnapshot)
        allScores.push({
          symbol: batch[idx].symbol,
          exchange: batch[idx].exchange,
          totalScore: technical.score + fallbackMacro.score, // Technical + macro
          tier: (technical.score + fallbackMacro.score) >= 75 ? 'HIGH_CONVICTION' : (technical.score + fallbackMacro.score) >= 60 ? 'MODERATE' : 'WATCH',
          technical: {
            score: technical.score,
            breakdown: technical.breakdown,
            signals: technical.signals
          },
          fundamental: {
            score: 0,
            tier: 'FAIL' as const,
            data: null as any,
            reasoning: 'Fundamentals unavailable'
          },
          intelligence: {
            score: 0,
            breakdown: { analystScore: 0, targetUpsideScore: 0, newsSentimentScore: 0 },
            reasoning: []
          },
          macro: fallbackMacro,
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

