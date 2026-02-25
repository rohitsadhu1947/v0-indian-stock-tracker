import { NextRequest, NextResponse } from 'next/server';
import { KiteConnect } from 'kiteconnect';
import { cookies } from 'next/headers';
import { db } from '@/db';
import { users, sessions, brokerConnections } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { signSessionToken } from '@/lib/multi-user-auth';

const COOKIE_MAX_AGE = 60 * 60 * 24; // 24 hours (unified across all cookies)

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
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    };

    cookieStore.set('kite_access_token', session.access_token, cookieOptions);
    cookieStore.set('kite_user_id', session.user_id || '', cookieOptions);

    // 🗄️ DATABASE INTEGRATION: Save user and session to database
    console.log('💾 Saving authentication to database...');
    
    try {
      // 1. Check if user exists, create or update
      const existingUsers = await db.select()
        .from(users)
        .where(eq(users.kiteUserId, session.user_id))
        .limit(1);
      
      let userId: number;
      
      if (existingUsers.length > 0) {
        // Update existing user's last login AND master_kite_token
        // ALWAYS update token - this ensures fresh token for all users
        await db.update(users)
          .set({ 
            lastLogin: new Date(),
            masterKiteToken: session.access_token, // 🔑 ALWAYS update to keep fresh
            masterKiteUserId: session.user_id,
          })
          .where(eq(users.kiteUserId, session.user_id));
        userId = existingUsers[0].id;
        console.log(`✅ Updated existing user: ${session.user_id} (ID: ${userId})`);
        console.log(`🔑 Updated master_kite_token with fresh token`);
        console.log(`📢 Email users will now use this new token`);
      } else {
        // Create new user (shouldn't happen if you fixed DB, but just in case)
        const [newUser] = await db.insert(users).values({
          kiteUserId: session.user_id,
          email: session.user_name ? `${session.user_name}@kite.trade` : `user_${session.user_id}@kite.local`,
          passwordHash: 'kite_auth_only', // Required field
          name: session.user_name || null,
          role: 'admin', // Default to admin for Kite users
          status: 'active',
          masterKiteToken: session.access_token,
          masterKiteUserId: session.user_id,
        }).returning();
        userId = newUser.id;
        console.log(`✅ Created new user: ${session.user_id} (ID: ${userId})`);
      }
      
      // 2. Delete old sessions for this user (keep only latest)
      await db.delete(sessions).where(eq(sessions.userId, userId));
      
      // 3. Create new session record
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      await db.insert(sessions).values({
        userId,
        accessToken: session.access_token,
        expiresAt,
      });
      
      // 🌉 BRIDGE: Set BOTH cookie systems (KEY FIX!)
      // This makes Kite login work with new auth system
      const sessionToken = signSessionToken(userId);
      cookieStore.set('auth_user_id', sessionToken, cookieOptions);
      
      console.log('✅ Session saved to database successfully!');
      console.log('🌉 BRIDGED: Set auth_user_id cookie for unified auth system');

      // 4. Upsert broker_connections for multi-broker support
      try {
        const [existingConn] = await db
          .select({ id: brokerConnections.id })
          .from(brokerConnections)
          .where(
            and(
              eq(brokerConnections.userId, userId),
              eq(brokerConnections.brokerId, 'kite')
            )
          )
          .limit(1);

        if (existingConn) {
          await db.update(brokerConnections)
            .set({
              accessToken: session.access_token,
              brokerUserId: session.user_id,
              isActive: true,
              lastConnected: new Date(),
              tokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
              updatedAt: new Date(),
            })
            .where(eq(brokerConnections.id, existingConn.id));
          console.log('✅ Updated existing Kite broker connection');
        } else {
          await db.insert(brokerConnections).values({
            userId,
            brokerId: 'kite',
            displayName: 'Zerodha Kite',
            accessToken: session.access_token,
            apiKey: apiKey,
            brokerUserId: session.user_id,
            isActive: true,
            isPrimary: true,
            lastConnected: new Date(),
            tokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
          });
          console.log('✅ Created new Kite broker connection');
        }
      } catch (brokerErr) {
        console.error('⚠️  Failed to upsert broker_connections (non-fatal):', brokerErr);
      }
    } catch (dbError) {
      console.error('❌ Database save failed (non-fatal):', dbError);
      // Don't block login if DB save fails - user can still use the app via cookies
    }

    // Redirect to admin broker settings (broker connection flow) or home page
    return NextResponse.redirect(new URL('/admin?tab=brokers', request.url));
  } catch (error: any) {
    console.error('Error in authentication callback:', error);
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(error.message || 'authentication_failed')}`, request.url)
    );
  }
}

