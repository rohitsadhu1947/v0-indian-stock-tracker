import { NextRequest, NextResponse } from 'next/server'
import { scanForMomentumSignals, NIFTY_500_SYMBOLS } from '@/lib/momentum-scanner'
import { getUserBrokerManager } from '@/lib/broker'
import type { InstrumentData } from '@/lib/broker'
import { db } from '@/db'
import { patternAnalysis } from '@/db/schema'
import { analyzeMarketRegime, type HistoricalBar } from '@/lib/market-regime'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'
import { scannerRateLimit } from '@/lib/rate-limit'
import logger from '@/lib/logger'

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
  const userId = await getAuthenticatedUserIdCompat()
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const rl = await scannerRateLimit(request, userId)
  if (!rl.ok) return rl.response

  try {
    logger.info('Starting momentum scan', { userId })

    // 1. Check authentication and get broker client
    const manager = await getUserBrokerManager()
    if (!manager.hasConnection()) {
      return NextResponse.json({
        success: false,
        error: 'No broker connections available. Admin must connect a broker in settings.'
      }, { status: 401 })
    }
    const client = manager.getClient()

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

    // 3. Get instrument tokens for NIFTY 500 stocks + custom stocks
    const instruments = await client.getInstruments('NSE')
    const symbolMap = new Map<string, InstrumentData>()

    // Determine which symbols to check based on custom stocks
    let symbolsToCheck: string[]
    if (customStocks.length > 0 && !searchParams.get('universe')) {
      // Custom stocks ONLY mode (no universe specified)
      symbolsToCheck = customStocks
      console.log(`📝 Custom stocks ONLY mode: ${customStocks.join(', ')}`)
    } else {
      // Normal mode: Combine NIFTY 500 symbols with custom stocks
      symbolsToCheck = [...NIFTY_500_SYMBOLS, ...customStocks]
    }

    for (const inst of instruments) {
      if (inst.instrumentType === 'EQ' && symbolsToCheck.includes(inst.tradingsymbol)) {
        symbolMap.set(inst.tradingsymbol, inst)
      }
    }

    console.log(`✅ Found ${symbolMap.size} instruments${customStocks.length > 0 ? ` (${customStocks.length} custom requested)` : ' from NIFTY 500'}`)

    // 4. Fetch quotes and historical data for all stocks (in batches)
    const stocksData = []
    const batchSize = 10 // Smaller batch size to avoid rate limits
    const symbols = Array.from(symbolMap.keys())

    // Always prioritize custom stocks first, then add NIFTY 500
    let symbolsToScan = symbols
    const customSymbolsFound = symbols.filter(s => customStocks.includes(s))
    const otherSymbols = symbols.filter(s => !customStocks.includes(s))

    // DEBUG: Check if custom stocks were found
    if (customStocks.length > 0) {
      console.log(`🔍 Looking for custom stocks: ${customStocks.join(', ')}`)
      console.log(`   Found in instruments: ${customSymbolsFound.join(', ') || 'NONE'}`)
      customStocks.forEach(cs => {
        if (!customSymbolsFound.includes(cs)) {
          console.log(`   ⚠️ ${cs} NOT found in instruments! Check if symbol is correct or exists on NSE.`)
        }
      })
    }


    if (isQuickScan) {
      // Quick scan: Top 100 stocks + all custom stocks
      const quickScanLimit = 100
      symbolsToScan = [...customSymbolsFound, ...otherSymbols.slice(0, quickScanLimit - customSymbolsFound.length)]
      console.log(`⚡ QUICK SCAN: ${symbolsToScan.length} stocks (${customSymbolsFound.length} custom + ${symbolsToScan.length - customSymbolsFound.length} top NIFTY)`)
    } else if (customSymbolsFound.length > 0 && otherSymbols.length === 0) {
      // Custom stocks ONLY (no universe)
      symbolsToScan = customSymbolsFound
      console.log(`📝 CUSTOM ONLY: ${symbolsToScan.length} stocks (${customSymbolsFound.length} custom requested)`)
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
        const quotes = await client.getQuote(quoteSymbols)

        // Fetch historical data for each stock in batch
        for (const symbol of batch) {
          try {
            const inst = symbolMap.get(symbol)
            if (!inst) {
              console.log(`⚠️ ${symbol}: No instrument found`)
              if (customStocks.includes(symbol)) {
                console.log(`   ❌ CUSTOM STOCK ${symbol} failed at instrument lookup!`)
              }
              continue
            }

            const quoteKey = `NSE:${symbol}`
            const quote = quotes[quoteKey]
            if (!quote) {
              console.log(`⚠️ ${symbol}: No quote data`)
              if (customStocks.includes(symbol)) {
                console.log(`   ❌ CUSTOM STOCK ${symbol} failed at quote fetch!`)
              }
              continue
            }

            // Get 60 days of historical data
            const to = new Date()
            const from = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)

            const candles = await client.getHistoricalData({
              instrumentToken: inst.instrumentToken,
              interval: 'day',
              from,
              to,
              symbol: symbol,
              exchange: 'NSE'
            })

            if (!candles || candles.length < 30) {
              console.log(`⚠️ ${symbol}: Insufficient candles (${candles?.length || 0})`)
              if (customStocks.includes(symbol)) {
                console.log(`   ❌ CUSTOM STOCK ${symbol} failed at historical data! Only ${candles?.length || 0} candles`)
              }
              continue
            }

            // Calculate average volume from historical data
            const avgVolume = candles.length > 0
              ? candles.reduce((sum: number, c: any) => sum + c.volume, 0) / candles.length
              : quote.volume

            // DEBUG: Show last 10 days of volume to understand the pattern
            if (customStocks.includes(symbol)) {
              console.log(`\n📊 Last 10 days volume for ${symbol}:`)
              const last10 = candles.slice(-10)
              last10.forEach((c: any, i: number) => {
                const date = new Date(c.date).toLocaleDateString('en-IN')
                console.log(`   ${date}: ${c.volume.toLocaleString()} (${(c.volume / avgVolume * 100).toFixed(0)}% of avg)`)
              })
            }

            // For SWING TRADING: Find the last COMPLETED trading day
            // Logic:
            // - During market hours: Use previous day (today's data is incomplete)
            // - After market close: Use today (if it's a trading day with good volume)
            let lastTradingVolume = quote.volume as number // Fallback
            let lastTradingDate = 'today'

            if (candles.length > 0) {
              const now = new Date()
              const istOffset = 5.5 * 60 * 60 * 1000 // IST is UTC+5:30
              const istTime = new Date(now.getTime() + istOffset)
              const istHour = istTime.getUTCHours()
              const istMinute = istTime.getUTCMinutes()

              // Market hours: 9:15 AM to 3:30 PM IST
              const isMarketHours = (istHour === 9 && istMinute >= 15) ||
                                    (istHour > 9 && istHour < 15) ||
                                    (istHour === 15 && istMinute <= 30)

              const today = new Date()
              today.setHours(0, 0, 0, 0)

              // Determine starting index:
              // - If market is open: Skip today's partial data, start from [length-2]
              // - If market is closed: Include today's complete data, start from [length-1]
              const startIndex = isMarketHours ? candles.length - 2 : candles.length - 1

              // Look back up to 10 days to find last completed trading day
              for (let i = startIndex; i >= Math.max(0, candles.length - 10); i--) {
                const candle = candles[i]
                const candleDate = new Date(candle.date)
                candleDate.setHours(0, 0, 0, 0)

                // During market hours: Skip today's candle (partial data)
                if (isMarketHours && candleDate.getTime() >= today.getTime()) {
                  continue
                }

                // Consider it a trading day if volume > 50% of average
                // (filters out holidays/weekends with zero/minimal volume)
                if (candle.volume > avgVolume * 0.5) {
                  lastTradingVolume = candle.volume
                  lastTradingDate = new Date(candle.date).toLocaleDateString('en-IN')
                  break
                }
              }
            }

            const currentVolume = lastTradingVolume

            // DEBUG for custom stocks
            if (customStocks.includes(symbol)) {
              const now = new Date()
              const istOffset = 5.5 * 60 * 60 * 1000
              const istTime = new Date(now.getTime() + istOffset)
              const istHour = istTime.getUTCHours()
              const istMinute = istTime.getUTCMinutes()
              const isMarketHours = (istHour === 9 && istMinute >= 15) ||
                                    (istHour > 9 && istHour < 15) ||
                                    (istHour === 15 && istMinute <= 30)

              console.log(`\n🔍 VOLUME DEBUG for ${symbol}:`)
              console.log(`   Current IST time: ${istHour}:${istMinute.toString().padStart(2, '0')}`)
              console.log(`   Market status: ${isMarketHours ? '🟢 OPEN (using previous day)' : '🔴 CLOSED (using today if available)'}`)
              console.log(`   Today's intraday volume: ${quote.volume.toLocaleString()}`)
              console.log(`   Last trading day (${lastTradingDate}): ${lastTradingVolume.toLocaleString()}`)
              console.log(`   🎯 USING: ${currentVolume.toLocaleString()}`)
              console.log(`   Average volume (40 days): ${avgVolume.toLocaleString()}`)
              console.log(`   Volume ratio: ${(currentVolume / avgVolume).toFixed(2)}x`)
            }


            stocksData.push({
              symbol,
              exchange: 'NSE',
              instrumentToken: inst.instrumentToken.toString(),
              current: quote.lastPrice,
              change: quote.change,
              changePercent: ((quote.lastPrice - quote.close) / quote.close) * 100,
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

    // 5.5 Fetch NIFTY 50 regime (real market trend detection)
    let niftyRegime: { regime: string; positionSizeMultiplier: number; confidence: number } | undefined
    try {
      console.log(`\n📊 Analyzing NIFTY 50 market regime...`)
      // Find NIFTY 50 instrument
      const niftyInst = instruments.find(
        (inst: InstrumentData) => inst.tradingsymbol === 'NIFTY 50' && inst.exchange === 'NSE'
      ) || instruments.find(
        (inst: InstrumentData) => inst.tradingsymbol === 'NIFTY50' || inst.name?.includes('NIFTY 50')
      )

      if (niftyInst) {
        const to = new Date()
        const from = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) // 400 calendar days ≈ 270 bars for SMA200
        const niftyCandlesRaw = await client.getHistoricalData({
          instrumentToken: niftyInst.instrumentToken,
          interval: 'day',
          from,
          to,
          symbol: 'NIFTY 50',
          exchange: 'NSE'
        })

        if (niftyCandlesRaw && niftyCandlesRaw.length >= 50) {
          const bars: HistoricalBar[] = niftyCandlesRaw.map((c: any) => ({
            date: new Date(c.date),
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume
          }))
          const regime = analyzeMarketRegime(bars)
          niftyRegime = {
            regime: regime.regime,
            positionSizeMultiplier: regime.positionSizeMultiplier,
            confidence: regime.confidence
          }
          console.log(`✅ NIFTY regime: ${regime.regime} (confidence: ${regime.confidence}%, multiplier: ${regime.positionSizeMultiplier}x)`)
          console.log(`   NIFTY price: ${regime.niftyPrice} | RSI: ${regime.rsi.toFixed(1)} | Trend: ${regime.trendDirection}`)
        } else {
          console.log(`⚠️ Insufficient NIFTY candles (${niftyCandlesRaw?.length || 0}) — defaulting to SIDEWAYS`)
        }
      } else {
        console.log(`⚠️ NIFTY 50 instrument not found — trying index instruments...`)
        // Try fetching from NSE indices
        const niftyIdxInst = instruments.find(
          (inst: InstrumentData) => inst.tradingsymbol === 'NIFTY 50' || inst.tradingsymbol === 'NIFTY50'
        )
        if (!niftyIdxInst) {
          console.log(`⚠️ NIFTY 50 not found in any instrument list — defaulting to SIDEWAYS`)
        }
      }
    } catch (regimeError: any) {
      console.error(`⚠️ Failed to analyze NIFTY regime (non-fatal):`, regimeError.message)
      // Continue without regime data — scanner will default to SIDEWAYS
    }

    // 6. Run momentum scanner with more relaxed filters
    console.log(`\n📊 Running momentum scanner on ${stocksData.length} stocks...`)
    const scanResult = await scanForMomentumSignals(stocksData, capital, {
      minPrice: 50,
      maxPrice: 5000,
      minVolume: 50000, // Reduced from 100k to 50k
      maxPositions,
      customStocks, // Pass custom stocks to scanner
      niftyRegime  // Pass real NIFTY regime instead of hardcoded 'UP'
    })

    console.log(`✅ Scan complete: ${scanResult.signalsFound} signals found, sentiment: ${scanResult.marketSentiment}`)

    // 7. Filter by minimum score
    const filteredSignals = scanResult.signals.filter(s => s.momentumScore >= minScore)

    console.log(`✅ Momentum scan complete: ${filteredSignals.length} signals (${scanResult.strongBuyCount} STRONG_BUY)`)

    // Persist pattern analysis to DB (non-fatal)
    try {
      if (filteredSignals.length > 0) {
        const validUntil = new Date(Date.now() + 60 * 60 * 1000) // valid for 1 hour
        const rows = filteredSignals.map((signal: any) => ({
          symbol: signal.symbol,
          exchange: signal.exchange || 'NSE',
          analysisType: 'momentum',
          recommendation: signal.recommendation || (signal.momentumScore >= 80 ? 'STRONG_BUY' : signal.momentumScore >= 60 ? 'BUY' : 'WATCH'),
          score: signal.momentumScore,
          confidence: signal.confidence ?? null,
          successRate: signal.successRate ?? null,
          patterns: signal.patterns ?? null,
          intelligence: {
            momentumScore: signal.momentumScore,
            volumeRatio: signal.volumeRatio,
            priceChange: signal.priceChangePercent,
            trend: signal.trend,
            entry: signal.entry,
            stopLoss: signal.stopLoss,
            target1: signal.target1,
            target2: signal.target2,
          } as any,
          validUntil,
          createdAt: new Date(),
        }))
        await db.insert(patternAnalysis).values(rows)
        console.log(`💾 Saved ${rows.length} pattern analysis records to DB`)
      }
    } catch (dbError) {
      console.error(`⚠️ Failed to save pattern analysis to DB:`, dbError)
    }

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
