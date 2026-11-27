/**
 * Growth mode with part of the money in gold, bond and US funds, run as one
 * book on daily prices with charges, slippage and tax.
 *
 *   npm run research:funds
 *
 * The funds are bought at a fixed share of the book and brought back to it
 * when they drift more than 20% from target, as the Monthly Plan does with
 * its stocks. A fund that is not listed yet leaves its share in cash at 6%.
 *
 * Tax: shares and share index funds under the equity rules. Gold and US
 * funds at 12.5% after 12 months and 30% before. Bond funds at 30% always.
 * The 30% is the top income tax slab; a lower slab would pay less.
 *
 * Charges: every fund order is charged like a share order. Funds pay less
 * tax on transactions than shares, so this overstates their cost a little.
 */
import { mkdirSync, writeFileSync } from 'fs'
import { DEFAULT_COSTS } from '@/lib/backtest/costs'
import { loadFunds, loadMarketCached } from '@/lib/research/load'
import { calendarYearReturns, periodStats, slice, type Curve } from '@/lib/research/metrics'
import { simulate, type SimOptions, type Strategy } from '@/lib/research/simulate'
import { factorPortfolio } from '@/lib/research/strategies'
import { BOND_FUND_TAX, GOLD_AND_FOREIGN_FUND_TAX, type TaxGroup } from '@/lib/research/tax'
import { MODES, PORTFOLIO_RULES, type RiskMode } from '@/lib/portfolio/config'
import { SECTOR_BY_SYMBOL } from '@/lib/portfolio/sectors'

const START = 20110131
const GOLD = 'GOLDBEES', BOND = 'LICNETFGSC', US = 'MON100', NIFTY = 'NIFTYBEES', NEXT50 = 'JUNIORBEES'
const LABEL: Record<string, string> = { [GOLD]: 'Gold fund', [BOND]: 'Government bond fund', [US]: 'US Nasdaq 100 fund', [NIFTY]: 'NIFTY 50 fund', [NEXT50]: 'Next 50 fund' }
const TAX_GROUPS: TaxGroup[] = [
  { applies: s => s === GOLD || s === US, rules: GOLD_AND_FOREIGN_FUND_TAX },
  { applies: s => s === BOND, rules: BOND_FUND_TAX },
]
const PERIODS = [
  { key: 'full', from: START, to: Infinity }, { key: '2011-2019', from: START, to: 20191231 },
  { key: '2020-2022', from: 20200101, to: 20221231 }, { key: '2023-now', from: 20230101, to: Infinity },
]

const market = loadMarketCached()
const END = market.sessions[market.sessions.length - 1]
const funds = loadFunds([GOLD, BOND, US, NIFTY, NEXT50])
for (const [symbol, series] of funds) market.stocks.set(symbol, series)

const growth = factorPortfolio({ factors: ['momentum'], exitRank: PORTFOLIO_RULES.exitRank, maxPerSector: PORTFOLIO_RULES.maxPerSector, sectorOf: s => SECTOR_BY_SYMBOL[s] })
const TREND_SESSIONS = 210   // about 10 months

/** `share` of the book split equally between the funds; the rest runs `base`. */
function withFunds(base: Strategy, symbols: string[], share: number, trend = false): Strategy {
  return {
    name: `${base.name} with ${share * 100}% in ${symbols.join(', ')}${trend ? ' (trend rule)' : ''}`,
    targets(ctx) {
      const out: Record<string, number> = {}
      for (const [symbol, w] of Object.entries(base.targets(ctx))) out[symbol] = w * (1 - share)
      for (const symbol of symbols) {
        const bars = ctx.bars(symbol, TREND_SESSIONS)
        if (bars.length < (trend ? TREND_SESSIONS : 20)) continue   // not listed long enough: its share stays in cash
        if (trend && bars[bars.length - 1].close <= bars.reduce((a, b) => a + b.close, 0) / bars.length) continue
        out[symbol] = share / symbols.length
      }
      return out
    },
  }
}
const scaled = (base: Strategy, invested: number): Strategy => ({
  name: `${base.name} at ${invested * 100}%`,
  targets: ctx => Object.fromEntries(Object.entries(base.targets(ctx)).map(([s, w]) => [s, w * invested])),
})
const only = (symbol: string): Strategy => ({ name: symbol, targets: ctx => (ctx.bars(symbol, 1).length ? { [symbol]: 1 } : {}) })

const round1 = (x: number) => Math.round(x * 10) / 10
const round2 = (x: number) => Math.round(x * 100) / 100
const stats = (curve: Curve) => Object.fromEntries(PERIODS.map(p => {
  const st = periodStats(slice(curve, p.from, p.to))
  return [p.key, { cagrPct: round1(st.cagrPct), maxDrawdownPct: round1(st.maxDrawdownPct), sharpe: round2(st.sharpe), worstYearPct: round1(st.worstYearPct), drawdownFrom: st.drawdownFrom, drawdownTo: st.drawdownTo }]
}))
function run(strategy: Strategy, options: Partial<SimOptions> = {}) {
  const r = simulate(market, strategy, { start: START, end: END, taxGroups: TAX_GROUPS, ...options })
  const curve: Curve = { dates: r.dates, equity: r.equity }
  return { curve, stats: stats(curve) as any, taxLakh: round1(r.totals.tax / 1e5), chargesLakh: round1((r.totals.charges + r.totals.slippage) / 1e5), orders: r.trades.length, endLakh: round1(r.equity[r.equity.length - 1] / 1e5) }
}

// ---- The funds on their own ----
const medianTurnover = (symbol: string, from: number, to: number): number | null => {
  const s = funds.get(symbol)!
  const xs = Array.from(s.dates).map((d, i) => (d >= from && d <= to ? s.turnover[i] : NaN)).filter(x => !Number.isNaN(x)).sort((a, b) => a - b)
  return xs.length ? Math.round(xs[xs.length >> 1] / 1e5) / 10 : null
}
const fundRows = [GOLD, BOND, US, NIFTY, NEXT50].map(symbol => {
  const first = funds.get(symbol)!.dates[0]
  const r = simulate(market, only(symbol), { start: Math.max(START, first), end: END, taxGroups: TAX_GROUPS })
  const st = periodStats({ dates: r.dates, equity: r.equity })
  return {
    symbol, label: LABEL[symbol], from: Math.max(START, first), cagrPct: round1(st.cagrPct), maxDrawdownPct: round1(st.maxDrawdownPct),
    tradedCrADay2016: medianTurnover(symbol, 20160101, 20161231), tradedCrADayLastYear: medianTurnover(symbol, END - 10000, END),
  }
})
console.log('The funds held on their own, after charges and tax on the final sale not counted')
console.log(`${'Fund'.padEnd(26)}${'from'.padStart(10)}${'a year%'.padStart(9)}${'fall%'.padStart(8)}   traded a day, Rs crore: 2016 / last year`)
for (const f of fundRows) console.log(`${f.label.padEnd(26)}${String(f.from).padStart(10)}${String(f.cagrPct).padStart(9)}${String(f.maxDrawdownPct).padStart(8)}   ${f.tradedCrADay2016 ?? 'n/a'} / ${f.tradedCrADayLastYear ?? 'n/a'}`)

// ---- One book ----
const SETS: Array<{ key: string; label: string; symbols: string[] }> = [
  { key: 'gold-bond-us', label: 'gold, bonds, US', symbols: [GOLD, BOND, US] },
  { key: 'gold-bond', label: 'gold, bonds', symbols: [GOLD, BOND] },
  { key: 'gold', label: 'gold', symbols: [GOLD] },
  { key: 'five', label: 'gold, bonds, US, NIFTY 50, Next 50', symbols: [GOLD, BOND, US, NIFTY, NEXT50] },
]
const SHARES = [0.2, 0.3, 0.4, 0.5]
const BOOKS: Array<{ key: string; label: string; strategy: Strategy; options?: Partial<SimOptions> }> = [
  { key: 'growth', label: 'Growth alone', strategy: growth },
  ...[0.8, 0.7, 0.6, 0.5].map(x => ({ key: `growth-${x * 100}-cash`, label: `Growth ${x * 100}%, cash ${100 - x * 100}%`, strategy: scaled(growth, x) })),
  ...SETS.flatMap(set => SHARES.map(share => ({ key: `${set.key}-${share * 100}`, label: `Growth ${100 - share * 100}%, ${share * 100}% in ${set.label}`, strategy: withFunds(growth, set.symbols, share) }))),
  { key: 'gold-bond-us-30-trend', label: 'Growth 70%, 30% gold, bonds, US, trend rule', strategy: withFunds(growth, [GOLD, BOND, US], 0.3, true) },
  { key: 'gold-bond-30-trend', label: 'Growth 70%, 30% gold, bonds, trend rule', strategy: withFunds(growth, [GOLD, BOND], 0.3, true) },
]
const triple = { costs: { ...DEFAULT_COSTS, slippagePercent: DEFAULT_COSTS.slippagePercent * 3 } }
BOOKS.push(
  { key: 'growth-3x-slippage', label: 'Growth alone, three times the slippage', strategy: growth, options: triple },
  { key: 'gold-bond-us-30-3x-slippage', label: 'Growth 70%, 30% gold, bonds, US, three times the slippage', strategy: withFunds(growth, [GOLD, BOND, US], 0.3), options: triple },
  { key: 'gold-bond-30-3x-slippage', label: 'Growth 70%, 30% gold, bonds, three times the slippage', strategy: withFunds(growth, [GOLD, BOND], 0.3), options: triple },
)
const results = BOOKS.map(b => ({ key: b.key, label: b.label, ...run(b.strategy, b.options) }))

const cell = (x: any) => PERIODS.map(p => `${String(x[p.key].cagrPct).padStart(5)}% (${String(x[p.key].maxDrawdownPct).padStart(5)})`).join('  ')
console.log(`\nOne book, after charges and tax: growth a year (worst fall on daily values). Rs 10 lakh at the start.`)
console.log(`${''.padEnd(58)}${PERIODS.map(p => p.key.padEnd(16)).join('')}  Sharpe  worst yr  tax Rs lakh  ends Rs lakh`)
for (const r of results) console.log(`${r.label.padEnd(58)}${cell(r.stats)}  ${String(r.stats.full.sharpe).padStart(6)}  ${String(r.stats.full.worstYearPct).padStart(8)}  ${String(r.taxLakh).padStart(11)}  ${String(r.endLakh).padStart(12)}`)

const pick = (key: string) => results.find(r => r.key === key)!
const years = calendarYearReturns(pick('growth').curve)
const byYear = Object.fromEntries(Object.keys(years).map(y => [y, {
  growth: round1(years[+y]), goldBondUs30: round1(calendarYearReturns(pick('gold-bond-us-30').curve)[+y]), goldBond30: round1(calendarYearReturns(pick('gold-bond-30').curve)[+y]), cash30: round1(calendarYearReturns(pick('growth-70-cash').curve)[+y]),
}]))
console.log('\nBy calendar year: Growth / 30% gold, bonds, US / 30% gold, bonds / 30% cash')
console.log(Object.entries(byYear).map(([y, r]) => `${y.slice(2)}: ${r.growth} / ${r.goldBondUs30} / ${r.goldBond30} / ${r.cash30}`).join('   '))
const g = pick('growth').stats.full
console.log(`\nGrowth's worst fall ran from ${g.drawdownFrom} to ${g.drawdownTo}.`)

// ---- Every mode of the Monthly Plan with the three funds, for the figures the page shows ----
const PLAN_SHARES = [0, 0.1, 0.2, 0.3, 0.4, 0.5]
const byMode: Record<string, Record<string, { cagrPct: number; maxDrawdownPct: number; worstYearPct: number }>> = {}
console.log('\nEach mode with gold, bonds and US: growth a year (worst fall) by share in funds')
for (const mode of Object.keys(MODES) as RiskMode[]) {
  const base = factorPortfolio({ factors: MODES[mode].factors, exitRank: PORTFOLIO_RULES.exitRank, maxPerSector: PORTFOLIO_RULES.maxPerSector, sectorOf: s => SECTOR_BY_SYMBOL[s] })
  byMode[mode] = {}
  for (const share of PLAN_SHARES) {
    const full = run(share ? withFunds(base, [GOLD, BOND, US], share) : base).stats.full
    byMode[mode][String(share * 100)] = { cagrPct: full.cagrPct, maxDrawdownPct: full.maxDrawdownPct, worstYearPct: full.worstYearPct }
  }
  console.log(`${mode.padEnd(11)}${PLAN_SHARES.map(sh => { const x = byMode[mode][String(sh * 100)]; return `${sh * 100}%: ${x.cagrPct}% (${x.maxDrawdownPct})` }).join('   ')}`)
}

mkdirSync('research/results', { recursive: true })
writeFileSync('research/results/funds.json', JSON.stringify({
  generatedAt: new Date().toISOString(), from: START, to: END,
  note: 'One book on daily prices, Rs 10 lakh at the start. Charges and 0.1% slippage a side on every order, funds charged like shares. Idle cash earns 6%. Tax: shares and share index funds under the equity rules; gold and US funds 12.5% after 12 months and 30% before; bond funds 30% always; 4% cess; a loss in one group is not set off against another. A fund not yet listed leaves its share in cash. The bond fund starts in 2015 and the US fund in 2011.',
  funds: fundRows,
  books: results.map(({ curve, ...rest }) => rest),
  byModeAndFundSharePct: byMode,
  byYear,
}, null, 1))
