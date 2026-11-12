import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db'
import { newsData } from '@/db/schema'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'
import { fetchStockNews } from '@/lib/stock-news'

// Disable caching for this API route
export const dynamic = 'force-dynamic';

export type { NewsItem } from '@/lib/stock-news'

/**
 * Fetch stock-specific news from multiple sources
 * GET /api/news/quote?symbol=TCS&exchange=NSE
 *
 * The fetching/sentiment logic lives in lib/stock-news.ts so server code
 * (cron jobs) can call it directly instead of over HTTP.
 */
export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserIdCompat()
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const exchange = searchParams.get('exchange') || 'NSE';
    const limit = parseInt(searchParams.get('limit') || '20');

    if (!symbol) {
      return NextResponse.json(
        { success: false, error: 'Symbol is required' },
        { status: 400 }
      );
    }

    const result = await fetchStockNews(symbol, exchange, limit);

    // Persist news items to DB (non-fatal)
    if (result.news.length > 0) {
      try {
        await db.insert(newsData).values(result.news.map(item => ({
          symbol: symbol.toUpperCase(),
          newsType: 'stock' as const,
          title: item.title,
          link: item.link || null,
          snippet: item.snippet || null,
          source: item.source || null,
          publishedAt: item.pubDate ? new Date(item.pubDate) : null,
          sentiment: item.sentiment as any,
          fetchedAt: new Date(),
        })))
      } catch (dbError: any) {
        console.error(`⚠️ Failed to save news for ${symbol}:`, dbError.message)
      }
    }

    return NextResponse.json({
      success: true,
      symbol,
      exchange,
      available: result.available,
      count: result.news.length,
      news: result.news,
      sentiment: result.sentiment,
      sources: result.sources,
    });

  } catch (error: any) {
    console.error('❌ Error in news API:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch news', message: error.message },
      { status: 500 }
    );
  }
}
