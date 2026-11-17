/**
 * Angel One (SmartAPI) Broker Client
 *
 * Implements the BrokerClient interface using Angel One's SmartAPI SDK.
 * Wraps all Angel-specific API calls and maps responses to unified types.
 *
 * Auth flow: API Key + Client Code + Password + TOTP → jwtToken
 * Tokens expire daily — users must reconnect with TOTP each morning.
 *
 * Key differences from Kite:
 * - Uses symbolToken (string) instead of instrument_token (number)
 * - Quote API takes { NSE: ["3045"] } format instead of "NSE:RELIANCE"
 * - Historical API returns arrays: [date, open, high, low, close, volume]
 * - Instruments from a JSON master file (~30MB), not a CSV endpoint
 */

import type {
  BrokerClient,
  QuoteData,
  HistoricalParams,
  CandleData,
  InstrumentData,
  BrokerHolding,
} from './types'

// SmartAPI SDK types (the SDK uses CommonJS require pattern)
let SmartAPI: any

try {
  SmartAPI = require('smartapi-javascript').SmartAPI
} catch {
  // SDK not installed — will throw when createClient is called
  SmartAPI = null
}

// ============================================================================
// INTERVAL MAPPING
// ============================================================================

/**
 * Map our unified interval names to Angel One's constants.
 * Our format: 'minute', '5minute', '15minute', '30minute', '60minute', 'day'
 * Angel format: 'ONE_MINUTE', 'FIVE_MINUTE', etc.
 */
const INTERVAL_MAP: Record<string, string> = {
  'minute': 'ONE_MINUTE',
  '1minute': 'ONE_MINUTE',
  '3minute': 'THREE_MINUTE',
  '5minute': 'FIVE_MINUTE',
  '10minute': 'TEN_MINUTE',
  '15minute': 'FIFTEEN_MINUTE',
  '30minute': 'THIRTY_MINUTE',
  '60minute': 'ONE_HOUR',
  'day': 'ONE_DAY',
  'week': 'ONE_DAY', // No native weekly — use daily and aggregate
}

// ============================================================================
// INSTRUMENT CACHE (shared across instances, refreshed daily)
// ============================================================================

interface AngelInstrument {
  token: string
  symbol: string
  name: string
  expiry: string
  strike: string
  lotsize: string
  instrumenttype: string
  exch_seg: string
  tick_size: string
}

let instrumentCache: AngelInstrument[] | null = null
let instrumentCacheTimestamp = 0
const INSTRUMENT_CACHE_TTL = 6 * 60 * 60 * 1000 // 6 hours

async function fetchInstrumentMaster(): Promise<AngelInstrument[]> {
  const now = Date.now()
  if (instrumentCache && (now - instrumentCacheTimestamp) < INSTRUMENT_CACHE_TTL) {
    return instrumentCache
  }

  console.log('📥 Angel One: Fetching instrument master file...')
  const url = 'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json'

  const response = await fetch(url, {
    headers: { 'Accept': 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch Angel One instrument master: ${response.status}`)
  }

  const data = await response.json()

  if (!Array.isArray(data)) {
    throw new Error('Angel One instrument master is not an array')
  }

  instrumentCache = data
  instrumentCacheTimestamp = now
  console.log(`✅ Angel One: Loaded ${data.length} instruments from master file`)

  return data
}

// ============================================================================
// ANGEL ONE BROKER CLIENT
// ============================================================================

export class AngelBrokerClient implements BrokerClient {
  readonly brokerId = 'angel'
  readonly displayName = 'Angel One'

  private smartApi: any
  private accessToken: string
  private connected: boolean = true

  constructor(config: {
    apiKey: string
    accessToken: string // This is the jwtToken from generateSession
    refreshToken?: string
    feedToken?: string
    clientCode?: string
  }) {
    if (!SmartAPI) {
      throw new Error('smartapi-javascript SDK not installed. Run: npm install smartapi-javascript')
    }

    this.accessToken = config.accessToken
    this.smartApi = new SmartAPI({
      api_key: config.apiKey,
      access_token: config.accessToken,
      refresh_token: config.refreshToken || '',
    })
  }

  async getHoldings(): Promise<BrokerHolding[]> {
    throw new Error('Reading holdings is not supported for Angel One yet')
  }

  isConnected(): boolean {
    return this.connected && !!this.accessToken
  }

  /**
   * Get real-time quotes from Angel One.
   *
   * Angel API: getMarketData("FULL", { NSE: ["3045"] })
   * Returns: { data: { fetched: [{ ltp, open, high, low, close, tradeVolume, netChange, ... }] } }
   *
   * We need to map our "NSE:RELIANCE" format to Angel's { NSE: ["token"] } format,
   * which requires an instrument lookup.
   */
  async getQuote(symbols: string[]): Promise<Record<string, QuoteData>> {
    try {
      const result: Record<string, QuoteData> = {}
      const instruments = await fetchInstrumentMaster()

      // Group symbols by exchange and resolve to tokens
      const exchangeTokenMap: Record<string, string[]> = {}
      const tokenToSymbol: Record<string, string> = {}

      for (const fullSymbol of symbols) {
        const [exchange, symbol] = fullSymbol.includes(':')
          ? fullSymbol.split(':')
          : ['NSE', fullSymbol]

        // Find instrument in master file
        const normalizedSymbol = symbol.endsWith('-EQ') ? symbol : `${symbol}-EQ`
        const inst = instruments.find(
          i => i.exch_seg === exchange && (i.symbol === normalizedSymbol || i.name === symbol)
        )

        if (inst) {
          if (!exchangeTokenMap[exchange]) exchangeTokenMap[exchange] = []
          exchangeTokenMap[exchange].push(inst.token)
          tokenToSymbol[inst.token] = fullSymbol
        } else {
          console.warn(`⚠️  Angel One: Instrument not found for ${fullSymbol}`)
        }
      }

      // Fetch quotes per exchange (API supports one exchange at a time)
      for (const [exchange, tokens] of Object.entries(exchangeTokenMap)) {
        // Angel API can handle multiple tokens per request
        try {
          const response = await this.smartApi.getMarketData({
            mode: 'FULL',
            exchangeTokens: { [exchange]: tokens },
          })

          if (response?.data?.fetched) {
            for (const raw of response.data.fetched) {
              const originalSymbol = tokenToSymbol[raw.symbolToken]
              if (!originalSymbol) continue

              result[originalSymbol] = {
                lastPrice: raw.ltp ?? 0,
                open: raw.open ?? 0,
                high: raw.high ?? 0,
                low: raw.low ?? 0,
                close: raw.close ?? 0,
                volume: raw.tradeVolume ?? 0,
                change: raw.netChange ?? (raw.ltp - (raw.close ?? 0)),
                changePercent: raw.percentChange ?? (
                  raw.close ? ((raw.ltp - raw.close) / raw.close) * 100 : 0
                ),
                timestamp: new Date(),
                raw, // Preserve full response
              }
            }
          }
        } catch (err: any) {
          console.error(`❌ Angel One quote error for ${exchange}:`, err.message)
          if (err.message?.includes('Invalid Token') || err.message?.includes('token')) {
            this.connected = false
          }
          throw err
        }
      }

      return result
    } catch (error: any) {
      if (error.message?.includes('Invalid Token') || error.message?.includes('token')) {
        this.connected = false
      }
      throw error
    }
  }

  /**
   * Get historical OHLCV data from Angel One.
   *
   * Angel API: getCandleData({ exchange, symboltoken, interval, fromdate, todate })
   * Returns: { data: [[date, open, high, low, close, volume], ...] }
   *
   * Date format required: "YYYY-MM-DD HH:mm"
   */
  async getHistoricalData(params: HistoricalParams): Promise<CandleData[]> {
    try {
      const angelInterval = INTERVAL_MAP[params.interval] || 'ONE_DAY'

      // Determine symboltoken — params.instrumentToken could be the token directly
      let symbolToken = String(params.instrumentToken)

      // If it looks like a numeric Kite token, look up the Angel token
      if (params.symbol && params.exchange) {
        const instruments = await fetchInstrumentMaster()
        const normalizedSymbol = params.symbol.endsWith('-EQ') ? params.symbol : `${params.symbol}-EQ`
        const inst = instruments.find(
          i => i.exch_seg === params.exchange &&
            (i.symbol === normalizedSymbol || i.name === params.symbol)
        )
        if (inst) {
          symbolToken = inst.token
        }
      }

      const fromDate = this.formatDateForAngel(params.from)
      const toDate = this.formatDateForAngel(params.to)

      const response = await this.smartApi.getCandleData({
        exchange: params.exchange || 'NSE',
        symboltoken: symbolToken,
        interval: angelInterval,
        fromdate: fromDate,
        todate: toDate,
      })

      if (!response?.data || !Array.isArray(response.data)) {
        return []
      }

      // Angel returns: [[date, open, high, low, close, volume], ...]
      return response.data.map((candle: any[]) => ({
        date: new Date(candle[0]),
        open: candle[1],
        high: candle[2],
        low: candle[3],
        close: candle[4],
        volume: candle[5],
      }))
    } catch (error: any) {
      if (error.message?.includes('Invalid Token') || error.message?.includes('token')) {
        this.connected = false
      }
      throw error
    }
  }

  /**
   * Get instruments list from Angel One master file.
   *
   * The master file is a JSON array downloaded from Angel's servers.
   * We filter by exchange and map to our InstrumentData format.
   */
  async getInstruments(exchange?: string): Promise<InstrumentData[]> {
    try {
      const instruments = await fetchInstrumentMaster()

      let filtered = instruments
      if (exchange) {
        filtered = instruments.filter(i => i.exch_seg === exchange)
      }

      return filtered.map((inst) => ({
        instrumentToken: inst.token, // Angel uses string tokens
        tradingsymbol: inst.symbol,
        name: inst.name || '',
        exchange: inst.exch_seg || '',
        segment: inst.exch_seg || '',
        lotSize: parseInt(inst.lotsize, 10) || 1,
        instrumentType: inst.instrumenttype || undefined,
        raw: inst,
      }))
    } catch (error: any) {
      console.error('❌ Angel One instruments error:', error.message)
      throw error
    }
  }

  // ────────────────────────────────────────────
  // HELPERS
  // ────────────────────────────────────────────

  /**
   * Format a Date to Angel One's expected format: "YYYY-MM-DD HH:mm"
   */
  private formatDateForAngel(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day} ${hours}:${minutes}`
  }
}

// ============================================================================
// AUTH HELPER (used by /api/user/brokers POST for Angel One login)
// ============================================================================

export interface AngelAuthResult {
  jwtToken: string
  refreshToken: string
  feedToken: string
}

/**
 * Authenticate with Angel One using SmartAPI.
 * Called from /api/user/brokers when brokerId === 'angel'.
 *
 * @returns jwtToken (accessToken), refreshToken, feedToken
 */
export async function authenticateAngel(config: {
  apiKey: string
  clientCode: string
  password: string
  totp: string
}): Promise<AngelAuthResult> {
  if (!SmartAPI) {
    throw new Error('smartapi-javascript SDK not installed. Run: npm install smartapi-javascript')
  }

  const smartApi = new SmartAPI({
    api_key: config.apiKey,
  })

  const response = await smartApi.generateSession(
    config.clientCode,
    config.password,
    config.totp
  )

  if (!response?.data?.jwtToken) {
    throw new Error(response?.message || 'Angel One authentication failed — no jwtToken received')
  }

  return {
    jwtToken: response.data.jwtToken,
    refreshToken: response.data.refreshToken || '',
    feedToken: response.data.feedToken || '',
  }
}
