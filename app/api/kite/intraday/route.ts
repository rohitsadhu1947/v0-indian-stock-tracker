import { NextRequest, NextResponse } from 'next/server';
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
    const instrumentToken = searchParams.get('instrument_token');
    const interval = searchParams.get('interval') || '5minute'; // minute, 5minute, 15minute

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

    // Fetch intraday historical data (use raw to preserve Kite response format)
    const historicalData = await client.getRawHistoricalData(
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
