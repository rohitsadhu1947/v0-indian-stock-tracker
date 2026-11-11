/**
 * Publish adjusted bars from the local research store to the app's database.
 *
 *   npm run data:publish -- [--years=3] [--min-turnover-cr=1] [--until=YYYY-MM-DD] [--dry-run]
 *
 * Replaces the contents of daily_bars and corporate_actions in one
 * transaction (nothing changes if it fails). The cloud keeps only what the
 * live app needs: the last `--years` of history for every stock that is still
 * trading and liquid enough, plus the tracked indices from 2010. The previous
 * daily_bars rows are saved to data/backup first.
 */
import postgres from 'postgres'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { gzipSync } from 'zlib'
import { applyAdjustments } from '../../lib/market-data/adjust'
import { parseCorporateAction } from '../../lib/market-data/corporate-actions'
import { INDEX_SERIES } from '../../lib/market-data/indices'
import { buildSegments, loadEvents, loadRawSeries, loadSymbolMap } from '../../lib/market-data/series'
import { openStore, toDateInt, toIsoDate } from '../../lib/market-data/store'

const arg = (name: string, fallback: string) =>
  process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback
const YEARS = Number(arg('years', '3'))
const MIN_TURNOVER = Number(arg('min-turnover-cr', '1')) * 1e7
const DRY_RUN = process.argv.includes('--dry-run')

const store = openStore()
const UNTIL = arg('until', '')
const latest = (store.prepare('select max(date) d from raw_bars where date <= ?').get(UNTIL ? toDateInt(UNTIL) : 99999999) as { d: number }).d
const latestIso = toIsoDate(latest)
const since = toDateInt(`${Number(latestIso.slice(0, 4)) - YEARS}${latestIso.slice(4)}`)
// "Still trading": has a bar in the last few sessions
const recentDays = (store.prepare('select distinct date from raw_bars where date <= ? order by date desc limit 5').all(latest) as Array<{ date: number }>).map(r => r.date)
const activeSince = recentDays.at(-1)!

const universeSrc = readFileSync('lib/portfolio/universe.ts', 'utf8')
const alwaysKeep = new Set([...universeSrc.matchAll(/symbol: "([^"]+)"/g)].map(m => m[1]))

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}

type BarRow = {
  symbol: string; date: string; open: number; high: number; low: number; close: number
  volume: number; provisional: boolean; turnover: number | null; delivery_qty: number | null
}
type ActionRow = {
  symbol: string; ex_date: string; purposes: string; status: string
  price_factor: number; share_factor: number; dividend: number; note: string | null
}

const bars: BarRow[] = []
const actions: ActionRow[] = []
let stocks = 0

const segments = buildSegments(store, loadSymbolMap(store))
for (const [symbol, segs] of segments) {
  const raw = loadRawSeries(store, segs).filter(b => b.date <= latest)
  if (!raw.length || raw.at(-1)!.date < activeSince) continue
  const liquid = median(raw.slice(-60).map(b => b.value)) >= MIN_TURNOVER
  if (!liquid && !alwaysKeep.has(symbol)) continue

  const events = loadEvents(store, symbol).filter(e => e.exDate <= latest)
  stocks++
  for (const b of applyAdjustments(raw, events)) {
    if (b.date < since) continue
    bars.push({
      symbol, date: toIsoDate(b.date), open: b.open, high: b.high, low: b.low, close: b.close,
      volume: b.volume, provisional: false, turnover: b.value,
      delivery_qty: b.delivQty == null ? null : b.delivQty / b.shareFactor,
    })
  }
  for (const e of events) {
    if (e.exDate < since) continue
    actions.push({
      symbol, ex_date: toIsoDate(e.exDate), purposes: JSON.stringify(e.purposes), status: e.status,
      price_factor: e.priceFactor, share_factor: e.shareFactor, dividend: e.dividend, note: e.note ?? null,
    })
  }

  // Announced actions whose ex-date is still ahead: the daily update resolves them
  const upcoming = new Map<number, string[]>()
  const q = store.prepare('select ex_date, purpose from corporate_actions_raw where symbol = ? and ex_date > ?')
  for (const s of segs) {
    for (const r of q.all(s.symbol, latest) as Array<{ ex_date: number; purpose: string }>) {
      const a = parseCorporateAction(r.purpose)
      if (!a.split && !a.bonus && !a.rights && !a.dividend && !a.restructure) continue
      upcoming.set(r.ex_date, [...new Set([...(upcoming.get(r.ex_date) ?? []), r.purpose])])
    }
  }
  for (const [exDate, purposes] of upcoming) {
    actions.push({
      symbol, ex_date: toIsoDate(exDate), purposes: JSON.stringify(purposes), status: 'pending',
      price_factor: 1, share_factor: 1, dividend: 0, note: null,
    })
  }
}

let indexBars = 0
const indexQuery = store.prepare('select date, open, high, low, close from index_bars where lower(name) = lower(?) order by date')
for (const idx of INDEX_SERIES) {
  const byDate = new Map<number, any>()
  for (const name of idx.names) for (const r of indexQuery.all(name) as any[]) byDate.set(r.date, r)
  for (const r of [...byDate.values()].filter(r => r.date <= latest).sort((a, b) => a.date - b.date)) {
    bars.push({
      symbol: idx.barSymbol, date: toIsoDate(r.date), open: r.open ?? r.close, high: r.high ?? r.close,
      low: r.low ?? r.close, close: r.close, volume: 0, provisional: false, turnover: null, delivery_qty: null,
    })
    indexBars++
  }
  console.log(`  ${idx.barSymbol.padEnd(26)} ${byDate.size} bars`)
}
store.close()

console.log(`${stocks} stocks, ${bars.length - indexBars} stock bars since ${toIsoDate(since)}, ` +
  `${indexBars} index bars, ${actions.length} corporate actions. Latest date ${latestIso}.`)
if (DRY_RUN) process.exit(0)

async function publish() {
  const sql = postgres(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!, { ssl: 'require', max: 1 })

  mkdirSync('data/backup', { recursive: true })
  const old = await sql`select symbol, date::text, open, high, low, close, volume, provisional from daily_bars order by symbol, date`
  const backup = `data/backup/daily_bars_before_${new Date().toISOString().slice(0, 19).replaceAll(':', '')}.json.gz`
  writeFileSync(backup, gzipSync(JSON.stringify(old)))
  console.log(`Saved ${old.length} existing rows to ${backup}`)

  await sql.unsafe(readFileSync('db/migrations/manual/0005_market_data.sql', 'utf8'))
  await sql.begin(async tx => {
    await tx`truncate daily_bars`
    await tx`truncate corporate_actions`
    for (let i = 0; i < bars.length; i += 2000) {
      await tx`insert into daily_bars ${tx(bars.slice(i, i + 2000))}`
      if (i % 100000 === 0) console.log(`  bars ${i}/${bars.length}`)
    }
    for (let i = 0; i < actions.length; i += 2000) {
      const chunk = actions.slice(i, i + 2000)
      await tx`insert into corporate_actions ${tx(chunk.map(a => ({ ...a, purposes: tx.json(JSON.parse(a.purposes)) })))}
        on conflict (symbol, ex_date) do nothing`
    }
  })
  const [{ n, d }] = await sql`select count(*)::int n, max(date)::text d from daily_bars`
  console.log(`Published. daily_bars now has ${n} rows, latest ${d}.`)
  await sql.end()
}

publish().catch(err => {
  console.error(err)
  process.exit(1)
})
