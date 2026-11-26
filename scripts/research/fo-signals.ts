/**
 * Test F&O signals on cash stocks and on NIFTY, and write the results.
 *
 *   npm run research:fo
 *
 * Stocks: each rule in lib/research/fo-signals.ts is checked at every close
 * for every stock that has futures that day. The trade buys at the next
 * open. Returns are measured to that day's close (a day trade), and to the
 * close three and five sessions on. Each is compared with the average of
 * all F&O stocks over the same sessions, so a rule gets no credit for a
 * rising market. Figures are before costs.
 *
 * NIFTY: positions of FIIs, clients and proprietary desks, and the index
 * put-call ratio, each ranked against its own last 250 sessions.
 */
import { mkdirSync, writeFileSync } from 'fs'
import { loadSymbolMap } from '@/lib/market-data/series'
import { openStore } from '@/lib/market-data/store'
import { daysBetween } from '@/lib/research/dates'
import { openFoStore } from '@/lib/research/fo-store'
import { crossRanks, FO_SIGNALS, trailingMean, trailingPercentile, trailingZ, type FoFacts } from '@/lib/research/fo-signals'
import { loadMarketCached } from '@/lib/research/load'
import { meanAndT } from '@/lib/research/swing'

const START = 20110701
const HORIZONS = ['gap', 'day', 'hold3', 'hold5'] as const
type Horizon = typeof HORIZONS[number]
const PERIODS = [
  { key: '2011-2019', from: 20110101, to: 20191231 },
  { key: '2020-2022', from: 20200101, to: 20221231 },
  { key: '2023-now', from: 20230101, to: 99999999 },
]
const pct = (x: number) => Math.round(x * 10000) / 100
const round2 = (x: number) => Math.round(x * 100) / 100
const clip = (x: number) => Math.max(-0.25, Math.min(0.25, x))

const market = loadMarketCached()
const sessionIndex = new Map<number, number>()
market.sessions.forEach((d, i) => sessionIndex.set(d, i))

// ---- Load the F&O history, keyed by the stock's current symbol ----
const store = openStore()
const symbolMap = loadSymbolMap(store)
const fo = openFoStore()

interface Day { oi: number; chgOi: number; contracts: number; nearExpiry: number; nearClose: number; cash?: number; opt?: any }
const byStock = new Map<string, Map<number, Day>>()
const dayOf = (symbol: string, date: number): Day | undefined => byStock.get(symbolMap.canonical(symbol, date))?.get(date)

for (const r of fo.prepare('select symbol, date, expiry, close, contracts, oi, chg_oi from fo_futures where is_index = 0 order by symbol, date, expiry').iterate() as Iterable<any>) {
  const canonical = symbolMap.canonical(r.symbol, r.date)
  let days = byStock.get(canonical)
  if (!days) byStock.set(canonical, (days = new Map()))
  const day = days.get(r.date)
  // Rows come nearest expiry first
  if (!day) days.set(r.date, { oi: r.oi, chgOi: r.chg_oi, contracts: r.contracts, nearExpiry: r.expiry, nearClose: r.close })
  else { day.oi += r.oi; day.chgOi += r.chg_oi; day.contracts += r.contracts }
}
for (const r of fo.prepare('select * from fo_options where is_index = 0').iterate() as Iterable<any>) {
  const day = dayOf(r.symbol, r.date)
  if (day) day.opt = r
}
const foSymbols = (fo.prepare('select distinct symbol from fo_futures where is_index = 0').all() as Array<{ symbol: string }>).map(r => r.symbol)
const cashQuery = store.prepare('select date, close from raw_bars where symbol = ? and date >= 20110101')
for (const symbol of foSymbols) {
  for (const r of cashQuery.iterate(symbol) as Iterable<{ date: number; close: number }>) {
    const day = dayOf(symbol, r.date)
    if (day) day.cash = r.close
  }
}
const ban = new Set((fo.prepare('select date, symbol from fo_ban').all() as Array<{ date: number; symbol: string }>).map(r => `${r.date}:${symbolMap.canonical(r.symbol, r.date)}`))

// ---- Pass 1: facts for every stock and day ----
interface Prepared { symbol: string; index: number[]; facts: FoFacts[] }
const prepared: Prepared[] = []
const basisByDate = new Map<number, Array<{ p: Prepared; k: number }>>()
let missing = 0
for (const [symbol, days] of byStock) {
  const s = market.stocks.get(symbol)
  if (!s) { missing++; continue }
  const n = s.dates.length
  const col = () => new Float64Array(n).fill(NaN)
  const contracts = col(), pcr = col(), calls = col(), puts = col(), implied = col()
  const dayAt: Array<Day | undefined> = new Array(n)
  for (let i = 0; i < n; i++) {
    const d = (dayAt[i] = days.get(s.dates[i]))
    if (!d) continue
    contracts[i] = d.contracts
    const o = d.opt
    if (!o) continue
    if (o.call_oi > 0) pcr[i] = o.put_oi / o.call_oi
    calls[i] = o.call_contracts
    puts[i] = o.put_contracts
    const optionDays = daysBetween(s.dates[i], o.near_expiry)
    if (o.atm_strike > 0 && optionDays >= 2) implied[i] = (o.atm_call + o.atm_put) / o.atm_strike / Math.sqrt(optionDays)
  }
  const p: Prepared = { symbol, index: [], facts: [] }
  for (let i = 1; i < n - 5; i++) {
    const d = dayAt[i], date = s.dates[i]
    if (!d || date < START) continue
    // The stock must trade on the very next session, and the next session is the one the ban list names
    const next = s.dates[i + 1]
    if (sessionIndex.get(next) !== sessionIndex.get(date)! + 1) continue
    const before = d.oi - d.chgOi
    const oiChg = before > 0 ? d.chgOi / before : NaN
    const usual = trailingMean(contracts, i, 20), usualCalls = trailingMean(calls, i, 20), usualPuts = trailingMean(puts, i, 20)
    const impliedUsual = trailingMean(implied, i, 10)
    const facts: FoFacts = {
      ret: s.close[i] / s.close[i - 1] - 1,
      oiChg: Math.abs(oiChg) <= 1 ? oiChg : NaN,
      basis: d.cash && d.nearClose > 0 ? d.nearClose / d.cash - 1 : NaN,
      basisRank: NaN,
      daysToExpiry: daysBetween(date, d.nearExpiry),
      futVolume: usual > 0 ? contracts[i] / usual : NaN,
      pcr: pcr[i], pcrZ: trailingZ(pcr, i, 60),
      callVolume: usualCalls > 0 ? calls[i] / usualCalls : NaN,
      putVolume: usualPuts > 0 ? puts[i] / usualPuts : NaN,
      impliedMove: implied[i], impliedMoveChg: impliedUsual > 0 ? implied[i] / impliedUsual : NaN,
      maxPainGap: d.cash && d.opt?.max_pain > 0 ? d.cash / d.opt.max_pain - 1 : NaN,
      banToday: ban.has(`${date}:${symbol}`), banNext: ban.has(`${next}:${symbol}`),
    }
    // A basis beyond 10% is a corporate action between the two prices, not a premium
    if (Math.abs(facts.basis) > 0.1) facts.basis = NaN
    const k = p.facts.push(facts) - 1
    p.index.push(i)
    const list = basisByDate.get(date)
    if (list) list.push({ p, k }); else basisByDate.set(date, [{ p, k }])
  }
  prepared.push(p)
}
for (const list of basisByDate.values()) {
  const ranks = crossRanks(list.map(x => x.p.facts[x.k].basis))
  list.forEach((x, j) => { x.p.facts[x.k].basisRank = ranks[j] })
}

// ---- Pass 2: what happened next, for every stock-day (the baseline) and for each rule ----
interface Row { date: number; out: Record<Horizon, number> }
const baseline = new Map<number, { sum: Record<Horizon, number>; count: number }>()
const trades: Row[][] = FO_SIGNALS.map(() => [])
for (const p of prepared) {
  const s = market.stocks.get(p.symbol)!
  p.index.forEach((i, k) => {
    const open = s.open[i + 1]
    if (!(open > 0)) return
    const out: Record<Horizon, number> = {
      gap: clip(open / s.close[i] - 1), day: clip(s.close[i + 1] / open - 1),
      hold3: clip(s.close[i + 3] / open - 1), hold5: clip(s.close[i + 5] / open - 1),
    }
    const date = s.dates[i]
    let day = baseline.get(date)
    if (!day) baseline.set(date, (day = { sum: { gap: 0, day: 0, hold3: 0, hold5: 0 }, count: 0 }))
    for (const h of HORIZONS) day.sum[h] += out[h]
    day.count++
    FO_SIGNALS.forEach((signal, g) => { if (signal.fires(p.facts[k])) trades[g].push({ date, out }) })
  })
}

function summarise(rows: Row[], h: Horizon) {
  if (!rows.length) return null
  // Trades from one evening move together, so the test is on each day's average
  const byDay = new Map<number, { sum: number; n: number }>()
  for (const r of rows) {
    const base = baseline.get(r.date)!
    const d = byDay.get(r.date) ?? { sum: 0, n: 0 }
    d.sum += r.out[h] - base.sum[h] / base.count
    d.n++
    byDay.set(r.date, d)
  }
  const edge = meanAndT([...byDay.values()].map(d => d.sum / d.n))
  return { rawPct: pct(rows.reduce((a, r) => a + r.out[h], 0) / rows.length), excessPct: pct(edge.mean), t: round2(edge.t) }
}

const sessions = market.sessions.filter(d => d >= START).length
const stockResults = FO_SIGNALS.map((signal, g) => {
  const rows = trades[g]
  return {
    key: signal.key, label: signal.label, basis: signal.basis, expect: signal.expect,
    trades: rows.length, days: new Set(rows.map(r => r.date)).size, tradesPerMonth: Math.round(rows.length / (sessions / 21) * 10) / 10,
    horizons: Object.fromEntries(HORIZONS.map(h => [h, summarise(rows, h)])),
    periods: Object.fromEntries(PERIODS.map(p => {
      const part = rows.filter(r => r.date >= p.from && r.date <= p.to)
      return [p.key, { trades: part.length, day: summarise(part, 'day'), hold5: summarise(part, 'hold5') }]
    })),
  }
})
const baselineDays = [...baseline.values()]
const baselineSummary = Object.fromEntries(HORIZONS.map(h => [h, pct(baselineDays.reduce((a, d) => a + d.sum[h] / d.count, 0) / baselineDays.length)]))

// ---- NIFTY: participant positions and the index put-call ratio ----
const niftyBars = new Map<number, { open: number; close: number }>()
for (const r of store.prepare(`select date, open, close from index_bars where lower(name) in ('nifty 50', 'cnx nifty', 's&p cnx nifty') and open > 0`).all() as any[]) niftyBars.set(r.date, r)
const niftyDates = [...niftyBars.keys()].sort((a, b) => a - b)
const share = (long: number, short: number) => (long + short > 0 ? long / (long + short) : NaN)
const participants = new Map<number, Record<string, any>>()
for (const r of fo.prepare('select * from fo_participants').all() as any[]) {
  if (!participants.has(r.date)) participants.set(r.date, {})
  participants.get(r.date)![r.client] = r
}
const niftyOptions = new Map((fo.prepare(`select date, put_oi, call_oi from fo_options where symbol = 'NIFTY'`).all() as any[]).map(r => [r.date, r]))

const INDEX_FEATURES: Array<{ key: string; label: string; value: (date: number) => number }> = [
  { key: 'fii-futures-long-share', label: 'FII share of index futures held long', value: d => { const p = participants.get(d)?.FII; return p ? share(p.fut_index_long, p.fut_index_short) : NaN } },
  { key: 'client-futures-long-share', label: 'Client share of index futures held long', value: d => { const p = participants.get(d)?.Client; return p ? share(p.fut_index_long, p.fut_index_short) : NaN } },
  { key: 'pro-futures-long-share', label: 'Proprietary desks\' share of index futures held long', value: d => { const p = participants.get(d)?.Pro; return p ? share(p.fut_index_long, p.fut_index_short) : NaN } },
  { key: 'fii-options-bullish-share', label: 'FII index options: bullish share (calls bought and puts sold)', value: d => { const p = participants.get(d)?.FII; return p ? share(p.opt_index_call_long + p.opt_index_put_short, p.opt_index_put_long + p.opt_index_call_short) : NaN } },
  { key: 'client-options-bullish-share', label: 'Client index options: bullish share', value: d => { const p = participants.get(d)?.Client; return p ? share(p.opt_index_call_long + p.opt_index_put_short, p.opt_index_put_long + p.opt_index_call_short) : NaN } },
  { key: 'nifty-pcr', label: 'NIFTY put-call ratio (open interest)', value: d => { const o = niftyOptions.get(d); return o && o.call_oi > 0 ? o.put_oi / o.call_oi : NaN } },
]
const INDEX_HORIZONS = { day: 1, hold5: 5 } as const

function indexStudy(values: Float64Array, label: string) {
  const buckets: Record<'high' | 'low' | 'all', Record<string, number[]>> = { high: { day: [], hold5: [] }, low: { day: [], hold5: [] }, all: { day: [], hold5: [] } }
  for (let i = 250; i < niftyDates.length - 5; i++) {
    if (niftyDates[i] < START) continue
    const rank = trailingPercentile(values, i, 250)
    if (!Number.isFinite(rank)) continue
    const open = niftyBars.get(niftyDates[i + 1])!.open
    for (const [h, n] of Object.entries(INDEX_HORIZONS)) {
      const r = niftyBars.get(niftyDates[i + n])!.close / open - 1
      buckets.all[h].push(r)
      if (rank >= 0.8) buckets.high[h].push(r)
      if (rank <= 0.2) buckets.low[h].push(r)
    }
  }
  const stat = (xs: number[]) => { const m = meanAndT(xs); return { days: xs.length, meanPct: pct(m.mean), t: round2(m.t) } }
  return { label, ...Object.fromEntries(Object.keys(INDEX_HORIZONS).map(h => [h, { high: stat(buckets.high[h]), low: stat(buckets.low[h]), all: stat(buckets.all[h]) }])) }
}
const indexResults: Record<string, any> = {}
for (const f of INDEX_FEATURES) {
  const level = Float64Array.from(niftyDates.map(f.value))
  const change = Float64Array.from(level.map((v, i) => (i >= 5 ? v - level[i - 5] : NaN)))
  indexResults[f.key] = indexStudy(level, f.label)
  indexResults[`${f.key}-change`] = indexStudy(change, `${f.label}: change over 5 sessions`)
}

mkdirSync('research/results', { recursive: true })
writeFileSync('research/results/fo-signals.json', JSON.stringify({
  generatedAt: new Date().toISOString(), from: START, to: market.sessions[market.sessions.length - 1],
  note: 'Gross returns, before costs. Excess is against the average of all F&O stocks over the same sessions, tested on daily averages.',
  stockDays: baselineDays.reduce((a, d) => a + d.count, 0), stocksNotInStore: missing, baselinePct: baselineSummary,
  stocks: stockResults, nifty: indexResults,
}, null, 1))

const cell = (x: { excessPct: number; t: number } | null | undefined) => (x ? `${x.excessPct >= 0 ? '+' : ''}${x.excessPct.toFixed(2)} (${x.t.toFixed(1)})`.padStart(14) : ''.padStart(14))
console.log(`${baselineDays.length} days, ${baselineDays.reduce((a, d) => a + d.count, 0)} stock-days, ${missing} F&O stocks not in the store`)
console.log(`All F&O stocks, average: gap ${baselineSummary.gap}%, day ${baselineSummary.day}%, 3 days ${baselineSummary.hold3}%, 5 days ${baselineSummary.hold5}%`)
console.log(`\n${'Rule'.padEnd(34)}${'trades'.padStart(8)}${'/month'.padStart(8)}  excess % (t):${'gap'.padStart(8)}${'day'.padStart(14)}${'3 days'.padStart(14)}${'5 days'.padStart(14)}   day by period`)
for (const r of stockResults) {
  const h = r.horizons as Record<Horizon, any>
  console.log(`${r.label.slice(0, 33).padEnd(34)}${String(r.trades).padStart(8)}${String(r.tradesPerMonth).padStart(8)}  ${''.padStart(8)}${cell(h.gap)}${cell(h.day)}${cell(h.hold3)}${cell(h.hold5)}   ${PERIODS.map(p => cell((r.periods as any)[p.key].day).trim()).join(' | ')}`)
}
console.log('\nNIFTY next session (open to close) and five sessions, mean % (t), when the measure is in the top or bottom fifth of its last 250 sessions')
for (const r of Object.values(indexResults)) {
  const c = (x: any) => `${x.meanPct >= 0 ? '+' : ''}${x.meanPct.toFixed(2)} (${x.t.toFixed(1)}, ${x.days}d)`
  console.log(`${r.label.slice(0, 62).padEnd(63)} day: high ${c(r.day.high)} low ${c(r.day.low)} | 5d: high ${c(r.hold5.high)} low ${c(r.hold5.low)} all ${c(r.hold5.all)}`)
}
