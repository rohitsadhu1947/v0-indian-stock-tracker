/**
 * GET /api/signals            day-trade shorts, results buys, split buys, dividend buys and the Monthly Plan's orders
 * GET /api/signals?part=day   only the day trades (the page polls this while one is open)
 *
 * Read only. The app places no orders.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'
import { positionalView } from '@/lib/positional/service'
import { splitView } from '@/lib/positional/split-service'
import { dividendView } from '@/lib/positional/dividend-service'
import { loadCautions } from '@/lib/positional/caution-service'
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
    const [day, positional, splits, dividends, monthly] = await Promise.all([
      dayTradeView(client),
      dayOnly ? null : positionalView(client),
      dayOnly ? null : splitView(client),
      dayOnly ? null : dividendView(client),
      dayOnly ? null : monthlyView(userId, client).catch(error => { logger.error('Monthly signals failed', { userId, error: error.message }); return null }),
    ])
    // Split and bonus cautions for the results buys; the Monthly Plan's orders bring their own
    const cautions = { ...(monthly?.cautions ?? {}), ...(positional ? await loadCautions([...positional.fresh, ...positional.open].map(r => r.symbol)) : {}) }
    return NextResponse.json({ success: true, day, positional, splits, dividends, monthly, cautions })
  } catch (error: any) {
    logger.error('Signals failed', { userId, error: error.message })
    return NextResponse.json({ success: false, error: 'Could not load the signals' }, { status: 500 })
  }
}
