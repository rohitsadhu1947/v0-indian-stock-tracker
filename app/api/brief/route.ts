/**
 * GET /api/brief
 *
 * The morning brief: the last session's market, sectors and movers, the
 * user's paper book, and material filings since the close. Read only.
 */
import { NextResponse } from 'next/server'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'
import { morningBrief } from '@/lib/brief/service'
import logger from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET() {
  const userId = await getAuthenticatedUserIdCompat()
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  try {
    const brief = await morningBrief(userId)
    if (!brief) return NextResponse.json({ success: false, error: 'No price data yet' }, { status: 503 })
    return NextResponse.json({ success: true, brief })
  } catch (error: any) {
    logger.error('Morning brief failed', { userId, error: error.message })
    return NextResponse.json({ success: false, error: 'Could not build the brief' }, { status: 500 })
  }
}
