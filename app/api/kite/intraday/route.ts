import { NextRequest, NextResponse } from 'next/server';
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
    const instrumentToken = searchParams.get('instrument_token');
    const interval = searchParams.get('interval') || '5minute'; // minute, 5minute, 15minute
    const symbol = searchParams.get('symbol') || '';
    const exchange = searchParams.get('exchange') || 'NSE';

    if (!instrumentToken) {
      return NextResponse.json(
        { error: 'Instrument token is required' },
        { status: 400 }
      );
    }

    // Get today's date range
    const to = new Date();
    const from = new Date();
    from.setHours(9, 0, 0, 0); // Start from 9:00 AM today

    // Fetch intraday historical data via unified BrokerClient interface
    const historicalData = await client.getHistoricalData({
      instrumentToken,
      interval,
      from,
      to,
      symbol,
      exchange,
    });

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

    // Handle token expiry — Kite returns various error messages for expired/invalid tokens
    const msg = (error.message || '').toLowerCase()
    if (msg.includes('token') || msg.includes('access_token') || msg.includes('api_key') || msg.includes('session')) {
      return NextResponse.json(
        { error: 'Broker token expired. Reconnect Zerodha to resume market data.', code: 'TOKEN_EXPIRED' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to fetch intraday data' },
      { status: 500 }
    );
  }
}
