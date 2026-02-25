/**
 * GET /api/auth/session
 * 
 * Unified session endpoint that works for BOTH auth systems:
 * - Email/password users (auth_user_id cookie)
 * - Kite Connect users (kite_user_id cookie)
 * 
 * Returns user + role + permissions for ANY authenticated user
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { db } from '@/db'
import { users, userPermissions } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { verifySessionToken } from '@/lib/multi-user-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    
    console.log('🔐 Unified session check started...')
    
    // ========================================
    // METHOD 1: Check new auth system first
    // ========================================
    const authUserToken = cookieStore.get('auth_user_id')?.value

    if (authUserToken) {
      console.log('✅ Found auth_user_id cookie')

      // Verify signed session token (also accepts legacy plain-integer)
      const userId = verifySessionToken(authUserToken)
      if (userId === null) {
        console.log('❌ Invalid or expired session token')
        return NextResponse.json(
          { authenticated: false, error: 'Invalid session' },
          { status: 401 }
        )
      }
      
      // Fetch user + permissions
      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          status: users.status,
          kiteUserId: users.kiteUserId,
          lastLogin: users.lastLogin,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
      
      if (!user || user.status !== 'active') {
        console.log('❌ User not found or not active')
        return NextResponse.json(
          { authenticated: false, error: 'User not found' },
          { status: 401 }
        )
      }
      
      // Get permissions
      const [perms] = await db
        .select()
        .from(userPermissions)
        .where(eq(userPermissions.userId, userId))
        .limit(1)
      
      console.log('✅ New auth system: User', userId, 'Role:', user.role)
      
      return NextResponse.json({
        authenticated: true,
        authMethod: 'email',
        user: {
          id: user.id,
          userId: user.id.toString(), // For backward compatibility
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status,
          kiteUserId: user.kiteUserId,
          lastLogin: user.lastLogin,
        },
        permissions: perms ? {
          canViewSignals: perms.canViewSignals,
          canViewPositions: perms.canViewPositions,
          canPaperTrade: perms.canPaperTrade,
          canViewResearch: perms.canViewResearch,
          canRunBacktests: perms.canRunBacktests,
          canAddCustomStocks: perms.canAddCustomStocks,
          canViewMarketDashboard: perms.canViewMarketDashboard,
          canManageUsers: perms.canManageUsers,
          visibleTabs: perms.visibleTabs as string[],
          subscriptionTier: perms.subscriptionTier,
          maxPaperPositions: perms.maxPaperPositions,
          maxBacktestsPerDay: perms.maxBacktestsPerDay,
          maxCustomStocks: perms.maxCustomStocks,
        } : null,
      })
    }
    
    // ========================================
    // METHOD 2: Check Kite auth (fallback)
    // ========================================
    console.log('⚠️  No auth_user_id, checking Kite auth...')
    
    const kiteUserId = cookieStore.get('kite_user_id')?.value
    const kiteAccessToken = cookieStore.get('kite_access_token')?.value
    
    if (!kiteUserId || !kiteAccessToken) {
      console.log('❌ No Kite cookies found either')
      return NextResponse.json(
        { authenticated: false, error: 'Not authenticated' },
        { status: 401 }
      )
    }
    
    console.log('✅ Found Kite cookies, kite_user_id:', kiteUserId)
    
    // Lookup user by kite_user_id
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        status: users.status,
        kiteUserId: users.kiteUserId,
        lastLogin: users.lastLogin,
      })
      .from(users)
      .where(eq(users.kiteUserId, kiteUserId))
      .limit(1)
    
    if (!user || user.status !== 'active') {
      console.log('❌ Kite user not found in database:', kiteUserId)
      return NextResponse.json(
        { authenticated: false, error: 'Kite user not found' },
        { status: 401 }
      )
    }
    
    // Get permissions
    const [perms] = await db
      .select()
      .from(userPermissions)
      .where(eq(userPermissions.userId, user.id))
      .limit(1)
    
    console.log('✅ Kite auth system: User', user.id, 'Role:', user.role)
    
    return NextResponse.json({
      authenticated: true,
      authMethod: 'kite',
      user: {
        id: user.id,
        userId: user.id.toString(), // For backward compatibility
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        kiteUserId: user.kiteUserId,
        lastLogin: user.lastLogin,
      },
      permissions: perms ? {
        canViewSignals: perms.canViewSignals,
        canViewPositions: perms.canViewPositions,
        canPaperTrade: perms.canPaperTrade,
        canViewResearch: perms.canViewResearch,
        canRunBacktests: perms.canRunBacktests,
        canAddCustomStocks: perms.canAddCustomStocks,
        canViewMarketDashboard: perms.canViewMarketDashboard,
        canManageUsers: perms.canManageUsers,
        visibleTabs: perms.visibleTabs as string[],
        subscriptionTier: perms.subscriptionTier,
        maxPaperPositions: perms.maxPaperPositions,
        maxBacktestsPerDay: perms.maxBacktestsPerDay,
        maxCustomStocks: perms.maxCustomStocks,
      } : null,
    })
    
  } catch (error: any) {
    console.error('❌ Session check error:', error)
    return NextResponse.json(
      { authenticated: false, error: 'Session check failed' },
      { status: 500 }
    )
  }
}

