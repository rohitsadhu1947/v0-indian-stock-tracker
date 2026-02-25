/**
 * GET /api/alerts - Fetch alerts for the authenticated user
 * PATCH /api/alerts - Mark alerts as read
 *
 * Supports pagination and filtering by type/read status.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { alerts } from '@/db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserIdCompat()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
    const alertType = searchParams.get('type') // 'price', 'entry', 'exit', 'market', 'news'
    const unreadOnly = searchParams.get('unread') === 'true'
    const offset = (page - 1) * limit

    // Build WHERE conditions
    const conditions: any[] = [eq(alerts.userId, userId)]
    if (alertType) {
      conditions.push(eq(alerts.alertType, alertType))
    }
    if (unreadOnly) {
      conditions.push(eq(alerts.isRead, false))
    }

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(alerts)
      .where(and(...conditions))

    // Get unread count (always useful for badges)
    const [{ unreadCount }] = await db
      .select({ unreadCount: sql<number>`count(*)::int` })
      .from(alerts)
      .where(and(eq(alerts.userId, userId), eq(alerts.isRead, false)))

    // Get alerts
    const alertList = await db
      .select()
      .from(alerts)
      .where(and(...conditions))
      .orderBy(desc(alerts.createdAt))
      .limit(limit)
      .offset(offset)

    return NextResponse.json({
      success: true,
      alerts: alertList,
      unreadCount,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    })
  } catch (error: any) {
    console.error('Error fetching alerts:', error)
    return NextResponse.json(
      { error: 'Failed to fetch alerts', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * PATCH - Mark alerts as read
 *
 * Body: { alertIds: number[] } or { markAllRead: true }
 */
export async function PATCH(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserIdCompat()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { alertIds, markAllRead } = body

    if (markAllRead) {
      // Mark all alerts as read for this user
      await db
        .update(alerts)
        .set({ isRead: true })
        .where(and(eq(alerts.userId, userId), eq(alerts.isRead, false)))

      return NextResponse.json({ success: true, message: 'All alerts marked as read' })
    }

    if (alertIds && Array.isArray(alertIds) && alertIds.length > 0) {
      // Mark specific alerts as read (verify ownership)
      for (const alertId of alertIds) {
        await db
          .update(alerts)
          .set({ isRead: true })
          .where(and(eq(alerts.id, alertId), eq(alerts.userId, userId)))
      }

      return NextResponse.json({
        success: true,
        message: `${alertIds.length} alert(s) marked as read`,
      })
    }

    return NextResponse.json({ error: 'Provide alertIds or markAllRead' }, { status: 400 })
  } catch (error: any) {
    console.error('Error marking alerts:', error)
    return NextResponse.json(
      { error: 'Failed to update alerts', details: error.message },
      { status: 500 }
    )
  }
}
