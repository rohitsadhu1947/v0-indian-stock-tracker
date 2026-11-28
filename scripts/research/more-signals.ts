/**
 * Four more ideas, tested on data already in the local stores.
 *
 *   npm run research:more-signals
 *
 * 1. Overnight only: buy index futures at the close, sell at the next open.
 * 2. Before results: buy a few sessions before a results date that was
 *    announced in advance, sell at the close before it.
 * 3. Results jumps on smaller stocks: the tested rule on the stocks ranked
 *    501 to 1000 by turnover.
 * 4. Splits, bonuses and buybacks: buy when the date is listed, sell at the
 *    close before it; and what the stock does in the 20 sessions after.
 *
 * Share trades pay 0.45% for the round trip (0.85% for the smaller stocks).
 * "Excess" is against the average universe stock over the same days.
 */
import { mkdirSync, writeFileSync } from 'fs'
import { DatabaseSync } from 'node:sqlite'
import { lastAtOrBefore } from '@/lib/research/dates'
import { loadMarketCached } from '@/lib/research/load'
import { indicators, meanAndT } from '@/lib/research/swing'
import { periodStats } from '@/lib/research/metrics'
import { simulate } from '@/lib/research/simulate'
import { factorPortfolio } from '@/lib/research/strategies'
import { MODES, PORTFOLIO_RULES, type RiskMode } from '@/lib/portfolio/config'
import { SECTOR_BY_SYMBOL } from '@/lib/portfolio/sectors'

const START = 20110101
const PERIODS = [{ key: '2011-2019', from: 20110101, to: 20191231 }, { key: '2020-2022', from: 20200101, to: 20221231 }, { key: '2023-now', from: 20230101, to: 99999999 }]
const round2 = (x: number) => Math.round(x * 100) / 100
const pct = (x: number) => Math.round(x * 10000) / 100
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const out: Record<string, unknown> = {}

// ---- 1. Overnight in index futures ----
const fo = new DatabaseSync('data/fo.db', { readOnly: true })
function overnight(symbol: string) {
  const rows = fo.prepare('select date, expiry, open, close, settle from fo_futures where symbol = ? and date >= ? order by date, expiry').all(symbol, START) as Array<{ date: number; expiry: number; open: number | null; close: number; settle: number | null }>
  const byDate = new Map<number, typeof rows>()
  for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r])
  const dates = [...byDate.keys()].sort((a, b) => a - b)
  const nights: Array<{ date: number; night: number; nightFromSettle: number; day: number }> = []
  for (let i = 0; i + 1 < dates.length; i++) {
    // The nearest contract that still trades tomorrow
    const today = byDate.get(dates[i])!.find(r => r.expiry > dates[i])
    const next = today && byDate.get(dates[i + 1])!.find(r => r.expiry === today.expiry)
    if (!today || !next || !(next.open! > 0) || !(today.close > 0) || !(today.open! > 0)) continue
    nights.push({ date: dates[i + 1], night: next.open! / today.close - 1, nightFromSettle: next.open! / (today.settle || today.close) - 1, day: next.close / next.open! - 1 })
  }
  // Round trip in index futures: about 0.03% in charges and tax, plus a point of slippage each way
  const COST = 0.0005
  const describe = (xs: typeof nights) => {
    const net = xs.map(x => x.night - COST)
    let value = 1, peak = 1, fall = 0
    for (const r of net) { value *= 1 + r; peak = Math.max(peak, value); fall = Math.min(fall, value / peak - 1) }
    const years = xs.length / 250
    return {
      nights: xs.length, avgNightPct: pct(mean(xs.map(x => x.night))) , tStat: round2(meanAndT(xs.map(x => x.night)).t), avgNightFromSettlePct: pct(mean(xs.map(x => x.nightFromSettle))),
      avgDayPct: pct(mean(xs.map(x => x.day))), nightsUpPct: round2(xs.filter(x => x.night > 0).length / xs.length * 100),
      afterCostsAYearPct: round2((value ** (1 / years) - 1) * 100), worstFallPct: round2(fall * 100),
      beforeCostsAYearPct: round2((xs.reduce((v, x) => v * (1 + x.night), 1) ** (1 / years) - 1) * 100),
      dayOnlyAYearPct: round2((xs.reduce((v, x) => v * (1 + x.day), 1) ** (1 / years) - 1) * 100),
    }
  }
  return { full: describe(nights), ...Object.fromEntries(PERIODS.map(p => [p.key, describe(nights.filter(x => x.date >= p.from && x.date <= p.to))])) }
}
const night = { NIFTY: overnight('NIFTY'), BANKNIFTY: overnight('BANKNIFTY') }
out.overnight = { note: 'Near-month futures, close to next open, one times the contract value. Costs 0.05% a round trip.', ...night }
console.log('1. Index futures held overnight only (close to next open)')
for (const [symbol, r] of Object.entries(night)) for (const [period, x] of Object.entries(r) as Array<[string, any]>) {
  console.log(`${symbol.padEnd(10)}${period.padEnd(11)} nights ${String(x.nights).padStart(5)}  avg night ${x.avgNightPct}% (t ${x.tStat}), from settle ${x.avgNightFromSettlePct}%  avg day ${x.avgDayPct}%  a year: before costs ${x.beforeCostsAYearPct}%, after ${x.afterCostsAYearPct}% (worst fall ${x.worstFallPct}%), day only ${x.dayOnlyAYearPct}%`)
}

// ---- Shares: shared pieces ----
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
const dayRet = new Float64Array(market.sessions.length), dayN = new Float64Array(market.sessions.length)
const fillRet = new Float64Array(market.sessions.length)
for (const s of market.stocks.values()) for (let i = 1; i < s.dates.length; i++) {
  if (s.dates[i] < START - 10000 || rank(s.symbol, s.dates[i]) > 500) continue
  const k = sessionIndex.get(s.dates[i])!
  if (sessionIndex.get(s.dates[i - 1]) !== k - 1) continue
  dayRet[k] += s.close[i] / s.close[i - 1] - 1; fillRet[k] += s.close[i] / s.fill[i] - 1; dayN[k]++
}
for (let k = 0; k < dayRet.length; k++) if (dayN[k]) { dayRet[k] /= dayN[k]; fillRet[k] /= dayN[k] }
/** What the average stock made if bought through session `e` and sold at the close of session `x`. */
const marketOver = (e: number, x: number): number => { let v = 1 + fillRet[e]; for (let k = e + 1; k <= x; k++) v *= 1 + dayRet[k]; return v - 1 }

interface Trade { date: number; ret: number; excess: number }
function summarise(rows: Trade[]) {
  if (rows.length < 30) return { trades: rows.length }
  const byDay = new Map<number, number[]>()
  for (const r of rows) byDay.set(r.date, [...(byDay.get(r.date) ?? []), r.excess])
  return {
    trades: rows.length, winRatePct: round2(rows.filter(r => r.ret > 0).length / rows.length * 100), avgReturnPct: pct(mean(rows.map(r => r.ret))),
    avgExcessPct: pct(mean(rows.map(r => r.excess))), tStat: round2(meanAndT([...byDay.values()].map(mean)).t),
  }
}
const withPeriods = (rows: Trade[]) => ({ ...summarise(rows), periods: Object.fromEntries(PERIODS.map(p => [p.key, summarise(rows.filter(r => r.date >= p.from && r.date <= p.to))])) })
const show = (label: string, r: any) => console.log(`${label.padEnd(52)}${String(r.trades).padStart(6)}${String(r.winRatePct ?? '').padStart(7)}${String(r.avgReturnPct ?? '').padStart(8)}${String(r.avgExcessPct ?? '').padStart(9)}${String(r.tStat ?? '').padStart(7)}   ${PERIODS.map(p => { const x = r.periods[p.key]; return x.avgExcessPct == null ? `n/a (${x.trades})` : `${x.avgExcessPct >= 0 ? '+' : ''}${x.avgExcessPct} (${x.trades})` }).join(' | ')}`)
const head = (title: string) => console.log(`\n${title}\n${''.padEnd(52)}${'trades'.padStart(6)}${'win%'.padStart(7)}${'avg%'.padStart(8)}${'excess%'.padStart(9)}${'t'.padStart(7)}   excess by period (trades)`)
/** Buy through session index `e` of the stock, sell at the close of index `x`. */
function trade(s: { dates: Int32Array; fill: Float64Array; close: Float64Array }, e: number, x: number, cost: number): Trade | null {
  if (e < 1 || x >= s.dates.length || x < e || !(s.fill[e] > 0)) return null
  const ke = sessionIndex.get(s.dates[e])!, kx = sessionIndex.get(s.dates[x])!
  if (kx - ke !== x - e) return null   // the stock missed sessions in between
  const ret = s.close[x] / s.fill[e] - 1 - cost
  return { date: s.dates[e], ret, excess: ret - (marketOver(ke, kx) - 0.0045) }
}

// ---- 2. Before results ----
const store = new DatabaseSync('data/market.db', { readOnly: true })
const announced = new Map<string, number>()
for (const r of store.prepare('select symbol, date, first_seen from results_dates').all() as Array<{ symbol: string; date: number; first_seen: number }>) announced.set(`${r.symbol}|${r.date}`, r.first_seen)
const before: Record<string, Trade[]> = { '10': [], '5': [], '3': [], '1': [] }
const through: Trade[] = []
for (const s of market.stocks.values()) for (const d of s.resultsDates) {
  if (d < START) continue
  const seen = announced.get(`${s.symbol}|${d}`)
  const i = lastAtOrBefore(s.dates, d - 1)   // the last session before the results date
  if (seen == null || i < 30 || rank(s.symbol, s.dates[i]) > 500) continue
  for (const k of [10, 5, 3, 1]) {
    const e = i - k + 1
    if (e < 1 || s.dates[e - 1] < seen) continue   // the date must have been listed before the day we buy
    const t = trade(s, e, i, 0.0045)
    if (t) before[String(k)].push(t)
  }
  // Held through the results: bought 3 sessions before, sold 2 sessions after
  const e = i - 2
  if (e >= 1 && s.dates[e - 1] >= seen) { const t = trade(s, e, i + 3, 0.0045); if (t) through.push(t) }
}
const beforeResults = { ...Object.fromEntries(Object.entries(before).map(([k, rows]) => [`${k}-sessions-before`, withPeriods(rows)])), 'through-results': withPeriods(through) }
out.beforeResults = beforeResults
head('2. Bought before a results date, sold at the close before it (top 500, after costs)')
for (const [k, r] of Object.entries(beforeResults)) show(k, r)

// ---- 3. Results jumps on smaller stocks ----
const jumps: Record<string, Trade[]> = { 'rank 1-500': [], 'rank 501-1000': [], 'rank 501-1000, not weak': [], 'rank 501-750': [], 'rank 751-1000': [] }
const prepared = [...market.stocks.values()].map(s => ({ s, ind: indicators(s) }))
const momentumBy = new Map<number, number[]>()
for (const { s, ind } of prepared) for (let i = 253; i < s.dates.length; i++) if (s.dates[i] >= START && !Number.isNaN(ind.momentum[i]) && rank(s.symbol, s.dates[i]) <= 1000) momentumBy.set(s.dates[i], [...(momentumBy.get(s.dates[i]) ?? []), ind.momentum[i]])
for (const list of momentumBy.values()) list.sort((a, b) => a - b)
let smallTurnover: number[] = []
for (const { s, ind } of prepared) {
  let pointer = 0, busy = -1
  for (let i = 253; i + 60 < s.dates.length; i++) {
    if (s.dates[i] < START) continue
    while (pointer < s.resultsDates.length && s.resultsDates[pointer] < s.dates[i - 1]) pointer++
    if (!(pointer < s.resultsDates.length && s.resultsDates[pointer] <= s.dates[i])) continue
    if (!(s.close[i] / s.close[i - 2] - 1 >= 0.08) || !(s.turnover[i] / ind.avgTurnover20[i] >= 3) || i + 1 <= busy) continue
    const r = rank(s.symbol, s.dates[i])
    if (r > 1000) continue
    const small = r > 500
    const t = trade(s, i + 1, i + 60, small ? 0.0085 : 0.0045)
    if (!t) continue
    busy = i + 60
    const sorted = momentumBy.get(s.dates[i])!
    const weak = sorted.filter(x => x < ind.momentum[i]).length / (sorted.length - 1) < 0.2
    if (!small) jumps['rank 1-500'].push(t)
    else {
      jumps['rank 501-1000'].push(t)
      if (!weak) jumps['rank 501-1000, not weak'].push(t)
      jumps[r <= 750 ? 'rank 501-750' : 'rank 751-1000'].push(t)
      smallTurnover.push(ind.avgTurnover20[i])
    }
  }
}
smallTurnover = smallTurnover.sort((a, b) => a - b)
const smallJumps = Object.fromEntries(Object.entries(jumps).map(([k, rows]) => [k, withPeriods(rows)]))
out.resultsJumpsBySize = { note: 'Results jump of 8% on three times the turnover, held 60 sessions. Stocks ranked past 500 pay 0.85% for the round trip. Excess is against the average top-500 stock.', medianTurnoverCrOfSmallStocks: round2(smallTurnover[smallTurnover.length >> 1] / 1e7), ...smallJumps }
head(`3. Results jumps by size of stock, held 60 sessions (smaller stocks trade about Rs ${round2(smallTurnover[smallTurnover.length >> 1] / 1e7)} crore a day)`)
for (const [k, r] of Object.entries(smallJumps)) show(k, r)

// ---- 4. Splits, bonuses and buybacks ----
const KINDS: Array<{ key: string; test: RegExp }> = [{ key: 'split', test: /SPL/ }, { key: 'bonus', test: /BONUS/ }, { key: 'buyback', test: /BUY\s?-?BACK/ }]
const actions: Record<string, { runUp: Trade[]; after: Trade[] }> = Object.fromEntries(KINDS.map(k => [k.key, { runUp: [], after: [] }]))
for (const a of store.prepare('select symbol, ex_date, purpose, first_seen from corporate_actions_raw where ex_date >= ?').all(START) as Array<{ symbol: string; ex_date: number; purpose: string; first_seen: number }>) {
  const kind = KINDS.find(k => k.test.test(a.purpose.toUpperCase()))
  const s = market.stocks.get(a.symbol)
  if (!kind || !s) continue
  const x = lastAtOrBefore(s.dates, a.ex_date - 1)             // last session before the ex-date
  const seenAt = lastAtOrBefore(s.dates, a.first_seen)         // the session the date was listed
  if (x < 30 || seenAt < 0 || rank(a.symbol, s.dates[x]) > 500) continue
  if (x - seenAt >= 3) { const t = trade(s, seenAt + 1, x, 0.0045); if (t) actions[kind.key].runUp.push(t) }
  const t = trade(s, x + 1, x + 20, 0.0045)
  if (t) actions[kind.key].after.push(t)
}
const corporate = Object.fromEntries(Object.entries(actions).flatMap(([k, v]) => [[`${k}: listed to the day before`, withPeriods(v.runUp)], [`${k}: 20 sessions from the ex-date`, withPeriods(v.after)]]))
out.corporateActions = corporate
head('4. Splits, bonuses and buybacks (top 500, after costs)')
for (const [k, r] of Object.entries(corporate)) show(k, r)

// ---- 5. When in the day to trade ----
// Shares close below their average price for the day more often than not. Does buying at the close help?
let n = 0, closeOverAverage = 0, closeOverOpen = 0, overnight2 = 0
for (const s of market.stocks.values()) for (let i = 1; i < s.dates.length; i++) {
  if (s.dates[i] < START || rank(s.symbol, s.dates[i]) > 500) continue
  n++; closeOverAverage += s.close[i] / s.fill[i] - 1; closeOverOpen += s.close[i] / s.open[i] - 1; overnight2 += s.open[i] / s.close[i - 1] - 1
}
const timing: Record<string, unknown> = { stockDays: n, closeAgainstDayAveragePct: pct(closeOverAverage / n), openToClosePct: pct(closeOverOpen / n), closeToNextOpenPct: pct(overnight2 / n) }
console.log(`\n5. Timing. Top-500 stock, average day: close against the day's average price ${timing.closeAgainstDayAveragePct}%, open to close ${timing.openToClosePct}%, close to next open ${timing.closeToNextOpenPct}%`)

// Stock futures overnight: real traded prices, lower costs than shares
const stockNights = new Map<number, number[]>()
{
  const rows = fo.prepare('select symbol, date, expiry, open, close from fo_futures where is_index = 0 and date >= ? order by symbol, expiry, date').all(START) as Array<{ symbol: string; date: number; expiry: number; open: number | null; close: number }>
  const near = new Map<string, number>()   // symbol|date -> nearest expiry after the date
  for (const r of rows) if (r.expiry > r.date) { const k = `${r.symbol}|${r.date}`; if (!near.has(k) || r.expiry < near.get(k)!) near.set(k, r.expiry) }
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i]
    if (a.symbol !== b.symbol || a.expiry !== b.expiry || near.get(`${a.symbol}|${a.date}`) !== a.expiry || !(b.open! > 0) || !(a.close > 0)) continue
    const r = b.open! / a.close - 1
    if (Math.abs(r) < 0.25) stockNights.set(b.date, [...(stockNights.get(b.date) ?? []), r])
  }
}
const basket = [...stockNights.entries()].sort((a, b) => a[0] - b[0]).map(([date, xs]) => ({ date, r: mean(xs) }))
const STOCK_FUTURES_COST = 0.001
const nightStats = (xs: typeof basket) => ({ nights: xs.length, avgNightPct: pct(mean(xs.map(x => x.r))), tStat: round2(meanAndT(xs.map(x => x.r)).t), afterCostsPct: pct(mean(xs.map(x => x.r)) - STOCK_FUTURES_COST) })
timing.stockFuturesOvernight = { note: 'Every stock future, near month, close to next open, equal amounts. Costs 0.1% a round trip.', full: nightStats(basket), ...Object.fromEntries(PERIODS.map(p => [p.key, nightStats(basket.filter(x => x.date >= p.from && x.date <= p.to))])) }
console.log(`Stock futures overnight, all stocks in equal amounts: ${Object.entries(timing.stockFuturesOvernight as any).filter(([k]) => k !== 'note').map(([k, x]: any) => `${k} ${x.avgNightPct}% a night (t ${x.tStat}), after costs ${x.afterCostsPct}%`).join(' | ')}`)

// Results buys: the same trades with the entry and exit at different times of day
const jumpTiming: Record<string, Trade[]> = { 'buy at day average, sell at close (as tested)': [], 'buy at close, sell at close': [], 'buy at close, sell at day average': [], 'buy at day average, sell at day average': [] }
for (const { s, ind } of prepared) {
  let pointer = 0, busy = -1
  for (let i = 253; i + 60 < s.dates.length; i++) {
    if (s.dates[i] < START) continue
    while (pointer < s.resultsDates.length && s.resultsDates[pointer] < s.dates[i - 1]) pointer++
    if (!(pointer < s.resultsDates.length && s.resultsDates[pointer] <= s.dates[i])) continue
    if (!(s.close[i] / s.close[i - 2] - 1 >= 0.08) || !(s.turnover[i] / ind.avgTurnover20[i] >= 3) || i + 1 <= busy || rank(s.symbol, s.dates[i]) > 500) continue
    const base = trade(s, i + 1, i + 60, 0.0045)
    if (!base) continue
    busy = i + 60
    const e = i + 1, x = i + 60
    const at = (buy: number, sell: number): Trade => ({ date: base.date, ret: sell / buy - 1 - 0.0045, excess: sell / buy - 1 - 0.0045 - (base.ret - base.excess) })
    jumpTiming['buy at day average, sell at close (as tested)'].push(base)
    jumpTiming['buy at close, sell at close'].push(at(s.close[e], s.close[x]))
    jumpTiming['buy at close, sell at day average'].push(at(s.close[e], s.fill[x]))
    jumpTiming['buy at day average, sell at day average'].push(at(s.fill[e], s.fill[x]))
  }
}
timing.resultsBuys = Object.fromEntries(Object.entries(jumpTiming).map(([k, rows]) => [k, withPeriods(rows)]))
head('Results buys, top 500, 60 sessions: the same trades at different times of day')
for (const [k, r] of Object.entries(timing.resultsBuys as any)) show(k, r)

// The Monthly Plan: sales at the day's average price as now, purchases at the close
const planTiming: Record<string, unknown> = {}
console.log('\nMonthly Plan, after charges and tax: buys at the day average (as now) against buys at the close')
for (const mode of Object.keys(MODES) as RiskMode[]) {
  const strategy = factorPortfolio({ factors: MODES[mode].factors, exitRank: PORTFOLIO_RULES.exitRank, maxPerSector: PORTFOLIO_RULES.maxPerSector, sectorOf: sym => SECTOR_BY_SYMBOL[sym] })
  const run = (buyAtClose: boolean) => { const r = simulate(market, strategy, { start: 20110131, end: market.sessions[market.sessions.length - 1], buyAtClose }); const st = periodStats({ dates: r.dates, equity: r.equity }); return { cagrPct: round2(st.cagrPct), maxDrawdownPct: round2(st.maxDrawdownPct) } }
  const asNow = run(false), atClose = run(true)
  planTiming[mode] = { asNow, buysAtClose: atClose }
  console.log(`${mode.padEnd(11)} as now ${asNow.cagrPct}% a year (worst fall ${asNow.maxDrawdownPct}%)   buys at the close ${atClose.cagrPct}% (${atClose.maxDrawdownPct}%)`)
}
timing.monthlyPlan = planTiming
out.timing = timing

mkdirSync('research/results', { recursive: true })
writeFileSync('research/results/more-signals.json', JSON.stringify({ generatedAt: new Date().toISOString(), from: START, to: market.sessions[market.sessions.length - 1], ...out }, null, 1))
