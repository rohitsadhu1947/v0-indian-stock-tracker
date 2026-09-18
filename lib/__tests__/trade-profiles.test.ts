import { describe, it, expect } from 'vitest'
import { getProfile, calculateTradeLevels, calculateTradeSize, TRADE_PROFILES } from '../trade-profiles'
import { calculateTradeCosts, roundTripCostPercent, applySlippage, DEFAULT_COSTS } from '../backtest/costs'

describe('trade profiles', () => {
  it('swing profile aims for 10-15% with reward > risk', () => {
    const p = TRADE_PROFILES.swing
    expect(p.target1Pct).toBeCloseTo(0.10)
    expect(p.target2Pct).toBeCloseTo(0.15)
    expect(p.target1Pct).toBeGreaterThan(p.maxStopPct) // reward beats worst-case risk
  })

  it('intraday profile risks more than it targets (documents the old behaviour)', () => {
    const p = TRADE_PROFILES.intraday
    expect(p.target1Pct).toBeLessThan(p.maxStopPct)
  })

  it('falls back to the swing profile for unknown ids', () => {
    expect(getProfile(undefined).id).toBe('swing')
    expect(getProfile('nonsense').id).toBe('swing')
  })
})

describe('calculateTradeLevels', () => {
  const profile = TRADE_PROFILES.swing

  it('uses the ATR stop when it sits inside the cap', () => {
    // 2.5 x ATR 15 = 37.5 below 1000 => 3.75%, within the 6% cap and above the 3% floor
    const l = calculateTradeLevels({ entryPrice: 1000, atr: 15, profile })
    expect(l.stopLoss).toBeCloseTo(962.5)
    expect(l.target1).toBeCloseTo(1100)
    expect(l.target2).toBeCloseTo(1150)
    expect(l.rewardRisk).toBeGreaterThan(2.5)
  })

  it('caps the stop at maxStopPct for a volatile stock', () => {
    const l = calculateTradeLevels({ entryPrice: 1000, atr: 60, profile }) // would be 15% away
    expect(l.stopLoss).toBeCloseTo(940) // 6% cap
    expect(l.riskPercent).toBeCloseTo(6)
  })

  it('floors the stop at minStopPct for a very quiet stock', () => {
    const l = calculateTradeLevels({ entryPrice: 1000, atr: 1, profile })
    expect(l.stopLoss).toBeCloseTo(970) // 3% floor, not 0.25%
  })

  it('always yields reward/risk of at least ~1.6 on target 1', () => {
    for (const atr of [1, 5, 10, 25, 50, 100]) {
      const l = calculateTradeLevels({ entryPrice: 500, atr, profile })
      expect(l.rewardRisk).toBeGreaterThan(1.6)
    }
  })
})

describe('calculateTradeSize', () => {
  const profile = TRADE_PROFILES.swing

  it('sizes from risk, then lets the 25% capital cap bind', () => {
    // Risk budget 1.5% of 300k = 4500; 4500 / 37.5 = 120 shares = 120k,
    // which exceeds the 25% cap (75k), so the cap cuts it to 75.
    const s = calculateTradeSize({ capital: 300000, entryPrice: 1000, stopLoss: 962.5, profile })
    expect(s.quantity).toBe(75)
    expect(s.capitalRequired).toBe(75000)
    expect(s.riskAmount).toBeCloseTo(2812.5, 1)
  })

  it('sizes purely from risk when the capital cap does not bind', () => {
    // Cheaper stock: 4500 / 7.5 = 600 shares = 60k, under the 75k cap
    const s = calculateTradeSize({ capital: 300000, entryPrice: 100, stopLoss: 92.5, profile })
    expect(s.quantity).toBe(600)
    expect(s.riskAmount).toBeCloseTo(4500, 0)
  })

  it('caps capital per position (never 80% of the account in one name)', () => {
    // Tight stop would imply a huge position; 25% cap must bind
    const s = calculateTradeSize({ capital: 300000, entryPrice: 100, stopLoss: 99, profile })
    expect(s.capitalRequired).toBeLessThanOrEqual(300000 * 0.25 + 100)
  })

  it('returns zero for an invalid stop', () => {
    expect(calculateTradeSize({ capital: 300000, entryPrice: 100, stopLoss: 100, profile }).quantity).toBe(0)
    expect(calculateTradeSize({ capital: 300000, entryPrice: 100, stopLoss: 120, profile }).quantity).toBe(0)
  })
})

describe('trading costs', () => {
  it('round-trip delivery costs are roughly 0.25% of turnover', () => {
    const c = calculateTradeCosts(1000, 1000, 100, DEFAULT_COSTS)
    expect(c.costPercent).toBeGreaterThan(0.2)
    expect(c.costPercent).toBeLessThan(0.35)
  })

  it('costs plus slippage eat most of a 1.5% target but little of a 10% one', () => {
    const hurdle = roundTripCostPercent(1000, 100)
    expect(hurdle).toBeGreaterThan(0.4)   // ~0.45%: 30% of a 1.5% target
    expect(hurdle).toBeLessThan(1.0)      // under 10% of a 10% target
  })

  it('slippage moves the fill against you on both sides', () => {
    expect(applySlippage(100, 'BUY')).toBeGreaterThan(100)
    expect(applySlippage(100, 'SELL')).toBeLessThan(100)
  })

  it('STT dominates: a zero-brokerage trade still costs money', () => {
    const c = calculateTradeCosts(500, 550, 50, DEFAULT_COSTS)
    expect(c.totalCosts).toBeGreaterThan(0)
    expect(c.exitCosts).toBeGreaterThan(c.entryCosts - 20) // DP charge sits on the sell
  })
})
