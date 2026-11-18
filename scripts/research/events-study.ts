/**
 * Pilot: what prices did after order-win announcements.
 *
 *   npx tsx scripts/research/events-study.ts
 *
 * Reads data/events/orders.json and the minute bars in data/events/minute
 * (see events-fetch.ts and events-prices.ts). Writes
 * research/results/events-orders.json and prints a summary.
 *
 * The trade is: buy two minutes after the announcement (or at the next open
 * when the market is shut) and sell a fixed time later. Each return is also
 * shown against NIFTY 50 over the same minutes.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { eventOutcome, HORIZONS, istDay, windowReturn, type Candle } from '@/lib/research/event-study'
import { meanAndT } from '@/lib/research/swing'
import { openStore } from '@/lib/market-data/store'

/** Intraday round trip on Rs 50,000: brokerage, taxes and charges about 0.11%, plus 0.1% slippage each way. */
const INTRADAY_COST = 0.31
/** Delivery round trip, as in the swing tests. */
const DELIVERY_COST = 0.45

const DIR = 'data/events/minute'
const load = (name: string): Candle[] | null => {
  const file = `${DIR}/${name.replace(/[^A-Za-z0-9_-]/g, '-')}.json`
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
}

interface Row { symbol: string; at: string; day: string; sameSession: boolean; values: Record<string, number | null>; excess: Record<string, number | null> }

const events = Object.values(JSON.parse(readFileSync('data/events/orders.json', 'utf8')).batches).flat() as Array<{ symbol: string; date: string; summary: string }>
const seen = new Set<string>()
const rows: Row[] = []
let noPrices = 0, noEntry = 0

for (const e of events) {
  const at = new Date(e.date).getTime()
  // One trade per stock per session: a second announcement the same day is the same news
  const key = `${e.symbol}_${istDay(at)}`
  if (seen.has(key)) continue
  seen.add(key)
  const candles = load(key), index = load(`NIFTY50_${istDay(at)}`)
  if (!candles?.length || !index?.length) { noPrices++; continue }
  const out = eventOutcome(candles, at)
  if (!out) { noEntry++; continue }

  const values: Row['values'] = { runUp: out.runUpPct, toClose: out.toClosePct, toNextClose: out.toNextClosePct, targetStop: out.targetStopPct }
  const excess: Row['excess'] = {
    toClose: sub(out.toClosePct, windowReturn(index, out.entryTime, out.exits.close)),
    toNextClose: sub(out.toNextClosePct, windowReturn(index, out.entryTime, out.exits.nextClose)),
  }
  for (const h of HORIZONS) {
    values[`m${h}`] = out.after[h]
    excess[`m${h}`] = sub(out.after[h], windowReturn(index, out.entryTime, out.exits.after[h]))
  }
  rows.push({ symbol: e.symbol, at: e.date, day: istDay(out.entryTime), sameSession: out.sameSession, values, excess })
}

function sub(a: number | null, b: number | null): number | null { return a == null || b == null ? null : a - b }

const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d
const MEASURES: Array<{ key: string; label: string; cost: number | null }> = [
  { key: 'runUp', label: 'Move before you could buy', cost: null },
  ...HORIZONS.map(h => ({ key: `m${h}`, label: `Sell ${h} minutes later`, cost: INTRADAY_COST })),
  { key: 'toClose', label: 'Sell at that day\'s close', cost: INTRADAY_COST },
  { key: 'targetStop', label: 'Sell at +2% or -2%, else the close', cost: INTRADAY_COST },
  { key: 'toNextClose', label: 'Sell at the next day\'s close', cost: DELIVERY_COST },
]

function summarise(group: Row[]) {
  return Object.fromEntries(MEASURES.map(m => {
    const xs = group.map(r => r.values[m.key]).filter((v): v is number => v != null)
    if (!xs.length) return [m.key, null]
    const sorted = xs.slice().sort((a, b) => a - b)
    // Announcements on one day share the market's mood, so the test is on daily averages of the excess
    const byDay = new Map<string, number[]>()
    for (const r of group) {
      const x = r.excess[m.key]
      if (x != null) byDay.set(r.day, [...(byDay.get(r.day) ?? []), x])
    }
    const edge = meanAndT([...byDay.values()].map(v => v.reduce((a, b) => a + b, 0) / v.length))
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length
    return [m.key, {
      label: m.label, trades: xs.length,
      avgPct: round(mean), medianPct: round(sorted[sorted.length >> 1]),
      winPct: round(xs.filter(x => x > (m.cost ?? 0)).length / xs.length * 100, 0),
      afterCostsPct: m.cost == null ? null : round(mean - m.cost),
      vsNiftyPct: byDay.size ? round(edge.mean) : null, tStat: byDay.size ? round(edge.t) : null,
    }]
  }))
}

// Trading rank this month, to see whether smaller companies react differently
const store = openStore()
const rank = new Map((store.prepare('select symbol, rank from universe_monthly where date = (select max(date) from universe_monthly)').all() as Array<{ symbol: string; rank: number }>).map(r => [r.symbol, r.rank]))
store.close()
const small = (r: Row) => (rank.get(r.symbol) ?? 999) > 200

const groups = {
  'during market hours': rows.filter(r => r.sameSession),
  'outside market hours': rows.filter(r => !r.sameSession),
  'during market hours, 200 most traded': rows.filter(r => r.sameSession && !small(r)),
  'during market hours, ranks 201 to 500': rows.filter(r => r.sameSession && small(r)),
}
const result = {
  note: 'Pilot on order-win announcements for the 500 most traded stocks. Buy two minutes after the announcement, or at the next open when the market is shut. Returns in percent. "After costs" subtracts 0.31% for an intraday round trip and 0.45% for delivery. "Win" means beating the cost.',
  source: 'Announcement times from the Drishti API; minute prices from Zerodha.',
  period: { from: rows.map(r => r.day).sort()[0], to: rows.map(r => r.day).sort().at(-1) },
  announcements: events.length, tradesMeasured: rows.length, withoutPrices: noPrices, withoutAnEntry: noEntry,
  groups: Object.fromEntries(Object.entries(groups).map(([name, group]) => [name, { trades: group.length, days: new Set(group.map(r => r.day)).size, measures: summarise(group) }])),
}
writeFileSync('research/results/events-orders.json', JSON.stringify(result, null, 1))

console.log(`${events.length} announcements, ${rows.length} trades measured (${noPrices} without prices, ${noEntry} without a bar to buy on), ${result.period.from} to ${result.period.to}`)
const pad = (v: unknown, n: number) => String(v ?? '').padStart(n)
for (const [name, g] of Object.entries(result.groups)) {
  console.log(`\n${name}: ${g.trades} trades on ${g.days} days`)
  console.log(`${''.padEnd(36)}${pad('n', 5)}${pad('avg%', 8)}${pad('median%', 9)}${pad('win%', 6)}${pad('net%', 8)}${pad('vsNifty%', 10)}${pad('t', 7)}`)
  for (const m of MEASURES) {
    const s = (g.measures as any)[m.key]
    if (s) console.log(`${m.label.padEnd(36)}${pad(s.trades, 5)}${pad(s.avgPct, 8)}${pad(s.medianPct, 9)}${pad(s.winPct, 6)}${pad(s.afterCostsPct ?? '', 8)}${pad(s.vsNiftyPct ?? '', 10)}${pad(s.tStat ?? '', 7)}`)
  }
}
