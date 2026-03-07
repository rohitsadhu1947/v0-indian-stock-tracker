import { NextRequest, NextResponse } from 'next/server';
import { getCachedHistorical, cacheHistorical } from '@/lib/cache-helpers';
import { getUserBrokerManager } from '@/lib/broker';

export async function GET(request: NextRequest) {
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
    const instrumentToken = searchParams.get('instrument_token');
    const interval = searchParams.get('interval') || 'day'; // day, minute, 5minute, etc.
    const fromDate = searchParams.get('from_date');
    const toDate = searchParams.get('to_date');
    const symbol = searchParams.get('symbol') || '';
    const exchange = searchParams.get('exchange') || 'NSE';

    if (!instrumentToken) {
      return NextResponse.json(
        { error: 'Instrument token is required' },
        { status: 400 }
      );
    }

    // Calculate default date range (last 60 days for proper technical indicators)
    const to = toDate ? new Date(toDate) : new Date();
    const from = fromDate ? new Date(fromDate) : new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    // 🗄️ DATABASE CACHE: Check cache first
    const cached = await getCachedHistorical(instrumentToken, interval, from, to)

    if (cached) {
      console.log(`✅ Historical data served from cache (token ${instrumentToken}, ${interval})`)
      return NextResponse.json({
        success: true,
        candles: cached,
        data: cached, // Keep both for compatibility
        meta: {
          instrument_token: instrumentToken,
          interval: interval,
          from: from.toISOString(),
          to: to.toISOString(),
          candle_count: cached?.length || 0
        },
        timestamp: new Date().toISOString(),
        cached: true
      });
    }

    // Cache miss - fetch from broker API via unified interface
    console.log(`📊 Fetching historical for token ${instrumentToken}, interval ${interval}, from ${from.toISOString().split('T')[0]} to ${to.toISOString().split('T')[0]}`);

    const historicalData = await client.getHistoricalData({
      instrumentToken,
      interval,
      from,
      to,
      symbol,
      exchange,
    });

    console.log(`✅ Received ${historicalData?.length || 0} candles for token ${instrumentToken}`);

    // Cache the result
    await cacheHistorical(instrumentToken, interval, from, to, historicalData)

    return NextResponse.json({
      success: true,
      candles: historicalData,
      data: historicalData, // Keep both for compatibility
      meta: {
        instrument_token: instrumentToken,
        interval: interval,
        from: from.toISOString(),
        to: to.toISOString(),
        candle_count: historicalData?.length || 0
      },
      timestamp: new Date().toISOString(),
      cached: false
    });
  } catch (error: any) {
    console.error('Error fetching historical data:', error);

    // Handle token expiry
    if (error.message && error.message.includes('Token')) {
      return NextResponse.json(
        { error: 'Session expired. Please login again.', code: 'TOKEN_EXPIRED' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to fetch historical data' },
      { status: 500 }
    );
  }
}
