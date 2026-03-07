/**
 * Broker Registry
 *
 * Central registry of all supported broker definitions.
 * Each broker registers itself with its auth flow, client factory, and symbol adapter.
 *
 * Usage:
 *   import { getAllBrokerDefinitions, getBrokerDefinition } from '@/lib/broker/registry'
 *   const brokers = getAllBrokerDefinitions()
 *   const kiteDef = getBrokerDefinition('kite')
 */

import type { BrokerDefinition, BrokerConnectionConfig } from './types'
import { KiteBrokerClient } from './kite-client'
import { KiteSymbolAdapter, PassthroughSymbolAdapter } from './symbol-map'

// ============================================================================
// REGISTRY
// ============================================================================

const BROKER_REGISTRY: Map<string, BrokerDefinition> = new Map()

export function registerBroker(def: BrokerDefinition): void {
  BROKER_REGISTRY.set(def.brokerId, def)
}

export function getBrokerDefinition(brokerId: string): BrokerDefinition | undefined {
  return BROKER_REGISTRY.get(brokerId)
}

export function getAllBrokerDefinitions(): BrokerDefinition[] {
  return Array.from(BROKER_REGISTRY.values())
}

// ============================================================================
// BUILT-IN BROKER REGISTRATIONS
// ============================================================================

// --- Zerodha Kite ---
registerBroker({
  brokerId: 'kite',
  displayName: 'Zerodha Kite',
  description: 'Real-time quotes, historical data, instruments via Kite Connect API',
  supportsOAuth: true,
  supportsFormLogin: false,
  hasApi: true,
  getOAuthUrl: (state?: string) => {
    const apiKey = process.env.KITE_API_KEY
    if (!apiKey) throw new Error('KITE_API_KEY not configured')
    const base = `https://kite.zerodha.com/connect/login?v=3&api_key=${apiKey}`
    return state ? `${base}&state=${encodeURIComponent(state)}` : base
  },
  createClient: (config: BrokerConnectionConfig) => {
    const apiKey = config.apiKey || process.env.KITE_API_KEY
    if (!apiKey || !config.accessToken) {
      throw new Error('Kite requires apiKey and accessToken')
    }
    return new KiteBrokerClient({ apiKey, accessToken: config.accessToken })
  },
  symbolAdapter: new KiteSymbolAdapter(),
})

// --- Angel One (SmartAPI) — Phase 3, client not yet implemented ---
registerBroker({
  brokerId: 'angel',
  displayName: 'Angel One',
  description: 'Free API with real-time data via SmartAPI. Requires daily TOTP reconnection.',
  supportsOAuth: false,
  supportsFormLogin: true,
  hasApi: true,
  formFields: [
    { key: 'apiKey', label: 'API Key', type: 'text', placeholder: 'Your SmartAPI key', required: true, persist: true },
    { key: 'clientCode', label: 'Client Code', type: 'text', placeholder: 'e.g., A12345', required: true, persist: true },
    { key: 'password', label: 'Password', type: 'password', placeholder: 'Trading password', required: true, persist: false },
    { key: 'totp', label: 'TOTP', type: 'number', placeholder: '6-digit code', required: true, persist: false },
  ],
  createClient: (_config: BrokerConnectionConfig) => {
    throw new Error('Angel One client not yet implemented. Coming in Phase 3.')
  },
  symbolAdapter: new PassthroughSymbolAdapter(), // Will be replaced with AngelSymbolAdapter
})

// --- Upstox — Phase 4, client not yet implemented ---
registerBroker({
  brokerId: 'upstox',
  displayName: 'Upstox',
  description: 'Free API with OAuth login. Similar to Zerodha.',
  supportsOAuth: true,
  supportsFormLogin: false,
  hasApi: true,
  getOAuthUrl: (state?: string) => {
    const apiKey = process.env.UPSTOX_API_KEY
    if (!apiKey) throw new Error('UPSTOX_API_KEY not configured')
    const redirectUri = encodeURIComponent(`${process.env.NEXT_PUBLIC_APP_URL}/api/auth/upstox/callback`)
    const base = `https://api.upstox.com/v2/login/authorization/dialog?client_id=${apiKey}&redirect_uri=${redirectUri}&response_type=code`
    return state ? `${base}&state=${encodeURIComponent(state)}` : base
  },
  createClient: (_config: BrokerConnectionConfig) => {
    throw new Error('Upstox client not yet implemented. Coming in Phase 4.')
  },
  symbolAdapter: new PassthroughSymbolAdapter(), // Will be replaced with UpstoxSymbolAdapter
})

// --- 5Paisa — future ---
registerBroker({
  brokerId: '5paisa',
  displayName: '5Paisa',
  description: 'Trading and market data API with OAuth.',
  supportsOAuth: true,
  supportsFormLogin: false,
  hasApi: true,
  createClient: (_config: BrokerConnectionConfig) => {
    throw new Error('5Paisa client not yet implemented.')
  },
  symbolAdapter: new PassthroughSymbolAdapter(),
})

// --- ICICI Direct (Breeze) — future ---
registerBroker({
  brokerId: 'icici',
  displayName: 'ICICI Direct',
  description: 'Breeze API with session-based auth.',
  supportsOAuth: false,
  supportsFormLogin: true,
  hasApi: true,
  formFields: [
    { key: 'apiKey', label: 'API Key', type: 'text', placeholder: 'Breeze API key', required: true, persist: true },
    { key: 'sessionToken', label: 'Session Token', type: 'text', placeholder: 'From ICICI login', required: true, persist: false },
  ],
  createClient: (_config: BrokerConnectionConfig) => {
    throw new Error('ICICI Direct client not yet implemented.')
  },
  symbolAdapter: new PassthroughSymbolAdapter(),
})

// --- Brokers without API (show in UI, fall back to admin's data) ---

registerBroker({
  brokerId: 'groww',
  displayName: 'Groww',
  description: 'No public API available. Market data provided by admin\'s broker.',
  supportsOAuth: false,
  supportsFormLogin: false,
  hasApi: false,
  createClient: (_config: BrokerConnectionConfig) => {
    throw new Error('Groww has no public API. Market data uses admin\'s broker.')
  },
  symbolAdapter: new PassthroughSymbolAdapter(),
})

registerBroker({
  brokerId: 'hdfc',
  displayName: 'HDFC Securities',
  description: 'No public API available. Market data provided by admin\'s broker.',
  supportsOAuth: false,
  supportsFormLogin: false,
  hasApi: false,
  createClient: (_config: BrokerConnectionConfig) => {
    throw new Error('HDFC Securities has no public API. Market data uses admin\'s broker.')
  },
  symbolAdapter: new PassthroughSymbolAdapter(),
})

registerBroker({
  brokerId: 'motilal',
  displayName: 'Motilal Oswal',
  description: 'Limited API with poor documentation. Market data provided by admin\'s broker.',
  supportsOAuth: false,
  supportsFormLogin: false,
  hasApi: false,
  createClient: (_config: BrokerConnectionConfig) => {
    throw new Error('Motilal Oswal API not yet supported. Market data uses admin\'s broker.')
  },
  symbolAdapter: new PassthroughSymbolAdapter(),
})
