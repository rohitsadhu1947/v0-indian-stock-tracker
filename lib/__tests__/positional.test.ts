import { describe, expect, it } from 'vitest'
import { averagePrice, netPct, resultsJump, roughDateAfter, sessionsHeld, type Bar } from '@/lib/positional/core'

/** 30 flat sessions at 100 on turnover 10, then the closes and turnovers given. */
function bars(tail: Array<[number, number]>): Bar[] {
  const out: Bar[] = Array.from({ length: 30 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, close: 100, turnover: 10 }))
  tail.forEach(([close, turnover], i) => out.push({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, close, turnover }))
  return out
}

describe('resultsJump', () => {
  it('fires on an 8% rise over two sessions around results, on three times the turnover', () => {
    const s = resultsJump(bars([[100, 10], [104, 20], [109, 35]]), ['2026-11-02'])!
    expect(s.jumpPct).toBe(9)
    expect(s.turnoverRatio).toBeCloseTo(3.3, 1)
    expect(s.resultsDate).toBe('2026-11-02')
  })

  it('counts results on the last session too', () => {
    expect(resultsJump(bars([[100, 10], [100, 10], [109, 35]]), ['2026-11-03'])).not.toBeNull()
  })

  it('needs results on the last session or the one before', () => {
    expect(resultsJump(bars([[100, 10], [104, 20], [109, 35]]), ['2026-11-01'])).toBeNull()
    expect(resultsJump(bars([[100, 10], [104, 20], [109, 35]]), [])).toBeNull()
  })

  it('needs the full rise and the turnover', () => {
    expect(resultsJump(bars([[100, 10], [103, 20], [107, 35]]), ['2026-11-02'])).toBeNull()
    expect(resultsJump(bars([[100, 10], [104, 20], [109, 25]]), ['2026-11-02'])).toBeNull()
  })
})

describe('helpers', () => {
  it('uses the average traded price when it sits inside the day\'s range', () => {
    expect(averagePrice({ high: 110, low: 100, close: 108, volume: 1000, turnover: 105000 })).toBe(105)
    expect(averagePrice({ high: 110, low: 100, close: 108, volume: 1000, turnover: 52000 })).toBeCloseTo(106, 10)
    expect(averagePrice({ high: 110, low: 100, close: 108, volume: 1000, turnover: null })).toBeCloseTo(106, 10)
  })

  it('counts the entry session as the first one held', () => {
    const sessions = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']
    expect(sessionsHeld(sessions, '2026-11-03', '2026-11-03')).toBe(1)
    expect(sessionsHeld(sessions, '2026-11-03', '2026-11-05')).toBe(3)
  })

  it('takes costs off a closed trade', () => {
    expect(netPct(100, 110)).toBeCloseTo(9.55, 10)
  })

  it('skips weekends when estimating the exit date', () => {
    // Friday 27 Nov 2026 plus five sessions is Friday 4 Dec
    expect(roughDateAfter('2026-11-27', 5)).toBe('2026-12-04')
  })
})
