/**
 * Sliding-window rate limiter backed by PostgreSQL.
 *
 * Works correctly on Vercel's serverless (no shared memory between invocations).
 *
 * Usage:
 *   import { rateLimit } from '@/lib/rate-limit'
 *
 *   const result = await rateLimit(request, { limit: 10, windowMs: 60_000 })
 *   if (!result.ok) return result.response   // 429 Too Many Requests
 *
 * The identifier is the client IP (x-forwarded-for header → req.ip fallback).
 * Pass `identifier` explicitly to rate-limit per user or per route+user.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { sql } from 'drizzle-orm'
import logger from '@/lib/logger'

export interface RateLimitOptions {
  /** Maximum number of requests allowed in the window */
  limit: number
  /** Window duration in milliseconds (e.g. 60_000 = 1 minute) */
  windowMs: number
  /** Optional explicit identifier. Defaults to client IP. */
  identifier?: string
  /** Human-readable label for the route (used in log messages) */
  label?: string
}

export interface RateLimitResult {
  ok: true
  remaining: number
  reset: Date
}

export interface RateLimitExceeded {
  ok: false
  remaining: 0
  reset: Date
  response: NextResponse
}

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

/**
 * Ensure the rate_limit_buckets table exists.
 * Called once per Lambda cold-start (idempotent).
 */
async function ensureTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS rate_limit_buckets (
      id          BIGSERIAL PRIMARY KEY,
      key         TEXT        NOT NULL,
      window_end  TIMESTAMPTZ NOT NULL,
      count       INT         NOT NULL DEFAULT 1,
      UNIQUE(key, window_end)
    )
  `)
}

let _tableReady = false
async function withTable(fn: () => Promise<RateLimitResult | RateLimitExceeded>) {
  if (!_tableReady) {
    try {
      await ensureTable()
      _tableReady = true
    } catch {
      // Non-fatal — proceed without rate limiting if table creation fails
    }
  }
  return fn()
}

/**
 * Check and increment the rate limit counter for a request.
 * Returns { ok: true, remaining, reset } when under the limit.
 * Returns { ok: false, remaining: 0, reset, response } when over the limit.
 */
export async function rateLimit(
  req: NextRequest,
  opts: RateLimitOptions
): Promise<RateLimitResult | RateLimitExceeded> {
  const { limit, windowMs, label = 'unknown' } = opts
  const id = opts.identifier ?? getIp(req)
  const key = `${label}:${id}`

  return withTable(async () => {
    try {
      // Align window to fixed slots (e.g. every 60s starting from epoch)
      const now = Date.now()
      const windowStart = Math.floor(now / windowMs) * windowMs
      const windowEnd = new Date(windowStart + windowMs)
      const windowEndIso = windowEnd.toISOString()

      // Upsert: insert or increment atomically
      const rows = await db.execute(sql`
        INSERT INTO rate_limit_buckets (key, window_end, count)
        VALUES (${key}, ${windowEndIso}::timestamptz, 1)
        ON CONFLICT (key, window_end) DO UPDATE
          SET count = rate_limit_buckets.count + 1
        RETURNING count
      `)

      const count = ((rows as any).rows?.[0] ?? (rows as any)[0])?.count ?? 1
      const remaining = Math.max(0, limit - count)

      // Clean up expired buckets periodically (1% of requests)
      if (Math.random() < 0.01) {
        db.execute(sql`DELETE FROM rate_limit_buckets WHERE window_end < NOW()`).catch(() => {})
      }

      if (count > limit) {
        logger.warn('Rate limit exceeded', { key, count, limit, label })
        return {
          ok: false as const,
          remaining: 0,
          reset: windowEnd,
          response: NextResponse.json(
            {
              error: 'Too many requests',
              retryAfter: Math.ceil((windowEnd.getTime() - now) / 1000),
            },
            {
              status: 429,
              headers: {
                'X-RateLimit-Limit': String(limit),
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': String(Math.floor(windowEnd.getTime() / 1000)),
                'Retry-After': String(Math.ceil((windowEnd.getTime() - now) / 1000)),
              },
            }
          ),
        }
      }

      return { ok: true as const, remaining, reset: windowEnd }
    } catch (err: any) {
      // If rate-limit DB check fails, allow the request through (fail open)
      logger.error('Rate limit check failed', { key, error: err?.message })
      return { ok: true as const, remaining: limit, reset: new Date(Date.now() + windowMs) }
    }
  })
}

// ─── Preconfigured limiters ───────────────────────────────────────────────────

/** 10 login attempts per 15 minutes per IP */
export const loginRateLimit = (req: NextRequest) =>
  rateLimit(req, { limit: 10, windowMs: 15 * 60_000, label: 'auth:login' })

/** 30 scanner requests per minute per user/IP */
export const scannerRateLimit = (req: NextRequest, userId?: number) =>
  rateLimit(req, {
    limit: 30,
    windowMs: 60_000,
    label: 'scanner',
    identifier: userId ? `user:${userId}` : undefined,
  })
