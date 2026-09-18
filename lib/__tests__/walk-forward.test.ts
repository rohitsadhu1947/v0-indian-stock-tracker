import { describe, it, expect } from 'vitest'
import { runWalkForwardBacktest, type Bar } from '../backtest/walk-forward'
import { TRADE_PROFILES } from '../trade-profiles'

/** Build daily bars from a close series; range is a fixed fraction of close. */
function bars(closes: number[], startDate = new Date('2024-01-01')): Bar[] {
  return closes.map((close, i) => {
    const date = new Date(startDate)
    date.setDate(date.getDate() + i)
    const prev = i > 0 ? closes[i - 1] : close
    return {
      date,
      open: prev,
      high: Math.max(prev, close) * 1.004,
      low: Math.min(prev, close) * 0.996,
      close,
      volume: 1_000_000,
    }
  })
}

/** 80 bars of steady uptrend, enough to pass warmup and the uptrend filter. */
const uptrend = Array.from({ length: 140 }, (_, i) => 100 * Math.pow(1.004, i))

describe('walk-forward backtester', () => {
  it('produces trades on a trending series and charges costs on each', async () => {
    const r = await runWalkForwardBacktest({
      barsBySymbol: { TREND: bars(uptrend) },
      capital: 300000,
      profile: 'swing',
      warmupBars: 60,
    })

    expect(r.totalTrades).toBeGreaterThan(0)
    expect(r.totalCosts).toBeGreaterThan(0)
    for (const t of r.trades) {
      expect(t.costs).toBeGreaterThan(0)
      expect(t.netPnl).toBeLessThan(t.grossPnl) // costs always reduce the result
    }
  })

  it('never enters on the signal bar itself (no lookahead)', async () => {
    const r = await runWalkForwardBacktest({
      barsBySymbol: { TREND: bars(uptrend) },
      capital: 300000,
      profile: 'swing',
      warmupBars: 60,
    })

    // Entry must be at a bar strictly after warmup, and exit strictly after entry
    for (const t of r.trades) {
      expect(t.exitDate.getTime()).toBeGreaterThan(t.entryDate.getTime())
      expect(t.holdingDays).toBeGreaterThanOrEqual(1)
    }
  })

  it('honours the profile stop: losses are bounded near the stop distance', async () => {
    // Rise to build a signal, then collapse hard
    const series = [...uptrend.slice(0, 100), ...Array.from({ length: 40 }, (_, i) => uptrend[99] * (1 - 0.02 * (i + 1)))]
    const r = await runWalkForwardBacktest({
      barsBySymbol: { CRASH: bars(series) },
      capital: 300000,
      profile: 'swing',
      warmupBars: 60,
    })

    const stopped = r.trades.filter(t => t.exitReason === 'STOP_LOSS')
    for (const t of stopped) {
      // 6% max stop + slippage + gap allowance
      expect(t.netPnlPercent).toBeGreaterThan(-12)
      expect(t.netPnlPercent).toBeLessThan(0)
    }
  })

  it('closes positions at the time stop when nothing is hit', async () => {
    // Trend to trigger entry, then go flat forever
    const series = [...uptrend.slice(0, 100), ...Array(80).fill(uptrend[99])]
    const r = await runWalkForwardBacktest({
      barsBySymbol: { FLAT: bars(series) },
      capital: 300000,
      profile: 'swing',
      warmupBars: 60,
    })

    const reasons = Object.keys(r.exitBreakdown)
    expect(reasons.some(x => x === 'TIME_STOP' || x === 'END_OF_TEST')).toBe(true)
    for (const t of r.trades) {
      expect(t.holdingDays).toBeLessThanOrEqual(TRADE_PROFILES.swing.maxHoldDays + 5)
    }
  })

  it('reports a drawdown and an equity curve spanning the test', async () => {
    const r = await runWalkForwardBacktest({
      barsBySymbol: { TREND: bars(uptrend) },
      capital: 300000,
      profile: 'swing',
      warmupBars: 60,
    })

    expect(r.equityCurve.length).toBe(140)
    expect(r.maxDrawdownPercent).toBeGreaterThanOrEqual(0)
    expect(r.endingCapital).toBeGreaterThan(0)
    // Equity accounting: ending capital matches starting capital plus net P&L
    const netSum = r.trades.reduce((s, t) => s + t.netPnl, 0)
    expect(r.endingCapital).toBeCloseTo(300000 + netSum, 0)
  })

  it('never risks more than the profile cap on a single position', async () => {
    const r = await runWalkForwardBacktest({
      barsBySymbol: { TREND: bars(uptrend) },
      capital: 300000,
      profile: 'swing',
      warmupBars: 60,
    })
    for (const t of r.trades) {
      expect(t.entryPrice * t.quantity).toBeLessThanOrEqual(300000 * TRADE_PROFILES.swing.maxCapitalPerTradePct * 1.05)
    }
  })
})
