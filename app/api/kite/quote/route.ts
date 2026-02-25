import { NextRequest, NextResponse } from 'next/server';
import { getCachedQuote, cacheQuote } from '@/lib/cache-helpers';
import { getBrokerManager, KiteBrokerClient } from '@/lib/broker';

export async function GET(request: NextRequest) {
  try {
    // Get broker manager (supports broker_connections, cookie, and admin master token)
    const manager = await getBrokerManager()
    if (!manager.hasConnection()) {
      return NextResponse.json(
        { error: 'No broker connections available. Admin must connect a broker in settings.' },
        { status: 401 }
      )
    }
    const client = manager.getClient() as KiteBrokerClient

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

    // Fetch uncached symbols from Kite API
    if (uncachedSymbols.length > 0) {
      console.log(`📡 Fetching ${uncachedSymbols.length} symbols from Kite API (${cacheHits} from cache)`)

      const freshQuotes = await client.getRawQuote(uncachedSymbols);

      // Merge fresh quotes and cache them
      for (const [fullSymbol, quoteData] of Object.entries(freshQuotes)) {
        quotesResult[fullSymbol] = quoteData

        // Cache for future use
        const [exchange, symbol] = fullSymbol.split(':')
        await cacheQuote(symbol, exchange, quoteData)
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

    // Handle token expiry
    if (error.message && error.message.includes('Token')) {
      return NextResponse.json(
        { error: 'Session expired. Please login again.', code: 'TOKEN_EXPIRED' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to fetch quotes' },
      { status: 500 }
    );
  }
}
