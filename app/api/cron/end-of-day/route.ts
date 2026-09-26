/**
 * Cron: end-of-day jobs (15:25 IST, Mon-Fri; Vercel Hobby allows one run a day)
 *
 *   1. Paper position stop/target checks (lib/paper-exit-engine)
 *   2. Today's bar for the NIFTY 500 + engine indices from batched quotes,
 *      finalising yesterday's provisional bar with the official close
 *   3. Daily value snapshot of every model portfolio
 *
 * Steps run independently: one failing does not stop the others.
 * Needs a Kite token from today's login for steps 1-2.
 * Admin can run it manually; ?force=1 runs step 1 outside market hours.
 */
import { NextRequest, NextResponse } from 'next/server'
import { authorizeCron } from '@/lib/cron-auth'
import { isMarketOpen } from '@/lib/cache-helpers'
import { processUserExits, usersWithOpenPositions } from '@/lib/paper-exit-engine'
import { getBrokerManager } from '@/lib/broker'
import { updateDailyBarsFromQuotes } from '@/lib/portfolio/data'
import { snapshotAllPortfolios } from '@/lib/portfolio/service'
import logger from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

async function step<T>(name: string, fn: () => Promise<T>): Promise<{ ok: boolean; result?: T; error?: string }> {
  try {
    return { ok: true, result: await fn() }
  } catch (err: any) {
    logger.error(`End-of-day step failed: ${name}`, { error: err.message })
    return { ok: false, error: err.message }
  }
}

export async function GET(request: NextRequest) {
  const caller = await authorizeCron(request)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const force = request.nextUrl.searchParams.get('force') === '1'

  const exits = await step('exits', async () => {
    if (!force && !isMarketOpen()) return { skipped: 'market closed' }
    const runs = []
    for (const userId of await usersWithOpenPositions()) runs.push(await processUserExits(userId))
    return { users: runs.length, exits: runs.reduce((n, r) => n + r.autoExits.length, 0) }
  })

  const bars = await step('bars', async () => {
    const manager = await getBrokerManager()
    if (!manager.hasConnection()) throw new Error('No usable Kite token: log in with Kite today')
    return updateDailyBarsFromQuotes(manager.getClient())
  })

  const snapshots = await step('snapshots', () => snapshotAllPortfolios())

  const summary = { success: exits.ok && bars.ok && snapshots.ok, caller, exits, bars, snapshots }
  logger.info('End-of-day complete', summary)
  return NextResponse.json(summary)
}
