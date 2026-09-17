/**
 * Kite Broker Client
 *
 * Implements the BrokerClient interface using Zerodha's KiteConnect SDK.
 * Wraps all Kite-specific API calls and maps responses to unified types.
 */

import { KiteConnect } from 'kiteconnect'
import type {
  BrokerClient,
  QuoteData,
  HistoricalParams,
  CandleData,
  InstrumentData,
} from './types'

export class KiteBrokerClient implements BrokerClient {
  readonly brokerId = 'kite'
  readonly displayName = 'Zerodha Kite'

  private kc: InstanceType<typeof KiteConnect>
  private accessToken: string
  private connected: boolean = true

  constructor(config: { apiKey: string; accessToken: string }) {
    this.accessToken = config.accessToken
    this.kc = new KiteConnect({ api_key: config.apiKey })
    this.kc.setAccessToken(config.accessToken)
  }

  isConnected(): boolean {
    return this.connected && !!this.accessToken
  }

  /**
   * Get real-time quotes from Kite.
   *
   * Kite returns: { "NSE:RELIANCE": { last_price, ohlc: { open, high, low, close }, volume, ... } }
   * We map to unified QuoteData format.
   */
  async getQuote(symbols: string[]): Promise<Record<string, QuoteData>> {
    try {
      const kiteQuotes = await this.kc.getQuote(symbols)
      const result: Record<string, QuoteData> = {}

      for (const [symbol, raw] of Object.entries(kiteQuotes as Record<string, any>)) {
        result[symbol] = {
          lastPrice: raw.last_price ?? 0,
          open: raw.ohlc?.open ?? 0,
          high: raw.ohlc?.high ?? 0,
          low: raw.ohlc?.low ?? 0,
          close: raw.ohlc?.close ?? 0,
          volume: raw.volume ?? 0,
          change: raw.net_change ?? (raw.last_price - (raw.ohlc?.close ?? 0)),
          changePercent:
            raw.ohlc?.close
              ? ((raw.last_price - raw.ohlc.close) / raw.ohlc.close) * 100
              : 0,
          timestamp: new Date(),
          raw, // Preserve full Kite response for routes that need extra fields
        }
      }

      return result
    } catch (error: any) {
      if (error.message?.includes('Token')) {
        this.connected = false
      }
      throw error
    }
  }

  /**
   * Get historical OHLCV data from Kite.
   *
   * Kite returns an array of candle objects or arrays.
   * We normalize to CandleData[].
   */
  async getHistoricalData(params: HistoricalParams): Promise<CandleData[]> {
    try {
      const rawData = await this.kc.getHistoricalData(
        params.instrumentToken,
        params.interval as any,
        params.from,
        params.to
      )

      if (!rawData || !Array.isArray(rawData)) {
        return []
      }

      return rawData.map((candle: any) => {
        // Kite can return objects or arrays depending on version
        if (Array.isArray(candle)) {
          return {
            date: new Date(candle[0]),
            open: candle[1],
            high: candle[2],
            low: candle[3],
            close: candle[4],
            volume: candle[5],
          }
        }

        return {
          date: new Date(candle.date || candle.timestamp),
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
        }
      })
    } catch (error: any) {
      if (error.message?.includes('Token')) {
        this.connected = false
      }
      throw error
    }
  }

  /**
   * Get instruments list from Kite.
   *
   * Kite returns: [{ instrument_token, tradingsymbol, name, exchange, segment, lot_size, ... }]
   */
  async getInstruments(exchange?: string): Promise<InstrumentData[]> {
    try {
      const exchangeArg = exchange ? [exchange] as any : undefined
      const rawInstruments = await this.kc.getInstruments(exchangeArg)

      if (!rawInstruments || !Array.isArray(rawInstruments)) {
        return []
      }

      return rawInstruments.map((inst: any) => ({
        instrumentToken: inst.instrument_token,
        tradingsymbol: inst.tradingsymbol,
        name: inst.name || '',
        exchange: inst.exchange || exchange || '',
        segment: inst.segment || '',
        lotSize: inst.lot_size || 1,
        instrumentType: inst.instrument_type || undefined,
        isin: inst.isin || undefined,
        raw: inst,
      }))
    } catch (error: any) {
      if (error.message?.includes('Token')) {
        this.connected = false
      }
      throw error
    }
  }

  /**
   * Get the underlying KiteConnect instance for Kite-specific operations.
   * Only used by the debug/kite-status route for getProfile().
   * All other routes should use the BrokerClient interface methods.
   */
  getRawClient(): InstanceType<typeof KiteConnect> {
    return this.kc
  }
}
