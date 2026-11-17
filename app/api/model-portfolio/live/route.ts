/**
 * GET /api/model-portfolio/live
 *
 * Current prices for the paper book's holdings and the user's real broker
 * holdings (read only). The page polls this during market hours.
 */
import { NextResponse } from 'next/server'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'
import { liveView } from '@/lib/portfolio/service'
import { brokerClientFor } from '../_shared'
import logger from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const userId = await getAuthenticatedUserIdCompat()
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  try {
    return NextResponse.json({ success: true, ...(await liveView(userId, await brokerClientFor(userId))) })
  } catch (error: any) {
    logger.error('Live prices failed', { userId, error: error.message })
    return NextResponse.json({ success: false, error: 'Could not load prices' }, { status: 500 })
  }
}
