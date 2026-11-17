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
import { eq, and, isNotNull, desc, inArray } from 'drizzle-orm'
import { BrokerManager } from './manager'
import { KiteBrokerClient } from './kite-client'
import { AngelBrokerClient } from './angel-client'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'
import { getBrokerDefinition } from './registry'
import { isBrokerTokenUsable } from './token-expiry'
import logger from '@/lib/logger'

// Re-export all types and classes
export { BrokerManager } from './manager'
export { KiteBrokerClient } from './kite-client'
export { AngelBrokerClient } from './angel-client'
export type {
  BrokerClient,
  QuoteData,
  HistoricalParams,
  CandleData,
  InstrumentData,
  BrokerConnectionConfig,
  BrokerDefinition,
  BrokerHolding,
} from './types'

/**
 * Create a BrokerClient from a broker connection record.
 * Uses the broker registry's createClient factory when available,
 * with hardcoded fallback for Kite (most common).
 */
function createClientFromConnection(
  conn: {
    brokerId: string
    accessToken: string | null
    apiKey: string | null
    isPrimary: boolean
    brokerUserId?: string | null
    metadata?: Record<string, any> | null
  },
  defaultApiKey: string
): { client: KiteBrokerClient | AngelBrokerClient; isPrimary: boolean } | null {
  if (!conn.accessToken) return null

  // Try Kite first (fast path — most common)
  if (conn.brokerId === 'kite') {
    const client = new KiteBrokerClient({
      apiKey: conn.apiKey || defaultApiKey,
      accessToken: conn.accessToken,
    })
    return { client, isPrimary: conn.isPrimary }
  }

  // Try Angel One
  if (conn.brokerId === 'angel') {
    const metadata = (conn.metadata || {}) as Record<string, any>
    const client = new AngelBrokerClient({
      apiKey: conn.apiKey || metadata.apiKey || '',
      accessToken: conn.accessToken,
      refreshToken: metadata.refreshToken,
      feedToken: metadata.feedToken,
      clientCode: conn.brokerUserId || metadata.clientCode,
    })
    return { client, isPrimary: conn.isPrimary }
  }

  // Fallback: try the broker registry's createClient
  try {
    const brokerDef = getBrokerDefinition(conn.brokerId)
    if (brokerDef) {
      const client = brokerDef.createClient({
        id: 0,
        userId: 0,
        brokerId: conn.brokerId,
        displayName: null,
        accessToken: conn.accessToken,
        apiKey: conn.apiKey,
        apiSecret: null,
        brokerUserId: conn.brokerUserId || null,
        isActive: true,
        isPrimary: conn.isPrimary,
        lastConnected: null,
        tokenExpiry: null,
        metadata: conn.metadata || null,
      })
      return { client: client as any, isPrimary: conn.isPrimary }
    }
  } catch (err: any) {
    logger.warn('Could not create broker client', { brokerId: conn.brokerId, error: err.message })
  }

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
 * Expired tokens (past tokenExpiry, or Kite tokens issued before the daily
 * 06:00 IST flush) are skipped so resolution falls through to a working one.
 *
 * @param userId - Optional user ID to scope broker connections to
 * @returns Configured BrokerManager with available broker clients
 */
export async function getBrokerManager(userId?: number): Promise<BrokerManager> {
  const manager = new BrokerManager()
  const apiKey = process.env.KITE_API_KEY

  if (!apiKey) {
    logger.warn('KITE_API_KEY not set — Kite broker unavailable')
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
        if (!isBrokerTokenUsable(conn)) {
          logger.info('Skipping expired broker token', { brokerId: conn.brokerId, userId })
          continue
        }
        const result = createClientFromConnection(conn as any, apiKey)
        if (result) {
          manager.register(result.client, result.isPrimary)
          logger.info('Loaded broker', { brokerId: conn.brokerId, userId })
        }
      }

      if (manager.hasConnection()) {
        return manager
      }
    } catch (error: any) {
      if (!error.message?.includes('does not exist') && !error.message?.includes('relation')) {
        logger.warn('Error reading broker_connections', { userId, error: error.message })
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
            inArray(brokerConnections.userId, adminIdsToCheck)
          ))
          .orderBy(desc(brokerConnections.isPrimary))

        for (const conn of adminConnections) {
          if (!isBrokerTokenUsable(conn)) continue
          const result = createClientFromConnection(conn as any, apiKey)
          if (result) {
            manager.register(result.client, result.isPrimary)
            logger.info('Fallback: using admin broker', { brokerId: conn.brokerId, adminUserId: conn.userId })
          }
        }

        if (manager.hasConnection()) {
          return manager
        }
      }
    }
  } catch (error: any) {
    if (!error.message?.includes('does not exist') && !error.message?.includes('relation')) {
      logger.warn('Error reading admin broker_connections', { error: error.message })
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
      logger.warn('Legacy: using Kite token from cookie (user should re-authenticate)')
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

    // masterKiteToken is refreshed on every Kite login, alongside lastLogin
    if (
      adminUser?.masterKiteToken &&
      isBrokerTokenUsable({ brokerId: 'kite', lastConnected: adminUser.lastLogin })
    ) {
      const client = new KiteBrokerClient({
        apiKey,
        accessToken: adminUser.masterKiteToken,
      })
      manager.register(client, true)
      logger.warn('Legacy: using masterKiteToken from admin', { kiteUserId: adminUser.kiteUserId })
      return manager
    }
  } catch (error: any) {
    logger.error('Error reading admin masterKiteToken', { error: error.message })
  }

  logger.warn('No broker connections found')
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
