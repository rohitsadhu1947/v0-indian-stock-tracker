/**
 * Load downloaded NSE archive files (data/nse/raw) into the local research
 * store (data/market.db). Safe to re-run: days already loaded are skipped.
 *
 *   npx tsx scripts/data/ingest-nse.ts [--from=YYYY-MM-DD]
 *
 * Every day must chain to the session before it (its stated previous closes
 * equal the closes already stored). NSE's archive contains mock-trading
 * sessions with fake prices and, once, a file holding another year's data;
 * such a day is skipped. If the days after it do not chain either, a real
 * session is missing and the load stops with instructions.
 *
 * --from reloads that day and everything after it.
 */
import { existsSync, readFileSync } from 'fs'
import { gunzipSync } from 'zlib'
import {
  continuity, parseCorporateActionsFile, parseDeliveryFile, parseIndexCloseFile, parseLegacyBhavcopy,
  parseMarketCapFile, parsePriceFile, parseSymbolChanges,
} from '../../lib/market-data/nse-parse'
import { openStore, toDateInt } from '../../lib/market-data/store'

const FROM = process.argv.find(a => a.startsWith('--from='))?.split('=')[1]
const MIN_CONTINUITY = 0.8
const manifest: Record<string, string> = JSON.parse(readFileSync('data/nse/manifest.json', 'utf8'))
const db = openStore()
db.exec('pragma synchronous = off') // bulk load; the source files remain on disk
db.exec('create table if not exists skipped_days (date integer primary key, reason text not null)')
if (FROM) {
  const from = toDateInt(FROM)
  for (const t of ['raw_bars', 'index_bars', 'ingested_days', 'skipped_days', 'share_capital']) {
    db.prepare(`delete from ${t} where date >= ?`).run(from)
  }
}

loadSymbolChanges()

const done = new Set((db.prepare('select date from ingested_days').all() as Array<{ date: number }>).map(r => r.date))
const days = Object.keys(manifest).filter(d => manifest[d] === 'ok' && !done.has(toDateInt(d))).sort()
console.log(`${days.length} days to load`)

function loadSymbolChanges() {
  const path = 'data/nse/symbolchange.csv'
  if (!existsSync(path)) return
  const ins = db.prepare('insert or replace into symbol_changes (old_symbol, new_symbol, effective_date) values (?, ?, ?)')
  db.exec('begin')
  for (const c of parseSymbolChanges(readFileSync(path, 'latin1'))) ins.run(c.oldSymbol, c.newSymbol, toDateInt(c.effectiveDate))
  db.exec('commit')
}

const read = (path: string): string | null => (existsSync(path) ? gunzipSync(readFileSync(path)).toString('latin1') : null)

const insBar = db.prepare(`insert or replace into raw_bars
  (symbol, date, series, prev_close, open, high, low, close, volume, value, trades, deliv_qty)
  values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
const insIndex = db.prepare('insert or replace into index_bars (name, date, open, high, low, close) values (?, ?, ?, ?, ?, ?)')
const insAction = db.prepare('insert or ignore into corporate_actions_raw (symbol, ex_date, purpose, first_seen) values (?, ?, ?, ?)')
const lastCapital = db.prepare('select face_value, shares from share_capital where symbol = ? and date <= ? order by date desc limit 1')
const insCapital = db.prepare('insert or replace into share_capital (symbol, date, face_value, shares) values (?, ?, ?, ?)')
const markDone = db.prepare('insert or replace into ingested_days (date) values (?)')

const insSkip = db.prepare('insert or replace into skipped_days (date, reason) values (?, ?)')

/** Closes of the latest session already stored, to check the next day chains to it. */
function storedCloses(): Map<string, number> {
  const rows = db.prepare('select symbol, close from raw_bars where date = (select max(date) from raw_bars)').all() as Array<{ symbol: string; close: number }>
  return new Map(rows.map(r => [r.symbol, r.close]))
}

let previousCloses = storedCloses()
let bars = 0
let pendingSkip: { day: string; rate: number } | null = null

for (const [i, day] of days.entries()) {
  const stem = `data/nse/raw/${day.slice(0, 4)}/${day.replaceAll('-', '')}`
  const date = toDateInt(day)
  const pd = read(`${stem}.pd.csv.gz`)
  if (!pd) { console.error(`${day}: price file missing`); continue }
  let { equities, indices } = parsePriceFile(pd)
  // NSE publishes files for mock and test sessions with a handful of securities
  if (equities.length < 500) {
    console.log(`${day}: only ${equities.length} equities, not a normal session, skipped`)
    insSkip.run(date, 'too few securities')
    markDone.run(date)
    continue
  }

  let rate = continuity(equities, previousCloses)
  if (rate < MIN_CONTINUITY) {
    // A replacement fetched with `download-nse.ts --legacy=<date>`
    const legacy = read(`${stem}.legacy.csv.gz`)
    const replacement = legacy ? parseLegacyBhavcopy(legacy, day) : []
    if (replacement.length >= 500 && continuity(replacement, previousCloses) >= MIN_CONTINUITY) {
      console.log(`${day}: bundle does not follow the previous session (${(rate * 100).toFixed(0)}% match); using the older-format file`)
      equities = replacement
      const idx = read(`${stem}.indices.csv.gz`)
      indices = idx ? parseIndexCloseFile(idx) : []
      rate = 1
    }
  }
  if (rate < MIN_CONTINUITY) {
    if (pendingSkip) {
      console.error(`\nStopped: neither ${pendingSkip.day} nor ${day} follows the last stored session, so a real session is missing.\n` +
        `Fetch NSE's older-format file for it and re-run:\n  npx tsx scripts/data/download-nse.ts --legacy=${pendingSkip.day}\n  npx tsx scripts/data/ingest-nse.ts`)
      process.exitCode = 1
      break
    }
    // Decided by the next day: if it chains to the stored session, this one was a mock session
    pendingSkip = { day, rate }
    continue
  }
  if (pendingSkip) {
    console.log(`${pendingSkip.day}: prices do not follow the previous session (${(pendingSkip.rate * 100).toFixed(0)}% match) and the next session ignores them: mock session, skipped`)
    insSkip.run(toDateInt(pendingSkip.day), 'mock session or wrong file')
    markDone.run(toDateInt(pendingSkip.day))
    pendingSkip = null
  }

  const mto = read(`${stem}.mto.dat.gz`)
  const delivered = new Map<string, number>()
  // A symbol can be listed once per series; keep the larger delivery figure
  for (const r of mto ? parseDeliveryFile(mto) : []) {
    delivered.set(r.symbol, Math.max(delivered.get(r.symbol) ?? 0, r.deliveredQty))
  }
  const bc = read(`${stem}.bc.csv.gz`)
  const mcap = read(`${stem}.mcap.csv.gz`)

  db.exec('begin')
  for (const b of equities) {
    insBar.run(b.symbol, date, b.series, Number.isFinite(b.prevClose) ? b.prevClose : null,
      b.open, b.high, b.low, b.close, b.volume, b.value, b.trades, delivered.get(b.symbol) ?? null)
  }
  for (const x of indices) {
    insIndex.run(x.name, date, x.open || null, x.high || null, x.low || null, x.close)
  }
  for (const a of bc ? parseCorporateActionsFile(bc) : []) {
    insAction.run(a.symbol, toDateInt(a.exDate), a.purpose, date)
  }
  for (const m of mcap ? parseMarketCapFile(mcap) : []) {
    const prev = lastCapital.get(m.symbol, date) as { face_value: number; shares: number } | undefined
    if (!prev || prev.face_value !== m.faceValue || prev.shares !== m.shares) {
      insCapital.run(m.symbol, date, m.faceValue, m.shares)
    }
  }
  markDone.run(date)
  db.exec('commit')

  // Securities absent today keep their last close, as NSE's previous-close field does
  for (const b of equities) previousCloses.set(b.symbol, b.close)
  bars += equities.length
  if ((i + 1) % 250 === 0) console.log(`  ${i + 1}/${days.length} days (${day}), ${bars} bars`)
}

const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n
console.log(`Done. raw_bars ${count('select count(*) n from raw_bars')}, ` +
  `symbols ${count('select count(distinct symbol) n from raw_bars')}, ` +
  `days ${count('select count(*) n from ingested_days')}, ` +
  `corporate actions ${count('select count(*) n from corporate_actions_raw')}`)
db.close()
