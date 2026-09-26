/**
 * GET /api/model-portfolio/performance
 * Value history of the user's paper books and NIFTY 50 over the same dates.
 */
import { NextResponse } from 'next/server'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'
import { portfolioPerformance } from '@/lib/portfolio/service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const userId = await getAuthenticatedUserIdCompat()
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  return NextResponse.json({ success: true, ...(await portfolioPerformance(userId)) })
}
