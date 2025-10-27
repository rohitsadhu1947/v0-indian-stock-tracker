import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import { NewsItem } from '../quote/route';

// Disable caching for this API route
export const dynamic = 'force-dynamic';

// Initialize RSS parser
const parser = new Parser({
  customFields: {
    item: ['description', 'content', 'content:encoded']
  }
});

/**
 * Fetch general market news from multiple Indian sources
 * GET /api/news/market
 */
export async function GET() {
  try {
    console.log('📰 === MARKET NEWS API CALLED ===');

    const allNews: NewsItem[] = [];

    // Source 1: Economic Times - Market News
    try {
      console.log('📊 Fetching Economic Times market news...');
      const etUrl = 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms';
      const etFeed = await parser.parseURL(etUrl);
      
      if (etFeed.items && etFeed.items.length > 0) {
        console.log(`✅ Found ${etFeed.items.length} Economic Times articles`);
        etFeed.items.slice(0, 15).forEach(item => {
          allNews.push({
            title: item.title || 'No title',
            link: item.link || '',
            pubDate: item.pubDate || new Date().toISOString(),
            source: 'Economic Times',
            snippet: extractSnippet(item.contentSnippet || item.content || item.description || ''),
            timestamp: item.pubDate ? new Date(item.pubDate).getTime() : Date.now()
          });
        });
      }
    } catch (error: any) {
      console.error('❌ Economic Times fetch failed:', error.message);
    }

    // Source 2: Moneycontrol - Market News
    try {
      console.log('📊 Fetching Moneycontrol market news...');
      const mcUrl = 'https://www.moneycontrol.com/rss/latestnews.xml';
      const mcFeed = await parser.parseURL(mcUrl);
      
      if (mcFeed.items && mcFeed.items.length > 0) {
        console.log(`✅ Found ${mcFeed.items.length} Moneycontrol articles`);
        mcFeed.items.slice(0, 15).forEach(item => {
          allNews.push({
            title: item.title || 'No title',
            link: item.link || '',
            pubDate: item.pubDate || new Date().toISOString(),
            source: 'Moneycontrol',
            snippet: extractSnippet(item.contentSnippet || item.content || item.description || ''),
            timestamp: item.pubDate ? new Date(item.pubDate).getTime() : Date.now()
          });
        });
      }
    } catch (error: any) {
      console.error('❌ Moneycontrol fetch failed:', error.message);
    }

    // Source 3: NDTV Profit - Market News
    try {
      console.log('📊 Fetching NDTV Profit market news...');
      const ndtvUrl = 'https://www.ndtvprofit.com/rss/markets';
      const ndtvFeed = await parser.parseURL(ndtvUrl);
      
      if (ndtvFeed.items && ndtvFeed.items.length > 0) {
        console.log(`✅ Found ${ndtvFeed.items.length} NDTV Profit articles`);
        ndtvFeed.items.slice(0, 15).forEach(item => {
          allNews.push({
            title: item.title || 'No title',
            link: item.link || '',
            pubDate: item.pubDate || new Date().toISOString(),
            source: 'NDTV Profit',
            snippet: extractSnippet(item.contentSnippet || item.content || item.description || ''),
            timestamp: item.pubDate ? new Date(item.pubDate).getTime() : Date.now()
          });
        });
      }
    } catch (error: any) {
      console.error('❌ NDTV Profit fetch failed:', error.message);
    }

    // Source 4: Business Standard - Market News
    try {
      console.log('📊 Fetching Business Standard market news...');
      const bsUrl = 'https://www.business-standard.com/rss/markets-106.rss';
      const bsFeed = await parser.parseURL(bsUrl);
      
      if (bsFeed.items && bsFeed.items.length > 0) {
        console.log(`✅ Found ${bsFeed.items.length} Business Standard articles`);
        bsFeed.items.slice(0, 15).forEach(item => {
          allNews.push({
            title: item.title || 'No title',
            link: item.link || '',
            pubDate: item.pubDate || new Date().toISOString(),
            source: 'Business Standard',
            snippet: extractSnippet(item.contentSnippet || item.content || item.description || ''),
            timestamp: item.pubDate ? new Date(item.pubDate).getTime() : Date.now()
          });
        });
      }
    } catch (error: any) {
      console.error('❌ Business Standard fetch failed:', error.message);
    }

    // Sort by timestamp (newest first)
    allNews.sort((a, b) => b.timestamp - a.timestamp);

    // Remove duplicates
    const uniqueNews = removeDuplicates(allNews);

    console.log(`✅ Total unique market news items: ${uniqueNews.length}`);

    return NextResponse.json({
      success: true,
      count: uniqueNews.length,
      news: uniqueNews.slice(0, 30) // Return top 30 news items
    });

  } catch (error: any) {
    console.error('❌ Error in market news API:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch market news',
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

