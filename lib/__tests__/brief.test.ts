import { describe, expect, it } from 'vitest'
import { buildBrief, indexMove } from '../brief/core'
import type { ScreenRow } from '../screener/service'

const row = (symbol: string, sector: string, dayPct: number, over: Partial<ScreenRow> = {}): ScreenRow => ({
  symbol, sector, nifty100: false, ranks: {}, close: 100, date: '2026-11-17', dayPct, weekPct: dayPct * 2, monthPct: 0,
  momentumPct: 0, volatilityPct: 20, belowHighPct: 10, vs50Pct: 1, vs200Pct: 1, trend: 'up', volumeRatio: 1, deliveryPct: 50, tradedCr: 100,
  ...over,
})

const rows = [
  ...['A', 'B', 'C', 'D', 'E'].map((s, i) => row(s, 'Banks', i + 1)),
  ...['V', 'W', 'X', 'Y', 'Z'].map((s, i) => row(s, 'Metals', -(i + 1), { trend: 'down' })),
  row('HIGH', 'Other', 0.5, { belowHighPct: 0, volumeRatio: 4 }),
]

describe('morning brief', () => {
  it('works out index moves from closes', () => {
    const move = indexMove('NIFTY 50', [100, 101, 102, 103, 104, 110])!
    expect(move.close).toBe(110)
    expect(move.dayPct).toBeCloseTo((110 / 104 - 1) * 100)
    expect(move.weekPct).toBeCloseTo(10)
    expect(indexMove('X', [])).toBeNull()
    expect(indexMove('X', [5])!.dayPct).toBeNull()
  })

  it('counts breadth, ranks sectors and lists movers', () => {
    const b = buildBrief({ asOf: '2026-11-17', rows, indices: [{ name: 'NIFTY 500', close: 1, dayPct: -0.42, weekPct: 1.2 }], held: [], filings: [] })
    expect(b.breadth).toMatchObject({ stocks: 11, rose: 6, fell: 5, uptrend: 6, downtrend: 5, atHigh: 1, heavyVolume: 1 })
    expect(b.sectors.map(s => s.sector)).toEqual(['Banks', 'Metals'])   // 'Other' has too few stocks
    expect(b.sectors[0]).toMatchObject({ stocks: 5, dayPct: 3, rising: 5 })
    expect(b.gainers[0].symbol).toBe('E')
    expect(b.losers[0].symbol).toBe('Z')
    expect(b.atHigh).toEqual(['HIGH'])
    expect(b.heavyVolume[0]).toMatchObject({ symbol: 'HIGH', volumeRatio: 4 })
    expect(b.summary[0]).toBe('NIFTY 500 fell 0.4% on 2026-11-17 and is +1.2% over five sessions.')
    expect(b.summary[1]).toBe('6 of 11 NIFTY 500 stocks rose and 5 fell. 55% are above both their 50-day and 200-day averages.')
    expect(b.summary[2]).toBe('Strongest sector: Banks (+3.0% on average). Weakest: Metals (-3.0%).')
  })

  it('puts the paper book first by size of move and flags its filings', () => {
    const filing = { symbol: 'Z', category: 'orders', text: 'won an order', url: 'u', publishedAt: '2026-11-17T12:00:00Z', rank: 40 }
    const b = buildBrief({ asOf: '2026-11-17', rows, indices: [], held: ['A', 'Z'], filings: [filing, { ...filing, symbol: 'B' }] })
    expect(b.book.map(m => m.symbol)).toEqual(['Z', 'A'])
    expect(b.filings.map(f => f.held)).toEqual([true, false])
    expect(b.summary.at(-1)).toBe('Z in your paper book has a new filing.')
    expect(b.filingsAvailable).toBe(true)
  })

  it('says when filings are not being collected', () => {
    expect(buildBrief({ asOf: '2026-11-17', rows, indices: [], held: [], filings: null }).filingsAvailable).toBe(false)
  })
})
