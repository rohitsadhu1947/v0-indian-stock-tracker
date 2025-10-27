import { NextRequest, NextResponse } from 'next/server';
import Parser from 'rss-parser';
import { analyzeSentiment, calculateAggregateSentiment, getSentimentTradingSignal, type SentimentResult, type AggregateSentiment } from '@/lib/sentiment-utils';

// Disable caching for this API route
export const dynamic = 'force-dynamic';

// Define types for news items
export interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  snippet?: string;
  timestamp: number; // Unix timestamp for sorting
  sentiment: SentimentResult; // Sentiment analysis
}

// Initialize RSS parser
const parser = new Parser({
  customFields: {
    item: ['description', 'content', 'content:encoded']
  }
});

/**
 * Fetch stock-specific news from multiple sources
 * GET /api/news/quote?symbol=TCS&exchange=NSE
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const exchange = searchParams.get('exchange') || 'NSE';

    console.log('📰 === NEWS API CALLED ===');
    console.log(`📥 Received request: symbol=${symbol}, exchange=${exchange}`);

    if (!symbol) {
      return NextResponse.json(
        { success: false, error: 'Symbol is required' },
        { status: 400 }
      );
    }

    const allNews: NewsItem[] = [];

    // Source 1: Yahoo Finance RSS (stock-specific)
    try {
      console.log(`📊 Fetching Yahoo Finance news for ${symbol}...`);
      const yahooSymbol = exchange === 'NSE' ? `${symbol}.NS` : 
                         exchange === 'BSE' ? `${symbol}.BO` : symbol;
      
      const yahooUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${yahooSymbol}&region=IN&lang=en-IN`;
      const yahooFeed = await parser.parseURL(yahooUrl);
      
      if (yahooFeed.items && yahooFeed.items.length > 0) {
        console.log(`✅ Found ${yahooFeed.items.length} Yahoo Finance news items`);
        yahooFeed.items.slice(0, 10).forEach(item => {
          const title = item.title || 'No title';
          const snippet = extractSnippet(item.contentSnippet || item.content || item.description || '');
          const textForAnalysis = `${title} ${snippet}`;
          
          allNews.push({
            title,
            link: item.link || '',
            pubDate: item.pubDate || new Date().toISOString(),
            source: 'Yahoo Finance',
            snippet,
            timestamp: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
            sentiment: analyzeSentiment(textForAnalysis)
          });
        });
      } else {
        console.log('⚠️ No Yahoo Finance news found');
      }
    } catch (error: any) {
      console.error(`❌ Yahoo Finance news fetch failed:`, error.message);
      // Continue to other sources even if Yahoo fails
    }

    // Source 2: Google News RSS (stock-specific)
    try {
      console.log(`📊 Fetching Google News for ${symbol}...`);
      const googleUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(symbol + ' stock India')}&hl=en-IN&gl=IN&ceid=IN:en`;
      const googleFeed = await parser.parseURL(googleUrl);
      
      if (googleFeed.items && googleFeed.items.length > 0) {
        console.log(`✅ Found ${googleFeed.items.length} Google News items`);
        googleFeed.items.slice(0, 10).forEach(item => {
          const title = item.title || 'No title';
          const snippet = extractSnippet(item.contentSnippet || item.content || item.description || '');
          const textForAnalysis = `${title} ${snippet}`;
          
          allNews.push({
            title,
            link: item.link || '',
            pubDate: item.pubDate || new Date().toISOString(),
            source: 'Google News',
            snippet,
            timestamp: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
            sentiment: analyzeSentiment(textForAnalysis)
          });
        });
      } else {
        console.log('⚠️ No Google News found');
      }
    } catch (error: any) {
      console.error(`❌ Google News fetch failed:`, error.message);
    }

    // Sort by timestamp (newest first)
    allNews.sort((a, b) => b.timestamp - a.timestamp);

    // Remove duplicates based on title similarity
    const uniqueNews = removeDuplicates(allNews);

    console.log(`✅ Total unique news items: ${uniqueNews.length}`);

    // Calculate aggregate sentiment
    const topNews = uniqueNews.slice(0, 20); // Top 20 news items
    const sentiments = topNews.map(item => item.sentiment);
    const aggregateSentiment = calculateAggregateSentiment(sentiments);
    const tradingSignal = getSentimentTradingSignal(aggregateSentiment);
    
    console.log(`📊 Sentiment Analysis: ${aggregateSentiment.overall} (${aggregateSentiment.positive} positive, ${aggregateSentiment.negative} negative, ${aggregateSentiment.neutral} neutral)`);
    console.log(`💡 Trading Signal: ${tradingSignal.signal} (strength: ${tradingSignal.strength}/10)`);

    return NextResponse.json({
      success: true,
      symbol,
      exchange,
      count: topNews.length,
      news: topNews,
      sentiment: {
        aggregate: aggregateSentiment,
        trading: tradingSignal
      }
    });

  } catch (error: any) {
    console.error('❌ Error in news API:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch news',
        message: error.message 
      },
      { status: 500 }
    );
  }
}

/**
 * Extract a clean snippet from HTML/text content
 */
function extractSnippet(content: string, maxLength: number = 150): string {
  // Remove HTML tags
  let text = content.replace(/<[^>]*>/g, '');
  
  // Decode HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  
  // Trim and truncate
  text = text.trim();
  if (text.length > maxLength) {
    text = text.substring(0, maxLength) + '...';
  }
  
  return text;
}

/**
 * Remove duplicate news items based on title similarity
 */
function removeDuplicates(news: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const unique: NewsItem[] = [];
  
  for (const item of news) {
    // Create a normalized version of the title for comparison
    const normalized = item.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Check if we've seen a very similar title
    let isDuplicate = false;
    for (const seenTitle of seen) {
      if (similarity(normalized, seenTitle) > 0.8) {
        isDuplicate = true;
        break;
      }
    }
    
    if (!isDuplicate) {
      seen.add(normalized);
      unique.push(item);
    }
  }
  
  return unique;
}

/**
 * Calculate string similarity (0 to 1)
 */
function similarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = levenshtein(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshtein(s1: string, s2: string): number {
  const costs: number[] = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

