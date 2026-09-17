/**
 * Smart Money Tracker API
 * GET /api/market/smart-money
 *
 * Fetches FII/DII flows and bulk/block deals
 * Data sources: NSE, BSE
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  analyzeSmartMoney,
  getSmartMoneySignalColor,
  getSmartMoneyEmoji,
  fetchFIIDIIData,
  fetchBulkDeals,
} from '@/lib/smart-money-tracker'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Cache for 30 minutes (FII/DII data updates once a day)
let cachedData: any = null
let cacheTimestamp: number = 0
const CACHE_DURATION = 30 * 60 * 1000

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserIdCompat()
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    console.log('\n🐋 === SMART MONEY TRACKER API CALLED ===')

    const searchParams = request.nextUrl.searchParams
    const forceRefresh = searchParams.get('refresh') === 'true'

    const now = Date.now()
    if (!forceRefresh && cachedData && (now - cacheTimestamp) < CACHE_DURATION) {
      console.log('✅ Returning cached smart money data')
      return NextResponse.json({ success: true, cached: true, ...cachedData })
    }

    // Fetch FII/DII data
    console.log('📊 Fetching FII/DII data from NSE...')
    const fiidiiData = await fetchFIIDIIData()
    const dataSource = 'NSE'

    const hasRealData = fiidiiData.length > 0 && fiidiiData.some(d =>
      d.fiiNetValue !== 0 || d.diiNetValue !== 0
    )

    // Never substitute invented flows: report unavailable (and don't cache it)
    if (!hasRealData) {
      console.log('⚠️ FII/DII data unavailable (NSE returned empty/zero values)')
      return NextResponse.json({
        success: false,
        available: false,
        error: 'Live FII/DII data is unavailable from NSE right now',
      })
    }

    console.log(`✅ Got ${fiidiiData.length} days of FII/DII data`)

    // Fetch bulk deals
    console.log('📊 Fetching bulk deals from BSE...')
    const bulkDeals = await fetchBulkDeals()
    console.log(`✅ Got ${bulkDeals.length} bulk deals`)

    // Analyze
    const analysis = analyzeSmartMoney(fiidiiData, bulkDeals)
    console.log(`✅ Analysis complete: ${analysis.overallSignal} (${analysis.confidence}% confidence)`)

    const response = {
      signal: analysis.overallSignal,
      signalEmoji: getSmartMoneyEmoji(analysis.overallSignal),
      signalColor: getSmartMoneySignalColor(analysis.overallSignal),
      confidence: analysis.confidence,
      latest: analysis.latestFIIDII,
      fiiTrend: {
        ...analysis.fiiTrend,
        description: analysis.fiiTrend.direction === 'BUYING'
          ? `FIIs net bought ₹${analysis.fiiTrend.totalNet.toLocaleString()} Cr`
          : analysis.fiiTrend.direction === 'SELLING'
          ? `FIIs net sold ₹${Math.abs(analysis.fiiTrend.totalNet).toLocaleString()} Cr`
          : 'FIIs roughly neutral'
      },
      diiTrend: {
        ...analysis.diiTrend,
        description: analysis.diiTrend.direction === 'BUYING'
          ? `DIIs net bought ₹${analysis.diiTrend.totalNet.toLocaleString()} Cr`
          : analysis.diiTrend.direction === 'SELLING'
          ? `DIIs net sold ₹${Math.abs(analysis.diiTrend.totalNet).toLocaleString()} Cr`
          : 'DIIs roughly neutral'
      },
      history: fiidiiData,
      bulkDeals: analysis.recentDeals,
      insights: analysis.insights,
      dataSource,
      periodDays: analysis.periodDays,
      analyzedAt: analysis.analyzedAt.toISOString()
    }

    cachedData = response
    cacheTimestamp = now

    return NextResponse.json({ success: true, cached: false, ...response })

  } catch (error: any) {
    console.error('❌ Smart money tracker error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch smart money data',
      details: error.message
    }, { status: 500 })
  }
}
