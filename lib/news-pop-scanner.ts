import { MomentumSignal, scanForMomentumSignals } from './momentum-scanner';
import Parser from 'rss-parser';
import { analyzeSentiment, type SentimentResult } from './sentiment-utils';

// Initialize RSS parser
const parser = new Parser({
  customFields: {
    item: ['description', 'content', 'content:encoded']
  }
});

/**
 * News item interface
 */
export interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  snippet?: string;
  timestamp: number;
  sentiment: SentimentResult;
}

/**
 * News Pop Signal - extends MomentumSignal with news data
 */
export interface NewsPopSignal extends MomentumSignal {
  news: NewsItem[];
  newsSentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  newsSentimentScore: number; // -1 to +1
  volumeSpike: number; // e.g., 2.5 = 2.5x average volume
  detectedAt: Date;
}

/**
 * Fetch news for a specific stock symbol
 * Returns news from last 24 hours
 */
async function fetchStockNews(symbol: string): Promise<NewsItem[]> {
  const allNews: NewsItem[] = [];
  const now = Date.now();
  const oneDayAgo = now - (24 * 60 * 60 * 1000); // 24 hours

  // Source 1: Yahoo Finance
  try {
    const yahooSymbol = `${symbol}.NS`; // NSE symbol
    const yahooUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${yahooSymbol}&region=IN&lang=en-IN`;
    const feed = await parser.parseURL(yahooUrl);

    if (feed.items && feed.items.length > 0) {
      feed.items.slice(0, 10).forEach(item => {
        const timestamp = item.pubDate ? new Date(item.pubDate).getTime() : now;
        
        // Only include news from last 24 hours
        if (timestamp >= oneDayAgo) {
          const title = item.title || 'No title';
          const snippet = extractSnippet(item.contentSnippet || item.content || item.description || '');
          const textForAnalysis = `${title} ${snippet}`;

          allNews.push({
            title,
            link: item.link || '',
            pubDate: item.pubDate || new Date().toISOString(),
            source: 'Yahoo Finance',
            snippet,
            timestamp,
            sentiment: analyzeSentiment(textForAnalysis)
          });
        }
      });
    }
  } catch (error) {
    console.error(`  ⚠️ Yahoo Finance news fetch failed for ${symbol}:`, error);
  }

  // Source 2: Google News
  try {
    const googleUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(symbol + ' stock India')}&hl=en-IN&gl=IN&ceid=IN:en`;
    const feed = await parser.parseURL(googleUrl);

    if (feed.items && feed.items.length > 0) {
      feed.items.slice(0, 10).forEach(item => {
        const timestamp = item.pubDate ? new Date(item.pubDate).getTime() : now;
        
        // Only include news from last 24 hours
        if (timestamp >= oneDayAgo) {
          const title = item.title || 'No title';
          const snippet = extractSnippet(item.contentSnippet || item.content || item.description || '');
          const textForAnalysis = `${title} ${snippet}`;

          allNews.push({
            title,
            link: item.link || '',
            pubDate: item.pubDate || new Date().toISOString(),
            source: 'Google News',
            snippet,
            timestamp,
            sentiment: analyzeSentiment(textForAnalysis)
          });
        }
      });
    }
  } catch (error) {
    console.error(`  ⚠️ Google News fetch failed for ${symbol}:`, error);
  }

  // Sort by timestamp (newest first) and deduplicate by title
  const uniqueNews = Array.from(
    new Map(allNews.map(item => [item.title.toLowerCase(), item])).values()
  );
  
  return uniqueNews.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Extract snippet from HTML content
 */
function extractSnippet(content: string): string {
  if (!content) return '';
  
  // Remove HTML tags
  const text = content.replace(/<[^>]*>/g, '');
  
  // Decode HTML entities
  const decoded = text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  
  // Truncate to 200 characters
  return decoded.trim().substring(0, 200);
}

/**
 * Calculate aggregate sentiment from news items
 */
function calculateAggregateSentiment(news: NewsItem[]): {
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  score: number; // -1 to +1
} {
  if (news.length === 0) {
    return { sentiment: 'NEUTRAL', score: 0 };
  }

  // Calculate average comparative score
  const avgScore = news.reduce((sum, item) => sum + item.sentiment.comparative, 0) / news.length;

  // Count sentiment labels
  const positive = news.filter(n => n.sentiment.label === 'POSITIVE').length;
  const negative = news.filter(n => n.sentiment.label === 'NEGATIVE').length;
  const positiveRatio = positive / news.length;
  const negativeRatio = negative / news.length;

  // Determine overall sentiment
  let sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  
  if (positiveRatio > 0.5 && avgScore > 0.2) {
    sentiment = 'POSITIVE';
  } else if (negativeRatio > 0.5 && avgScore < -0.2) {
    sentiment = 'NEGATIVE';
  } else if (avgScore > 0.1) {
    sentiment = 'POSITIVE';
  } else if (avgScore < -0.1) {
    sentiment = 'NEGATIVE';
  } else {
    sentiment = 'NEUTRAL';
  }

  return { sentiment, score: avgScore };
}

/**
 * Scan stocks for news-driven price/volume spikes
 * 
 * This function:
 * 1. Takes pre-fetched stock data
 * 2. Fetches news for each stock FIRST
 * 3. Only analyzes stocks WITH recent news
 * 4. Checks for volume spike or price move (relaxed filters)
 * 5. Uses real momentum scanner for technical analysis
 * 
 * @param stocksData - Array of stocks with quotes and historical data
 * @param capital - Available capital for position sizing
 * @param forceAnalyze - If true, analyzes even without volume/price filters (for custom stocks)
 * @returns Array of NewsPopSignal objects with momentum + news data
 */
export async function scanForNewsPops(
  stocksData: Array<{
    symbol: string;
    exchange: string;
    instrumentToken: string;
    current: number;
    change: number;
    changePercent: number;
    volume: number;
    avgVolume: number;
    candles: any[];
    sector?: string;
  }>,
  capital: number = 300000,
  forceAnalyze: boolean = false
): Promise<NewsPopSignal[]> {
  console.log(`\n📰 === NEWS POP SCANNER STARTED ===`);
  console.log(`📊 Scanning ${stocksData.length} stocks for news-driven moves...`);
  console.log(`🔍 Mode: ${forceAnalyze ? 'FORCE ANALYZE (custom stocks)' : 'FILTERED SCAN'}`);

  const newsPops: NewsPopSignal[] = [];

  // Step 1: Fetch news for ALL stocks first (in batches to avoid overwhelming APIs)
  console.log(`\n📰 Fetching news for ${stocksData.length} stocks...`);
  const batchSize = 5; // Fetch news for 5 stocks at a time
  const stocksWithNews: Array<typeof stocksData[0] & { news: NewsItem[] }> = [];

  for (let i = 0; i < stocksData.length; i += batchSize) {
    const batch = stocksData.slice(i, i + batchSize);
    console.log(`  Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(stocksData.length / batchSize)}: Fetching news for ${batch.map(s => s.symbol).join(', ')}...`);
    
    const newsPromises = batch.map(async (stock) => {
      try {
        const news = await fetchStockNews(stock.symbol);
        if (news.length > 0) {
          console.log(`    ✅ ${stock.symbol}: Found ${news.length} news items`);
          return { ...stock, news };
        } else {
          console.log(`    ⚠️ ${stock.symbol}: No recent news`);
          return null;
        }
      } catch (error) {
        console.error(`    ❌ ${stock.symbol}: Error fetching news:`, error);
        return null;
      }
    });

    const batchResults = await Promise.all(newsPromises);
    const validResults = batchResults.filter((r): r is NonNullable<typeof r> => r !== null);
    stocksWithNews.push(...validResults);
  }

  console.log(`✅ Found ${stocksWithNews.length} stocks with recent news (out of ${stocksData.length} scanned)`);

  if (stocksWithNews.length === 0) {
    console.log(`📰 No stocks with recent news found`);
    return [];
  }

  // Step 2: Filter by volume spike OR price move (relaxed - only need ONE, not both)
  const stocksToAnalyze = forceAnalyze ? stocksWithNews : stocksWithNews.filter(stock => {
    const volumeRatio = stock.avgVolume > 0 ? stock.volume / stock.avgVolume : 0;
    const hasVolumeSpike = volumeRatio >= 1.5; // Relaxed from 2.0x to 1.5x
    const hasPriceMove = Math.abs(stock.changePercent) >= 1.0; // Relaxed from 2% to 1%
    
    // Only need ONE of these conditions (OR, not AND)
    return hasVolumeSpike || hasPriceMove;
  });

  if (forceAnalyze) {
    console.log(`✅ Force analyzing ${stocksToAnalyze.length} stocks (custom mode)`);
  } else {
    console.log(`✅ Filtered to ${stocksToAnalyze.length} stocks with news + (volume spike 1.5x+ OR price move 1%+)`);
  }

  if (stocksToAnalyze.length === 0) {
    console.log(`📰 No stocks meet the criteria`);
    return [];
  }

  // Step 3: Run momentum scanner on these stocks to get REAL technical analysis
  console.log(`\n🔍 Running momentum analysis on ${stocksToAnalyze.length} stocks...`);
  
  const momentumResult = await scanForMomentumSignals(
    stocksToAnalyze,
    capital,
    {
      minPrice: 10, // Lower threshold for news pops
      minVolume: 50000, // Lower threshold
      customStocks: stocksToAnalyze.map(s => s.symbol) // Force analyze all
    }
  );

  console.log(`✅ Momentum analysis complete: ${momentumResult.signals.length} signals`);

  // Step 4: Combine momentum signals with news data
  console.log(`\n📰 Combining momentum signals with news data...`);
  
  for (const signal of momentumResult.signals) {
    const stockWithNews = stocksToAnalyze.find(s => s.symbol === signal.symbol);
    if (!stockWithNews) continue;

    // Calculate aggregate sentiment
    const { sentiment, score } = calculateAggregateSentiment(stockWithNews.news);

    // Calculate volume spike ratio
    const volumeSpike = stockWithNews.avgVolume > 0 
      ? stockWithNews.volume / stockWithNews.avgVolume 
      : 0;

    // Create NewsPopSignal
    const newsPop: NewsPopSignal = {
      ...signal,
      news: stockWithNews.news,
      newsSentiment: sentiment,
      newsSentimentScore: score,
      volumeSpike,
      detectedAt: new Date()
    };

    newsPops.push(newsPop);
    console.log(`  ✅ ${signal.symbol}: Combined (${stockWithNews.news.length} news, ${sentiment} sentiment)`);
  }

  console.log(`\n✅ News Pop scan complete: ${newsPops.length} stocks with news-driven moves`);
  
  // Sort by volume spike (highest first)
  newsPops.sort((a, b) => b.volumeSpike - a.volumeSpike);

  return newsPops;
}

/**
 * Get top news headline for a signal (for quick display)
 */
export function getTopNewsHeadline(signal: NewsPopSignal): string {
  if (signal.news.length === 0) return 'No recent news';
  return signal.news[0].title;
}

/**
 * Get news summary for a signal
 */
export function getNewsSummary(signal: NewsPopSignal): string {
  const newsCount = signal.news.length;
  const positive = signal.news.filter(n => n.sentiment.label === 'POSITIVE').length;
  const negative = signal.news.filter(n => n.sentiment.label === 'NEGATIVE').length;
  
  return `${newsCount} articles (${positive} positive, ${negative} negative)`;
}
