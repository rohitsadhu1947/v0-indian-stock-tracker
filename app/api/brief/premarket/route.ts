/**
 * GET /api/brief/premarket
 *
 * Overnight moves abroad since the last Indian session, and the opening gap
 * they usually go with. Read only.
 */
import { NextResponse } from 'next/server'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'
import { premarket } from '@/lib/brief/premarket'
import logger from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const userId = await getAuthenticatedUserIdCompat()
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  try {
    const view = await premarket()
    return NextResponse.json({ success: !!view, premarket: view })
  } catch (error: any) {
    logger.error('Pre-market failed', { userId, error: error.message })
    return NextResponse.json({ success: false, error: 'Could not load the overnight figures' }, { status: 500 })
  }
}
