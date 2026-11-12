/**
 * GET /api/model-portfolio/track-record
 *
 * The live record of each Monthly Plan mode: its frozen month-end picks
 * replayed with the backtest's simulator, against NIFTY 500 and the
 * NIFTY 500 equal-weight index over the same days.
 */
import { NextResponse } from 'next/server'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'
import { loadTrackRecord } from '@/lib/portfolio/signals'
import logger from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET() {
  const userId = await getAuthenticatedUserIdCompat()
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  try {
    return NextResponse.json({ success: true, ...(await loadTrackRecord()) })
  } catch (error: any) {
    logger.error('Track record failed', { userId, error: error.message })
    return NextResponse.json({ success: false, error: 'Failed to load the track record' }, { status: 500 })
  }
}
