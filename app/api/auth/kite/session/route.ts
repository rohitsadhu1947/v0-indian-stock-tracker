import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('kite_access_token')?.value;
    const userId = cookieStore.get('kite_user_id')?.value;

    if (!accessToken) {
      return NextResponse.json({
        authenticated: false,
        user: null,
      });
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        userId: userId || 'unknown',
      },
    });
  } catch (error) {
    console.error('Error checking session:', error);
    return NextResponse.json({
      authenticated: false,
      user: null,
    });
  }
}

