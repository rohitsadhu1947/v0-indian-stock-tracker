import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/db';
import { sessions, users } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    
    // Get user ID before clearing cookies (for cache clearing)
    const kiteUserId = cookieStore.get('kite_user_id')?.value;
    const accessToken = cookieStore.get('kite_access_token')?.value;
    
    // Clear ALL authentication cookies (old and new systems)
    cookieStore.delete('kite_access_token');
    cookieStore.delete('kite_user_id');
    cookieStore.delete('auth_user_id'); // NEW: Clear unified auth cookie

    // IMPORTANT: Delete session from database to prevent auto-login
    if (kiteUserId && accessToken) {
      try {
        // Find the user
        const [user] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.kiteUserId, kiteUserId))
          .limit(1);

        if (user) {
          // Delete all sessions for this user
          await db
            .delete(sessions)
            .where(eq(sessions.userId, user.id));
          
          console.log(`🗑️  Deleted sessions for user: ${kiteUserId}`);
        }
      } catch (dbError) {
        console.error('Error deleting session from DB:', dbError);
        // Don't fail logout if DB delete fails
      }
    }

    console.log('✅ Logged out successfully from both auth systems')

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