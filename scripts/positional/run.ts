/**
 * Run the positional job by hand.
 *
 *   npm run positional                              latest session, as the nightly job does
 *   npm run positional -- --results-days=120        first load results dates from the last 120 days of NSE files
 *   npm run positional -- --from=2026-10-01         replay every session from that date, then the latest
 *
 *   npm run positional -- --strength                work out the 12-month strength of trades stored before the rule used it
 *
 * Replaying earlier sessions sends no Telegram messages.
 */
import { db } from '@/db'
import { dailyBars } from '@/db/schema'
import { and, asc, eq, gte } from 'drizzle-orm'
import { extractPrBundle, fetchArchiveFile, prBundleUrl } from '@/lib/market-data/nse-archive'
import { INDEX_INSTRUMENTS } from '@/lib/portfolio/config'
import { strengthLabel, isWeak } from '@/lib/positional/core'
import { backfillStrength, runPositionalWatch, storeResultsDates } from '@/lib/positional/service'

const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1]
const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10)

async function main() {
  if (process.argv.includes('--strength')) {
    const done = await backfillStrength()
    for (const d of done) console.log(`${d.signalDate}  ${d.symbol.padEnd(14)} ${d.status.padEnd(8)} ${d.rank == null ? 'n/a ' : d.rank.toFixed(2)}  ${strengthLabel(d.rank)}${isWeak(d.rank) ? '  WEAK' : ''}`)
    console.log(`${done.length} trades updated, ${done.filter(d => isWeak(d.rank)).length} of them weak.`)
    return
  }
  const resultsDays = Number(arg('results-days') ?? 0), from = arg('from')
  let stored = 0
  for (let n = resultsDays; n >= 0 && resultsDays > 0; n--) {
    const day = addDays(today, -n), weekday = new Date(day + 'T00:00:00Z').getUTCDay()
    if (weekday === 0 || weekday === 6) continue
    const zip = await fetchArchiveFile(prBundleUrl(day)).catch(() => null)
    if (zip) stored += await storeResultsDates(extractPrBundle(zip).bm)
    await new Promise(r => setTimeout(r, 250))
  }
  if (resultsDays) console.log(`Results dates read from ${resultsDays} days of files: ${stored} rows offered (repeats are skipped).`)

  if (from) {
    const sessions = await db.select({ date: dailyBars.date }).from(dailyBars)
      .where(and(eq(dailyBars.symbol, INDEX_INSTRUMENTS.NIFTY_50.barSymbol), gte(dailyBars.date, from))).orderBy(asc(dailyBars.date))
    for (const s of sessions) {
      const run = await runPositionalWatch({ asOf: String(s.date), notify: false })
      if (run.signals.length || run.opened || run.closed.length || run.problem) {
        console.log(`${s.date}: ${run.signals.length ? `signals ${run.signals.join(', ')}; ` : ''}${run.skippedWeak.length ? `too weak ${run.skippedWeak.join(', ')}; ` : ''}${run.opened ? `${run.opened} opened; ` : ''}${run.closed.length ? `closed ${run.closed.join(', ')}; ` : ''}${run.problem ?? ''}`)
      }
    }
  }
  const run = await runPositionalWatch({ notify: !from && !resultsDays })
  console.log(`Latest session ${run.asOf}: ${run.signals.length} new signals${run.signals.length ? ` (${run.signals.join(', ')})` : ''}, ${run.opened} opened, ${run.closed.length} closed, ${run.dueTomorrow.length} due to sell next session${run.problem ? `; problem: ${run.problem}` : ''}`)
}

main().then(() => process.exit(0)).catch(error => { console.error(error.message ?? error); process.exit(1) })
