import { describe, expect, it } from 'vitest'
import { enoughTime, isSellDay, nextWeekday, splitListings, splitText, weekdayBefore, weekdaysBetween } from '@/lib/positional/splits'

describe('splitListings', () => {
  it('keeps real splits and drops special dividends and consolidations', () => {
    const rows = [
      { symbol: 'AAA', exDate: '2026-12-10', purpose: 'FV SPLT FRM RS 10 TO RS 2' },
      { symbol: 'AAA', exDate: '2026-12-10', purpose: 'FVSPLT FRM RS 10 TO RS 2' },
      { symbol: 'BBB', exDate: '2026-12-11', purpose: 'SPLDIV - RS 10 PER SH' },
      { symbol: 'CCC', exDate: '2026-12-12', purpose: 'AGM/DIV-FIN 8.75+SPL 0.75' },
      { symbol: 'DDD', exDate: '2026-12-12', purpose: 'CONSOLIDATION RS 1 TO RS 10' },
      { symbol: 'EEE', exDate: '2026-12-15', purpose: 'BONUS 1:1' },
    ]
    const found = splitListings(rows)
    expect(found.map(f => f.symbol)).toEqual(['AAA'])
    expect(found[0]).toMatchObject({ exDate: '2026-12-10', from: 10, to: 2 })
  })
})

describe('weekdays', () => {
  it('steps over weekends', () => {
    expect(nextWeekday('2026-12-04')).toBe('2026-12-07')   // Friday to Monday
    expect(weekdayBefore('2026-12-07')).toBe('2026-12-04')
    expect(weekdaysBetween('2026-12-04', '2026-12-10')).toBe(3)   // Mon, Tue, Wed
  })
  it('needs three weekdays between the listing and the ex-date', () => {
    expect(enoughTime('2026-12-04', '2026-12-10')).toBe(true)
    expect(enoughTime('2026-12-04', '2026-12-09')).toBe(false)
  })
  it('knows the day to sell', () => {
    expect(isSellDay('2026-12-09', '2026-12-10')).toBe(true)
    expect(isSellDay('2026-12-04', '2026-12-07')).toBe(true)    // Friday before a Monday ex-date
    expect(isSellDay('2026-12-08', '2026-12-10')).toBe(false)
    expect(isSellDay('2026-12-10', '2026-12-10')).toBe(false)
  })
})

describe('splitText', () => {
  it('says how many shares one becomes', () => {
    expect(splitText(10, 2)).toBe('1 share becomes 5')
    expect(splitText(5, 2)).toBe('1 share becomes 2.50')
  })
})
