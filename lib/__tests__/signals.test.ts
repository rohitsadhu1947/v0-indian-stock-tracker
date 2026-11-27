import { describe, expect, it } from 'vitest'
import { dayTradeSignal, sharesFor } from '@/lib/signals/core'
import type { MinuteBar } from '@/lib/research/day-trade'

const bar = (minute: number, price: number, high = price): MinuteBar => [minute, price, high, price, price, 100]
const base = { symbol: 'ABC', signal: 'ban-entry' as const, tradeDate: '2026-11-27', detail: {}, referencePrice: 100, dayOver: false }

describe('dayTradeSignal', () => {
  it('waits before 09:20, with a stop worked out from the last price', () => {
    const s = dayTradeSignal({ ...base, bars: [bar(555, 101)], nowMinute: 556 })
    expect(s).toMatchObject({ state: 'waiting', entryPrice: null, stopPrice: 103, movePct: null, reason: 'New on the F&O ban list' })
  })

  it('is open after 09:20, with the stop set from the 09:20 price', () => {
    const s = dayTradeSignal({ ...base, bars: [bar(555, 101), bar(560, 200), bar(600, 198)], nowMinute: 601 })
    expect(s).toMatchObject({ state: 'open', entryPrice: 200, stopPrice: 206, lastPrice: 198, movePct: 1 })
  })

  it('is stopped once the price reaches the stop', () => {
    const s = dayTradeSignal({ ...base, bars: [bar(560, 200), bar(600, 204, 207), bar(700, 190)], nowMinute: 701 })
    expect(s).toMatchObject({ state: 'stopped', lastPrice: 206, movePct: -3 })
  })

  it('is closed at 15:15', () => {
    const s = dayTradeSignal({ ...base, bars: [bar(560, 200), bar(915, 196), bar(920, 150)], nowMinute: 921 })
    expect(s).toMatchObject({ state: 'closed', lastPrice: 196, movePct: 2 })
  })

  it('is missed when the day is over and there are no prices', () => {
    expect(dayTradeSignal({ ...base, bars: [], nowMinute: null, dayOver: true }).state).toBe('missed')
  })

  it('names the call volume behind a spike', () => {
    const s = dayTradeSignal({ ...base, signal: 'call-volume-spike', detail: { callRatio: 8.8, putRatio: 4.1 }, bars: [], nowMinute: null })
    expect(s.reason).toBe('Call volume 8.8 times the usual')
  })
})

describe('sharesFor', () => {
  it('gives whole shares and nothing without a price', () => {
    expect(sharesFor(50000, 279.35)).toBe(178)
    expect(sharesFor(50000, null)).toBe(0)
  })
})
