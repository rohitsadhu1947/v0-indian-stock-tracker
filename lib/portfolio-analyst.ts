/**
 * Portfolio Analyst — Deep Position Analysis Engine
 *
 * Takes the user's current positions and runs multi-dimensional analysis:
 *   1. Technical: Momentum, trend, SMA alignment, RSI, volume
 *   2. Macro: Crude, FX, VIX, global sentiment → stock-specific impact
 *   3. Geopolitical: War, tariffs, sanctions → sector/stock impact
 *   4. Sector: Relative strength, rotation signals, peer comparison
 *   5. Institutional: FII/DII flow direction & magnitude
 *
 * Output: Per-stock verdict (HOLD/SELL/BUY_MORE/HEDGE/EXIT) with:
 *   - Timeline (immediate / 1-2 weeks / 1-3 months)
 *   - Defensive actions (stop-loss, hedging, position sizing)
 *   - Risk quantification (max drawdown estimate, risk score)
 *   - Detailed thesis with bull/bear factors
 */

import { getMacroSnapshot, getMacroImpactForStock, type MacroSnapshot } from './macro-intelligence'
import { detectGeopoliticalEvents, getGeopoliticalImpactForStock, type GeopoliticalSnapshot } from './geopolitical-monitor'
import { getSectorInfo, getEffectsForStock, STOCK_SECTOR_MAP, type SectorInfo } from './sector-mapping'
import { fetchFIIDIIData, analyzeSmartMoney, type SmartMoneyAnalysis } from './smart-money-tracker'
import { analyzeStock as getStockRecommendation, type StockRecommendation } from './recommendation-engine'
import { analyzeNewsSentiment, type GeminiSentimentResult } from './gemini-sentiment'
import { analyzeSentiment } from './sentiment-utils'
import { lookupInstrumentTokens, analyzeDerivatives, type DerivativesAnalysis } from './derivatives-analyzer'
import { fetchInsiderTrades, analyzeInsiderActivity, type InsiderAnalysis } from './insider-tracker'
import { analyzeDeliveryPattern, type DeliveryAnalysis } from './delivery-analyzer'
import { getUserBrokerManager } from './broker'
import type { BrokerClient } from './broker/types'
import logger from './logger'
import Parser from 'rss-parser'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PortfolioPosition {
  id: number
  symbol: string
  exchange: string
  entryPrice: number
  currentPrice: number | null
  quantity: number
  positionType: 'BUY' | 'SELL'
  stopLoss: number | null
  target: number | null
  pnl: number | null
  pnlPercent: number | null
  status: string
  entryTime: string | Date
  strategy?: string | null
}

export type Verdict = 'STRONG_HOLD' | 'HOLD' | 'BUY_MORE' | 'PARTIAL_EXIT' | 'EXIT' | 'HEDGE'

export interface DefensiveAction {
  action: string
  urgency: 'IMMEDIATE' | 'THIS_WEEK' | 'MONITOR'
  detail: string
}

export interface StockAnalysis {
  symbol: string
  exchange: string
  sector: string
  industry: string

  // Position info
  entryPrice: number
  currentPrice: number
  hasLivePrice: boolean       // false = price is stale (entry price used as fallback)
  quantity: number
  positionType: 'BUY' | 'SELL'
  unrealizedPnl: number
  unrealizedPnlPercent: number
  holdingDays: number

  // Verdict
  verdict: Verdict
  verdictConfidence: number      // 0-100
  verdictReasoning: string       // 2-3 sentence summary
  timeline: 'IMMEDIATE' | '1-2_WEEKS' | '1-3_MONTHS'

  // Multi-dimensional scores (-100 to +100, positive = favorable)
  scores: {
    technical: number
    macro: number
    geopolitical: number
    sector: number
    institutional: number
    overall: number              // Weighted composite
  }

  // Deep analysis
  technicalAnalysis: {
    trend: 'STRONG_UP' | 'UP' | 'SIDEWAYS' | 'DOWN' | 'STRONG_DOWN'
    rsi: number | null
    volumeSignal: string
    smaAlignment: string
    priceVsSma20: number | null  // % above/below SMA20
    keyLevels: { support: number; resistance: number } | null
    summary: string
  }

  macroAnalysis: {
    score: number
    factors: string[]
    tailwinds: string[]
    headwinds: string[]
    summary: string
  }

  geopoliticalAnalysis: {
    impactScore: number
    relevantEvents: string[]
    warnings: string[]
    summary: string
  }

  sectorAnalysis: {
    sectorTrend: string
    peerComparison: string
    rotationSignal: string
    macroFactors: string[]
    summary: string
  }

  institutionalAnalysis: {
    fiiStance: string
    diiStance: string
    flowImpact: string
    summary: string
  }

  // Actionable
  defensiveActions: DefensiveAction[]
  riskScore: number              // 0-100 (100 = maximum risk)
  maxDrawdownEstimate: number    // % estimate of further downside
  suggestedStopLoss: number
  suggestedTarget: number

  // Thesis
  bullCase: string[]
  bearCase: string[]
  catalysts: string[]            // Upcoming events that could move the stock

  // Derivatives / F&O analysis
  derivativesAnalysis: DerivativesAnalysis | null

  // Insider / Promoter tracking
  insiderAnalysis: InsiderAnalysis | null

  // Delivery volume analysis
  deliveryAnalysis: DeliveryAnalysis | null

  // Real intelligence (from recommendation engine + news)
  intelligence: {
    recommendation: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'AVOID' | 'SELL' | null
    recommendationConviction: number
    thesis: string               // Why this stock is moving — the real story
    macroTailwinds: string[]
    macroHeadwinds: string[]
    secondOrderEffects: string[]
    geoContext: string[]
    newsHeadlines: string[]      // Recent stock-specific news
    newsSentiment: number | null  // -100 to +100 from Gemini
    newsSentimentFactors: string[]
    newsRisks: string[]
    newsOpportunities: string[]
    tradePlan: string            // What to actually do
  }
}

export interface PortfolioAnalysisReport {
  generatedAt: string
  totalPositions: number
  totalInvested: number
  totalCurrentValue: number
  totalPnl: number
  totalPnlPercent: number

  // Portfolio-level metrics
  portfolioRiskScore: number     // 0-100
  concentrationRisk: string
  sectorExposure: Record<string, { count: number; weight: number; verdict: string }>
  overallVerdict: string         // 1-2 sentence portfolio summary

  // Per-stock analysis
  positions: StockAnalysis[]

  // Aggregated actions
  immediateActions: DefensiveAction[]
  weeklyActions: DefensiveAction[]

  // Market context
  marketContext: {
    regime: string
    vix: number
    vixRisk: string
    fiiStance: string
    geoRisk: string
    overallSentiment: string
  }
}

// ─── News Fetcher ───────────────────────────────────────────────────────────

const rssParser = new Parser({ customFields: { item: ['description', 'content', 'content:encoded'] } })

async function fetchStockNews(symbol: string, exchange: string = 'NSE'): Promise<string[]> {
  const headlines: string[] = []
  const yahooSymbol = exchange === 'NSE' ? `${symbol}.NS` : `${symbol}.BO`

  // Fetch from Yahoo + Google in parallel
  const [yahoo, google] = await Promise.allSettled([
    rssParser.parseURL(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${yahooSymbol}&region=IN&lang=en-IN`),
    rssParser.parseURL(`https://news.google.com/rss/search?q=${encodeURIComponent(symbol + ' stock India')}&hl=en-IN&gl=IN&ceid=IN:en`),
  ])

  if (yahoo.status === 'fulfilled' && yahoo.value.items) {
    headlines.push(...yahoo.value.items.slice(0, 5).map(i => i.title || '').filter(Boolean))
  }
  if (google.status === 'fulfilled' && google.value.items) {
    headlines.push(...google.value.items.slice(0, 5).map(i => i.title || '').filter(Boolean))
  }

  return headlines
}

// ─── Main Analyzer ──────────────────────────────────────────────────────────

export async function analyzePortfolio(
  positions: PortfolioPosition[],
  userId: string,
): Promise<PortfolioAnalysisReport> {
  const startTime = Date.now()
  logger.info('Portfolio Analyst: Starting deep analysis', { positions: positions.length })

  // Step 1: Fetch all intelligence in parallel
  const [macro, geoSnapshot, fiidiiRaw] = await Promise.allSettled([
    getMacroSnapshot(),
    detectGeopoliticalEvents([]),
    fetchFIIDIIData(),
  ]).then(results => [
    results[0].status === 'fulfilled' ? results[0].value : null,
    results[1].status === 'fulfilled' ? results[1].value : null,
    results[2].status === 'fulfilled' ? results[2].value : [],
  ]) as [MacroSnapshot | null, GeopoliticalSnapshot | null, any[]]

  const smartMoney = fiidiiRaw.length > 0 ? analyzeSmartMoney(fiidiiRaw, []) : null

  // Step 2: Get live quotes for all positions
  let broker: BrokerClient | null = null
  try {
    const manager = await getUserBrokerManager()
    broker = manager.getClient()
  } catch {
    logger.warn('Portfolio Analyst: No broker client available, using position data as-is')
  }

  // Fetch fresh quotes if broker available — use EXCHANGE:SYMBOL format
  const liveQuotes = new Map<string, { price: number; change: number; changePercent: number; volume: number; high: number; low: number }>()
  if (broker) {
    const symbolsWithExchange = positions.map(p => `${p.exchange || 'NSE'}:${p.symbol}`)
    try {
      const quotes = await broker.getQuote(symbolsWithExchange)
      if (quotes) {
        for (const [key, q] of Object.entries(quotes)) {
          const sym = key.split(':').pop() || key
          if (q.lastPrice && q.lastPrice > 0) {
            liveQuotes.set(sym, {
              price: q.lastPrice,
              change: q.change ?? 0,
              changePercent: q.changePercent ?? 0,
              volume: q.volume ?? 0,
              high: q.high || q.lastPrice,
              low: q.low || q.lastPrice,
            })
          }
        }
      }
      logger.info('Portfolio Analyst: Fetched live quotes', {
        requested: symbolsWithExchange.length,
        received: liveQuotes.size,
        missing: symbolsWithExchange.filter(s => !liveQuotes.has(s.split(':').pop()!)).map(s => s),
      })
    } catch (err) {
      logger.warn('Portfolio Analyst: Quote fetch failed', { error: (err as Error).message })
    }
  }

  // Step 3: Look up instrument tokens, then fetch historical data + derivatives
  const historicalCache = new Map<string, any[]>()
  const derivativesCache = new Map<string, DerivativesAnalysis>()
  if (broker) {
    // Resolve symbol → numeric instrument token (Kite requires this for historical)
    const symbols = positions.map(p => p.symbol)
    let tokenMap = new Map<string, number | string>()
    try {
      tokenMap = await lookupInstrumentTokens(symbols, broker, 'NSE')
      logger.info('Portfolio Analyst: Token lookup', {
        requested: symbols.length,
        resolved: tokenMap.size,
        missing: symbols.filter(s => !tokenMap.has(s)),
      })
    } catch (err) {
      logger.warn('Portfolio Analyst: Token lookup failed', { error: (err as Error).message })
    }

    // Fetch historical data using correct tokens
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - 60)

    const fetchPromises = positions.map(async (pos) => {
      const token = tokenMap.get(pos.symbol)
      if (!token) return
      try {
        const bars = await broker!.getHistoricalData({
          instrumentToken: token,
          exchange: pos.exchange || 'NSE',
          symbol: pos.symbol,
          interval: 'day',
          from,
          to,
        })
        if (bars && bars.length > 0) {
          historicalCache.set(pos.symbol, bars)
        }
      } catch {
        // Skip — technical analysis will be limited
      }
    })
    await Promise.allSettled(fetchPromises)

    logger.info('Portfolio Analyst: Historical data fetched', {
      success: historicalCache.size,
      total: positions.length,
    })

    // Fetch derivatives / F&O data in parallel
    const derivativesPromises = positions.map(async (pos) => {
      try {
        const quote = liveQuotes.get(pos.symbol)
        const result = await analyzeDerivatives(pos.symbol, broker!, quote?.price)
        if (result.available) derivativesCache.set(pos.symbol, result)
      } catch {
        // F&O data not available for this stock — not critical
      }
    })
    await Promise.allSettled(derivativesPromises)

    logger.info('Portfolio Analyst: Derivatives data fetched', {
      available: derivativesCache.size,
      total: positions.length,
    })
  }

  // Step 4: Fetch stock-specific intelligence (news + recommendations + sentiment)
  const openPositions = positions.filter(p => p.status === 'open')
  logger.info('Portfolio Analyst: Fetching stock-specific intelligence', { stocks: openPositions.map(p => p.symbol) })

  // Get recommendation engine analysis for each stock (uses macro + geo already fetched)
  const recommendationCache = new Map<string, StockRecommendation>()
  for (const pos of openPositions) {
    if (STOCK_SECTOR_MAP[pos.symbol]) {
      recommendationCache.set(pos.symbol, getStockRecommendation(pos.symbol, macro, geoSnapshot))
    }
  }

  // Fetch news for all stocks in parallel
  const newsCache = new Map<string, string[]>()
  const newsPromises = openPositions.map(async (pos) => {
    try {
      const headlines = await fetchStockNews(pos.symbol, pos.exchange || 'NSE')
      if (headlines.length > 0) newsCache.set(pos.symbol, headlines)
    } catch {
      // Skip — news won't be available for this stock
    }
  })
  await Promise.allSettled(newsPromises)

  // Run Gemini sentiment on news headlines (in parallel, respects rate limits)
  const sentimentCache = new Map<string, GeminiSentimentResult>()
  const sentimentPromises = openPositions
    .filter(pos => newsCache.has(pos.symbol))
    .map(async (pos) => {
      try {
        const sectorInfo = getSectorInfo(pos.symbol)
        const quote = liveQuotes.get(pos.symbol)
        const result = await analyzeNewsSentiment(
          newsCache.get(pos.symbol)!,
          {
            symbol: pos.symbol,
            sector: sectorInfo?.sector,
            industry: sectorInfo?.industry,
            currentPrice: quote?.price,
            changePercent: quote?.changePercent,
          }
        )
        sentimentCache.set(pos.symbol, result)
      } catch {
        // Gemini unavailable — keyword fallback in analyzePosition
      }
    })
  await Promise.allSettled(sentimentPromises)

  // Fetch insider + delivery data in parallel
  const insiderCache = new Map<string, InsiderAnalysis>()
  const deliveryCache = new Map<string, DeliveryAnalysis>()

  const edgePromises = openPositions.flatMap(pos => [
    (async () => {
      try {
        const trades = await fetchInsiderTrades(pos.symbol)
        const analysis = analyzeInsiderActivity(trades)
        if (analysis.available) insiderCache.set(pos.symbol, analysis)
      } catch { /* non-critical */ }
    })(),
    (async () => {
      try {
        const analysis = await analyzeDeliveryPattern(pos.symbol)
        if (analysis.available) deliveryCache.set(pos.symbol, analysis)
      } catch { /* non-critical */ }
    })(),
  ])
  await Promise.allSettled(edgePromises)

  logger.info('Portfolio Analyst: Intelligence gathered', {
    recommendations: recommendationCache.size,
    newsStocks: newsCache.size,
    sentimentStocks: sentimentCache.size,
    insiderStocks: insiderCache.size,
    deliveryStocks: deliveryCache.size,
  })

  // Step 5: Analyze each position with full intelligence
  const analyses: StockAnalysis[] = openPositions
    .map(pos => analyzePosition(
      pos, macro, geoSnapshot, smartMoney, liveQuotes, historicalCache,
      recommendationCache.get(pos.symbol) ?? null,
      newsCache.get(pos.symbol) ?? [],
      sentimentCache.get(pos.symbol) ?? null,
      derivativesCache.get(pos.symbol) ?? null,
      insiderCache.get(pos.symbol) ?? null,
      deliveryCache.get(pos.symbol) ?? null,
    ))

  // Step 6: Portfolio-level aggregation
  const totalInvested = analyses.reduce((sum, a) => sum + a.entryPrice * a.quantity, 0)
  const totalCurrentValue = analyses.reduce((sum, a) => sum + a.currentPrice * a.quantity, 0)
  const totalPnl = totalCurrentValue - totalInvested
  const totalPnlPercent = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0

  // Sector exposure
  const sectorExposure: Record<string, { count: number; weight: number; verdict: string }> = {}
  for (const a of analyses) {
    const posValue = a.currentPrice * a.quantity
    const weight = totalCurrentValue > 0 ? (posValue / totalCurrentValue) * 100 : 0
    if (!sectorExposure[a.sector]) {
      sectorExposure[a.sector] = { count: 0, weight: 0, verdict: '' }
    }
    sectorExposure[a.sector].count++
    sectorExposure[a.sector].weight += weight
    sectorExposure[a.sector].verdict = a.sectorAnalysis.sectorTrend
  }

  // Concentration risk
  const maxSectorWeight = Math.max(...Object.values(sectorExposure).map(s => s.weight), 0)
  const concentrationRisk = maxSectorWeight > 40 ? 'HIGH — Over-concentrated in single sector'
    : maxSectorWeight > 25 ? 'MODERATE — Consider diversifying'
    : 'LOW — Well diversified'

  // Portfolio risk score
  const avgRisk = analyses.length > 0
    ? analyses.reduce((sum, a) => sum + a.riskScore, 0) / analyses.length
    : 50
  const portfolioRiskScore = Math.round(Math.min(100, avgRisk + (maxSectorWeight > 35 ? 10 : 0)))

  // Collect actions
  const immediateActions = analyses.flatMap(a => a.defensiveActions.filter(d => d.urgency === 'IMMEDIATE'))
  const weeklyActions = analyses.flatMap(a => a.defensiveActions.filter(d => d.urgency === 'THIS_WEEK'))

  // Overall verdict
  const exitCount = analyses.filter(a => a.verdict === 'EXIT' || a.verdict === 'PARTIAL_EXIT').length
  const holdCount = analyses.filter(a => a.verdict === 'HOLD' || a.verdict === 'STRONG_HOLD').length
  const buyMoreCount = analyses.filter(a => a.verdict === 'BUY_MORE').length

  let overallVerdict: string
  if (exitCount > analyses.length / 2) {
    overallVerdict = `Portfolio under stress — ${exitCount} of ${analyses.length} positions flagged for exit/reduction. Prioritize capital preservation.`
  } else if (immediateActions.length > 0) {
    overallVerdict = `${immediateActions.length} immediate actions required. ${holdCount} positions look healthy, ${exitCount} need attention.`
  } else if (buyMoreCount > 0) {
    overallVerdict = `Portfolio broadly healthy. ${buyMoreCount} positions offer averaging-down opportunity. ${holdCount} positions on track.`
  } else {
    overallVerdict = `Portfolio stable. ${holdCount} positions on hold with current targets intact. Monitor weekly.`
  }

  // Market context
  const vix = macro?.volatility?.indiaVix ?? 15
  const marketContext = {
    regime: macro?.overallSentiment ?? 'NEUTRAL',
    vix,
    vixRisk: vix > 30 ? 'EXTREME' : vix > 25 ? 'HIGH' : vix > 20 ? 'ELEVATED' : vix > 15 ? 'MODERATE' : 'LOW',
    fiiStance: smartMoney?.fiiTrend?.direction ?? 'UNKNOWN',
    geoRisk: geoSnapshot?.overallRisk ?? 'LOW',
    overallSentiment: macro?.overallSentiment ?? 'NEUTRAL',
  }

  logger.info('Portfolio Analyst: Analysis complete', {
    positions: analyses.length,
    durationMs: Date.now() - startTime,
    immediateActions: immediateActions.length,
  })

  return {
    generatedAt: new Date().toISOString(),
    totalPositions: analyses.length,
    totalInvested: Math.round(totalInvested),
    totalCurrentValue: Math.round(totalCurrentValue),
    totalPnl: Math.round(totalPnl),
    totalPnlPercent: Math.round(totalPnlPercent * 100) / 100,
    portfolioRiskScore,
    concentrationRisk,
    sectorExposure,
    overallVerdict,
    positions: analyses,
    immediateActions,
    weeklyActions,
    marketContext,
  }
}

// ─── Per-Position Analyzer ──────────────────────────────────────────────────

function analyzePosition(
  pos: PortfolioPosition,
  macro: MacroSnapshot | null,
  geo: GeopoliticalSnapshot | null,
  smartMoney: SmartMoneyAnalysis | null,
  liveQuotes: Map<string, any>,
  historicalCache: Map<string, any[]>,
  recommendation: StockRecommendation | null,
  newsHeadlines: string[],
  newsSentiment: GeminiSentimentResult | null,
  derivatives: DerivativesAnalysis | null,
  insider: InsiderAnalysis | null,
  delivery: DeliveryAnalysis | null,
): StockAnalysis {
  const sectorInfo = getSectorInfo(pos.symbol)
  const sector = sectorInfo?.sector ?? 'Unknown'
  const industry = sectorInfo?.industry ?? 'Unknown'

  // Get live price — NEVER fall back to entry price (that produces garbage analysis)
  const quote = liveQuotes.get(pos.symbol)
  const currentPrice = quote?.price || (pos.currentPrice && pos.currentPrice > 0 ? pos.currentPrice : null)
  const hasLivePrice = currentPrice !== null
  const effectivePrice = currentPrice ?? pos.entryPrice // only for P&L calc, flagged as stale
  const quantity = pos.quantity
  const unrealizedPnl = (effectivePrice - pos.entryPrice) * quantity * (pos.positionType === 'BUY' ? 1 : -1)
  const unrealizedPnlPercent = pos.entryPrice > 0
    ? ((effectivePrice - pos.entryPrice) / pos.entryPrice) * 100 * (pos.positionType === 'BUY' ? 1 : -1)
    : 0

  const entryDate = new Date(pos.entryTime)
  const holdingDays = Math.max(1, Math.floor((Date.now() - entryDate.getTime()) / (1000 * 60 * 60 * 24)))

  // ── 1. Technical Analysis ──
  const historical = historicalCache.get(pos.symbol) || []
  const technicalAnalysis = analyzeTechnicals(pos.symbol, effectivePrice, historical, quote)

  // ── 2. Macro Analysis ──
  const macroAnalysis = analyzeMacro(pos.symbol, macro, sectorInfo)

  // ── 3. Geopolitical Analysis ──
  const geopoliticalAnalysis = analyzeGeopolitical(pos.symbol, geo, sectorInfo)

  // ── 4. Sector Analysis ──
  const sectorAnalysis = analyzeSector(pos.symbol, sector, macro, smartMoney)

  // ── 5. Institutional Analysis ──
  const institutionalAnalysis = analyzeInstitutional(sector, smartMoney)

  // ── Composite Scores (enhanced with recommendation engine + news) ──
  const techScore = technicalAnalysis.trend === 'STRONG_UP' ? 80 :
    technicalAnalysis.trend === 'UP' ? 50 :
    technicalAnalysis.trend === 'SIDEWAYS' ? 0 :
    technicalAnalysis.trend === 'DOWN' ? -40 : -70

  // Use recommendation engine's normalized score if available (much richer than our basic calc)
  const recScore = recommendation?.macroAlignmentScore ?? 0
  const newsScore = newsSentiment?.sentiment ?? 0

  const scores = {
    technical: techScore,
    macro: recommendation ? Math.round(recScore * 0.6) : macroAnalysis.score, // rec engine has better macro
    geopolitical: recommendation ? recommendation.scoreBreakdown.geopoliticalRisk : geopoliticalAnalysis.impactScore,
    sector: recommendation ? recommendation.scoreBreakdown.sectorMomentum : (sectorAnalysis.sectorTrend === 'BULLISH' ? 40 : sectorAnalysis.sectorTrend === 'BEARISH' ? -40 : 0),
    institutional: institutionalAnalysis.fiiStance === 'BUYING' ? 30 :
      institutionalAnalysis.fiiStance === 'SELLING' ? -30 : 0,
    overall: 0,
  }

  // Derivatives score (if available)
  const derivScore = derivatives?.available ? derivatives.sentimentScore : 0
  const insiderScore = insider?.available ? insider.score * 2 : 0  // Scale -50..50 → -100..100
  const deliveryScore = delivery?.available ? delivery.score * 3.3 : 0  // Scale -30..30 → ~-100..100

  // Weighted composite: Tech 15%, Macro 15%, Deriv 10%, News 10%, Geo 5%, Sector 5%, Inst 10%, Insider 10%, Delivery 10%, RS 10% (placeholder)
  scores.overall = Math.round(
    scores.technical * 0.15 +
    scores.macro * 0.15 +
    derivScore * 0.10 +
    newsScore * 0.10 +
    scores.geopolitical * 0.05 +
    scores.sector * 0.05 +
    scores.institutional * 0.10 +
    insiderScore * 0.10 +
    deliveryScore * 0.10 +
    0 * 0.10 // RS rank — Phase 2
  )

  // ── Verdict Determination ──
  const { verdict, confidence, reasoning, timeline } = determineVerdict(
    pos, effectivePrice, unrealizedPnlPercent, holdingDays, scores, technicalAnalysis, macro, hasLivePrice,
    recommendation, newsSentiment,
  )

  // ── Risk Assessment ──
  const riskScore = calculateRiskScore(unrealizedPnlPercent, scores, macro, geo, holdingDays)
  const maxDrawdownEstimate = estimateMaxDrawdown(scores, macro, technicalAnalysis)

  // ── Defensive Actions ──
  const defensiveActions = generateDefensiveActions(
    pos, effectivePrice, unrealizedPnlPercent, verdict, scores, macro, technicalAnalysis, hasLivePrice
  )

  // ── Key Levels ──
  // Only compute meaningful SL/target with live price, otherwise use key technical levels
  const atr = computeATR(historical)
  let suggestedStopLoss: number
  let suggestedTarget: number
  if (hasLivePrice) {
    suggestedStopLoss = pos.positionType === 'BUY'
      ? Math.round(effectivePrice * (1 - Math.max(0.025, atr > 0 ? (atr / effectivePrice) * 1.5 : 0.05)) * 100) / 100
      : Math.round(effectivePrice * (1 + Math.max(0.025, atr > 0 ? (atr / effectivePrice) * 1.5 : 0.05)) * 100) / 100
    suggestedTarget = pos.positionType === 'BUY'
      ? Math.round(effectivePrice * 1.08 * 100) / 100
      : Math.round(effectivePrice * 0.92 * 100) / 100
  } else {
    // No live price — use technical support/resistance if available, else 0 (UI shows "N/A")
    suggestedStopLoss = technicalAnalysis.keyLevels?.support ?? 0
    suggestedTarget = technicalAnalysis.keyLevels?.resistance ?? 0
  }

  // ── Bull/Bear Cases (enhanced with recommendation engine thesis) ──
  const bullCase = recommendation
    ? [...recommendation.thesis.bullishFactors, ...recommendation.thesis.macroTailwinds].slice(0, 6)
    : buildBullCase(pos.symbol, sectorInfo, macroAnalysis, technicalAnalysis, institutionalAnalysis)
  const bearCase = recommendation
    ? [...recommendation.thesis.bearishFactors, ...recommendation.thesis.macroHeadwinds].slice(0, 6)
    : buildBearCase(pos.symbol, sectorInfo, macroAnalysis, geopoliticalAnalysis, technicalAnalysis)
  const catalysts = buildCatalysts(sectorInfo, macroAnalysis, geopoliticalAnalysis)

  // ── Build intelligence section ──
  const intelligence: StockAnalysis['intelligence'] = {
    recommendation: recommendation?.action ?? null,
    recommendationConviction: recommendation?.conviction ?? 0,
    thesis: recommendation?.thesis.summary ?? `Limited intelligence available for ${pos.symbol}. Analysis based on technical and macro data only.`,
    macroTailwinds: recommendation?.thesis.macroTailwinds ?? macroAnalysis.tailwinds,
    macroHeadwinds: recommendation?.thesis.macroHeadwinds ?? macroAnalysis.headwinds,
    secondOrderEffects: recommendation?.thesis.secondOrderEffects ?? [],
    geoContext: recommendation?.thesis.geopoliticalContext ?? geopoliticalAnalysis.relevantEvents,
    newsHeadlines: newsHeadlines.slice(0, 8),
    newsSentiment: newsSentiment?.sentiment ?? null,
    newsSentimentFactors: newsSentiment?.keyFactors ?? [],
    newsRisks: newsSentiment?.risks ?? [],
    newsOpportunities: newsSentiment?.opportunities ?? [],
    tradePlan: [
      recommendation ? `${recommendation.tradePlan.suggestedAction}. ${recommendation.tradePlan.timeframe}. ${recommendation.tradePlan.positionSizeAdvice}. ${recommendation.tradePlan.riskNote}` : `Monitor ${pos.symbol} at current levels. ${technicalAnalysis.summary}`,
      derivatives?.available ? derivatives.interpretation : null,
    ].filter(Boolean).join(' '),
  }

  return {
    symbol: pos.symbol,
    exchange: pos.exchange,
    sector,
    industry,
    entryPrice: pos.entryPrice,
    currentPrice: effectivePrice,
    hasLivePrice,
    quantity,
    positionType: pos.positionType as 'BUY' | 'SELL',
    unrealizedPnl: Math.round(unrealizedPnl),
    unrealizedPnlPercent: Math.round(unrealizedPnlPercent * 100) / 100,
    holdingDays,
    verdict,
    verdictConfidence: confidence,
    verdictReasoning: reasoning,
    timeline,
    scores,
    technicalAnalysis,
    macroAnalysis,
    geopoliticalAnalysis,
    sectorAnalysis,
    institutionalAnalysis,
    defensiveActions,
    riskScore,
    maxDrawdownEstimate,
    suggestedStopLoss,
    suggestedTarget,
    bullCase,
    bearCase,
    catalysts,
    derivativesAnalysis: derivatives,
    insiderAnalysis: insider,
    deliveryAnalysis: delivery,
    intelligence,
  }
}

// ─── Technical Analysis ─────────────────────────────────────────────────────

function analyzeTechnicals(
  symbol: string,
  currentPrice: number,
  bars: any[],
  quote: any,
): StockAnalysis['technicalAnalysis'] {
  if (bars.length < 5) {
    return {
      trend: 'SIDEWAYS',
      rsi: null,
      volumeSignal: 'No data',
      smaAlignment: 'No data',
      priceVsSma20: null,
      keyLevels: null,
      summary: 'Insufficient historical data for technical analysis.',
    }
  }

  const closes = bars.map(b => b.close ?? b.price ?? 0).filter(Boolean)
  const volumes = bars.map(b => b.volume ?? 0)

  // SMAs
  const sma5 = avg(closes.slice(-5))
  const sma10 = avg(closes.slice(-10))
  const sma20 = closes.length >= 20 ? avg(closes.slice(-20)) : null
  const sma50 = closes.length >= 50 ? avg(closes.slice(-50)) : null

  // RSI(14)
  const rsi = closes.length >= 15 ? computeRSI(closes, 14) : null

  // Trend
  let trend: StockAnalysis['technicalAnalysis']['trend'] = 'SIDEWAYS'
  if (sma20 && sma50) {
    if (currentPrice > sma5 && sma5 > sma10 && sma10 > sma20 && sma20 > sma50) trend = 'STRONG_UP'
    else if (currentPrice > sma20 && sma5 > sma20) trend = 'UP'
    else if (currentPrice < sma5 && sma5 < sma10 && sma10 < sma20 && sma20 < sma50) trend = 'STRONG_DOWN'
    else if (currentPrice < sma20 && sma5 < sma20) trend = 'DOWN'
  } else if (sma20) {
    if (currentPrice > sma5 && sma5 > sma20) trend = 'UP'
    else if (currentPrice < sma5 && sma5 < sma20) trend = 'DOWN'
  }

  // Volume
  const avgVol = avg(volumes.slice(-20)) || 1
  const recentVol = avg(volumes.slice(-3)) || 0
  const volRatio = recentVol / avgVol
  const volumeSignal = volRatio > 2 ? 'Surge (2x+ average) — confirms move'
    : volRatio > 1.3 ? 'Above average — supporting trend'
    : volRatio < 0.5 ? 'Very low — lack of conviction'
    : 'Normal range'

  // SMA alignment
  const smaAlignment = sma20 && sma50
    ? (sma5 > sma10 && sma10 > sma20 && sma20 > sma50 ? 'Fully bullish (5>10>20>50)'
      : sma5 < sma10 && sma10 < sma20 && sma20 < sma50 ? 'Fully bearish (5<10<20<50)'
      : 'Mixed — no clear alignment')
    : sma20
      ? (currentPrice > sma20 ? 'Above SMA20 — short-term bullish' : 'Below SMA20 — short-term bearish')
      : 'Insufficient data'

  // Price vs SMA20
  const priceVsSma20 = sma20 ? Math.round(((currentPrice - sma20) / sma20) * 10000) / 100 : null

  // Key levels
  const recentHigh = Math.max(...closes.slice(-20))
  const recentLow = Math.min(...closes.slice(-20))
  const keyLevels = { support: Math.round(recentLow), resistance: Math.round(recentHigh) }

  // Summary
  const trendWord = trend === 'STRONG_UP' ? 'strong uptrend' : trend === 'UP' ? 'uptrend'
    : trend === 'SIDEWAYS' ? 'range-bound' : trend === 'DOWN' ? 'downtrend' : 'strong downtrend'
  const rsiNote = rsi ? (rsi > 70 ? ' RSI is overbought — pullback risk.' : rsi < 30 ? ' RSI is oversold — bounce potential.' : ` RSI at ${rsi.toFixed(0)}.`) : ''
  const summary = `${symbol} is in a ${trendWord}. ${smaAlignment}.${rsiNote} Volume ${volumeSignal.toLowerCase()}.`

  return { trend, rsi, volumeSignal, smaAlignment, priceVsSma20, keyLevels, summary }
}

// ─── Macro Analysis ─────────────────────────────────────────────────────────

function analyzeMacro(
  symbol: string,
  macro: MacroSnapshot | null,
  sectorInfo: SectorInfo | null,
): StockAnalysis['macroAnalysis'] {
  if (!macro) {
    return { score: 0, factors: [], tailwinds: [], headwinds: [], summary: 'Macro data unavailable.' }
  }

  const impact = getMacroImpactForStock(symbol, macro)
  const tailwinds: string[] = []
  const headwinds: string[] = []

  for (const f of impact.factors) {
    if (f.includes('positive') || f.includes('benefit') || f.includes('tailwind') || f.includes('+')) {
      tailwinds.push(f)
    } else if (f.includes('negative') || f.includes('hurt') || f.includes('headwind') || f.includes('pressure') || f.includes('-')) {
      headwinds.push(f)
    }
  }

  // Build narrative
  const parts: string[] = []
  if (Math.abs(impact.score) > 30) {
    parts.push(`${symbol} has ${impact.score > 0 ? 'significant macro tailwinds' : 'significant macro headwinds'} (impact: ${impact.score > 0 ? '+' : ''}${impact.score}).`)
  } else {
    parts.push(`Macro impact on ${symbol} is ${Math.abs(impact.score) < 10 ? 'neutral' : 'moderate'} (impact: ${impact.score > 0 ? '+' : ''}${impact.score}).`)
  }

  if (sectorInfo?.macroFactors && sectorInfo.macroFactors.length > 0) {
    parts.push(`Key macro sensitivities: ${sectorInfo.macroFactors.join(', ')}.`)
  }

  return {
    score: impact.score,
    factors: impact.factors,
    tailwinds,
    headwinds,
    summary: parts.join(' '),
  }
}

// ─── Geopolitical Analysis ──────────────────────────────────────────────────

function analyzeGeopolitical(
  symbol: string,
  geo: GeopoliticalSnapshot | null,
  sectorInfo: SectorInfo | null,
): StockAnalysis['geopoliticalAnalysis'] {
  if (!geo || geo.events.length === 0) {
    return { impactScore: 0, relevantEvents: [], warnings: [], summary: 'No significant geopolitical risks for this stock.' }
  }

  const impact = getGeopoliticalImpactForStock(symbol, geo)

  const summary = impact.impactScore === 0
    ? `No direct geopolitical impact on ${symbol}.`
    : `Geopolitical impact on ${symbol}: ${impact.impactScore > 0 ? 'positive' : 'negative'} (score: ${impact.impactScore > 0 ? '+' : ''}${impact.impactScore}). ${impact.warnings.join(' ')}`

  return {
    impactScore: impact.impactScore,
    relevantEvents: impact.relevantEvents.map(e => `[${e.type}] ${e.title}`),
    warnings: impact.warnings,
    summary,
  }
}

// ─── Sector Analysis ────────────────────────────────────────────────────────

function analyzeSector(
  symbol: string,
  sector: string,
  macro: MacroSnapshot | null,
  smartMoney: SmartMoneyAnalysis | null,
): StockAnalysis['sectorAnalysis'] {
  const sectorImpact = macro?.sectorImpacts?.[sector] ?? 0
  const sectorTrend = sectorImpact > 20 ? 'BULLISH' : sectorImpact < -20 ? 'BEARISH' : 'NEUTRAL'
  const sectorInfo = getSectorInfo(symbol)

  const peerComparison = `${symbol} is in the ${sector} sector (${sectorInfo?.industry ?? 'N/A'}).`
  const rotationSignal = sectorImpact > 30 ? 'Sector rotation INTO this sector — tailwind'
    : sectorImpact < -30 ? 'Sector rotation OUT of this sector — headwind'
    : 'No strong rotation signal'

  const summary = `${sector} sector outlook: ${sectorTrend.toLowerCase()} (macro impact: ${sectorImpact > 0 ? '+' : ''}${sectorImpact}). ${rotationSignal}.`

  return {
    sectorTrend,
    peerComparison,
    rotationSignal,
    macroFactors: sectorInfo?.macroFactors ?? [],
    summary,
  }
}

// ─── Institutional Analysis ─────────────────────────────────────────────────

function analyzeInstitutional(
  sector: string,
  smartMoney: SmartMoneyAnalysis | null,
): StockAnalysis['institutionalAnalysis'] {
  if (!smartMoney) {
    return {
      fiiStance: 'UNKNOWN',
      diiStance: 'UNKNOWN',
      flowImpact: 'No institutional flow data available.',
      summary: 'Institutional flow data unavailable.',
    }
  }

  const fiiStance = smartMoney.fiiTrend.direction
  const diiStance = smartMoney.diiTrend.direction

  const parts: string[] = []
  if (fiiStance === 'SELLING' && smartMoney.fiiTrend.consecutiveDays >= 3) {
    parts.push(`FIIs selling for ${smartMoney.fiiTrend.consecutiveDays} consecutive days — headwind for large-caps and index heavyweights.`)
  } else if (fiiStance === 'BUYING') {
    parts.push('FII buying supports market breadth and large-cap valuations.')
  }

  if (diiStance === 'BUYING') {
    parts.push('DII buying provides floor support — SIP flows and insurance allocations steady.')
  }

  const flowImpact = smartMoney.overallSignal === 'STRONG_BEARISH' || smartMoney.overallSignal === 'BEARISH'
    ? 'Net institutional selling — downward pressure on prices.'
    : smartMoney.overallSignal === 'STRONG_BULLISH' || smartMoney.overallSignal === 'BULLISH'
    ? 'Net institutional buying — supportive for prices.'
    : 'Mixed institutional flows — no clear direction.'

  return {
    fiiStance,
    diiStance,
    flowImpact,
    summary: parts.join(' ') || flowImpact,
  }
}

// ─── Verdict Determination ──────────────────────────────────────────────────

function determineVerdict(
  pos: PortfolioPosition,
  currentPrice: number,
  pnlPercent: number,
  holdingDays: number,
  scores: StockAnalysis['scores'],
  tech: StockAnalysis['technicalAnalysis'],
  macro: MacroSnapshot | null,
  hasLivePrice: boolean = true,
  recommendation: StockRecommendation | null = null,
  newsSentiment: GeminiSentimentResult | null = null,
): { verdict: Verdict; confidence: number; reasoning: string; timeline: StockAnalysis['timeline'] } {
  const overall = scores.overall
  const vix = macro?.volatility?.indiaVix ?? 15
  const isLong = pos.positionType === 'BUY'
  const staleWarning = hasLivePrice ? '' : ' ⚠ Analysis based on historical data — live price unavailable.'
  // Build context-aware reasoning from real intelligence
  const recThesis = recommendation?.thesis.oneLiner ?? ''
  const recAction = recommendation?.action ?? 'HOLD'
  const sentimentNote = newsSentiment && newsSentiment.keyFactors.length > 0
    ? ` News sentiment: ${newsSentiment.keyFactors[0]}.`
    : ''

  // Build headwind/tailwind context for reasoning
  const headwinds = recommendation?.thesis.bearishFactors.slice(0, 2).join('. ') ?? ''
  const tailwinds = recommendation?.thesis.bullishFactors.slice(0, 2).join('. ') ?? ''

  // EXIT signals — immediate danger
  if (isLong && pnlPercent < -15 && tech.trend === 'STRONG_DOWN') {
    return {
      verdict: 'EXIT',
      confidence: 90,
      reasoning: `${pos.symbol} is down ${Math.abs(pnlPercent).toFixed(1)}% in strong downtrend. ${headwinds || 'Multiple technical breakdowns with no reversal signals.'} ${recAction === 'AVOID' || recAction === 'SELL' ? `Recommendation engine also flags AVOID.` : ''}${sentimentNote} Cut losses to preserve capital.${staleWarning}`,
      timeline: 'IMMEDIATE',
    }
  }

  if (isLong && pnlPercent < -10 && overall < -30) {
    return {
      verdict: 'EXIT',
      confidence: 80,
      reasoning: `${pos.symbol} down ${Math.abs(pnlPercent).toFixed(1)}% with adverse conditions across the board. ${headwinds || 'Macro, sector, and technical all negative.'} ${sentimentNote} Multiple headwinds suggest further downside.${staleWarning}`,
      timeline: 'IMMEDIATE',
    }
  }

  if (isLong && pnlPercent < -8 && vix > 28 && tech.trend === 'DOWN') {
    return {
      verdict: 'EXIT',
      confidence: 75,
      reasoning: `${pos.symbol} losing ${Math.abs(pnlPercent).toFixed(1)}% with VIX at ${vix.toFixed(0)} (extreme fear). ${headwinds || 'Downtrend in high-volatility regime.'} Risk of accelerated selling.${staleWarning}`,
      timeline: 'IMMEDIATE',
    }
  }

  // PARTIAL EXIT — concerning but not critical
  if (isLong && pnlPercent < -5 && overall < -15) {
    return {
      verdict: 'PARTIAL_EXIT',
      confidence: 70,
      reasoning: `${pos.symbol} down ${Math.abs(pnlPercent).toFixed(1)}%. ${headwinds || `Weak signals across macro (${scores.macro}) and sector (${scores.sector}).`}${sentimentNote} Reduce exposure by 50% and reassess.${staleWarning}`,
      timeline: '1-2_WEEKS',
    }
  }

  // Also check: rec engine says AVOID/SELL but we're holding with losses
  if (isLong && pnlPercent < -3 && (recAction === 'AVOID' || recAction === 'SELL')) {
    return {
      verdict: 'PARTIAL_EXIT',
      confidence: 65,
      reasoning: `${pos.symbol} down ${Math.abs(pnlPercent).toFixed(1)}% and recommendation engine flags ${recAction}. ${recThesis || headwinds}${sentimentNote} Consider reducing position.${staleWarning}`,
      timeline: '1-2_WEEKS',
    }
  }

  if (isLong && pnlPercent > 15 && tech.rsi && tech.rsi > 72) {
    return {
      verdict: 'PARTIAL_EXIT',
      confidence: 65,
      reasoning: `${pos.symbol} up ${pnlPercent.toFixed(1)}% with overbought RSI (${tech.rsi.toFixed(0)}). Book partial profits and trail stop-loss.${sentimentNote}`,
      timeline: '1-2_WEEKS',
    }
  }

  // HEDGE — significant risk but position has merit
  if (vix > 25 && overall < 0 && Math.abs(pnlPercent) < 5) {
    return {
      verdict: 'HEDGE',
      confidence: 60,
      reasoning: `${pos.symbol} near breakeven with VIX at ${vix.toFixed(0)} (elevated fear). ${headwinds || 'Market environment hostile.'} Hedge with puts or reduce size 30-40%.${sentimentNote}${staleWarning}`,
      timeline: '1-2_WEEKS',
    }
  }

  // BUY MORE — strong conviction + dip opportunity (must be confirmed by rec engine or news)
  if (isLong && pnlPercent < 0 && pnlPercent > -8 && overall > 20 && tech.trend !== 'STRONG_DOWN') {
    const recConfirms = recAction === 'BUY' || recAction === 'STRONG_BUY'
    const newsConfirms = newsSentiment && newsSentiment.sentiment > 20
    if (recConfirms || newsConfirms) {
      return {
        verdict: 'BUY_MORE',
        confidence: Math.min(80, 50 + overall / 2),
        reasoning: `${pos.symbol} at ${Math.abs(pnlPercent).toFixed(1)}% discount. ${tailwinds || recThesis || 'Multiple positive signals.'} ${recConfirms ? `Rec engine: ${recAction} (${recommendation!.conviction}% conviction).` : ''}${sentimentNote} Average down on dips.${staleWarning}`,
        timeline: '1-2_WEEKS',
      }
    }
  }

  if (isLong && overall > 40 && tech.trend === 'UP' && (tech.rsi ?? 50) < 65) {
    return {
      verdict: 'BUY_MORE',
      confidence: Math.min(85, 55 + overall / 2),
      reasoning: `${pos.symbol} in uptrend with strong macro alignment. ${tailwinds || recThesis}${sentimentNote} Add to winners on pullbacks.${staleWarning}`,
      timeline: '1-3_MONTHS',
    }
  }

  // STRONG HOLD — everything aligned
  if (overall > 20 && (tech.trend === 'UP' || tech.trend === 'STRONG_UP') && pnlPercent > 0) {
    return {
      verdict: 'STRONG_HOLD',
      confidence: Math.min(85, 60 + overall / 3),
      reasoning: `${pos.symbol} up ${pnlPercent.toFixed(1)}% in uptrend. ${tailwinds || recThesis || 'Favorable macro + sector conditions.'}${sentimentNote} Let winners run with trailing stop.${staleWarning}`,
      timeline: '1-3_MONTHS',
    }
  }

  // Default: HOLD with context
  const holdReason = recThesis || (headwinds && tailwinds ? `Mixed signals — ${tailwinds.split('.')[0]} vs ${headwinds.split('.')[0]}.` : tech.summary)
  return {
    verdict: 'HOLD',
    confidence: Math.round(Math.min(70, 40 + Math.abs(overall) / 3) * (hasLivePrice ? 1 : 0.6)),
    reasoning: `${pos.symbol}: ${holdReason}${sentimentNote} ${holdingDays > 30 ? 'Holding for ' + holdingDays + ' days — review thesis.' : 'Monitor for trend confirmation.'}${staleWarning}`,
    timeline: '1-2_WEEKS',
  }
}

// ─── Risk Assessment ────────────────────────────────────────────────────────

function calculateRiskScore(
  pnlPercent: number,
  scores: StockAnalysis['scores'],
  macro: MacroSnapshot | null,
  geo: GeopoliticalSnapshot | null,
  holdingDays: number,
): number {
  let risk = 50 // base

  // P&L risk
  if (pnlPercent < -10) risk += 25
  else if (pnlPercent < -5) risk += 15
  else if (pnlPercent < -2) risk += 5
  else if (pnlPercent > 20) risk += 5 // risk of giving back gains

  // Overall score (negative = risky)
  risk -= scores.overall / 3

  // VIX risk
  const vix = macro?.volatility?.indiaVix ?? 15
  if (vix > 30) risk += 20
  else if (vix > 25) risk += 12
  else if (vix > 20) risk += 5

  // Geo risk
  if (geo?.overallRisk === 'EXTREME') risk += 15
  else if (geo?.overallRisk === 'HIGH') risk += 8

  // Holding period risk (longer = more exposure)
  if (holdingDays > 60) risk += 5
  if (holdingDays > 120) risk += 5

  return Math.max(0, Math.min(100, Math.round(risk)))
}

function estimateMaxDrawdown(
  scores: StockAnalysis['scores'],
  macro: MacroSnapshot | null,
  tech: StockAnalysis['technicalAnalysis'],
): number {
  let drawdown = 5 // base 5% drawdown estimate

  if (tech.trend === 'STRONG_DOWN') drawdown += 10
  else if (tech.trend === 'DOWN') drawdown += 5

  if (scores.overall < -30) drawdown += 8
  else if (scores.overall < -10) drawdown += 4

  const vix = macro?.volatility?.indiaVix ?? 15
  if (vix > 30) drawdown += 8
  else if (vix > 25) drawdown += 4

  return Math.min(35, Math.round(drawdown))
}

// ─── Defensive Actions ──────────────────────────────────────────────────────

function generateDefensiveActions(
  pos: PortfolioPosition,
  currentPrice: number,
  pnlPercent: number,
  verdict: Verdict,
  scores: StockAnalysis['scores'],
  macro: MacroSnapshot | null,
  tech: StockAnalysis['technicalAnalysis'],
  hasLivePrice: boolean = true,
): DefensiveAction[] {
  const actions: DefensiveAction[] = []
  const isLong = pos.positionType === 'BUY'
  const vix = macro?.volatility?.indiaVix ?? 15

  // Warn if no live price
  if (!hasLivePrice) {
    actions.push({
      action: `⚠ No live price for ${pos.symbol}`,
      urgency: 'IMMEDIATE',
      detail: `Could not fetch current market price for ${pos.symbol}. All analysis uses historical/entry data and may be inaccurate. Check broker connection and verify symbol.`,
    })
  }

  // Stop-loss — only suggest specific ₹ levels if we have a live price
  if (!pos.stopLoss && isLong) {
    if (hasLivePrice) {
      const slLevel = Math.round(currentPrice * 0.95 * 100) / 100
      actions.push({
        action: `Set stop-loss at ₹${slLevel}`,
        urgency: 'IMMEDIATE',
        detail: `No stop-loss set on ${pos.symbol}. Place SL at ₹${slLevel} (5% below CMP ₹${currentPrice}) to limit downside.`,
      })
    } else {
      actions.push({
        action: `Set stop-loss for ${pos.symbol}`,
        urgency: 'IMMEDIATE',
        detail: `No stop-loss set. Look up the current price and place SL at 5% below CMP or at key support (${tech.keyLevels?.support ? '₹' + tech.keyLevels.support : 'check chart'}).`,
      })
    }
  }

  // Large unrealized loss
  if (isLong && pnlPercent < -10) {
    actions.push({
      action: `Review exit for ${pos.symbol}`,
      urgency: 'IMMEDIATE',
      detail: `Position is down ${Math.abs(pnlPercent).toFixed(1)}%. Evaluate if original thesis still holds. If not, cut losses. Consider exiting 50% now and trailing remaining.`,
    })
  }

  // High VIX + losing position
  if (vix > 25 && pnlPercent < 0) {
    actions.push({
      action: `Reduce position size on ${pos.symbol}`,
      urgency: 'THIS_WEEK',
      detail: `VIX at ${vix.toFixed(1)} signals elevated risk. Reduce position by ${vix > 30 ? '50%' : '30%'} to manage overnight gap risk.`,
    })
  }

  // Overbought with large gains
  if (tech.rsi && tech.rsi > 75 && pnlPercent > 10) {
    actions.push({
      action: `Trail stop-loss on ${pos.symbol}`,
      urgency: 'THIS_WEEK',
      detail: `RSI at ${tech.rsi.toFixed(0)} (overbought) with ${pnlPercent.toFixed(1)}% gains. Move SL to breakeven or higher. Consider booking 30-50% profits.`,
    })
  }

  // Downtrend warning
  if ((tech.trend === 'DOWN' || tech.trend === 'STRONG_DOWN') && isLong && verdict !== 'EXIT') {
    actions.push({
      action: `Monitor ${pos.symbol} daily`,
      urgency: 'THIS_WEEK',
      detail: `Stock is in ${tech.trend === 'STRONG_DOWN' ? 'strong ' : ''}downtrend. Watch for bounce near ${tech.keyLevels?.support ?? 'support'}. Exit if support breaks on volume.`,
    })
  }

  // No target set
  if (!pos.target && isLong && pnlPercent >= 0 && hasLivePrice) {
    const targetLevel = Math.round(currentPrice * 1.10 * 100) / 100
    actions.push({
      action: `Set profit target for ${pos.symbol}`,
      urgency: 'THIS_WEEK',
      detail: `No target set. Consider ₹${targetLevel} (+10% from CMP ₹${currentPrice}) as initial target. Use trailing stops to protect gains.`,
    })
  }

  return actions
}

// ─── Thesis Builders ────────────────────────────────────────────────────────

function buildBullCase(
  symbol: string,
  sectorInfo: SectorInfo | null,
  macro: StockAnalysis['macroAnalysis'],
  tech: StockAnalysis['technicalAnalysis'],
  inst: StockAnalysis['institutionalAnalysis'],
): string[] {
  const points: string[] = []

  if (tech.trend === 'UP' || tech.trend === 'STRONG_UP') points.push(`Technical uptrend intact — ${tech.smaAlignment}`)
  if (tech.rsi && tech.rsi > 40 && tech.rsi < 60) points.push(`RSI at ${tech.rsi.toFixed(0)} — room to run before overbought`)
  if (tech.rsi && tech.rsi < 35) points.push(`RSI oversold at ${tech.rsi.toFixed(0)} — mean reversion bounce likely`)
  if (macro.tailwinds.length > 0) points.push(`Macro tailwinds: ${macro.tailwinds[0]}`)
  if (macro.score > 20) points.push(`Strong macro alignment (+${macro.score}) supports the stock`)
  if (inst.fiiStance === 'BUYING') points.push('FII buying provides institutional support')
  if (inst.diiStance === 'BUYING') points.push('DII buying adds domestic floor support')

  if (points.length === 0) points.push('Limited bullish catalysts at present — hold with caution')
  return points.slice(0, 5)
}

function buildBearCase(
  symbol: string,
  sectorInfo: SectorInfo | null,
  macro: StockAnalysis['macroAnalysis'],
  geo: StockAnalysis['geopoliticalAnalysis'],
  tech: StockAnalysis['technicalAnalysis'],
): string[] {
  const points: string[] = []

  if (tech.trend === 'DOWN' || tech.trend === 'STRONG_DOWN') points.push(`Technical downtrend — ${tech.smaAlignment}`)
  if (tech.rsi && tech.rsi > 70) points.push(`RSI overbought at ${tech.rsi.toFixed(0)} — pullback risk`)
  if (macro.headwinds.length > 0) points.push(`Macro headwind: ${macro.headwinds[0]}`)
  if (macro.score < -20) points.push(`Adverse macro conditions (impact: ${macro.score})`)
  if (geo.impactScore < -15) points.push(`Geopolitical risk: ${geo.relevantEvents[0] ?? 'elevated uncertainty'}`)
  if (geo.warnings.length > 0) points.push(geo.warnings[0])

  if (points.length === 0) points.push('No major bearish factors identified currently')
  return points.slice(0, 5)
}

function buildCatalysts(
  sectorInfo: SectorInfo | null,
  macro: StockAnalysis['macroAnalysis'],
  geo: StockAnalysis['geopoliticalAnalysis'],
): string[] {
  const catalysts: string[] = []

  catalysts.push('Quarterly earnings announcement')
  if (sectorInfo?.macroFactors?.includes('Interest Rates')) catalysts.push('RBI monetary policy decision')
  if (sectorInfo?.macroFactors?.includes('Crude Oil Prices')) catalysts.push('OPEC production decisions')
  if (sectorInfo?.macroFactors?.includes('USD-INR')) catalysts.push('USD/INR movement and FII flow direction')
  if (geo.relevantEvents.length > 0) catalysts.push('Geopolitical de-escalation/escalation')

  return catalysts.slice(0, 4)
}

// ─── Technical Helpers ──────────────────────────────────────────────────────

function computeRSI(closes: number[], period: number): number {
  if (closes.length < period + 1) return 50
  let gains = 0, losses = 0
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff > 0) gains += diff
    else losses += Math.abs(diff)
  }
  const avgGain = gains / period
  const avgLoss = losses / period || 0.0001
  const rs = avgGain / avgLoss
  return Math.round((100 - 100 / (1 + rs)) * 100) / 100
}

function computeATR(bars: any[], period: number = 14): number {
  if (bars.length < period + 1) return 0
  const trs: number[] = []
  for (let i = bars.length - period; i < bars.length; i++) {
    const high = bars[i].high ?? bars[i].close ?? 0
    const low = bars[i].low ?? bars[i].close ?? 0
    const prevClose = bars[i - 1]?.close ?? bars[i - 1]?.price ?? 0
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)))
  }
  return trs.reduce((s, v) => s + v, 0) / trs.length
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((s, v) => s + v, 0) / arr.length
}
