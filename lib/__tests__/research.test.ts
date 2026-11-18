import { describe, expect, it } from 'vitest'
import { DEFAULT_COSTS } from '../backtest/costs'
import { financialYear, lastAtOrBefore } from '../research/dates'
import type { Market, StockSeries } from '../research/market'
import { align, calendarYearReturns, compare, monthly, periodStats } from '../research/metrics'
import { simulate, type Strategy, type StrategyContext } from '../research/simulate'
import { earningsReaction, equalWeightUniverse, factorPortfolio, stockMomentum, withVolatilityTarget } from '../research/strategies'
import { FACTORS, rankByFactors } from '../portfolio/factors'
import { rankMomentum, type DailyBar } from '../portfolio/momentum'
import { INDIA_EQUITY_TAX, TaxLedger } from '../research/tax'

const NO_COSTS = { ...DEFAULT_COSTS, sttPercent: 0, exchangeTxnPercent: 0, sebiPercent: 0, stampDutyPercent: 0, dpChargePerSell: 0, slippagePercent: 0 }
const FRICTIONLESS = { costs: NO_COSTS, cashYield: 0, tax: null, band: 0, capital: 1_000_000 }

/** Weekday sessions from a start date. */
function weekdays(start: string, count: number): number[] {
  const out: number[] = []
  for (const d = new Date(start + 'T00:00:00Z'); out.length < count; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(Number(d.toISOString().slice(0, 10).replaceAll('-', '')))
  }
  return out
}

/** A stock whose close on session i is `price(i)`; orders that day fill at the previous close. */
function stock(symbol: string, sessions: number[], price: (i: number) => number, opts: { until?: number; fill?: (i: number) => number } = {}): StockSeries {
  const n = opts.until ?? sessions.length
  const close = Array.from({ length: n }, (_, i) => price(i))
  const fill = close.map((c, i) => (opts.fill ? opts.fill(i) : i === 0 ? c : close[i - 1]))
  return {
    symbol, dates: Int32Array.from(sessions.slice(0, n)), fill: Float64Array.from(fill), close: Float64Array.from(close),
    open: Float64Array.from(close), high: Float64Array.from(close), low: Float64Array.from(close),
    turnover: Float64Array.from(close.map(() => 1e9)), dividendFactor: Float64Array.from(close.map(() => 1)),
    deliveryShare: Float64Array.from(close.map(() => 0.5)), resultsDates: new Int32Array(),
  }
}

function market(sessions: number[], stocks: StockSeries[]): Market {
  const universe = new Map<number, string[]>()
  for (let i = 0; i < sessions.length; i++) {
    if (i === sessions.length - 1 || Math.floor(sessions[i + 1] / 100) !== Math.floor(sessions[i] / 100)) {
      universe.set(sessions[i], stocks.filter(s => lastAtOrBefore(s.dates, sessions[i]) >= 0 && s.dates.at(-1)! >= sessions[i]).map(s => s.symbol))
    }
  }
  return {
    sessions: Int32Array.from(sessions), stocks: new Map(stocks.map(s => [s.symbol, s])), indices: new Map(),
    universe, universeDates: Int32Array.from([...universe.keys()]),
  }
}

const hold = (weights: Record<string, number>): Strategy => ({ name: 'hold', targets: () => weights })

describe('simulate', () => {
  const sessions = weekdays('2020-01-01', 300)

  it('trades in the session after the signal, not at the signal close', () => {
    // Flat at 100, then trades at 200 from the first session of February
    const feb = sessions.findIndex(d => d >= 20200201)
    const a = stock('A', sessions, i => (i < feb ? 100 : 200), { fill: i => (i < feb ? 100 : 200) })
    const r = simulate(market(sessions, [a]), hold({ A: 1 }), { ...FRICTIONLESS, start: sessions[0], end: sessions.at(-1)! })
    // Bought at 200, after the jump it could not have known about: no gain
    expect(r.trades[0]).toMatchObject({ date: sessions[feb], side: 'BUY' })
    expect(r.equity.at(-1)).toBeCloseTo(1_000_000, 6)
  })

  it('earns the stock return once invested', () => {
    const a = stock('A', sessions, i => 100 * 1.001 ** i)
    const r = simulate(market(sessions, [a]), hold({ A: 1 }), { ...FRICTIONLESS, start: sessions[0], end: sessions.at(-1)! })
    const bought = sessions.indexOf(r.trades[0].date)
    expect(r.equity.at(-1)! / 1_000_000).toBeCloseTo(a.close.at(-1)! / a.fill[bought], 9)
    expect(r.trades).toHaveLength(1)
  })

  it('charges statutory costs and slippage on every fill', () => {
    const a = stock('A', sessions, () => 100)
    const flip: Strategy = { name: 'flip', targets: (ctx): Record<string, number> => (ctx.holdings.size ? {} : { A: 1 }) }
    const r = simulate(market(sessions, [a]), flip, { ...FRICTIONLESS, costs: DEFAULT_COSTS, start: sessions[0], end: sessions.at(-1)! })
    expect(r.trades.length).toBeGreaterThan(4)
    expect(r.equity.at(-1)!).toBeLessThan(1_000_000)
    // On a flat price, what was lost is exactly charges plus slippage
    expect(1_000_000 - r.equity.at(-1)!).toBeCloseTo(r.totals.charges + r.totals.slippage, 4)
  })

  it('pays capital gains tax when the financial year closes', () => {
    const long = weekdays('2020-01-01', 420)
    const a = stock('A', long, i => 100 + i)
    // Buy in February, sell in June: a short-term gain in FY 2020, taxed in April 2021
    const once: Strategy = { name: 'once', targets: (ctx): Record<string, number> => (ctx.date < 20200501 ? { A: 1 } : {}) }
    const base = { ...FRICTIONLESS, start: long[0], end: long.at(-1)! }
    const before = simulate(market(long, [a]), once, base)
    const after = simulate(market(long, [a]), once, { ...base, tax: INDIA_EQUITY_TAX })
    const gain = before.equity.at(-1)! - 1_000_000
    expect(after.taxes.map(y => y.year)).toEqual([2019, 2020])
    expect(after.taxes[0].tax).toBe(0)
    expect(after.totals.tax).toBeCloseTo(gain * 0.2 * 1.04, 4)
    expect(before.equity.at(-1)! - after.equity.at(-1)!).toBeCloseTo(after.totals.tax, 4)
  })

  it('writes down a holding that is delisted', () => {
    const a = stock('A', sessions, () => 100, { until: 100 })
    const r = simulate(market(sessions, [a]), hold({ A: 1 }), { ...FRICTIONLESS, delistingHaircut: 0.2, start: sessions[0], end: sessions.at(-1)! })
    expect(r.delistings).toHaveLength(1)
    expect(r.equity.at(-1)).toBeCloseTo(800_000, 4)
  })

  it('keeps cash for a target that is not trading on the rebalance day', () => {
    const feb = sessions.findIndex(d => d >= 20200201)
    const b = stock('B', sessions, () => 50)
    const halted = { ...b, dates: b.dates.filter((_, i) => i !== feb), fill: b.fill.filter((_, i) => i !== feb),
      close: b.close.filter((_, i) => i !== feb), turnover: b.turnover.filter((_, i) => i !== feb), dividendFactor: b.dividendFactor.filter((_, i) => i !== feb),
      deliveryShare: b.deliveryShare.filter((_, i) => i !== feb), resultsDates: b.resultsDates }
    const r = simulate(market(sessions, [stock('A', sessions, () => 100), halted]), hold({ A: 0.5, B: 0.5 }),
      { ...FRICTIONLESS, start: sessions[0], end: sessions[feb + 5] })
    expect(r.trades.map(t => t.symbol)).toEqual(['A'])
    expect(r.rebalances[0].investedPct).toBeCloseTo(50, 6)
  })

  it('resizes a holding only when it drifts beyond the band', () => {
    const a = stock('A', sessions, i => 100 * 1.002 ** i), b = stock('B', sessions, () => 100)
    const m = market(sessions, [a, b])
    const range = { start: sessions[0], end: sessions.at(-1)! }
    const tight = simulate(m, hold({ A: 0.5, B: 0.5 }), { ...FRICTIONLESS, ...range, band: 0 })
    const loose = simulate(m, hold({ A: 0.5, B: 0.5 }), { ...FRICTIONLESS, ...range, band: 0.5 })
    expect(tight.trades.length).toBeGreaterThan(loose.trades.length)
    expect(loose.trades).toHaveLength(2)
  })

  it('never lets a strategy see data after the signal date', () => {
    // Record what the strategy sees, then rerun on a market whose future is different
    const seen: string[] = []
    const spy = (log: string[]): Strategy => ({
      name: 'spy',
      targets(ctx: StrategyContext): Record<string, number> {
        const bars = ctx.bars('A', 500)
        log.push(`${ctx.date}:${bars.length}:${bars.at(-1)?.date}:${bars.at(-1)?.close}:${ctx.universe(10).join(',')}`)
        expect(Number(bars.at(-1)!.date.replaceAll('-', ''))).toBeLessThanOrEqual(ctx.date)
        return bars.at(-1)!.close > 100 ? { A: 1 } : {}
      },
    })
    const cut = 150
    const original = market(sessions, [stock('A', sessions, i => 100 + Math.sin(i / 7) * 5)])
    const altered = market(sessions, [stock('A', sessions, i => (i <= cut ? 100 + Math.sin(i / 7) * 5 : 999))])
    const range = { ...FRICTIONLESS, start: sessions[0], end: sessions[cut] }
    const r1 = simulate(original, spy(seen), range)
    const seen2: string[] = []
    const r2 = simulate(altered, spy(seen2), range)
    expect(seen2).toEqual(seen)
    expect(r2.equity).toEqual(r1.equity)
    expect(r2.trades).toEqual(r1.trades)
  })

  it('rejects weights that add up to more than the portfolio', () => {
    const a = stock('A', sessions, () => 100)
    expect(() => simulate(market(sessions, [a]), hold({ A: 1.5 }), { ...FRICTIONLESS, start: sessions[0], end: sessions.at(-1)! })).toThrow(/invalid target weights/)
  })

  it('equal-weight benchmark holds every universe member', () => {
    const m = market(sessions, [stock('A', sessions, () => 100), stock('B', sessions, () => 10), stock('C', sessions, () => 1)])
    const r = simulate(m, equalWeightUniverse(500), { ...FRICTIONLESS, start: sessions[0], end: sessions.at(-1)! })
    expect(r.rebalances[0]).toMatchObject({ positions: 3 })
    expect(r.rebalances[0].investedPct).toBeCloseTo(100, 6)
  })
})

describe('TaxLedger', () => {
  it('taxes short-term gains at 20% plus cess', () => {
    const t = new TaxLedger()
    t.buy('A', 100, 10_000, 20240501)
    t.sell('A', 100, 15_000, 20241101)
    expect(t.settleYear(2024)).toMatchObject({ shortTermGain: 5000, longTermGain: 0, tax: 5000 * 0.2 * 1.04 })
  })

  it('taxes long-term gains at 12.5% above the exemption', () => {
    const t = new TaxLedger()
    t.buy('A', 100, 1_000_000, 20230501)
    t.sell('A', 100, 1_500_000, 20240601)
    expect(t.settleYear(2024).tax).toBeCloseTo((500_000 - 125_000) * 0.125 * 1.04, 6)
  })

  it('matches lots first-in first-out, splitting short and long term', () => {
    const t = new TaxLedger()
    t.buy('A', 100, 10_000, 20230101)   // long-term by the sale
    t.buy('A', 100, 20_000, 20240301)   // short-term
    t.sell('A', 150, 45_000, 20240601)  // 300 a unit
    const y = t.settleYear(2024)
    expect(y.longTermGain).toBeCloseTo(100 * (300 - 100), 6)
    expect(y.shortTermGain).toBeCloseTo(50 * (300 - 200), 6)
  })

  it('sets a short-term loss against a long-term gain in the same year', () => {
    const t = new TaxLedger()
    t.buy('A', 1, 1_000_000, 20220101)
    t.sell('A', 1, 1_500_000, 20240601)   // long-term gain 500,000
    t.buy('B', 1, 300_000, 20240501)
    t.sell('B', 1, 100_000, 20240901)     // short-term loss 200,000
    expect(t.settleYear(2024).tax).toBeCloseTo((300_000 - 125_000) * 0.125 * 1.04, 6)
  })

  it('carries losses forward, long-term losses only against long-term gains', () => {
    const t = new TaxLedger()
    t.buy('A', 1, 500_000, 20220101)
    t.sell('A', 1, 300_000, 20240601)     // long-term loss 200,000
    expect(t.settleYear(2024).tax).toBe(0)
    t.buy('B', 1, 100_000, 20250501)
    t.sell('B', 1, 200_000, 20250901)     // short-term gain 100,000: not reduced by the long-term loss
    expect(t.settleYear(2025).tax).toBeCloseTo(100_000 * 0.2 * 1.04, 6)
    t.buy('C', 1, 100_000, 20240501)
    t.sell('C', 1, 600_000, 20260601)     // long-term gain 500,000, less the carried 200,000
    expect(t.settleYear(2026).tax).toBeCloseTo((300_000 - 125_000) * 0.125 * 1.04, 6)
  })

  it('names the financial year by its starting year', () => {
    expect(financialYear(20250331)).toBe(2024)
    expect(financialYear(20250401)).toBe(2025)
  })
})

describe('metrics', () => {
  // 10% a year for two years, on month-ends
  const dates = [20200101, 20200630, 20201231, 20210630, 20211231]
  const curve = { dates, equity: [100, 105, 110, 100, 121] }

  it('computes CAGR, drawdown and calendar years', () => {
    const s = periodStats(curve)
    expect(s.cagrPct).toBeCloseTo(10, 1)
    expect(s.maxDrawdownPct).toBeCloseTo((100 / 110 - 1) * 100, 6)
    expect(s).toMatchObject({ drawdownFrom: 20201231, drawdownTo: 20210630 })
    expect(calendarYearReturns(curve)[2021]).toBeCloseTo(10, 6)
  })

  it('compares with a benchmark on the same dates', () => {
    const bench = align({ dates: [20200101, 20211231], equity: [100, 100] }, dates)
    const c = compare(curve, bench)
    expect(c.excessCagrPct).toBeCloseTo(10, 1)
    expect(c.yearsAheadPct).toBe(100)
    expect(monthly(curve).dates).toEqual([20200101, 20200630, 20201231, 20210630, 20211231])
  })
})

describe('factors', () => {
  /** 300 daily bars drifting at `drift` a day with a wobble of size `noise`. */
  const bars = (drift: number, noise: number, delivery = 0.5): DailyBar[] =>
    Array.from({ length: 300 }, (_, i) => {
      const close = 100 * (1 + drift) ** i * (1 + noise * Math.sin(i * 1.7))
      return { date: `d${i}`, close, volume: 1e7, deliveryQty: (i >= 279 ? delivery : 0.5) * 1e7 }
    })
  const universe = { UP: bars(0.002, 0.01), FLAT: bars(0, 0.01), DOWN: bars(-0.002, 0.01), WILD: bars(0.002, 0.05), CALM: bars(0.0005, 0.001) }

  it('ranks risk-adjusted momentum exactly as the Monthly Plan ranking does', () => {
    expect(rankByFactors(universe, ['momentum']).map(r => r.symbol)).toEqual(rankMomentum(universe).ranked.map(r => r.symbol))
  })

  it('scores each factor in the stated direction', () => {
    expect(FACTORS.momentumRaw.score(universe.UP)!).toBeGreaterThan(FACTORS.momentumRaw.score(universe.DOWN)!)
    expect(FACTORS.lowVolatility.score(universe.CALM)!).toBeGreaterThan(FACTORS.lowVolatility.score(universe.WILD)!)
    expect(FACTORS.high52w.score(universe.UP)!).toBeGreaterThan(FACTORS.high52w.score(universe.DOWN)!)
    expect(FACTORS.deliveryRise.score(bars(0, 0.01, 0.9))!).toBeGreaterThan(FACTORS.deliveryRise.score(bars(0, 0.01, 0.2))!)
    expect(FACTORS.deliveryRise.score(universe.UP.map(b => ({ ...b, deliveryQty: null })))).toBeNull()
  })

  it('averages percentile ranks when several factors are combined', () => {
    const ranked = rankByFactors(universe, ['momentumRaw', 'lowVolatility'])
    // CALM is mid-table on momentum but the least volatile; WILD ties UP on momentum but is the most volatile
    expect(ranked.map(r => r.symbol).indexOf('CALM')).toBeLessThan(ranked.map(r => r.symbol).indexOf('WILD'))
    expect(ranked.every(r => r.score >= 0 && r.score <= 1)).toBe(true)
  })

  it('leaves out stocks that are illiquid or have under a year of history', () => {
    const thin = bars(0.003, 0.01).map(b => ({ ...b, volume: 10 }))
    expect(rankByFactors({ ...universe, THIN: thin, NEW: bars(0.003, 0.01).slice(0, 200) }, ['momentum']).map(r => r.symbol)).not.toContain('THIN')
    expect(rankByFactors({ NEW: bars(0.003, 0.01).slice(0, 200) }, ['momentum'])).toEqual([])
  })
})

describe('strategy builders', () => {
  const sessions = weekdays('2019-01-01', 560)
  const names = ['A', 'B', 'C', 'D', 'E', 'F']
  // Six stocks with steadily different drifts, so the momentum order is A > B > ... > F
  const m = market(sessions, names.map((s, k) => stock(s, sessions, i => 100 * (1 + (0.002 - k * 0.0006)) ** i)))
  const range = { ...FRICTIONLESS, start: sessions[0], end: sessions.at(-1)! }

  it('the generic momentum portfolio trades exactly like the Monthly Plan stock book', () => {
    const app = simulate(m, stockMomentum({ topN: 2 }), range)
    const generic = simulate(m, factorPortfolio({ factors: ['momentum'], topN: 2 }), range)
    expect(generic.trades).toEqual(app.trades)
    expect(app.trades.length).toBeGreaterThan(0)
  })

  it('a holding buffer keeps a stock that has slipped but is still inside the exit rank', () => {
    const ctx = (holdings: string[]): StrategyContext => ({
      date: sessions.at(-1)!, universe: () => names, holdings: new Map(holdings.map(s => [s, 0.5])),
      bars: (symbol, count) => {
        const s = m.stocks.get(symbol)!
        return Array.from(s.close).slice(-count).map((close, i) => ({ date: `d${i}`, close, volume: 1e9 / close }))
      },
      indexBars: () => [], resultsDates: () => [],
    })
    const plain = factorPortfolio({ factors: ['momentumRaw'], topN: 2 })
    const buffered = factorPortfolio({ factors: ['momentumRaw'], topN: 2, exitRank: 4 })
    expect(Object.keys(plain.targets(ctx(['C', 'D']))).sort()).toEqual(['A', 'B'])
    expect(Object.keys(buffered.targets(ctx(['C', 'D']))).sort()).toEqual(['C', 'D'])
    // F is below the exit rank: it goes, and the freed slot is filled from the top
    expect(Object.keys(buffered.targets(ctx(['C', 'F']))).sort()).toEqual(['A', 'C'])
  })

  it('a volatility target scales the book down in a turbulent market and never above fully invested', () => {
    const base: Strategy = { name: 'base', targets: () => ({ A: 0.5, B: 0.5 }) }
    const index = (swing: number) => Array.from({ length: 61 }, (_, i) => ({ date: `d${i}`, close: 100 * (1 + (i % 2 ? swing : -swing)) }))
    const ctx = (swing: number): StrategyContext => ({ date: 0, universe: () => [], bars: () => [], holdings: new Map(), resultsDates: () => [], indexBars: () => index(swing) })
    const wild = withVolatilityTarget(base, 0.15).targets(ctx(0.02))
    expect(wild.A + wild.B).toBeLessThan(0.5)
    expect(wild.A).toBeCloseTo(wild.B, 12)
    const calm = withVolatilityTarget(base, 0.15).targets(ctx(0.001))
    expect(calm).toEqual({ A: 0.5, B: 0.5 })
  })
})

describe('earningsReaction', () => {
  const day = (i: number) => `2024-05-${String(i + 1).padStart(2, '0')}`
  const bars = (closes: number[]): DailyBar[] => closes.map((close, i) => ({ date: day(i), close, volume: 1e6 }))
  const flatMarket = new Map(Array.from({ length: 10 }, (_, i) => [day(i), 1000]))

  it('is the move from the close before results to the close after, less the market', () => {
    // Results on the 3rd: 100 the day before, 112 the day after
    expect(earningsReaction(bars([100, 100, 108, 112, 113]), [day(2)], flatMarket)).toBeCloseTo(0.12, 10)
    const rising = new Map(flatMarket).set(day(3), 1050)
    expect(earningsReaction(bars([100, 100, 108, 112, 113]), [day(2)], rising)).toBeCloseTo(0.07, 10)
  })

  it('waits for the session after the results before using them', () => {
    expect(earningsReaction(bars([100, 100, 108]), [day(2)], flatMarket)).toBeNull()
  })

  it('ignores results older than the window and stocks with none', () => {
    expect(earningsReaction(bars([100, 100, 108, 112, 113, 114, 115]), [day(1)], flatMarket, 3)).toBeNull()
    expect(earningsReaction(bars([100, 101]), [], flatMarket)).toBeNull()
  })
})
