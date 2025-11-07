/**
 * POST /api/auth/login
 * 
 * Login with email/password or Kite user ID
 */

import { NextResponse } from 'next/server'
import { loginWithEmail, loginWithKite } from '@/lib/multi-user-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password, kiteUserId } = body
    
    let result
    
    // Legacy Kite login
    if (kiteUserId) {
      result = await loginWithKite(kiteUserId)
    }
    // Email/password login
    else if (email && password) {
      result = await loginWithEmail(email, password)
    } else {
      return NextResponse.json(
        { error: 'Missing credentials: provide either (email + password) or kiteUserId' },
        { status: 400 }
      )
    }
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 401 }
      )
    }
    
    return NextResponse.json({
      success: true,
      user: {
        id: result.user!.id,
        email: result.user!.email,
        name: result.user!.name,
        role: result.user!.role,
      },
      message: 'Login successful',
    })
  } catch (error: any) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    )
  }
}

