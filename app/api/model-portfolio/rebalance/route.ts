/**
 * POST /api/model-portfolio/rebalance
 * Body: { kind: 'core' | 'satellite', mode, trendFilter?, capital?, force? }
 *
 * Executes this month's orders on the paper book at current prices, with
 * slippage and Indian delivery charges. Refuses when the book was already
 * rebalanced this month (unless force), when price data is stale, or when any
 * instrument has no price.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'
import { executeRebalance, RebalanceRefused } from '@/lib/portfolio/service'
import { brokerClientFor, parseCapital, parseMode } from '../_shared'
import logger from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserIdCompat()
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  if (body.kind !== 'core' && body.kind !== 'satellite') {
    return NextResponse.json({ error: "kind must be 'core' or 'satellite'" }, { status: 400 })
  }

  try {
    const result = await executeRebalance({
      userId,
      kind: body.kind,
      mode: parseMode(body.mode),
      trendFilter: body.trendFilter === true,
      capital: parseCapital(body.capital),
      client: await brokerClientFor(userId),
      force: body.force === true,
    })
    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    if (error instanceof RebalanceRefused) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 })
    }
    logger.error('Rebalance failed', { userId, kind: body.kind, error: error.message })
    return NextResponse.json({ success: false, error: 'Rebalance failed', details: error.message }, { status: 500 })
  }
}
