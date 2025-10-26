import { NextRequest, NextResponse } from 'next/server';
import { KiteConnect } from 'kiteconnect';

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.KITE_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key not configured' },
        { status: 500 }
      );
    }

    const kc = new KiteConnect({ api_key: apiKey });
    
    // Generate login URL
    const loginUrl = kc.getLoginURL();
    
    // Redirect to Zerodha login page
    return NextResponse.redirect(loginUrl);
  } catch (error) {
    console.error('Error generating login URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate login URL' },
      { status: 500 }
    );
  }
}

