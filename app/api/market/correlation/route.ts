/**
 * Correlation Matrix API
 * GET /api/market/correlation?symbols=RELIANCE,TCS,INFY,HDFCBANK
 *
 * Calculates correlation matrix for given stocks
 * Used for portfolio diversification analysis
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserBrokerManager } from '@/lib/broker'
import type { InstrumentData } from '@/lib/broker'
import {
  calculateCorrelationMatrix,
  calculatePortfolioCorrelationScore,
  type PriceData
} from '@/lib/correlation-matrix'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Default stocks for correlation analysis (top liquid stocks)
const DEFAULT_SYMBOLS = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
  'HINDUNILVR', 'ITC', 'SBIN', 'BHARTIARTL', 'KOTAKBANK',
  'LT', 'AXISBANK', 'MARUTI', 'TITAN', 'SUNPHARMA'
]

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserIdCompat()
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    console.log('\n📊 === CORRELATION MATRIX API CALLED ===')

    // Get query parameters
    const searchParams = request.nextUrl.searchParams
    const symbolsParam = searchParams.get('symbols')
    const daysParam = searchParams.get('days') || '30'
    const portfolioParam = searchParams.get('portfolio')  // For portfolio score

    // Parse symbols
    let symbols: string[]
    if (symbolsParam) {
      symbols = symbolsParam.split(',').map(s => s.trim().toUpperCase())
    } else {
      symbols = DEFAULT_SYMBOLS
    }

    const days = parseInt(daysParam)

    console.log(`📊 Analyzing ${symbols.length} stocks over ${days} days`)
    console.log(`   Symbols: ${symbols.join(', ')}`)

    // Get broker manager
    const manager = await getUserBrokerManager()
    if (!manager.hasConnection()) {
      console.error('❌ Broker authentication required')
      return NextResponse.json({
        success: false,
        error: 'No broker connections available. Admin must connect a broker in settings.'
      }, { status: 401 })
    }
    const client = manager.getClient()

    console.log('✅ Broker initialized')

    // Get instruments to find instrument tokens
    const instruments = await client.getInstruments('NSE')
    const symbolToToken = new Map<string, number | string>()

    for (const inst of instruments) {
      if (inst.instrumentType === 'EQ' && symbols.includes(inst.tradingsymbol)) {
        symbolToToken.set(inst.tradingsymbol, inst.instrumentToken)
      }
    }

    console.log(`✅ Found ${symbolToToken.size}/${symbols.length} instruments`)

    // Fetch historical data for each stock
    const toDate = new Date()
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - days - 10)  // Extra buffer for holidays

    const priceData: PriceData[] = []
    const errors: string[] = []

    // Process in batches to avoid rate limits
    const batchSize = 5
    const foundSymbols = Array.from(symbolToToken.keys())

    for (let i = 0; i < foundSymbols.length; i += batchSize) {
      const batch = foundSymbols.slice(i, i + batchSize)

      await Promise.all(batch.map(async (symbol) => {
        try {
          const token = symbolToToken.get(symbol)!
          const historical = await client.getHistoricalData({
            instrumentToken: token,
            interval: 'day',
            from: fromDate,
            to: toDate,
            symbol,
            exchange: 'NSE'
          })

          if (historical.length >= 10) {
            priceData.push({
              symbol,
              prices: historical.map((bar: any) => bar.close),
              dates: historical.map((bar: any) => new Date(bar.date))
            })
          } else {
            errors.push(`${symbol}: Insufficient data (${historical.length} days)`)
          }
        } catch (err: any) {
          errors.push(`${symbol}: ${err.message}`)
        }
      }))

      // Small delay between batches
      if (i + batchSize < foundSymbols.length) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }

    console.log(`✅ Fetched data for ${priceData.length} stocks`)
    if (errors.length > 0) {
      console.log(`⚠️ Errors: ${errors.join(', ')}`)
    }

    if (priceData.length < 2) {
      return NextResponse.json({
        success: false,
        error: 'Need at least 2 stocks with sufficient data for correlation analysis',
        errors
      }, { status: 400 })
    }

    // Calculate correlation matrix
    console.log('🔍 Calculating correlation matrix...')
    const correlationMatrix = calculateCorrelationMatrix(priceData)

    console.log(`✅ Calculated ${correlationMatrix.pairs.length} correlation pairs`)
    console.log(`   Highly correlated: ${correlationMatrix.insights.highlyCorrelated.length}`)
    console.log(`   Negatively correlated: ${correlationMatrix.insights.negativelyCorrrelated.length}`)

    // Calculate portfolio score if portfolio symbols provided
    let portfolioScore = null
    if (portfolioParam) {
      const portfolioSymbols = portfolioParam.split(',').map(s => s.trim().toUpperCase())
      portfolioScore = calculatePortfolioCorrelationScore(portfolioSymbols, correlationMatrix)
      console.log(`📊 Portfolio score: ${portfolioScore.score.toFixed(1)}%`)
    }

    return NextResponse.json({
      success: true,

      // Symbols analyzed
      symbols: correlationMatrix.symbols,

      // Full correlation matrix (for heatmap)
      matrix: correlationMatrix.matrix,

      // Top correlation pairs
      topCorrelations: correlationMatrix.pairs.slice(0, 20),

      // Insights
      insights: {
        highlyCorrelated: correlationMatrix.insights.highlyCorrelated.slice(0, 10),
        negativelyCorrrelated: correlationMatrix.insights.negativelyCorrrelated.slice(0, 10),
        diversified: correlationMatrix.insights.diversified.slice(0, 5)
      },

      // Clusters
      clusters: correlationMatrix.clusters,

      // Portfolio analysis (if requested)
      portfolioScore,

      // Metadata
      dataPoints: correlationMatrix.dataPoints,
      analyzedAt: correlationMatrix.analyzedAt.toISOString(),

      // Errors (if any)
      errors: errors.length > 0 ? errors : undefined
    })

  } catch (error: any) {
    console.error('❌ Correlation matrix error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to calculate correlation matrix',
      details: error.message
    }, { status: 500 })
  }
}
