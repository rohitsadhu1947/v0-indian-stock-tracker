/**
 * Cron: load NSE's official end-of-day files into daily_bars (20:30 IST,
 * Mon-Fri; also called by the morning cron to catch late publication).
 *
 * Needs no broker login. Fills any trading days missed since the last run,
 * applies splits and bonuses, and messages the admins on Telegram when the
 * update fails, so stale data is noticed.
 */
import { NextRequest, NextResponse } from 'next/server'
import { authorizeCron } from '@/lib/cron-auth'
import { runMarketDataUpdate } from '@/lib/market-data/run-update'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const caller = await authorizeCron(request)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const summary = await runMarketDataUpdate()
  return NextResponse.json({ caller, ...summary }, { status: summary.ok ? 200 : 500 })
}
