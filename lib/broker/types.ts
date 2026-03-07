/**
 * Broker Abstraction Layer - Type Definitions
 *
 * Unified interfaces for multi-broker market data access.
 * All broker implementations (Kite, Groww, etc.) must conform to these types.
 */

// ============================================================================
// CORE BROKER CLIENT INTERFACE
// ============================================================================

export interface BrokerClient {
  /** Unique broker identifier (e.g., 'kite', 'groww') */
  readonly brokerId: string

  /** Human-readable broker name (e.g., 'Zerodha Kite') */
  readonly displayName: string

  /**
   * Get real-time quotes for one or more symbols.
   * Symbols should be in "EXCHANGE:SYMBOL" format (e.g., "NSE:RELIANCE").
   *
   * @returns Map of symbol → QuoteData
   */
  getQuote(symbols: string[]): Promise<Record<string, QuoteData>>

  /**
   * Get historical OHLCV candle data for an instrument.
   *
   * @returns Array of candles, oldest first
   */
  getHistoricalData(params: HistoricalParams): Promise<CandleData[]>

  /**
   * Get instrument master list for an exchange.
   * Used for token lookups and search.
   *
   * @param exchange - Exchange code (e.g., 'NSE', 'BSE', 'NFO')
   * @returns Full instrument list
   */
  getInstruments(exchange?: string): Promise<InstrumentData[]>

  /**
   * Check if the broker client has a valid, non-expired connection.
   */
  isConnected(): boolean
}

// ============================================================================
// QUOTE DATA
// ============================================================================

export interface QuoteData {
  /** Last traded price */
  lastPrice: number

  /** OHLC for the day */
  open: number
  high: number
  low: number
  close: number // Previous day's close

  /** Volume traded today */
  volume: number

  /** Price change from previous close */
  change: number
  changePercent: number

  /** When this quote was fetched */
  timestamp: Date

  /**
   * Raw broker-specific data, preserved for routes that need it.
   * This is the full response object from the broker SDK.
   */
  raw?: Record<string, any>
}

// ============================================================================
// HISTORICAL / CANDLE DATA
// ============================================================================

export interface HistoricalParams {
  /** Instrument token or identifier (broker-specific) */
  instrumentToken: number | string

  /** Exchange code (e.g., 'NSE') */
  exchange: string

  /** Trading symbol (e.g., 'RELIANCE') */
  symbol: string

  /**
   * Candle interval.
   * Common values: 'minute', '5minute', '15minute', '30minute', '60minute', 'day', 'week', 'month'
   */
  interval: string

  /** Start of date range */
  from: Date

  /** End of date range */
  to: Date
}

export interface CandleData {
  /** Candle timestamp */
  date: Date

  /** OHLCV values */
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// ============================================================================
// INSTRUMENT DATA
// ============================================================================

export interface InstrumentData {
  /** Broker-specific instrument identifier (used for historical data) */
  instrumentToken: number | string

  /** Trading symbol (e.g., 'RELIANCE') */
  tradingsymbol: string

  /** Full instrument name (e.g., 'Reliance Industries Limited') */
  name: string

  /** Exchange code (e.g., 'NSE', 'BSE') */
  exchange: string

  /** Market segment (e.g., 'NSE', 'NFO-FUT', 'NFO-OPT') */
  segment: string

  /** Lot size (1 for cash, >1 for F&O) */
  lotSize: number

  /** Instrument type (e.g., 'EQ', 'FUT', 'CE', 'PE') */
  instrumentType?: string

  /** ISIN code for cross-broker symbol mapping (e.g., 'INE002A01018') */
  isin?: string

  /** Raw broker-specific data */
  raw?: Record<string, any>
}

// ============================================================================
// BROKER CONNECTION CONFIG (stored in DB)
// ============================================================================

export interface BrokerConnectionConfig {
  /** Database row ID */
  id: number

  /** Which user owns this connection */
  userId: number

  /** Broker identifier (e.g., 'kite') */
  brokerId: string

  /** Human-readable label (e.g., 'My Zerodha Account') */
  displayName: string | null

  /** OAuth access token */
  accessToken: string | null

  /** API key / app key */
  apiKey: string | null

  /** API secret */
  apiSecret: string | null

  /** User ID at the broker (e.g., Kite user ID) */
  brokerUserId: string | null

  /** Is this connection currently active? */
  isActive: boolean

  /** Is this the primary data source? */
  isPrimary: boolean

  /** When the token was last refreshed */
  lastConnected: Date | null

  /** When the current token expires */
  tokenExpiry: Date | null

  /** Broker-specific extra data */
  metadata: Record<string, any> | null
}

// ============================================================================
// BROKER REGISTRATION
// ============================================================================

export interface BrokerDefinition {
  /** Unique broker ID */
  brokerId: string

  /** Display name */
  displayName: string

  /** Whether this broker supports OAuth login */
  supportsOAuth: boolean

  /** OAuth login URL builder (if supportsOAuth) */
  getOAuthUrl?: () => string

  /** Factory function to create a client from connection config */
  createClient: (config: BrokerConnectionConfig) => BrokerClient
}
