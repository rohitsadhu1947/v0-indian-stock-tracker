import { NextRequest, NextResponse } from 'next/server';
import { getUserBrokerManager } from '@/lib/broker';
import type { InstrumentData } from '@/lib/broker';
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth';

// Cache instruments data for 1 hour to avoid repeated API calls
let instrumentsCache: InstrumentData[] | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

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
    const exchange = searchParams.get('exchange') || 'NSE'; // NSE, BSE, NFO, etc.
    const searchQuery = searchParams.get('search'); // Optional search term

    // Check cache
    const now = Date.now();
    if (instrumentsCache && (now - cacheTimestamp) < CACHE_DURATION) {
      let data = instrumentsCache;

      // Filter by search query if provided
      if (searchQuery) {
        data = data.filter((inst) =>
          inst.tradingsymbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
          inst.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }

      return NextResponse.json({
        success: true,
        data: data,
        cached: true,
        timestamp: new Date(cacheTimestamp).toISOString(),
      });
    }

    // Fetch instruments list via unified BrokerClient interface
    const instruments = await client.getInstruments(exchange);

    // Update cache
    instrumentsCache = instruments;
    cacheTimestamp = now;

    let data = instruments;

    // Filter by search query if provided
    if (searchQuery) {
      data = data.filter((inst) =>
        inst.tradingsymbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (inst.name && inst.name.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    return NextResponse.json({
      success: true,
      data: data,
      cached: false,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error fetching instruments:', error);

    // Handle token expiry — Kite returns various error messages for expired/invalid tokens
    const msg = (error.message || '').toLowerCase()
    if (msg.includes('token') || msg.includes('access_token') || msg.includes('api_key') || msg.includes('session')) {
      return NextResponse.json(
        { error: 'Broker token expired. Reconnect Zerodha to resume market data.', code: 'TOKEN_EXPIRED' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to fetch instruments' },
      { status: 500 }
    );
  }
}
