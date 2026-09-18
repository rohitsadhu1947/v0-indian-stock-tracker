import { describe, it, expect } from 'vitest'
import { analyzeSentiment, calculateAggregateSentiment } from '../sentiment-utils'

// Real headlines pulled from Google News RSS while fixing this
const BULLISH = 'Ashok Leyland shares surge 2%, up 5% in a month; what is driving the rally'
const BEARISH = 'Tata Chemicals shares crash 7.5% amid Tata Sons listing row'
const DOWNGRADE = 'Infosys stock ratings downgraded: Brokerages turn cautious after Q1'
const FLAT = 'Market Trading Guide: two stock recommendations for Thursday'

describe('analyzeSentiment', () => {
  it('classifies a real bullish headline as POSITIVE', () => {
    expect(analyzeSentiment(BULLISH).label).toBe('POSITIVE')
  })

  it('classifies real bearish headlines as NEGATIVE', () => {
    expect(analyzeSentiment(BEARISH).label).toBe('NEGATIVE')
    expect(analyzeSentiment(DOWNGRADE).label).toBe('NEGATIVE')
  })

  it('leaves an uninformative headline NEUTRAL', () => {
    expect(analyzeSentiment(FLAT).label).toBe('NEUTRAL')
  })

  it('does not classify on `comparative`, which no headline can exceed', () => {
    // The old threshold was comparative > 0.5; across 75 live headlines the
    // maximum observed was 0.389, so every article came back NEUTRAL.
    const r = analyzeSentiment(BULLISH)
    expect(Math.abs(r.comparative)).toBeLessThan(0.5)
    expect(r.label).toBe('POSITIVE')
  })

  it('handles empty input', () => {
    expect(analyzeSentiment('').label).toBe('NEUTRAL')
  })
})

describe('calculateAggregateSentiment', () => {
  it('balance ignores neutral filler and ranges -1..1', () => {
    const items = [BULLISH, BULLISH, BEARISH, FLAT, FLAT].map(analyzeSentiment)
    const agg = calculateAggregateSentiment(items)
    expect(agg.positive).toBe(2)
    expect(agg.negative).toBe(1)
    expect(agg.balance).toBeCloseTo((2 - 1) / 3)
  })

  it('all-positive coverage scores 1, all-negative -1', () => {
    expect(calculateAggregateSentiment([BULLISH, BULLISH].map(analyzeSentiment)).balance).toBe(1)
    expect(calculateAggregateSentiment([BEARISH, DOWNGRADE].map(analyzeSentiment)).balance).toBe(-1)
  })

  it('balanced coverage scores 0', () => {
    expect(calculateAggregateSentiment([BULLISH, BEARISH].map(analyzeSentiment)).balance).toBe(0)
  })

  it('no articles means no balance', () => {
    expect(calculateAggregateSentiment([]).balance).toBe(0)
  })
})
