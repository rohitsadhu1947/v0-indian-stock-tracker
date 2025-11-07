import { NextRequest, NextResponse } from 'next/server'
import { KiteConnect } from 'kiteconnect'
import { scanForMomentumSignals, NIFTY_500_SYMBOLS } from '@/lib/momentum-scanner'
import { getKiteAccessToken, getKiteApiKey } from '@/lib/kite-token-helper'

/**
 * GET /api/scanner/momentum
 * 
 * Scans NIFTY 500 for momentum swing trade opportunities
 * 
 * Query params:
 * - capital: Available capital (default 300000 = ₹3L)
 * - maxPositions: Max concurrent positions (default 5)
 * - minScore: Minimum momentum score (default 60)
 */
export async function GET(request: NextRequest) {
  try {
    console.log(`🔍 Starting momentum scan at ${new Date().toISOString()}`)
    
    // 1. Check authentication and get Kite token (supports both Kite and email users)
    const accessToken = await getKiteAccessToken()
    
    if (!accessToken) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated. Please ensure admin user has logged in via Kite to set master token.'
      }, { status: 401 })
    }
    
    // Get API key
    const apiKey = getKiteApiKey()
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'Kite API key not configured'
      }, { status: 500 })
    }
    
    // 2. Get query params
    const { searchParams } = new URL(request.url)
    const capital = parseInt(searchParams.get('capital') || '300000')
    const maxPositions = parseInt(searchParams.get('maxPositions') || '5')
    const minScore = parseInt(searchParams.get('minScore') || '45') // Lower default from 60 to 45
    const customStocksParam = searchParams.get('customStocks') || ''
    const isQuickScan = searchParams.get('quickScan') === 'true'
    
    // Parse custom stocks
    const customStocks = customStocksParam
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(s => s.length > 0)
    
    if (customStocks.length > 0) {
      console.log(`📝 Custom stocks requested: ${customStocks.join(', ')}`)
    }
    
    console.log(`🔍 Starting ${isQuickScan ? 'QUICK' : 'FULL'} momentum scan (capital: ₹${capital.toLocaleString()}, maxPositions: ${maxPositions}, minScore: ${minScore})...`)
    
    // 3. Initialize Kite Connect
    const kc = new KiteConnect({ api_key: apiKey })
    kc.setAccessToken(accessToken)
    
    // 4. Get instrument tokens for NIFTY 500 stocks + custom stocks
    const instruments = await kc.getInstruments('NSE')
    const symbolMap = new Map<string, any>()
    
    // Combine NIFTY 500 symbols with custom stocks
    const symbolsToCheck = [...NIFTY_500_SYMBOLS, ...customStocks]
    
    for (const inst of instruments) {
      if (inst.instrument_type === 'EQ' && symbolsToCheck.includes(inst.tradingsymbol)) {
        symbolMap.set(inst.tradingsymbol, inst)
      }
    }
    
    console.log(`✅ Found ${symbolMap.size} instruments (${customStocks.length > 0 ? `including ${customStocks.length} custom` : 'from NIFTY 500'})`)
    
    // 5. Fetch quotes and historical data for all stocks (in batches)
    const stocksData = []
    const batchSize = 10 // Smaller batch size to avoid rate limits
    const symbols = Array.from(symbolMap.keys())
    
    // Always prioritize custom stocks first, then add NIFTY 500
    let symbolsToScan = symbols
    const customSymbolsFound = symbols.filter(s => customStocks.includes(s))
    const otherSymbols = symbols.filter(s => !customStocks.includes(s))
    
    if (isQuickScan) {
      // Quick scan: Top 100 stocks + all custom stocks
      const quickScanLimit = 100
      symbolsToScan = [...customSymbolsFound, ...otherSymbols.slice(0, quickScanLimit - customSymbolsFound.length)]
      console.log(`⚡ QUICK SCAN: ${symbolsToScan.length} stocks (${customSymbolsFound.length} custom + ${symbolsToScan.length - customSymbolsFound.length} top NIFTY)`)
    } else {
      // Full scan: All stocks with custom first
      symbolsToScan = [...customSymbolsFound, ...otherSymbols]
      console.log(`🔍 FULL SCAN: ${symbolsToScan.length} stocks (${customSymbolsFound.length} custom + ${otherSymbols.length} NIFTY 500)`)
    }
    
    let successCount = 0
    let errorCount = 0
    
    for (let i = 0; i < symbolsToScan.length; i += batchSize) {
      const batch = symbolsToScan.slice(i, i + batchSize)
      console.log(`📊 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(symbolsToScan.length / batchSize)} (${batch.length} stocks)...`)
      
      try {
        // Fetch quotes for batch
        const quoteSymbols = batch.map(sym => `NSE:${sym}`)
        const quotes = await kc.getQuote(quoteSymbols)
        
        // Fetch historical data for each stock in batch
        for (const symbol of batch) {
          try {
            const inst = symbolMap.get(symbol)
            if (!inst) {
              console.log(`⚠️ ${symbol}: No instrument found`)
              continue
            }
            
            const quoteKey = `NSE:${symbol}`
            const quote = quotes[quoteKey]
            if (!quote) {
              console.log(`⚠️ ${symbol}: No quote data`)
              continue
            }
            
            // Get 60 days of historical data
            const to = new Date()
            const from = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
            
            const candles = await kc.getHistoricalData(
              inst.instrument_token,
              'day',
              from,
              to
            )
            
            if (!candles || candles.length < 30) {
              console.log(`⚠️ ${symbol}: Insufficient candles (${candles?.length || 0})`)
              continue
            }
            
            // Calculate average volume
            const avgVolume = candles.length > 0
              ? candles.reduce((sum: number, c: any) => sum + c.volume, 0) / candles.length
              : quote.volume
            
            // Use last candle's volume if current volume is 0 (market closed)
            const currentVolume = quote.volume > 0 
              ? quote.volume 
              : candles.length > 0 
                ? candles[candles.length - 1].volume 
                : 0
            
            stocksData.push({
              symbol,
              exchange: 'NSE',
              instrumentToken: inst.instrument_token.toString(),
              current: quote.last_price,
              change: quote.change,
              changePercent: ((quote.last_price - quote.ohlc.close) / quote.ohlc.close) * 100,
              volume: currentVolume, // Use last candle's volume if market closed
              avgVolume,
              candles,
              sector: 'Unknown' // Will add sector mapping later
            })
            
            successCount++
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100))
            
          } catch (error: any) {
            errorCount++
            console.error(`❌ Error fetching data for ${symbol}:`, error.message)
          }
        }
      } catch (error: any) {
        errorCount += batch.length
        console.error(`❌ Error fetching batch quotes:`, error.message)
      }
      
      // Add delay between batches
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    console.log(`✅ Collected data for ${stocksData.length} stocks (${successCount} success, ${errorCount} errors)`)
    
    if (stocksData.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No stock data collected. Check API permissions and rate limits.',
        details: {
          successCount,
          errorCount,
          symbolsScanned: symbolsToScan.length
        }
      }, { status: 500 })
    }
    
    // 6. Run momentum scanner with more relaxed filters
    console.log(`\n📊 Running momentum scanner on ${stocksData.length} stocks...`)
    const scanResult = await scanForMomentumSignals(stocksData, capital, {
      minPrice: 50,
      maxPrice: 5000,
      minVolume: 50000, // Reduced from 100k to 50k
      maxPositions,
      customStocks // Pass custom stocks to scanner
    })
    
    console.log(`✅ Scan complete: ${scanResult.signalsFound} signals found, sentiment: ${scanResult.marketSentiment}`)
    
    // 7. Filter by minimum score
    const filteredSignals = scanResult.signals.filter(s => s.momentumScore >= minScore)
    
    console.log(`✅ Momentum scan complete: ${filteredSignals.length} signals (${scanResult.strongBuyCount} STRONG_BUY)`)
    
    return NextResponse.json({
      success: true,
      scan: {
        ...scanResult,
        signals: filteredSignals,
        signalsFound: filteredSignals.length
      },
      timestamp: new Date().toISOString()
    })
    
  } catch (error: any) {
    console.error('❌ Error in momentum scanner:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to run momentum scanner'
    }, { status: 500 })
  }
}

