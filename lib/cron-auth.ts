/**
 * Authorise a cron endpoint: the Vercel scheduler sends
 * `Authorization: Bearer $CRON_SECRET` (compared in constant time); manual
 * runs need an admin session. Fails closed when CRON_SECRET is unset.
 */
import { NextRequest } from 'next/server'
import { timingSafeEqual } from 'crypto'

export async function authorizeCron(request: NextRequest): Promise<'scheduler' | 'admin' | null> {
  const secret = process.env.CRON_SECRET
  const header = Buffer.from(request.headers.get('authorization') || '')
  const expected = Buffer.from(secret ? `Bearer ${secret}` : '')
  if (secret && header.length === expected.length && timingSafeEqual(header, expected)) return 'scheduler'

  const { getCurrentUser } = await import('@/lib/multi-user-auth')
  const user = await getCurrentUser()
  return user?.role === 'admin' ? 'admin' : null
}
