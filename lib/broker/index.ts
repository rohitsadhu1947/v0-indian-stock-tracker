/**
 * Broker Module - Entry Point
 *
 * Replaces the old kite-token-helper.ts with a multi-broker aware factory.
 *
 * Usage in API routes:
 *   import { getBrokerManager } from '@/lib/broker'
 *   const manager = await getBrokerManager()
 *   const client = manager.getClient()
 *   const quotes = await client.getQuote(['NSE:RELIANCE'])
 */

import { cookies } from 'next/headers'
import { db } from '@/db'
import { users, brokerConnections } from '@/db/schema'
import { eq, and, isNotNull, desc } from 'drizzle-orm'
import { BrokerManager } from './manager'
import { KiteBrokerClient } from './kite-client'

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
 * Create and configure a BrokerManager with all available broker connections.
 *
 * Token resolution order:
 * 1. Check `broker_connections` table for active connections (preferred, multi-broker)
 * 2. Check `kite_access_token` cookie (legacy Kite OAuth users)
 * 3. Check `users.masterKiteToken` for admin's Kite token (legacy email-user bridge)
 *
 * @returns Configured BrokerManager with all available broker clients
 */
export async function getBrokerManager(): Promise<BrokerManager> {
  const manager = new BrokerManager()
  const apiKey = process.env.KITE_API_KEY

  if (!apiKey) {
    console.warn('⚠️  KITE_API_KEY not set — Kite broker will not be available')
    return manager
  }

  // ────────────────────────────────────────────
  // METHOD 1: broker_connections table (new system)
  // ────────────────────────────────────────────
  try {
    const connections = await db
      .select()
      .from(brokerConnections)
      .where(eq(brokerConnections.isActive, true))
      .orderBy(desc(brokerConnections.isPrimary))

    for (const conn of connections) {
      if (conn.brokerId === 'kite' && conn.accessToken) {
        const client = new KiteBrokerClient({
          apiKey: conn.apiKey || apiKey,
          accessToken: conn.accessToken,
        })
        manager.register(client, conn.isPrimary)
        console.log(`✅ Loaded Kite broker from broker_connections (user ${conn.userId})`)
      }
      // Future: else if (conn.brokerId === 'groww') { ... }
    }

    if (manager.hasConnection()) {
      return manager
    }
  } catch (error: any) {
    // Table might not exist yet during migration — fall through to legacy
    if (!error.message?.includes('does not exist') && !error.message?.includes('relation')) {
      console.warn('⚠️  Error reading broker_connections:', error.message)
    }
  }

  // ────────────────────────────────────────────
  // METHOD 2: kite_access_token cookie (legacy)
  // ────────────────────────────────────────────
  try {
    const cookieStore = await cookies()
    const kiteToken = cookieStore.get('kite_access_token')?.value

    if (kiteToken) {
      const client = new KiteBrokerClient({ apiKey, accessToken: kiteToken })
      manager.register(client, true)
      console.log('✅ Using Kite token from cookie (legacy Kite OAuth user)')
      return manager
    }
  } catch {
    // cookies() can fail in some contexts — fall through
  }

  // ────────────────────────────────────────────
  // METHOD 3: Admin's masterKiteToken (legacy bridge)
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
        `✅ Using master Kite token from admin user (${adminUser.kiteUserId}, last login: ${adminUser.lastLogin})`
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
 * Convenience: Get the Kite API key from environment.
 * Used by routes that need the API key directly (e.g., Kite OAuth initiation).
 */
export function getKiteApiKey(): string | null {
  return process.env.KITE_API_KEY || null
}
