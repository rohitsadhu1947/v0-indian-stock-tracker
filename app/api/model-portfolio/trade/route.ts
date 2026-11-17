/**
 * POST /api/model-portfolio/trade
 * Body: { symbol, side: 'BUY' | 'SELL', qty }
 *
 * One manual trade on the paper book at the current price, with slippage
 * and charges. No real order is placed.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'
import { executeTrade, RebalanceRefused } from '@/lib/portfolio/service'
import { brokerClientFor } from '../_shared'
import logger from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserIdCompat()
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const symbol = typeof body.symbol === 'string' ? body.symbol.trim().toUpperCase() : ''
  if (!/^[A-Z0-9&-]{1,20}$/.test(symbol) || (body.side !== 'BUY' && body.side !== 'SELL')) {
    return NextResponse.json({ success: false, error: 'Give a stock symbol and a side of BUY or SELL.' }, { status: 400 })
  }

  try {
    const result = await executeTrade({
      userId, symbol, side: body.side, qty: Number(body.qty), client: await brokerClientFor(userId),
    })
    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    if (error instanceof RebalanceRefused) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 })
    }
    logger.error('Paper trade failed', { userId, symbol, error: error.message })
    return NextResponse.json({ success: false, error: 'Trade failed' }, { status: 500 })
  }
}
