/**
 * The split run-up, tested on its own with a strict reading of "split".
 *
 *   npm run research:splits
 *
 * Rule: when NSE first lists the ex-date of a face value split, buy the next
 * session and sell at the close of the last session before the ex-date.
 * Only real splits count (face value goes down). Special dividends, which
 * NSE also shortens to "SPL", are left out.
 *
 * Share trades pay 0.45% for the round trip (0.85% past rank 500).
 * "Excess" is against the average top-500 stock over the same days.
 */
import { mkdirSync, writeFileSync } from 'fs'
import { DatabaseSync } from 'node:sqlite'
import { lastAtOrBefore } from '@/lib/research/dates'
import { loadMarketCached } from '@/lib/research/load'
import { meanAndT } from '@/lib/research/swing'
import { parseCorporateAction } from '@/lib/market-data/corporate-actions'

const START = 20110101
const PERIODS = [{ key: '2011-2019', from: 20110101, to: 20191231 }, { key: '2020-2022', from: 20200101, to: 20221231 }, { key: '2023-now', from: 20230101, to: 99999999 }]
const round2 = (x: number) => Math.round(x * 100) / 100
const pct = (x: number) => Math.round(x * 10000) / 100
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

const market = loadMarketCached()
const sessionIndex = new Map<number, number>()
market.sessions.forEach((d, i) => sessionIndex.set(d, i))
const rankOf = new Map<number, Map<string, number>>()
for (const d of market.universeDates) rankOf.set(d, new Map(market.universe.get(d)!.map((s, i) => [s, i + 1])))
const rank = (symbol: string, date: number): number => {
  const i = lastAtOrBefore(market.universeDates, date)
  return i < 0 ? Infinity : rankOf.get(market.universeDates[i])!.get(symbol) ?? Infinity
}
// The average top-500 stock each day: close to close, and average price to close
const dayRet = new Float64Array(market.sessions.length), dayN = new Float64Array(market.sessions.length), fillRet = new Float64Array(market.sessions.length)
for (const s of market.stocks.values()) for (let i = 1; i < s.dates.length; i++) {
  if (s.dates[i] < START - 10000 || rank(s.symbol, s.dates[i]) > 500) continue
  const k = sessionIndex.get(s.dates[i])!
  if (sessionIndex.get(s.dates[i - 1]) !== k - 1) continue
  dayRet[k] += s.close[i] / s.close[i - 1] - 1; fillRet[k] += s.close[i] / s.fill[i] - 1; dayN[k]++
}
for (let k = 0; k < dayRet.length; k++) if (dayN[k]) { dayRet[k] /= dayN[k]; fillRet[k] /= dayN[k] }

interface Trade { date: number; ret: number; excess: number; sessions: number }
function summarise(rows: Trade[]) {
  if (rows.length < 30) return { trades: rows.length }
  const byDay = new Map<number, number[]>()
  for (const r of rows) byDay.set(r.date, [...(byDay.get(r.date) ?? []), r.excess])
  const sorted = rows.map(r => r.ret).sort((a, b) => a - b)
  return {
    trades: rows.length, winRatePct: round2(rows.filter(r => r.ret > 0).length / rows.length * 100), avgReturnPct: pct(mean(rows.map(r => r.ret))),
    medianReturnPct: pct(sorted[sorted.length >> 1]), worstPct: pct(sorted[0]), avgExcessPct: pct(mean(rows.map(r => r.excess))),
    tStat: round2(meanAndT([...byDay.values()].map(mean)).t), avgSessions: round2(mean(rows.map(r => r.sessions))),
  }
}
const withPeriods = (rows: Trade[]) => ({ ...summarise(rows), periods: Object.fromEntries(PERIODS.map(p => [p.key, summarise(rows.filter(r => r.date >= p.from && r.date <= p.to))])) })

/** Buy on session index `e` (through the day, or at the close), sell at the close of index `x`. */
function trade(s: { dates: Int32Array; fill: Float64Array; close: Float64Array }, e: number, x: number, cost: number, atClose: boolean): Trade | null {
  const entry = atClose ? s.close[e] : s.fill[e]
  if (e < 1 || x >= s.dates.length || x < e || !(entry > 0)) return null
  const ke = sessionIndex.get(s.dates[e])!, kx = sessionIndex.get(s.dates[x])!
  if (kx - ke !== x - e) return null   // the stock missed sessions in between
  let v = atClose ? 1 : 1 + fillRet[ke]
  for (let k = ke + 1; k <= kx; k++) v *= 1 + dayRet[k]
  const ret = s.close[x] / entry - 1 - cost
  return { date: s.dates[e], ret, excess: ret - (v - 1 - 0.0045), sessions: x - e + 1 }
}

// One listing per company and ex-date, at the day it was first seen
const store = new DatabaseSync('data/market.db', { readOnly: true })
const listings = new Map<string, { symbol: string; exDate: number; firstSeen: number }>()
let special = 0
for (const a of store.prepare('select symbol, ex_date, purpose, first_seen from corporate_actions_raw where ex_date >= ?').all(START) as Array<{ symbol: string; ex_date: number; purpose: string; first_seen: number }>) {
  const split = parseCorporateAction(a.purpose).split
  if (!split || split.to >= split.from) { if (/SPL/.test(a.purpose.toUpperCase())) special++; continue }
  const key = `${a.symbol}|${a.ex_date}`, old = listings.get(key)
  if (!old || a.first_seen < old.firstSeen) listings.set(key, { symbol: a.symbol, exDate: a.ex_date, firstSeen: a.first_seen })
}

const out: Record<string, unknown> = { note: 'Real face value splits only. Buy the session after the ex-date is first listed, sell at the close before the ex-date. After costs. Excess is against the average top-500 stock.', listings: listings.size, leftOutAsNotASplit: special }
const VARIANTS = [
  { key: 'top 500, bought through the day', from: 1, to: 500, atClose: false, minGap: 3, cost: 0.0045 },
  { key: 'top 500, bought near the close', from: 1, to: 500, atClose: true, minGap: 3, cost: 0.0045 },
  { key: 'rank 501 to 750, bought near the close', from: 501, to: 750, atClose: true, minGap: 3, cost: 0.0085 },
  { key: 'top 750, bought near the close', from: 1, to: 750, atClose: true, minGap: 3, cost: 0.0045 },
  { key: 'top 500, near the close, any gap of 2 sessions or more', from: 1, to: 500, atClose: true, minGap: 2, cost: 0.0045 },
  { key: 'top 500, near the close, gap of 6 sessions or more', from: 1, to: 500, atClose: true, minGap: 6, cost: 0.0045 },
]
console.log(`${listings.size} split listings since 2011 (${special} "SPL" rows left out as not a split)\n`)
console.log(`${''.padEnd(54)}${'trades'.padStart(6)}${'win%'.padStart(7)}${'avg%'.padStart(8)}${'median%'.padStart(9)}${'worst%'.padStart(8)}${'excess%'.padStart(9)}${'t'.padStart(7)}${'days'.padStart(6)}   excess by period (trades)`)
for (const v of VARIANTS) {
  const rows: Trade[] = []
  for (const a of listings.values()) {
    const s = market.stocks.get(a.symbol)
    if (!s) continue
    const x = lastAtOrBefore(s.dates, a.exDate - 1), seenAt = lastAtOrBefore(s.dates, a.firstSeen)
    if (x < 30 || seenAt < 0 || x - seenAt < v.minGap) continue
    const r = rank(a.symbol, s.dates[seenAt])
    if (r < v.from || r > v.to) continue
    const t = trade(s, seenAt + 1, x, r > 500 ? 0.0085 : v.cost, v.atClose)
    if (t) rows.push(t)
  }
  const r: any = withPeriods(rows)
  out[v.key] = r
  console.log(`${v.key.padEnd(54)}${String(r.trades).padStart(6)}${String(r.winRatePct ?? '').padStart(7)}${String(r.avgReturnPct ?? '').padStart(8)}${String(r.medianReturnPct ?? '').padStart(9)}${String(r.worstPct ?? '').padStart(8)}${String(r.avgExcessPct ?? '').padStart(9)}${String(r.tStat ?? '').padStart(7)}${String(r.avgSessions ?? '').padStart(6)}   ${PERIODS.map(p => { const x = r.periods[p.key]; return x.avgExcessPct == null ? `n/a (${x.trades})` : `${x.avgExcessPct >= 0 ? '+' : ''}${x.avgExcessPct} (${x.trades})` }).join(' | ')}`)
}
mkdirSync('research/results', { recursive: true })
writeFileSync('research/results/splits.json', JSON.stringify(out, null, 2))
console.log('\nSaved research/results/splits.json')
