/**
 * GET /api/positions/paper/history
 *
 * Fetch trade history for the authenticated user.
 * Supports pagination via ?page=1&limit=50 and filtering via ?symbol=RELIANCE
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { tradeHistory } from '@/db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserIdCompat()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const symbol = searchParams.get('symbol')
    const offset = (page - 1) * limit

    // Build WHERE conditions
    const conditions = [eq(tradeHistory.userId, userId)]
    if (symbol) {
      conditions.push(eq(tradeHistory.symbol, symbol))
    }

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tradeHistory)
      .where(and(...conditions))

    // Get trades
    const trades = await db
      .select()
      .from(tradeHistory)
      .where(and(...conditions))
      .orderBy(desc(tradeHistory.exitTime))
      .limit(limit)
      .offset(offset)

    // Calculate summary stats
    const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0)
    const winCount = trades.filter((t) => t.pnl > 0).length
    const lossCount = trades.filter((t) => t.pnl <= 0).length
    const winRate = trades.length > 0 ? (winCount / trades.length) * 100 : 0

    return NextResponse.json({
      success: true,
      trades,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
      summary: {
        totalTrades: count,
        totalPnl,
        winCount,
        lossCount,
        winRate: parseFloat(winRate.toFixed(1)),
      },
    })
  } catch (error: any) {
    console.error('Error fetching trade history:', error)
    return NextResponse.json(
      { error: 'Failed to fetch trade history', details: error.message },
      { status: 500 }
    )
  }
}
