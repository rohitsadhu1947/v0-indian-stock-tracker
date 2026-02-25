/**
 * GET /api/admin/brokers - List all broker connections
 * POST /api/admin/brokers - Initiate a new broker connection (returns OAuth URL)
 * DELETE /api/admin/brokers - Disconnect a broker
 *
 * Admin-only routes for managing broker data connections.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { brokerConnections } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { requireRole } from '@/lib/multi-user-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET - List all broker connections for the current admin
 */
export async function GET() {
  try {
    const admin = await requireRole('admin')

    const connections = await db
      .select({
        id: brokerConnections.id,
        brokerId: brokerConnections.brokerId,
        displayName: brokerConnections.displayName,
        brokerUserId: brokerConnections.brokerUserId,
        isActive: brokerConnections.isActive,
        isPrimary: brokerConnections.isPrimary,
        lastConnected: brokerConnections.lastConnected,
        tokenExpiry: brokerConnections.tokenExpiry,
        createdAt: brokerConnections.createdAt,
      })
      .from(brokerConnections)
      .where(eq(brokerConnections.userId, admin.id))

    // Add available brokers that can be connected
    const availableBrokers = [
      {
        brokerId: 'kite',
        displayName: 'Zerodha Kite',
        supportsOAuth: true,
        description: 'Real-time quotes, historical data, instruments via Kite Connect API',
      },
      // Future: { brokerId: 'groww', displayName: 'Groww', supportsOAuth: false, ... }
    ]

    return NextResponse.json({
      success: true,
      connections,
      availableBrokers,
    })
  } catch (error: any) {
    console.error('Error listing broker connections:', error)

    if (error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error.message?.includes('Required role') || error.message?.includes('Access denied')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    return NextResponse.json({ error: 'Failed to list broker connections' }, { status: 500 })
  }
}

/**
 * POST - Initiate a new broker connection
 *
 * For Kite: Returns the OAuth login URL
 * For other brokers: May accept API key/secret directly
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireRole('admin')
    const body = await request.json()
    const { brokerId } = body

    if (!brokerId) {
      return NextResponse.json({ error: 'brokerId is required' }, { status: 400 })
    }

    if (brokerId === 'kite') {
      const apiKey = process.env.KITE_API_KEY
      if (!apiKey) {
        return NextResponse.json(
          { error: 'KITE_API_KEY not configured in environment' },
          { status: 500 }
        )
      }

      // Generate Kite OAuth URL
      const loginUrl = `https://kite.zerodha.com/connect/login?v=3&api_key=${apiKey}`

      return NextResponse.json({
        success: true,
        action: 'redirect',
        url: loginUrl,
        message: 'Redirect to Kite login to complete broker connection',
      })
    }

    return NextResponse.json(
      { error: `Unsupported broker: ${brokerId}` },
      { status: 400 }
    )
  } catch (error: any) {
    console.error('Error initiating broker connection:', error)

    if (error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error.message?.includes('Required role') || error.message?.includes('Access denied')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    return NextResponse.json({ error: 'Failed to initiate broker connection' }, { status: 500 })
  }
}

/**
 * DELETE - Disconnect a broker
 */
export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireRole('admin')
    const body = await request.json()
    const { connectionId } = body

    if (!connectionId) {
      return NextResponse.json({ error: 'connectionId is required' }, { status: 400 })
    }

    // Deactivate (soft delete) the connection
    const [updated] = await db
      .update(brokerConnections)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(brokerConnections.id, connectionId),
          eq(brokerConnections.userId, admin.id)
        )
      )
      .returning({ id: brokerConnections.id })

    if (!updated) {
      return NextResponse.json({ error: 'Broker connection not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      message: 'Broker disconnected',
    })
  } catch (error: any) {
    console.error('Error disconnecting broker:', error)

    if (error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error.message?.includes('Required role') || error.message?.includes('Access denied')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    return NextResponse.json({ error: 'Failed to disconnect broker' }, { status: 500 })
  }
}
