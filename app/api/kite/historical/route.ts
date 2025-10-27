import { NextRequest, NextResponse } from 'next/server';
import { KiteConnect } from 'kiteconnect';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('kite_access_token')?.value;

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Not authenticated. Please login first.' },
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

    const kc = new KiteConnect({ api_key: apiKey });
    kc.setAccessToken(accessToken);

    // Calculate default date range (last 30 days for better data availability)
    const to = toDate ? new Date(toDate) : new Date();
    const from = fromDate ? new Date(fromDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Fetch historical data
    console.log(`📊 Fetching historical for token ${instrumentToken}, interval ${interval}, from ${from.toISOString().split('T')[0]} to ${to.toISOString().split('T')[0]}`);
    
    const historicalData = await kc.getHistoricalData(
      instrumentToken,
      interval,
      from,
      to
    );

    console.log(`✅ Received ${historicalData?.length || 0} candles for token ${instrumentToken}`);

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

