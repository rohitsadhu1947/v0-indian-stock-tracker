/**
 * Relative Strength (RS) Ranking
 *
 * Measures stock performance relative to NIFTY 50.
 * RS = (Stock Return / NIFTY Return) × 100 over rolling windows.
 *
 * RS > 90th percentile = institutional favorite, momentum leader
 * RS < 20th percentile = relative weakness, avoid
 *
 * Uses broker getHistoricalData() for both stock and NIFTY returns.
 */

import type { BrokerClient } from './broker/types'
import logger from './logger'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RSResult {
  symbol: string
  rs1m: number         // 1-month relative strength
  rs3m: number         // 3-month relative strength
  rs6m: number         // 6-month relative strength
  composite: number    // Weighted composite RS (0-200, 100 = par with index)
  percentile: number   // Percentile rank among all stocks analyzed (0-100)
  rating: 'LEADER' | 'STRONG' | 'AVERAGE' | 'WEAK' | 'LAGGARD'
  signal: string
}

export interface RSRanking {
  rankings: RSResult[]
  niftyReturn1m: number
  niftyReturn3m: number
  niftyReturn6m: number
  generatedAt: string
}

// ─── Core Calculation ───────────────────────────────────────────────────────

/**
 * Calculate return % from price history.
 * Returns the % change from `daysAgo` to now.
 */
function calculateReturn(prices: { close: number; date: string }[], daysAgo: number): number | null {
  if (prices.length < 2) return null

  const sorted = [...prices].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const latest = sorted[0].close
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysAgo)

  // Find the closest bar to daysAgo
  let pastBar = sorted[sorted.length - 1]
  for (const bar of sorted) {
    if (new Date(bar.date) <= cutoffDate) {
      pastBar = bar
      break
    }
  }

  if (pastBar.close === 0) return null
  return ((latest - pastBar.close) / pastBar.close) * 100
}

/**
 * Calculate relative strength of a stock vs NIFTY.
 * RS = (stockReturn / niftyReturn) × 100
 * RS > 100 means stock outperforming NIFTY
 * RS < 100 means stock underperforming NIFTY
 */
export function calculateRelativeStrength(
  stockPrices: { close: number; date: string }[],
  niftyPrices: { close: number; date: string }[],
): Omit<RSResult, 'symbol' | 'percentile' | 'rating' | 'signal'> {
  const stockReturn1m = calculateReturn(stockPrices, 22) // ~1 month trading days
  const stockReturn3m = calculateReturn(stockPrices, 66) // ~3 months
  const stockReturn6m = calculateReturn(stockPrices, 132) // ~6 months

  const niftyReturn1m = calculateReturn(niftyPrices, 22)
  const niftyReturn3m = calculateReturn(niftyPrices, 66)
  const niftyReturn6m = calculateReturn(niftyPrices, 132)

  // Calculate RS for each window (handle edge cases where index is flat/negative)
  const calcRS = (stock: number | null, nifty: number | null): number => {
    if (stock === null || nifty === null) return 100
    if (nifty === 0) return stock > 0 ? 150 : stock < 0 ? 50 : 100
    // Normalize: RS of 100 = matching index, >100 = outperforming
    return 100 + (stock - nifty)
  }

  const rs1m = calcRS(stockReturn1m, niftyReturn1m)
  const rs3m = calcRS(stockReturn3m, niftyReturn3m)
  const rs6m = calcRS(stockReturn6m, niftyReturn6m)

  // Weighted composite: Recent performance weighted higher
  // 1M: 40%, 3M: 35%, 6M: 25%
  const composite = Math.round(rs1m * 0.40 + rs3m * 0.35 + rs6m * 0.25)

  return { rs1m: Math.round(rs1m), rs3m: Math.round(rs3m), rs6m: Math.round(rs6m), composite }
}

/**
 * Rank multiple stocks by relative strength.
 * Returns percentile rank for each stock.
 */
export function rankStocks(
  results: { symbol: string; composite: number; rs1m: number; rs3m: number; rs6m: number }[],
): RSResult[] {
  const sorted = [...results].sort((a, b) => b.composite - a.composite)
  const total = sorted.length

  return sorted.map((r, idx) => {
    const percentile = total > 1 ? Math.round(((total - 1 - idx) / (total - 1)) * 100) : 50

    const rating: RSResult['rating'] =
      percentile >= 90 ? 'LEADER' :
      percentile >= 70 ? 'STRONG' :
      percentile >= 40 ? 'AVERAGE' :
      percentile >= 20 ? 'WEAK' : 'LAGGARD'

    let signal: string
    if (rating === 'LEADER') {
      signal = `Top ${100 - percentile}% RS — institutional favorite. Momentum leaders like this outperform for 3-6 months.`
    } else if (rating === 'STRONG') {
      signal = `RS ${r.composite} (${percentile}th pctl) — outperforming index. Good momentum backing.`
    } else if (rating === 'AVERAGE') {
      signal = `RS ${r.composite} — moving in line with NIFTY. No relative edge.`
    } else if (rating === 'WEAK') {
      signal = `RS ${r.composite} (${percentile}th pctl) — underperforming index. Relative weakness.`
    } else {
      signal = `Bottom ${percentile + 1}% RS — significant underperformance. Avoid unless deep value play.`
    }

    return { ...r, percentile, rating, signal }
  })
}

/**
 * Full RS analysis for a list of stocks against NIFTY.
 * Fetches historical data from broker and ranks all stocks.
 */
export async function analyzeRelativeStrength(
  symbols: string[],
  broker: BrokerClient,
  niftyToken: number | string,
): Promise<RSRanking> {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 180) // 6 months

  // Fetch NIFTY data
  let niftyPrices: { close: number; date: string }[] = []
  try {
    const bars = await broker.getHistoricalData({
      instrumentToken: niftyToken,
      exchange: 'NSE',
      symbol: 'NIFTY 50',
      interval: 'day',
      from, to,
    })
    niftyPrices = (bars || []).map((b: any) => ({
      close: b.close,
      date: typeof b.date === 'string' ? b.date : new Date(b.date).toISOString(),
    }))
  } catch (err) {
    logger.error('RS: Failed to fetch NIFTY data', { error: (err as Error).message })
    return { rankings: [], niftyReturn1m: 0, niftyReturn3m: 0, niftyReturn6m: 0, generatedAt: new Date().toISOString() }
  }

  // Fetch stock data in parallel
  const results: { symbol: string; composite: number; rs1m: number; rs3m: number; rs6m: number }[] = []

  const promises = symbols.map(async (symbol) => {
    try {
      const bars = await broker.getHistoricalData({
        instrumentToken: symbol, // caller should pass resolved token
        exchange: 'NSE',
        symbol,
        interval: 'day',
        from, to,
      })
      const stockPrices = (bars || []).map((b: any) => ({
        close: b.close,
        date: typeof b.date === 'string' ? b.date : new Date(b.date).toISOString(),
      }))

      if (stockPrices.length >= 20) {
        const rs = calculateRelativeStrength(stockPrices, niftyPrices)
        results.push({ symbol, rs1m: rs.rs1m, rs3m: rs.rs3m, rs6m: rs.rs6m, composite: rs.composite })
      }
    } catch {
      // Skip — stock data unavailable
    }
  })
  await Promise.allSettled(promises)

  const rankings = rankStocks(results)

  const niftyReturn1m = calculateReturn(niftyPrices, 22) ?? 0
  const niftyReturn3m = calculateReturn(niftyPrices, 66) ?? 0
  const niftyReturn6m = calculateReturn(niftyPrices, 132) ?? 0

  logger.info(`RS: Ranked ${rankings.length} stocks`, {
    leaders: rankings.filter(r => r.rating === 'LEADER').length,
    laggards: rankings.filter(r => r.rating === 'LAGGARD').length,
  })

  return {
    rankings,
    niftyReturn1m: Math.round(niftyReturn1m * 100) / 100,
    niftyReturn3m: Math.round(niftyReturn3m * 100) / 100,
    niftyReturn6m: Math.round(niftyReturn6m * 100) / 100,
    generatedAt: new Date().toISOString(),
  }
}
