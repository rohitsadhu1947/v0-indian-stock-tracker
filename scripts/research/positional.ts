/**
 * Test positional entry rules: buy on a signal and hold for 2 to 12 weeks.
 *
 *   npm run research:positional
 *
 * Each rule is checked at every close for every stock in the 500 most traded
 * (as the list stood that month). A trade buys at the next session's average
 * price and sells at the close 10, 20, 40 or 60 sessions later. There is one
 * open trade per stock per rule. Results are after slippage and charges.
 *
 * The comparison is with buying every stock in the universe on the same
 * morning for the same number of sessions, so a rule gets no credit for a
 * rising market.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { lastAtOrBefore } from '@/lib/research/dates'
import { loadMarketCached } from '@/lib/research/load'
import type { StockSeries } from '@/lib/research/market'
import { calendarYearReturns, periodStats, slice, type Curve } from '@/lib/research/metrics'
import { indicators, meanAndT, tradeOutcome, type Indicators } from '@/lib/research/swing'
import { simulateSwingBook, type BookOptions, type Candidate } from '@/lib/research/swing-book'
import { simulate } from '@/lib/research/simulate'
import { factorPortfolio } from '@/lib/research/strategies'
import { monthly } from '@/lib/research/metrics'
import { PORTFOLIO_RULES } from '@/lib/portfolio/config'
import { SECTOR_BY_SYMBOL } from '@/lib/portfolio/sectors'

const START = 20110101
const UNIVERSE = 500
const HOLDS = [10, 20, 40, 60]
const PERIODS = [
  { key: '2011-2019', from: 20110101, to: 20191231 },
  { key: '2020-2022', from: 20200101, to: 20221231 },
  { key: '2023-now', from: 20230101, to: 99999999 },
]

interface Context { s: StockSeries; ind: Indicators; i: number; resultsJustOut: boolean; momentumCut: number; momentumCutBefore: number }
interface Rule { key: string; label: string; basis: string; fires: (c: Context) => boolean }

const move = (c: Context, sessions: number) => c.s.close[c.i] / c.s.close[c.i - sessions] - 1
const volume = (c: Context) => c.s.turnover[c.i] / c.ind.avgTurnover20[c.i]
function priorRange(c: Context, window: number): { high: number; low: number } {
  let high = 0, low = Infinity
  for (let j = c.i - window; j < c.i; j++) { high = Math.max(high, c.s.close[j]); low = Math.min(low, c.s.close[j]) }
  return { high, low }
}
function recentDelivery(c: Context): number {
  let sum = 0, n = 0
  for (let j = c.i - 4; j <= c.i; j++) if (!Number.isNaN(c.s.deliveryShare[j])) { sum += c.s.deliveryShare[j]; n++ }
  return n >= 3 ? sum / n : NaN
}

const RULES: Rule[] = [
  { key: 'results-jump', label: 'Jump on results', basis: 'Up 5% or more over the two sessions around results, on 1.5 times the usual turnover.', fires: c => c.resultsJustOut && move(c, 2) >= 0.05 && volume(c) >= 1.5 },
  { key: 'results-jump-big', label: 'Big jump on results', basis: 'Up 8% or more around results, on 3 times the usual turnover.', fires: c => c.resultsJustOut && move(c, 2) >= 0.08 && volume(c) >= 3 },
  { key: 'results-drop', label: 'Fall on results', basis: 'Down 5% or more over the two sessions around results. Expected to keep lagging.', fires: c => c.resultsJustOut && move(c, 2) <= -0.05 },
  { key: 'new-high', label: 'New 52-week high', basis: 'First close above the highest close of the last year.', fires: c => c.s.close[c.i] > c.ind.priorHigh252[c.i] && c.s.close[c.i - 1] <= c.ind.priorHigh252[c.i - 1] },
  { key: 'new-high-volume', label: 'New 52-week high on volume', basis: 'The same, on twice the usual turnover.', fires: c => c.s.close[c.i] > c.ind.priorHigh252[c.i] && c.s.close[c.i - 1] <= c.ind.priorHigh252[c.i - 1] && volume(c) >= 2 },
  {
    key: 'base-breakout', label: 'Breakout from a tight three-month range',
    basis: 'Close above the highest close of the last 63 sessions, when those sessions stayed within a 25% range, on 1.5 times the usual turnover.',
    fires: c => { const r = priorRange(c, 63); return c.s.close[c.i] > r.high && r.high / r.low - 1 <= 0.25 && volume(c) >= 1.5 },
  },
  { key: 'golden-cross', label: '50-day average crosses above the 200-day', basis: 'The golden cross.', fires: c => c.ind.sma50[c.i] > c.ind.sma200[c.i] && c.ind.sma50[c.i - 1] <= c.ind.sma200[c.i - 1] },
  {
    key: 'leader-recovers', label: 'Strong stock back above its 20-day average',
    basis: 'Up 50% or more over 12 months, above the 50-day average, closing back above the 20-day average after a close below it.',
    fires: c => c.ind.momentum[c.i] >= 0.5 && c.s.close[c.i] > c.ind.sma50[c.i] && c.s.close[c.i] > c.ind.sma20[c.i] && c.s.close[c.i - 1] < c.ind.sma20[c.i - 1],
  },
  { key: 'new-leader', label: 'Enters the top 5% on 12-month momentum', basis: 'The stock\'s 12-month return (skipping the last month) moves into the top 5% of the universe.', fires: c => c.ind.momentum[c.i] >= c.momentumCut && c.ind.momentum[c.i - 1] < c.momentumCutBefore },
  { key: 'delivery-buying', label: 'Heavy delivery buying over a week', basis: 'Delivery share over five sessions 1.5 times its 20-day average, with the price up over the week.', fires: c => recentDelivery(c) >= 1.5 * c.ind.avgDelivery20[c.i - 4] && move(c, 5) > 0.02 },
  { key: 'three-month-low-reversal', label: 'Bounce from a three-month low', basis: 'Closed at a 63-session low within the last five sessions and is now up 5% from it, above the 200-day average.', fires: c => { const r = priorRange(c, 63); let touched = false; for (let j = c.i - 5; j < c.i; j++) if (c.s.close[j] <= r.low * 1.001) touched = true; return touched && c.s.close[c.i] >= r.low * 1.05 && c.s.close[c.i] > c.ind.sma200[c.i] } },
]

const market = loadMarketCached()
const sessionIndex = new Map<number, number>()
market.sessions.forEach((d, i) => sessionIndex.set(d, i))
const members = new Map<number, Set<string>>()
for (const d of market.universeDates) members.set(d, new Set(market.universe.get(d)!.slice(0, UNIVERSE)))
const memberOn = (symbol: string, date: number): boolean => {
  const i = lastAtOrBefore(market.universeDates, date)
  return i >= 0 && members.get(market.universeDates[i])!.has(symbol)
}

// Pass 1: indicators, and each day's top 5% line for 12-month momentum
const prepared: Array<{ s: StockSeries; ind: Indicators; member: Uint8Array }> = []
const momentumByDate = new Map<number, number[]>()
for (const s of market.stocks.values()) {
  const ind = indicators(s)
  const member = new Uint8Array(s.dates.length)
  for (let i = 253; i < s.dates.length; i++) {
    if (s.dates[i] < START || !memberOn(s.symbol, s.dates[i])) continue
    member[i] = 1
    if (!Number.isNaN(ind.momentum[i])) { const list = momentumByDate.get(s.dates[i]) ?? []; list.push(ind.momentum[i]); momentumByDate.set(s.dates[i], list) }
  }
  prepared.push({ s, ind, member })
}
const momentumCut = new Map<number, number>()
for (const [date, list] of momentumByDate) { list.sort((a, b) => a - b); momentumCut.set(date, list[Math.ceil(list.length * 0.95) - 1]) }

// Pass 2: every possible entry (the baseline) and the entries each rule picks
interface Row { date: number; ret: number; excess: number }
const baseline = HOLDS.map(() => new Map<number, { sum: number; count: number }>())
const trades: Row[][][] = RULES.map(() => HOLDS.map(() => []))
// Every firing of each rule, keyed by the session to buy on, for the book test below
const candidates: Array<Map<number, Candidate[]>> = RULES.map(() => new Map())
for (const { s, ind, member } of prepared) {
  const busyUntil = RULES.map(() => HOLDS.map(() => -1))
  let pointer = 0
  for (let i = 253; i < s.dates.length - 1; i++) {
    if (!member[i] || sessionIndex.get(s.dates[i + 1]) !== sessionIndex.get(s.dates[i])! + 1) continue
    const cut = momentumCut.get(s.dates[i]), cutBefore = momentumCut.get(s.dates[i - 1])
    if (cut == null || cutBefore == null) continue
    while (pointer < s.resultsDates.length && s.resultsDates[pointer] < s.dates[i - 1]) pointer++
    const context: Context = { s, ind, i, momentumCut: cut, momentumCutBefore: cutBefore, resultsJustOut: pointer < s.resultsDates.length && s.resultsDates[pointer] <= s.dates[i] }
    const fired = RULES.map(rule => rule.fires(context))
    const entryDate = s.dates[i + 1]
    fired.forEach((on, g) => {
      if (on) candidates[g].set(entryDate, [...(candidates[g].get(entryDate) ?? []), { symbol: s.symbol, entryIndex: i + 1, ret5: ind.ret5[i], turnover: s.turnover[i] }])
    })
    HOLDS.forEach((hold, h) => {
      if (i + hold >= s.dates.length) return
      const outcome = tradeOutcome(s, i + 1, { key: `hold${hold}`, targetPct: null, stopPct: null, maxSessions: hold }, undefined, s.fill[i + 1])
      if (!outcome) return
      const day = baseline[h].get(entryDate) ?? { sum: 0, count: 0 }
      day.sum += outcome.ret; day.count++
      baseline[h].set(entryDate, day)
      fired.forEach((on, g) => {
        if (!on || i + 1 <= busyUntil[g][h]) return
        busyUntil[g][h] = outcome.exitIndex
        trades[g][h].push({ date: entryDate, ret: outcome.ret, excess: 0 })
      })
    })
  }
}
for (const perRule of trades) perRule.forEach((rows, h) => { for (const r of rows) { const d = baseline[h].get(r.date)!; r.excess = r.ret - d.sum / d.count } })

const pct = (x: number) => Math.round(x * 10000) / 100
function summarise(rows: Row[]) {
  if (rows.length < 30) return null
  const byDay = new Map<number, number[]>()
  for (const r of rows) byDay.set(r.date, [...(byDay.get(r.date) ?? []), r.excess])
  const edge = meanAndT([...byDay.values()].map(xs => xs.reduce((a, b) => a + b, 0) / xs.length))
  return {
    trades: rows.length, winRatePct: pct(rows.filter(r => r.ret > 0).length / rows.length),
    avgReturnPct: pct(rows.reduce((a, r) => a + r.ret, 0) / rows.length), avgExcessPct: pct(rows.reduce((a, r) => a + r.excess, 0) / rows.length),
    tStat: Math.round(edge.t * 100) / 100,
  }
}
const years = market.sessions.filter(d => d >= START).length / 250
const results = RULES.map((rule, g) => ({
  key: rule.key, label: rule.label, basis: rule.basis,
  holds: Object.fromEntries(HOLDS.map((hold, h) => [hold, {
    ...summarise(trades[g][h]), tradesPerMonth: Math.round(trades[g][h].length / years / 12 * 10) / 10,
    periods: Object.fromEntries(PERIODS.map(p => [p.key, summarise(trades[g][h].filter(r => r.date >= p.from && r.date <= p.to))])),
  }])),
}))
const baselineSummary = Object.fromEntries(HOLDS.map((hold, h) => { const days = [...baseline[h].values()].map(d => d.sum / d.count); return [hold, pct(days.reduce((a, b) => a + b, 0) / days.length)] }))

mkdirSync('research/results', { recursive: true })
writeFileSync('research/results/positional.json', JSON.stringify({
  generatedAt: new Date().toISOString(), from: START, to: market.sessions[market.sessions.length - 1], universe: UNIVERSE,
  note: 'Returns are after slippage and delivery charges. Excess is against every universe stock bought the same morning for the same hold. The t-statistic is on each entry day\'s average; holds overlap, so it overstates certainty for the longer holds.',
  baselineAvgReturnPct: baselineSummary, results,
}, null, 1))

console.log(`Every stock, average return after costs: ${HOLDS.map(h => `${h}d ${baselineSummary[h]}%`).join(', ')}`)
console.log(`${'Rule'.padEnd(44)}${'per mo'.padStart(7)}  ${HOLDS.map(h => `${h}d: ret / excess (t)`.padStart(24)).join('')}   60d excess by period`)
for (const r of results) {
  const cells = HOLDS.map(h => { const x: any = r.holds[h]; return (x.trades ? `${x.avgReturnPct.toFixed(1)} / ${x.avgExcessPct >= 0 ? '+' : ''}${x.avgExcessPct.toFixed(2)} (${x.tStat.toFixed(1)})` : 'too few').padStart(24) }).join('')
  const periods = PERIODS.map(p => { const x: any = (r.holds[60] as any).periods[p.key]; return x ? `${x.avgExcessPct >= 0 ? '+' : ''}${x.avgExcessPct.toFixed(1)} (${x.trades})` : 'n/a' }).join(' | ')
  console.log(`${r.label.slice(0, 43).padEnd(44)}${String((r.holds[20] as any).tradesPerMonth).padStart(7)}  ${cells}   ${periods}`)
}

// ---- The better rules as a book: limited positions, whole shares, charges, slippage and tax ----
const CAPITAL = 500000
const BOOK_PERIODS = [
  { key: 'full', from: START, to: Infinity }, { key: '2011-2019', from: START, to: 20191231 },
  { key: '2020-2022', from: 20200101, to: 20221231 }, { key: '2023-now', from: 20230101, to: Infinity },
]
const mostTradedFirst = (a: Candidate, b: Candidate) => b.turnover - a.turnover || a.symbol.localeCompare(b.symbol)
const merged = (keys: string[]) => {
  const out = new Map<number, Candidate[]>()
  for (const key of keys) for (const [date, list] of candidates[RULES.findIndex(r => r.key === key)]) {
    const have = out.get(date) ?? []
    out.set(date, [...have, ...list.filter(c => !have.some(h => h.symbol === c.symbol))])
  }
  return out
}
const BASE: Omit<BookOptions, 'payTax'> = { start: START, capital: CAPITAL, slots: 20, maxSessions: 60, stopPct: null, entry: 'vwap', priority: mostTradedFirst }
const BOOKS: Array<{ key: string; rules: string[]; note: string; options: Omit<BookOptions, 'payTax'> }> = [
  { key: 'results-jump', rules: ['results-jump'], note: '20 positions, 60 sessions', options: BASE },
  { key: 'results-jump-big', rules: ['results-jump-big'], note: '20 positions, 60 sessions', options: BASE },
  { key: 'results-jump-big-10', rules: ['results-jump-big'], note: '10 positions, 60 sessions', options: { ...BASE, slots: 10 } },
  { key: 'results-jump-big-stop10', rules: ['results-jump-big'], note: '20 positions, 60 sessions, 10% stop', options: { ...BASE, stopPct: 10 } },
  { key: 'results-jump-big-stop15', rules: ['results-jump-big'], note: '20 positions, 60 sessions, 15% stop', options: { ...BASE, stopPct: 15 } },
  { key: 'results-jump-big-stop20', rules: ['results-jump-big'], note: '20 positions, 60 sessions, 20% stop', options: { ...BASE, stopPct: 20 } },
  { key: 'results-jump-big-10-stop15', rules: ['results-jump-big'], note: '10 positions, 60 sessions, 15% stop', options: { ...BASE, slots: 10, stopPct: 15 } },
  { key: 'results-jump-big-40d', rules: ['results-jump-big'], note: '20 positions, 40 sessions', options: { ...BASE, maxSessions: 40 } },
  { key: 'results-jump-big-90d', rules: ['results-jump-big'], note: '20 positions, 90 sessions', options: { ...BASE, maxSessions: 90 } },
  { key: 'results-jump-40d', rules: ['results-jump'], note: '20 positions, 40 sessions', options: { ...BASE, maxSessions: 40 } },
  { key: 'results-jump-stop15', rules: ['results-jump'], note: '20 positions, 60 sessions, 15% stop', options: { ...BASE, stopPct: 15 } },
  { key: 'new-leader', rules: ['new-leader'], note: '20 positions, 60 sessions', options: BASE },
  { key: 'new-high', rules: ['new-high'], note: '20 positions, 60 sessions', options: BASE },
  { key: 'leader-recovers', rules: ['leader-recovers'], note: '20 positions, 60 sessions', options: BASE },
  { key: 'results-and-leaders', rules: ['results-jump', 'new-leader'], note: 'both rules, 20 positions, 60 sessions', options: BASE },
  { key: 'results-and-leaders-stop15', rules: ['results-jump', 'new-leader'], note: 'both rules, 20 positions, 60 sessions, 15% stop', options: { ...BASE, stopPct: 15 } },
]
const round1 = (x: number) => Math.round(x * 10) / 10
const stats = (curve: Curve) => Object.fromEntries(BOOK_PERIODS.map(p => {
  const st = periodStats(slice(curve, p.from, p.to))
  return [p.key, { cagrPct: round1(st.cagrPct), maxDrawdownPct: round1(st.maxDrawdownPct), sharpe: Math.round(st.sharpe * 100) / 100 }]
}))
const curves = new Map<string, Curve>()
const books = BOOKS.map(b => {
  const list = merged(b.rules)
  const before = simulateSwingBook(market, list, { ...b.options, payTax: false })
  const after = simulateSwingBook(market, list, { ...b.options, payTax: true })
  curves.set(b.key, after.curve)
  return {
    key: b.key, note: b.note, beforeTax: stats(before.curve), afterTax: stats(after.curve),
    yearsAfterTax: Object.fromEntries(Object.entries(calendarYearReturns(after.curve)).map(([y, r]) => [y, round1(r)])),
    tradesPerYear: Math.round(after.trades / years), winRatePct: round1(after.wins / after.trades * 100),
    signalsSkippedPct: round1(after.skipped / (after.skipped + after.trades) * 100), avgInvestedPct: round1(after.avgInvested * 100),
  }
})
const index = market.indices.get('IDX:NIFTY 500')!
const indexCurve: Curve = { dates: [], equity: [] }
index.dates.forEach((d, i) => { if (d >= START) { indexCurve.dates.push(d); indexCurve.equity.push(index.close[i]) } })

const saved = JSON.parse(readFileSync('research/results/positional.json', 'utf8'))
writeFileSync('research/results/positional.json', JSON.stringify({
  ...saved,
  bookNote: 'Each rule run as a book of Rs 5 lakh: limited positions, whole shares, delivery charges, 0.1% slippage a side, capital gains tax paid each March. Idle cash earns nothing. NIFTY 500 is the price index, without dividends, costs or tax.',
  nifty500: stats(indexCurve), books,
}, null, 1))

const cell = (x: any) => BOOK_PERIODS.map(p => `${String(x[p.key].cagrPct).padStart(5)}% (${String(x[p.key].maxDrawdownPct).padStart(5)})`).join('  ')
console.log(`\n${'After tax: growth a year (worst fall)'.padEnd(30)}${BOOK_PERIODS.map(p => p.key.padEnd(16)).join('')}  Sharpe  trades/yr  win%  skipped%  invested%`)
console.log(`${'NIFTY 500 index'.padEnd(28)}  ${cell(stats(indexCurve))}`)
for (const b of books) console.log(`${b.key.padEnd(28)}  ${cell(b.afterTax)}  ${String((b.afterTax as any).full.sharpe).padStart(6)}  ${String(b.tradesPerYear).padStart(9)}  ${String(b.winRatePct).padStart(4)}  ${String(b.signalsSkippedPct).padStart(8)}  ${String(b.avgInvestedPct).padStart(9)}`)
console.log('\nBy calendar year, after tax:')
for (const b of books.filter(x => ['results-jump', 'results-jump-big', 'new-leader', 'results-and-leaders'].includes(x.key))) console.log(`${b.key.padEnd(22)} ${Object.entries(b.yearsAfterTax).map(([y, r]) => `${String(y).slice(2)}:${r}`).join(' ')}`)

// ---- How much the results rule moves with the Monthly Plan's Growth mode ----
const growthRun = simulate(market, factorPortfolio({
  factors: ['momentum'], exitRank: PORTFOLIO_RULES.exitRank, maxPerSector: PORTFOLIO_RULES.maxPerSector, sectorOf: symbol => SECTOR_BY_SYMBOL[symbol],
}), { start: 20110131, end: market.sessions[market.sessions.length - 1] })
const growth = monthly({ dates: growthRun.dates, equity: growthRun.equity })
function overlapWith(key: string) {
  const book = monthly(curves.get(key)!)
  const at = new Map(book.dates.map((d, i) => [d, i]))
  const a: number[] = [], b: number[] = []
  for (let i = 1; i < growth.dates.length; i++) {
    const j = at.get(growth.dates[i]), k = at.get(growth.dates[i - 1])
    if (j == null || k == null) continue
    a.push(growth.equity[i] / growth.equity[i - 1] - 1)
    b.push(book.equity[j] / book.equity[k] - 1)
  }
  const mean = (xs: number[]) => xs.reduce((x, y) => x + y, 0) / xs.length
  const ma = mean(a), mb = mean(b)
  const cov = mean(a.map((x, i) => (x - ma) * (b[i] - mb)))
  const sd = (xs: number[], m: number) => Math.sqrt(mean(xs.map(x => (x - m) ** 2)))
  // Half the money in each, put back to half and half every month
  const blend: Curve = { dates: [0], equity: [1] }
  const only = (xs: number[]): Curve => ({ dates: [0, ...xs.map((_, i) => i + 1)], equity: xs.reduce((acc, r) => [...acc, acc[acc.length - 1] * (1 + r)], [1]) })
  a.forEach((r, i) => { blend.dates.push(i + 1); blend.equity.push(blend.equity[i] * (1 + (r + b[i]) / 2)) })
  const describe = (c: Curve) => {
    let peak = 0, fall = 0
    for (const e of c.equity) { peak = Math.max(peak, e); fall = Math.min(fall, e / peak - 1) }
    return { cagrPct: round1((Math.pow(c.equity[c.equity.length - 1], 12 / (c.equity.length - 1)) - 1) * 100), maxMonthlyDrawdownPct: round1(fall * 100) }
  }
  const bothDown = a.filter((x, i) => x < 0 && b[i] < 0).length, growthDown = a.filter(x => x < 0).length
  return {
    months: a.length, correlation: Math.round(cov / (sd(a, ma) * sd(b, mb)) * 100) / 100,
    whenGrowthFellBookFellPct: round1(bothDown / growthDown * 100),
    growth: describe(only(a)), book: describe(only(b)), halfAndHalf: describe(blend),
  }
}
const overlap = { 'results-jump-big': overlapWith('results-jump-big'), 'results-jump-big-stop15': overlapWith('results-jump-big-stop15') }
const withBooks = JSON.parse(readFileSync('research/results/positional.json', 'utf8'))
writeFileSync('research/results/positional.json', JSON.stringify({
  ...withBooks,
  overlapNote: 'Monthly returns of the results book against the Monthly Plan\'s Growth mode, both after tax. Drawdowns here are on month-end values, so they are shallower than the daily figures above.',
  overlapWithGrowth: overlap,
}, null, 1))
console.log('\nAgainst Growth mode, month by month:')
for (const [key, o] of Object.entries(overlap)) {
  console.log(`${key.padEnd(26)} correlation ${o.correlation}, in months Growth fell the book also fell ${o.whenGrowthFellBookFellPct}% of the time. ` +
    `Growth ${o.growth.cagrPct}% (${o.growth.maxMonthlyDrawdownPct}), book ${o.book.cagrPct}% (${o.book.maxMonthlyDrawdownPct}), half and half ${o.halfAndHalf.cagrPct}% (${o.halfAndHalf.maxMonthlyDrawdownPct})`)
}
