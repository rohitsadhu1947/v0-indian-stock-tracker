// Utility functions for market data processing and technical analysis

/** Raw quote shape returned by Kite Connect SDK (broker-specific) */
export interface KiteQuote {
  instrument_token: number;
  timestamp: Date;
  last_price: number;
  last_quantity: number;
  last_trade_time: Date;
  average_price: number;
  volume: number;
  buy_quantity: number;
  sell_quantity: number;
  open: number;
  high: number;
  low: number;
  close: number;
  change: number;
  ohlc: {
    open: number;
    high: number;
    low: number;
    close: number;
  };
}

/** Raw historical candle shape returned by Kite Connect SDK (broker-specific) */
export interface KiteHistoricalData {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Technical Analysis Functions
export function calculateSMA(prices: number[], period: number): number | null {
  if (!prices || prices.length < period) return null;
  const sum = prices.slice(0, period).reduce((a, b) => a + b, 0);
  return sum / period;
}

export function calculateRSI(prices: number[], period: number = 14): number {
  if (!prices || prices.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const change = prices[i - 1] - prices[i];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

export function calculateEMA(prices: number[], period: number): number {
  if (!prices || prices.length < period) return prices ? prices[0] : 0;
  
  const multiplier = 2 / (period + 1);
  let ema = calculateSMA(prices.slice(0, period), period) || prices[0];
  
  for (let i = period; i < Math.min(prices.length, 50); i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  
  return ema;
}

export function calculateMACD(prices: number[]) {
  if (!prices || prices.length < 26) return { macd: 0, signal: 0, histogram: 0 };
  
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macd = ema12 - ema26;
  const signal = macd * 0.2;
  
  return {
    macd: macd,
    signal: signal,
    histogram: macd - signal
  };
}

export function calculateBollingerBands(prices: number[], period: number = 20) {
  const sma = calculateSMA(prices, period);
  if (!sma) return { upper: 0, middle: 0, lower: 0 };
  
  const variance = prices.slice(0, period).reduce((sum, price) => {
    return sum + Math.pow(price - sma, 2);
  }, 0) / period;
  
  const stdDev = Math.sqrt(variance);
  
  return {
    upper: sma + (stdDev * 2),
    middle: sma,
    lower: sma - (stdDev * 2)
  };
}

export interface TradingSignal {
  signal: 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG SELL';
  strength: number;
  reason: string;
  indicators: {
    rsi: string;
    macd: string;
    bb_position: string;
  };
}

export function generateTradingSignal(
  currentPrice: number,
  prices: number[],
  volumes: number[]
): TradingSignal {
  // Require 30 days minimum for accurate technical analysis
  // With 60-day fetch, we'll have ~40 trading days
  if (prices.length < 30) {
    return {
      signal: 'HOLD',
      strength: 1,
      reason: 'Insufficient data (need 30+ days)',
      indicators: {
        rsi: 'N/A',
        macd: 'N/A',
        bb_position: 'N/A'
      }
    };
  }
  
  const rsi = calculateRSI(prices);
  const macd = calculateMACD(prices);
  const bb = calculateBollingerBands(prices);
  const sma20 = calculateSMA(prices, 20);
  const sma50 = calculateSMA(prices, 50);
  const avgVolume = calculateSMA(volumes, 20);
  const currentVolume = volumes[0];
  
  let buySignals = 0;
  let sellSignals = 0;
  let reasons: string[] = [];
  
  // RSI signals
  if (rsi < 30) {
    buySignals += 2;
    reasons.push('RSI Oversold');
  } else if (rsi > 70) {
    sellSignals += 2;
    reasons.push('RSI Overbought');
  }
  
  // MACD signals
  if (macd.histogram > 0 && macd.macd > macd.signal) {
    buySignals += 1;
    reasons.push('MACD Bullish');
  } else if (macd.histogram < 0 && macd.macd < macd.signal) {
    sellSignals += 1;
    reasons.push('MACD Bearish');
  }
  
  // Bollinger Bands signals
  if (currentPrice <= bb.lower) {
    buySignals += 2;
    reasons.push('At Lower BB');
  } else if (currentPrice >= bb.upper) {
    sellSignals += 2;
    reasons.push('At Upper BB');
  }
  
  // Moving Average signals
  if (sma20 && sma50 && sma20 > sma50 && currentPrice > sma20) {
    buySignals += 1;
    reasons.push('Golden Cross');
  } else if (sma20 && sma50 && sma20 < sma50 && currentPrice < sma20) {
    sellSignals += 1;
    reasons.push('Death Cross');
  }
  
  // Volume confirmation
  if (avgVolume && currentVolume > avgVolume * 1.5) {
    if (buySignals > sellSignals) buySignals += 1;
    if (sellSignals > buySignals) sellSignals += 1;
    reasons.push('High Volume');
  }
  
  // Determine signal
  let signal: TradingSignal['signal'];
  let strength: number;
  
  if (buySignals >= 4) {
    signal = 'STRONG BUY';
    strength = Math.min(5, Math.floor(buySignals / 2));
  } else if (buySignals >= 2) {
    signal = 'BUY';
    strength = Math.min(4, Math.floor(buySignals / 1.5));
  } else if (sellSignals >= 4) {
    signal = 'STRONG SELL';
    strength = Math.min(5, Math.floor(sellSignals / 2));
  } else if (sellSignals >= 2) {
    signal = 'SELL';
    strength = Math.min(4, Math.floor(sellSignals / 1.5));
  } else {
    signal = 'HOLD';
    strength = 2;
    reasons = ['Mixed signals', 'Wait for confirmation'];
  }
  
  return {
    signal: signal,
    strength: strength,
    reason: reasons.join(', '),
    indicators: {
      rsi: rsi.toFixed(2),
      macd: macd.macd.toFixed(2),
      bb_position: bb.upper > bb.lower 
        ? ((currentPrice - bb.lower) / (bb.upper - bb.lower) * 100).toFixed(1) + '%' 
        : 'N/A'
    }
  };
}

/**
 * Format a stock symbol with exchange prefix (e.g. "NSE:RELIANCE")
 * Works for any Indian exchange broker — Kite, Groww, etc.
 */
export function formatSymbolForExchange(symbol: string, exchange: string = 'NSE'): string {
  const cleanSymbol = symbol.replace(/^(NSE|BSE):/i, '');
  return `${exchange}:${cleanSymbol}`;
}

/** @deprecated Use formatSymbolForExchange instead */
export const formatSymbolForKite = formatSymbolForExchange;

/**
 * Parse "EXCHANGE:SYMBOL" string into components.
 * Returns { exchange: 'NSE', symbol } if no prefix found.
 */
export function parseExchangeSymbol(exchangeSymbol: string): { exchange: string; symbol: string } {
  const parts = exchangeSymbol.split(':');
  if (parts.length === 2) {
    return { exchange: parts[0], symbol: parts[1] };
  }
  return { exchange: 'NSE', symbol: exchangeSymbol };
}

/** @deprecated Use parseExchangeSymbol instead */
export const parseKiteSymbol = parseExchangeSymbol;

