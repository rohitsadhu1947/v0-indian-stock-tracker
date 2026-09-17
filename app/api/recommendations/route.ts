import { NextRequest, NextResponse } from 'next/server'
import { generateRecommendations } from '@/lib/recommendation-engine'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'

/**
 * GET /api/recommendations
 *
 * Returns actionable stock recommendations with full explanations.
 * Synthesizes: macro data, geopolitical events, sector analysis,
 * second-order effects, and risk management into specific picks.
 *
 * Query params:
 * - forceRefresh: 'true' to bypass cached macro data (default: false)
 * - includeAll: 'true' to include HOLD/AVOID stocks too (default: false)
 */
export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserIdCompat()
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const forceRefresh = searchParams.get('forceRefresh') === 'true'
    const includeAll = searchParams.get('includeAll') === 'true'

    console.log(`🎯 /api/recommendations — forceRefresh: ${forceRefresh}, includeAll: ${includeAll}`)

    const report = await generateRecommendations({
      forceRefresh,
      includeAllStocks: includeAll,
    })

    return NextResponse.json({
      success: true,
      report,
      meta: {
        topPicksCount: report.topPicks.length,
        avoidCount: report.avoidList.length,
        sectorsAnalyzed: report.sectorOutlook.length,
        geoAlerts: report.geopoliticalAlerts.length,
        generatedAt: report.generatedAt.toISOString(),
      },
    })
  } catch (error: any) {
    console.error('❌ Recommendations error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to generate recommendations',
    }, { status: 500 })
  }
}
