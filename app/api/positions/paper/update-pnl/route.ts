/**
 * Auto P&L Update & Auto-Exit API
 *
 * POST /api/positions/paper/update-pnl
 * Updates P&L for the caller's open paper positions and closes any that hit a
 * stop or target. The logic lives in lib/paper-exit-engine.ts, shared with the
 * scheduled job so exits do not depend on a browser tab being open.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { paperPositions } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'
import { processUserExits } from '@/lib/paper-exit-engine'
import logger from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface ExitInfo {
  positionId: number
  symbol: string
  reason: 'STOP_LOSS' | 'TARGET_1' | 'TARGET_2' | 'MANUAL'
  exitPrice: number
  entryPrice: number
  pnl: number
  pnlPercent: number
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserIdCompat()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Shared with the scheduled job (GET /api/cron/check-exits) so a position
    // is closed the same way whether or not the app is open.
    const result = await processUserExits(userId)

    if (result.error && result.updated === 0 && result.open > 0) {
      return NextResponse.json({ success: false, error: result.error }, { status: 502 })
    }

    return NextResponse.json({
      success: true,
      updated: result.updated,
      autoExits: result.autoExits,
      open: result.open,
      warning: result.error,
    })
  } catch (error: any) {
    logger.error('Auto P&L update failed', { error: error.message })
    return NextResponse.json(
      { error: 'Failed to update positions', details: error.message },
      { status: 500 }
    )
  }
}

// GET endpoint to check status
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserIdCompat()
    
    if (!userId) {
      return NextResponse.json({ 
        error: 'Unauthorized' 
      }, { status: 401 })
    }

    // Get count of open positions
    const openPositions = await db
      .select()
      .from(paperPositions)
      .where(
        and(
          eq(paperPositions.userId, userId),
          eq(paperPositions.status, 'open')
        )
      )

    // Calculate total P&L
    const totalPnL = openPositions.reduce((sum, p) => sum + (p.pnl || 0), 0)
    const totalCapital = openPositions.reduce((sum, p) => sum + (p.capitalRequired || 0), 0)

    return NextResponse.json({
      success: true,
      openPositions: openPositions.length,
      totalPnL,
      totalCapital,
      lastUpdate: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('❌ Status check error:', error)
    return NextResponse.json(
      { error: 'Failed to check status', details: error.message },
      { status: 500 }
    )
  }
}

