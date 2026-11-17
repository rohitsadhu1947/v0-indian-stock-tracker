/**
 * Run the research harness on the local store and write the results.
 *
 *   npm run research            (after `npm run data:sync`)
 *
 * Writes research/results/latest.json (full, with monthly curves) and
 * summary.json (what the app shows), both committed, and prints a summary.
 * Every strategy and the equal-weight benchmark go through the same
 * simulator with the same costs and tax.
 *
 * Candidates are fixed here before the run, with standard settings from the
 * published research. Results are reported for all of them, and separately
 * for 2011-2019 and 2020 onward, so one lucky variant cannot be picked out
 * after the fact without it being visible.
 */
import { mkdirSync, writeFileSync } from 'fs'
import { DEFAULT_COSTS } from '@/lib/backtest/costs'
import { PORTFOLIO_RULES } from '@/lib/portfolio/config'
import { sectorOf } from '@/lib/portfolio/sectors'
import { loadMarketCached } from '@/lib/research/load'
import type { Market } from '@/lib/research/market'
import { align, calendarYearReturns, compare, monthly, periodStats, slice, type Curve } from '@/lib/research/metrics'
import { DEFAULT_SIM, simulate, type SimResult, type Strategy } from '@/lib/research/simulate'
import {
  earningsDrift, equalWeightUniverse, factorPortfolio, stockMomentum, withBreadthFilter, withTrendFilter, withVixFilter,
  withVolatilityTarget,
} from '@/lib/research/strategies'
import { yearsBetween } from '@/lib/research/dates'

// First month-end with a year of history behind it for every ranking input
const START = 20110131
const PERIODS: Record<string, { from: number; to?: number }> = {
  full: { from: START },
  to2019: { from: START, to: 20191231 },
  since2020: { from: 20200101 },
  since2022: { from: 20220101 },
}

const BENCHMARK = { key: 'equal-weight-500', strategy: equalWeightUniverse(500) }

const momentum = factorPortfolio({ factors: ['momentum'] })
const momentumLowVol = factorPortfolio({ factors: ['momentum', 'lowVolatility'] })
const CANDIDATES: Array<{ key: string; group: string; strategy: Strategy }> = [
  // The Monthly Plan's stock book as it runs today
  { key: 'stock-momentum', group: 'Single factor', strategy: stockMomentum() },
  { key: 'momentum-raw', group: 'Single factor', strategy: factorPortfolio({ factors: ['momentumRaw'] }) },
  { key: 'momentum-6m', group: 'Single factor', strategy: factorPortfolio({ factors: ['momentum6m'] }) },
  { key: 'low-volatility', group: 'Single factor', strategy: factorPortfolio({ factors: ['lowVolatility'] }) },
  { key: 'high-52w', group: 'Single factor', strategy: factorPortfolio({ factors: ['high52w'] }) },
  { key: 'delivery-rise', group: 'Single factor', strategy: factorPortfolio({ factors: ['deliveryRise'] }) },

  { key: 'momentum-lowvol', group: 'Combined', strategy: momentumLowVol },
  { key: 'momentum-high52w', group: 'Combined', strategy: factorPortfolio({ factors: ['momentum', 'high52w'] }) },
  { key: 'momentum-delivery', group: 'Combined', strategy: factorPortfolio({ factors: ['momentum', 'deliveryRise'] }) },

  // Same ideas spread over more stocks: a real effect should survive this
  { key: 'momentum-top50', group: 'Wider', strategy: factorPortfolio({ factors: ['momentum'], topN: 50 }) },
  { key: 'low-volatility-top50', group: 'Wider', strategy: factorPortfolio({ factors: ['lowVolatility'], topN: 50 }) },
  { key: 'momentum-lowvol-top50', group: 'Wider', strategy: factorPortfolio({ factors: ['momentum', 'lowVolatility'], topN: 50 }) },

  // Fewer trades: keep a holding until it drops out of the top 60
  { key: 'momentum-buffer', group: 'Lower turnover', strategy: factorPortfolio({ factors: ['momentum'], exitRank: 60 }) },
  { key: 'momentum-lowvol-buffer', group: 'Lower turnover', strategy: factorPortfolio({ factors: ['momentum', 'lowVolatility'], exitRank: 60 }) },
  { key: 'low-volatility-buffer', group: 'Lower turnover', strategy: factorPortfolio({ factors: ['lowVolatility'], exitRank: 60 }) },

  { key: 'earnings-drift', group: 'Earnings', strategy: earningsDrift() },
  { key: 'earnings-drift-top50', group: 'Earnings', strategy: earningsDrift({ topN: 50 }) },
  { key: 'momentum-earnings', group: 'Earnings', strategy: earningsDrift({ momentumFirst: true }) },

  { key: 'stock-momentum-trend', group: 'Risk overlay', strategy: withTrendFilter(stockMomentum()) },
  { key: 'momentum-voltarget', group: 'Risk overlay', strategy: withVolatilityTarget(momentum) },
  { key: 'momentum-lowvol-trend', group: 'Risk overlay', strategy: withTrendFilter(momentumLowVol) },
  { key: 'momentum-lowvol-voltarget', group: 'Risk overlay', strategy: withVolatilityTarget(momentumLowVol) },
  // The Monthly Plan's three modes with its trend-filter switch on
  { key: 'momentum-buffer-trend', group: 'Risk overlay', strategy: withTrendFilter(factorPortfolio({ factors: ['momentum'], exitRank: 60 })) },
  { key: 'momentum-lowvol-buffer-trend', group: 'Risk overlay', strategy: withTrendFilter(factorPortfolio({ factors: ['momentum', 'lowVolatility'], exitRank: 60 })) },
  { key: 'low-volatility-buffer-trend', group: 'Risk overlay', strategy: withTrendFilter(factorPortfolio({ factors: ['lowVolatility'], exitRank: 60 })) },
]

// Sectors come from NSE's Total Market list (lib/portfolio/sectors.ts), which covers
// today's 750 largest companies. About half of the 2010 universe has no sector there,
// so the sector strategies are less reliable before about 2018.
const cap = PORTFOLIO_RULES.maxPerSector
const buffered = (factors: Parameters<typeof factorPortfolio>[0]['factors'], extra: Partial<Parameters<typeof factorPortfolio>[0]> = {}) =>
  factorPortfolio({ factors, exitRank: PORTFOLIO_RULES.exitRank, sectorOf, ...extra })

CANDIDATES.push(
  // The Monthly Plan's three modes as they run: holding buffer and sector cap
  { key: 'momentum-buffer-sectorcap', group: 'Sector', strategy: buffered(['momentum'], { maxPerSector: cap }) },
  { key: 'momentum-lowvol-buffer-sectorcap', group: 'Sector', strategy: buffered(['momentum', 'lowVolatility'], { maxPerSector: cap }) },
  { key: 'low-volatility-buffer-sectorcap', group: 'Sector', strategy: buffered(['lowVolatility'], { maxPerSector: cap }) },
  { key: 'momentum-buffer-sectorcap-trend', group: 'Sector', strategy: withTrendFilter(buffered(['momentum'], { maxPerSector: cap })) },
  { key: 'momentum-lowvol-buffer-sectorcap-trend', group: 'Sector', strategy: withTrendFilter(buffered(['momentum', 'lowVolatility'], { maxPerSector: cap })) },
  { key: 'low-volatility-buffer-sectorcap-trend', group: 'Sector', strategy: withTrendFilter(buffered(['lowVolatility'], { maxPerSector: cap })) },
  { key: 'momentum-buffer-topsectors', group: 'Sector', strategy: buffered(['momentum'], { topSectorShare: 1 / 3 }) },
  { key: 'momentum-lowvol-buffer-topsectors', group: 'Sector', strategy: buffered(['momentum', 'lowVolatility'], { topSectorShare: 1 / 3 }) },
)
CANDIDATES.push(
  { key: 'momentum-buffer-breadth', group: 'Macro', strategy: withBreadthFilter(buffered(['momentum'])) },
  { key: 'momentum-lowvol-buffer-breadth', group: 'Macro', strategy: withBreadthFilter(buffered(['momentum', 'lowVolatility'])) },
  { key: 'momentum-buffer-vix', group: 'Macro', strategy: withVixFilter(buffered(['momentum'])) },
  { key: 'momentum-lowvol-buffer-vix', group: 'Macro', strategy: withVixFilter(buffered(['momentum', 'lowVolatility'])) },
)

const INDEX_REFERENCES = [
  { key: 'nifty-50', symbol: 'IDX:NIFTY 50', name: 'NIFTY 50 index' },
  { key: 'nifty-500', symbol: 'IDX:NIFTY 500', name: 'NIFTY 500 index' },
]

const round = (x: number, dp = 1) => Math.round(x * 10 ** dp) / 10 ** dp
const curveOf = (r: SimResult): Curve => ({ dates: r.dates, equity: r.equity })
const mapPeriods = <T>(fn: (from: number, to: number | undefined) => T): Record<string, T> =>
  Object.fromEntries(Object.entries(PERIODS).map(([name, p]) => [name, fn(p.from, p.to)]))

function periods(curve: Curve) {
  return mapPeriods((from, to) => {
    const s = periodStats(slice(curve, from, to))
    return {
      cagrPct: round(s.cagrPct), volatilityPct: round(s.volatilityPct), sharpe: round(s.sharpe, 2),
      maxDrawdownPct: round(s.maxDrawdownPct), drawdownFrom: s.drawdownFrom, drawdownTo: s.drawdownTo,
      worstYearPct: round(s.worstYearPct), bestYearPct: round(s.bestYearPct),
    }
  })
}

function versus(curve: Curve, benchmark: Curve) {
  return mapPeriods((from, to) => {
    const c = compare(slice(curve, from, to), slice(benchmark, from, to))
    return {
      excessCagrPct: round(c.excessCagrPct), tStat: round(c.tStat, 2), months: c.months,
      yearsAheadPct: round(c.yearsAheadPct, 0), rolling3yAheadPct: round(c.rolling3yAheadPct, 0),
    }
  })
}

function describe(market: Market, strategy: Strategy, end: number, benchmark: { afterTax: Curve; beforeTax: Curve } | null) {
  const range = { start: START, end }
  const afterTax = simulate(market, strategy, range)
  const beforeTax = simulate(market, strategy, { ...range, tax: null })
  const costly = simulate(market, strategy, { ...range, costs: { ...DEFAULT_COSTS, slippagePercent: 0.003 } })
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
      averageInvestedPct: round(afterTax.rebalances.reduce((a, r) => a + r.investedPct, 0) / afterTax.rebalances.length, 0),
      delistings: afterTax.delistings.length,
      /** Full-period after-tax return if slippage were 0.3% a side instead of 0.1%. */
      cagrAtTripleSlippagePct: round(periodStats(curveOf(costly)).cagrPct),
      yearlyAfterTaxPct: Object.fromEntries(Object.entries(calendarYearReturns(curveOf(afterTax))).map(([y, r]) => [y, round(r)])),
      monthlyAfterTax: monthly(curveOf(afterTax)),
    },
  }
}

function main() {
  const t0 = Date.now()
  const market = loadMarketCached()
  const end = market.sessions[market.sessions.length - 1]
  console.log(`Loaded ${market.stocks.size} stocks, ${market.sessions.length} sessions to ${end} in ${((Date.now() - t0) / 1000).toFixed(0)}s`)

  const benchmark = describe(market, BENCHMARK.strategy, end, null)
  const strategies = CANDIDATES.map(c => {
    const d = describe(market, c.strategy, end, benchmark.result)
    console.log(`  ran ${c.key}`)
    return { key: c.key, group: c.group, ...d.summary }
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
      universe: 'Point-in-time: the 500 most traded NSE stocks as known at each month-end, including companies later delisted. Funds and rights entitlements excluded.',
      eligibility: 'A year of price history and at least Rs 10 crore traded a day (60-day median).',
      costs: `Zerodha delivery charges (STT, exchange, SEBI, stamp duty, GST, DP) plus ${DEFAULT_COSTS.slippagePercent * 100}% slippage a side.`,
      tax: 'Capital gains under current rules for every year: 20% short-term, 12.5% long-term above Rs 1.25 lakh, 4% cess, paid each April.',
      dividends: 'Reinvested, untaxed. Index references are price-only: an index fund also earns roughly 1.2% a year in dividends.',
      candidates: `${CANDIDATES.length} strategies were tested. With that many, one will look good by chance: a t-statistic near 2 is weak evidence, and about 3 is the bar.`,
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

  const pct = (x: number) => `${x.toFixed(1)}%`.padStart(7)
  const head = 'After costs and tax'.padEnd(50) + '  full    DD  | 2011-19  t   | 2020+    t   | 2022+    t   | turn  tax  @0.3%slip'
  console.log('\n' + head)
  const line = (name: string, s: any, vs: any) => {
    const cell = (p: string) => `${pct(s.afterTax[p].cagrPct)} ${vs ? String(vs[p].tStat.toFixed(1)).padStart(5) : '     '}`
    return `${name.slice(0, 49).padEnd(50)}${pct(s.afterTax.full.cagrPct)} ${pct(s.afterTax.full.maxDrawdownPct)} | ${cell('to2019')} | ${cell('since2020')} | ${cell('since2022')} | ` +
      `${String(s.turnoverPctPerYear).padStart(4)}% ${s.taxPctPerYear.toFixed(1).padStart(4)}% ${pct(s.cagrAtTripleSlippagePct)}`
  }
  console.log(line(benchmark.summary.name, benchmark.summary, null))
  let group = ''
  for (const s of strategies) {
    if (s.group !== group) console.log(`-- ${(group = s.group)}`)
    console.log(line(s.name, s, s.versusBenchmark!.afterTax))
  }
  for (const i of indices) {
    const p = i.priceReturn
    console.log(`${(i.name + ' [price only]').padEnd(50)}${pct(p.full.cagrPct)} ${pct(p.full.maxDrawdownPct)} | ${pct(p.to2019.cagrPct)}       | ${pct(p.since2020.cagrPct)}       | ${pct(p.since2022.cagrPct)}`)
  }
  console.log(`\nt = t-statistic of the monthly return difference from the equal-weight benchmark. Wrote research/results in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
}

main()
