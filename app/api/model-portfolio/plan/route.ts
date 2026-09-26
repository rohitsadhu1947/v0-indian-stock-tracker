/**
 * GET /api/model-portfolio/plan?mode=multifactor&trend=1&capital=300000
 *
 * This month's plan for both paper books: market regime, sleeve allocation,
 * stock-momentum ranking, and the buy/sell orders that would rebalance each
 * book. Read-only: nothing is executed.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'
import { buildMonthlyPlan } from '@/lib/portfolio/service'
import { brokerClientFor, parseCapital, parseMode } from '../_shared'
import logger from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserIdCompat()
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  try {
    const sp = request.nextUrl.searchParams
    const plan = await buildMonthlyPlan({
      userId,
      mode: parseMode(sp.get('mode')),
      trendFilter: sp.get('trend') === '1',
      capital: parseCapital(sp.get('capital')),
      client: await brokerClientFor(userId),
    })
    return NextResponse.json({ success: true, plan })
  } catch (error: any) {
    logger.error('Monthly plan failed', { userId, error: error.message })
    return NextResponse.json({ success: false, error: 'Failed to build plan', details: error.message }, { status: 500 })
  }
}
