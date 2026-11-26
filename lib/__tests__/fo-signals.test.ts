import { describe, expect, it } from 'vitest'
import { crossRanks, FO_SIGNALS, trailingMean, trailingPercentile, trailingZ, type FoFacts } from '@/lib/research/fo-signals'

const facts = (over: Partial<FoFacts>): FoFacts => ({
  ret: 0, oiChg: 0, basis: 0, basisRank: 0.5, daysToExpiry: 15, futVolume: 1, pcr: 1, pcrZ: 0, callVolume: 1, putVolume: 1,
  impliedMove: 0.02, impliedMoveChg: 1, maxPainGap: 0, banToday: false, banNext: false, ...over,
})
// The two control rules have no F&O condition and are left out here
const fired = (f: FoFacts) => FO_SIGNALS.filter(s => !s.key.startsWith('price-') && s.fires(f)).map(s => s.key)

describe('FO_SIGNALS', () => {
  it('fires nothing on an ordinary day', () => {
    expect(fired(facts({}))).toEqual([])
  })

  it('tells the four price and open interest cases apart', () => {
    expect(fired(facts({ ret: 0.02, oiChg: 0.06 }))).toEqual(['long-buildup'])
    expect(fired(facts({ ret: -0.02, oiChg: 0.06 }))).toEqual(['short-buildup'])
    expect(fired(facts({ ret: 0.02, oiChg: -0.06 }))).toEqual(['short-covering'])
    expect(fired(facts({ ret: -0.02, oiChg: -0.06 }))).toEqual(['long-unwinding'])
    expect(fired(facts({ ret: 0.04, oiChg: 0.12 }))).toEqual(['long-buildup', 'long-buildup-strong'])
  })

  it('ignores the futures premium close to expiry', () => {
    expect(fired(facts({ basisRank: 0.95 }))).toEqual(['premium-high'])
    expect(fired(facts({ basisRank: 0.95, daysToExpiry: 2 }))).toEqual([])
  })

  it('reads the ban list as entry, inside and exit', () => {
    expect(fired(facts({ banNext: true }))).toEqual(['ban-entry'])
    expect(fired(facts({ banToday: true, banNext: true }))).toEqual(['ban-inside'])
    expect(fired(facts({ banToday: true }))).toEqual(['ban-exit'])
  })

  it('does not fire on missing figures', () => {
    expect(fired(facts({ ret: NaN, oiChg: NaN, basisRank: NaN, pcrZ: NaN, futVolume: NaN, callVolume: NaN, putVolume: NaN, impliedMoveChg: NaN, maxPainGap: NaN }))).toEqual([])
  })
})

describe('trailing helpers', () => {
  const xs = [1, 2, 3, 4, 5, 10]
  it('use only the values before the day', () => {
    expect(trailingMean(xs, 5, 5)).toBe(3)
    expect(trailingMean(xs, 4, 5)).toBeNaN()
    expect(trailingZ(xs, 5, 5)).toBeCloseTo((10 - 3) / Math.sqrt(2.5), 6)
    expect(trailingPercentile(xs, 5, 5)).toBe(1)
    expect(trailingPercentile([5, 4, 3, 2, 1, 0], 5, 5)).toBe(0)
  })
})

describe('crossRanks', () => {
  it('ranks from 0 to 1 and keeps gaps', () => {
    expect(crossRanks([30, NaN, 10, 20])).toEqual([1, NaN, 0, 0.5])
  })
})
