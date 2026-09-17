/**
 * POST /api/auth/login
 * 
 * Login with email/password or Kite user ID
 */

import { NextRequest, NextResponse } from 'next/server'
import { loginWithEmail, loginWithKite } from '@/lib/multi-user-auth'
import { loginRateLimit } from '@/lib/rate-limit'
import logger from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const rl = await loginRateLimit(request)
  if (!rl.ok) return rl.response

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
    logger.error('Login error', { error: error.message })
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    )
  }
}

