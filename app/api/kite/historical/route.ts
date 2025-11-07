import { NextRequest, NextResponse } from 'next/server';
import { KiteConnect } from 'kiteconnect';
import { getCachedHistorical, cacheHistorical } from '@/lib/cache-helpers';
import { getKiteAccessToken, getKiteApiKey } from '@/lib/kite-token-helper';

export async function GET(request: NextRequest) {
  try {
    // Get Kite access token (supports both Kite and email users)
    const accessToken = await getKiteAccessToken();

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Not authenticated. Please ensure admin user has logged in via Kite.' },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const instrumentToken = searchParams.get('instrument_token');
    const interval = searchParams.get('interval') || 'day'; // day, minute, 5minute, etc.
    const fromDate = searchParams.get('from_date');
    const toDate = searchParams.get('to_date');
    
    if (!instrumentToken) {
      return NextResponse.json(
        { error: 'Instrument token is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.KITE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key not configured' },
        { status: 500 }
      );
    }

    // Calculate default date range (last 60 days for proper technical indicators)
    // 60 calendar days = ~40 trading days (enough for all indicators)
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

    // Cache miss - fetch from Kite API
    const kc = new KiteConnect({ api_key: apiKey });
    kc.setAccessToken(accessToken);

    console.log(`📊 Fetching historical for token ${instrumentToken}, interval ${interval}, from ${from.toISOString().split('T')[0]} to ${to.toISOString().split('T')[0]}`);
    
    const historicalData = await kc.getHistoricalData(
      instrumentToken,
      interval,
      from,
      to
    );

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

