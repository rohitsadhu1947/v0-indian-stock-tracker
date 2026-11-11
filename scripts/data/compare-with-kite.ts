/**
 * Independent check of the adjustment logic: compare our adjusted closes with
 * the split-adjusted history Zerodha Kite returned (the rows backed up from
 * daily_bars before publishing, or the live table).
 *
 *   npx tsx --env-file=.env.local scripts/data/compare-with-kite.ts [backup.json.gz] [--asof=2026-09-25] [--until=2026-08-31]
 *
 * `--asof` is the date the Kite history was downloaded (adjusted as of then);
 * `--until` ignores later rows, which were appended raw from quotes.
 */
import postgres from 'postgres'
import { readFileSync } from 'fs'
import { gunzipSync } from 'zlib'
import { applyAdjustments } from '../../lib/market-data/adjust'
import { buildSegments, loadEvents, loadRawSeries, loadSymbolMap } from '../../lib/market-data/series'
import { openStore, toDateInt } from '../../lib/market-data/store'

const arg = (name: string, fallback: string) =>
  process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback
const ASOF = toDateInt(arg('asof', '2026-09-25'))
const UNTIL = arg('until', '2026-08-31')
const file = process.argv.slice(2).find(a => !a.startsWith('--'))

type KiteRow = { symbol: string; date: string; close: number }

async function kiteRows(): Promise<KiteRow[]> {
  if (file) return JSON.parse(gunzipSync(readFileSync(file)).toString())
  const sql = postgres(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!, { ssl: 'require', max: 1 })
  const rows = await sql<KiteRow[]>`select symbol, date::text, close from daily_bars where symbol not like 'IDX:%' and provisional = false`
  await sql.end()
  return rows
}

async function main() {
  const kite = new Map<string, Map<number, number>>()
  for (const r of await kiteRows()) {
    if (r.symbol.startsWith('IDX:') || r.date > UNTIL) continue
    if (!kite.has(r.symbol)) kite.set(r.symbol, new Map())
    kite.get(r.symbol)!.set(toDateInt(r.date), Number(r.close))
  }

  const store = openStore()
  const segments = buildSegments(store, loadSymbolMap(store))
  let compared = 0, matched = 0, missing = 0
  const off: string[] = []
  for (const [symbol, theirs] of kite) {
    const segs = segments.get(symbol)
    if (!segs) { missing++; continue }
    const raw = loadRawSeries(store, segs).filter(b => b.date <= ASOF)
    const ours = applyAdjustments(raw, loadEvents(store, symbol).filter(e => e.exDate <= ASOF))
    let n = 0, bad = 0, worst = 0, worstDate = 0
    for (const b of ours) {
      const t = theirs.get(b.date)
      if (!t) continue
      n++
      const diff = Math.abs(b.close / t - 1)
      if (diff > 0.005) bad++
      if (diff > worst) { worst = diff; worstDate = b.date }
    }
    if (!n) { missing++; continue }
    compared++
    if (bad === 0) matched++
    else off.push(`${symbol.padEnd(12)} ${bad}/${n} days differ by more than 0.5%; worst ${(worst * 100).toFixed(1)}% on ${worstDate}`)
  }
  store.close()

  console.log(`${compared} stocks compared, ${matched} match on every day, ${off.length} differ, ${missing} not found locally`)
  for (const line of off) console.log('  ' + line)
}

main()
