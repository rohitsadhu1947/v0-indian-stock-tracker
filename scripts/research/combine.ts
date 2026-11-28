/**
 * Can the Monthly Plan (Growth mode) and the results buys be run together
 * for a better result than either alone?
 *
 *   npm run research:combine
 *
 * Five questions:
 *   1. Do results buys work better or worse on stocks Growth already holds,
 *      or on stocks with strong 12-month momentum?
 *   2. How sensitive is the results book to its own settings (positions,
 *      which signals come first, a market trend filter)?
 *   3. What does a fixed split of the money between the two do?
 *   4. What if Growth holds all the money and results buys are paid for by
 *      trimming it?
 *   5. Does Growth do better if it avoids stocks that fell on their results?
 *
 * Questions 3 and 4 are worked out from the two daily value curves, so they
 * leave out the small cost and tax of moving money between the two.
 */
import { mkdirSync, writeFileSync } from 'fs'
import { DEFAULT_COSTS } from '@/lib/backtest/costs'
import { lastAtOrBefore } from '@/lib/research/dates'
import { loadMarketCached } from '@/lib/research/load'
import { calendarYearReturns, periodStats, slice, type Curve } from '@/lib/research/metrics'
import { simulate, type Strategy } from '@/lib/research/simulate'
import { earningsReaction, factorPortfolio } from '@/lib/research/strategies'
import { indicators, meanAndT, tradeOutcome } from '@/lib/research/swing'
import { simulateSwingBook, type BookOptions, type Candidate } from '@/lib/research/swing-book'
import { PORTFOLIO_RULES, STOCK_MOMENTUM } from '@/lib/portfolio/config'
import { rankByFactors, selectWithBuffer } from '@/lib/portfolio/factors'
import { SECTOR_BY_SYMBOL } from '@/lib/portfolio/sectors'
import type { DailyBar } from '@/lib/portfolio/momentum'

const START = 20110131
/** 500 unless set, to see what a wider universe does to the results book: UNIVERSE=750 npm run research:combine */
const UNIVERSE = Number(process.env.UNIVERSE ?? 500)
const OUT = UNIVERSE === 500 && !process.env.SLIPPAGE ? 'research/results/combine.json' : `research/results/combine-top${UNIVERSE}${process.env.SLIPPAGE ? '-slippage' + process.env.SLIPPAGE : ''}.json`
const HOLD = 60
const CASH_YIELD = 0.06
const PERIODS = [
  { key: 'full', from: START, to: Infinity }, { key: '2011-2019', from: START, to: 20191231 },
  { key: '2020-2022', from: 20200101, to: 20221231 }, { key: '2023-now', from: 20230101, to: Infinity },
]

const market = loadMarketCached()
const END = market.sessions[market.sessions.length - 1]
const sessionIndex = new Map<number, number>()
market.sessions.forEach((d, i) => sessionIndex.set(d, i))
const members = new Map<number, Set<string>>()
for (const d of market.universeDates) members.set(d, new Set(market.universe.get(d)!.slice(0, UNIVERSE)))
const memberOn = (symbol: string, date: number): boolean => {
  const i = lastAtOrBefore(market.universeDates, date)
  return i >= 0 && members.get(market.universeDates[i])!.has(symbol)
}
const round1 = (x: number) => Math.round(x * 10) / 10
const round2 = (x: number) => Math.round(x * 100) / 100
const stats = (curve: Curve) => Object.fromEntries(PERIODS.map(p => {
  const st = periodStats(slice(curve, p.from, p.to))
  return [p.key, { cagrPct: round1(st.cagrPct), maxDrawdownPct: round1(st.maxDrawdownPct), sharpe: round2(st.sharpe), worstYearPct: round1(st.worstYearPct) }]
}))

// ---- Growth mode, as the app runs it, keeping a note of what it holds each month ----
const cap = { groupOf: (symbol: string) => SECTOR_BY_SYMBOL[symbol], max: PORTFOLIO_RULES.maxPerSector }
const growthStrategy = factorPortfolio({ factors: ['momentum'], exitRank: PORTFOLIO_RULES.exitRank, maxPerSector: PORTFOLIO_RULES.maxPerSector, sectorOf: cap.groupOf })
const heldFrom: Array<{ date: number; symbols: Set<string> }> = []
const recording: Strategy = {
  name: growthStrategy.name,
  targets(ctx) { const t = growthStrategy.targets(ctx); heldFrom.push({ date: ctx.date, symbols: new Set(Object.keys(t)) }); return t },
}
const growthRun = simulate(market, recording, { start: START, end: END })
const growth: Curve = { dates: growthRun.dates, equity: growthRun.equity }
const heldDates = heldFrom.map(h => h.date)
/** Whether Growth held the stock at a close: the picks made at the last month end before that day. */
const growthHeld = (symbol: string, date: number): boolean => {
  const i = lastAtOrBefore(heldDates, date - 1)
  return i >= 0 && heldFrom[i].symbols.has(symbol)
}

// ---- Every results jump, with what was known about the stock at the signal ----
interface Signal extends Candidate { signalDate: number; momentumRank: number; held: boolean; ret: number | null; excess: number }
const prepared = [...market.stocks.values()].map(s => ({ s, ind: indicators(s) }))
const momentumByDate = new Map<number, number[]>()
for (const { s, ind } of prepared) for (let i = 253; i < s.dates.length; i++) {
  if (s.dates[i] < START || Number.isNaN(ind.momentum[i]) || !memberOn(s.symbol, s.dates[i])) continue
  const list = momentumByDate.get(s.dates[i]) ?? []
  list.push(ind.momentum[i])
  momentumByDate.set(s.dates[i], list)
}
for (const list of momentumByDate.values()) list.sort((a, b) => a - b)
const rankIn = (sorted: number[], x: number): number => {
  let lo = 0, hi = sorted.length
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < x) lo = mid + 1; else hi = mid }
  return sorted.length > 1 ? lo / (sorted.length - 1) : 1
}

const signals: Signal[] = []
const baseline = new Map<number, { sum: number; count: number }>()
for (const { s, ind } of prepared) {
  let pointer = 0, busyUntil = -1
  for (let i = 253; i < s.dates.length - 1; i++) {
    if (s.dates[i] < START || !memberOn(s.symbol, s.dates[i])) continue
    if (sessionIndex.get(s.dates[i + 1]) !== sessionIndex.get(s.dates[i])! + 1) continue
    const entryDate = s.dates[i + 1]
    const outcome = i + HOLD < s.dates.length ? tradeOutcome(s, i + 1, { key: 'hold', targetPct: null, stopPct: null, maxSessions: HOLD }, undefined, s.fill[i + 1]) : null
    if (outcome) {
      const day = baseline.get(entryDate) ?? { sum: 0, count: 0 }
      day.sum += outcome.ret; day.count++
      baseline.set(entryDate, day)
    }
    while (pointer < s.resultsDates.length && s.resultsDates[pointer] < s.dates[i - 1]) pointer++
    const resultsJustOut = pointer < s.resultsDates.length && s.resultsDates[pointer] <= s.dates[i]
    const jump = s.close[i] / s.close[i - 2] - 1
    if (!resultsJustOut || !(jump >= 0.08) || !(s.turnover[i] / ind.avgTurnover20[i] >= 3)) continue
    const sorted = momentumByDate.get(s.dates[i])
    // One open trade per stock for the per-trade figures; the book applies its own rule
    const counted = outcome != null && i + 1 > busyUntil
    if (counted) busyUntil = outcome!.exitIndex
    signals.push({
      symbol: s.symbol, entryIndex: i + 1, ret5: ind.ret5[i], turnover: s.turnover[i], jump,
      signalDate: s.dates[i], momentumRank: sorted && !Number.isNaN(ind.momentum[i]) ? rankIn(sorted, ind.momentum[i]) : NaN,
      held: growthHeld(s.symbol, s.dates[i]), ret: counted ? outcome!.ret : null, excess: 0,
    })
  }
}
const entryDateOf = (c: Signal) => market.stocks.get(c.symbol)!.dates[c.entryIndex]
for (const c of signals) if (c.ret != null) { const d = baseline.get(entryDateOf(c))!; c.excess = c.ret - d.sum / d.count }

// ---- 1. Per trade, split by what Growth thinks of the stock ----
function summarise(rows: Signal[]) {
  const done = rows.filter(r => r.ret != null)
  if (done.length < 30) return { trades: done.length }
  const byDay = new Map<number, number[]>()
  for (const r of done) byDay.set(entryDateOf(r), [...(byDay.get(entryDateOf(r)) ?? []), r.excess])
  const edge = meanAndT([...byDay.values()].map(xs => xs.reduce((a, b) => a + b, 0) / xs.length))
  const avg = (f: (r: Signal) => number) => round2(done.reduce((a, r) => a + f(r), 0) / done.length * 100)
  return { trades: done.length, winRatePct: round1(done.filter(r => r.ret! > 0).length / done.length * 100), avgReturnPct: avg(r => r.ret!), avgExcessPct: avg(r => r.excess), tStat: round2(edge.t) }
}
const SPLITS: Array<{ key: string; label: string; test: (c: Signal) => boolean }> = [
  { key: 'all', label: 'All results jumps', test: () => true },
  { key: 'held', label: 'Growth already holds the stock', test: c => c.held },
  { key: 'not-held', label: 'Growth does not hold it', test: c => !c.held },
  { key: 'momentum-5', label: 'Momentum: top fifth of the 500', test: c => c.momentumRank >= 0.8 },
  { key: 'momentum-4', label: 'Momentum: second fifth', test: c => c.momentumRank >= 0.6 && c.momentumRank < 0.8 },
  { key: 'momentum-3', label: 'Momentum: middle fifth', test: c => c.momentumRank >= 0.4 && c.momentumRank < 0.6 },
  { key: 'momentum-2', label: 'Momentum: fourth fifth', test: c => c.momentumRank >= 0.2 && c.momentumRank < 0.4 },
  { key: 'momentum-1', label: 'Momentum: bottom fifth', test: c => c.momentumRank < 0.2 },
  { key: 'momentum-top-60', label: 'Momentum: top three fifths together', test: c => c.momentumRank >= 0.4 },
  { key: 'momentum-low-40', label: 'Momentum: bottom two fifths together', test: c => c.momentumRank < 0.4 },
  { key: 'jump-15', label: 'Jump of 15% or more', test: c => c.jump! >= 0.15 },
  { key: 'jump-8-15', label: 'Jump of 8% to 15%', test: c => c.jump! < 0.15 },
]
const perTrade = SPLITS.map(sp => ({
  key: sp.key, label: sp.label, ...summarise(signals.filter(sp.test)),
  periods: Object.fromEntries(PERIODS.slice(1).map(p => [p.key, summarise(signals.filter(c => sp.test(c) && entryDateOf(c) >= p.from && entryDateOf(c) <= p.to))])),
}))
console.log('1. Results jumps held 60 sessions, per trade, after costs')
console.log(`${'Group'.padEnd(36)}${'trades'.padStart(7)}${'win%'.padStart(7)}${'avg%'.padStart(7)}${'excess%'.padStart(9)}${'t'.padStart(6)}   excess by period (trades)`)
for (const r of perTrade as any[]) {
  const periods = PERIODS.slice(1).map(p => { const x = r.periods[p.key]; return x.avgExcessPct == null ? `n/a (${x.trades})` : `${x.avgExcessPct >= 0 ? '+' : ''}${x.avgExcessPct} (${x.trades})` }).join(' | ')
  console.log(`${r.label.padEnd(36)}${String(r.trades).padStart(7)}${String(r.winRatePct ?? '').padStart(7)}${String(r.avgReturnPct ?? '').padStart(7)}${String(r.avgExcessPct ?? '').padStart(9)}${String(r.tStat ?? '').padStart(6)}   ${periods}`)
}

// ---- 2. The results book under different settings ----
const nifty200 = market.indices.get('IDX:NIFTY 200')!
const marketUp = new Map<number, boolean>()
for (let i = 199, sum = 0; i < nifty200.close.length; i++) {
  sum = 0
  for (let j = i - 199; j <= i; j++) sum += nifty200.close[j]
  marketUp.set(nifty200.dates[i], nifty200.close[i] > sum / 200)
}
const byEntry = (test: (c: Signal) => boolean) => {
  const out = new Map<number, Candidate[]>()
  for (const c of signals) if (test(c)) out.set(entryDateOf(c), [...(out.get(entryDateOf(c)) ?? []), c])
  return out
}
const mostTraded = (a: Candidate, b: Candidate) => b.turnover - a.turnover || a.symbol.localeCompare(b.symbol)
const biggestJump = (a: Candidate, b: Candidate) => b.jump! - a.jump! || a.symbol.localeCompare(b.symbol)
const strongestFirst = (a: Candidate, b: Candidate) => (b as Signal).momentumRank - (a as Signal).momentumRank || a.symbol.localeCompare(b.symbol)
const notWeak = (c: Signal) => c.momentumRank >= 0.4
const BASE: BookOptions = { start: START, capital: 1_000_000, slots: 20, maxSessions: HOLD, stopPct: null, entry: 'vwap', priority: mostTraded, payTax: true, cashYield: CASH_YIELD, costs: { ...DEFAULT_COSTS, slippagePercent: Number(process.env.SLIPPAGE ?? DEFAULT_COSTS.slippagePercent) } }
const BOOKS: Array<{ key: string; note: string; test: (c: Signal) => boolean; options: BookOptions }> = [
  { key: 'base-no-interest', note: '20 positions, idle cash earns nothing (as tested before)', test: () => true, options: { ...BASE, cashYield: 0 } },
  { key: 'base', note: '20 positions, idle cash earns 6%', test: () => true, options: BASE },
  { key: 'slots-10', note: '10 positions', test: () => true, options: { ...BASE, slots: 10 } },
  { key: 'slots-15', note: '15 positions', test: () => true, options: { ...BASE, slots: 15 } },
  { key: 'slots-30', note: '30 positions', test: () => true, options: { ...BASE, slots: 30 } },
  { key: 'slots-40', note: '40 positions', test: () => true, options: { ...BASE, slots: 40 } },
  { key: 'biggest-jump-first', note: '20 positions, biggest jump first', test: () => true, options: { ...BASE, priority: biggestJump } },
  { key: 'market-up-only', note: '20 positions, buy only when NIFTY 200 is above its 200-day average', test: c => marketUp.get(c.signalDate) === true, options: BASE },
  { key: 'not-held-by-growth', note: '20 positions, only stocks Growth does not hold', test: c => !c.held, options: BASE },
  { key: 'strongest-momentum-first', note: '20 positions, strongest momentum first, nothing left out', test: () => true, options: { ...BASE, priority: strongestFirst } },
  { key: 'momentum-top-two-fifths', note: '20 positions, only stocks in the top 40% on momentum', test: c => c.momentumRank >= 0.6, options: BASE },
  { key: 'not-weak', note: '20 positions, leaving out the bottom 40% on momentum', test: notWeak, options: BASE },
  { key: 'not-weak-10', note: '10 positions, leaving out the bottom 40% on momentum', test: notWeak, options: { ...BASE, slots: 10 } },
  { key: 'not-weak-15', note: '15 positions, leaving out the bottom 40% on momentum', test: notWeak, options: { ...BASE, slots: 15 } },
  { key: 'not-weak-30', note: '30 positions, leaving out the bottom 40% on momentum', test: notWeak, options: { ...BASE, slots: 30 } },
  { key: 'not-weak-stop15', note: '20 positions, leaving out the bottom 40% on momentum, 15% stop', test: notWeak, options: { ...BASE, stopPct: 15 } },
  { key: 'not-bottom-fifth', note: '20 positions, leaving out the bottom 20% on momentum', test: c => c.momentumRank >= 0.2, options: BASE },
]
const years = market.sessions.filter(d => d >= START).length / 250
const bookRuns = new Map(BOOKS.map(b => [b.key, simulateSwingBook(market, byEntry(b.test), b.options)]))
const books = BOOKS.map(b => {
  const run = bookRuns.get(b.key)!
  return {
    key: b.key, note: b.note, afterTax: stats(run.curve), tradesPerYear: Math.round(run.trades / years), winRatePct: round1(run.wins / run.trades * 100),
    signalsSkippedPct: round1(run.skipped / (run.skipped + run.trades) * 100), avgInvestedPct: round1(run.avgInvested * 100),
  }
})
const cell = (x: any) => PERIODS.map(p => `${String(x[p.key].cagrPct).padStart(5)}% (${String(x[p.key].maxDrawdownPct).padStart(5)})`).join('  ')
const header = `${PERIODS.map(p => p.key.padEnd(16)).join('')}  Sharpe  worst yr`
const line = (label: string, x: any, extra = '') => console.log(`${label.padEnd(30)}${cell(x)}  ${String(x.full.sharpe).padStart(6)}  ${String(x.full.worstYearPct).padStart(8)}${extra}`)
console.log(`\n2. The results book, after tax: growth a year (worst fall)\n${''.padEnd(30)}${header}  trades/yr  skipped%  invested%`)
line('Growth mode', stats(growth))
for (const b of books) line(b.key, b.afterTax, `  ${String(b.tradesPerYear).padStart(9)}  ${String(b.signalsSkippedPct).padStart(8)}  ${String(b.avgInvestedPct).padStart(9)}`)

// ---- 3. A fixed split, put back to the split each April ----
const daily = (curve: Curve) => { const m = new Map<number, number>(); for (let i = 1; i < curve.dates.length; i++) m.set(curve.dates[i], curve.equity[i] / curve.equity[i - 1] - 1); return m }
const growthDaily = daily(growth)
const financialYearOf = (d: number) => (Math.floor(d / 100) % 100 >= 4 ? Math.floor(d / 10000) + 1 : Math.floor(d / 10000))
function split(bookKey: string, weight: number): Curve {
  const bookDaily = daily(bookRuns.get(bookKey)!.curve)
  const out: Curve = { dates: [growth.dates[0]], equity: [1] }
  let a = 1 - weight, b = weight
  for (let i = 1; i < growth.dates.length; i++) {
    const d = growth.dates[i]
    if (financialYearOf(d) !== financialYearOf(growth.dates[i - 1])) { const total = a + b; a = total * (1 - weight); b = total * weight }
    a *= 1 + growthDaily.get(d)!
    b *= 1 + (bookDaily.get(d) ?? 0)
    out.dates.push(d); out.equity.push(a + b)
  }
  return out
}
const WEIGHTS = [0, 0.25, 0.5, 0.75, 1]
const splits = ['base', 'not-weak', 'not-weak-15'].map(bookKey => ({ book: bookKey, rows: WEIGHTS.map(w => ({ resultsSharePct: w * 100, ...stats(split(bookKey, w)) })) }))
console.log(`\n3. Fixed split between Growth and the results book, reset each April\n${''.padEnd(30)}${header}`)
for (const s of splits) for (const r of s.rows) line(`${s.book}: ${r.resultsSharePct}% in results`, r)
const yearly = { growth: calendarYearReturns(growth), results: calendarYearReturns(slice(bookRuns.get('not-weak')!.curve, START)), half: calendarYearReturns(split('not-weak', 0.5)) }
console.log('\nBy calendar year (Growth / results book without weak stocks / half and half):')
console.log(Object.keys(yearly.growth).map(y => `${y.slice(2)}: ${round1(yearly.growth[+y])} / ${round1(yearly.results[+y])} / ${round1(yearly.half[+y])}`).join('   '))

// ---- 4. Growth holds everything; results buys are paid for by trimming Growth ----
function overlay(weight: number): { curve: Curve; avgInResultsPct: number } {
  const run = bookRuns.get('base-no-interest')!
  const bookDaily = daily(run.curve)
  const investedOn = new Map(run.curve.dates.map((d, i) => [d, run.invested[i]]))
  const out: Curve = { dates: [growth.dates[0]], equity: [1] }
  let value = 1, before = 0, sum = 0
  for (let i = 1; i < growth.dates.length; i++) {
    const d = growth.dates[i]
    const now = weight * (investedOn.get(d) ?? 0)
    // Money moved between the two pays a sale and a purchase: about 0.225% each way
    const moved = Math.abs(now - before) * 0.00225
    value *= 1 + weight * (bookDaily.get(d) ?? 0) + (1 - before) * growthDaily.get(d)! - moved
    before = now; sum += now
    out.dates.push(d); out.equity.push(value)
  }
  return { curve: out, avgInResultsPct: round1(sum / (growth.dates.length - 1) * 100) }
}
const overlays = [0.25, 0.5, 1].map(w => { const o = overlay(w); return { positionSizePct: round2(w * 5), avgInResultsPct: o.avgInResultsPct, ...stats(o.curve) } })
console.log(`\n4. Growth holds all the money; each results buy is paid for by trimming Growth\n${''.padEnd(30)}${header}  avg in results%`)
for (const o of overlays) line(`${o.positionSizePct}% a results buy`, o, `  ${String(o.avgInResultsPct).padStart(8)}`)

// ---- 5. Growth that will not hold a stock that fell on its results ----
function growthAvoidingFalls(window: number, fall: number): Strategy {
  const needed = STOCK_MOMENTUM.lookbackDays + 2
  return {
    name: `Growth, leaving out stocks down ${fall * 100}% on results in the last ${window} sessions`,
    targets(ctx) {
      const index = new Map(ctx.indexBars('IDX:NIFTY 500', window + 20).map(b => [b.date, b.close]))
      const bars: Record<string, DailyBar[]> = {}
      for (const symbol of ctx.universe(UNIVERSE)) bars[symbol] = ctx.bars(symbol, needed)
      const ranked = rankByFactors(bars, ['momentum']).filter(r => {
        const reaction = earningsReaction(bars[r.symbol], ctx.resultsDates(r.symbol), index, window)
        return reaction == null || reaction > -fall
      })
      const picks = selectWithBuffer(ranked, ctx.holdings.keys(), PORTFOLIO_RULES.topN, PORTFOLIO_RULES.exitRank, undefined, cap)
      return Object.fromEntries(picks.map(symbol => [symbol, 1 / PORTFOLIO_RULES.topN]))
    },
  }
}
const AVOID = [{ window: 21, fall: 0.05 }, { window: 63, fall: 0.05 }, { window: 63, fall: 0.08 }]
const avoiding = AVOID.map(a => {
  const run = simulate(market, growthAvoidingFalls(a.window, a.fall), { start: START, end: END })
  return { key: `avoid-${a.fall * 100}pct-${a.window}d`, ...a, trades: run.trades.length, ...stats({ dates: run.dates, equity: run.equity }) }
})
console.log(`\n5. Growth that leaves out stocks that fell on results (against the market)\n${''.padEnd(30)}${header}  orders`)
line('Growth mode', stats(growth), `  ${String(growthRun.trades.length).padStart(6)}`)
for (const a of avoiding) line(a.key, a, `  ${String(a.trades).padStart(6)}`)

mkdirSync('research/results', { recursive: true })
writeFileSync(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(), from: START, to: END, universe: UNIVERSE,
  note: 'After tax, charges and 0.1% slippage a side. Growth reinvests dividends and earns 6% on idle cash. The results book is on prices without dividends; its idle cash earns 6% except where said. The split and the overlay are worked out from the two daily value curves and leave out the tax effect of moving money between them.',
  growth: stats(growth), perTrade, books, splits, overlays, growthAvoidingFalls: avoiding,
  byYear: Object.fromEntries(Object.keys(yearly.growth).map(y => [y, { growth: round1(yearly.growth[+y]), resultsNotWeak: round1(yearly.results[+y]), halfAndHalf: round1(yearly.half[+y]) }])),
}, null, 1))
