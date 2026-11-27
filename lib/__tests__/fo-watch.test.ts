import { describe, expect, it } from 'vitest'
import { banListDate, COST, entryMessage, findSignals, paperOutcome, tally } from '@/lib/fo-watch/core'
import type { MinuteBar } from '@/lib/research/day-trade'

const steady = (calls: number, puts: number) => Array.from({ length: 20 }, () => ({ calls, puts }))

describe('findSignals', () => {
  const base = { banToday: new Set<string>(), banNext: new Set<string>(), today: new Map(), history: new Map(), sessions: 20 }

  it('flags a stock that is new on the ban list', () => {
    const found = findSignals({ ...base, banToday: new Set(['OLD']), banNext: new Set(['OLD', 'NEW']) })
    expect(found).toEqual([{ signal: 'ban-entry', symbol: 'NEW', detail: {} }])
  })

  it('gives no ban signal when either list is unknown', () => {
    expect(findSignals({ ...base, banToday: null, banNext: new Set(['NEW']) })).toEqual([])
  })

  it('flags call volume at five times the usual and twice the put spike', () => {
    const found = findSignals({
      ...base,
      today: new Map([['SPIKE', { calls: 600, puts: 100 }], ['BOTH', { calls: 600, puts: 400 }], ['CALM', { calls: 150, puts: 100 }]]),
      history: new Map([['SPIKE', steady(100, 100)], ['BOTH', steady(100, 100)], ['CALM', steady(100, 100)]]),
    })
    expect(found).toEqual([{ signal: 'call-volume-spike', symbol: 'SPIKE', detail: { callRatio: 6, putRatio: 1 } }])
  })

  it('needs twenty sessions of history', () => {
    const input = { ...base, today: new Map([['SPIKE', { calls: 600, puts: 100 }]]) }
    expect(findSignals({ ...input, history: new Map([['SPIKE', steady(100, 100).slice(1)]]) })).toEqual([])
    expect(findSignals({ ...input, history: new Map([['SPIKE', steady(100, 100)]]), sessions: 19 })).toEqual([])
  })
})

describe('paperOutcome', () => {
  const bar = (minute: number, price: number): MinuteBar => [minute, price, price, price, price, 100]
  it('books a falling stock as a gain for the short, less costs', () => {
    const o = paperOutcome([bar(555, 101), bar(560, 100), bar(700, 99), bar(915, 98)])!
    expect(o.grossPct).toBeCloseTo(2, 6)
    expect(o.netPct).toBeCloseTo(2 - COST * 100, 6)
    expect(o.stopped).toBe(false)
  })

  it('stops a rising stock at 3%', () => {
    const o = paperOutcome([bar(560, 100), [600, 102, 104, 102, 104, 100], bar(915, 110)])!
    expect(o.stopped).toBe(true)
    expect(o.grossPct).toBeCloseTo(-3, 6)
    expect(o.noStopGrossPct).toBeCloseTo(-10, 6)
  })

  it('returns null without a bar near 09:20', () => {
    expect(paperOutcome([bar(700, 100), bar(915, 99)])).toBeNull()
  })
})

describe('tally and banListDate', () => {
  it('adds up finished trades', () => {
    expect(tally([1, -0.5, 0.5])).toEqual({ trades: 3, wins: 2, avgNetPct: 1 / 3, totalNetPct: 1 })
    expect(tally([])).toEqual({ trades: 0, wins: 0, avgNetPct: 0, totalNetPct: 0 })
  })

  it('reads the trade date from the ban list', () => {
    expect(banListDate('Securities in Ban For Trade Date 27-NOV-2026:\n1,APLAPOLLO')).toBe('2026-11-27')
    expect(banListDate('<!DOCTYPE html>')).toBeNull()
  })
})

describe('entryMessage', () => {
  const base = { symbol: 'APLAPOLLO', signal: 'ban-entry' as const, exampleAmount: 50000 }
  it('gives the entry, the stop in rupees, the exit and the shares', () => {
    const text = entryMessage({ ...base, entryPrice: 1527.4, lastPrice: 1526.8 })
    expect(text).toContain('<b>SELL SHORT APLAPOLLO now</b> (enters the f&o ban list)')
    expect(text).toContain('the 09:20 price was Rs 1,527.40.')
    expect(text).not.toContain('Now Rs')
    expect(text).toContain('stop-loss buy order at Rs 1,573.22')
    expect(text).toContain('buy back at 15:15')
    expect(text).toContain('Shares: 32 for Rs 50,000.')
  })

  it('adds the latest price when it has moved', () => {
    expect(entryMessage({ ...base, entryPrice: 1527.4, lastPrice: 1540 })).toContain('Now Rs 1,540.00.')
  })

  it('falls back to a percentage stop without a price', () => {
    const text = entryMessage({ ...base, entryPrice: null, lastPrice: null })
    expect(text).toContain('Zerodha is not connected')
    expect(text).toContain('3% above your sell price')
  })
})
