import { describe, expect, it } from 'vitest'
import { enoughNotice, dividendExitDate, dividendListings, dividendNetPct, dividendYield, isBigDividend, sessionsFromEx } from '@/lib/positional/dividends'

describe('dividendListings', () => {
  it('adds up the dividends of one ex-date and leaves out other actions', () => {
    const found = dividendListings([
      { symbol: 'AAA', exDate: '2026-12-10', purpose: 'DIV - RS 8.50 PER SH' },
      { symbol: 'AAA', exDate: '2026-12-10', purpose: 'SPLDIV - RS 10 PER SH' },
      { symbol: 'AAA', exDate: '2026-12-10', purpose: 'DIV - RS 8.50 PER SH' },
      { symbol: 'BBB', exDate: '2026-12-11', purpose: 'BONUS 1:1' },
      { symbol: 'CCC', exDate: '2026-12-11', purpose: 'FV SPLT FRM RS 10 TO RS 2' },
      { symbol: 'DDD', exDate: '2026-12-11', purpose: 'AGM' },
    ])
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ symbol: 'AAA', exDate: '2026-12-10', amount: 18.5 })
  })
})

describe('size of the dividend', () => {
  it('is big at 2% of the price or more', () => {
    expect(isBigDividend(dividendYield(20, 1000))).toBe(true)
    expect(isBigDividend(dividendYield(19, 1000))).toBe(false)
    expect(isBigDividend(dividendYield(20, null))).toBe(false)
  })
})

describe('exit', () => {
  const sessions = ['2026-12-08', '2026-12-09', '2026-12-10', '2026-12-11', '2026-12-14', '2026-12-15', '2026-12-16', '2026-12-17']
  it('is the sixth session from the ex-date', () => {
    expect(dividendExitDate(sessions, '2026-12-10')).toBe('2026-12-17')
    expect(dividendExitDate(sessions.slice(0, 6), '2026-12-10')).toBeNull()
  })
  it('counts sessions from the ex-date', () => {
    expect(sessionsFromEx(sessions, '2026-12-10', '2026-12-09')).toBe(0)
    expect(sessionsFromEx(sessions, '2026-12-10', '2026-12-10')).toBe(1)
    expect(sessionsFromEx(sessions, '2026-12-10', '2026-12-16')).toBe(5)
  })
})

describe('notice', () => {
  it('needs two weekdays between the listing and the ex-date', () => {
    expect(enoughNotice('2026-10-30', '2026-11-04')).toBe(true)    // Friday listing, Wednesday ex-date
    expect(enoughNotice('2026-10-30', '2026-11-03')).toBe(false)   // Tuesday ex-date leaves one
  })
})

describe('dividendNetPct', () => {
  it('adds the dividend after tax and takes off costs', () => {
    // Price falls 3% on a 4% dividend: -3% - 0.45% + 4% x 0.688
    expect(dividendNetPct(1000, 970, 40)).toBeCloseTo(-3 - 0.45 + 2.752, 6)
  })
})
