/**
 * POST /api/auth/logout
 * 
 * Logout and destroy session (clears BOTH auth systems)
 */

import { NextResponse } from 'next/server'
import { destroySession } from '@/lib/multi-user-auth'
import { cookies } from 'next/headers'

export async function POST() {
  try {
    // Destroy new auth session
    await destroySession()
    
    // Also clear Kite cookies if present (for users who logged in via Kite)
    const cookieStore = await cookies()
    cookieStore.delete('kite_access_token')
    cookieStore.delete('kite_user_id')
    
    console.log('✅ Logged out successfully from both auth systems')
    
    return NextResponse.json({
      success: true,
      message: 'Logged out successfully',
    })
  } catch (error: any) {
    console.error('Logout error:', error)
    return NextResponse.json(
      { error: 'Logout failed' },
      { status: 500 }
    )
  }
}

