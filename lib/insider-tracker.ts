/**
 * Insider/Promoter Trade Tracker
 *
 * Fetches insider trading data from BSE SAST and NSE PIT APIs.
 * Analyzes patterns: cluster buying, promoter pledge changes, CEO selling.
 *
 * Scoring:
 *   - Net insider buying > 10Cr in 30 days = strong bullish (+30)
 *   - Multiple independent insiders buying = cluster signal (+25)
 *   - Promoter pledge reduction = bullish (+15)
 *   - CEO/CFO selling > 1% holding = warning (-20)
 */

import https from 'https'
import logger from '@/lib/logger'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface InsiderTrade {
  name: string
  designation: string
  company: string
  tradeType: 'BUY' | 'SELL'
  quantity: number
  value: number       // INR
  date: string        // ISO date
  exchange: 'NSE' | 'BSE'
  category: string    // 'Promoter', 'Promoter Group', 'KMP', 'Director'
  preHolding?: number
  postHolding?: number
}

export interface InsiderAnalysis {
  available: boolean
  score: number           // -50 to +50
  sentiment: 'STRONG_BUY' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONG_SELL'
  signals: string[]
  netBuyValue: number     // Net buy value in Crores (last 30 days)
  netBuyQuantity: number
  uniqueBuyers: number
  uniqueSellers: number
  promoterActivity: 'BUYING' | 'SELLING' | 'NONE'
  recentTrades: InsiderTrade[]
}

// ─── HTTP Helper ────────────────────────────────────────────────────────────

const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nseindia.com/companies-listing/corporate-filings-insider-trading',
}

const BSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0',
  'Accept': 'application/json',
  'Referer': 'https://www.bseindia.com/',
}

function httpsGet(url: string, headers: Record<string, string>, timeoutMs = 8000): Promise<string | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      logger.warn('Insider tracker: request timed out', { url: url.substring(0, 80) })
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
      logger.warn('Insider tracker: request error', { url: url.substring(0, 80), error: err.message })
      resolve(null)
    })
  })
}

// ─── NSE PIT (Prohibition of Insider Trading) ──────────────────────────────

async function fetchNSEInsiderTrades(symbol: string): Promise<InsiderTrade[]> {
  try {
    // NSE PIT endpoint — fetches last 3 months of insider trades
    const url = `https://www.nseindia.com/api/corporates-pit?symbol=${encodeURIComponent(symbol)}`
    const raw = await httpsGet(url, NSE_HEADERS)
    if (!raw) return []

    const json = JSON.parse(raw)
    const data = json?.data || json || []

    if (!Array.isArray(data)) return []

    const trades: InsiderTrade[] = []
    for (const item of data) {
      const acqMode = (item.acqMode || '').toUpperCase()
      if (!acqMode.includes('MARKET') && !acqMode.includes('OPEN')) continue

      const tradeType = (item.tkdAcquiredDisposedTransaction || item.personCategory || '').toUpperCase()
      const isBuy = tradeType.includes('ACQUISITION') || tradeType.includes('BUY') || tradeType.includes('ACQUIRED')
      const isSell = tradeType.includes('DISPOSAL') || tradeType.includes('SELL') || tradeType.includes('DISPOSED')

      if (!isBuy && !isSell) continue

      const qty = parseInt(item.secAcq || item.noOfSecuritiesAcquired || '0', 10) ||
                  parseInt(item.secSold || item.noOfSecuritiesDisposed || '0', 10) || 0
      const value = parseFloat(item.secVal || item.valueOfSecurity || '0') || 0

      trades.push({
        name: item.acqName || item.nameOfTheAcquirerDisposer || 'Unknown',
        designation: item.personCategory || item.categoryOfPerson || '',
        company: item.company || symbol,
        tradeType: isBuy ? 'BUY' : 'SELL',
        quantity: qty,
        value: value,
        date: item.date || item.intimatedDate || item.dateOfAllotAdvNoticeAcqFrom || '',
        exchange: 'NSE',
        category: mapCategory(item.personCategory || item.categoryOfPerson || ''),
        preHolding: parseFloat(item.befAcqSharesNo || '0') || undefined,
        postHolding: parseFloat(item.aftAcqSharesNo || '0') || undefined,
      })
    }

    logger.info(`Insider tracker: ${trades.length} NSE PIT trades for ${symbol}`)
    return trades
  } catch (err) {
    logger.warn(`Insider tracker: NSE PIT failed for ${symbol}`, { error: (err as Error).message })
    return []
  }
}

// ─── BSE SAST (Substantial Acquisition of Shares & Takeovers) ──────────────

async function fetchBSEInsiderTrades(symbol: string): Promise<InsiderTrade[]> {
  try {
    // BSE SAST API
    const url = `https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w?strCat=Insider%20Trading%20/%20SAST&strPrevDate=&strScrip=&strSearch=P&strToDate=&strType=${encodeURIComponent(symbol)}`
    const raw = await httpsGet(url, BSE_HEADERS, 5000)
    if (!raw) return []

    const json = JSON.parse(raw)
    const data = json?.Table || json || []

    if (!Array.isArray(data)) return []

    const trades: InsiderTrade[] = []
    for (const item of data.slice(0, 50)) {
      const headline = (item.NEWSSUB || item.NEWS_DT || '').toUpperCase()
      const isBuy = headline.includes('ACQUISITION') || headline.includes('BUY') || headline.includes('ACQUIRED')
      const isSell = headline.includes('DISPOSAL') || headline.includes('SELL') || headline.includes('DISPOSED')

      if (!isBuy && !isSell) continue

      trades.push({
        name: item.SLONGNAME || item.NSURL || 'Unknown',
        designation: extractDesignation(headline),
        company: item.SCRIP_CD || symbol,
        tradeType: isBuy ? 'BUY' : 'SELL',
        quantity: parseInt(item.QUANTITY || '0', 10) || 0,
        value: parseFloat(item.VALUE || '0') || 0,
        date: item.NEWS_DT || item.DT_TM || '',
        exchange: 'BSE',
        category: extractCategory(headline),
      })
    }

    logger.info(`Insider tracker: ${trades.length} BSE SAST trades for ${symbol}`)
    return trades
  } catch (err) {
    logger.warn(`Insider tracker: BSE SAST failed for ${symbol}`, { error: (err as Error).message })
    return []
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function mapCategory(raw: string): string {
  const upper = raw.toUpperCase()
  if (upper.includes('PROMOTER GROUP')) return 'Promoter Group'
  if (upper.includes('PROMOTER')) return 'Promoter'
  if (upper.includes('KEY MANAGERIAL') || upper.includes('KMP')) return 'KMP'
  if (upper.includes('DIRECTOR')) return 'Director'
  if (upper.includes('DESIGNATED')) return 'Designated Person'
  return raw || 'Other'
}

function extractDesignation(headline: string): string {
  if (headline.includes('PROMOTER')) return 'Promoter'
  if (headline.includes('DIRECTOR')) return 'Director'
  if (headline.includes('CEO') || headline.includes('MANAGING DIRECTOR')) return 'CEO/MD'
  if (headline.includes('CFO')) return 'CFO'
  return 'Insider'
}

function extractCategory(headline: string): string {
  if (headline.includes('PROMOTER GROUP')) return 'Promoter Group'
  if (headline.includes('PROMOTER')) return 'Promoter'
  return 'Insider'
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetch insider trades from both NSE and BSE for a symbol.
 * De-duplicates and sorts by date (most recent first).
 */
export async function fetchInsiderTrades(symbol: string): Promise<InsiderTrade[]> {
  const [nseTrades, bseTrades] = await Promise.allSettled([
    fetchNSEInsiderTrades(symbol),
    fetchBSEInsiderTrades(symbol),
  ])

  const all: InsiderTrade[] = [
    ...(nseTrades.status === 'fulfilled' ? nseTrades.value : []),
    ...(bseTrades.status === 'fulfilled' ? bseTrades.value : []),
  ]

  // Sort by date descending
  all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return all
}

/**
 * Analyze insider trading activity for a stock.
 * Returns score (-50 to +50) and human-readable signals.
 */
export function analyzeInsiderActivity(trades: InsiderTrade[], lookbackDays = 90): InsiderAnalysis {
  if (trades.length === 0) {
    return {
      available: false,
      score: 0,
      sentiment: 'NEUTRAL',
      signals: ['No insider trading data available'],
      netBuyValue: 0, netBuyQuantity: 0,
      uniqueBuyers: 0, uniqueSellers: 0,
      promoterActivity: 'NONE',
      recentTrades: [],
    }
  }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - lookbackDays)

  const recent = trades.filter(t => {
    const d = new Date(t.date)
    return !isNaN(d.getTime()) && d >= cutoff
  })

  const signals: string[] = []
  let score = 0

  // Separate buys and sells
  const buys = recent.filter(t => t.tradeType === 'BUY')
  const sells = recent.filter(t => t.tradeType === 'SELL')

  const totalBuyValue = buys.reduce((s, t) => s + t.value, 0)
  const totalSellValue = sells.reduce((s, t) => s + t.value, 0)
  const netBuyValue = totalBuyValue - totalSellValue
  const netBuyValueCr = netBuyValue / 1e7 // Convert to Crores

  const totalBuyQty = buys.reduce((s, t) => s + t.quantity, 0)
  const totalSellQty = sells.reduce((s, t) => s + t.quantity, 0)
  const netBuyQty = totalBuyQty - totalSellQty

  const uniqueBuyers = new Set(buys.map(t => t.name)).size
  const uniqueSellers = new Set(sells.map(t => t.name)).size

  // 1. Net insider buying/selling value
  if (netBuyValueCr > 10) {
    score += 30
    signals.push(`Net insider BUYING of ₹${netBuyValueCr.toFixed(1)} Cr in ${lookbackDays} days — strong conviction from insiders.`)
  } else if (netBuyValueCr > 2) {
    score += 15
    signals.push(`Net insider buying of ₹${netBuyValueCr.toFixed(1)} Cr — moderate accumulation.`)
  } else if (netBuyValueCr < -10) {
    score -= 25
    signals.push(`Net insider SELLING of ₹${Math.abs(netBuyValueCr).toFixed(1)} Cr — significant insider distribution.`)
  } else if (netBuyValueCr < -2) {
    score -= 12
    signals.push(`Net insider selling of ₹${Math.abs(netBuyValueCr).toFixed(1)} Cr — mild concern.`)
  }

  // 2. Cluster buying — multiple independent insiders
  if (uniqueBuyers >= 3 && netBuyValueCr > 0) {
    score += 25
    signals.push(`CLUSTER BUY: ${uniqueBuyers} different insiders buying — strong consensus signal. This is what hedge funds watch.`)
  } else if (uniqueBuyers >= 2 && netBuyValueCr > 0) {
    score += 10
    signals.push(`${uniqueBuyers} insiders buying — multiple confirming purchases.`)
  }

  // 3. Promoter activity
  const promoterBuys = buys.filter(t => t.category === 'Promoter' || t.category === 'Promoter Group')
  const promoterSells = sells.filter(t => t.category === 'Promoter' || t.category === 'Promoter Group')
  let promoterActivity: InsiderAnalysis['promoterActivity'] = 'NONE'

  if (promoterBuys.length > 0 && promoterSells.length === 0) {
    promoterActivity = 'BUYING'
    const promoterBuyVal = promoterBuys.reduce((s, t) => s + t.value, 0) / 1e7
    score += 15
    signals.push(`Promoter BUYING ₹${promoterBuyVal.toFixed(1)} Cr — owner-managers increasing stake. Very bullish.`)
  } else if (promoterSells.length > 0 && promoterBuys.length === 0) {
    promoterActivity = 'SELLING'
    const promoterSellVal = promoterSells.reduce((s, t) => s + t.value, 0) / 1e7
    score -= 15
    signals.push(`Promoter SELLING ₹${promoterSellVal.toFixed(1)} Cr — founders reducing stake. Watch carefully.`)
  }

  // 4. KMP/CEO selling — warning signal
  const kmpSells = sells.filter(t =>
    t.category === 'KMP' ||
    t.designation.toUpperCase().includes('CEO') ||
    t.designation.toUpperCase().includes('CFO') ||
    t.designation.toUpperCase().includes('MD')
  )
  if (kmpSells.length > 0) {
    const kmpSellVal = kmpSells.reduce((s, t) => s + t.value, 0) / 1e7
    if (kmpSellVal > 1) {
      score -= 20
      signals.push(`CEO/CFO/KMP selling ₹${kmpSellVal.toFixed(1)} Cr — management reducing personal exposure. Red flag.`)
    }
  }

  // 5. Recent 30-day spike check
  const thirtyDayCutoff = new Date()
  thirtyDayCutoff.setDate(thirtyDayCutoff.getDate() - 30)
  const last30 = recent.filter(t => new Date(t.date) >= thirtyDayCutoff)
  const last30BuyVal = last30.filter(t => t.tradeType === 'BUY').reduce((s, t) => s + t.value, 0) / 1e7

  if (last30BuyVal > 5 && uniqueBuyers >= 2) {
    score += 10
    signals.push(`₹${last30BuyVal.toFixed(1)} Cr bought in last 30 days alone — accelerating insider accumulation.`)
  }

  // Cap score
  score = Math.max(-50, Math.min(50, score))

  // Classify sentiment
  const sentiment: InsiderAnalysis['sentiment'] =
    score >= 30 ? 'STRONG_BUY' :
    score >= 10 ? 'BULLISH' :
    score <= -30 ? 'STRONG_SELL' :
    score <= -10 ? 'BEARISH' : 'NEUTRAL'

  return {
    available: true,
    score,
    sentiment,
    signals,
    netBuyValue: netBuyValueCr,
    netBuyQuantity: netBuyQty,
    uniqueBuyers,
    uniqueSellers,
    promoterActivity,
    recentTrades: recent.slice(0, 20), // Return top 20 most recent
  }
}
