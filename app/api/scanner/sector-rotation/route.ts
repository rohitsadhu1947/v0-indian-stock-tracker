/**
 * Sector Heat Map API
 * Returns sector performance and hot sector stocks
 *
 * HYBRID STRATEGY (Industry Best Practice):
 * 1. Fetch basic quotes for ALL sectors (fast heatmap)
 * 2. Use momentum scanner for hot sector stocks (quality recommendations)
 *
 * NO CHANGES to momentum or trade-now!
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'
import { getUserBrokerManager } from '@/lib/broker'
import { analyzeSectorPerformance } from '@/lib/sector-rotation'
import { getSectorInfo, STOCK_SECTOR_MAP } from '@/lib/sector-mapping'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserIdCompat()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('🔍 Sector Scanner: Phase 1 - Fetching basic quotes for ALL sectors...')

    // Get broker manager
    const manager = await getUserBrokerManager()
    if (!manager.hasConnection()) {
      return NextResponse.json({ error: 'No broker connections available. Admin must connect a broker in settings.' }, { status: 401 })
    }
    const client = manager.getClient()

    // Get representative stocks from each sector (10-15 per sector for good coverage)
    const allSymbols = Object.keys(STOCK_SECTOR_MAP)

    // Get instruments
    const instruments = await client.getInstruments('NSE')
    const symbolMap = new Map<string, any>()

    for (const inst of instruments) {
      if (inst.instrumentType === 'EQ' && allSymbols.includes(inst.tradingsymbol)) {
        symbolMap.set(inst.tradingsymbol, inst)
      }
    }

    console.log(`✅ Found ${symbolMap.size} instruments`)

    // Fetch quotes in batches (just basic data, no heavy analysis)
    const batchSize = 50
    const stockData: Record<string, any> = {}
    const symbolsArray = Array.from(symbolMap.keys())

    for (let i = 0; i < symbolsArray.length; i += batchSize) {
      const batch = symbolsArray.slice(i, i + batchSize)

      try {
        const exchangeSymbols = batch.map(s => `NSE:${s}`)
        const quotes = await client.getQuote(exchangeSymbols)

        for (const symbol of batch) {
          const quoteKey = `NSE:${symbol}`
          const quote = quotes[quoteKey]

          if (quote) {
            stockData[symbol] = {
              symbol,
              price: quote.lastPrice,
              change: ((quote.lastPrice - quote.close) / quote.close) * 100,
              volume: quote.volume,
              avgVolume: quote.volume // BrokerClient QuoteData doesn't expose average_price
            }
          }
        }
      } catch (err) {
        console.error(`❌ Failed to fetch batch:`, err)
      }

      // Small delay between batches
      if (i + batchSize < symbolsArray.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    console.log(`✅ Fetched ${Object.keys(stockData).length} stocks for sector analysis`)

    // Analyze ALL sectors (this is the heatmap)
    const sectorPerformance = analyzeSectorPerformance(stockData)

    console.log(`📊 Sector Analysis: ${sectorPerformance.length} sectors analyzed`)

    // Get hot sectors (for stock recommendations)
    const hotSectors = sectorPerformance.filter(s => s.momentum === 'HOT' || s.momentum === 'WARM')

    console.log(`🔥 Hot sectors: ${hotSectors.length}`)

    // Phase 2: For hot sectors, get quality stock recommendations using momentum scanner
    let hotSectorStocks: any[] = []

    if (hotSectors.length > 0) {
      console.log('🎯 Phase 2 - Getting quality stock recommendations from hot sectors...')

      const hotSectorNames = new Set(hotSectors.map(s => s.sector))

      // Get all symbols from hot sectors
      const hotSectorSymbols = Object.keys(stockData).filter(symbol => {
        const sectorInfo = getSectorInfo(symbol)
        return sectorInfo && hotSectorNames.has(sectorInfo.sector)
      })

      console.log(`📊 Found ${hotSectorSymbols.length} stocks in hot sectors`)

      // Call momentum scanner with these specific symbols
      const momentumUrl = new URL('/api/scanner/momentum', request.url)
      momentumUrl.searchParams.set('capital', '300000')
      momentumUrl.searchParams.set('maxSignals', '100')
      momentumUrl.searchParams.set('minScore', '0')
      momentumUrl.searchParams.set('customStocks', hotSectorSymbols.slice(0, 100).join(',')) // Limit to 100

      try {
        const momentumResponse = await fetch(momentumUrl.toString(), {
          headers: {
            cookie: request.headers.get('cookie') || ''
          }
        })

        if (momentumResponse.ok) {
          const momentumData = await momentumResponse.json()
          const signals = momentumData.scan?.signals || []

          console.log(`✅ Got ${signals.length} momentum signals from hot sectors`)

          // Now get master scores for these signals
          if (signals.length > 0) {
            const signalSymbols = signals.map((s: any) => s.symbol).slice(0, 50)

            const tradeNowUrl = new URL('/api/scanner/trade-now', request.url)
            tradeNowUrl.searchParams.set('capital', '300000')
            tradeNowUrl.searchParams.set('customSymbols', signalSymbols.join(','))

            const tradeNowResponse = await fetch(tradeNowUrl.toString(), {
              headers: {
                cookie: request.headers.get('cookie') || ''
              }
            })

            if (tradeNowResponse.ok) {
              const tradeNowData = await tradeNowResponse.json()

              const allSignals = [
                ...(tradeNowData.highConviction || []),
                ...(tradeNowData.moderate || []),
                ...(tradeNowData.watch || [])
              ]

              console.log(`✅ Got ${allSignals.length} master-scored signals`)

              hotSectorStocks = allSignals
                .filter((s: any) => s.totalScore >= 40)
                .map((signal: any) => {
                  const sectorInfo = getSectorInfo(signal.symbol)
                  return {
                    ...signal,
                    sector: sectorInfo?.sector || 'Unknown',
                    currentPrice: signal.currentPrice || signal.entryPrice,
                    changePercent: signal.changePercent || 0,
                    volumeRatio: signal.volumeRatio || 1
                  }
                })
                .sort((a: any, b: any) => b.totalScore - a.totalScore)
                .slice(0, 20)

              console.log(`✅ Returning ${hotSectorStocks.length} hot sector stocks (score >= 40)`)
            }
          }
        }
      } catch (error: any) {
        console.error('❌ Error getting hot sector stocks:', error.message)
      }
    }

    return NextResponse.json({
      success: true,
      sectorPerformance, // ALL sectors (heatmap)
      hotSectorStocks,   // Only quality stocks from hot sectors
      totalSectors: sectorPerformance.length,
      hotSectors: hotSectors.length,
      hotStocks: hotSectorStocks.length,
      dataSource: 'hybrid_industry_standard'
    })

  } catch (error: any) {
    console.error('❌ Sector scanner error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to generate sector heat map',
      details: error.message
    }, { status: 500 })
  }
}
