/**
 * Health Check Endpoint — GET /api/health
 *
 * Returns HTTP 200 with service status when healthy.
 * Returns HTTP 503 when the database is unreachable.
 *
 * Used by:
 * - Vercel health checks
 * - Uptime monitors
 * - middleware allowlist (no auth required)
 */

import { NextResponse } from 'next/server'
import { db } from '@/db'
import { sql } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET() {
  const start = Date.now()

  // Probe database with a lightweight query
  let dbOk = false
  let dbError: string | undefined

  try {
    await db.execute(sql`SELECT 1`)
    dbOk = true
  } catch (err: any) {
    dbError = err?.message ?? 'unknown'
  }

  const latencyMs = Date.now() - start
  const status = dbOk ? 'ok' : 'degraded'
  const httpStatus = dbOk ? 200 : 503

  return NextResponse.json(
    {
      status,
      ts: new Date().toISOString(),
      latencyMs,
      services: {
        database: dbOk ? 'ok' : 'error',
        ...(dbError ? { dbError } : {}),
      },
      version: process.env.npm_package_version ?? 'unknown',
    },
    { status: httpStatus }
  )
}
