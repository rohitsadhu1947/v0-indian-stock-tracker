import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_API_ROUTES = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/logout',
  '/api/auth/session',
  '/api/auth/me',
  '/api/auth/kite/login',
  '/api/auth/kite/callback',
  '/api/auth/kite/session',
  '/api/auth/kite/logout',
  '/api/health',
])

// Cron routes authorise themselves (CRON_SECRET bearer or an admin session,
// failing closed). The scheduler sends no session cookie, so gating them here
// rejected every scheduled run.
const SELF_AUTHORISED_PREFIX = '/api/cron/'

const PUBLIC_PAGES = new Set(['/login'])

const SESSION_MAX_AGE = 60 * 60 * 24 // 24 hours

// Cache the CryptoKey so we don't re-import on every request
let _cachedKey: CryptoKey | null = null
async function getHmacKey(): Promise<CryptoKey | null> {
  const secret = process.env.SESSION_SECRET
  if (!secret) return null
  if (_cachedKey) return _cachedKey
  const enc = new TextEncoder()
  _cachedKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return _cachedKey
}

function hexEncode(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function verifyTokenInMiddleware(token: string): Promise<boolean> {
  // Reject legacy plain-integer tokens
  if (/^\d+$/.test(token)) return false

  const parts = token.split(':')
  if (parts.length !== 3) return false

  const [userIdStr, timestampStr, providedHmac] = parts
  const userId = parseInt(userIdStr)
  const timestamp = parseInt(timestampStr)
  if (isNaN(userId) || isNaN(timestamp)) return false

  // Check expiry
  const ageMs = Date.now() - timestamp
  if (ageMs > SESSION_MAX_AGE * 1000) return false

  // Verify HMAC using Web Crypto API (Edge-compatible)
  const key = await getHmacKey()
  if (!key) return false

  const enc = new TextEncoder()
  const payload = `${userId}:${timestamp}`
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  const expectedHmac = hexEncode(sig)

  // Constant-time comparison
  if (expectedHmac.length !== providedHmac.length) return false
  let mismatch = 0
  for (let i = 0; i < expectedHmac.length; i++) {
    mismatch |= expectedHmac.charCodeAt(i) ^ providedHmac.charCodeAt(i)
  }
  return mismatch === 0
}

function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains'
  )
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.telegram.org https://*.neon.tech;"
  )
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  return response
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // API routes
  if (pathname.startsWith('/api/')) {
    if (PUBLIC_API_ROUTES.has(pathname) || pathname.startsWith(SELF_AUTHORISED_PREFIX)) {
      return addSecurityHeaders(NextResponse.next())
    }

    // Check auth for all other API routes
    const token =
      request.cookies.get('auth_user_id')?.value ||
      request.cookies.get('auth_session')?.value

    if (!token || !(await verifyTokenInMiddleware(token))) {
      return addSecurityHeaders(
        NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        )
      )
    }

    return addSecurityHeaders(NextResponse.next())
  }

  // Page routes: redirect to login if not authenticated
  if (!PUBLIC_PAGES.has(pathname) && !pathname.startsWith('/_next') && !pathname.startsWith('/favicon')) {
    const token =
      request.cookies.get('auth_user_id')?.value ||
      request.cookies.get('auth_session')?.value

    if (!token || !(await verifyTokenInMiddleware(token))) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('from', pathname)
      return addSecurityHeaders(NextResponse.redirect(loginUrl))
    }
  }

  return addSecurityHeaders(NextResponse.next())
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
