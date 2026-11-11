/**
 * Run the research harness on the local store and write the results.
 *
 *   npm run research            (after `npm run data:sync`)
 *
 * Writes research/results/latest.json (full, with monthly curves) and
 * summary.json (what the app shows), both committed, and prints a summary. Every strategy and the equal-weight benchmark go through
 * the same simulator with the same costs and tax.
 */
import { mkdirSync, writeFileSync } from 'fs'
import { DEFAULT_COSTS } from '@/lib/backtest/costs'
import { loadMarketCached } from '@/lib/research/load'
import type { Market } from '@/lib/research/market'
import { align, calendarYearReturns, compare, monthly, periodStats, slice, type Curve } from '@/lib/research/metrics'
import { DEFAULT_SIM, simulate, type SimOptions, type SimResult, type Strategy } from '@/lib/research/simulate'
import { equalWeightUniverse, stockMomentum, withTrendFilter } from '@/lib/research/strategies'
import { yearsBetween } from '@/lib/research/dates'

// First month-end with a year of history behind it for every ranking input
const START = 20110131
const PERIODS = { full: START, since2020: 20200101, since2022: 20220101 } as const

const BENCHMARK = { key: 'equal-weight-500', strategy: equalWeightUniverse(500) }
const STRATEGIES: Array<{ key: string; strategy: Strategy }> = [
  { key: 'stock-momentum', strategy: stockMomentum() },
  { key: 'stock-momentum-trend', strategy: withTrendFilter(stockMomentum()) },
]
const INDEX_REFERENCES = [
  { key: 'nifty-50', symbol: 'IDX:NIFTY 50', name: 'NIFTY 50 index' },
  { key: 'nifty-500', symbol: 'IDX:NIFTY 500', name: 'NIFTY 500 index' },
]

const round = (x: number, dp = 1) => Math.round(x * 10 ** dp) / 10 ** dp
const curveOf = (r: SimResult): Curve => ({ dates: r.dates, equity: r.equity })

function periods(curve: Curve) {
  return Object.fromEntries(Object.entries(PERIODS).map(([name, from]) => {
    const s = periodStats(slice(curve, from))
    return [name, {
      cagrPct: round(s.cagrPct), volatilityPct: round(s.volatilityPct), sharpe: round(s.sharpe, 2),
      maxDrawdownPct: round(s.maxDrawdownPct), drawdownFrom: s.drawdownFrom, drawdownTo: s.drawdownTo,
      worstYearPct: round(s.worstYearPct), bestYearPct: round(s.bestYearPct),
    }]
  }))
}

function versus(curve: Curve, benchmark: Curve) {
  return Object.fromEntries(Object.entries(PERIODS).map(([name, from]) => {
    const c = compare(slice(curve, from), slice(benchmark, from))
    return [name, {
      excessCagrPct: round(c.excessCagrPct), tStat: round(c.tStat, 2), months: c.months,
      yearsAheadPct: round(c.yearsAheadPct, 0), rolling3yAheadPct: round(c.rolling3yAheadPct, 0),
    }]
  }))
}

function describe(market: Market, strategy: Strategy, end: number, benchmark: { afterTax: Curve; beforeTax: Curve } | null) {
  const range = { start: START, end }
  const afterTax = simulate(market, strategy, range)
  const beforeTax = simulate(market, strategy, { ...range, tax: null })
  const years = yearsBetween(afterTax.dates[0], afterTax.dates.at(-1)!)
  const averageEquity = afterTax.equity.reduce((a, b) => a + b, 0) / afterTax.equity.length
  const positions = afterTax.rebalances.map(r => r.positions)
  return {
    result: { afterTax: curveOf(afterTax), beforeTax: curveOf(beforeTax) },
    summary: {
      name: strategy.name,
      afterTax: periods(curveOf(afterTax)),
      beforeTax: periods(curveOf(beforeTax)),
      versusBenchmark: benchmark && {
        afterTax: versus(curveOf(afterTax), benchmark.afterTax),
        beforeTax: versus(curveOf(beforeTax), benchmark.beforeTax),
      },
      // One-way: half of buys plus sells, as a share of average portfolio value
      turnoverPctPerYear: round((afterTax.totals.traded / 2 / averageEquity / years) * 100, 0),
      chargesPctPerYear: round((afterTax.totals.charges / averageEquity / years) * 100, 2),
      slippagePctPerYear: round((afterTax.totals.slippage / averageEquity / years) * 100, 2),
      taxPctPerYear: round((afterTax.totals.tax / averageEquity / years) * 100, 2),
      averagePositions: round(positions.reduce((a, b) => a + b, 0) / positions.length, 0),
      monthsInCashPct: round((afterTax.rebalances.filter(r => r.positions === 0).length / afterTax.rebalances.length) * 100, 0),
      delistings: afterTax.delistings.length,
      yearlyAfterTaxPct: Object.fromEntries(Object.entries(calendarYearReturns(curveOf(afterTax))).map(([y, r]) => [y, round(r)])),
      monthlyAfterTax: monthly(curveOf(afterTax)),
    },
  }
}

function sensitivity(market: Market, strategy: Strategy, end: number, label: string, change: Partial<SimOptions>) {
  const r = simulate(market, strategy, { start: START, end, ...change })
  const s = periodStats(curveOf(r))
  return { label, cagrPct: round(s.cagrPct), maxDrawdownPct: round(s.maxDrawdownPct) }
}

function main() {
  const t0 = Date.now()
  const market = loadMarketCached()
  const end = market.sessions[market.sessions.length - 1]
  console.log(`Loaded ${market.stocks.size} stocks, ${market.sessions.length} sessions to ${end} in ${((Date.now() - t0) / 1000).toFixed(0)}s`)

  const benchmark = describe(market, BENCHMARK.strategy, end, null)
  const strategies = STRATEGIES.map(s => {
    const d = describe(market, s.strategy, end, benchmark.result)
    return {
      key: s.key,
      ...d.summary,
      sensitivity: [
        sensitivity(market, s.strategy, end, 'Slippage 0.3% a side (base 0.1%)', { costs: { ...DEFAULT_COSTS, slippagePercent: 0.003 } }),
        sensitivity(market, s.strategy, end, 'Slippage 0.5% a side', { costs: { ...DEFAULT_COSTS, slippagePercent: 0.005 } }),
        sensitivity(market, s.strategy, end, 'Delisted holdings lose everything (base 20%)', { delistingHaircut: 1 }),
        sensitivity(market, s.strategy, end, 'Dividends ignored', { dividends: false }),
      ],
    }
  })

  const dates = benchmark.result.afterTax.dates
  const indices = INDEX_REFERENCES.map(ref => {
    const series = market.indices.get(ref.symbol)!
    const curve = align({ dates: Array.from(series.dates), equity: Array.from(series.close) }, dates)
    return { key: ref.key, name: ref.name, priceReturn: periods(curve) }
  })

  const report = {
    generatedAt: new Date().toISOString(),
    dataFrom: START,
    dataThrough: end,
    assumptions: {
      execution: 'Signal at the close of the last session of each month; trades in the next session at its volume-weighted average price.',
      universe: 'Point-in-time: the 500 most traded NSE stocks as known at each month-end, including companies later delisted.',
      costs: `Zerodha delivery charges (STT, exchange, SEBI, stamp duty, GST, DP) plus ${DEFAULT_COSTS.slippagePercent * 100}% slippage a side.`,
      tax: 'Capital gains under current rules for every year: 20% short-term, 12.5% long-term above Rs 1.25 lakh, 4% cess, paid each April.',
      dividends: 'Reinvested, untaxed. Index references are price-only: an index fund also earns roughly 1.2% a year in dividends.',
      capital: DEFAULT_SIM.capital,
      cashYieldPct: DEFAULT_SIM.cashYield * 100,
      delistingHaircutPct: DEFAULT_SIM.delistingHaircut * 100,
      resizeBandPct: DEFAULT_SIM.band * 100,
    },
    benchmark: { key: BENCHMARK.key, ...benchmark.summary },
    strategies,
    indices,
  }

  mkdirSync('research/results', { recursive: true })
  writeFileSync('research/results/latest.json', JSON.stringify(report, null, 1))
  // What the app imports: the same report without the monthly curves
  const { monthlyAfterTax: _b, ...benchmarkSummary } = report.benchmark
  writeFileSync('research/results/summary.json', JSON.stringify({
    ...report,
    benchmark: benchmarkSummary,
    strategies: report.strategies.map(({ monthlyAfterTax: _s, ...rest }) => rest),
  }, null, 1))

  const row = (name: string, p: any, extra = '') =>
    `${name.padEnd(46)} ${String(p.cagrPct).padStart(6)}% ${String(p.maxDrawdownPct).padStart(7)}% ${String(p.sharpe ?? '').padStart(6)} ${String(p.worstYearPct).padStart(7)}% ${extra}`
  for (const period of Object.keys(PERIODS) as Array<keyof typeof PERIODS>) {
    console.log(`\n== ${period} (from ${PERIODS[period]}) ==`.padEnd(48) + '  CAGR   max DD Sharpe  worst yr')
    console.log(row(`${benchmark.summary.name} [after tax]`, benchmark.summary.afterTax[period]))
    console.log(row(`${benchmark.summary.name} [before tax]`, benchmark.summary.beforeTax[period]))
    for (const s of strategies) {
      const v = s.versusBenchmark!.afterTax[period]
      console.log(row(`${s.name} [after tax]`, s.afterTax[period], `vs benchmark ${v.excessCagrPct >= 0 ? '+' : ''}${v.excessCagrPct}%/yr, t=${v.tStat}, ahead in ${v.yearsAheadPct}% of years`))
      console.log(row(`${s.name} [before tax]`, s.beforeTax[period]))
    }
    for (const i of indices) console.log(row(`${i.name} [price only]`, i.priceReturn[period]))
  }
  for (const s of [{ ...benchmark.summary, sensitivity: [] as any[] }, ...strategies]) {
    console.log(`\n${s.name}: turnover ${s.turnoverPctPerYear}%/yr, charges ${s.chargesPctPerYear}%/yr, slippage ${s.slippagePctPerYear}%/yr, ` +
      `tax ${s.taxPctPerYear}%/yr, ${s.averagePositions} positions, in cash ${s.monthsInCashPct}% of months, ${s.delistings} delistings`)
    for (const x of s.sensitivity) console.log(`   ${x.label}: CAGR ${x.cagrPct}%, max drawdown ${x.maxDrawdownPct}%`)
  }
  console.log(`\nWrote research/results/latest.json in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
}

main()
