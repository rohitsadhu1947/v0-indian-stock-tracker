/**
 * Symbol Normalization Adapters
 *
 * Each broker uses different symbol formats:
 * - Kite:     quote key "NSE:RELIANCE", tradingsymbol "RELIANCE"
 * - Angel:    symbol "RELIANCE-EQ", token "2885"
 * - Upstox:   instrument key "NSE_EQ|INE002A01018", symbol "RELIANCE"
 *
 * These adapters convert between canonical format and broker-specific formats.
 */

import type { BrokerSymbolAdapter } from './types'

// ============================================================================
// KITE (Zerodha)
// ============================================================================

export class KiteSymbolAdapter implements BrokerSymbolAdapter {
  toBrokerFormat(symbol: string, exchange: string): string {
    return symbol // Kite uses plain tradingsymbol
  }

  fromBrokerFormat(brokerSymbol: string): { canonical: string; exchange: string } {
    // "NSE:RELIANCE" → { canonical: "RELIANCE", exchange: "NSE" }
    if (brokerSymbol.includes(':')) {
      const [exchange, symbol] = brokerSymbol.split(':')
      return { canonical: symbol, exchange }
    }
    return { canonical: brokerSymbol, exchange: 'NSE' }
  }

  toQuoteKey(symbol: string, exchange: string): string {
    return `${exchange}:${symbol}`
  }
}

// ============================================================================
// ANGEL ONE (SmartAPI) — placeholder for Phase 3
// ============================================================================

export class AngelSymbolAdapter implements BrokerSymbolAdapter {
  toBrokerFormat(symbol: string, exchange: string): string {
    return `${symbol}-EQ` // Angel uses RELIANCE-EQ for equity
  }

  fromBrokerFormat(brokerSymbol: string): { canonical: string; exchange: string } {
    // "RELIANCE-EQ" → { canonical: "RELIANCE", exchange: "NSE" }
    const symbol = brokerSymbol.replace(/-EQ$/, '')
    return { canonical: symbol, exchange: 'NSE' }
  }

  toQuoteKey(symbol: string, exchange: string): string {
    return symbol // Angel uses just the symbol for quote requests
  }
}

// ============================================================================
// UPSTOX — placeholder for Phase 4
// ============================================================================

export class UpstoxSymbolAdapter implements BrokerSymbolAdapter {
  toBrokerFormat(symbol: string, exchange: string): string {
    return symbol
  }

  fromBrokerFormat(brokerSymbol: string): { canonical: string; exchange: string } {
    // "NSE_EQ|INE002A01018" → need ISIN lookup
    if (brokerSymbol.includes('|')) {
      const [, isin] = brokerSymbol.split('|')
      return { canonical: isin, exchange: 'NSE' }
    }
    return { canonical: brokerSymbol, exchange: 'NSE' }
  }

  toQuoteKey(symbol: string, exchange: string): string {
    return `${exchange}_EQ|${symbol}`
  }
}

// ============================================================================
// PASSTHROUGH (for brokers without API — uses admin's broker data as-is)
// ============================================================================

export class PassthroughSymbolAdapter implements BrokerSymbolAdapter {
  toBrokerFormat(symbol: string, _exchange: string): string {
    return symbol
  }

  fromBrokerFormat(brokerSymbol: string): { canonical: string; exchange: string } {
    return { canonical: brokerSymbol, exchange: 'NSE' }
  }

  toQuoteKey(symbol: string, exchange: string): string {
    return `${exchange}:${symbol}`
  }
}
