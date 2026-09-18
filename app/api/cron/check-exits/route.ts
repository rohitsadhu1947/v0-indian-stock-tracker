/**
 * Cron: paper position stop-loss / target checks
 *
 * GET /api/cron/check-exits
 *
 * Runs during market hours so exits are honoured even when nobody has the app
 * open. Previously stops were only checked while the Momentum tab was visible,
 * so a position could blow through its stop overnight and stay open.
 *
 * Auth: Vercel CRON_SECRET header, or an admin session for manual runs.
 */

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { processUserExits, usersWithOpenPositions } from '@/lib/paper-exit-engine'
import { isMarketOpen } from '@/lib/cache-helpers'
import logger from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET
    const authHeader = Buffer.from(request.headers.get('authorization') || '')
    const expected = Buffer.from(cronSecret ? `Bearer ${cronSecret}` : '')
    const isScheduler =
      !!cronSecret &&
      authHeader.length === expected.length &&
      timingSafeEqual(authHeader, expected)

    if (!isScheduler) {
      const { getCurrentUser } = await import('@/lib/multi-user-auth')
      const user = await getCurrentUser()
      if (!user || user.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    // `force=1` lets an admin run the check outside market hours
    const force = request.nextUrl.searchParams.get('force') === '1'
    if (!force && !isMarketOpen()) {
      return NextResponse.json({ success: true, skipped: 'market closed', runs: [] })
    }

    const userIds = await usersWithOpenPositions()
    const runs = []
    for (const userId of userIds) {
      try {
        runs.push(await processUserExits(userId))
      } catch (err: any) {
        logger.error('Exit check failed for user', { userId, error: err.message })
        runs.push({ userId, open: 0, updated: 0, autoExits: [], priced: 0, error: err.message })
      }
    }

    const exits = runs.reduce((n, r) => n + r.autoExits.length, 0)
    logger.info('Exit check complete', {
      users: userIds.length,
      updated: runs.reduce((n, r) => n + r.updated, 0),
      exits,
    })

    return NextResponse.json({ success: true, users: userIds.length, exits, runs })
  } catch (error: any) {
    logger.error('Exit check cron failed', { error: error.message })
    return NextResponse.json({ error: 'Exit check failed', details: error.message }, { status: 500 })
  }
}
