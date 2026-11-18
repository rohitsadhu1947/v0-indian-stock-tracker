import { describe, expect, it } from 'vitest'
import { screenFacts } from '../screener/core'

const bars = (closes: number[], last: { volume?: number; deliveryQty?: number } = {}) =>
  closes.map((close, i) => ({
    date: `d${i}`, close,
    volume: i === closes.length - 1 ? last.volume ?? 1000 : 1000,
    deliveryQty: i === closes.length - 1 ? last.deliveryQty ?? 500 : 500,
  }))

describe('screenFacts', () => {
  it('describes a steady riser as an uptrend at its high', () => {
    const f = screenFacts(bars(Array.from({ length: 300 }, (_, i) => 100 + i)))!
    expect(f.trend).toBe('up')
    expect(f.belowHighPct).toBe(0)
    expect(f.dayPct).toBeCloseTo((399 / 398 - 1) * 100)
    expect(f.weekPct).toBeCloseTo((399 / 394 - 1) * 100)
    expect(f.momentumPct).toBeCloseTo((378 / 147 - 1) * 100)
    expect(f.vs200Pct!).toBeGreaterThan(0)
  })

  it('describes a steady faller as a downtrend below its high', () => {
    const f = screenFacts(bars(Array.from({ length: 300 }, (_, i) => 400 - i)))!
    expect(f.trend).toBe('down')
    expect(f.belowHighPct!).toBeGreaterThan(50)
  })

  it('calls it mixed when the price is above one average and below the other', () => {
    // A long rise, then a short fall: under the 50-day average, still over the 200-day
    const closes = [...Array.from({ length: 270 }, (_, i) => 100 + i), ...Array.from({ length: 30 }, (_, i) => 369 - 2 * (i + 1))]
    expect(screenFacts(bars(closes))!.trend).toBe('mixed')
  })

  it('compares today\'s trading with the usual and gives the delivery share', () => {
    const f = screenFacts(bars(Array.from({ length: 60 }, () => 100), { volume: 3000, deliveryQty: 1500 }))!
    expect(f.volumeRatio).toBeCloseTo(3)
    expect(f.deliveryPct).toBeCloseTo(50)
  })

  it('leaves out what it cannot work out from a short history', () => {
    const f = screenFacts(bars([100, 101, 102]))!
    expect(f.trend).toBeNull()
    expect(f.momentumPct).toBeNull()
    expect(f.belowHighPct).toBeNull()
    expect(screenFacts(bars([100]))).toBeNull()
  })
})
