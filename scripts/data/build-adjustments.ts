/**
 * Resolve corporate actions against prices for every company in the local
 * store and record the result:
 *
 *   adjustment_events  what is applied (and what was rejected, with why)
 *   securities         one row per company: symbols used, first and last bar
 *   quality_flags      rejected actions and price gaps after a suspension, to review
 *
 *   npx tsx scripts/data/build-adjustments.ts
 *
 * Rebuilds all three tables from scratch each run (about a minute).
 */
import { existsSync, readFileSync } from 'fs'
import { applyAdjustments, factorFromGap, resolveEvents, resolveUnannounced } from '../../lib/market-data/adjust'
import { buildSegments, loadActions, loadRawSeries, loadSymbolMap } from '../../lib/market-data/series'
import { parseEtfList, securityKind } from '../../lib/market-data/classify'
import { openStore } from '../../lib/market-data/store'

const db = openStore()
db.exec(`
  pragma synchronous = off;
  drop table if exists adjustment_events;
  drop table if exists securities;
  drop table if exists quality_flags;
  create table adjustment_events (
    symbol text not null, ex_date integer not null, status text not null,
    price_factor real not null, share_factor real not null, dividend real not null,
    purposes text not null, note text
  );
  create index adjustment_events_symbol on adjustment_events (symbol, ex_date);
  create table securities (
    symbol text primary key, kind text not null, name text, segments text not null,
    first_date integer not null, last_date integer not null, bars integer not null
  ) without rowid;
  create table quality_flags (
    symbol text not null, date integer not null, kind text not null, detail text not null
  );
`)

const segments = buildSegments(db, loadSymbolMap(db))
const sessions = (db.prepare('select distinct date from raw_bars order by date').all() as Array<{ date: number }>).map(r => r.date)
const sessionIndex = new Map(sessions.map((d, i) => [d, i]))
const insEvent = db.prepare(`insert into adjustment_events
  (symbol, ex_date, status, price_factor, share_factor, dividend, purposes, note) values (?, ?, ?, ?, ?, ?, ?, ?)`)
const insSecurity = db.prepare('insert into securities (symbol, kind, name, segments, first_date, last_date, bars) values (?, ?, ?, ?, ?, ?, ?)')
const names = new Map((db.prepare('select symbol, name from security_names').all() as Array<{ symbol: string; name: string }>).map(r => [r.symbol, r.name]))
const ETF_LIST = 'data/nse/eq_etfseclist.csv'
const listedFunds = existsSync(ETF_LIST) ? parseEtfList(readFileSync(ETF_LIST, 'latin1')) : new Set<string>()
const kinds: Record<string, number> = {}
const insFlag = db.prepare('insert into quality_flags (symbol, date, kind, detail) values (?, ?, ?, ?)')

const tally: Record<string, number> = {}
let gaps = 0, broken = 0
db.exec('begin')
for (const [symbol, segs] of segments) {
  const bars = loadRawSeries(db, segs)
  if (!bars.length) continue
  // Classified by the name in use most recently (a fund is a fund under every symbol it had)
  const name = names.get(segs.at(-1)!.symbol)
  const kind = segs.some(seg => securityKind(seg.symbol, names.get(seg.symbol), listedFunds) === 'fund')
    ? 'fund' : securityKind(symbol, name, listedFunds)
  kinds[kind] = (kinds[kind] ?? 0) + 1
  insSecurity.run(symbol, kind, name ?? null, JSON.stringify(segs), bars[0].date, bars.at(-1)!.date, bars.length)

  const announced = resolveEvents(bars, loadActions(db, segs))
  const unannounced = resolveUnannounced(bars, announced,
    i => sessionIndex.get(bars[i].date)! - sessionIndex.get(bars[i - 1].date)! === 1)
  const events = [...announced, ...unannounced.inferred]
  for (const e of events) {
    tally[e.status] = (tally[e.status] ?? 0) + 1
    insEvent.run(symbol, e.exDate, e.status, e.priceFactor, e.shareFactor, e.dividend, JSON.stringify(e.purposes), e.note ?? null)
    if (e.status === 'rejected') insFlag.run(symbol, e.exDate, 'action-rejected', `${e.purposes.join(' | ')}: ${e.note}`)
  }
  // After adjustment no stock that traded the previous session should gap beyond
  // the price bands. One that does means an action was applied wrongly.
  const adjusted = applyAdjustments(bars, events)
  for (let i = 1; i < adjusted.length; i++) {
    if (bars[i - 1].close < 5 || sessionIndex.get(bars[i].date)! - sessionIndex.get(bars[i - 1].date)! !== 1) continue
    const gap = adjusted[i].open / adjusted[i - 1].close
    if (factorFromGap(gap)) {
      broken++
      insFlag.run(symbol, bars[i].date, 'adjusted-gap', `adjusted open is ${gap.toFixed(3)}x the previous adjusted close`)
    }
  }
  for (const g of unannounced.flagged) {
    gaps++
    insFlag.run(symbol, g.date, 'gap-after-suspension', `open is ${g.gap.toFixed(3)}x the previous close; not adjusted`)
  }
}
db.exec('commit')

console.log('Securities:', kinds)
console.log(`${segments.size} securities. Events:`, tally, `Gaps after a suspension (left as is): ${gaps}`)
if (broken) {
  console.error(`${broken} adjusted series still gap beyond the price bands (see quality_flags, kind 'adjusted-gap')`)
  process.exitCode = 1
}
db.close()
