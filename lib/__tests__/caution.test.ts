import { describe, expect, it } from 'vitest'
import { cautionFor, cautionKind, cautionText } from '@/lib/positional/caution'

describe('cautionKind', () => {
  it('reads splits and bonuses, and nothing else', () => {
    expect(cautionKind(['FV SPLT FRM RS 10 TO RS 2'])).toBe('split')
    expect(cautionKind(['BONUS 1:1'])).toBe('bonus')
    expect(cautionKind(['BONUS 1:1', 'FVSPLT FRM RS 10 TO RE 1'])).toBe('split')
    expect(cautionKind(['SPLDIV - RS 10 PER SH'])).toBeNull()
    expect(cautionKind(['DIV - RS 5 PER SH'])).toBeNull()
    expect(cautionKind(['(inferred from price)'])).toBeNull()
  })
})

describe('cautionFor', () => {
  const split = ['FV SPLT FRM RS 10 TO RS 2']
  it('flags an ex-date up to 30 days ahead', () => {
    expect(cautionFor(split, '2026-12-10', '2026-11-28')).toMatchObject({ kind: 'split', phase: 'before' })
    expect(cautionFor(split, '2027-02-10', '2026-11-28')).toBeNull()
  })
  it('flags the 20 sessions from the ex-date and then stops', () => {
    expect(cautionFor(split, '2026-11-16', '2026-11-16')).toMatchObject({ phase: 'after', until: '2026-12-14' })
    expect(cautionFor(split, '2026-11-16', '2026-12-11')).toMatchObject({ phase: 'after' })
    expect(cautionFor(split, '2026-11-16', '2026-12-14')).toBeNull()
  })
  it('ignores dividends', () => {
    expect(cautionFor(['DIV - RS 5 PER SH'], '2026-11-16', '2026-11-20')).toBeNull()
  })
})

describe('cautionText', () => {
  it('names the action and when the window ends', () => {
    const text = cautionText({ kind: 'bonus', exDate: '2026-11-16', phase: 'after', until: '2026-12-14' })
    expect(text).toContain('Bonus issue on 16 Nov')
    expect(text).toContain('ends about 14 Dec')
  })
})
