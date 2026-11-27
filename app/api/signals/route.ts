/**
 * GET /api/signals            day-trade shorts and the Monthly Plan's orders
 * GET /api/signals?part=day   only the day trades (the page polls this while one is open)
 *
 * Read only. The app places no orders.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'
import { dayTradeView, monthlyView } from '@/lib/signals/service'
import { brokerClientFor } from '../model-portfolio/_shared'
import logger from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserIdCompat()
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  try {
    const client = await brokerClientFor(userId)
    const dayOnly = request.nextUrl.searchParams.get('part') === 'day'
    const [day, monthly] = await Promise.all([
      dayTradeView(client),
      dayOnly ? null : monthlyView(userId, client).catch(error => { logger.error('Monthly signals failed', { userId, error: error.message }); return null }),
    ])
    return NextResponse.json({ success: true, day, monthly })
  } catch (error: any) {
    logger.error('Signals failed', { userId, error: error.message })
    return NextResponse.json({ success: false, error: 'Could not load the signals' }, { status: 500 })
  }
}
