/**
 * GET /api/fo-watch
 *
 * The paper day trades from F&O signals and their running totals. Read only.
 */
import { NextResponse } from 'next/server'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'
import { foWatchView } from '@/lib/fo-watch/service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const userId = await getAuthenticatedUserIdCompat()
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const view = await foWatchView()
  if (!view) return NextResponse.json({ success: false, error: 'The paper trade tables are not set up yet' }, { status: 503 })
  return NextResponse.json({ success: true, view })
}
