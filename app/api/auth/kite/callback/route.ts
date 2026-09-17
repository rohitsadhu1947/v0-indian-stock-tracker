import { NextRequest, NextResponse } from 'next/server';
import { KiteConnect } from 'kiteconnect';
import { cookies } from 'next/headers';
import { db } from '@/db';
import { users, sessions, brokerConnections } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { signSessionToken, getCurrentUser } from '@/lib/multi-user-auth';

const COOKIE_MAX_AGE = 60 * 60 * 24; // 24 hours (unified across all cookies)

type KiteSession = { user_id: string; access_token: string; user_name?: string };

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  };
}

/** Insert or refresh the Kite broker connection for a user. */
async function upsertKiteConnection(userId: number, session: KiteSession, apiKey: string) {
  const [existingConn] = await db
    .select({ id: brokerConnections.id })
    .from(brokerConnections)
    .where(and(eq(brokerConnections.userId, userId), eq(brokerConnections.brokerId, 'kite')))
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
  } else {
    await db.insert(brokerConnections).values({
      userId,
      brokerId: 'kite',
      displayName: 'Zerodha Kite',
      accessToken: session.access_token,
      apiKey,
      brokerUserId: session.user_id,
      isActive: true,
      isPrimary: true,
      lastConnected: new Date(),
      tokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
  }
}

/**
 * Log in an EXISTING, active user whose kite_user_id matches the Kite session.
 * Unknown Kite accounts are rejected: users must be created by an admin first.
 * Returns the user id, or null if the Kite account is not registered/active.
 */
async function loginKnownKiteUser(session: KiteSession, apiKey: string): Promise<number | null> {
  const [user] = await db.select()
    .from(users)
    .where(eq(users.kiteUserId, session.user_id))
    .limit(1);

  if (!user || user.status !== 'active') {
    console.warn(`🚫 Kite login rejected: account ${session.user_id} is not a registered active user`);
    return null;
  }

  await db.update(users)
    .set({
      lastLogin: new Date(),
      masterKiteToken: session.access_token,
      masterKiteUserId: session.user_id,
    })
    .where(eq(users.id, user.id));

  await db.delete(sessions).where(eq(sessions.userId, user.id));
  await db.insert(sessions).values({
    userId: user.id,
    accessToken: session.access_token,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  try {
    await upsertKiteConnection(user.id, session, apiKey);
  } catch (brokerErr) {
    console.error('⚠️  Failed to upsert broker_connections (non-fatal):', brokerErr);
  }

  const cookieStore = await cookies();
  cookieStore.set('auth_user_id', signSessionToken(user.id), cookieOptions());
  cookieStore.set('kite_access_token', session.access_token, cookieOptions());
  cookieStore.set('kite_user_id', session.user_id || '', cookieOptions());

  return user.id;
}

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
    const session = await kc.generateSession(requestToken, apiSecret) as KiteSession;
    console.log(`✅ Kite session generated for user: ${session.user_id}`);

    // ────────────────────────────────────────────
    // USER-INITIATED CONNECTION (Settings → connect Kite): state=user:{id}.
    // `state` is attacker-controllable, so it is only honoured when it matches
    // the user who is actually logged in on this browser.
    // ────────────────────────────────────────────
    if (stateParam?.startsWith('user:')) {
      const targetUserId = parseInt(stateParam.split(':')[1]);
      const currentUser = await getCurrentUser();

      if (!currentUser || currentUser.id !== targetUserId) {
        console.warn(`🚫 Kite connect rejected: state user ${targetUserId} does not match logged-in user ${currentUser?.id ?? 'none'}`);
        return NextResponse.redirect(new URL('/login?error=session_mismatch', request.url));
      }

      await upsertKiteConnection(currentUser.id, session, apiKey);
      console.log(`✅ Stored Kite broker connection for user ${currentUser.id}`);
      return NextResponse.redirect(new URL('/?tab=settings&broker=connected', request.url));
    }

    // ────────────────────────────────────────────
    // LOGIN FLOW: only for Kite accounts already linked to an active user.
    // ────────────────────────────────────────────
    const userId = await loginKnownKiteUser(session, apiKey);
    if (!userId) {
      return NextResponse.redirect(new URL('/login?error=kite_account_not_registered', request.url));
    }

    return NextResponse.redirect(new URL('/admin?tab=brokers', request.url));
  } catch (error: any) {
    console.error('❌ Kite callback FAILED:', error.message || error);
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(error.message || 'authentication_failed')}`, request.url)
    );
  }
}

/**
 * POST /api/auth/kite/callback
 * Manual request_token entry fallback — for when Kite's redirect is broken.
 * Admin-only (used from the admin page). Accepts { request_token }, returns JSON.
 */
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const requestToken = body.request_token;

    if (!requestToken || requestToken.length < 10) {
      return NextResponse.json(
        { error: 'Valid request_token is required (min 10 chars)' },
        { status: 400 }
      );
    }

    const apiKey = process.env.KITE_API_KEY;
    const apiSecret = process.env.KITE_API_SECRET;

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { error: 'KITE_API_KEY or KITE_API_SECRET not configured' },
        { status: 500 }
      );
    }

    const kc = new KiteConnect({ api_key: apiKey });
    const session = await kc.generateSession(requestToken, apiSecret) as KiteSession;
    console.log(`✅ [Manual] Kite session generated for user: ${session.user_id}`);

    const userId = await loginKnownKiteUser(session, apiKey);
    if (!userId) {
      return NextResponse.json(
        { error: `Kite account ${session.user_id} is not linked to an active user` },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      user_id: session.user_id,
      message: 'Kite session created successfully. Reload the page.',
    });
  } catch (error: any) {
    console.error('❌ [Manual] Kite callback FAILED:', error.message || error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate Kite session' },
      { status: 400 }
    );
  }
}
