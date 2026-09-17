import { describe, it, expect } from 'vitest'
import {
  calculateSMA,
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  generateTradingSignal,
} from '../market-utils'

// ---------------------------------------------------------------------------
// calculateSMA
// ---------------------------------------------------------------------------
describe('calculateSMA', () => {
  it('returns null when prices array is shorter than period', () => {
    expect(calculateSMA([1, 2], 5)).toBeNull()
  })

  it('returns null for empty array', () => {
    expect(calculateSMA([], 1)).toBeNull()
  })

  it('computes the average of the first `period` elements', () => {
    // SMA uses prices.slice(0, period)
    expect(calculateSMA([10, 20, 30, 40, 50], 3)).toBeCloseTo(20) // (10+20+30)/3
  })

  it('ignores elements beyond the period (uses first N)', () => {
    // The implementation slices [0, period), so extra trailing values are ignored
    expect(calculateSMA([2, 4, 6, 100, 200], 3)).toBeCloseTo(4) // (2+4+6)/3
  })

  it('handles period equal to array length', () => {
    expect(calculateSMA([5, 10, 15], 3)).toBeCloseTo(10)
  })
})

// ---------------------------------------------------------------------------
// calculateRSI
// ---------------------------------------------------------------------------
describe('calculateRSI', () => {
  it('returns 50 for insufficient data (fewer than period+1 prices)', () => {
    expect(calculateRSI([100, 101, 102], 14)).toBe(50)
  })

  it('returns 95 when all changes are gains (avgLoss === 0)', () => {
    // 15 steadily increasing prices -> 14 positive changes, 0 losses
    const prices = Array.from({ length: 15 }, (_, i) => 100 + i) // [100..114]
    // NOTE: the implementation iterates i=1..period and computes prices[i-1] - prices[i]
    // For ascending array: prices[0]-prices[1] = -1 (loss), etc. So we need descending.
    // Actually let's re-read: change = prices[i-1] - prices[i]
    // For [100,101,...,114]: prices[0]-prices[1] = -1 -> loss
    // So all-gains means we need a descending sequence where every prices[i-1] > prices[i]
    const descending = Array.from({ length: 15 }, (_, i) => 200 - i) // [200,199,...,186]
    expect(calculateRSI(descending, 14)).toBe(95)
  })

  it('returns a value between 0 and 100 for mixed price changes', () => {
    // Alternating up/down
    const prices = [100, 102, 99, 103, 98, 104, 97, 105, 96, 106, 95, 107, 94, 108, 93]
    const rsi = calculateRSI(prices, 14)
    expect(rsi).toBeGreaterThanOrEqual(0)
    expect(rsi).toBeLessThanOrEqual(100)
  })

  it('computes correct RSI for a known sequence', () => {
    // 15 prices, period 14 -> 14 changes
    // Use descending sequence with one reversal to get a known ratio
    // prices[i-1] - prices[i]: change > 0 means gain
    // [110,108,106,104,102,100,98,96,94,92,90,88,86,84,82]
    // All changes: 110-108=2 gain, 108-106=2 gain, ... -> all gains of 2
    // That would be avgLoss=0 -> RSI=95, so let's add one loss:
    // [110,108,106,104,102,100,98,96,94,92,90,88,86,84,86]
    // change at i=14: prices[13]-prices[14] = 84-86 = -2 -> loss of 2
    // gains = 13*2 = 26, losses = 2
    // avgGain = 26/14, avgLoss = 2/14
    // RS = 26/2 = 13
    // RSI = 100 - 100/(1+13) = 100 - 7.14... = 92.86
    const prices = [110, 108, 106, 104, 102, 100, 98, 96, 94, 92, 90, 88, 86, 84, 86]
    const rsi = calculateRSI(prices, 14)
    expect(rsi).toBeCloseTo(92.86, 1)
  })
})

// ---------------------------------------------------------------------------
// calculateMACD
// ---------------------------------------------------------------------------
describe('calculateMACD', () => {
  it('returns zeros for insufficient data (< 26 prices)', () => {
    const prices = Array.from({ length: 25 }, (_, i) => 100 + i)
    const result = calculateMACD(prices)
    expect(result).toEqual({ macd: 0, signal: 0, histogram: 0 })
  })

  // Prices are NEWEST-FIRST (index 0 = latest), matching stock-fetcher output.
  it('is positive for a rising market', () => {
    // Chronologically 100 → 119.5, so newest-first starts at the top
    const newestFirst = Array.from({ length: 40 }, (_, i) => 119.5 - i * 0.5)
    const result = calculateMACD(newestFirst)
    expect(result.macd).toBeGreaterThan(0)
  })

  it('is negative for a falling market', () => {
    const newestFirst = Array.from({ length: 40 }, (_, i) => 100 + i * 0.5)
    const result = calculateMACD(newestFirst)
    expect(result.macd).toBeLessThan(0)
  })

  it('reflects the latest move, not the oldest one', () => {
    // 60 days falling, then 20 days rising sharply (chronological)
    const chronological = [
      ...Array.from({ length: 60 }, (_, i) => 200 - i),
      ...Array.from({ length: 20 }, (_, i) => 141 + i * 3),
    ]
    const result = calculateMACD([...chronological].reverse())
    expect(result.histogram).toBeGreaterThan(0)
  })

  it('signal line is a proper EMA(9) of MACD, not just macd * 0.2', () => {
    // With enough data points, the signal line should differ from macd * 0.2
    const prices = Array.from({ length: 50 }, (_, i) =>
      100 + Math.sin(i / 5) * 10 + i * 0.3
    )
    const result = calculateMACD(prices)
    // If signal were just macd*0.2, this check would catch it
    expect(result.signal).not.toBeCloseTo(result.macd * 0.2, 2)
  })

  it('histogram equals macd minus signal', () => {
    const prices = Array.from({ length: 50 }, (_, i) => 100 + i * 0.5)
    const result = calculateMACD(prices)
    expect(result.histogram).toBeCloseTo(result.macd - result.signal, 10)
  })

  it('returns equal macd and signal when macdLine has fewer than 9 elements', () => {
    // Exactly 26 prices -> macdLine has 1 element (< 9)
    const prices = Array.from({ length: 26 }, (_, i) => 100 + i)
    const result = calculateMACD(prices)
    expect(result.signal).toBe(result.macd)
    expect(result.histogram).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// calculateBollingerBands
// ---------------------------------------------------------------------------
describe('calculateBollingerBands', () => {
  it('returns zeros for insufficient data', () => {
    const result = calculateBollingerBands([100, 101], 20)
    expect(result).toEqual({ upper: 0, middle: 0, lower: 0 })
  })

  it('middle band equals SMA', () => {
    const prices = Array.from({ length: 20 }, (_, i) => 100 + i)
    const result = calculateBollingerBands(prices, 20)
    const expectedSMA = calculateSMA(prices, 20)
    expect(result.middle).toBeCloseTo(expectedSMA!, 10)
  })

  it('upper and lower bands are symmetric around middle', () => {
    const prices = Array.from({ length: 20 }, (_, i) => 100 + i)
    const result = calculateBollingerBands(prices, 20)
    const upperDist = result.upper - result.middle
    const lowerDist = result.middle - result.lower
    expect(upperDist).toBeCloseTo(lowerDist, 10)
  })

  it('bands collapse to middle when all prices are identical (zero stddev)', () => {
    const prices = Array(20).fill(100)
    const result = calculateBollingerBands(prices, 20)
    expect(result.upper).toBe(100)
    expect(result.middle).toBe(100)
    expect(result.lower).toBe(100)
  })
})

// ---------------------------------------------------------------------------
// generateTradingSignal
// ---------------------------------------------------------------------------
describe('generateTradingSignal', () => {
  it('returns HOLD with "Insufficient data" reason for fewer than 30 prices', () => {
    const prices = Array.from({ length: 29 }, (_, i) => 100 + i)
    const volumes = Array.from({ length: 29 }, () => 1000)
    const result = generateTradingSignal(120, prices, volumes)
    expect(result.signal).toBe('HOLD')
    expect(result.reason).toContain('Insufficient data')
    expect(result.indicators.rsi).toBe('N/A')
  })

  it('returns a valid TradingSignal shape for sufficient data', () => {
    const prices = Array.from({ length: 50 }, (_, i) => 100 + i * 0.5)
    const volumes = Array.from({ length: 50 }, () => 100000)
    const result = generateTradingSignal(125, prices, volumes)
    expect(['STRONG BUY', 'BUY', 'HOLD', 'SELL', 'STRONG SELL']).toContain(result.signal)
    expect(result.strength).toBeGreaterThanOrEqual(1)
    expect(result.strength).toBeLessThanOrEqual(5)
    expect(result.indicators).toHaveProperty('rsi')
    expect(result.indicators).toHaveProperty('macd')
    expect(result.indicators).toHaveProperty('bb_position')
  })
})
