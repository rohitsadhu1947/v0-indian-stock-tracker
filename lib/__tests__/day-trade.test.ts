import { describe, expect, it } from 'vitest'
import { dayTrade, intradayCharges, minuteOf, windowReturn, type MinuteBar } from '@/lib/research/day-trade'

// One bar a minute from 09:15, price rising 1 a minute from 100
const rising: MinuteBar[] = Array.from({ length: 375 }, (_, i) => [555 + i, 100 + i, 100.5 + i, 99.5 + i, 100 + i + 0.2, 1000])
const at = (hhmm: string) => minuteOf(hhmm)

describe('dayTrade', () => {
  it('enters and leaves at the open of the chosen minutes', () => {
    const t = dayTrade(rising, { side: 'long', entry: at('09:20'), exit: at('15:15') })!
    expect(t.entryPrice).toBe(105)
    expect(t.exitPrice).toBe(460)
    expect(t.ret).toBeCloseTo(460 / 105 - 1, 10)
    expect(t.stopped).toBe(false)
  })

  it('gives a short the opposite sign', () => {
    const t = dayTrade(rising, { side: 'short', entry: at('09:20'), exit: at('15:15') })!
    expect(t.ret).toBeCloseTo(-(460 / 105 - 1), 10)
  })

  it('stops a short when the price rises through the stop', () => {
    const t = dayTrade(rising, { side: 'short', entry: at('09:20'), exit: at('15:15'), stopPct: 2 })!
    expect(t.stopped).toBe(true)
    expect(t.exitPrice).toBeCloseTo(107.1, 10)
    expect(t.ret).toBeCloseTo(-0.02, 10)
  })

  it('fills at the open when a bar opens beyond the stop', () => {
    const gap: MinuteBar[] = [[560, 100, 100.2, 99.8, 100, 1], [561, 95, 95.5, 94, 95, 1], [915, 96, 96, 96, 96, 1]]
    const t = dayTrade(gap, { side: 'long', entry: 560, exit: 915, stopPct: 2 })!
    expect(t.exitPrice).toBe(95)
    expect(t.stopped).toBe(true)
  })

  it('uses the last close when the session ends early', () => {
    const short = rising.slice(0, 100)
    expect(dayTrade(short, { side: 'long', entry: at('09:20'), exit: at('15:15') })!.exitPrice).toBeCloseTo(199.2, 10)
  })

  it('refuses a stock with no bar near the entry time', () => {
    const thin: MinuteBar[] = [[555, 100, 100, 100, 100, 1], [600, 101, 101, 101, 101, 1]]
    expect(dayTrade(thin, { side: 'long', entry: at('09:20'), exit: at('15:15') })).toBeNull()
  })
})

describe('windowReturn and intradayCharges', () => {
  it('measures the same window on another series', () => {
    expect(windowReturn(rising, at('09:20'), at('15:15'))).toBeCloseTo(460 / 105 - 1, 10)
    expect(windowReturn([], 560, 915)).toBeNull()
  })

  it('charges about 0.11% for a round trip of Rs 50,000', () => {
    expect(intradayCharges(50000) * 100).toBeCloseTo(0.106, 2)
  })
})
