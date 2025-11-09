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
    
    // Get hot sectors first
    const hotSectors = sectorPerformance.filter(s => s.momentum === 'HOT' || s.momentum === 'WARM')
    
    console.log(`📊 Sector Analysis: ${sectorPerformance.length} sectors analyzed`)
    console.log(`🔥 Hot sectors: ${hotSectors.length}`)
    
    // For hot sector stocks, run FULL MASTER SCORER (not basic score)
    let hotSectorStocks: any[] = []
    
    if (hotSectors.length > 0) {
      const hotSectorNames = new Set(hotSectors.map(s => s.sector))
      const hotSectorSymbols = Object.keys(stockData).filter(symbol => {
        const sectorInfo = require('@/lib/sector-mapping').getSectorInfo(symbol)
        return sectorInfo && hotSectorNames.has(sectorInfo.sector)
      })
      
      console.log(`🎯 Running master scorer for ${hotSectorSymbols.length} hot sector stocks...`)
      
      // Convert stockData to MomentumSignal format that master scorer expects
      const momentumSignals = hotSectorSymbols.map(symbol => {
        const data = stockData[symbol]
        return {
          symbol,
          exchange: 'NSE',
          current: data.price,
          changePercent: data.change,
          volume: data.volume,
          avgVolume: data.avgVolume,
          // Add required momentum signal fields with defaults
          momentumScore: 50, // Will be recalculated by master scorer
          high: data.price,
          low: data.price,
          open: data.price,
          close: data.price,
          vwap: data.price,
          avgPrice: data.price,
          instrumentToken: 0, // Not needed for master scorer
          ohlc: {
            open: data.price,
            high: data.price,
            low: data.price,
            close: data.price
          }
        }
      })
      
      console.log(`📊 Converted ${momentumSignals.length} symbols to MomentumSignal format`)
      
      // Import and run master scorer
      const { batchCalculateMasterScores } = await import('@/lib/master-scorer')
      const masterScores = await batchCalculateMasterScores(momentumSignals, {}, 300000) // empty analyst reports, 3L capital
      
      console.log(`📊 Master scores received: ${masterScores.length} stocks`)
      console.log(`📊 Score distribution:`)
      console.log(`   >= 70: ${masterScores.filter(s => s.totalScore >= 70).length}`)
      console.log(`   >= 60: ${masterScores.filter(s => s.totalScore >= 60).length}`)
      console.log(`   >= 50: ${masterScores.filter(s => s.totalScore >= 50).length}`)
      console.log(`   >= 40: ${masterScores.filter(s => s.totalScore >= 40).length}`)
      console.log(`   < 40: ${masterScores.filter(s => s.totalScore < 40).length}`)
      
      // Filter for stocks with decent scores (>= 40, lowered from 50)
      hotSectorStocks = masterScores
        .filter(score => score.totalScore >= 40) // Lowered threshold from 50 to 40
        .map(score => {
          const sectorInfo = require('@/lib/sector-mapping').getSectorInfo(score.symbol)
          const sector = sectorInfo?.sector || 'OTHER'
          const sectorMomentum = sectorPerformance.find(s => s.sector === sector)?.momentum || 'NEUTRAL'
          
          return {
            ...score,
            sector,
            sectorMomentum,
            // Add fields needed for trade execution
            entryPrice: score.tradePlan?.entry,
            stopLoss: score.tradePlan?.stopLoss,
            target1: score.tradePlan?.target1,
            target2: score.tradePlan?.target2,
            positionSize: score.tradePlan?.positionSize,
            capitalRequired: score.tradePlan?.capitalRequired,
            riskAmount: score.tradePlan?.riskAmount,
            riskReward: score.tradePlan?.riskReward,
            // Add signal data for paper trade
            momentumScore: score.technicalScore,
            confidence: score.totalScore >= 75 ? 'HIGH' : score.totalScore >= 60 ? 'MEDIUM' : 'LOW',
            rsi: score.technicalIndicators?.rsi,
            volumeRatio: score.volumeRatio,
            reasons: [
              `Sector ${sector} is ${sectorMomentum}`,
              `Total Score: ${score.totalScore}/100`,
              `Technical: ${score.technicalScore}/40`,
              `Fundamental: ${score.fundamentalScore}/30`,
              `Intelligence: ${score.intelligenceScore}/30`
            ],
            warnings: score.tradePlan?.signal === 'SHORT' ? ['Consider SHORT position'] : [],
            currentPrice: score.currentPrice,
            changePercent: score.priceChange
          }
        })
        .sort((a, b) => b.totalScore - a.totalScore) // Sort by total score
      
      console.log(`📈 Hot sector stocks with scores >= 40: ${hotSectorStocks.length}`)
      
      // If still no stocks, show top 5 regardless of score
      if (hotSectorStocks.length === 0 && masterScores.length > 0) {
        console.log(`⚠️ No stocks >= 40, showing top 5 regardless of score...`)
        hotSectorStocks = masterScores
          .sort((a, b) => b.totalScore - a.totalScore)
          .slice(0, 5)
          .map(score => {
            const sectorInfo = require('@/lib/sector-mapping').getSectorInfo(score.symbol)
            const sector = sectorInfo?.sector || 'OTHER'
            const sectorMomentum = sectorPerformance.find(s => s.sector === sector)?.momentum || 'NEUTRAL'
            
            return {
              ...score,
              sector,
              sectorMomentum,
              entryPrice: score.tradePlan?.entry,
              stopLoss: score.tradePlan?.stopLoss,
              target1: score.tradePlan?.target1,
              target2: score.tradePlan?.target2,
              positionSize: score.tradePlan?.positionSize,
              capitalRequired: score.tradePlan?.capitalRequired,
              riskAmount: score.tradePlan?.riskAmount,
              riskReward: score.tradePlan?.riskReward,
              momentumScore: score.technicalScore,
              confidence: score.totalScore >= 75 ? 'HIGH' : score.totalScore >= 60 ? 'MEDIUM' : 'LOW',
              rsi: score.technicalIndicators?.rsi,
              volumeRatio: score.volumeRatio,
              reasons: [
                `Sector ${sector} is ${sectorMomentum}`,
                `Total Score: ${score.totalScore}/100`,
                `Technical: ${score.technicalScore}/40`,
                `Fundamental: ${score.fundamentalScore}/30`,
                `Intelligence: ${score.intelligenceScore}/30`
              ],
              warnings: score.tradePlan?.signal === 'SHORT' ? ['Consider SHORT position'] : [],
              currentPrice: score.currentPrice,
              changePercent: score.priceChange
            }
          })
        console.log(`📈 Showing top ${hotSectorStocks.length} stocks (best available)`)
      }
    }
    
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

