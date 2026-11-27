import { describe, expect, it } from 'vitest'
import { actionKind, exitReason, fundOrderReason, holdingValue, isMarketHours, isPlanFund, orderReason, planTargets, type ReasonContext } from '../portfolio/plan-core'
import { parseFundShare } from '../portfolio/config'

const ctx = (over: Partial<ReasonContext> = {}): ReasonContext => ({
  kind: 'rebalance', modeLabel: 'Balanced', exitRank: 60, maxPerSector: 4, invested: true,
  rankOf: new Map([['A', 3], ['B', 75], ['C', 40]]),
  sectorOf: s => (s === 'C' ? 'Healthcare' : undefined),
  ...over,
})

describe('actionKind', () => {
  it('names the step from the book and the mode being looked at', () => {
    expect(actionKind(null, 'growth')).toBe('start')
    expect(actionKind('growth', 'growth')).toBe('rebalance')
    expect(actionKind('growth', 'balanced')).toBe('switch')
  })
})

describe('order and exit reasons', () => {
  it('says a sale in a monthly rebalance is about rank, the sector limit, or dropping out of the ranking', () => {
    expect(exitReason('B', ctx())).toBe('Rank fell to 75; holdings are kept only down to rank 60')
    expect(exitReason('C', ctx())).toBe('Healthcare already has 4 holdings that rank higher')
    expect(exitReason('GONE', ctx())).toBe('No longer ranked: too little trading or history')
  })

  it('says a sale in a switch is because the stock is not in the other mode, never about rank 60', () => {
    expect(exitReason('B', ctx({ kind: 'switch' }))).toBe("Not one of Balanced's picks (rank 75 there)")
    expect(exitReason('GONE', ctx({ kind: 'switch' }))).toBe("Not one of Balanced's picks")
    // Ranked above the mode's last pick, so only the sector limit kept it out
    expect(exitReason('C', ctx({ kind: 'switch', lastPickRank: 45 }))).toBe('Rank 40 in Balanced, but Healthcare already has 4 picks that rank higher')
    expect(exitReason('C', ctx({ kind: 'switch', lastPickRank: 30 }))).toBe("Not one of Balanced's picks (rank 40 there)")
  })

  it('puts the trend filter first when the book is going to cash', () => {
    expect(exitReason('A', ctx({ invested: false }))).toMatch(/Trend filter/)
  })

  it('explains buys and resizes', () => {
    expect(orderReason({ symbol: 'A', side: 'BUY', reason: 'entry' }, ctx())).toBe('New pick, rank 3')
    expect(orderReason({ symbol: 'A', side: 'SELL', reason: 'resize' }, ctx())).toBe('Back to an equal share of the book')
    expect(orderReason({ symbol: 'B', side: 'SELL', reason: 'exit' }, ctx())).toBe(exitReason('B', ctx()))
  })
})

describe('holdingValue', () => {
  it('works out cost, value, profit and the day change', () => {
    expect(holdingValue(10, 100, 110, 105)).toEqual({ cost: 1000, value: 1100, pnl: 100, pnlPct: expect.closeTo(10, 10), dayChangePct: expect.closeTo(4.7619, 3) })
    expect(holdingValue(10, 100, 90, null).dayChangePct).toBeNull()
  })
})

describe('isMarketHours', () => {
  const ist = (text: string) => new Date(`${text}+05:30`)
  it('is true on weekdays from 09:15 to 15:30 IST', () => {
    expect(isMarketHours(ist('2026-11-17T09:15:00'))).toBe(true)
    expect(isMarketHours(ist('2026-11-17T15:30:00'))).toBe(true)
    expect(isMarketHours(ist('2026-11-17T09:14:00'))).toBe(false)
    expect(isMarketHours(ist('2026-11-17T15:31:00'))).toBe(false)
    expect(isMarketHours(ist('2026-11-15T11:00:00'))).toBe(false) // Sunday
  })
})

describe('funds in the plan', () => {
  const picks = Array.from({ length: 20 }, (_, i) => `S${i}`)

  it('splits the fund share equally and the rest between the stock slots', () => {
    const t = planTargets(picks, 20, 0.3, true)
    expect(t.S0).toBeCloseTo(0.035, 6)
    expect(t.GOLDBEES).toBeCloseTo(0.1, 6)
    expect(t.LTGILTBEES).toBeCloseTo(0.1, 6)
    expect(t.MON100).toBeCloseTo(0.1, 6)
    expect(Object.values(t).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6)
  })

  it('holds no funds at a share of 0', () => {
    const t = planTargets(picks, 20, 0, true)
    expect(Object.keys(t)).toHaveLength(20)
    expect(t.S0).toBeCloseTo(0.05, 6)
  })

  it('keeps the funds when the trend filter has the shares in cash', () => {
    expect(planTargets(picks, 20, 0.3, false)).toEqual({ GOLDBEES: 0.3 / 3, LTGILTBEES: 0.3 / 3, MON100: 0.3 / 3 })
    expect(planTargets(picks, 20, 0, false)).toEqual({})
  })

  it('explains fund orders', () => {
    expect(isPlanFund('GOLDBEES')).toBe(true)
    expect(isPlanFund('TCS')).toBe(false)
    expect(fundOrderReason({ symbol: 'GOLDBEES', side: 'BUY', reason: 'entry' }, 0.3)).toBe('Gold fund: 10% of the book')
    expect(fundOrderReason({ symbol: 'MON100', side: 'SELL', reason: 'resize' }, 0.2)).toBe('US Nasdaq 100 fund: back to 6.7% of the book')
    expect(fundOrderReason({ symbol: 'GOLDBEES', side: 'SELL', reason: 'exit' }, 0)).toBe('The share kept in funds is set to 0')
  })

  it('reads the share from a percent and refuses values not offered', () => {
    expect(parseFundShare('30')).toBe(0.3)
    expect(parseFundShare(0)).toBe(0)
    expect(parseFundShare('35')).toBeUndefined()
    expect(parseFundShare(null)).toBeUndefined()
  })
})
