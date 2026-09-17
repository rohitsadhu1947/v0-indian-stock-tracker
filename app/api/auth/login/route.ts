/**
 * POST /api/auth/login
 * 
 * Login with email/password.
 * (Kite users sign in through the Kite OAuth flow: /api/auth/kite/login)
 */

import { NextRequest, NextResponse } from 'next/server'
import { loginWithEmail } from '@/lib/multi-user-auth'
import { loginRateLimit } from '@/lib/rate-limit'
import logger from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const rl = await loginRateLimit(request)
  if (!rl.ok) return rl.response

  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Missing credentials: provide email and password' },
        { status: 400 }
      )
    }

    const result = await loginWithEmail(email, password)
    
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

