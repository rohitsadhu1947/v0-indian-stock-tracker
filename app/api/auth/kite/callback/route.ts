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
    const stateParam = searchParams.get('state'); // "user:{userId}" for user-initiated connections

    console.log(`🔄 Kite callback received — status: ${status}, hasToken: ${!!requestToken}, state: ${stateParam || 'none'}`);

    if (status === 'error' || !requestToken) {
      console.error(`❌ Kite callback failed — status: ${status}, requestToken missing: ${!requestToken}`);
      return NextResponse.redirect(
        new URL('/?error=authentication_failed', request.url)
      );
    }

    const apiKey = process.env.KITE_API_KEY;
    const apiSecret = process.env.KITE_API_SECRET;

    if (!apiKey || !apiSecret) {
      console.error('❌ Kite callback — KITE_API_KEY or KITE_API_SECRET not configured');
      return NextResponse.redirect(
        new URL('/?error=configuration_error', request.url)
      );
    }

    const kc = new KiteConnect({ api_key: apiKey });

    // Generate session using request token
    console.log(`🔑 Generating Kite session with request token...`);
    const session = await kc.generateSession(requestToken, apiSecret);
    console.log(`✅ Kite session generated for user: ${session.user_id}`);

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

    // Hoist userId so it's accessible in the user-initiated connection block below
    let userId: number | undefined;

    try {
      // 1. Check if user exists, create or update
      const existingUsers = await db.select()
        .from(users)
        .where(eq(users.kiteUserId, session.user_id))
        .limit(1);

      
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

    // ────────────────────────────────────────────
    // USER-INITIATED CONNECTION: If state=user:{id}, this was triggered from
    // the user's Settings page (not admin flow). Store token for THAT user
    // and redirect back to settings.
    // ────────────────────────────────────────────
    if (stateParam?.startsWith('user:')) {
      const targetUserId = parseInt(stateParam.split(':')[1])
      if (!isNaN(targetUserId) && targetUserId !== userId) {
        // Store broker connection for the requesting user (not the Kite account owner)
        try {
          const [existingUserConn] = await db
            .select({ id: brokerConnections.id })
            .from(brokerConnections)
            .where(and(
              eq(brokerConnections.userId, targetUserId),
              eq(brokerConnections.brokerId, 'kite')
            ))
            .limit(1)

          if (existingUserConn) {
            await db.update(brokerConnections)
              .set({
                accessToken: session.access_token,
                brokerUserId: session.user_id,
                isActive: true,
                lastConnected: new Date(),
                tokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
                updatedAt: new Date(),
              })
              .where(eq(brokerConnections.id, existingUserConn.id))
          } else {
            await db.insert(brokerConnections).values({
              userId: targetUserId,
              brokerId: 'kite',
              displayName: 'Zerodha Kite',
              accessToken: session.access_token,
              apiKey: apiKey,
              brokerUserId: session.user_id,
              isActive: true,
              isPrimary: true,
              lastConnected: new Date(),
              tokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
            })
          }
          console.log(`✅ Stored Kite broker connection for user ${targetUserId} (via state param)`)
        } catch (stateErr) {
          console.error('⚠️  Failed to store user-initiated broker connection:', stateErr)
        }
      }
      // Redirect user back to settings page
      return NextResponse.redirect(new URL('/?tab=settings&broker=connected', request.url))
    }

    // Default: redirect to admin broker settings (legacy admin flow)
    return NextResponse.redirect(new URL('/admin?tab=brokers', request.url));
  } catch (error: any) {
    console.error('❌ Kite callback FAILED:', error.message || error);
    console.error('❌ Full error:', JSON.stringify({ name: error.name, message: error.message, status: error.status, stack: error.stack?.split('\n')[0] }));
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(error.message || 'authentication_failed')}`, request.url)
    );
  }
}

/**
 * POST /api/auth/kite/callback
 * Manual request_token entry fallback — for when Kite's redirect is broken.
 * Accepts { request_token } in body, generates session, returns JSON (no redirect).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const requestToken = body.request_token

    if (!requestToken || requestToken.length < 10) {
      return NextResponse.json(
        { error: 'Valid request_token is required (min 10 chars)' },
        { status: 400 }
      )
    }

    const apiKey = process.env.KITE_API_KEY
    const apiSecret = process.env.KITE_API_SECRET

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { error: 'KITE_API_KEY or KITE_API_SECRET not configured' },
        { status: 500 }
      )
    }

    const kc = new KiteConnect({ api_key: apiKey })
    console.log(`🔑 [Manual] Generating Kite session with request token...`)
    const session = await kc.generateSession(requestToken, apiSecret)
    console.log(`✅ [Manual] Kite session generated for user: ${session.user_id}`)

    // Set cookies
    const cookieStore = await cookies()
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    }

    cookieStore.set('kite_access_token', session.access_token, cookieOptions)
    cookieStore.set('kite_user_id', session.user_id || '', cookieOptions)

    // Save to DB (same logic as GET handler)
    let userId: number | undefined
    try {
      const existingUsers = await db.select()
        .from(users)
        .where(eq(users.kiteUserId, session.user_id))
        .limit(1)

      if (existingUsers.length > 0) {
        await db.update(users)
          .set({
            lastLogin: new Date(),
            masterKiteToken: session.access_token,
            masterKiteUserId: session.user_id,
          })
          .where(eq(users.kiteUserId, session.user_id))
        userId = existingUsers[0].id
      } else {
        const [newUser] = await db.insert(users).values({
          kiteUserId: session.user_id,
          email: session.user_name ? `${session.user_name}@kite.trade` : `user_${session.user_id}@kite.local`,
          passwordHash: 'kite_auth_only',
          name: session.user_name || null,
          role: 'admin',
          status: 'active',
          masterKiteToken: session.access_token,
          masterKiteUserId: session.user_id,
        }).returning()
        userId = newUser.id
      }

      await db.delete(sessions).where(eq(sessions.userId, userId))
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      await db.insert(sessions).values({ userId, accessToken: session.access_token, expiresAt })

      const sessionToken = signSessionToken(userId)
      cookieStore.set('auth_user_id', sessionToken, cookieOptions)

      // Upsert broker connection
      const [existingConn] = await db
        .select({ id: brokerConnections.id })
        .from(brokerConnections)
        .where(and(eq(brokerConnections.userId, userId), eq(brokerConnections.brokerId, 'kite')))
        .limit(1)

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
          .where(eq(brokerConnections.id, existingConn.id))
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
        })
      }

      console.log(`✅ [Manual] Session + broker connection saved for user ${session.user_id}`)
    } catch (dbError) {
      console.error('❌ [Manual] Database save failed (non-fatal):', dbError)
    }

    return NextResponse.json({
      success: true,
      user_id: session.user_id,
      message: 'Kite session created successfully. Reload the page.',
    })
  } catch (error: any) {
    console.error('❌ [Manual] Kite callback FAILED:', error.message || error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate Kite session' },
      { status: 400 }
    )
  }
}

