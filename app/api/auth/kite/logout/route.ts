import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { clearUserIdCache } from '@/lib/auth-helpers';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    
    // Get user ID before clearing cookies (for cache clearing)
    const kiteUserId = cookieStore.get('kite_user_id')?.value;
    
    // Clear authentication cookies
    cookieStore.delete('kite_access_token');
    cookieStore.delete('kite_user_id');

    // Clear the user ID cache
    if (kiteUserId) {
      clearUserIdCache(kiteUserId);
    }

    return NextResponse.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Error during logout:', error);
    return NextResponse.json(
      { error: 'Failed to logout' },
      { status: 500 }
    );
  }
}