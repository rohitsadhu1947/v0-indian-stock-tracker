import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'
import { getUserBrokerManager } from '@/lib/broker'
import type { QuoteData, CandleData } from '@/lib/broker'
import { db } from '@/db'
import { marketDashboard } from '@/db/schema'
import { STOCK_SECTOR_MAP } from '@/lib/sector-mapping'
import type {
  MarketIndex,
  SectorPerformance,
  MarketBreadth,
  TopMover,
} from '@/lib/market-dashboard'
import {
  calculateBreadthSentiment,
  generateStockSpotlight,
} from '@/lib/market-dashboard'
import { getMacroSnapshot } from '@/lib/macro-intelligence'
import { analyzeMarketRegime, type HistoricalBar } from '@/lib/market-regime'
import { fetchFIIDIIData, analyzeSmartMoney } from '@/lib/smart-money-tracker'
import { detectGeopoliticalEvents } from '@/lib/geopolitical-monitor'
import { generateMorningNote, calculateSentimentV2 } from '@/lib/morning-note'
import logger from '@/lib/logger'

export const dynamic = 'force-dynamic'

// Full NIFTY 50 constituents
const NIFTY_50 = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
  'HINDUNILVR', 'ITC', 'SBIN', 'BHARTIARTL', 'KOTAKBANK',
  'LT', 'AXISBANK', 'ASIANPAINT', 'MARUTI', 'BAJFINANCE',
  'HCLTECH', 'WIPRO', 'ULTRACEMCO', 'NTPC', 'SUNPHARMA',
  'TITAN', 'NESTLEIND', 'POWERGRID', 'M&M', 'TATAMOTORS',
  'ADANIPORTS', 'BAJAJFINSV', 'TECHM', 'ONGC', 'COALINDIA',
  'TATASTEEL', 'HINDALCO', 'JSWSTEEL', 'DRREDDY', 'CIPLA',
  'BPCL', 'GRASIM', 'DIVISLAB', 'EICHERMOT', 'APOLLOHOSP',
  'INDUSINDBK', 'BRITANNIA', 'TATACONSUM', 'HEROMOTOCO',
  'BAJAJ-AUTO', 'SHREECEM', 'SBILIFE', 'HDFCLIFE', 'LTIM',
  'TRENT',
]

const NIFTY_INSTRUMENT_TOKEN = 256265

/**
 * GET /api/market/dashboard
 *
 * Returns comprehensive market dashboard with morning note intelligence.
 */
export async function GET(request: NextRequest) {
  try {
    logger.info('Fetching market dashboard...')

    const userId = await getAuthenticatedUserIdCompat()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }

    const manager = await getUserBrokerManager()
    if (!manager.hasConnection()) {
      return NextResponse.json(
        { success: false, error: 'No broker connections available. Admin must connect a broker in settings.' },
        { status: 401 }
      )
    }
    const client = manager.getClient()

    // ── Phase 1: Broker data (required) ──────────────────────────────────────

    const indexSymbols = [
      'NSE:NIFTY 50', 'NSE:NIFTY BANK', 'NSE:NIFTY FIN SERVICE',
      'NSE:NIFTY IT', 'NSE:NIFTY AUTO', 'NSE:NIFTY PHARMA',
    ]
    const stockSymbols = NIFTY_50.map(s => `NSE:${s}`)

    const [indicesData, stocksData] = await Promise.all([
      client.getQuote(indexSymbols),
      client.getQuote(stockSymbols),
    ])

    const indices: MarketIndex[] = Object.entries(indicesData).map(([symbol, data]: [string, QuoteData]) => {
      const name = symbol.replace('NSE:', '').replace(' 50', '').replace('NIFTY ', '')
      return {
        name,
        symbol: name.replace(' ', ''),
        current: data.lastPrice,
        change: data.lastPrice - data.close,
        changePercent: ((data.lastPrice - data.close) / data.close) * 100,
        open: data.open,
        high: data.high,
        low: data.low,
        previousClose: data.close,
      }
    })

    const stocks = Object.entries(stocksData).map(([symbol, data]: [string, QuoteData]) => {
      const sym = symbol.replace('NSE:', '')
      return {
        symbol: sym,
        current: data.lastPrice,
        change: data.lastPrice - data.close,
        changePercent: ((data.lastPrice - data.close) / data.close) * 100,
        volume: data.volume,
        previousClose: data.close,
        sector: STOCK_SECTOR_MAP[sym]?.sector || 'Others',
      }
    })

    logger.info('Fetched broker data', { indices: indices.length, stocks: stocks.length })

    // ── Phase 2: Parallel non-fatal data sources ─────────────────────────────

    const now = new Date()
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)

    const [macroResult, historicalResult, fiidiiResult, newsResult] = await Promise.allSettled([
      getMacroSnapshot(),
      client.getHistoricalData({
        instrumentToken: NIFTY_INSTRUMENT_TOKEN,
        exchange: 'NSE',
        symbol: 'NIFTY 50',
        interval: 'day',
        from: sixtyDaysAgo,
        to: now,
      }),
      fetchFIIDIIData(),
      fetchNewsHeadlines(),
    ])

    const macro = macroResult.status === 'fulfilled' ? macroResult.value : null
    const historicalBars = historicalResult.status === 'fulfilled' ? historicalResult.value : null
    const fiidiiData = fiidiiResult.status === 'fulfilled' ? fiidiiResult.value : []
    const headlines = newsResult.status === 'fulfilled' ? newsResult.value : []

    // Log failures
    if (macroResult.status === 'rejected') logger.warn('Macro fetch failed', { error: macroResult.reason?.message })
    if (historicalResult.status === 'rejected') logger.warn('Historical fetch failed', { error: historicalResult.reason?.message })
    if (fiidiiResult.status === 'rejected') logger.warn('FII/DII fetch failed', { error: fiidiiResult.reason?.message })

    // ── Phase 3: Derived analysis ────────────────────────────────────────────

    // Market regime from NIFTY 50 historical data
    let regime = null
    if (historicalBars && historicalBars.length >= 20) {
      const bars: HistoricalBar[] = historicalBars.map((c: CandleData) => ({
        date: c.date,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }))
      regime = analyzeMarketRegime(bars)
    }

    // Smart money analysis
    const smartMoney = fiidiiData.length > 0 ? analyzeSmartMoney(fiidiiData, []) : null

    // Geopolitical analysis from headlines
    const geopolitical = headlines.length > 0 ? await detectGeopoliticalEvents(headlines) : null

    logger.info('Derived analysis complete', {
      regime: regime?.regime ?? 'unavailable',
      smartMoney: smartMoney?.overallSignal ?? 'unavailable',
      geopolitical: geopolitical?.overallRisk ?? 'unavailable',
      macro: macro ? 'available' : 'unavailable',
    })

    // ── Phase 4: Market breadth & sectors ────────────────────────────────────

    const advancers = stocks.filter(s => s.change > 0).length
    const decliners = stocks.filter(s => s.change < 0).length
    const unchanged = stocks.filter(s => s.change === 0).length
    const advanceDeclineRatio = decliners > 0 ? advancers / decliners : advancers

    const marketBreadth: MarketBreadth = {
      advancers,
      decliners,
      unchanged,
      advanceDeclineRatio,
      stocksAt52WeekHigh: 0, // Removed fake data — needs real historical check
      stocksAt52WeekLow: 0,
      highLowRatio: 0,
      sentiment: 'NEUTRAL',
    }
    marketBreadth.sentiment = calculateBreadthSentiment(marketBreadth)

    // Sector performance — use 1.0% threshold instead of 0.5%
    const sectorNames = [...new Set(stocks.map(s => s.sector).filter(s => s !== 'Others'))]
    const sectorPerformance: SectorPerformance[] = sectorNames.map(sector => {
      const sectorStocks = stocks.filter(s => s.sector === sector)
      const avgChange = sectorStocks.length > 0
        ? sectorStocks.reduce((sum, s) => sum + s.changePercent, 0) / sectorStocks.length
        : 0

      const sorted = [...sectorStocks].sort((a, b) => b.changePercent - a.changePercent)
      const stocksUp = sectorStocks.filter(s => s.change > 0).length
      const stocksDown = sectorStocks.filter(s => s.change < 0).length

      return {
        sector,
        change: avgChange,
        topGainer: sorted[0]?.symbol || 'N/A',
        topLoser: sorted[sorted.length - 1]?.symbol || 'N/A',
        stocksUp,
        stocksDown,
        volume: sectorStocks.reduce((sum, s) => sum + s.volume, 0),
        sentiment: avgChange > 1.0 ? 'BULLISH' as const : avgChange < -1.0 ? 'BEARISH' as const : 'NEUTRAL' as const,
      }
    })

    // Top movers
    const topGainers: TopMover[] = stocks
      .filter(s => s.changePercent > 0)
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 10)
      .map(s => ({ symbol: s.symbol, name: s.symbol, current: s.current, change: s.change, changePercent: s.changePercent, volume: s.volume, sector: s.sector }))

    const topLosers: TopMover[] = stocks
      .filter(s => s.changePercent < 0)
      .sort((a, b) => a.changePercent - b.changePercent)
      .slice(0, 10)
      .map(s => ({ symbol: s.symbol, name: s.symbol, current: s.current, change: s.change, changePercent: s.changePercent, volume: s.volume, sector: s.sector }))

    const mostActive: TopMover[] = stocks
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 10)
      .map(s => ({ symbol: s.symbol, name: s.symbol, current: s.current, change: s.change, changePercent: s.changePercent, volume: s.volume, sector: s.sector }))

    // ── Phase 5: Morning Note ────────────────────────────────────────────────

    const morningNote = generateMorningNote({
      indices,
      sectorPerformance,
      breadth: marketBreadth,
      macro,
      regime,
      smartMoney,
      geopolitical,
      newsHeadlines: headlines,
    })

    // Stock spotlight (uses old sentiment for backward compat, but morningNote.sentiment is the real one)
    const stockSpotlight = generateStockSpotlight(topGainers, topLosers, sectorPerformance, {
      overall: morningNote.sentiment.overall,
      score: morningNote.sentiment.score,
      factors: {
        technicals: morningNote.sentiment.components.technicals,
        breadth: morningNote.sentiment.components.breadth,
        volume: morningNote.sentiment.components.sectors,
        news: morningNote.sentiment.components.newsGeo,
        institutional: morningNote.sentiment.components.fiiDii,
      },
      signals: morningNote.sentiment.overrides,
      recommendation: morningNote.sentiment.recommendation,
    })

    logger.info('Morning note generated', {
      sentiment: morningNote.sentiment.overall,
      score: morningNote.sentiment.score,
      overrides: morningNote.sentiment.overrides.length,
    })

    // ── Build response ───────────────────────────────────────────────────────

    const fullDashboard = {
      timestamp: new Date(),
      indices,
      sectorPerformance,
      marketBreadth,
      topGainers,
      topLosers,
      mostActive,
      stockSpotlight,
      // V2 sentiment from morning note (replaces old sentiment)
      marketSentiment: {
        overall: morningNote.sentiment.overall,
        score: morningNote.sentiment.score,
        factors: morningNote.sentiment.components,
        signals: morningNote.sentiment.overrides,
        recommendation: morningNote.sentiment.recommendation,
      },
      // Full morning note
      morningNote,
      // Backward compat
      dailyAnalysis: {
        date: new Date().toISOString().split('T')[0],
        openingAnalysis: morningNote.sentiment.recommendation,
        keyLevels: morningNote.technicalLevels,
        sectorsToWatch: morningNote.sectorCalls.calls.filter(c => c.call === 'BUY').map(c => c.sector),
        stocksToWatch: [...topGainers.slice(0, 3).map(s => s.symbol), ...topLosers.slice(0, 2).map(s => s.symbol)],
        tradingStrategy: morningNote.playbook.dos[0] || 'Wait for clarity.',
        riskLevel: morningNote.sentiment.score < 30 ? 'VERY_HIGH' as const
          : morningNote.sentiment.score < 45 ? 'HIGH' as const
          : morningNote.sentiment.score < 60 ? 'MODERATE' as const
          : 'LOW' as const,
        volatilityExpectation: (macro?.volatility?.riskLevel === 'HIGH' || macro?.volatility?.riskLevel === 'EXTREME') ? 'HIGH' as const
          : macro?.volatility?.riskLevel === 'MODERATE' ? 'MODERATE' as const
          : 'LOW' as const,
        alerts: [],
      },
      alerts: [],
    }

    // Persist to DB (non-fatal)
    try {
      await db.insert(marketDashboard).values({
        dashboardType: 'daily',
        data: fullDashboard as any,
        marketSentiment: morningNote.sentiment.overall,
        validUntil: new Date(Date.now() + 15 * 60 * 1000),
        createdAt: new Date(),
      })
    } catch (dbError: any) {
      logger.warn('Failed to save dashboard to DB', { error: dbError.message })
    }

    return NextResponse.json({ success: true, data: fullDashboard })

  } catch (error: any) {
    logger.error('Dashboard generation failed', { error: error.message, stack: error.stack })
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate market dashboard' },
      { status: 500 }
    )
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fetch news headlines for geopolitical & sentiment analysis.
 * Uses the internal multi-layer news API.
 */
async function fetchNewsHeadlines(): Promise<string[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3006'
    const res = await fetch(`${baseUrl}/api/news/multi-layer?symbol=NIFTY&limit=15`, {
      next: { revalidate: 300 },
    })
    if (!res.ok) return []
    const data = await res.json()
    if (!data.success || !Array.isArray(data.articles)) return []
    return data.articles.map((a: any) => a.title || a.headline || '').filter(Boolean)
  } catch {
    return []
  }
}
