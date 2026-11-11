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
import { resolveEvents, resolveUnannounced } from '../../lib/market-data/adjust'
import { buildSegments, loadActions, loadRawSeries, loadSymbolMap } from '../../lib/market-data/series'
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
    symbol text primary key, segments text not null,
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
const insSecurity = db.prepare('insert into securities (symbol, segments, first_date, last_date, bars) values (?, ?, ?, ?, ?)')
const insFlag = db.prepare('insert into quality_flags (symbol, date, kind, detail) values (?, ?, ?, ?)')

const tally: Record<string, number> = {}
let gaps = 0
db.exec('begin')
for (const [symbol, segs] of segments) {
  const bars = loadRawSeries(db, segs)
  if (!bars.length) continue
  insSecurity.run(symbol, JSON.stringify(segs), bars[0].date, bars.at(-1)!.date, bars.length)

  const announced = resolveEvents(bars, loadActions(db, segs))
  const unannounced = resolveUnannounced(bars, announced,
    i => sessionIndex.get(bars[i].date)! - sessionIndex.get(bars[i - 1].date)! === 1)
  const events = [...announced, ...unannounced.inferred]
  for (const e of events) {
    tally[e.status] = (tally[e.status] ?? 0) + 1
    insEvent.run(symbol, e.exDate, e.status, e.priceFactor, e.shareFactor, e.dividend, JSON.stringify(e.purposes), e.note ?? null)
    if (e.status === 'rejected') insFlag.run(symbol, e.exDate, 'action-rejected', `${e.purposes.join(' | ')}: ${e.note}`)
  }
  for (const g of unannounced.flagged) {
    gaps++
    insFlag.run(symbol, g.date, 'gap-after-suspension', `open is ${g.gap.toFixed(3)}x the previous close; not adjusted`)
  }
}
db.exec('commit')

console.log(`${segments.size} companies. Events:`, tally, `Gaps after a suspension (left as is): ${gaps}`)
db.close()
