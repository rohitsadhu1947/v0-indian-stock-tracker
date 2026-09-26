import { describe, it, expect } from 'vitest'
import { computeStockCheck, percentileOf } from '../stock-check'
import type { DailyBar } from '../portfolio/momentum'

function series(n: number, f: (i: number) => number, volume = 1_000_000): DailyBar[] {
  return Array.from({ length: n }, (_, i) => ({
    date: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10),
    close: f(i),
    volume,
  }))
}

const base = {
  universeScoresSorted: [-2, -1, -0.5, 0, 0.5, 1, 1.5, 2, 3, 4],
  universeMedianVolPct: 30,
  capital: 300000,
  maxLossPct: 1,
  inNifty500: true,
  industry: 'Test',
  inMomentumBook: false,
}

describe('percentileOf', () => {
  it('places a value within a sorted distribution', () => {
    expect(percentileOf([1, 2, 3, 4], 0)).toBe(0)
    expect(percentileOf([1, 2, 3, 4], 2.5)).toBe(50)
    expect(percentileOf([1, 2, 3, 4], 10)).toBe(100)
  })
})

describe('stock check', () => {
  it('flags a collapsing, very volatile, thin stock (the SpiceJet case)', () => {
    // Falls ~70% over the year with big daily swings and ~Rs 0.3 Cr/day traded
    const bars = series(320, i => 100 * Math.pow(0.996, i) * (1 + 0.08 * Math.sin(i * 1.9)), 100_000)
    const r = computeStockCheck({ ...base, symbol: 'DISTRESSED', bars, inNifty500: false })
    const sev = Object.fromEntries(r.checks.map(c => [c.id, c.severity]))

    expect(sev.volatility).toBe('warning')
    expect(sev.liquidity).toBe('warning')
    expect(sev.trend).toBe('caution')
    expect(sev.drawdown).toBe('caution')
    expect(r.checks.some(c => c.severity === 'positive')).toBe(false)
    // Very volatile -> wide stop -> small position for the same Rs 3,000 risk
    expect(r.sizing.maxPositionValue!).toBeLessThan(30000)
  })

  it('reports a steady liquid uptrend without warnings', () => {
    const bars = series(320, i => 100 * Math.pow(1.0015, i) * (1 + 0.004 * Math.sin(i)), 5_000_000)
    const r = computeStockCheck({ ...base, symbol: 'STEADY', bars })
    expect(r.checks.filter(c => c.severity === 'warning')).toHaveLength(0)
    expect(r.checks.find(c => c.id === 'trend')?.severity).toBe('positive')
    expect(r.metrics.above200dma).toBe(true)
  })

  it('sizes positions so a stop-out loses about the chosen amount', () => {
    const bars = series(320, i => 500 * (1 + 0.02 * Math.sin(i * 1.3)), 5_000_000)
    const r = computeStockCheck({ ...base, symbol: 'X', bars, capital: 500000, maxLossPct: 1 })
    const { maxPositionValue, suggestedStopPct, maxLossAmount } = r.sizing
    expect(maxLossAmount).toBe(5000)
    expect(maxPositionValue! * (suggestedStopPct! / 100)).toBeCloseTo(5000, 0)
    expect(suggestedStopPct!).toBeGreaterThanOrEqual(4)
    expect(suggestedStopPct!).toBeLessThanOrEqual(25)
  })

  it('never suggests a position larger than the capital', () => {
    const bars = series(320, () => 100, 5_000_000).map((b, i) => ({ ...b, close: 100 + (i % 2) * 0.01 }))
    const r = computeStockCheck({ ...base, symbol: 'FLAT', bars, capital: 100000, maxLossPct: 5 })
    expect(r.sizing.maxPositionValue!).toBeLessThanOrEqual(100000)
  })

  it('handles short histories without inventing numbers', () => {
    const bars = series(40, i => 100 + i)
    const r = computeStockCheck({ ...base, symbol: 'NEW', bars })
    expect(r.metrics.return1yPct).toBeNull()
    expect(r.metrics.momentumPercentile).toBeNull()
    expect(r.metrics.above200dma).toBeNull()
    expect(r.sizing.maxPositionValue).toBeNull() // under 60 bars: no volatility estimate
  })

  it('rates each check with an evidence level', () => {
    const bars = series(320, i => 100 + i * 0.1, 5_000_000)
    const r = computeStockCheck({ ...base, symbol: 'Y', bars })
    const ev = Object.fromEntries(r.checks.map(c => [c.id, c.evidence]))
    expect(ev.volatility).toBe('strong')
    expect(ev.liquidity).toBe('strong')
    expect(ev.momentum).toBe('moderate')
    expect(ev.trend).toBe('weak')
  })
})
