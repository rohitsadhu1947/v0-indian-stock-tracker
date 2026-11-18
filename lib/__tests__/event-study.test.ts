import { describe, expect, it } from 'vitest'
import { eventOutcome, istDay, windowReturn, type Candle } from '../research/event-study'

const at = (day: string, time: string) => new Date(`${day}T${time}:00+05:30`).getTime()
/** One session of minute bars from 09:15, each bar flat at the given price. */
const session = (day: string, prices: number[]): Candle[] =>
  prices.map((p, i) => [at(day, '09:15') + i * 60000, p, p, p, p, 100])

describe('eventOutcome', () => {
  const rising = session('2026-11-17', Array.from({ length: 375 }, (_, i) => 100 + i * 0.01))
  const next = session('2026-11-18', Array.from({ length: 375 }, () => 110))

  it('buys two minutes after an announcement made during the session', () => {
    const out = eventOutcome([...rising, ...next], at('2026-11-17', '10:00') + 20000)!
    expect(out.sameSession).toBe(true)
    expect(new Date(out.entryTime).toISOString()).toBe(new Date(at('2026-11-17', '10:03')).toISOString())
    expect(out.entryPrice).toBeCloseTo(100.48)
    expect(out.runUpPct).toBeCloseTo((100.48 / 100.44 - 1) * 100)   // 09:59 bar was the last one finished before the news
    expect(out.after[5]).toBeCloseTo((100.52 / 100.48 - 1) * 100)
    expect(out.toClosePct).toBeCloseTo((103.74 / 100.48 - 1) * 100)
    expect(out.toNextClosePct).toBeCloseTo((110 / 100.48 - 1) * 100)
  })

  it('buys at the next open when the announcement comes after the close', () => {
    const out = eventOutcome([...rising, ...next], at('2026-11-17', '18:30'))!
    expect(out.sameSession).toBe(false)
    expect(istDay(out.entryTime)).toBe('2026-11-18')
    expect(out.entryPrice).toBe(110)
    expect(out.runUpPct).toBeCloseTo((110 / 103.74 - 1) * 100)
    expect(out.toNextClosePct).toBeNull()
  })

  it('buys at the same day\'s open when the announcement comes before the market opens', () => {
    const out = eventOutcome([...rising, ...next], at('2026-11-17', '08:00'))!
    expect(istDay(out.entryTime)).toBe('2026-11-17')
    expect(out.entryPrice).toBe(100)
    expect(out.sameSession).toBe(false)
  })

  it('leaves a horizon empty when the session ends before it', () => {
    const out = eventOutcome(rising, at('2026-11-17', '15:00'))!
    expect(out.after[15]).not.toBeNull()
    expect(out.after[60]).toBeNull()
  })

  it('takes the stop when a bar touches both the stop and the target', () => {
    const bars = session('2026-11-17', [100, 100, 100, 100, 100])
    bars[4] = [bars[4][0], 100, 103, 97, 100, 100]
    expect(eventOutcome(bars, at('2026-11-17', '09:15'))!.targetStopPct).toBe(-2)
  })

  it('returns nothing when there is no bar to buy on', () => {
    expect(eventOutcome(rising, at('2026-11-17', '18:30'))).toBeNull()
  })
})

describe('windowReturn', () => {
  it('measures an index over the same window', () => {
    const bars = session('2026-11-17', [100, 101, 102, 103])
    expect(windowReturn(bars, bars[1][0], bars[3][0])).toBeCloseTo((103 / 101 - 1) * 100)
    expect(windowReturn(bars, bars[1][0], null)).toBeNull()
  })
})
