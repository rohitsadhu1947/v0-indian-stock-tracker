/**
 * GET /api/admin/brokers - List all broker connections
 * POST /api/admin/brokers - Initiate a new broker connection (returns OAuth URL)
 * DELETE /api/admin/brokers - Disconnect a broker
 *
 * Admin-only routes for managing broker data connections.
 * Uses the broker registry for available broker definitions.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { brokerConnections } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { requireRole } from '@/lib/multi-user-auth'
import { getAllBrokerDefinitions, getBrokerDefinition } from '@/lib/broker/registry'

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

    // Available brokers from the registry (replaces hardcoded array)
    const availableBrokers = getAllBrokerDefinitions().map(def => ({
      brokerId: def.brokerId,
      displayName: def.displayName,
      supportsOAuth: def.supportsOAuth,
      supportsFormLogin: def.supportsFormLogin ?? false,
      hasApi: def.hasApi ?? true,
      description: def.description || '',
      formFields: def.formFields || [],
    }))

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

    const brokerDef = getBrokerDefinition(brokerId)
    if (!brokerDef) {
      return NextResponse.json(
        { error: `Unknown broker: ${brokerId}. Check /api/admin/brokers GET for available brokers.` },
        { status: 400 }
      )
    }

    // OAuth-based brokers: return redirect URL
    if (brokerDef.supportsOAuth && brokerDef.getOAuthUrl) {
      try {
        const loginUrl = brokerDef.getOAuthUrl()  // admin flow: no state param
        return NextResponse.json({
          success: true,
          action: 'redirect',
          url: loginUrl,
          message: `Redirect to ${brokerDef.displayName} login to complete broker connection`,
        })
      } catch (err: any) {
        return NextResponse.json(
          { error: err.message || `Failed to generate ${brokerDef.displayName} OAuth URL` },
          { status: 500 }
        )
      }
    }

    // Brokers without API
    if (!brokerDef.hasApi) {
      return NextResponse.json(
        { error: `${brokerDef.displayName} does not have a public API. Users selecting this broker will use admin's market data.` },
        { status: 400 }
      )
    }

    // Form-based brokers: credentials are handled in /api/user/brokers POST
    return NextResponse.json(
      { error: `${brokerDef.displayName} uses form-based login. Use /api/user/brokers POST endpoint instead.` },
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
