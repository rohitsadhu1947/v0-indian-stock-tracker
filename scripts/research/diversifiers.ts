/**
 * A first look at whether other assets would steady the Monthly Plan.
 *
 *   npm run research:diversifiers
 *
 * 1. How gold, government bonds, a US fund and the value, dividend and
 *    low-volatility indices moved against Growth mode, month by month.
 * 2. A rough multi-asset trend sleeve: each month, hold each fund that is
 *    above its 10-month average and keep the rest in cash.
 * 3. Growth mixed with that sleeve.
 *
 * Rough on purpose: monthly prices, a flat 0.2% cost on what is traded, cash
 * at 6%, and no tax on the sleeve. Growth is after tax. A real test would
 * need the tax on gold and bond funds, which is different from shares.
 */
import { mkdirSync, writeFileSync } from 'fs'
import { loadAdjustedSeries, buildSegments, loadSymbolMap } from '@/lib/market-data/series'
import { openStore } from '@/lib/market-data/store'
import { loadMarketCached } from '@/lib/research/load'
import { simulate } from '@/lib/research/simulate'
import { factorPortfolio } from '@/lib/research/strategies'
import { PORTFOLIO_RULES } from '@/lib/portfolio/config'
import { SECTOR_BY_SYMBOL } from '@/lib/portfolio/sectors'

const START = 20110131
const CASH = 0.06 / 12
const COST = 0.002
type Monthly = Map<number, number>   // YYYYMM -> month-end value

const monthEnds = (dates: ArrayLike<number>, values: ArrayLike<number>): Monthly => {
  const out: Monthly = new Map()
  for (let i = 0; i < dates.length; i++) out.set(Math.floor(dates[i] / 100), values[i])
  return out
}

const market = loadMarketCached()
const end = market.sessions[market.sessions.length - 1]
const growthRun = simulate(market, factorPortfolio({
  factors: ['momentum'], exitRank: PORTFOLIO_RULES.exitRank, maxPerSector: PORTFOLIO_RULES.maxPerSector, sectorOf: s => SECTOR_BY_SYMBOL[s],
}), { start: START, end })
const growth = monthEnds(growthRun.dates, growthRun.equity)

const db = openStore()
const segments = buildSegments(db, loadSymbolMap(db))
const fund = (symbol: string): Monthly => {
  const bars = loadAdjustedSeries(db, symbol, segments.get(symbol) ?? [])
  return monthEnds(bars.map(b => b.date), bars.map(b => b.close * b.totalReturnFactor / b.priceFactor))  // close is already split-adjusted
}
const index = (names: string[]): Monthly => {
  const rows = db.prepare(`select date, close from index_bars where name in (${names.map(() => '?').join(',')}) order by date`).all(...names) as Array<{ date: number; close: number }>
  return monthEnds(rows.map(r => r.date), rows.map(r => r.close))
}
const ASSETS: Array<{ key: string; label: string; series: Monthly }> = [
  { key: 'nifty500', label: 'NIFTY 500 index', series: index(['CNX 500', 'Nifty 500']) },
  { key: 'value20', label: 'NIFTY 50 Value 20 index', series: index(['Nifty50 Value 20']) },
  { key: 'dividend', label: 'NIFTY Dividend Opportunities 50', series: index(['CNX Dividend Oppt', 'Nifty Div Opps 50']) },
  { key: 'lowvol30', label: 'NIFTY 100 Low Volatility 30', series: index(['NIFTY100 LowVol30']) },
  { key: 'NIFTYBEES', label: 'NIFTY 50 fund (NIFTYBEES)', series: fund('NIFTYBEES') },
  { key: 'JUNIORBEES', label: 'Next 50 fund (JUNIORBEES)', series: fund('JUNIORBEES') },
  { key: 'GOLDBEES', label: 'Gold fund (GOLDBEES)', series: fund('GOLDBEES') },
  { key: 'gilt', label: 'Government bond fund (LICNETFGSC)', series: fund('LICNETFGSC') },
  { key: 'MON100', label: 'US Nasdaq 100 fund (MON100)', series: fund('MON100') },
]
db.close()

const months = [...growth.keys()].sort((a, b) => a - b)
const ret = (s: Monthly, m: number, prev: number): number | null => (s.has(m) && s.has(prev) ? s.get(m)! / s.get(prev)! - 1 : null)
const growthRet = new Map<number, number>()
for (let i = 1; i < months.length; i++) growthRet.set(months[i], ret(growth, months[i], months[i - 1])!)
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
function correlation(a: number[], b: number[]): number {
  const ma = mean(a), mb = mean(b)
  const cov = mean(a.map((x, i) => (x - ma) * (b[i] - mb)))
  return cov / Math.sqrt(mean(a.map(x => (x - ma) ** 2)) * mean(b.map(x => (x - mb) ** 2)))
}
const round1 = (x: number) => Math.round(x * 10) / 10
const round2 = (x: number) => Math.round(x * 100) / 100
function describe(returns: number[]) {
  let value = 1, peak = 1, fall = 0
  for (const r of returns) { value *= 1 + r; peak = Math.max(peak, value); fall = Math.min(fall, value / peak - 1) }
  const m = mean(returns), sd = Math.sqrt(mean(returns.map(r => (r - m) ** 2)))
  return { yearPct: round1((value ** (12 / returns.length) - 1) * 100), worstFallPct: round1(fall * 100), sharpe: round2((m - CASH) / sd * Math.sqrt(12)) }
}

// ---- 1. Each asset against Growth ----
const assetRows = ASSETS.map(a => {
  const g: number[] = [], x: number[] = [], used: number[] = []
  for (let i = 1; i < months.length; i++) { const r = ret(a.series, months[i], months[i - 1]); if (r != null && Math.abs(r) < 0.6) { g.push(growthRet.get(months[i])!); x.push(r); used.push(months[i]) } }
  const worst = g.map((r, i) => ({ r, i })).sort((p, q) => p.r - q.r).slice(0, Math.max(5, Math.round(g.length * 0.1)))
  return {
    key: a.key, label: a.label, from: used[0], months: x.length, ...describe(x), growthSameMonths: describe(g),
    correlationWithGrowth: round2(correlation(g, x)),
    inGrowthWorstMonths: { count: worst.length, growthAvgPct: round1(mean(worst.map(w => w.r)) * 100), assetAvgPct: round1(mean(worst.map(w => x[w.i])) * 100) },
  }
})
console.log('1. Against Growth mode, month by month (index figures leave out dividends)')
console.log(`${'Asset'.padEnd(36)}${'from'.padStart(8)}${'a year%'.padStart(9)}${'fall%'.padStart(8)}${'Growth a year%'.padStart(16)}${'corr'.padStart(7)}   in Growth's worst tenth of months: Growth / asset`)
for (const r of assetRows) console.log(`${r.label.padEnd(36)}${String(r.from).padStart(8)}${String(r.yearPct).padStart(9)}${String(r.worstFallPct).padStart(8)}${String(r.growthSameMonths.yearPct).padStart(16)}${String(r.correlationWithGrowth).padStart(7)}   ${r.inGrowthWorstMonths.growthAvgPct}% / ${r.inGrowthWorstMonths.assetAvgPct}%`)

// ---- 2. The trend sleeve ----
const SLEEVE = ['NIFTYBEES', 'JUNIORBEES', 'GOLDBEES', 'gilt', 'MON100'].map(k => ASSETS.find(a => a.key === k)!)
function sleeve(useTrend: boolean): Map<number, number> {
  const out = new Map<number, number>()
  let weights = new Map<string, number>()
  for (let i = 1; i < months.length; i++) {
    const m = months[i], prev = months[i - 1]
    let r = 0, invested = 0
    for (const [key, w] of weights) { const x = ret(ASSETS.find(a => a.key === key)!.series, m, prev); r += w * (x ?? 0); invested += w }
    r += (1 - invested) * CASH
    // Next month's holdings, decided at this month end from prices up to it
    const next = new Map<string, number>()
    const live = SLEEVE.filter(a => { for (let k = 0; k <= 10; k++) if (i - k < 0 || !a.series.has(months[i - k])) return false; return true })
    for (const a of live) {
      const average = mean(Array.from({ length: 10 }, (_, k) => a.series.get(months[i - k])!))
      if (!useTrend || a.series.get(m)! > average) next.set(a.key, 1 / live.length)
    }
    let traded = 0
    for (const key of new Set([...weights.keys(), ...next.keys()])) traded += Math.abs((next.get(key) ?? 0) - (weights.get(key) ?? 0))
    out.set(m, r - traded * COST)
    weights = next
  }
  return out
}
const trend = sleeve(true), held = sleeve(false)
const from = months[12]
const span = months.filter(m => m > from)
const series = (f: (m: number) => number) => span.map(f)
const g = series(m => growthRet.get(m)!)
const mixes = [
  { key: 'growth', label: 'Growth mode alone', returns: g },
  { key: 'hold', label: 'The five funds, always held', returns: series(m => held.get(m)!) },
  { key: 'trend', label: 'The five funds, trend rule', returns: series(m => trend.get(m)!) },
  ...[0.3, 0.5].flatMap(w => [
    { key: `growth-hold-${w * 100}`, label: `Growth ${100 - w * 100}%, funds held ${w * 100}%`, returns: series(m => (1 - w) * growthRet.get(m)! + w * held.get(m)!) },
    { key: `growth-trend-${w * 100}`, label: `Growth ${100 - w * 100}%, trend sleeve ${w * 100}%`, returns: series(m => (1 - w) * growthRet.get(m)! + w * trend.get(m)!) },
  ]),
  { key: 'growth-cash-30', label: 'Growth 70%, cash 30%', returns: series(m => 0.7 * growthRet.get(m)! + 0.3 * CASH) },
  { key: 'growth-gold-20', label: 'Growth 80%, gold 20%', returns: series(m => 0.8 * growthRet.get(m)! + 0.2 * (ret(ASSETS.find(a => a.key === 'GOLDBEES')!.series, m, months[months.indexOf(m) - 1]) ?? 0)) },
]
const cut = 202001
const mixRows = mixes.map(x => ({
  key: x.key, label: x.label, full: describe(x.returns), to2019: describe(x.returns.filter((_, i) => span[i] < cut)), since2020: describe(x.returns.filter((_, i) => span[i] >= cut)),
  correlationWithGrowth: round2(correlation(g, x.returns)),
}))
console.log(`\n2. Mixes, monthly, from ${span[0]}: growth a year (worst month-end fall)`)
console.log(`${''.padEnd(36)}${'full'.padEnd(18)}${'to 2019'.padEnd(18)}${'2020 on'.padEnd(18)}Sharpe  corr with Growth`)
const cell = (d: { yearPct: number; worstFallPct: number }) => `${String(d.yearPct).padStart(5)}% (${String(d.worstFallPct).padStart(5)})`.padEnd(18)
for (const r of mixRows) console.log(`${r.label.padEnd(36)}${cell(r.full)}${cell(r.to2019)}${cell(r.since2020)}${String(r.full.sharpe).padStart(6)}  ${String(r.correlationWithGrowth).padStart(6)}`)

mkdirSync('research/results', { recursive: true })
writeFileSync('research/results/diversifiers.json', JSON.stringify({
  generatedAt: new Date().toISOString(), to: end,
  note: 'A rough first look. Monthly prices. Growth is after tax and costs. The funds pay a flat 0.2% on what is traded and no tax; idle money earns 6%. Falls are on month-end values, so they are shallower than daily figures. The bond fund starts in 2016 and the US fund in 2011, so the sleeve holds fewer funds in its early years.',
  assets: assetRows, mixes: mixRows,
}, null, 1))
