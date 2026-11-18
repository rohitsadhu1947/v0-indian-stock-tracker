/**
 * GET /api/screener
 *
 * Price facts and Monthly Plan ranks for every NIFTY 500 stock, as of the
 * latest nightly data. Read only.
 */
import { NextResponse } from 'next/server'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'
import { buildScreen } from '@/lib/screener/service'
import logger from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET() {
  const userId = await getAuthenticatedUserIdCompat()
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  try {
    const screen = await buildScreen()
    if (!screen) return NextResponse.json({ success: false, error: 'No price data yet' }, { status: 503 })
    return NextResponse.json({ success: true, screen })
  } catch (error: any) {
    logger.error('Screener failed', { userId, error: error.message })
    return NextResponse.json({ success: false, error: 'Could not build the screen' }, { status: 500 })
  }
}
