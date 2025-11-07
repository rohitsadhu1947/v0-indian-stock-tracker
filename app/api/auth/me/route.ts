/**
 * GET /api/auth/me
 * 
 * Get current logged-in user info
 */

import { NextResponse } from 'next/server'
import { getCurrentUser, getUserPermissions } from '@/lib/multi-user-auth'

export async function GET() {
  try {
    const user = await getCurrentUser()
    
    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }
    
    // Get user permissions
    const permissions = await getUserPermissions(user.id)
    
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        kiteUserId: user.kiteUserId,
        lastLogin: user.lastLogin,
      },
      permissions,
    })
  } catch (error: any) {
    console.error('Get user error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    )
  }
}

