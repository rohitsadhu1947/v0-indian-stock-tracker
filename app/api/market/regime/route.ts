/**
 * Market Regime API
 * GET /api/market/regime
 *
 * Analyzes NIFTY 50 to determine current market regime
 * (bull, bear, sideways) with trading implications
 */

import { NextRequest, NextResponse } from 'next/server'
import { getBrokerManager, KiteBrokerClient } from '@/lib/broker'
import { analyzeMarketRegime, getRegimeColor, getRegimeEmoji, type HistoricalBar } from '@/lib/market-regime'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Cache regime analysis for 5 minutes (market conditions don't change that fast)
let cachedRegime: any = null
let cacheTimestamp: number = 0
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

export async function GET(request: NextRequest) {
  try {
    console.log('\n📊 === MARKET REGIME API CALLED ===')

    // Check cache
    const now = Date.now()
    if (cachedRegime && (now - cacheTimestamp) < CACHE_DURATION) {
      console.log('✅ Returning cached regime analysis')
      return NextResponse.json({
        success: true,
        cached: true,
        ...cachedRegime
      })
    }

    // Get broker manager
    const manager = await getBrokerManager()
    if (!manager.hasConnection()) {
      console.error('❌ Broker authentication required')
      return NextResponse.json({
        success: false,
        error: 'No broker connections available. Admin must connect a broker in settings.'
      }, { status: 401 })
    }
    const client = manager.getClient() as KiteBrokerClient
    const kc = client.getRawClient()

    console.log('✅ Kite initialized')

    // Fetch NIFTY 50 index data
    // NIFTY 50 instrument token is 256265
    const NIFTY_INSTRUMENT_TOKEN = 256265
    const NIFTY_SYMBOL = 'NIFTY 50'

    // Get current quote
    console.log('📊 Fetching NIFTY 50 current price...')
    const quotes = await kc.getQuote(['NSE:NIFTY 50'])
    const niftyQuote = quotes['NSE:NIFTY 50']

    if (!niftyQuote) {
      throw new Error('Failed to fetch NIFTY 50 quote')
    }

    console.log(`✅ NIFTY 50 current: ₹${niftyQuote.last_price}`)

    // Get historical data (60 days for SMA calculations)
    console.log('📊 Fetching NIFTY 50 historical data (60 days)...')
    const toDate = new Date()
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - 60)

    const historical = await kc.getHistoricalData(
      NIFTY_INSTRUMENT_TOKEN,
      'day',
      fromDate.toISOString().split('T')[0],
      toDate.toISOString().split('T')[0]
    )

    console.log(`✅ Got ${historical.length} historical bars`)

    if (historical.length < 20) {
      throw new Error('Insufficient historical data for regime analysis')
    }

    // Convert to our format
    const bars: HistoricalBar[] = historical.map((bar: any) => ({
      date: new Date(bar.date),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume
    }))

    // Analyze regime
    console.log('🔍 Analyzing market regime...')
    const regime = analyzeMarketRegime(bars, niftyQuote.last_price)

    console.log(`✅ Regime: ${regime.regime} (${regime.confidence}% confidence)`)
    console.log(`   Recommendation: ${regime.recommendation}`)

    // Build response
    const response = {
      regime: regime.regime,
      regimeEmoji: getRegimeEmoji(regime.regime),
      regimeColor: getRegimeColor(regime.regime),
      confidence: regime.confidence,

      // Market data
      market: {
        index: 'NIFTY 50',
        price: regime.niftyPrice,
        change: regime.niftyChange,
        changePercent: regime.niftyChangePercent,
        dayHigh: niftyQuote.ohlc?.high || niftyQuote.last_price,
        dayLow: niftyQuote.ohlc?.low || niftyQuote.last_price,
        open: niftyQuote.ohlc?.open || niftyQuote.last_price
      },

      // Technical indicators
      indicators: {
        sma20: regime.sma20,
        sma50: regime.sma50,
        sma200: regime.sma200,
        rsi: regime.rsi,
        trendStrength: regime.trendStrength,
        trendDirection: regime.trendDirection
      },

      // Price vs SMAs
      pricePosition: {
        vsSma20: regime.priceVsSma20,
        vsSma50: regime.priceVsSma50,
        vsSma200: regime.priceVsSma200
      },

      // Volatility
      volatility: {
        regime: regime.volatility,
        percent: regime.volatilityPercent
      },

      // Trading implications
      trading: {
        positionSizeMultiplier: regime.positionSizeMultiplier,
        riskTolerance: regime.riskTolerance,
        recommendation: regime.recommendation
      },

      // Signals and warnings
      signals: regime.signals,
      warnings: regime.warnings,

      // Metadata
      analyzedAt: regime.analyzedAt.toISOString()
    }

    // Update cache
    cachedRegime = response
    cacheTimestamp = now

    return NextResponse.json({
      success: true,
      cached: false,
      ...response
    })

  } catch (error: any) {
    console.error('❌ Market regime error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to analyze market regime',
      details: error.message
    }, { status: 500 })
  }
}
