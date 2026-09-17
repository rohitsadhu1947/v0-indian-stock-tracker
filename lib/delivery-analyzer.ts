/**
 * Delivery Volume Analyzer
 *
 * Fetches delivery data from NSE and analyzes patterns.
 * High delivery % = institutional buying (genuine), low = speculative.
 *
 * Patterns:
 *   - Delivery > 70% + price up = genuine institutional buying
 *   - Delivery < 30% + price up = speculative rally (likely to reverse)
 *   - Rising delivery + consolidation = accumulation (smart money)
 *   - Falling delivery + price up = distribution (smart money exiting)
 */

import https from 'https'
import logger from '@/lib/logger'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DeliveryDataPoint {
  date: string
  totalVolume: number
  deliveryVolume: number
  deliveryPct: number      // 0-100
  closePrice: number
  priceChange: number      // % change from previous close
}

export type DeliveryPattern =
  | 'ACCUMULATION'    // Rising delivery + consolidation = institutions building
  | 'DISTRIBUTION'    // Falling delivery + price up = smart money exiting
  | 'SPECULATIVE'     // Low delivery + big price move = day traders
  | 'GENUINE'         // High delivery + price move = real institutional flow
  | 'NEUTRAL'

export interface DeliveryAnalysis {
  available: boolean
  currentDeliveryPct: number
  avgDeliveryPct5d: number
  avgDeliveryPct20d: number
  deliveryTrend: 'RISING' | 'FALLING' | 'FLAT'
  pattern: DeliveryPattern
  score: number              // -30 to +30
  signals: string[]
  history: DeliveryDataPoint[]  // Last 20 days
}

// ─── NSE Fetch ──────────────────────────────────────────────────────────────

const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nseindia.com/get-quotes/equity?symbol=RELIANCE',
}

function httpsGet(url: string, headers: Record<string, string>, timeoutMs = 8000): Promise<string | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      logger.warn('Delivery analyzer: request timed out', { url: url.substring(0, 80) })
      resolve(null)
    }, timeoutMs)

    const req = https.get(url, { headers }, (res) => {
      let data = ''
      res.on('data', (chunk: string) => data += chunk)
      res.on('end', () => {
        clearTimeout(timeout)
        resolve(data)
      })
    })

    req.on('error', (err: Error) => {
      clearTimeout(timeout)
      logger.warn('Delivery analyzer: request error', { url: url.substring(0, 80), error: err.message })
      resolve(null)
    })
  })
}

/**
 * Fetch current delivery data from NSE quote API.
 * Returns today's delivery %, volume, and recent trade data.
 */
export async function fetchDeliveryData(symbol: string): Promise<DeliveryDataPoint | null> {
  try {
    const url = `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}`
    const raw = await httpsGet(url, NSE_HEADERS)
    if (!raw) return null

    const json = JSON.parse(raw)
    const secInfo = json?.securityWiseDP || json?.priceInfo || {}
    const priceInfo = json?.priceInfo || {}

    const deliveryPct = parseFloat(secInfo.deliveryToTradedQuantity || secInfo.deliveryQuantity || '0')
    const totalVolume = parseInt(secInfo.quantityTraded || priceInfo.totalTradedVolume || '0', 10)
    const deliveryVolume = parseInt(secInfo.deliveredQuantity || '0', 10) ||
                           Math.round(totalVolume * deliveryPct / 100)

    if (deliveryPct === 0 && totalVolume === 0) return null

    const closePrice = priceInfo.lastPrice || priceInfo.close || 0
    const prevClose = priceInfo.previousClose || closePrice
    const priceChange = prevClose > 0 ? ((closePrice - prevClose) / prevClose) * 100 : 0

    const today = new Date().toISOString().split('T')[0]

    logger.info(`Delivery: ${symbol} — ${deliveryPct.toFixed(1)}% delivery, vol ${totalVolume}`)

    return {
      date: today,
      totalVolume,
      deliveryVolume,
      deliveryPct,
      closePrice,
      priceChange,
    }
  } catch (err) {
    logger.warn(`Delivery: Failed to fetch for ${symbol}`, { error: (err as Error).message })
    return null
  }
}

/**
 * Fetch trade information including historical delivery data from NSE.
 */
export async function fetchTradeInfo(symbol: string): Promise<DeliveryDataPoint[]> {
  try {
    const url = `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}&section=trade_info`
    const raw = await httpsGet(url, NSE_HEADERS)
    if (!raw) return []

    const json = JSON.parse(raw)
    const marketDeptOrderBook = json?.marketDeptOrderBook || {}
    const tradeInfo = marketDeptOrderBook?.tradeInfo || {}
    const secWiseDelPos = json?.securityWiseDP || {}

    // NSE sometimes returns historical delivery data in securityWiseDP
    const history: DeliveryDataPoint[] = []

    // Extract whatever we can from the trade info
    if (tradeInfo.totalTradedVolume) {
      const deliveryPct = parseFloat(secWiseDelPos.deliveryToTradedQuantity || '0')
      history.push({
        date: new Date().toISOString().split('T')[0],
        totalVolume: tradeInfo.totalTradedVolume || 0,
        deliveryVolume: tradeInfo.deliveredQuantity || Math.round((tradeInfo.totalTradedVolume || 0) * deliveryPct / 100),
        deliveryPct,
        closePrice: tradeInfo.lastPrice || 0,
        priceChange: tradeInfo.change || 0,
      })
    }

    return history
  } catch (err) {
    logger.warn(`Delivery: Trade info failed for ${symbol}`, { error: (err as Error).message })
    return []
  }
}

// ─── Analysis ───────────────────────────────────────────────────────────────

/**
 * Analyze delivery patterns from historical data.
 * If no history is provided, fetches current day's data.
 */
export async function analyzeDeliveryPattern(
  symbol: string,
  history?: DeliveryDataPoint[],
): Promise<DeliveryAnalysis> {
  // If no history provided, try fetching current data
  let data = history || []
  if (data.length === 0) {
    const current = await fetchDeliveryData(symbol)
    if (current) data = [current]
  }

  if (data.length === 0) {
    return {
      available: false,
      currentDeliveryPct: 0,
      avgDeliveryPct5d: 0,
      avgDeliveryPct20d: 0,
      deliveryTrend: 'FLAT',
      pattern: 'NEUTRAL',
      score: 0,
      signals: ['Delivery data unavailable'],
      history: [],
    }
  }

  const signals: string[] = []
  let score = 0

  // Current delivery %
  const latest = data[0]
  const currentPct = latest.deliveryPct

  // Calculate averages
  const last5 = data.slice(0, 5)
  const last20 = data.slice(0, 20)
  const avg5d = last5.length > 0 ? last5.reduce((s, d) => s + d.deliveryPct, 0) / last5.length : currentPct
  const avg20d = last20.length > 0 ? last20.reduce((s, d) => s + d.deliveryPct, 0) / last20.length : currentPct

  // Delivery trend (compare first half vs second half of last 10 days)
  let deliveryTrend: DeliveryAnalysis['deliveryTrend'] = 'FLAT'
  if (data.length >= 6) {
    const recentAvg = data.slice(0, 3).reduce((s, d) => s + d.deliveryPct, 0) / 3
    const olderAvg = data.slice(3, 6).reduce((s, d) => s + d.deliveryPct, 0) / 3
    if (recentAvg > olderAvg * 1.15) deliveryTrend = 'RISING'
    else if (recentAvg < olderAvg * 0.85) deliveryTrend = 'FALLING'
  }

  // Price trend (latest data)
  const priceChange = latest.priceChange

  // ─── Pattern Detection ────────────────────────────────────────────

  let pattern: DeliveryPattern = 'NEUTRAL'

  // 1. GENUINE buying: High delivery + price up
  if (currentPct > 65 && priceChange > 0.5) {
    pattern = 'GENUINE'
    score += 20
    signals.push(`GENUINE buying: ${currentPct.toFixed(0)}% delivery with +${priceChange.toFixed(1)}% price. Institutions are buying for keeps, not trading.`)
  }
  // 2. SPECULATIVE rally: Low delivery + big price move
  else if (currentPct < 35 && Math.abs(priceChange) > 2) {
    pattern = 'SPECULATIVE'
    score -= 15
    signals.push(`SPECULATIVE move: Only ${currentPct.toFixed(0)}% delivery on ${priceChange.toFixed(1)}% price move. Day traders driving this — likely to reverse.`)
  }
  // 3. ACCUMULATION: Rising delivery + flat/down price (consolidation)
  else if (deliveryTrend === 'RISING' && Math.abs(priceChange) < 1.5) {
    pattern = 'ACCUMULATION'
    score += 25
    signals.push(`ACCUMULATION detected: Delivery rising to ${currentPct.toFixed(0)}% while price consolidates. Smart money quietly building positions.`)
  }
  // 4. DISTRIBUTION: Falling delivery + price up
  else if (deliveryTrend === 'FALLING' && priceChange > 1) {
    pattern = 'DISTRIBUTION'
    score -= 20
    signals.push(`DISTRIBUTION warning: Delivery falling to ${currentPct.toFixed(0)}% despite +${priceChange.toFixed(1)}% price rise. Smart money may be exiting into retail buying.`)
  }

  // Additional delivery-based signals
  if (currentPct > 80) {
    score += 10
    signals.push(`Very high delivery ${currentPct.toFixed(0)}% — almost all trades are for delivery, not intraday. Strong institutional interest.`)
  } else if (currentPct < 25) {
    score -= 10
    signals.push(`Very low delivery ${currentPct.toFixed(0)}% — mostly intraday/speculative trading. No conviction.`)
  }

  // Delivery vs average comparison
  if (currentPct > avg20d * 1.3 && avg20d > 0) {
    score += 8
    signals.push(`Delivery ${currentPct.toFixed(0)}% is ${((currentPct / avg20d - 1) * 100).toFixed(0)}% above 20-day average (${avg20d.toFixed(0)}%) — unusual institutional activity.`)
  } else if (currentPct < avg20d * 0.7 && avg20d > 0) {
    score -= 8
    signals.push(`Delivery ${currentPct.toFixed(0)}% is ${((1 - currentPct / avg20d) * 100).toFixed(0)}% below 20-day average (${avg20d.toFixed(0)}%) — institutions stepping back.`)
  }

  // Standard deviation spike detection (if enough data)
  if (data.length >= 10) {
    const pcts = data.slice(0, 20).map(d => d.deliveryPct)
    const mean = pcts.reduce((s, p) => s + p, 0) / pcts.length
    const variance = pcts.reduce((s, p) => s + (p - mean) ** 2, 0) / pcts.length
    const stdDev = Math.sqrt(variance)

    if (stdDev > 0 && currentPct > mean + 2 * stdDev) {
      score += 12
      signals.push(`DELIVERY SPIKE: ${currentPct.toFixed(0)}% is >2σ above mean (${mean.toFixed(0)}%±${stdDev.toFixed(0)}%). Something big is happening — institutions are loading up.`)
    }
  }

  // Cap score
  score = Math.max(-30, Math.min(30, score))

  return {
    available: true,
    currentDeliveryPct: Math.round(currentPct * 10) / 10,
    avgDeliveryPct5d: Math.round(avg5d * 10) / 10,
    avgDeliveryPct20d: Math.round(avg20d * 10) / 10,
    deliveryTrend,
    pattern,
    score,
    signals,
    history: data.slice(0, 20),
  }
}
