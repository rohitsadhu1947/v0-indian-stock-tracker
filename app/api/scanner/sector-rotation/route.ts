/**
 * Sector Heat Map API
 * Returns sector performance and hot sector stocks
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'
import { analyzeSectorPerformance, findHotSectorStocks } from '@/lib/sector-rotation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserIdCompat()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get market data (we'll fetch this from momentum scanner or cache)
    const momentumRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ||'http://localhost:3000'}/api/scanner/momentum?limit=200`, {
      headers: {
        cookie: request.headers.get('cookie') || ''
      }
    })
    
    if (!momentumRes.ok) {
      throw new Error('Failed to fetch momentum data')
    }
    
    const momentumData = await momentumRes.json()
    const signals = momentumData.signals || []
    
    // Build stock data map for sector analysis
    const stockData: Record<string, any> = {}
    
    for (const signal of signals) {
      stockData[signal.symbol] = {
        symbol: signal.symbol,
        price: signal.current,
        change: signal.changePercent,
        volume: signal.volume || 0,
        avgVolume: signal.avgVolume || 1
      }
    }
    
    // Analyze sector performance
    const sectorPerformance = analyzeSectorPerformance(stockData)
    
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
      totalStocksAnalyzed: signals.length
    })
  } catch (error: any) {
    console.error('❌ Sector heat map error:', error)
    return NextResponse.json(
      { error: 'Failed to generate sector heat map', details: error.message },
      { status: 500 }
    )
  }
}

