import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/db';
import { users, sessions } from '@/db/schema';
import { eq, and, gt } from 'drizzle-orm';
// Note: 'and' was already imported but unused in original; now used for scoped session queries

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('kite_access_token')?.value;
    const kiteUserId = cookieStore.get('kite_user_id')?.value;

    // PATH 1: Cookie exists (fast path)
    if (accessToken && kiteUserId) {
      console.log('✅ Session found in cookies');
      return NextResponse.json({
        authenticated: true,
        user: {
          userId: kiteUserId,
        },
      });
    }

    // PATH 2: No kite cookies - check auth_user_id for scoped DB lookup
    console.log('🔍 No kite cookies found, checking auth_user_id for scoped lookup...');

    try {
      const authUserToken = cookieStore.get('auth_user_id')?.value;
      if (!authUserToken) {
        console.log('❌ No auth_user_id cookie — cannot scope session lookup');
      } else {
        // Import verifySessionToken for signed token support
        const { verifySessionToken } = await import('@/lib/multi-user-auth');
        const scopedUserId = verifySessionToken(authUserToken);

        if (scopedUserId) {
          // Scoped lookup: only find sessions for THIS user
          const now = new Date();
          const validSessions = await db.select({
            accessToken: sessions.accessToken,
            kiteUserId: users.kiteUserId,
            userName: users.name,
            expiresAt: sessions.expiresAt,
          })
            .from(sessions)
            .innerJoin(users, eq(sessions.userId, users.id))
            .where(and(
              eq(sessions.userId, scopedUserId),
              gt(sessions.expiresAt, now)
            ))
            .limit(1);

          if (validSessions.length > 0) {
            const session = validSessions[0];
            console.log(`✅ Scoped session found in database for user ID: ${scopedUserId}`);

            const remainingAge = Math.floor((session.expiresAt.getTime() - now.getTime()) / 1000);
            const cookieOptions = {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax' as const,
              maxAge: remainingAge,
              path: '/',
            };

            // Restore cookies
            cookieStore.set('kite_access_token', session.accessToken, cookieOptions);
            cookieStore.set('kite_user_id', session.kiteUserId || '', cookieOptions);

            return NextResponse.json({
              authenticated: true,
              user: {
                userId: session.kiteUserId,
                name: session.userName,
              },
            });
          }

          console.log('❌ No valid scoped session found in database');
        } else {
          console.log('❌ Invalid auth_user_id token — session lookup skipped');
        }
      }
    } catch (dbError) {
      console.error('❌ Database check failed (non-fatal):', dbError);
    }

    // No valid session found
    return NextResponse.json({
      authenticated: false,
      user: null,
    });
  } catch (error) {
    console.error('Error checking session:', error);
    return NextResponse.json({
      authenticated: false,
      user: null,
    });
  }
}

