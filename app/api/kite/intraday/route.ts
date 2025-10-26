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
    const interval = searchParams.get('interval') || '5minute'; // minute, 5minute, 15minute
    
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

    // Get today's date range
    const to = new Date();
    const from = new Date();
    from.setHours(9, 0, 0, 0); // Start from 9:00 AM today

    // Fetch intraday historical data
    const historicalData = await kc.getHistoricalData(
      instrumentToken,
      interval,
      from,
      to
    );

    return NextResponse.json({
      success: true,
      data: historicalData,
      meta: {
        instrument_token: instrumentToken,
        interval: interval,
        from: from.toISOString(),
        to: to.toISOString(),
        candles: historicalData.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error fetching intraday data:', error);
    
    // Handle token expiry
    if (error.message && error.message.includes('Token')) {
      return NextResponse.json(
        { error: 'Session expired. Please login again.', code: 'TOKEN_EXPIRED' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to fetch intraday data' },
      { status: 500 }
    );
  }
}

