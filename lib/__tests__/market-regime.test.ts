import { describe, it, expect } from 'vitest'
import { analyzeMarketRegime, type HistoricalBar } from '../market-regime'

// Chronological bars (oldest first), as returned by the broker
function bars(closes: number[]): HistoricalBar[] {
  return closes.map((close, i) => ({
    date: new Date(2026, 0, 1 + i),
    open: close,
    high: close * 1.005,
    low: close * 0.995,
    close,
    volume: 1_000_000,
  }))
}

describe('analyzeMarketRegime', () => {
  it('reports SMA50/SMA200 as unavailable with only 40 bars instead of faking them', () => {
    const result = analyzeMarketRegime(bars(Array.from({ length: 40 }, (_, i) => 20000 + i * 20)))
    expect(result.sma20).not.toBeNull()
    expect(result.sma50).toBeNull()
    expect(result.sma200).toBeNull()
    expect(result.priceVsSma200).toBe('N/A')
    expect(result.signals.some(s => s.includes('SMA200'))).toBe(false)
  })

  it('does not score a short uptrend as bearish', () => {
    const result = analyzeMarketRegime(bars(Array.from({ length: 40 }, (_, i) => 20000 + i * 20)))
    expect(['BULL', 'STRONG_BULL', 'SIDEWAYS']).toContain(result.regime)
  })

  it('computes a real SMA200 and a bull regime for a long uptrend', () => {
    const closes = Array.from({ length: 270 }, (_, i) => 18000 + i * 20)
    const result = analyzeMarketRegime(bars(closes))
    const expected200 = closes.slice(-200).reduce((a, b) => a + b, 0) / 200
    expect(result.sma200).toBeCloseTo(expected200, 6)
    expect(result.priceVsSma200).toBe('ABOVE')
    expect(['BULL', 'STRONG_BULL']).toContain(result.regime)
  })

  it('computes a bear regime for a long downtrend', () => {
    const closes = Array.from({ length: 270 }, (_, i) => 26000 - i * 20)
    const result = analyzeMarketRegime(bars(closes))
    expect(result.priceVsSma200).toBe('BELOW')
    expect(['BEAR', 'STRONG_BEAR']).toContain(result.regime)
  })
})
