/**
 * User Broker Management API
 *
 * GET  /api/user/brokers — List current user's connections + all available brokers
 * POST /api/user/brokers — Initiate broker connection (OAuth redirect or form credentials)
 * DELETE /api/user/brokers — Disconnect a broker
 *
 * Any authenticated user can manage their own broker connections.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { brokerConnections } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/multi-user-auth'
import { getAllBrokerDefinitions, getBrokerDefinition } from '@/lib/broker/registry'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET — List current user's broker connections + available brokers
 */
export async function GET() {
  try {
    const user = await requireAuth()

    // Fetch user's existing connections
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
      .where(eq(brokerConnections.userId, user.id))

    // Build available brokers list from registry
    const allBrokers = getAllBrokerDefinitions()
    const availableBrokers = allBrokers.map(def => ({
      brokerId: def.brokerId,
      displayName: def.displayName,
      description: def.description || '',
      supportsOAuth: def.supportsOAuth,
      supportsFormLogin: def.supportsFormLogin,
      hasApi: def.hasApi,
      formFields: def.formFields || [],
      // Is this broker already connected by this user?
      connected: connections.some(c => c.brokerId === def.brokerId && c.isActive),
    }))

    return NextResponse.json({
      success: true,
      connections,
      availableBrokers,
    })
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Error listing user broker connections:', error)
    return NextResponse.json({ error: 'Failed to list broker connections' }, { status: 500 })
  }
}

/**
 * POST — Initiate a broker connection
 *
 * For OAuth brokers (Kite, Upstox): Returns redirect URL with state=user:{userId}
 * For form-based brokers (Angel One): Accepts credentials, generates session
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await request.json()
    const { brokerId } = body

    if (!brokerId) {
      return NextResponse.json({ error: 'brokerId is required' }, { status: 400 })
    }

    const brokerDef = getBrokerDefinition(brokerId)
    if (!brokerDef) {
      return NextResponse.json({ error: `Unknown broker: ${brokerId}` }, { status: 400 })
    }

    // Brokers without API — just record user's preference
    if (!brokerDef.hasApi) {
      // Upsert a "preference" connection (no actual token)
      const [existing] = await db
        .select({ id: brokerConnections.id })
        .from(brokerConnections)
        .where(and(
          eq(brokerConnections.userId, user.id),
          eq(brokerConnections.brokerId, brokerId)
        ))
        .limit(1)

      if (existing) {
        await db.update(brokerConnections)
          .set({ isActive: true, updatedAt: new Date() })
          .where(eq(brokerConnections.id, existing.id))
      } else {
        await db.insert(brokerConnections).values({
          userId: user.id,
          brokerId,
          displayName: brokerDef.displayName,
          isActive: true,
          isPrimary: false,
          metadata: { noApi: true, preference: true },
        })
      }

      return NextResponse.json({
        success: true,
        action: 'connected',
        message: `${brokerDef.displayName} set as your broker. Market data uses admin's broker.`,
      })
    }

    // OAuth brokers — return redirect URL
    if (brokerDef.supportsOAuth) {
      if (!brokerDef.getOAuthUrl) {
        return NextResponse.json({ error: `${brokerId} OAuth not configured` }, { status: 500 })
      }

      try {
        const state = `user:${user.id}`
        const loginUrl = brokerDef.getOAuthUrl(state)

        return NextResponse.json({
          success: true,
          action: 'redirect',
          url: loginUrl,
          message: `Redirect to ${brokerDef.displayName} login to connect your account`,
        })
      } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
      }
    }

    // Form-based brokers — accept credentials
    if (brokerDef.supportsFormLogin) {
      // Validate required fields
      const missingFields = (brokerDef.formFields || [])
        .filter(f => f.required && !body[f.key])
        .map(f => f.label)

      if (missingFields.length > 0) {
        return NextResponse.json({
          error: `Missing required fields: ${missingFields.join(', ')}`,
        }, { status: 400 })
      }

      // For now, return not-implemented for brokers without client (Angel, ICICI)
      // Phase 3 will add actual session generation
      return NextResponse.json({
        error: `${brokerDef.displayName} integration is coming soon. Currently supported: Zerodha Kite.`,
      }, { status: 501 })
    }

    return NextResponse.json({ error: `Unsupported broker: ${brokerId}` }, { status: 400 })
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Error initiating broker connection:', error)
    return NextResponse.json({ error: 'Failed to initiate broker connection' }, { status: 500 })
  }
}

/**
 * DELETE — Disconnect a broker connection
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await request.json()
    const { connectionId } = body

    if (!connectionId) {
      return NextResponse.json({ error: 'connectionId is required' }, { status: 400 })
    }

    // Soft-delete: deactivate the connection (scoped to current user)
    const [updated] = await db
      .update(brokerConnections)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(
        eq(brokerConnections.id, connectionId),
        eq(brokerConnections.userId, user.id)
      ))
      .returning({ id: brokerConnections.id })

    if (!updated) {
      return NextResponse.json({ error: 'Broker connection not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      message: 'Broker disconnected',
    })
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Error disconnecting broker:', error)
    return NextResponse.json({ error: 'Failed to disconnect broker' }, { status: 500 })
  }
}
