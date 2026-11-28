import { describe, expect, it } from 'vitest'
import { guidePrices, planGuide, resultsGuide, typicalLow } from '@/lib/signals/price-guide'

describe('guidePrices', () => {
  const spread = { trades: 100, badPct: -10, typicalPct: 5, goodPct: 20, wonPct: 60, avgPct: 8 }
  it('turns the spread into prices', () => {
    expect(guidePrices(500, spread, 'on session 60')).toMatchObject({ bad: 450, typical: 525, good: 600, when: 'on session 60', trades: 100 })
  })
  it('gives nothing without a price or a spread', () => {
    expect(guidePrices(null, spread, 'x')).toBeNull()
    expect(guidePrices(500, undefined, 'x')).toBeNull()
  })
})

describe('guides from the saved research', () => {
  it('orders bad below typical below good', () => {
    for (const g of [resultsGuide(1000, 0.9), resultsGuide(1000, null), planGuide(1000, 'Growth'), planGuide(1000, 'defensive', 'twelveMonths')]) {
      expect(g).not.toBeNull()
      expect(g!.bad).toBeLessThan(g!.typical)
      expect(g!.typical).toBeLessThan(g!.good)
    }
  })
  it('gives nothing for an unknown mode', () => {
    expect(planGuide(1000, 'reckless')).toBeNull()
  })
  it('gives a typical low below the buy price', () => {
    expect(typicalLow(1000, 'results')).toBeLessThan(1000)
    expect(typicalLow(1000, { mode: 'growth', horizon: 'sixMonths' })).toBeLessThan(1000)
  })
})
