/**
 * Sector Heat Map API
 * Returns sector performance and hot sector stocks
 * 
 * INDEPENDENT DATA SOURCE: Fetches fresh data directly from Kite
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'
import { getKiteAccessToken, getKiteApiKey } from '@/lib/kite-token-helper'
import { KiteConnect } from 'kiteconnect'
import { analyzeSectorPerformance, findHotSectorStocks } from '@/lib/sector-rotation'
import { STOCK_SECTOR_MAP } from '@/lib/sector-mapping'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserIdCompat()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get Kite access token
    const accessToken = await getKiteAccessToken()
    
    if (!accessToken) {
      return NextResponse.json({ error: 'Kite access token not available' }, { status: 401 })
    }

    // Get API key
    const apiKey = getKiteApiKey()
    if (!apiKey) {
      return NextResponse.json({ error: 'Kite API key not configured' }, { status: 500 })
    }

    console.log('🔍 Fetching sector data independently...')

    // Initialize Kite Connect
    const kc = new KiteConnect({ api_key: apiKey })
    kc.setAccessToken(accessToken)

    // Get all symbols from STOCK_SECTOR_MAP (these are the stocks we can analyze)
    const allSymbols = Object.keys(STOCK_SECTOR_MAP)
    
    console.log(`📊 Analyzing ${allSymbols.length} stocks across sectors...`)
    
    // Get instrument tokens first
    const instruments = await kc.getInstruments('NSE')
    const symbolMap = new Map<string, any>()
    
    for (const inst of instruments) {
      if (inst.instrument_type === 'EQ' && allSymbols.includes(inst.tradingsymbol)) {
        symbolMap.set(inst.tradingsymbol, inst)
      }
    }
    
    console.log(`✅ Found ${symbolMap.size} instruments`)
    
    // Fetch quotes for all stocks (in batches to avoid rate limits)
    const batchSize = 50
    const stockData: Record<string, any> = {}
    let successCount = 0
    let failCount = 0
    
    const symbolsArray = Array.from(symbolMap.keys())
    
    for (let i = 0; i < symbolsArray.length; i += batchSize) {
      const batch = symbolsArray.slice(i, i + batchSize)
      
      try {
        // Fetch quotes for this batch using Kite's getQuote
        const exchangeSymbols = batch.map(s => `NSE:${s}`)
        const quotes = await kc.getQuote(exchangeSymbols)
        
        for (const symbol of batch) {
          const quoteKey = `NSE:${symbol}`
          const quote = quotes[quoteKey]
          
          if (quote) {
            stockData[symbol] = {
              symbol,
              price: quote.last_price,
              change: ((quote.last_price - quote.ohlc.close) / quote.ohlc.close) * 100,
              volume: quote.volume,
              avgVolume: quote.average_price || quote.volume // Fallback if avg not available
            }
            successCount++
          } else {
            failCount++
          }
        }
      } catch (err) {
        console.error(`❌ Failed to fetch batch:`, err)
        failCount += batch.length
      }
      
      // Small delay between batches to avoid rate limits
      if (i + batchSize < symbolsArray.length) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }
    
    console.log(`✅ Fetched ${successCount} stocks, ${failCount} failed`)
    
    // Analyze sector performance
    const sectorPerformance = analyzeSectorPerformance(stockData)
    
    // For hot sector stocks, we need momentum signals
    // Let's create basic signals from the stock data
    const signals = Object.values(stockData).map(stock => ({
      symbol: stock.symbol,
      current: stock.price,
      changePercent: stock.change,
      volume: stock.volume,
      avgVolume: stock.avgVolume,
      volumeRatio: stock.volume / stock.avgVolume,
      // Add basic scoring
      totalScore: calculateBasicScore(stock)
    }))
    
    // Find hot sector stocks
    const hotSectorStocks = findHotSectorStocks(sectorPerformance, signals)
    
    // Get top hot sectors (momentum = HOT or WARM)
    const hotSectors = sectorPerformance.filter(s => s.momentum === 'HOT' || s.momentum === 'WARM')
    
    console.log(`📊 Sector Analysis: ${sectorPerformance.length} sectors analyzed`)
    console.log(`🔥 Hot sectors: ${hotSectors.length}`)
    console.log(`📈 Hot sector stocks: ${hotSectorStocks.length}`)
    
    return NextResponse.json({
      success: true,
      sectorPerformance,
      hotSectors,
      hotSectorStocks,
      totalSectors: sectorPerformance.length,
      totalStocksAnalyzed: successCount,
      dataSource: 'kite_independent'
    })
  } catch (error: any) {
    console.error('❌ Sector heat map error:', error)
    return NextResponse.json(
      { error: 'Failed to generate sector heat map', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * Calculate a basic score for sector stocks
 * (This is simpler than master scorer, just for sector analysis)
 */
function calculateBasicScore(stock: any): number {
  let score = 50 // Base score
  
  // Price change contribution (max 30 points)
  const change = stock.change || 0
  if (change > 0) {
    score += Math.min(change * 5, 30) // Positive change adds up to 30 points
  } else {
    score += Math.max(change * 5, -30) // Negative change removes up to 30 points
  }
  
  // Volume contribution (max 20 points)
  const volumeRatio = stock.volume / stock.avgVolume
  if (volumeRatio > 1) {
    score += Math.min((volumeRatio - 1) * 10, 20)
  }
  
  // Clamp score between 0-100
  return Math.max(0, Math.min(100, score))
}

