/**
 * Sector Heat Map API
 * Returns sector performance and hot sector stocks
 * 
 * STRATEGY: Reuse momentum scanner for consistency (NO changes to momentum scanner!)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'
import { analyzeSectorPerformance } from '@/lib/sector-rotation'
import { getSectorInfo } from '@/lib/sector-mapping'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserIdCompat()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('🔍 Sector Scanner: Calling momentum scanner...')

    // Call momentum scanner with NIFTY 500 universe
    // This gives us properly calculated momentum signals with correct volume logic
    const momentumUrl = new URL('/api/scanner/momentum', request.url)
    momentumUrl.searchParams.set('capital', '300000')
    momentumUrl.searchParams.set('maxSignals', '200') // Get many signals for sector analysis
    momentumUrl.searchParams.set('minScore', '0') // Don't filter yet
    momentumUrl.searchParams.set('universe', 'nifty500')
    
    const momentumResponse = await fetch(momentumUrl.toString(), {
      headers: {
        cookie: request.headers.get('cookie') || ''
      }
    })
    
    if (!momentumResponse.ok) {
      throw new Error('Failed to fetch momentum signals')
    }
    
    const momentumData = await momentumResponse.json()
    const signals = momentumData.scan?.signals || []
    
    console.log(`✅ Got ${signals.length} momentum signals`)
    
    // Convert momentum signals to stockData format for sector analysis
    const stockData: Record<string, any> = {}
    
    for (const signal of signals) {
      stockData[signal.symbol] = {
        symbol: signal.symbol,
        price: signal.current,
        change: signal.changePercent,
        volume: signal.volume,
        avgVolume: signal.avgVolume
      }
    }
    
    console.log(`📊 Analyzing ${Object.keys(stockData).length} stocks across sectors...`)
    
    // Analyze sector performance
    const sectorPerformance = analyzeSectorPerformance(stockData)
    
    // Get hot sectors first
    const hotSectors = sectorPerformance.filter(s => s.momentum === 'HOT' || s.momentum === 'WARM')
    
    console.log(`📊 Sector Analysis: ${sectorPerformance.length} sectors analyzed`)
    console.log(`🔥 Hot sectors: ${hotSectors.length}`)
    
    // Filter momentum signals for hot sector stocks
    let hotSectorStocks: any[] = []
    
    if (hotSectors.length > 0) {
      const hotSectorNames = new Set(hotSectors.map(s => s.sector))
      
      // Filter signals by hot sectors
      const hotSectorSignals = signals.filter((signal: any) => {
        const sectorInfo = getSectorInfo(signal.symbol)
        return sectorInfo && hotSectorNames.has(sectorInfo.sector)
      })
      
      console.log(`🎯 Found ${hotSectorSignals.length} signals in hot sectors`)
      
      // Now run master scorer on these signals (use Trade Now API for consistency)
      // This ensures we use the same scoring logic as Trade Now
      const capital = request.nextUrl.searchParams.get('capital') || '300000'
      
      // Get master scores by calling Trade Now API with specific symbols
      const hotSymbols = hotSectorSignals.map((s: any) => s.symbol).slice(0, 50) // Limit to top 50
      
      if (hotSymbols.length > 0) {
        console.log(`📊 Getting master scores for ${hotSymbols.length} hot sector stocks...`)
        
        const tradeNowUrl = new URL('/api/scanner/trade-now', request.url)
        tradeNowUrl.searchParams.set('capital', capital)
        tradeNowUrl.searchParams.set('customSymbols', hotSymbols.join(','))
        
        try {
          const tradeNowResponse = await fetch(tradeNowUrl.toString(), {
            headers: {
              cookie: request.headers.get('cookie') || ''
            }
          })
          
          if (tradeNowResponse.ok) {
            const tradeNowData = await tradeNowResponse.json()
            
            // Combine all cohorts
            const allSignals = [
              ...(tradeNowData.highConviction || []),
              ...(tradeNowData.moderate || []),
              ...(tradeNowData.watch || [])
            ]
            
            console.log(`✅ Got ${allSignals.length} master-scored signals`)
            
            // Add sector information and filter for decent scores
            hotSectorStocks = allSignals
              .filter((s: any) => s.totalScore >= 40) // Only show stocks with some potential
              .map((signal: any) => {
                const sectorInfo = getSectorInfo(signal.symbol)
                return {
                  ...signal,
                  sector: sectorInfo?.sector || 'Unknown',
                  // Ensure all required fields for trade execution
                  currentPrice: signal.currentPrice || signal.entryPrice,
                  changePercent: signal.changePercent || 0,
                  volumeRatio: signal.volumeRatio || 1
                }
              })
              .sort((a: any, b: any) => b.totalScore - a.totalScore)
              .slice(0, 20) // Top 20 stocks
            
            console.log(`✅ Returning ${hotSectorStocks.length} hot sector stocks (score >= 40)`)
            
            // If no stocks meet threshold, show top 5 best available
            if (hotSectorStocks.length === 0 && allSignals.length > 0) {
              console.log('⚠️ No stocks >= 40, showing top 5 best available')
              hotSectorStocks = allSignals
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
                .slice(0, 5)
            }
          } else {
            console.error('❌ Trade Now API failed:', await tradeNowResponse.text())
          }
        } catch (error: any) {
          console.error('❌ Error calling Trade Now API:', error.message)
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      sectorPerformance,
      hotSectorStocks,
      totalSectors: sectorPerformance.length,
      hotSectors: hotSectors.length,
      hotStocks: hotSectorStocks.length,
      dataSource: 'momentum_scanner'
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
