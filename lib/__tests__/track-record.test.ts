import { describe, expect, it } from 'vitest'
import { DEFAULT_COSTS } from '../backtest/costs'
import { frozenStrategy, marketFromBars, modeRecord, pickOutcomes, type BarRow, type FrozenSignal } from '../portfolio/track-record-core'
import type { StrategyContext } from '../research/simulate'

const NO_COSTS = { ...DEFAULT_COSTS, sttPercent: 0, exchangeTxnPercent: 0, sebiPercent: 0, stampDutyPercent: 0, dpChargePerSell: 0, slippagePercent: 0 }
const FRICTIONLESS = { costs: NO_COSTS, cashYield: 0 }

/** Weekday sessions from 27 Oct 2026 to mid-December. */
const sessions: number[] = []
for (const d = new Date('2026-10-27T00:00:00Z'); sessions.length < 36; d.setUTCDate(d.getUTCDate() + 1)) {
  if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) sessions.push(Number(d.toISOString().slice(0, 10).replaceAll('-', '')))
}
const OCT_END = 20261030, NOV_END = 20261130

/** A stock at `price(i)` all day on session i, trading 1,000 shares. */
const bars = (symbol: string, price: (i: number) => number): BarRow[] =>
  sessions.map((date, i) => ({ symbol, date, low: price(i), high: price(i), close: price(i), volume: 1000, turnover: price(i) * 1000 }))
const index = (symbol: string, level: (i: number) => number) => sessions.map((date, i) => ({ symbol, date, close: level(i) }))

const market = marketFromBars(
  [...bars('UP', i => 100 + i), ...bars('FLAT', () => 50), ...bars('DOWN', i => 200 - i)],
  [...index('IDX:NIFTY 50', () => 1000), ...index('IDX:NIFTY 500', i => 1000 + i)],
  'IDX:NIFTY 50',
)
const ctx = (date: number, holdings: Record<string, number> = {}): StrategyContext => ({
  date, universe: () => [], bars: () => [], indexBars: () => [], resultsDates: () => [], holdings: new Map(Object.entries(holdings)),
})

describe('frozenStrategy', () => {
  const signals: FrozenSignal[] = [{ signalDate: OCT_END, picks: ['UP', 'FLAT'], trendInvested: false }]

  it('returns the recorded picks at equal weight on their signal date', () => {
    expect(frozenStrategy(signals, false).targets(ctx(OCT_END))).toEqual({ UP: 0.05, FLAT: 0.05 })
  })

  it('holds cash on that date when the trend filter was not invested', () => {
    expect(frozenStrategy(signals, true).targets(ctx(OCT_END))).toEqual({})
  })

  it('keeps the book unchanged in a month with no record', () => {
    expect(frozenStrategy(signals, false).targets(ctx(NOV_END, { UP: 0.06, FLAT: 0.04 }))).toEqual({ UP: 0.06, FLAT: 0.04 })
  })
})

describe('marketFromBars', () => {
  it('fills at the day\'s average price, kept inside its range', () => {
    const m = marketFromBars([
      { symbol: 'A', date: 20261102, low: 99, high: 103, close: 102, volume: 1000, turnover: 101_000 },
      { symbol: 'A', date: 20261103, low: 99, high: 103, close: 102, volume: 1000, turnover: 500_000 },
      { symbol: 'A', date: 20261104, low: 99, high: 103, close: 102, volume: 0, turnover: null },
    ], [{ symbol: 'IDX:NIFTY 50', date: 20261102, close: 1 }], 'IDX:NIFTY 50')
    expect(Array.from(m.stocks.get('A')!.fill)).toEqual([101, 103, 102])
  })
})

describe('pickOutcomes', () => {
  const signals: FrozenSignal[] = [
    { signalDate: OCT_END, picks: ['UP', 'DOWN'], trendInvested: true },
    { signalDate: NOV_END, picks: ['UP', 'FLAT'], trendInvested: true },
  ]
  const outcomes = pickOutcomes(market, signals, market.indices.get('IDX:NIFTY 500'))
  const of = (symbol: string) => outcomes.find(o => o.symbol === symbol)!
  const at = (date: number) => sessions.indexOf(date)

  it('enters the session after the signal and measures a held pick to the latest close', () => {
    const entry = at(OCT_END) + 1
    expect(of('UP')).toMatchObject({ entryDate: sessions[entry], entryPrice: 100 + entry, exitDate: null, rank: 1 })
    expect(of('UP').returnPct).toBeCloseTo(((100 + sessions.length - 1) / (100 + entry) - 1) * 100, 10)
  })

  it('closes a dropped pick the session after the signal that dropped it', () => {
    const exit = at(NOV_END) + 1
    expect(of('DOWN').exitDate).toBe(sessions[exit])
    expect(of('DOWN').lastPrice).toBe(200 - exit)
    expect(of('DOWN').returnPct).toBeLessThan(0)
  })

  it('counts a pick once, from the signal that first included it', () => {
    expect(outcomes.filter(o => o.symbol === 'UP')).toHaveLength(1)
    expect(of('FLAT').signalDate).toBe(NOV_END)
  })

  it('reports the index over the same days', () => {
    const entry = at(OCT_END) + 1
    expect(of('UP').benchmarkPct).toBeCloseTo(((1000 + sessions.length - 1) / (1000 + entry) - 1) * 100, 10)
  })
})

describe('modeRecord', () => {
  it('replays the frozen picks through the simulator and reports the index over the same span', () => {
    const signals: FrozenSignal[] = [{ signalDate: OCT_END, picks: ['UP'], trendInvested: false }]
    const record = modeRecord(market, signals, ['IDX:NIFTY 500', 'IDX:MISSING'], { ...FRICTIONLESS, tax: null })!
    const entry = sessions.indexOf(OCT_END) + 1, last = sessions.length - 1
    // 5% of the book in UP (one of 20 equal slots), the rest in cash
    expect(record.afterTax.returnPct).toBeCloseTo(0.05 * ((100 + last) / (100 + entry) - 1) * 100, 6)
    expect(record.withTrendFilterAfterTax.returnPct).toBeCloseTo(0, 10)
    expect(record.benchmarks['IDX:NIFTY 500']).toBeCloseTo(((1000 + last) / (1000 + sessions.indexOf(OCT_END)) - 1) * 100, 10)
    expect(record.benchmarks['IDX:MISSING']).toBeNull()
    expect(record).toMatchObject({ started: OCT_END, asOf: sessions[last], signals: 1 })
  })

  it('is null before any session follows the first signal', () => {
    const early = marketFromBars(bars('UP', () => 1).slice(0, 4), index('IDX:NIFTY 50', () => 1).slice(0, 4), 'IDX:NIFTY 50')
    expect(modeRecord(early, [{ signalDate: OCT_END, picks: ['UP'], trendInvested: true }], [])).toBeNull()
    expect(modeRecord(market, [], [])).toBeNull()
  })
})
