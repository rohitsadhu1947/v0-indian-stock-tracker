import { describe, expect, it } from 'vitest'
import { dividendListings, dividendYield, isBigDividend } from '@/lib/positional/dividends'

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
