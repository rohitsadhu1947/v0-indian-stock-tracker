/**
 * Broker Manager
 *
 * Registry of active broker clients. Provides methods to:
 * - Get a specific broker client by ID
 * - Get the primary (default) broker client
 * - Get all connected broker clients
 * - Fallback quote fetching across multiple brokers
 */

import type { BrokerClient, QuoteData } from './types'
import logger from '@/lib/logger'

export class BrokerManager {
  private clients: Map<string, BrokerClient> = new Map()
  private primaryBrokerId: string | null = null

  /**
   * Register a broker client.
   * The first registered client becomes the primary unless overridden.
   */
  register(client: BrokerClient, isPrimary: boolean = false): void {
    this.clients.set(client.brokerId, client)

    if (isPrimary || !this.primaryBrokerId) {
      this.primaryBrokerId = client.brokerId
    }

    logger.info('Broker registered', { brokerId: client.brokerId, displayName: client.displayName, isPrimary })
  }

  /**
   * Get a specific broker client by ID.
   * Falls back to primary if brokerId not found.
   *
   * @throws Error if no brokers are registered
   */
  getClient(brokerId?: string): BrokerClient {
    if (brokerId) {
      const client = this.clients.get(brokerId)
      if (client && client.isConnected()) {
        return client
      }
      logger.warn('Broker not found, falling back to primary', { brokerId })
    }

    // Return primary broker
    if (this.primaryBrokerId) {
      const primary = this.clients.get(this.primaryBrokerId)
      if (primary && primary.isConnected()) {
        return primary
      }
    }

    // Last resort: return any connected broker
    for (const client of this.clients.values()) {
      if (client.isConnected()) {
        return client
      }
    }

    throw new Error('No broker connections available. Admin must connect a broker in settings.')
  }

  /**
   * Get all registered broker clients (connected or not).
   */
  getAllClients(): BrokerClient[] {
    return Array.from(this.clients.values())
  }

  /**
   * Get all connected broker clients.
   */
  getConnectedClients(): BrokerClient[] {
    return Array.from(this.clients.values()).filter((c) => c.isConnected())
  }

  /**
   * Check if any broker is connected.
   */
  hasConnection(): boolean {
    return this.getConnectedClients().length > 0
  }

  /**
   * Fetch quotes from the primary broker, with automatic fallback
   * to other connected brokers if the primary fails.
   */
  async getQuoteFromAny(symbols: string[]): Promise<Record<string, QuoteData>> {
    const errors: Error[] = []

    // Try primary first
    try {
      const primary = this.getClient()
      return await primary.getQuote(symbols)
    } catch (err: any) {
      errors.push(err)
      logger.warn('Primary broker quote failed', { error: err.message })
    }

    // Try all other connected brokers
    for (const client of this.clients.values()) {
      if (client.brokerId === this.primaryBrokerId) continue
      if (!client.isConnected()) continue

      try {
        return await client.getQuote(symbols)
      } catch (err: any) {
        errors.push(err)
        logger.warn('Broker quote failed', { brokerId: client.brokerId, error: err.message })
      }
    }

    // All brokers failed
    throw new Error(
      `All brokers failed to fetch quotes. Errors: ${errors.map((e) => e.message).join('; ')}`
    )
  }

  /**
   * Get the primary broker ID.
   */
  getPrimaryBrokerId(): string | null {
    return this.primaryBrokerId
  }
}
