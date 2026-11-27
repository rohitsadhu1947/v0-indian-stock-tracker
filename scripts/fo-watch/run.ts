/**
 * Run the paper tracker by hand.
 *
 *   npm run fo-watch                      latest session, as the nightly job does
 *   npm run fo-watch -- --history=35      first load option volumes for the last 35 calendar days
 *   npm run fo-watch -- --from=2026-11-12 also record signals for every session from that date
 *
 * Recording earlier sessions sends no Telegram messages.
 */
import { db } from '@/db'
import { foStockDays } from '@/db/schema'
import { asc, gte } from 'drizzle-orm'
import { runFoWatch } from '@/lib/fo-watch/service'

const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1]
const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10)

async function main() {
  const history = Number(arg('history') ?? 0), from = arg('from')
  // Oldest first, so each day's signals see the days before it. Weekends have no file and are skipped inside.
  for (let n = history; n >= 1; n--) {
    const day = addDays(today, -n)
    const weekday = new Date(day + 'T00:00:00Z').getUTCDay()
    if (weekday === 0 || weekday === 6) continue
    const recordSignals = !!from && day >= from
    const run = await runFoWatch({ date: day, notify: false, signals: recordSignals })
    console.log(`${day}: ${run.date ? `loaded${recordSignals || run.added ? `, ${run.added} signals for ${run.tradeDate}` : ''}` : 'no F&O file'}${run.problem ? ` (${run.problem})` : ''}`)
  }
  const run = await runFoWatch({ notify: !history })
  console.log(`Latest session ${run.date}: ${run.added} new signals for ${run.tradeDate}; ${run.resolved} trades priced, ${run.waiting} waiting for prices${run.problem ? `; problem: ${run.problem}` : ''}`)
  const sessions = await db.selectDistinct({ date: foStockDays.date }).from(foStockDays).where(gte(foStockDays.date, addDays(today, -60))).orderBy(asc(foStockDays.date))
  console.log(`${sessions.length} sessions of option volume on record.`)
}

main().then(() => process.exit(0)).catch(error => { console.error(error.message ?? error); process.exit(1) })
