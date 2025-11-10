/**
 * Trade Now Scanner API
 * Combines momentum signals with master scoring
 * Returns high conviction, moderate, and news pop signals
 */

import { NextRequest, NextResponse } from 'next/server'
import { batchCalculateMasterScores, categorizeSignals, type MasterScore } from '@/lib/master-scorer'
import { db } from '@/db'
import { analystReports, userPreferences } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'
import { sendNewSignalAlert, type TelegramConfig } from '@/lib/telegram-alerts'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Import NewsPop type only (no runtime imports to avoid crashes)
type NewsPop = {
  symbol: string
  tradingSymbol: string
  instrumentToken: number
  currentPrice: number
  priceChange: number
  priceChangePercent: number
  volumeRatio: number
  volumeSpike: boolean
  priceSpike: boolean
  entryPrice: number
  target: number
  stopLoss: number
  riskReward: number
  positionSize: number
  urgency: 'HIGH' | 'MEDIUM'
  triggers: string[]
  newsAvailable: boolean
  newsSnippet?: string
  detectedAt: Date
  exchange: 'NSE' | 'BSE'
}

export async function GET(request: NextRequest) {
  try {
    // Support both old and new auth systems
    const userId = await getAuthenticatedUserIdCompat()
    
    if (!userId) {
      return NextResponse.json({
        error: 'Unauthorized'
      }, { status: 401 })
    }

    console.log('\n🎯 === TRADE NOW SCANNER STARTED ===')
    console.log(`👤 User ID: ${userId}`)

    // Get query parameters
    const searchParams = request.nextUrl.searchParams
    const capitalAvailable = Number(searchParams.get('capital') || 300000)
    const minScore = Number(searchParams.get('minScore') || 75)
    const customSymbols = searchParams.get('customSymbols') // e.g., "IDBI,SYMPHONY"
    
    console.log(`💰 Capital available: ₹${capitalAvailable.toLocaleString()}`)
    console.log(`📊 Minimum score: ${minScore}`)
    if (customSymbols) {
      console.log(`📝 Custom symbols: ${customSymbols}`)
    }

    // Step 1: Call momentum scanner API
    console.log('\n📈 Step 1: Running momentum scanner...')
    
    // Build URL with custom symbols if provided
    // If ONLY custom symbols (no universe scan), use quickScan for faster results
    const isCustomOnly = customSymbols && customSymbols.trim().length > 0
    
    let momentumUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/scanner/momentum?capital=${capitalAvailable}&minScore=60&maxSignals=50`
    
    if (isCustomOnly) {
      // Custom stock only - use quick scan (top 100 + custom)
      momentumUrl += `&universe=NIFTY_500&quickScan=true&customStocks=${customSymbols}`
      console.log(`  → Custom stock analysis (with quick universe scan): ${customSymbols}`)
    } else {
      // Full scan
      momentumUrl += `&universe=NIFTY_500`
      console.log(`  → Full universe scan`)
    }
    
    const momentumResponse = await fetch(momentumUrl, {
      headers: {
        'Cookie': request.headers.get('cookie') || ''
      }
    })

    if (!momentumResponse.ok) {
      console.error('❌ Momentum scanner API failed:', momentumResponse.status)
      return NextResponse.json({
        success: false,
        error: 'Momentum scanner API failed'
      }, { status: 500 })
    }

    const momentumResult = await momentumResponse.json()

    if (!momentumResult.success || !momentumResult.scan || !momentumResult.scan.signals) {
      console.error('❌ Momentum scanner returned no signals:', momentumResult)
      return NextResponse.json({
        success: false,
        error: 'No momentum signals found'
      }, { status: 500 })
    }

    // Extract signals from the scan object
    const momentumSignals = momentumResult.scan.signals

    console.log(`✅ Found ${momentumSignals.length} momentum signals`)
    console.log(`   Symbols: ${momentumSignals.map((s: any) => s.symbol).join(', ')}`)

    // Step 2: Fetch analyst reports for all symbols
    console.log('\n📊 Step 2: Fetching analyst reports...')
    const symbols = momentumSignals.map((s: any) => s.symbol)
    
    const reports = await db
      .select()
      .from(analystReports)
      .where(eq(analystReports.userId, userId))
      .orderBy(desc(analystReports.reportDate))

    // Group reports by symbol (most recent per symbol)
    const reportsBySymbol: Record<string, any> = {}
    reports.forEach(report => {
      if (report.symbol && !reportsBySymbol[report.symbol]) {
        reportsBySymbol[report.symbol] = report
      }
    })

    console.log(`✅ Found ${Object.keys(reportsBySymbol).length} analyst reports`)

    // Step 3: Calculate master scores
    console.log('\n🎯 Step 3: Calculating master scores...')
    console.log(`   Passing ${momentumSignals.length} signals to master scorer:`)
    console.log(`   ${momentumSignals.map((s: any) => s.symbol).join(', ')}`)
    
    const masterScores = await batchCalculateMasterScores(
      momentumSignals,
      reportsBySymbol,
      capitalAvailable
    )

    console.log(`✅ Calculated ${masterScores.length} master scores`)

    // DEBUG: Log all scores to see what we're getting
    console.log('\n📊 ACTUAL SCORES:')
    masterScores.forEach(score => {
      console.log(`  ${score.symbol}: ${score.totalScore}/100 (T:${score.technical.score} F:${score.fundamental.score} I:${score.intelligence.score})`)
    })
    
    // Check if custom symbols are present
    if (customSymbols) {
      const customSymbolsList = customSymbols.split(',').map(s => s.trim().toUpperCase())
      console.log(`\n🔍 Checking for custom symbols: ${customSymbolsList.join(', ')}`)
      console.log(`   Total master scores received: ${masterScores.length}`)
      console.log(`   Master score symbols: ${masterScores.map(s => s.symbol).slice(0, 10).join(', ')}...`)
      customSymbolsList.forEach(sym => {
        const found = masterScores.find(s => s.symbol === sym)
        if (found) {
          console.log(`  ✅ ${sym} found with score ${found.totalScore}`)
        } else {
          console.log(`  ❌ ${sym} NOT found in master scores!`)
          console.log(`  → This means momentum scanner didn't return it`)
          console.log(`  → Check if symbol is valid or has sufficient data`)
        }
      })
    }

    // Step 4: Filter and categorize
    console.log('\n📋 Step 4: Categorizing signals...')
    
    // For custom symbols: always include even if below minScore
    const customSymbolsList = customSymbols ? customSymbols.split(',').map(s => s.trim().toUpperCase()) : []
    const filtered = masterScores.filter(score => 
      score.totalScore >= minScore || customSymbolsList.includes(score.symbol)
    )
    
    // Log custom stocks that were force-included despite low score
    if (customSymbolsList.length > 0) {
      customSymbolsList.forEach(symbol => {
        const customScore = masterScores.find(s => s.symbol === symbol)
        if (customScore && customScore.totalScore < minScore) {
          console.log(`🔍 Force-included custom stock ${symbol} with score ${customScore.totalScore} (below threshold ${minScore})`)
        }
      })
    }
    
    // Pass customSymbolsList to categorization so SKIP tier custom stocks appear in Watch
    const categorized = categorizeSignals(filtered, customSymbolsList)
    
    // ALSO categorize ALL scores (including those below threshold) for debugging
    const allCategorized = categorizeSignals(masterScores, customSymbolsList)

    console.log(`✅ High Conviction: ${categorized.highConviction.length}`)
    console.log(`✅ Moderate: ${categorized.moderate.length}`)
    console.log(`✅ Watch: ${categorized.watch.length}`)
    console.log(`📊 Filtered out (below ${minScore}): ${masterScores.length - filtered.length} stocks`)
    console.log(`📊 ALL signals (unfiltered): HC:${allCategorized.highConviction.length}, M:${allCategorized.moderate.length}, W:${allCategorized.watch.length}`)

    // Step 4.5: Send Telegram alerts for new high-conviction signals
    if (categorized.highConviction.length > 0) {
      console.log('\n📱 Step 4.5: Sending Telegram alerts for high-conviction signals...')
      
      // Fetch user's Telegram preferences
      const userPrefs = await db
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, userId))
        .limit(1)
      
      const telegramConfig: TelegramConfig = {
        enabled: userPrefs[0]?.telegramEnabled || false,
        botToken: userPrefs[0]?.telegramBotToken || '',
        chatId: userPrefs[0]?.telegramChatId || ''
      }

      const alertPrefs = (userPrefs[0]?.telegramAlertPreferences as any) || {
        newSignals: true,
        targetHits: true,
        stopLossHits: true,
        dailySummary: true,
        positionUpdates: false
      }

      if (telegramConfig.enabled && alertPrefs.newSignals) {
        // Send alerts for top 3 high-conviction signals only (to avoid spam)
        const topSignals = categorized.highConviction.slice(0, 3)
        
        for (const signal of topSignals) {
          try {
            await sendNewSignalAlert(telegramConfig, {
              symbol: signal.symbol,
              exchange: signal.exchange,
              totalScore: signal.totalScore,
              tier: signal.tier,
              entryPrice: signal.tradePlan.entry,
              stopLoss: signal.tradePlan.stopLoss,
              target1: signal.tradePlan.target1,
              target2: signal.tradePlan.target2,
              positionSize: signal.tradePlan.positionSize,
              capitalRequired: signal.tradePlan.capitalRequired,
              riskAmount: signal.tradePlan.riskAmount,
              reasons: signal.reasoning
            })
            console.log(`📱 Sent Telegram alert for ${signal.symbol}`)
          } catch (err) {
            console.error(`❌ Failed to send Telegram alert for ${signal.symbol}:`, err)
          }
        }
      }
    }

    // Step 5: News pop scanning (disabled - will be added as separate feature)
    const newsPops: NewsPop[] = []

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        highConviction: categorized.highConviction,
        moderate: categorized.moderate,
        watch: allCategorized.watch, // TEMP: Return ALL watch signals (even below threshold)
        newsPops: newsPops
      },
      stats: {
        totalScanned: momentumSignals.length,
        highConviction: categorized.highConviction.length,
        moderate: categorized.moderate.length,
        watch: allCategorized.watch.length, // TEMP: Show unfiltered count
        newsPops: newsPops.length,
        debug: {
          minScoreThreshold: minScore,
          totalMasterScores: masterScores.length,
          filteredOutCount: masterScores.length - filtered.length
        }
      }
    })

  } catch (error: any) {
    console.error('❌ Trade Now scanner error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to run Trade Now scanner',
      details: error.message
    }, { status: 500 })
  }
}

