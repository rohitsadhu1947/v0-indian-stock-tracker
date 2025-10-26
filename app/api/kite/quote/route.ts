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
    const symbols = searchParams.get('symbols'); // e.g., "NSE:RELIANCE,NSE:TCS"
    
    if (!symbols) {
      return NextResponse.json(
        { error: 'Symbols parameter is required' },
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

    // Split symbols and fetch quotes
    const symbolArray = symbols.split(',').map(s => s.trim());
    const quotes = await kc.getQuote(symbolArray);

    return NextResponse.json({
      success: true,
      data: quotes,
      timestamp: new Date().toISOString(),
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

