/**
 * Broker Module - Entry Point
 *
 * Multi-broker aware factory with per-user connection resolution.
 *
 * Usage in API routes:
 *   import { getUserBrokerManager } from '@/lib/broker'
 *   const manager = await getUserBrokerManager()
 *   const client = manager.getClient()
 *   const quotes = await client.getQuote(['NSE:RELIANCE'])
 */

import { cookies } from 'next/headers'
import { db } from '@/db'
import { users, brokerConnections } from '@/db/schema'
import { eq, and, isNotNull, desc } from 'drizzle-orm'
import { BrokerManager } from './manager'
import { KiteBrokerClient } from './kite-client'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'

// Re-export all types and classes
export { BrokerManager } from './manager'
export { KiteBrokerClient } from './kite-client'
export type {
  BrokerClient,
  QuoteData,
  HistoricalParams,
  CandleData,
  InstrumentData,
  BrokerConnectionConfig,
  BrokerDefinition,
} from './types'

/**
 * Create a BrokerClient from a broker connection record.
 * Currently supports 'kite'. Will be extended for Angel One, Upstox, etc.
 */
function createClientFromConnection(
  conn: { brokerId: string; accessToken: string | null; apiKey: string | null; isPrimary: boolean },
  defaultApiKey: string
): { client: KiteBrokerClient; isPrimary: boolean } | null {
  if (conn.brokerId === 'kite' && conn.accessToken) {
    const client = new KiteBrokerClient({
      apiKey: conn.apiKey || defaultApiKey,
      accessToken: conn.accessToken,
    })
    return { client, isPrimary: conn.isPrimary }
  }
  // Future: else if (conn.brokerId === 'angel') { ... }
  // Future: else if (conn.brokerId === 'upstox') { ... }
  return null
}

/**
 * Create and configure a BrokerManager with broker connections for a specific user.
 *
 * Token resolution order:
 * 1. Specified user's broker_connections (if userId provided)
 * 2. Admin's broker_connections (fallback for users without own broker)
 * 3. kite_access_token cookie (legacy Kite OAuth users)
 * 4. users.masterKiteToken for admin's Kite token (legacy email-user bridge)
 *
 * @param userId - Optional user ID to scope broker connections to
 * @returns Configured BrokerManager with available broker clients
 */
export async function getBrokerManager(userId?: number): Promise<BrokerManager> {
  const manager = new BrokerManager()
  const apiKey = process.env.KITE_API_KEY

  if (!apiKey) {
    console.warn('⚠️  KITE_API_KEY not set — Kite broker will not be available')
    return manager
  }

  // ────────────────────────────────────────────
  // METHOD 1: User's own broker_connections
  // ────────────────────────────────────────────
  if (userId) {
    try {
      const userConnections = await db
        .select()
        .from(brokerConnections)
        .where(and(
          eq(brokerConnections.userId, userId),
          eq(brokerConnections.isActive, true)
        ))
        .orderBy(desc(brokerConnections.isPrimary))

      for (const conn of userConnections) {
        const result = createClientFromConnection(conn, apiKey)
        if (result) {
          manager.register(result.client, result.isPrimary)
          console.log(`✅ Loaded ${conn.brokerId} broker for user ${userId}`)
        }
      }

      if (manager.hasConnection()) {
        return manager
      }
    } catch (error: any) {
      if (!error.message?.includes('does not exist') && !error.message?.includes('relation')) {
        console.warn(`⚠️  Error reading broker_connections for user ${userId}:`, error.message)
      }
    }
  }

  // ────────────────────────────────────────────
  // METHOD 2: Admin's broker_connections (fallback)
  // ────────────────────────────────────────────
  try {
    // Find admin users, then get their active broker connections
    const adminUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, 'admin'), eq(users.status, 'active')))
      .limit(5)

    const adminIds = adminUsers.map(u => u.id)

    if (adminIds.length > 0) {
      // Skip if the requesting user IS the admin (already checked in Method 1)
      const adminIdsToCheck = userId ? adminIds.filter(id => id !== userId) : adminIds

      if (adminIdsToCheck.length > 0) {
        const adminConnections = await db
          .select()
          .from(brokerConnections)
          .where(and(
            eq(brokerConnections.isActive, true),
            // drizzle doesn't have `in` as a simple function, use multiple conditions
          ))
          .orderBy(desc(brokerConnections.isPrimary))

        // Filter to admin connections only
        for (const conn of adminConnections) {
          if (!adminIdsToCheck.includes(conn.userId)) continue
          const result = createClientFromConnection(conn, apiKey)
          if (result) {
            manager.register(result.client, result.isPrimary)
            console.log(`✅ Fallback: using admin's ${conn.brokerId} broker (user ${conn.userId})`)
          }
        }

        if (manager.hasConnection()) {
          return manager
        }
      }
    }
  } catch (error: any) {
    if (!error.message?.includes('does not exist') && !error.message?.includes('relation')) {
      console.warn('⚠️  Error reading admin broker_connections:', error.message)
    }
  }

  // ────────────────────────────────────────────
  // METHOD 3: kite_access_token cookie (legacy)
  // ────────────────────────────────────────────
  try {
    const cookieStore = await cookies()
    const kiteToken = cookieStore.get('kite_access_token')?.value

    if (kiteToken) {
      const client = new KiteBrokerClient({ apiKey, accessToken: kiteToken })
      manager.register(client, true)
      console.log('⚠️  Legacy: using Kite token from cookie (user should re-authenticate)')
      return manager
    }
  } catch {
    // cookies() can fail in some contexts — fall through
  }

  // ────────────────────────────────────────────
  // METHOD 4: Admin's masterKiteToken (legacy bridge)
  // ────────────────────────────────────────────
  try {
    const [adminUser] = await db
      .select({
        masterKiteToken: users.masterKiteToken,
        kiteUserId: users.kiteUserId,
        lastLogin: users.lastLogin,
      })
      .from(users)
      .where(and(eq(users.role, 'admin'), isNotNull(users.masterKiteToken)))
      .orderBy(desc(users.lastLogin))
      .limit(1)

    if (adminUser?.masterKiteToken) {
      const client = new KiteBrokerClient({
        apiKey,
        accessToken: adminUser.masterKiteToken,
      })
      manager.register(client, true)
      console.log(
        `⚠️  Legacy: using masterKiteToken from admin (${adminUser.kiteUserId})`
      )
      return manager
    }
  } catch (error: any) {
    console.error('❌ Error reading admin masterKiteToken:', error.message)
  }

  console.log('❌ No broker connections found')
  return manager
}

/**
 * Convenience helper for API routes: resolve broker manager for the current user.
 *
 * Extracts the authenticated user ID from the session cookie,
 * then calls getBrokerManager(userId) with fallback to admin's broker.
 *
 * Usage:
 *   const manager = await getUserBrokerManager()
 *   const client = manager.getClient()
 */
export async function getUserBrokerManager(): Promise<BrokerManager> {
  const userId = await getAuthenticatedUserIdCompat()
  return getBrokerManager(userId ?? undefined)
}

/**
 * Convenience: Get the Kite API key from environment.
 * Used by routes that need the API key directly (e.g., Kite OAuth initiation).
 */
export function getKiteApiKey(): string | null {
  return process.env.KITE_API_KEY || null
}
