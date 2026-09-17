/**
 * Shared stock-quote fetcher — used by multiple tab components.
 * Reads `exchange` from the watchlist store and writes `brokerExpired`
 * to the auth store on token-expiry errors.
 */

import { formatSymbolForExchange } from '@/lib/market-utils'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useWatchlistStore, type StockData } from '@/lib/stores/watchlist-store'

export async function fetchStockQuote(symbol: string): Promise<StockData | null> {
  const exchange = useWatchlistStore.getState().exchange
  const setBrokerExpired = useAuthStore.getState().setBrokerExpired

  try {
    const kiteSymbol = formatSymbolForExchange(symbol, exchange)
    const res = await fetch(`/api/market-data/quote?symbols=${encodeURIComponent(kiteSymbol)}`)

    if (!res.ok) {
      const errorData = await res.json()
      if (
        errorData.code === 'TOKEN_EXPIRED' ||
        errorData.error?.includes('No broker connections')
      ) {
        setBrokerExpired(true)
      }
      throw new Error(errorData.error || 'Failed to fetch quote')
    }

    const { data } = await res.json()
    const quote = data[kiteSymbol]

    if (!quote) {
      throw new Error('No data received for ' + symbol)
    }

    // Fetch historical data for technical indicators
    const historicalRes = await fetch(
      `/api/market-data/historical?instrument_token=${quote.instrument_token}&interval=day`
    )

    let prices: number[] = []
    let volumes: number[] = []

    if (historicalRes.ok) {
      const histData = await historicalRes.json()
      const candles: any[] = histData.candles || histData.data || []
      if (candles.length > 0) {
        prices = candles.map((d) => d.close).reverse()
        volumes = candles.map((d) => d.volume).reverse()
      }
    }

    return {
      symbol,
      name: quote.tradingsymbol || symbol,
      instrumentToken: quote.instrument_token,
      current: quote.last_price,
      change: quote.last_price - quote.ohlc.close,
      changePercent: ((quote.last_price - quote.ohlc.close) / quote.ohlc.close) * 100,
      volume: quote.volume,
      dayHigh: quote.ohlc.high,
      dayLow: quote.ohlc.low,
      open: quote.ohlc.open,
      prices,
      volumes,
      timestamp: new Date().toLocaleTimeString(),
    }
  } catch (err: any) {
    console.error(`Error fetching ${symbol}:`, err)
    return null
  }
}
