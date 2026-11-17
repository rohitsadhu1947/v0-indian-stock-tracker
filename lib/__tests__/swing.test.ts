import { describe, expect, it } from 'vitest'
import { meanAndT, rsi, tradeOutcome, type ExitRule } from '../research/swing'

const NO_COSTS = {
  brokeragePerOrder: 0, sttPercent: 0, exchangeTxnPercent: 0, sebiPercent: 0, stampDutyPercent: 0, gstPercent: 0,
  dpChargePerSell: 0, slippagePercent: 0,
}
const rule: ExitRule = { key: 't', targetPct: 3, stopPct: 3, maxSessions: 3 }
const bars = (rows: Array<[number, number, number, number]>) => ({
  open: Float64Array.from(rows.map(r => r[0])), high: Float64Array.from(rows.map(r => r[1])),
  low: Float64Array.from(rows.map(r => r[2])), close: Float64Array.from(rows.map(r => r[3])),
})

describe('tradeOutcome', () => {
  it('sells at the target when the high reaches it', () => {
    const out = tradeOutcome(bars([[100, 101, 99, 100], [100, 104, 99, 103]]), 0, rule, NO_COSTS)!
    expect(out.reason).toBe('target')
    expect(out.ret).toBeCloseTo(0.03)
    expect(out.exitIndex).toBe(1)
  })

  it('takes the stop when one day touches both the stop and the target', () => {
    const out = tradeOutcome(bars([[100, 104, 96, 100]]), 0, rule, NO_COSTS)!
    expect(out.reason).toBe('stop')
    expect(out.ret).toBeCloseTo(-0.03)
  })

  it('sells at the open when a session opens beyond the stop or the target', () => {
    const down = tradeOutcome(bars([[100, 101, 99, 100], [92, 93, 91, 92]]), 0, rule, NO_COSTS)!
    expect(down.reason).toBe('stop')
    expect(down.ret).toBeCloseTo(-0.08)
    const up = tradeOutcome(bars([[100, 101, 99, 100], [106, 107, 105, 106]]), 0, rule, NO_COSTS)!
    expect(up.reason).toBe('target')
    expect(up.ret).toBeCloseTo(0.06)
  })

  it('sells at the close of the last session when neither is reached', () => {
    const out = tradeOutcome(bars([[100, 101, 99, 100], [100, 102, 99, 101], [101, 102, 100, 102], [102, 110, 102, 110]]), 0, rule, NO_COSTS)!
    expect(out.reason).toBe('time')
    expect(out.exitIndex).toBe(2)
    expect(out.ret).toBeCloseTo(0.02)
  })

  it('charges slippage and costs, so a flat trade loses money', () => {
    const out = tradeOutcome(bars([[100, 100, 100, 100]]), 0, { ...rule, maxSessions: 1 })!
    expect(out.ret).toBeLessThan(-0.003)
    expect(out.ret).toBeGreaterThan(-0.006)
  })

  it('can enter at a price other than the open', () => {
    const out = tradeOutcome(bars([[100, 104, 99, 102]]), 0, { ...rule, maxSessions: 1 }, NO_COSTS, 102)!
    expect(out.reason).toBe('time')
    expect(out.ret).toBeCloseTo(0)
  })
})

describe('rsi', () => {
  it('is 100 after only rises, 0 after only falls, and undefined before the period is filled', () => {
    const up = rsi(Float64Array.from([1, 2, 3, 4]), 2)
    expect(Number.isNaN(up[1])).toBe(true)
    expect(up[3]).toBe(100)
    expect(rsi(Float64Array.from([4, 3, 2, 1]), 2)[3]).toBe(0)
  })
})

describe('meanAndT', () => {
  it('gives the mean and its t-statistic', () => {
    const { mean, t } = meanAndT([1, 2, 3])
    expect(mean).toBe(2)
    expect(t).toBeCloseTo(2 / Math.sqrt(1 / 3))
  })
})
