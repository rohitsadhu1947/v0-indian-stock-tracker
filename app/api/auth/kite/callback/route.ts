import { NextRequest, NextResponse } from 'next/server';
import { KiteConnect } from 'kiteconnect';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const requestToken = searchParams.get('request_token');
    const status = searchParams.get('status');

    if (status === 'error' || !requestToken) {
      return NextResponse.redirect(
        new URL('/?error=authentication_failed', request.url)
      );
    }

    const apiKey = process.env.KITE_API_KEY;
    const apiSecret = process.env.KITE_API_SECRET;

    if (!apiKey || !apiSecret) {
      return NextResponse.redirect(
        new URL('/?error=configuration_error', request.url)
      );
    }

    const kc = new KiteConnect({ api_key: apiKey });

    // Generate session using request token
    const session = await kc.generateSession(requestToken, apiSecret);

    // Store access token in secure HTTP-only cookie
    const cookieStore = await cookies();
    cookieStore.set('kite_access_token', session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
    });

    // Also store user info if needed
    cookieStore.set('kite_user_id', session.user_id || '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
      path: '/',
    });

    // Redirect back to home page
    return NextResponse.redirect(new URL('/?authenticated=true', request.url));
  } catch (error: any) {
    console.error('Error in authentication callback:', error);
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(error.message || 'authentication_failed')}`, request.url)
    );
  }
}

