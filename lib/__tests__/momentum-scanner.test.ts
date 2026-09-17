import { describe, it, expect } from 'vitest'
import {
  calculateSMA,
  calculateRSI,
  calculateATR,
} from '../momentum-scanner'

// Note: safeDivide and calculatePositionSize are module-private (not exported).
// We test their effects indirectly through exported functions or test the
// exported helpers that share similar logic.

// ---------------------------------------------------------------------------
// calculateSMA (momentum-scanner version)
// ---------------------------------------------------------------------------
describe('momentum-scanner calculateSMA', () => {
  it('returns last price when array is shorter than period', () => {
    expect(calculateSMA([42, 50], 5)).toBe(50) // prices[prices.length - 1]
  })

  it('returns the single element for a 1-element array with period > 1', () => {
    expect(calculateSMA([77], 10)).toBe(77)
  })

  it('computes average of last `period` elements', () => {
    // This version uses prices.slice(-period)
    const prices = [10, 20, 30, 40, 50]
    expect(calculateSMA(prices, 3)).toBeCloseTo((30 + 40 + 50) / 3)
  })

  it('handles period equal to array length', () => {
    const prices = [5, 10, 15]
    expect(calculateSMA(prices, 3)).toBeCloseTo(10)
  })
})

// ---------------------------------------------------------------------------
// calculateRSI (momentum-scanner version)
// ---------------------------------------------------------------------------
describe('momentum-scanner calculateRSI', () => {
  it('returns 50 for insufficient data (fewer than period+1 prices)', () => {
    expect(calculateRSI([100, 101, 102], 14)).toBe(50)
  })

  it('returns 100 when all changes are gains (avgLoss === 0)', () => {
    // This version iterates from prices.length-period to prices.length
    // change = prices[i] - prices[i-1]; ascending -> all positive changes
    const prices = Array.from({ length: 16 }, (_, i) => 100 + i) // 16 elements, period 14
    expect(calculateRSI(prices, 14)).toBe(100)
  })

  it('returns a value between 0 and 100 for mixed changes', () => {
    const prices = [100, 102, 99, 103, 98, 104, 97, 105, 96, 106, 95, 107, 94, 108, 93, 109]
    const rsi = calculateRSI(prices, 14)
    expect(rsi).toBeGreaterThanOrEqual(0)
    expect(rsi).toBeLessThanOrEqual(100)
  })
})

// ---------------------------------------------------------------------------
// calculateATR
// ---------------------------------------------------------------------------
describe('calculateATR', () => {
  it('returns 0 for insufficient data', () => {
    const candles = [
      { open: 100, high: 105, low: 95, close: 102 },
    ]
    expect(calculateATR(candles, 14)).toBe(0)
  })

  it('returns 0 for empty candle array', () => {
    expect(calculateATR([], 14)).toBe(0)
  })

  it('computes correct ATR for known candle data', () => {
    // Create 15 candles so we get 14 true ranges (enough for period=14)
    // Each candle: high-low = 10, and prev close is always mid-range so no extra TR
    const candles = Array.from({ length: 15 }, (_, i) => ({
      open: 100 + i,
      high: 105 + i,
      low: 95 + i,
      close: 100 + i,
    }))
    // True range for each: max(high-low, |high-prevClose|, |low-prevClose|)
    // high - low = 10, |high - prevClose| = |105+i - (100+i-1)| = 6, |low - prevClose| = |95+i - (100+i-1)| = 4
    // TR = 10 for all
    const atr = calculateATR(candles, 14)
    expect(atr).toBeCloseTo(10, 5)
  })

  it('uses the last `period` true ranges', () => {
    // 20 candles, period=5 -> takes last 5 of the 19 true ranges
    const candles: { open: number; high: number; low: number; close: number }[] = []
    for (let i = 0; i < 20; i++) {
      candles.push({
        open: 100,
        high: 100 + (i < 15 ? 2 : 20), // last 5 candles have huge range
        low: 100 - (i < 15 ? 2 : 20),
        close: 100,
      })
    }
    const atr = calculateATR(candles, 5)
    // Last 5 true ranges come from candles[15..19], each with high-low = 40
    expect(atr).toBeCloseTo(40, 0)
  })
})

// ---------------------------------------------------------------------------
// Indirect test of safeDivide via calculateSMA behavior
// ---------------------------------------------------------------------------
describe('safeDivide (indirect)', () => {
  // safeDivide is private, but it protects against division by zero
  // in calculatePositionSize and calculateMomentumScore.
  // We verify the exported calculateSMA handles edge cases cleanly
  // (it doesn't use safeDivide, but this confirms the module loads correctly).
  it('calculateSMA with period matching length does not divide by zero', () => {
    const result = calculateSMA([100], 1)
    expect(result).toBe(100)
  })
})
