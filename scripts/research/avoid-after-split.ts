/**
 * Should the rules stay away from a stock around a share split or bonus?
 *
 *   npm run research:avoid-after-split
 *
 * Stocks lag the average stock by about 5% in the 20 sessions from the
 * ex-date of a split or bonus (research/results/splits.json). This asks
 * whether using that helps:
 *
 * 1. Monthly Plan: do not buy a stock with a split or bonus due in the next
 *    30 days or inside the 20 sessions after one. Also tested: sell a holding
 *    in that window too. After charges and tax, all three modes.
 * 2. Results buys: the same trades split by whether the stock was in the
 *    window on the signal day.
 *
 * Only ex-dates that NSE had listed by the day of the decision are used.
 */
import { mkdirSync, writeFileSync } from 'fs'
import { DatabaseSync } from 'node:sqlite'
import { lastAtOrBefore } from '@/lib/research/dates'
import { loadMarketCached } from '@/lib/research/load'
import { indicators, meanAndT } from '@/lib/research/swing'
import { periodStats } from '@/lib/research/metrics'
import { simulate } from '@/lib/research/simulate'
import { factorPortfolio } from '@/lib/research/strategies'
import { parseCorporateAction } from '@/lib/market-data/corporate-actions'
import { MODES, PORTFOLIO_RULES, type RiskMode } from '@/lib/portfolio/config'
import { SECTOR_BY_SYMBOL } from '@/lib/portfolio/sectors'

const START = 20110131
const PERIODS = [{ key: '2011-2019', from: 20110101, to: 20191231 }, { key: '2020-2022', from: 20200101, to: 20221231 }, { key: '2023-now', from: 20230101, to: 99999999 }]
const round2 = (x: number) => Math.round(x * 100) / 100
const pct = (x: number) => Math.round(x * 10000) / 100
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const epochDay = (d: number) => Date.UTC(Math.floor(d / 10000), Math.floor(d / 100) % 100 - 1, d % 100) / 86400000

const market = loadMarketCached()
const END = market.sessions[market.sessions.length - 1]

// Real splits and bonuses, with the day NSE first listed each
const store = new DatabaseSync('data/market.db', { readOnly: true })
const events = new Map<string, Array<{ ex: number; seen: number; kind: 'split' | 'bonus' }>>()
for (const a of store.prepare('select symbol, ex_date, purpose, first_seen from corporate_actions_raw where ex_date >= 20100601').all() as Array<{ symbol: string; ex_date: number; purpose: string; first_seen: number }>) {
  const parsed = parseCorporateAction(a.purpose)
  const kind = parsed.split && parsed.split.to < parsed.split.from ? 'split' : parsed.bonus ? 'bonus' : null
  if (kind) events.set(a.symbol, [...(events.get(a.symbol) ?? []), { ex: epochDay(a.ex_date), seen: a.first_seen, kind }])
}
/** In the window on a date: an ex-date already listed that is up to `ahead` days away, or up to 28 days (20 sessions) past. */
const inWindow = (symbol: string, date: number, ahead = 30): boolean => {
  const list = events.get(symbol)
  if (!list) return false
  const today = epochDay(date)
  return list.some(e => e.seen <= date && today >= e.ex - ahead && today < e.ex + 28)
}

const out: Record<string, unknown> = { note: 'Window: a split or bonus ex-date already listed by NSE that is up to 30 days ahead, or up to 20 sessions past.' }

// ---- 1. Monthly Plan ----
const plan: Record<string, unknown> = {}
console.log('1. Monthly Plan, after charges and tax')
console.log(`${''.padEnd(48)}${'a year'.padStart(8)}${'fall'.padStart(8)}   a year by period`)
for (const mode of Object.keys(MODES) as RiskMode[]) {
  const make = (extra: object) => factorPortfolio({ factors: MODES[mode].factors, exitRank: PORTFOLIO_RULES.exitRank, maxPerSector: PORTFOLIO_RULES.maxPerSector, sectorOf: s => SECTOR_BY_SYMBOL[s], ...extra })
  let skipped = 0, decisions = 0
  const variants: Array<[string, object]> = [
    ['as now', {}],
    ['no buying in the window', { canBuy: (s: string, d: number) => { decisions++; const w = inWindow(s, d); if (w) skipped++; return !w } }],
    ['no buying only after the ex-date', { canBuy: (s: string, d: number) => !inWindow(s, d, 0) }],
    ['no buying, and sell holdings in the window', { leaveOut: (s: string, d: number) => inWindow(s, d) }],
  ]
  const modeOut: Record<string, unknown> = {}
  for (const [key, extra] of variants) {
    const r = simulate(market, make(extra), { start: START, end: END })
    const curve = { dates: r.dates, equity: r.equity }
    const all = periodStats(curve)
    const periods = Object.fromEntries(PERIODS.map(p => {
      const i = r.dates.findIndex(d => d >= p.from), j = lastAtOrBefore(r.dates, p.to)
      return [p.key, i < 0 || j <= i ? null : round2(periodStats({ dates: r.dates.slice(i, j + 1), equity: r.equity.slice(i, j + 1) }).cagrPct)]
    }))
    modeOut[key] = { cagrPct: round2(all.cagrPct), maxDrawdownPct: round2(all.maxDrawdownPct), periods }
    console.log(`${`${mode}: ${key}`.padEnd(48)}${String(round2(all.cagrPct)).padStart(8)}${String(round2(all.maxDrawdownPct)).padStart(8)}   ${PERIODS.map(p => periods[p.key]).join(' | ')}`)
  }
  plan[mode] = modeOut
}
out.monthlyPlan = plan

// ---- 2. Results buys ----
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
const groups: Record<string, Trade[]> = { 'all results buys': [], 'not in the window': [], 'in the window': [], 'in the window: ex-date ahead': [], 'in the window: ex-date just past': [] }
for (const s of market.stocks.values()) {
  const ind = indicators(s)
  let pointer = 0, busy = -1
  for (let i = 253; i + 61 < s.dates.length; i++) {
    if (s.dates[i] < START) continue
    while (pointer < s.resultsDates.length && s.resultsDates[pointer] < s.dates[i - 1]) pointer++
    if (!(pointer < s.resultsDates.length && s.resultsDates[pointer] <= s.dates[i])) continue
    if (!(s.close[i] / s.close[i - 2] - 1 >= 0.08) || !(s.turnover[i] / ind.avgTurnover20[i] >= 3) || i + 1 <= busy) continue
    const r = rank(s.symbol, s.dates[i])
    if (r > 750) continue
    // Bought at the next session's close, sold at the close 60 sessions on
    const e = i + 1, x = i + 60
    const ke = sessionIndex.get(s.dates[e])!, kx = sessionIndex.get(s.dates[x])!
    if (kx - ke !== x - e) continue
    busy = x
    const cost = r > 500 ? 0.0085 : 0.0045
    let v = 1
    for (let k = ke + 1; k <= kx; k++) v *= 1 + dayRet[k]
    const ret = s.close[x] / s.close[e] - 1 - cost
    const t = { date: s.dates[e], ret, excess: ret - (v - 1 - 0.0045) }
    groups['all results buys'].push(t)
    if (!inWindow(s.symbol, s.dates[i])) { groups['not in the window'].push(t); continue }
    groups['in the window'].push(t)
    groups[inWindow(s.symbol, s.dates[i], 0) ? 'in the window: ex-date just past' : 'in the window: ex-date ahead'].push(t)
  }
}
const summarise = (rows: Trade[]) => {
  if (rows.length < 20) return { trades: rows.length }
  const byDay = new Map<number, number[]>()
  for (const r of rows) byDay.set(r.date, [...(byDay.get(r.date) ?? []), r.excess])
  return { trades: rows.length, winRatePct: round2(rows.filter(r => r.ret > 0).length / rows.length * 100), avgReturnPct: pct(mean(rows.map(r => r.ret))), avgExcessPct: pct(mean(rows.map(r => r.excess))), tStat: round2(meanAndT([...byDay.values()].map(mean)).t) }
}
console.log(`\n2. Results buys on the 750 most traded stocks, 60 sessions, after costs\n${''.padEnd(40)}${'trades'.padStart(7)}${'win%'.padStart(8)}${'avg%'.padStart(8)}${'excess%'.padStart(9)}${'t'.padStart(7)}`)
const results: Record<string, unknown> = {}
for (const [key, rows] of Object.entries(groups)) {
  const r: any = summarise(rows)
  results[key] = r
  console.log(`${key.padEnd(40)}${String(r.trades).padStart(7)}${String(r.winRatePct ?? '').padStart(8)}${String(r.avgReturnPct ?? '').padStart(8)}${String(r.avgExcessPct ?? '').padStart(9)}${String(r.tStat ?? '').padStart(7)}`)
}
out.resultsBuys = results

mkdirSync('research/results', { recursive: true })
writeFileSync('research/results/avoid-after-split.json', JSON.stringify(out, null, 2))
console.log('\nSaved research/results/avoid-after-split.json')
