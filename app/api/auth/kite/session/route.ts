import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/db';
import { users, sessions } from '@/db/schema';
import { eq, and, gt } from 'drizzle-orm';

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

    // PATH 2: No cookie - check database (fallback for refresh/new device)
    console.log('🔍 No cookie found, checking database...');
    
    try {
      // Find any valid session (not expired)
      const now = new Date();
      const validSessions = await db.select({
        accessToken: sessions.accessToken,
        kiteUserId: users.kiteUserId,
        userName: users.name,
        expiresAt: sessions.expiresAt,
      })
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(gt(sessions.expiresAt, now))
        .limit(1);

      if (validSessions.length > 0) {
        const session = validSessions[0];
        console.log(`✅ Valid session found in database for user: ${session.kiteUserId}`);
        
        // Restore cookies
        cookieStore.set('kite_access_token', session.accessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: Math.floor((session.expiresAt.getTime() - now.getTime()) / 1000),
          path: '/',
        });
        
        cookieStore.set('kite_user_id', session.kiteUserId, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: Math.floor((session.expiresAt.getTime() - now.getTime()) / 1000),
          path: '/',
        });

        return NextResponse.json({
          authenticated: true,
          user: {
            userId: session.kiteUserId,
            name: session.userName,
          },
        });
      }
      
      console.log('❌ No valid session found in database');
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

