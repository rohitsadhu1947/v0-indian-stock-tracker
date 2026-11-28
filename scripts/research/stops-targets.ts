/**
 * Stops and targets on the results buys, run as a real book.
 *
 *   npm run research:stops-targets
 *
 * The live rule: a stock in the 750 most traded that rises 8% or more around
 * its results on three times its usual turnover, and is not in the bottom
 * fifth on 12-month strength. Bought at the next session's close, 20
 * positions, sold after 60 sessions. This asks what a stop, a target or a
 * trailing stop does to that book, after charges and tax.
 *
 * A stop is hit when the day's low reaches it (or the open, when the stock
 * opens below it). A target is hit when the day's high reaches it. When a
 * day touches both, the stop is taken first.
 */
import { mkdirSync, writeFileSync } from 'fs'
import { DEFAULT_COSTS } from '@/lib/backtest/costs'
import { lastAtOrBefore } from '@/lib/research/dates'
import { loadMarketCached } from '@/lib/research/load'
import { periodStats, slice } from '@/lib/research/metrics'
import { indicators } from '@/lib/research/swing'
import { simulateSwingBook, type BookOptions, type Candidate } from '@/lib/research/swing-book'

const START = 20110131
const UNIVERSE = 750
const HOLD = 60
const PERIODS = [{ key: '2011-2019', from: START, to: 20191231 }, { key: '2020-2022', from: 20200101, to: 20221231 }, { key: '2023-now', from: 20230101, to: Infinity }]
const round1 = (x: number) => Math.round(x * 10) / 10
const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0

const market = loadMarketCached()
const sessionIndex = new Map<number, number>()
market.sessions.forEach((d, i) => sessionIndex.set(d, i))
const members = new Map<number, Set<string>>()
for (const d of market.universeDates) members.set(d, new Set(market.universe.get(d)!.slice(0, UNIVERSE)))
const memberOn = (symbol: string, date: number): boolean => {
  const i = lastAtOrBefore(market.universeDates, date)
  return i >= 0 && members.get(market.universeDates[i])!.has(symbol)
}

// Every signal of the live rule
const prepared = [...market.stocks.values()].map(s => ({ s, ind: indicators(s) }))
const momentumByDate = new Map<number, number[]>()
for (const { s, ind } of prepared) for (let i = 253; i < s.dates.length; i++) {
  if (s.dates[i] < START || Number.isNaN(ind.momentum[i]) || !memberOn(s.symbol, s.dates[i])) continue
  momentumByDate.set(s.dates[i], [...(momentumByDate.get(s.dates[i]) ?? []), ind.momentum[i]])
}
for (const list of momentumByDate.values()) list.sort((a, b) => a - b)
const candidates = new Map<number, Candidate[]>()
let signals = 0
for (const { s, ind } of prepared) {
  let pointer = 0
  for (let i = 253; i < s.dates.length - 1; i++) {
    if (s.dates[i] < START || !memberOn(s.symbol, s.dates[i])) continue
    if (sessionIndex.get(s.dates[i + 1]) !== sessionIndex.get(s.dates[i])! + 1) continue
    while (pointer < s.resultsDates.length && s.resultsDates[pointer] < s.dates[i - 1]) pointer++
    if (!(pointer < s.resultsDates.length && s.resultsDates[pointer] <= s.dates[i])) continue
    const jump = s.close[i] / s.close[i - 2] - 1
    if (!(jump >= 0.08) || !(s.turnover[i] / ind.avgTurnover20[i] >= 3)) continue
    const sorted = momentumByDate.get(s.dates[i])
    if (!sorted || Number.isNaN(ind.momentum[i])) continue
    const rank = sorted.filter(x => x < ind.momentum[i]).length / Math.max(1, sorted.length - 1)
    if (rank < 0.2) continue
    const date = s.dates[i + 1]
    candidates.set(date, [...(candidates.get(date) ?? []), { symbol: s.symbol, entryIndex: i + 1, ret5: ind.ret5[i], turnover: s.turnover[i], jump, momentum: rank } as Candidate & { momentum: number }])
    signals++
  }
}
const strongestFirst = (a: Candidate, b: Candidate) => (b as any).momentum - (a as any).momentum || a.symbol.localeCompare(b.symbol)
const BASE: BookOptions = { start: START, capital: 2_500_000, slots: 20, maxSessions: HOLD, stopPct: null, entry: 'close', priority: strongestFirst, payTax: true, cashYield: 0.06 }

interface Row { key: string; stopPct: number | null; targetPct: number | null; trailPct: number | null; slippage: number; [k: string]: unknown }
function run(key: string, extra: Partial<BookOptions>, slippage = DEFAULT_COSTS.slippagePercent): Row {
  const trades: Array<{ retPct: number; sessions: number; reason: string }> = []
  const r = simulateSwingBook(market, candidates, { ...BASE, ...extra, costs: { ...DEFAULT_COSTS, slippagePercent: slippage }, onTrade: t => trades.push(t) })
  const all = periodStats(slice(r.curve, START))
  const wins = trades.filter(t => t.retPct > 0), losses = trades.filter(t => t.retPct <= 0)
  const share = (reason: string) => round1(trades.filter(t => t.reason === reason).length / Math.max(1, trades.length) * 100)
  return {
    key, stopPct: extra.stopPct ?? null, targetPct: extra.targetPct ?? null, trailPct: extra.trailPct ?? null, slippage,
    cagrPct: round1(all.cagrPct), maxDrawdownPct: round1(all.maxDrawdownPct), sharpe: Math.round(all.sharpe * 100) / 100, worstYearPct: round1(all.worstYearPct),
    periods: Object.fromEntries(PERIODS.map(p => [p.key, round1(periodStats(slice(r.curve, p.from, p.to)).cagrPct)])),
    trades: trades.length, skipped: r.skipped, winRatePct: round1(wins.length / Math.max(1, trades.length) * 100),
    avgTradePct: round1(mean(trades.map(t => t.retPct))), avgWinPct: round1(mean(wins.map(t => t.retPct))), avgLossPct: round1(mean(losses.map(t => t.retPct))),
    worstTradePct: round1(Math.min(...trades.map(t => t.retPct))), stoppedPct: share('stop'), hitTargetPct: share('target'), avgSessions: round1(mean(trades.map(t => t.sessions))),
    avgInvestedPct: round1(r.avgInvested * 100),
  }
}
const show = (r: Row) => console.log(`${r.key.padEnd(34)}${String(r.cagrPct).padStart(7)}${String(r.maxDrawdownPct).padStart(8)}${String(r.sharpe).padStart(7)}${String(r.trades).padStart(7)}${String(r.winRatePct).padStart(7)}${String(r.avgTradePct).padStart(7)}${String(r.avgWinPct).padStart(7)}${String(r.avgLossPct).padStart(8)}${String(r.worstTradePct).padStart(8)}${String(r.stoppedPct).padStart(7)}${String(r.hitTargetPct).padStart(7)}${String(r.avgSessions).padStart(7)}${String(r.avgInvestedPct).padStart(6)}   ${Object.values(r.periods as object).join(' | ')}`)
const head = (title: string) => console.log(`\n${title}\n${''.padEnd(34)}${'a year'.padStart(7)}${'fall'.padStart(8)}${'sharpe'.padStart(7)}${'trades'.padStart(7)}${'win%'.padStart(7)}${'avg%'.padStart(7)}${'win'.padStart(7)}${'loss'.padStart(8)}${'worst'.padStart(8)}${'stop%'.padStart(7)}${'tgt%'.padStart(7)}${'days'.padStart(7)}${'inv%'.padStart(6)}   a year by period`)

console.log(`${signals} signals of the live rule since ${START}. Book of Rs 25 lakh, 20 positions, after charges and tax.`)
const rows: Row[] = []
head('Fixed stop and target')
for (const stopPct of [null, 8, 10, 15, 20]) for (const targetPct of [null, 15, 25, 40]) {
  const r = run(`stop ${stopPct ?? 'none'}, target ${targetPct ?? 'none'}`, { stopPct, targetPct }); rows.push(r); show(r)
}
head('Trailing stop from the highest close')
for (const trailPct of [10, 15, 20, 25]) { const r = run(`trailing ${trailPct}%`, { trailPct }); rows.push(r); show(r) }
for (const trailPct of [15, 20]) { const r = run(`trailing ${trailPct}%, held up to 120 sessions`, { trailPct, maxSessions: 120 }); rows.push(r); show(r) }
head('Longer and shorter holds, no stop')
for (const maxSessions of [20, 40, 90, 120]) { const r = run(`held ${maxSessions} sessions`, { maxSessions }); rows.push(r); show(r) }
head('The same at three times the slippage')
const harder: Row[] = []
for (const [key, extra] of [['stop none, target none', {}], ['stop 15, target none', { stopPct: 15 }], ['stop 10, target 25', { stopPct: 10, targetPct: 25 }], ['trailing 20%', { trailPct: 20 }]] as Array<[string, Partial<BookOptions>]>) {
  const r = run(key, extra, DEFAULT_COSTS.slippagePercent * 3); harder.push(r); show(r)
}

// ---- How far the stock has moved by the time you buy ----
// The buy is at the close of the session after the signal. Does it matter how far the price has already run that day?
const BUCKETS: Array<[string, number, number]> = [['fell more than 3%', -Infinity, -0.03], ['fell 0 to 3%', -0.03, 0], ['rose 0 to 3%', 0, 0.03], ['rose 3 to 6%', 0.03, 0.06], ['rose more than 6%', 0.06, Infinity]]
const byMove: Record<string, number[]> = Object.fromEntries(BUCKETS.map(b => [b[0], []]))
const all60: number[] = []
for (const list of candidates.values()) for (const c of list) {
  const s = market.stocks.get(c.symbol)!, e = c.entryIndex, x = e + HOLD - 1
  if (x >= s.dates.length || sessionIndex.get(s.dates[x])! - sessionIndex.get(s.dates[e])! !== x - e) continue
  const move = s.close[e] / s.close[e - 1] - 1, ret = (s.close[x] / s.close[e] - 1 - 0.0045) * 100
  all60.push(ret)
  byMove[BUCKETS.find(b => move >= b[1] && move < b[2])![0]].push(ret)
}
const entryMove = Object.fromEntries(Object.entries(byMove).map(([k, xs]) => [k, { trades: xs.length, avgPct: round1(mean(xs)), winRatePct: round1(xs.filter(x => x > 0).length / Math.max(1, xs.length) * 100) }]))
console.log(`\nBy the move on the day you buy (signal close to buy close), ${HOLD} sessions, after costs. All: ${all60.length} trades, ${round1(mean(all60))}%`)
for (const [k, r] of Object.entries(entryMove)) console.log(`  ${k.padEnd(22)}${String(r.trades).padStart(6)} trades  avg ${String(r.avgPct).padStart(6)}%  won ${r.winRatePct}%`)

mkdirSync('research/results', { recursive: true })
writeFileSync('research/results/stops-targets.json', JSON.stringify({
  note: 'Results buys on the 750 most traded stocks, bottom fifth on 12-month strength left out, bought at the next close, 20 positions, Rs 25 lakh, after charges and tax, idle cash earns 6%.',
  from: START, to: market.sessions[market.sessions.length - 1], signals, tested: rows.length, rows, atThreeTimesSlippage: harder, byMoveOnTheBuyDay: entryMove,
}, null, 2))
console.log('\nSaved research/results/stops-targets.json')
