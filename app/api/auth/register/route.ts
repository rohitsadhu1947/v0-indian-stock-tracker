/**
 * POST /api/auth/register
 * 
 * Register a new user (Admin only)
 * Only admins can create new users
 */

import { NextResponse } from 'next/server'
import { createUser, requireRole } from '@/lib/multi-user-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    // Only admins can register new users
    const admin = await requireRole('admin')
    
    const body = await request.json()
    const { email, password, name, role, kiteUserId } = body
    
    // Validate required fields
    if (!email || !password || !role) {
      return NextResponse.json(
        { error: 'Missing required fields: email, password, role' },
        { status: 400 }
      )
    }
    
    // Create user
    const result = await createUser({
      email,
      password,
      name,
      role,
      kiteUserId,
      createdBy: admin.id,
    })
    
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    
    return NextResponse.json({
      success: true,
      userId: result.userId,
      message: 'User created successfully',
    })
  } catch (error: any) {
    console.error('Registration error:', error)
    
    if (error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    if (error.message.includes('Required role')) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }
    
    return NextResponse.json(
      { error: 'Registration failed' },
      { status: 500 }
    )
  }
}

