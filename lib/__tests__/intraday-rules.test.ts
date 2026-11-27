import { describe, expect, it } from 'vitest'
import { carryOut, INTRADAY_RULES, vwapBefore, type Session } from '@/lib/research/intraday-rules'
import type { MinuteBar } from '@/lib/research/day-trade'

const rule = (key: string) => INTRADAY_RULES.find(r => r.key === key)!
/** 5-minute bars from 09:15 whose closes follow `closes`; each bar opens at the previous close. */
function session(closes: number[], over: Partial<Session> = {}, volume: number[] = []): Session {
  const bars: MinuteBar[] = closes.map((c, i) => {
    const open = i ? closes[i - 1] : closes[0]
    return [555 + i * 5, open, Math.max(open, c), Math.min(open, c), c, volume[i] ?? 100]
  })
  return { bars, prevClose: closes[0], prevHigh: closes[0] * 1.5, prevLow: closes[0] * 0.5, ...over }
}
const flat = (n: number, price = 100) => Array.from({ length: n }, () => price)

describe('opening range', () => {
  it('buys the first close above the first 15 minutes, with the stop at the range low', () => {
    const s = session([100, 101, 99, 100, 102, 103, ...flat(70, 103)])
    const plan = rule('orb15').plan(s)!
    expect(plan).toMatchObject({ side: 'long', entryIndex: 5, stop: 99 })
  })

  it('sells short the first close below it', () => {
    const plan = rule('orb15').plan(session([100, 101, 99, 100, 98, 97, ...flat(70, 97)]))!
    expect(plan).toMatchObject({ side: 'short', entryIndex: 5, stop: 101 })
  })

  it('takes only the first break, so a buys-only rule skips a day that broke down first', () => {
    const s = session([100, 101, 99, 100, 100, 100, 100, 98, 104, ...flat(60, 104)])
    expect(rule('orb30-long').plan(s)).toBeNull()
    expect(rule('orb30-short').plan(s)).toMatchObject({ side: 'short' })
  })

  it('gives no trade on a day that stays inside the range', () => {
    expect(rule('orb15').plan(session([100, 101, 99, ...flat(70, 100)]))).toBeNull()
  })
})

describe('gaps and the previous range', () => {
  it('trades a gap from the second bar', () => {
    const s = session([102, 102, 103, ...flat(70, 103)], { prevClose: 100 })
    expect(rule('gap-up-follow').plan(s)).toMatchObject({ side: 'long', entryIndex: 1 })
    expect(rule('gap-up-fade').plan(s)).toMatchObject({ side: 'short', entryIndex: 1 })
    expect(rule('gap-down-follow').plan(s)).toBeNull()
  })

  it('buys a break of the previous high only when the day opened below it', () => {
    const s = session([100, 100, 102, 103, ...flat(70, 103)], { prevHigh: 101 })
    expect(rule('prev-high').plan(s)).toMatchObject({ side: 'long', entryIndex: 3 })
    expect(rule('prev-high').plan(session([102, 103, ...flat(70, 103)], { prevHigh: 101 }))).toBeNull()
  })
})

describe('vwap', () => {
  it('weights by volume and uses only earlier bars', () => {
    const bars: MinuteBar[] = [[555, 100, 100, 100, 100, 100], [560, 110, 110, 110, 110, 300], [565, 500, 500, 500, 500, 999]]
    expect(vwapBefore(bars, 2)).toBeCloseTo(107.5, 10)
    expect(vwapBefore(bars, 0)).toBeNull()
  })

  it('buys at 10:00 when the price is clear of VWAP and the open', () => {
    const plan = rule('vwap-trend-long').plan(session([100, 100, 100, 100, 100, 100, 101, 102, 103, 103, ...flat(60, 103)]))!
    expect(plan.side).toBe('long')
    expect(plan.entryIndex).toBe(9)
    expect(rule('vwap-trend-short').plan(session([100, 100, 100, 100, 100, 100, 101, 102, 103, 103, ...flat(60, 103)]))).toBeNull()
  })
})

describe('carryOut', () => {
  const s = session([100, 100, 101, 102, 103, ...flat(70, 104)])
  it('enters and leaves at bar opens', () => {
    const r = carryOut(s.bars, { side: 'long', entryIndex: 2, exit: 915 })!
    expect(r.ret).toBeCloseTo(0.04, 10)
    expect(r.stopped).toBe(false)
  })

  it('takes the stop when the price reaches it', () => {
    const r = carryOut(s.bars, { side: 'short', entryIndex: 2, exit: 915, stop: 102 })!
    expect(r.stopped).toBe(true)
    expect(r.ret).toBeCloseTo(-0.02, 10)
  })

  it('refuses an entry at or after the exit time', () => {
    expect(carryOut(s.bars, { side: 'long', entryIndex: 74, exit: 915 })).toBeNull()
  })
})
