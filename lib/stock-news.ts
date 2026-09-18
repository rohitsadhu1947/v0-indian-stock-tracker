/**
 * Stock news + sentiment, callable from server code.
 *
 * This logic used to live only inside /api/news/quote, so master-scorer had to
 * fetch its own API over HTTP — which the auth middleware rejected with a 401
 * on every call. News sentiment therefore defaulted to "neutral" forever, and
 * the intelligence score was pinned at its no-information floor.
 *
 * Yahoo's RSS endpoint is effectively dead (rate-limited / 429); Google News
 * RSS still works. `available` says whether any source actually answered, so
 * callers can distinguish "no news" from "neutral news".
 */

import Parser from 'rss-parser'
import {
  analyzeSentiment,
  calculateAggregateSentiment,
  getSentimentTradingSignal,
  type SentimentResult,
  type AggregateSentiment,
} from '@/lib/sentiment-utils'
import logger from '@/lib/logger'

export interface NewsItem {
  title: string
  link: string
  pubDate: string
  source: string
  snippet?: string
  timestamp: number
  sentiment: SentimentResult
}

export interface StockNewsResult {
  symbol: string
  exchange: string
  /** false when every source failed or returned nothing */
  available: boolean
  news: NewsItem[]
  sentiment: {
    aggregate: AggregateSentiment
    trading: ReturnType<typeof getSentimentTradingSignal>
  }
  sources: string[]
}

const parser = new Parser({
  timeout: 8000, // rss-parser defaults to 60s, which stalls a scan
  customFields: { item: ['description', 'content', 'content:encoded'] },
})

export function extractSnippet(content: string, maxLength: number = 150): string {
  if (!content) return ''
  const text = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length <= maxLength ? text : text.slice(0, maxLength).trim() + '...'
}

function similarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2
  const shorter = s1.length > s2.length ? s2 : s1
  if (longer.length === 0) return 1
  return (longer.length - levenshtein(longer, shorter)) / longer.length
}

function levenshtein(s1: string, s2: string): number {
  const costs: number[] = []
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j
      } else if (j > 0) {
        let newValue = costs[j - 1]
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1
        }
        costs[j - 1] = lastValue
        lastValue = newValue
      }
    }
    if (i > 0) costs[s2.length] = lastValue
  }
  return costs[s2.length]
}

export function removeDuplicates(news: NewsItem[]): NewsItem[] {
  const unique: NewsItem[] = []
  for (const item of news) {
    const dup = unique.some(u => similarity(u.title.toLowerCase(), item.title.toLowerCase()) > 0.8)
    if (!dup) unique.push(item)
  }
  return unique
}

async function fromFeed(url: string, source: string, limit: number): Promise<NewsItem[]> {
  const feed = await parser.parseURL(url)
  if (!feed.items?.length) return []
  return feed.items.slice(0, limit).map(item => {
    const title = item.title || 'No title'
    const snippet = extractSnippet(item.contentSnippet || item.content || (item as any).description || '')
    return {
      title,
      link: item.link || '',
      pubDate: item.pubDate || new Date().toISOString(),
      source,
      snippet,
      timestamp: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
      sentiment: analyzeSentiment(`${title} ${snippet}`),
    }
  })
}

/**
 * Fetch news for one symbol and score its sentiment.
 * Never throws: a dead source yields `available: false`.
 */
export async function fetchStockNews(
  symbol: string,
  exchange: string = 'NSE',
  limit: number = 20
): Promise<StockNewsResult> {
  const all: NewsItem[] = []
  const sources: string[] = []

  const yahooSymbol = exchange === 'NSE' ? `${symbol}.NS` : exchange === 'BSE' ? `${symbol}.BO` : symbol
  const feeds: Array<[string, string]> = [
    [`https://news.google.com/rss/search?q=${encodeURIComponent(symbol + ' stock India')}&hl=en-IN&gl=IN&ceid=IN:en`, 'Google News'],
    [`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${yahooSymbol}&region=IN&lang=en-IN`, 'Yahoo Finance'],
  ]

  const results = await Promise.allSettled(feeds.map(([url, source]) => fromFeed(url, source, 10)))
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value.length > 0) {
      all.push(...r.value)
      sources.push(feeds[i][1])
    } else if (r.status === 'rejected') {
      logger.warn('News source failed', { symbol, source: feeds[i][1], error: r.reason?.message })
    }
  })

  all.sort((a, b) => b.timestamp - a.timestamp)
  const news = removeDuplicates(all).slice(0, limit)
  const aggregate = calculateAggregateSentiment(news.map(n => n.sentiment))

  return {
    symbol,
    exchange,
    available: news.length > 0,
    news,
    sentiment: { aggregate, trading: getSentimentTradingSignal(aggregate) },
    sources,
  }
}
