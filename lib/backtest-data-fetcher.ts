/**
 * Historical Data Fetcher for Backtesting
 * Retrieves past price data from Kite Connect API
 */

import type { KiteConnect } from 'kiteconnect'

export interface HistoricalCandle {
  date: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface HistoricalDataOptions {
  from: Date
  to: Date
  interval: 'minute' | '3minute' | '5minute' | '10minute' | '15minute' | '30minute' | '60minute' | 'day'
}

/**
 * Fetch historical data for a single symbol
 */
export async function fetchHistoricalData(
  symbol: string,
  exchange: string,
  options: HistoricalDataOptions,
  accessToken: string
): Promise<HistoricalCandle[]> {
  try {
    // Step 1: Get instrument token from symbol
    const instrumentsResponse = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3003'}/api/kite/instruments`,
      {
        // Pass the access token via header for server-side auth check
        headers: {
          'Cookie': `kite_access_token=${accessToken}`
        }
      }
    )
    
    if (!instrumentsResponse.ok) {
      console.error(`❌ ${symbol}: Failed to fetch instruments list (${instrumentsResponse.status})`)
      if (instrumentsResponse.status === 401) {
        console.error(`   → You need to login to Kite first!`)
      }
      return []
    }
    
    const instrumentsData = await instrumentsResponse.json()
    
    // Extract array from response (API returns {success, data, cached})
    const instruments = instrumentsData.data || instrumentsData
    
    if (!Array.isArray(instruments)) {
      console.error(`❌ ${symbol}: Instruments response is not an array`)
      console.error(`   Response:`, JSON.stringify(instrumentsData).substring(0, 200))
      return []
    }
    
    // Find the instrument for this symbol
    const instrument = instruments.find((inst: any) => 
      inst.tradingsymbol === symbol && inst.exchange === exchange
    )
    
    if (!instrument) {
      console.error(`❌ ${symbol}: Instrument not found on ${exchange}`)
      return []
    }
    
    console.log(`📥 ${symbol}: Found instrument token ${instrument.instrument_token}`)
    
    // Step 2: Fetch historical data using instrument token
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3003'}/api/kite/historical?` +
      `instrument_token=${instrument.instrument_token}&` +
      `from_date=${options.from.toISOString().split('T')[0]}&` +
      `to_date=${options.to.toISOString().split('T')[0]}&` +
      `interval=${options.interval}`,
      {
        headers: {
          'Cookie': `kite_access_token=${accessToken}`
        }
      }
    )
    
    if (!response.ok) {
      console.error(`❌ ${symbol}: Historical API returned ${response.status}`)
      return []
    }
    
    const data = await response.json()
    
    if (!data.success || !data.candles) {
      console.error(`❌ ${symbol}: Invalid response from historical API`)
      return []
    }
    
    console.log(`✅ ${symbol}: Fetched ${data.candles.length} candles`)
    
    // Convert to HistoricalCandle format
    return data.candles.map((candle: any) => ({
      date: new Date(candle.date),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume
    }))
  } catch (error: any) {
    console.error(`❌ ${symbol}: ${error.message}`)
    return []
  }
}

/**
 * Fetch historical data for multiple symbols
 */
export async function fetchBatchHistoricalData(
  symbols: Array<{ symbol: string; exchange: string }>,
  options: HistoricalDataOptions,
  accessToken: string
): Promise<Map<string, HistoricalCandle[]>> {
  const dataMap = new Map<string, HistoricalCandle[]>()
  
  console.log(`📊 Starting batch fetch for ${symbols.length} symbols...`)
  console.log(`   Date range: ${options.from.toISOString().split('T')[0]} to ${options.to.toISOString().split('T')[0]}`)
  
  // Fetch in batches to avoid rate limiting
  const batchSize = 10
  let successCount = 0
  let errorCount = 0
  
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize)
    console.log(`   Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(symbols.length / batchSize)} (${batch.length} symbols)...`)
    
    const promises = batch.map(({ symbol, exchange }) =>
      fetchHistoricalData(symbol, exchange, options, accessToken)
        .then(candles => {
          if (candles.length > 0) {
            successCount++
          } else {
            errorCount++
          }
          return { symbol, candles }
        })
    )
    
    const results = await Promise.all(promises)
    
    results.forEach(({ symbol, candles }) => {
      if (candles.length > 0) {
        dataMap.set(symbol, candles)
      }
    })
    
    // Rate limiting: wait 200ms between batches
    if (i + batchSize < symbols.length) {
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }
  
  console.log(`✅ Batch fetch complete: ${successCount} success, ${errorCount} failed`)
  
  return dataMap
}

/**
 * Calculate technical indicators from historical data
 * (Used for generating signals during backtest)
 */
export function calculateIndicators(candles: HistoricalCandle[]): {
  sma5: number[]
  sma10: number[]
  sma20: number[]
  rsi: number[]
  macd: {
    macd: number[]
    signal: number[]
    histogram: number[]
  }
} {
  // Simple Moving Average
  const sma = (data: number[], period: number): number[] => {
    const result: number[] = []
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        result.push(NaN)
      } else {
        const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0)
        result.push(sum / period)
      }
    }
    return result
  }
  
  // RSI
  const calculateRSI = (data: number[], period: number = 14): number[] => {
    const result: number[] = []
    const changes: number[] = []
    
    for (let i = 1; i < data.length; i++) {
      changes.push(data[i] - data[i - 1])
    }
    
    for (let i = 0; i < data.length; i++) {
      if (i < period) {
        result.push(NaN)
      } else {
        const recentChanges = changes.slice(i - period, i)
        const gains = recentChanges.filter(c => c > 0).reduce((sum, c) => sum + c, 0) / period
        const losses = Math.abs(recentChanges.filter(c => c < 0).reduce((sum, c) => sum + c, 0)) / period
        
        if (losses === 0) {
          result.push(100)
        } else {
          const rs = gains / losses
          result.push(100 - (100 / (1 + rs)))
        }
      }
    }
    
    return result
  }
  
  // MACD
  const calculateMACD = (data: number[]): { macd: number[]; signal: number[]; histogram: number[] } => {
    const ema12 = calculateEMA(data, 12)
    const ema26 = calculateEMA(data, 26)
    const macd = ema12.map((val, i) => val - ema26[i])
    const signal = calculateEMA(macd, 9)
    const histogram = macd.map((val, i) => val - signal[i])
    
    return { macd, signal, histogram }
  }
  
  const calculateEMA = (data: number[], period: number): number[] => {
    const result: number[] = []
    const multiplier = 2 / (period + 1)
    
    // Start with SMA
    let ema = data.slice(0, period).reduce((sum, val) => sum + val, 0) / period
    result.push(ema)
    
    for (let i = period; i < data.length; i++) {
      ema = (data[i] - ema) * multiplier + ema
      result.push(ema)
    }
    
    return result
  }
  
  const closes = candles.map(c => c.close)
  
  return {
    sma5: sma(closes, 5),
    sma10: sma(closes, 10),
    sma20: sma(closes, 20),
    rsi: calculateRSI(closes, 14),
    macd: calculateMACD(closes)
  }
}

/**
 * Check if there's a buy signal at a given candle index
 * (Simplified version of momentum scanner logic)
 */
export function hasBuySignal(
  candles: HistoricalCandle[],
  index: number,
  indicators: ReturnType<typeof calculateIndicators>
): { signal: boolean; score: number; reason: string } {
  if (index < 20) {
    return { signal: false, score: 0, reason: 'Insufficient data' }
  }
  
  const rsi = indicators.rsi[index]
  const sma5 = indicators.sma5[index]
  const sma10 = indicators.sma10[index]
  const sma20 = indicators.sma20[index]
  const macdHistogram = indicators.macd.histogram[index]
  const currentPrice = candles[index].close
  
  let score = 0
  const reasons: string[] = []
  
  // RSI check (50-70 is good momentum)
  if (rsi >= 50 && rsi <= 70) {
    score += 30
    reasons.push(`RSI ${rsi.toFixed(1)} - bullish momentum`)
  } else if (rsi > 70) {
    score += 15
    reasons.push(`RSI ${rsi.toFixed(1)} - overbought (caution)`)
  }
  
  // Uptrend check (price > SMA5 > SMA10 > SMA20)
  if (currentPrice > sma5 && sma5 > sma10 && sma10 > sma20) {
    score += 40
    reasons.push('Strong uptrend (all SMAs aligned)')
  } else if (currentPrice > sma10) {
    score += 20
    reasons.push('Moderate uptrend')
  }
  
  // MACD check
  if (macdHistogram > 0) {
    score += 20
    reasons.push('MACD bullish')
  }
  
  // Volume check (above average)
  const avgVolume = candles.slice(Math.max(0, index - 20), index).reduce((sum, c) => sum + c.volume, 0) / 20
  if (candles[index].volume > avgVolume * 1.5) {
    score += 10
    reasons.push('High volume')
  }
  
  return {
    signal: score >= 60, // Minimum score for buy signal
    score,
    reason: reasons.join(', ')
  }
}

