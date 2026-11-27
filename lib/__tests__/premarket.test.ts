import { describe, expect, it } from 'vitest'
import { adrRow, impliedNiftyGap, moveSince } from '@/lib/brief/premarket-core'

describe('moveSince', () => {
  const us = { dates: ['2026-11-24', '2026-11-25', '2026-11-26'], closes: [100, 102, 103.02] }

  it('counts the US session of the same date as news India has not seen', () => {
    // India last traded on the 26th; the US session of the 26th closed after it
    const m = moveSince(us, '2026-11-26')!
    expect(m.pct).toBeCloseTo(1, 6)
    expect(m.asOf).toBe('2026-11-26')
  })

  it('adds up several foreign sessions over an Indian holiday', () => {
    expect(moveSince(us, '2026-11-25')!.pct).toBeCloseTo(3.02, 6)
  })

  it('returns null when there is nothing new', () => {
    expect(moveSince(us, '2026-11-27')).toBeNull()
    expect(moveSince(us, '2026-11-20')).toBeNull()
  })
})

describe('implied gaps', () => {
  it('gives about 0.3% of NIFTY gap for each 1% in the S&P 500', () => {
    expect(impliedNiftyGap(1)).toBeCloseTo(0.39, 6)
    expect(impliedNiftyGap(-2)).toBeCloseTo(-0.51, 6)
  })

  it('takes the local move off the ADR before working out the gap', () => {
    const row = adrRow('INFY', { pct: 3, last: 20, asOf: '2026-11-26' }, 1)
    expect(row.leadPct).toBeCloseTo(2, 6)
    expect(row.impliedGapPct).toBeCloseTo(0.64, 6)
  })
})
