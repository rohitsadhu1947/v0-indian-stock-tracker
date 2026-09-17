import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.KITE_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key not configured' },
        { status: 500 }
      );
    }

    // Build login URL manually instead of using kc.getLoginURL()
    // This gives us control over parameters and logging
    const loginUrl = `https://kite.zerodha.com/connect/login?v=3&api_key=${apiKey}`;

    console.log(`🔗 Kite login redirect → ${loginUrl}`);
    console.log(`📌 Expected callback: ${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3006'}/api/auth/kite/callback`);

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
