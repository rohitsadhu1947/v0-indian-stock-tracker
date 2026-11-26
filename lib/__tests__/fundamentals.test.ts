import { describe, expect, it } from 'vitest'
import { croreFactor, fundamentalFacts, parseEarnings, recentQuarters } from '@/lib/fundamentals/core'

const metric = (unit: string, now: number, lastYear: number, extra: Record<string, number | null> = {}) =>
  ({ unit, current_period_value: now, previous_year_value: lastYear, yoy_percent: 999, ...extra })

const table = (unit = 'Rs in crore') => ({
  current_period_label: 'Q2FY27',
  revenue: metric(unit, 73188, 65799),
  pat: metric(unit, 13934, 12131),
  operating_profit: metric(unit, 18815, 17978),
  eps: metric('Rs', 38.37, 33.37, { previous_year_full_value: 136.01, current_cumulative_value: 75.27, previous_year_cumulative_value: 68.64 }),
})

const row = (earnings_table: any) => ({ symbol: 'tcs', quarter: 'q2_27', date: '2026-10-08T10:10:38.325000+00:00', summary: 'Stable.', earnings_table })

describe('croreFactor', () => {
  it('reads the units filings use', () => {
    expect(croreFactor('Rs in crore')).toBe(1)
    expect(croreFactor('Rs. in Lakhs')).toBe(0.01)
    expect(croreFactor('INR million')).toBe(0.1)
    expect(croreFactor('Rs')).toBeNull()
    expect(croreFactor(null)).toBeNull()
  })
})

describe('parseEarnings', () => {
  it('prefers consolidated figures and works growth out from the two values', () => {
    const r = parseEarnings(row({ consolidated: table(), standalone: table() }))!
    expect(r.symbol).toBe('TCS')
    expect(r.basis).toBe('consolidated')
    expect(r.revenueCr).toBe(73188)
    expect(r.revenueYoyPct).toBeCloseTo(11.23, 2)
    expect(r.patYoyPct).toBeCloseTo(14.86, 2)
    expect(r.epsTtm).toBeCloseTo(142.64, 2)
    expect(r.filedAt).toBe('2026-10-08T10:10:38.325Z')
  })

  it('falls back to standalone when there are no consolidated figures', () => {
    const r = parseEarnings(row({ consolidated: null, standalone: table('Rs in lakhs') }))!
    expect(r.basis).toBe('standalone')
    expect(r.revenueCr).toBeCloseTo(731.88, 2)
  })

  it('gives no growth figure when either year was a loss', () => {
    const profitAfterLoss = { ...table(), pat: metric('Rs in crore', 50, -20) }
    const lossAfterProfit = { ...table(), pat: metric('Rs in crore', -50, 20) }
    expect(parseEarnings(row({ consolidated: profitAfterLoss }))!.patYoyPct).toBeNull()
    expect(parseEarnings(row({ consolidated: lossAfterProfit }))!.patYoyPct).toBeNull()
  })

  it('uses standalone when consolidated sales are far below the company\'s own', () => {
    const broken = { ...table(), revenue: metric('Rs in lakhs', 496808, 2435325) }
    const own = { ...table(), revenue: metric('Rs in lakhs', 4196605, 3502576) }
    const r = parseEarnings(row({ consolidated: broken, standalone: own }))!
    expect(r.basis).toBe('standalone')
    expect(r.revenueYoyPct).toBeCloseTo(19.81, 1)
  })

  it('leaves amounts out when the unit is not recognised, but keeps growth', () => {
    const r = parseEarnings(row({ consolidated: table('Rs') }))!
    expect(r.revenueCr).toBeNull()
    expect(r.revenueYoyPct).toBeCloseTo(11.23, 2)
  })

  it('returns null without a figures table', () => {
    expect(parseEarnings(row(null))).toBeNull()
    expect(parseEarnings(row({ consolidated: {}, standalone: {} }))).toBeNull()
  })
})

describe('fundamentalFacts', () => {
  it('works out margin and price to earnings', () => {
    const f = fundamentalFacts(parseEarnings(row({ consolidated: table() }))!, 2852.8)
    expect(f.quarter).toBe('Q2FY27')
    expect(f.marginPct).toBeCloseTo(25.71, 2)
    expect(f.pe).toBeCloseTo(20, 1)
  })

  it('gives no price to earnings for a loss-making company', () => {
    const t = { ...table(), eps: metric('Rs', -2, 1, { previous_year_full_value: -5, current_cumulative_value: -3, previous_year_cumulative_value: 1 }) }
    expect(fundamentalFacts(parseEarnings(row({ consolidated: t }))!, 100).pe).toBeNull()
  })
})

describe('recentQuarters', () => {
  it('counts back from the quarter the date is in', () => {
    expect(recentQuarters(new Date('2026-11-26T00:00:00Z'), 3)).toEqual(['q3_27', 'q2_27', 'q1_27'])
    expect(recentQuarters(new Date('2026-02-10T00:00:00Z'), 2)).toEqual(['q4_26', 'q3_26'])
    expect(recentQuarters(new Date('2026-04-01T00:00:00Z'), 2)).toEqual(['q1_27', 'q4_26'])
  })
})
