import { NextRequest, NextResponse } from 'next/server';
import { getCachedQuote, cacheQuote } from '@/lib/cache-helpers';
import { getUserBrokerManager } from '@/lib/broker';
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth';

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserIdCompat()
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    // Get broker manager scoped to current user (falls back to admin's broker)
    const manager = await getUserBrokerManager()
    if (!manager.hasConnection()) {
      return NextResponse.json(
        { error: 'No broker connections available. Admin must connect a broker in settings.' },
        { status: 401 }
      )
    }
    const client = manager.getClient()

    const searchParams = request.nextUrl.searchParams;
    const symbols = searchParams.get('symbols'); // e.g., "NSE:RELIANCE,NSE:TCS"

    if (!symbols) {
      return NextResponse.json(
        { error: 'Symbols parameter is required' },
        { status: 400 }
      );
    }

    // Split symbols into array
    const symbolArray = symbols.split(',').map(s => s.trim());

    // 🗄️ DATABASE CACHE: Check cache for each symbol
    const quotesResult: Record<string, any> = {}
    const uncachedSymbols: string[] = []
    let cacheHits = 0
    let cacheMisses = 0

    for (const fullSymbol of symbolArray) {
      const [exchange, symbol] = fullSymbol.split(':')
      const cached = await getCachedQuote(symbol, exchange)

      if (cached) {
        quotesResult[fullSymbol] = cached
        cacheHits++
      } else {
        uncachedSymbols.push(fullSymbol)
        cacheMisses++
      }
    }

    // Fetch uncached symbols from broker API
    if (uncachedSymbols.length > 0) {
      console.log(`📡 Fetching ${uncachedSymbols.length} symbols from ${client.displayName} (${cacheHits} from cache)`)

      const freshQuotes = await client.getQuote(uncachedSymbols);

      // Merge fresh quotes and cache them
      for (const [fullSymbol, quoteData] of Object.entries(freshQuotes)) {
        // Return normalized QuoteData but also include backward-compatible fields
        quotesResult[fullSymbol] = {
          ...quoteData,
          // Backward-compatible aliases for frontend that still uses Kite field names
          last_price: quoteData.lastPrice,
          net_change: quoteData.change,
          ohlc: {
            open: quoteData.open,
            high: quoteData.high,
            low: quoteData.low,
            close: quoteData.close,
          },
        }

        // Cache for future use (store normalized shape)
        const [exchange, symbol] = fullSymbol.split(':')
        await cacheQuote(symbol, exchange, quotesResult[fullSymbol])
      }
    } else {
      console.log(`✅ All ${symbolArray.length} quotes served from cache (100% cache hit rate!)`)
    }

    const cacheHitRate = symbolArray.length > 0 ? (cacheHits / symbolArray.length * 100).toFixed(0) : 0

    return NextResponse.json({
      success: true,
      data: quotesResult,
      timestamp: new Date().toISOString(),
      cache: {
        hits: cacheHits,
        misses: cacheMisses,
        hitRate: `${cacheHitRate}%`
      }
    });
  } catch (error: any) {
    console.error('Error fetching quotes:', error);

    // Handle token expiry — Kite returns various error messages for expired/invalid tokens
    const msg = (error.message || '').toLowerCase()
    if (msg.includes('token') || msg.includes('access_token') || msg.includes('api_key') || msg.includes('session')) {
      return NextResponse.json(
        { error: 'Broker token expired. Reconnect Zerodha to resume market data.', code: 'TOKEN_EXPIRED' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to fetch quotes' },
      { status: 500 }
    );
  }
}
