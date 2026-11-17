/**
 * POST /api/model-portfolio/rebalance
 * Body: { mode, trendFilter?, capital? }
 *
 * Carries out the plan's action for that mode on the paper book at current
 * prices, with slippage and Indian delivery charges: starts the book, does
 * the monthly rebalance, or switches the book to that mode. Refuses when the
 * monthly rebalance was already done, when price data is stale, or when any
 * stock has no price. No real orders are placed.
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

  try {
    const result = await executeRebalance({
      userId,
      mode: parseMode(body.mode),
      trendFilter: body.trendFilter === true,
      capital: parseCapital(body.capital),
      client: await brokerClientFor(userId),
    })
    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    if (error instanceof RebalanceRefused) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 })
    }
    logger.error('Rebalance failed', { userId, error: error.message })
    return NextResponse.json({ success: false, error: 'Rebalance failed', details: error.message }, { status: 500 })
  }
}
