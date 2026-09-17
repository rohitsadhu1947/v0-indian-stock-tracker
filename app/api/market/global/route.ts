import { NextRequest, NextResponse } from 'next/server'
import { getMacroSnapshot, getMacroImpactForStock, getSentimentEmoji } from '@/lib/macro-intelligence'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/market/global
 *
 * Returns global macro intelligence snapshot.
 * Data is cached for 5 minutes internally.
 *
 * Query params:
 * - forceRefresh=true  - bypass cache
 * - stock=RELIANCE     - also include stock-specific macro impact
 */
export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserIdCompat()
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const forceRefresh = searchParams.get('forceRefresh') === 'true'
    const stockSymbol = searchParams.get('stock')

    console.log(`🌍 Global macro data request${forceRefresh ? ' (force refresh)' : ''}`)

    const snapshot = await getMacroSnapshot(forceRefresh)

    // Optionally include stock-specific impact
    let stockImpact = null
    if (stockSymbol) {
      stockImpact = getMacroImpactForStock(stockSymbol.toUpperCase(), snapshot)
    }

    return NextResponse.json({
      success: true,
      macro: {
        ...snapshot,
        sentimentEmoji: getSentimentEmoji(snapshot.overallSentiment),
      },
      ...(stockImpact ? { stockImpact: { symbol: stockSymbol?.toUpperCase(), ...stockImpact } } : {}),
      cachedAt: snapshot.timestamp.toISOString(),
    })
  } catch (error: any) {
    console.error('❌ Error fetching global macro data:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch macro data' },
      { status: 500 }
    )
  }
}
