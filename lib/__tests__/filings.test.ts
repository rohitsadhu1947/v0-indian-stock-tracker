import { describe, expect, it } from 'vitest'
import { categorize, filingMessage, normalizeName, parseFeed, parseFeedDate, symbolMatcher } from '../filings/nse-feed'

const XML = `<rss><channel><title>NSE</title>
<item><title>ABC Engineering Limited</title><link>https://nsearchives.nseindia.com/corporate/ABC_1.pdf</link><description>ABC Engineering Limited has informed the Exchange regarding receipt of an order worth Rs 500 crore from L&amp;T |SUBJECT: Bagging/Receiving of orders/contracts</description><pubDate>18-Nov-2026 10:17:43</pubDate></item>
<item><title>Broken</title><link>https://x/y.pdf</link><description>no date</description><pubDate>yesterday</pubDate></item>
</channel></rss>`

describe('NSE filings feed', () => {
  it('reads company, subject, text, link and India time from an item, and skips items without a date', () => {
    const [f, ...rest] = parseFeed(XML)
    expect(rest).toHaveLength(0)
    expect(f.company).toBe('ABC Engineering Limited')
    expect(f.subject).toBe('Bagging/Receiving of orders/contracts')
    expect(f.text).toContain('order worth Rs 500 crore from L&T')
    expect(f.publishedAt).toBe('2026-11-18T10:17:43+05:30')
    expect(parseFeed(XML)[0].id).toBe(f.id)
  })

  it('turns the feed date into ISO and rejects other shapes', () => {
    expect(parseFeedDate('03-Jan-2026 09:05:00')).toBe('2026-01-03T09:05:00+05:30')
    expect(parseFeedDate('2026-01-03')).toBeNull()
  })

  it('sorts filings into kinds, with routine paperwork kept out', () => {
    expect(categorize('Bagging/Receiving of orders/contracts')).toBe('orders')
    expect(categorize('Outcome of Board Meeting')).toBe('results')
    expect(categorize('Acquisition')).toBe('deal')
    expect(categorize('Credit Rating')).toBe('rating')
    expect(categorize('Declaration of NAV')).toBe('routine')
    expect(categorize('Copy of Newspaper Publication', 'financial results published')).toBe('routine')
    expect(categorize('Trading Window')).toBe('routine')
    expect(categorize('General Updates', 'has received a letter of award for a road project')).toBe('update')
    expect(categorize('Something new', 'the Company has declared an interim dividend')).toBe('capital')
  })

  it('matches company names to symbols and refuses to guess', () => {
    const match = symbolMatcher([
      { symbol: 'RELIANCE', name: 'RELIANCE INDUSTRIES LTD' },
      { symbol: 'RPOWER', name: 'RELIANCE POWER LTD' },
      { symbol: 'TATAMOTORS', name: 'TATA MOTORS LIMITED' },
      { symbol: 'TATASTEEL', name: 'TATA STEEL LIMITED' },
    ])
    expect(normalizeName('The Tata Steel Limited')).toBe('TATA STEEL')
    expect(match('Reliance Industries Limited')).toBe('RELIANCE')
    expect(match('Tata Steel Limited')).toBe('TATASTEEL')
    expect(match('Tata Chemicals Limited')).toBeNull()
    expect(match('Reliance')).toBeNull()
  })

  it('writes a message that states the filing and the delay', () => {
    const f = parseFeed(XML)[0]
    const text = filingMessage(f, 'ABC', 212, 'orders', new Date('2026-11-18T10:17:55+05:30'))
    expect(text).toContain('<b>ABC</b>: Order or contract')
    expect(text).toContain('L&amp;T')
    expect(text).toContain('Filed 10:17:43, seen 12 seconds later. Rank 212 by trading.')
  })
})
