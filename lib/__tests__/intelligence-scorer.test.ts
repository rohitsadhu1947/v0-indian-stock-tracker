import { describe, it, expect } from 'vitest'
import { calculateIntelligenceScore } from '../intelligence-scorer'

const report = {
  id: 1,
  symbol: 'TCS',
  rating: 'BUY' as const,
  targetPrice: 4000,
  currentPrice: 3500,
  upside: 14.3,
  reportDate: new Date(),
  source: 'Test Broker',
}

describe('intelligence score', () => {
  it('scores 0 and reports unavailable when there is no report and no news', () => {
    const r = calculateIntelligenceScore(null, 0, { newsAvailable: false })
    expect(r.score).toBe(0)
    expect(r.available).toBe(false)
    expect(r.breakdown.newsSentimentScore).toBe(0)
  })

  it('no longer awards the old 6-point floor for missing news', () => {
    // Before: no report + no news still scored 6/30 (5/25 after scaling),
    // which is why every stock showed "intelligence 5".
    const missing = calculateIntelligenceScore(null, 0, { newsAvailable: false })
    const neutral = calculateIntelligenceScore(null, 0, { newsAvailable: true })
    expect(missing.score).toBe(0)
    expect(neutral.score).toBe(6) // genuinely neutral news still scores 6
    expect(neutral.available).toBe(true)
  })

  it('is available when an analyst report exists even without news', () => {
    const r = calculateIntelligenceScore(report, 0, { newsAvailable: false })
    expect(r.available).toBe(true)
    expect(r.inputs).toEqual({ analystReport: true, news: false })
    expect(r.score).toBeGreaterThan(0)
  })

  it('reflects bullish and bearish news', () => {
    const bull = calculateIntelligenceScore(null, 0.7, { newsAvailable: true })
    const bear = calculateIntelligenceScore(null, -0.7, { newsAvailable: true })
    expect(bull.score).toBe(12)
    expect(bear.score).toBe(0)
  })

  it('defaults to treating news as available for older callers', () => {
    expect(calculateIntelligenceScore(null, 0).available).toBe(true)
  })
})
