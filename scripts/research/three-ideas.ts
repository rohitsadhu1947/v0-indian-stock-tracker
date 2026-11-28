/**
 * Three more ideas, tested on data already in the local stores.
 *
 *   npm run research:three-ideas
 *
 * 1. New listings and lock-in dates: how a stock does in its first six
 *    months against the average stock, and whether buying after the dates
 *    early investors may first sell (about 30 and 90 days in) pays.
 * 2. Results falls, sold short: a stock with futures that drops 8% or more
 *    around results on three times its turnover. Short at the next close.
 * 3. Second results jump in a row: the results-buy rule, split by whether
 *    the stock also jumped on its results the quarter before.
 *
 * Share trades pay 0.45% a round trip (0.85% past rank 500); futures 0.15%.
 * "Excess" is against the average top-500 stock over the same days.
 */
import { mkdirSync, writeFileSync } from 'fs'
import { DatabaseSync } from 'node:sqlite'
import { lastAtOrBefore } from '@/lib/research/dates'
import { loadMarketCached } from '@/lib/research/load'
import { indicators, meanAndT } from '@/lib/research/swing'

const START = 20110131
const PERIODS = [{ key: '2011-2019', from: 20110101, to: 20191231 }, { key: '2020-2022', from: 20200101, to: 20221231 }, { key: '2023-now', from: 20230101, to: 99999999 }]
const round2 = (x: number) => Math.round(x * 100) / 100
const pct = (x: number) => Math.round(x * 10000) / 100
const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
const epochDay = (d: number) => Date.UTC(Math.floor(d / 10000), Math.floor(d / 100) % 100 - 1, d % 100) / 86400000

const market = loadMarketCached()
const sessionIndex = new Map<number, number>()
market.sessions.forEach((d, i) => sessionIndex.set(d, i))
const rankOf = new Map<number, Map<string, number>>()
for (const d of market.universeDates) rankOf.set(d, new Map(market.universe.get(d)!.map((s, i) => [s, i + 1])))
const rank = (symbol: string, date: number): number => {
  const i = lastAtOrBefore(market.universeDates, date)
  return i < 0 ? Infinity : rankOf.get(market.universeDates[i])!.get(symbol) ?? Infinity
}
const dayRet = new Float64Array(market.sessions.length), dayN = new Float64Array(market.sessions.length)
for (const s of market.stocks.values()) for (let i = 1; i < s.dates.length; i++) {
  if (s.dates[i] < 20100101 || rank(s.symbol, s.dates[i]) > 500) continue
  const k = sessionIndex.get(s.dates[i])!
  if (sessionIndex.get(s.dates[i - 1]) !== k - 1) continue
  dayRet[k] += s.close[i] / s.close[i - 1] - 1; dayN[k]++
}
for (let k = 0; k < dayRet.length; k++) if (dayN[k]) dayRet[k] /= dayN[k]

interface Trade { date: number; ret: number; excess: number }
/** Close of index `e` to close of index `x`. `side` -1 is a short. The average stock's cost is put back so excess is like for like. */
function trade(s: { dates: Int32Array; close: Float64Array }, e: number, x: number, cost: number, side: 1 | -1 = 1): Trade | null {
  if (e < 0 || x >= s.dates.length || x <= e || !(s.close[e] > 0)) return null
  const ke = sessionIndex.get(s.dates[e])!, kx = sessionIndex.get(s.dates[x])!
  if (kx - ke !== x - e) return null
  let v = 1
  for (let k = ke + 1; k <= kx; k++) v *= 1 + dayRet[k]
  const move = s.close[x] / s.close[e] - 1
  return { date: s.dates[e], ret: side * move - cost, excess: side * (move - (v - 1)) - cost }
}
function summarise(rows: Trade[]) {
  if (rows.length < 30) return { trades: rows.length }
  const byDay = new Map<number, number[]>()
  for (const r of rows) byDay.set(r.date, [...(byDay.get(r.date) ?? []), r.excess])
  const sorted = rows.map(r => r.ret).sort((a, b) => a - b)
  return {
    trades: rows.length, winRatePct: round2(rows.filter(r => r.ret > 0).length / rows.length * 100), avgReturnPct: pct(mean(rows.map(r => r.ret))), medianReturnPct: pct(sorted[sorted.length >> 1]),
    avgExcessPct: pct(mean(rows.map(r => r.excess))), tStat: round2(meanAndT([...byDay.values()].map(mean)).t),
  }
}
const withPeriods = (rows: Trade[]) => ({ ...summarise(rows), periods: Object.fromEntries(PERIODS.map(p => [p.key, summarise(rows.filter(r => r.date >= p.from && r.date <= p.to))])) })
const head = (title: string) => console.log(`\n${title}\n${''.padEnd(56)}${'trades'.padStart(6)}${'win%'.padStart(7)}${'avg%'.padStart(8)}${'median%'.padStart(9)}${'excess%'.padStart(9)}${'t'.padStart(7)}   excess by period (trades)`)
const show = (label: string, r: any) => console.log(`${label.padEnd(56)}${String(r.trades).padStart(6)}${String(r.winRatePct ?? '').padStart(7)}${String(r.avgReturnPct ?? '').padStart(8)}${String(r.medianReturnPct ?? '').padStart(9)}${String(r.avgExcessPct ?? '').padStart(9)}${String(r.tStat ?? '').padStart(7)}   ${PERIODS.map(p => { const x = r.periods[p.key]; return x.avgExcessPct == null ? `n/a (${x.trades})` : `${x.avgExcessPct >= 0 ? '+' : ''}${x.avgExcessPct} (${x.trades})` }).join(' | ')}`)
const out: Record<string, unknown> = {}

// ---- 1. New listings ----
// A stock whose first session is after the store begins, with real trading on day one
const listings = [...market.stocks.values()].filter(s => s.dates[0] >= 20110401 && s.dates.length > 30 && s.turnover[0] >= 20e7)
const afterDay = (s: { dates: Int32Array }, days: number): number => { const target = epochDay(s.dates[0]) + days; for (let i = 0; i < s.dates.length; i++) if (epochDay(s.dates[i]) >= target) return i; return -1 }
const ipo: Record<string, Trade[]> = {}
const add = (key: string, t: Trade | null) => { if (t) (ipo[key] ??= []).push(t) }
for (const s of listings) {
  add('listing day close, held 20 sessions', trade(s, 0, 20, 0.0045))
  add('listing day close, held 60 sessions', trade(s, 0, 60, 0.0045))
  add('listing day close, held 120 sessions', trade(s, 0, 120, 0.0045))
  for (const [label, days] of [['30-day', 30], ['90-day', 90], ['6-month', 182]] as Array<[string, number]>) {
    const i = afterDay(s, days)
    if (i < 6) continue
    add(`${label} date: the 5 sessions before it`, trade(s, i - 6, i - 1, 0.0045))
    add(`${label} date: the day itself and 2 after`, trade(s, i - 1, i + 2, 0.0045))
    add(`${label} date: bought 3 sessions after, held 20`, trade(s, i + 3, i + 23, 0.0045))
    add(`${label} date: bought 3 sessions after, held 60`, trade(s, i + 3, i + 63, 0.0045))
  }
  // Fell on listing against rose on listing, bought at the first close (no issue prices here, so the day's own move is used)
  const firstDay = s.close[0] / s.open[0] - 1
  add(firstDay >= 0 ? 'rose on listing day: held 60 sessions' : 'fell on listing day: held 60 sessions', trade(s, 0, 60, 0.0045))
}
const ipoOut = Object.fromEntries(Object.entries(ipo).map(([k, rows]) => [k, withPeriods(rows)]))
head(`1. New listings (${listings.length} stocks first traded after April 2011 with Rs 20 crore or more on day one)`)
for (const [k, r] of Object.entries(ipoOut)) show(k, r)
out.newListings = { note: 'Listing is the first session in the price history, so a few demerged companies are included. Dates are calendar days from listing. After costs of 0.45%.', listings: listings.length, ...ipoOut }

// 1b. The bounce after the 30-day date: does it hold when the buy day and the hold change, and for stocks that trade enough?
const bounce: Record<string, Trade[]> = {}
const curve = new Map<number, number[]>()   // session relative to the 30-day date -> that day's excess returns
for (const s of listings) {
  const i = afterDay(s, 30)
  if (i < 6) continue
  for (const wait of [0, 1, 3, 5]) for (const hold of [10, 20, 40]) { const t = trade(s, i + wait, i + wait + hold, 0.0045); if (t) (bounce[`bought ${wait} sessions after, held ${hold}`] ??= []).push(t) }
  // Rs 10 crore a day or more in the 10 sessions before the buy
  const recent = Array.from(s.turnover.slice(Math.max(0, i - 7), i + 3)).sort((a, b) => a - b)
  const liquid = recent[recent.length >> 1] >= 10e7
  const t = trade(s, i + 3, i + 23, 0.0045)
  if (t) (bounce[liquid ? 'bought 3 after, held 20: trades Rs 10 crore a day or more' : 'bought 3 after, held 20: trades less than Rs 10 crore a day'] ??= []).push(t)
  const fell = s.close[i - 1] / s.close[Math.max(0, i - 6)] - 1
  if (t) (bounce[fell <= -0.03 ? 'bought 3 after, held 20: fell 3% or more in the 5 sessions before' : 'bought 3 after, held 20: did not fall 3% before'] ??= []).push(t)
  for (let k = -15; k <= 40; k++) {
    const j = i + k
    if (j < 1 || j >= s.dates.length) continue
    const m = sessionIndex.get(s.dates[j])!
    if (sessionIndex.get(s.dates[j - 1]) !== m - 1) continue
    curve.set(k, [...(curve.get(k) ?? []), s.close[j] / s.close[j - 1] - 1 - dayRet[m]])
  }
}
const bounceOut = Object.fromEntries(Object.entries(bounce).map(([k, rows]) => [k, withPeriods(rows)]))
head('1b. After the 30-day date')
for (const [k, r] of Object.entries(bounceOut)) show(k, r)
let running = 0
const path = [...curve.keys()].sort((a, b) => a - b).map(k => { running += mean(curve.get(k)!); return { session: k, cumulativeExcessPct: pct(running) } })
console.log('Running total against the average stock, by session from the 30-day date:', path.filter(p => p.session % 5 === 0).map(p => `${p.session}: ${p.cumulativeExcessPct}%`).join(', '))
out.afterThirtyDayDate = { note: 'Session 0 is the first session 30 calendar days or more after listing.', ...bounceOut, path }

// ---- Results signals: jumps and falls ----
const fo = new DatabaseSync('data/fo.db', { readOnly: true })
const futuresOn = new Set((fo.prepare('select distinct symbol, date from fo_futures where is_index = 0 and date >= ?').all(START) as Array<{ symbol: string; date: number }>).map(r => `${r.symbol}|${r.date}`))
const prepared = [...market.stocks.values()].map(s => ({ s, ind: indicators(s) }))
const momentumBy = new Map<number, number[]>()
for (const { s, ind } of prepared) for (let i = 253; i < s.dates.length; i++) if (s.dates[i] >= START && !Number.isNaN(ind.momentum[i]) && rank(s.symbol, s.dates[i]) <= 750) momentumBy.set(s.dates[i], [...(momentumBy.get(s.dates[i]) ?? []), ind.momentum[i]])

const shorts: Record<string, Trade[]> = {}
const pushShort = (key: string, t: Trade | null) => { if (t) (shorts[key] ??= []).push(t) }
const jumps: Record<string, Trade[]> = { 'all results buys': [], 'also jumped the quarter before': [], 'did not jump the quarter before': [], 'also jumped: top fifth on strength': [], 'did not: top fifth on strength': [] }
for (const { s, ind } of prepared) {
  let pointer = 0, busy = -1, busyShort = -1
  const jumpAt: number[] = []
  for (let i = 253; i + 61 < s.dates.length; i++) {
    if (s.dates[i] < START) continue
    while (pointer < s.resultsDates.length && s.resultsDates[pointer] < s.dates[i - 1]) pointer++
    if (!(pointer < s.resultsDates.length && s.resultsDates[pointer] <= s.dates[i])) continue
    const move = s.close[i] / s.close[i - 2] - 1, busyTurnover = s.turnover[i] / ind.avgTurnover20[i] >= 3
    const r = rank(s.symbol, s.dates[i])
    // 2. A fall on results, in a stock with futures
    if (move <= -0.08 && busyTurnover && i + 1 > busyShort && futuresOn.has(`${s.symbol}|${s.dates[i]}`)) {
      busyShort = i + 20
      for (const hold of [1, 5, 10, 20, 60]) pushShort(`fell 8% or more: short, covered after ${hold} session${hold === 1 ? '' : 's'}`, trade(s, i + 1, i + 1 + hold, 0.0015, -1))
      if (move <= -0.12) pushShort('fell 12% or more: short, covered after 20 sessions', trade(s, i + 1, i + 21, 0.0015, -1))
      pushShort('fell 8% or more: short from the signal close, covered next close', trade(s, i, i + 1, 0.0015, -1))
    }
    // 3. A jump on results: the live rule
    if (!(move >= 0.08) || !busyTurnover) continue
    const earlier = jumpAt.some(j => i - j >= 40 && i - j <= 90)   // a jump on the results before these
    jumpAt.push(i)
    const sorted = momentumBy.get(s.dates[i])
    if (i + 1 <= busy || r > 750 || !sorted || Number.isNaN(ind.momentum[i])) continue
    const strength = sorted.filter(x => x < ind.momentum[i]).length / Math.max(1, sorted.length - 1)
    if (strength < 0.2) continue
    const t = trade(s, i + 1, i + 60, r > 500 ? 0.0085 : 0.0045)
    if (!t) continue
    busy = i + 60
    jumps['all results buys'].push(t)
    jumps[earlier ? 'also jumped the quarter before' : 'did not jump the quarter before'].push(t)
    if (strength >= 0.8) jumps[earlier ? 'also jumped: top fifth on strength' : 'did not: top fifth on strength'].push(t)
  }
}
const shortOut = Object.fromEntries(Object.entries(shorts).map(([k, rows]) => [k, withPeriods(rows)]))
head('2. Results falls in stocks with futures, sold short at the next close (avg% is the short\'s own gain, excess% is after hedging the market)')
for (const [k, r] of Object.entries(shortOut)) show(k, r)
out.resultsFallShort = { note: 'A fall of 8% or more over the two sessions around results on three times the turnover. Share prices stand in for futures. Costs 0.15% a round trip. Average is the plain short; excess is the short against the average stock.', ...shortOut }

const jumpOut = Object.fromEntries(Object.entries(jumps).map(([k, rows]) => [k, withPeriods(rows)]))
head('3. Results buys (the live rule), by whether the stock also jumped on the results before')
for (const [k, r] of Object.entries(jumpOut)) show(k, r)
out.secondJump = { note: 'The quarter before means a results jump 40 to 90 sessions earlier, whether or not it was bought.', ...jumpOut }

mkdirSync('research/results', { recursive: true })
writeFileSync('research/results/three-ideas.json', JSON.stringify(out, null, 2))
console.log('\nSaved research/results/three-ideas.json')
