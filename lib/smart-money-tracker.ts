/**
 * 🐋 SMART MONEY TRACKER
 * 
 * Tracks institutional money flows to follow the "smart money":
 * - FII (Foreign Institutional Investors) flows
 * - DII (Domestic Institutional Investors) flows
 * - Bulk deals (large block trades)
 * - Block deals (negotiated large trades)
 * 
 * Why it matters:
 * - FII buying = bullish signal (foreign confidence)
 * - DII buying during FII selling = domestic support
 * - Bulk/Block deals show big player accumulation/distribution
 */

export interface FIIDIIData {
  date: string
  
  // FII (Foreign Institutional Investors)
  fiiBuyValue: number      // In Crores
  fiiSellValue: number     // In Crores
  fiiNetValue: number      // Buy - Sell
  
  // DII (Domestic Institutional Investors)
  diiBuyValue: number      // In Crores
  diiSellValue: number     // In Crores
  diiNetValue: number      // Buy - Sell
  
  // Combined
  totalNetValue: number    // FII + DII net
}

export interface BulkBlockDeal {
  date: string
  symbol: string
  clientName: string
  dealType: 'BULK' | 'BLOCK'
  buySell: 'BUY' | 'SELL'
  quantity: number
  price: number
  value: number  // In Crores
}

export interface SmartMoneyInsight {
  type: 'FII_BUYING' | 'FII_SELLING' | 'DII_BUYING' | 'DII_SELLING' | 
        'INSTITUTIONAL_ACCUMULATION' | 'INSTITUTIONAL_DISTRIBUTION' |
        'BULK_BUY' | 'BULK_SELL' | 'SMART_MONEY_DIVERGENCE'
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  title: string
  description: string
  value?: number
  symbol?: string
}

export interface SmartMoneyAnalysis {
  // Latest FII/DII data
  latestFIIDII: FIIDIIData | null
  
  // Trend analysis (last N days)
  fiiTrend: {
    direction: 'BUYING' | 'SELLING' | 'NEUTRAL'
    totalNet: number  // Total net over period
    avgDaily: number  // Average daily net
    consecutiveDays: number  // Days in same direction
  }
  
  diiTrend: {
    direction: 'BUYING' | 'SELLING' | 'NEUTRAL'
    totalNet: number
    avgDaily: number
    consecutiveDays: number
  }
  
  // Recent bulk/block deals
  recentDeals: BulkBlockDeal[]
  
  // Key insights
  insights: SmartMoneyInsight[]
  
  // Overall signal
  overallSignal: 'STRONG_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONG_BEARISH'
  confidence: number
  
  // Metadata
  dataSource: string
  analyzedAt: Date
  periodDays: number
}

/**
 * Analyze FII/DII trend from historical data
 */
function analyzeFIIDIITrend(
  data: FIIDIIData[],
  type: 'FII' | 'DII'
): SmartMoneyAnalysis['fiiTrend'] {
  if (data.length === 0) {
    return { direction: 'NEUTRAL', totalNet: 0, avgDaily: 0, consecutiveDays: 0 }
  }
  
  const netValues = data.map(d => type === 'FII' ? d.fiiNetValue : d.diiNetValue)
  const totalNet = netValues.reduce((a, b) => a + b, 0)
  const avgDaily = totalNet / data.length
  
  // Count consecutive days in same direction
  let consecutiveDays = 1
  const lastDirection = netValues[0] >= 0 ? 'BUYING' : 'SELLING'
  
  for (let i = 1; i < netValues.length; i++) {
    const currentDirection = netValues[i] >= 0 ? 'BUYING' : 'SELLING'
    if (currentDirection === lastDirection) {
      consecutiveDays++
    } else {
      break
    }
  }
  
  // Determine overall direction
  let direction: 'BUYING' | 'SELLING' | 'NEUTRAL'
  if (totalNet > 500) {
    direction = 'BUYING'
  } else if (totalNet < -500) {
    direction = 'SELLING'
  } else {
    direction = 'NEUTRAL'
  }
  
  return { direction, totalNet, avgDaily, consecutiveDays }
}

/**
 * Generate insights from smart money data
 */
function generateInsights(
  fiiTrend: SmartMoneyAnalysis['fiiTrend'],
  diiTrend: SmartMoneyAnalysis['diiTrend'],
  latestFIIDII: FIIDIIData | null,
  recentDeals: BulkBlockDeal[]
): SmartMoneyInsight[] {
  const insights: SmartMoneyInsight[] = []
  
  // FII insights
  if (fiiTrend.direction === 'BUYING' && fiiTrend.totalNet > 2000) {
    insights.push({
      type: 'FII_BUYING',
      severity: 'HIGH',
      title: '🌍 Strong FII Buying',
      description: `FIIs have been net buyers of ₹${Math.abs(fiiTrend.totalNet).toLocaleString()} Cr. Foreign confidence is high.`,
      value: fiiTrend.totalNet
    })
  } else if (fiiTrend.direction === 'SELLING' && fiiTrend.totalNet < -2000) {
    insights.push({
      type: 'FII_SELLING',
      severity: 'HIGH',
      title: '⚠️ Heavy FII Selling',
      description: `FIIs have been net sellers of ₹${Math.abs(fiiTrend.totalNet).toLocaleString()} Cr. Foreign money is exiting.`,
      value: fiiTrend.totalNet
    })
  }
  
  // DII insights
  if (diiTrend.direction === 'BUYING' && diiTrend.totalNet > 2000) {
    insights.push({
      type: 'DII_BUYING',
      severity: 'MEDIUM',
      title: '🏠 Strong DII Support',
      description: `DIIs have been net buyers of ₹${Math.abs(diiTrend.totalNet).toLocaleString()} Cr. Domestic institutions are accumulating.`,
      value: diiTrend.totalNet
    })
  }
  
  // Divergence insight (FII selling but DII buying = potential bottom)
  if (fiiTrend.direction === 'SELLING' && diiTrend.direction === 'BUYING') {
    insights.push({
      type: 'SMART_MONEY_DIVERGENCE',
      severity: 'HIGH',
      title: '🔄 FII/DII Divergence',
      description: 'FIIs are selling but DIIs are buying. Domestic institutions see value. Potential accumulation zone.',
      value: diiTrend.totalNet - fiiTrend.totalNet
    })
  }
  
  // Both buying = strong bullish
  if (fiiTrend.direction === 'BUYING' && diiTrend.direction === 'BUYING') {
    insights.push({
      type: 'INSTITUTIONAL_ACCUMULATION',
      severity: 'HIGH',
      title: '🚀 Institutional Accumulation',
      description: 'Both FIIs and DIIs are net buyers. Strong institutional support for markets.',
      value: fiiTrend.totalNet + diiTrend.totalNet
    })
  }
  
  // Both selling = bearish
  if (fiiTrend.direction === 'SELLING' && diiTrend.direction === 'SELLING') {
    insights.push({
      type: 'INSTITUTIONAL_DISTRIBUTION',
      severity: 'HIGH',
      title: '🔻 Institutional Distribution',
      description: 'Both FIIs and DIIs are net sellers. Institutions are reducing exposure.',
      value: fiiTrend.totalNet + diiTrend.totalNet
    })
  }
  
  // Large bulk deals
  const largeBuys = recentDeals.filter(d => d.buySell === 'BUY' && d.value > 50)
  const largeSells = recentDeals.filter(d => d.buySell === 'SELL' && d.value > 50)
  
  if (largeBuys.length > 0) {
    const topBuy = largeBuys[0]
    insights.push({
      type: 'BULK_BUY',
      severity: 'MEDIUM',
      title: `🐋 Large Bulk Buy: ${topBuy.symbol}`,
      description: `${topBuy.clientName} bought ₹${topBuy.value.toFixed(0)} Cr worth at ₹${topBuy.price}`,
      value: topBuy.value,
      symbol: topBuy.symbol
    })
  }
  
  if (largeSells.length > 0) {
    const topSell = largeSells[0]
    insights.push({
      type: 'BULK_SELL',
      severity: 'MEDIUM',
      title: `⚠️ Large Bulk Sell: ${topSell.symbol}`,
      description: `${topSell.clientName} sold ₹${topSell.value.toFixed(0)} Cr worth at ₹${topSell.price}`,
      value: topSell.value,
      symbol: topSell.symbol
    })
  }
  
  return insights
}

/**
 * Determine overall signal from smart money analysis
 */
function determineOverallSignal(
  fiiTrend: SmartMoneyAnalysis['fiiTrend'],
  diiTrend: SmartMoneyAnalysis['diiTrend']
): { signal: SmartMoneyAnalysis['overallSignal']; confidence: number } {
  let score = 0
  
  // FII weight (higher because foreign flows are more impactful)
  if (fiiTrend.direction === 'BUYING') {
    score += fiiTrend.totalNet > 3000 ? 40 : 25
  } else if (fiiTrend.direction === 'SELLING') {
    score -= fiiTrend.totalNet < -3000 ? 40 : 25
  }
  
  // DII weight
  if (diiTrend.direction === 'BUYING') {
    score += diiTrend.totalNet > 2000 ? 25 : 15
  } else if (diiTrend.direction === 'SELLING') {
    score -= diiTrend.totalNet < -2000 ? 25 : 15
  }
  
  // Consecutive days bonus
  if (fiiTrend.consecutiveDays >= 5) {
    score += fiiTrend.direction === 'BUYING' ? 10 : -10
  }
  
  let signal: SmartMoneyAnalysis['overallSignal']
  if (score >= 50) signal = 'STRONG_BULLISH'
  else if (score >= 20) signal = 'BULLISH'
  else if (score <= -50) signal = 'STRONG_BEARISH'
  else if (score <= -20) signal = 'BEARISH'
  else signal = 'NEUTRAL'
  
  const confidence = Math.min(95, 50 + Math.abs(score))
  
  return { signal, confidence }
}

/**
 * Main analysis function
 */
export function analyzeSmartMoney(
  fiidiiHistory: FIIDIIData[],
  bulkBlockDeals: BulkBlockDeal[]
): SmartMoneyAnalysis {
  // Analyze trends
  const fiiTrend = analyzeFIIDIITrend(fiidiiHistory, 'FII')
  const diiTrend = analyzeFIIDIITrend(fiidiiHistory, 'DII')
  
  // Get latest data
  const latestFIIDII = fiidiiHistory.length > 0 ? fiidiiHistory[0] : null
  
  // Sort deals by value (descending)
  const recentDeals = [...bulkBlockDeals]
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
  
  // Generate insights
  const insights = generateInsights(fiiTrend, diiTrend, latestFIIDII, recentDeals)
  
  // Determine overall signal
  const { signal, confidence } = determineOverallSignal(fiiTrend, diiTrend)
  
  return {
    latestFIIDII,
    fiiTrend,
    diiTrend,
    recentDeals,
    insights,
    overallSignal: signal,
    confidence,
    dataSource: 'NSE/BSE',
    analyzedAt: new Date(),
    periodDays: fiidiiHistory.length
  }
}

/**
 * Get signal color for UI
 */
export function getSmartMoneySignalColor(signal: SmartMoneyAnalysis['overallSignal']): string {
  switch (signal) {
    case 'STRONG_BULLISH': return '#10B981'
    case 'BULLISH': return '#34D399'
    case 'NEUTRAL': return '#F59E0B'
    case 'BEARISH': return '#F87171'
    case 'STRONG_BEARISH': return '#EF4444'
  }
}

/**
 * Get signal emoji
 */
export function getSmartMoneyEmoji(signal: SmartMoneyAnalysis['overallSignal']): string {
  switch (signal) {
    case 'STRONG_BULLISH': return '🐋🚀'
    case 'BULLISH': return '🐋📈'
    case 'NEUTRAL': return '🐋↔️'
    case 'BEARISH': return '🐋📉'
    case 'STRONG_BEARISH': return '🐋🔻'
  }
}

// ─── Data Fetching (shared by API route + dashboard) ─────────────────────────

import https from 'https'
import logger from '@/lib/logger'

/**
 * Fetch FII/DII data from NSE.
 * NSE returns separate records for FII and DII that we need to combine by date.
 */
export async function fetchFIIDIIData(): Promise<FIIDIIData[]> {
  return new Promise((resolve) => {
    const url = 'https://www.nseindia.com/api/fiidiiTradeReact'

    const timeout = setTimeout(() => {
      logger.warn('NSE FII/DII request timed out')
      resolve([])
    }, 8000)

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.nseindia.com/reports/fii-dii'
      }
    }

    const req = https.get(url, options, (res) => {
      let data = ''
      res.on('data', (chunk: string) => data += chunk)
      res.on('end', () => {
        clearTimeout(timeout)
        try {
          const json = JSON.parse(data)
          if (Array.isArray(json) && json.length > 0) {
            const dateMap = new Map<string, FIIDIIData>()

            for (const item of json) {
              const date = item.date || new Date().toISOString().split('T')[0]
              const category = (item.category || '').toUpperCase()

              if (!dateMap.has(date)) {
                dateMap.set(date, {
                  date,
                  fiiBuyValue: 0, fiiSellValue: 0, fiiNetValue: 0,
                  diiBuyValue: 0, diiSellValue: 0, diiNetValue: 0,
                  totalNetValue: 0
                })
              }

              const record = dateMap.get(date)!
              const buyValue = parseFloat(item.buyValue || item.BuyValue || 0)
              const sellValue = parseFloat(item.sellValue || item.SellValue || 0)
              const netValue = parseFloat(item.netValue || item.NetValue || 0)

              if (category.includes('FII') || category.includes('FPI')) {
                record.fiiBuyValue = buyValue
                record.fiiSellValue = sellValue
                record.fiiNetValue = netValue
              } else if (category.includes('DII')) {
                record.diiBuyValue = buyValue
                record.diiSellValue = sellValue
                record.diiNetValue = netValue
              }

              record.totalNetValue = record.fiiNetValue + record.diiNetValue
            }

            const parsed = Array.from(dateMap.values())
            logger.info('Parsed FII/DII records from NSE', { count: parsed.length })
            resolve(parsed)
          } else {
            logger.warn('NSE returned empty or invalid FII/DII data')
            resolve([])
          }
        } catch (e: any) {
          logger.warn('Failed to parse NSE FII/DII data', { error: e.message })
          resolve([])
        }
      })
    })

    req.on('error', (err: Error) => {
      clearTimeout(timeout)
      logger.warn('NSE FII/DII request error', { error: err.message })
      resolve([])
    })
  })
}

/**
 * Fetch bulk/block deals from BSE.
 */
export async function fetchBulkDeals(): Promise<BulkBlockDeal[]> {
  return new Promise((resolve) => {
    const today = new Date()
    const fromDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)

    const formatDate = (d: Date) => d.toISOString().split('T')[0].split('-').reverse().join('/')

    const url = `https://api.bseindia.com/BseIndiaAPI/api/BulkDealData/w?pageNo=1&strFromDate=${formatDate(fromDate)}&strToDate=${formatDate(today)}`

    const timeout = setTimeout(() => {
      logger.warn('BSE bulk deals request timed out')
      resolve([])
    }, 5000)

    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
        'Referer': 'https://www.bseindia.com/'
      }
    }, (res) => {
      let data = ''
      res.on('data', (chunk: string) => data += chunk)
      res.on('end', () => {
        clearTimeout(timeout)
        try {
          const json = JSON.parse(data)
          if (json.Table && Array.isArray(json.Table)) {
            const deals: BulkBlockDeal[] = json.Table.slice(0, 20).map((item: any) => ({
              date: item.DT_TM || item.TRADE_DT || new Date().toISOString().split('T')[0],
              symbol: item.SCRIP_CD || item.Symbol || 'UNKNOWN',
              clientName: item.CLIENTNAME || item.Client || 'Institutional Investor',
              dealType: 'BULK' as const,
              buySell: (item.BUYSELL || item.Action || 'B').toUpperCase().startsWith('B') ? 'BUY' as const : 'SELL' as const,
              quantity: parseInt(item.QTY || item.Qty || 0),
              price: parseFloat(item.RATE || item.Rate || 0),
              value: parseFloat(item.VALUE || item.Value || 0) / 10000000
            }))
            resolve(deals)
          } else {
            resolve([])
          }
        } catch {
          resolve([])
        }
      })
    })

    req.on('error', () => {
      clearTimeout(timeout)
      resolve([])
    })
  })
}

/**
 * Generate sample FII/DII data when real data unavailable.
 */
export function generateSampleFIIDIIData(): FIIDIIData[] {
  const data: FIIDIIData[] = []
  const today = new Date()

  const patterns = [
    { fiNet: 1200, diiNet: -400 },
    { fiNet: -800, diiNet: 1500 },
    { fiNet: 2500, diiNet: 800 },
    { fiNet: -1500, diiNet: 2000 },
    { fiNet: 500, diiNet: 300 },
    { fiNet: -2000, diiNet: 1800 },
    { fiNet: 1800, diiNet: 500 },
    { fiNet: -500, diiNet: -200 },
    { fiNet: 3000, diiNet: 1000 },
    { fiNet: -1200, diiNet: 800 },
  ]

  for (let i = 0; i < 10; i++) {
    const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000)
    const pattern = patterns[i]
    const fiiNet = pattern.fiNet + (Math.random() - 0.5) * 400
    const diiNet = pattern.diiNet + (Math.random() - 0.5) * 300

    data.push({
      date: date.toISOString().split('T')[0],
      fiiBuyValue: fiiNet > 0 ? Math.abs(fiiNet) + 5000 : 5000,
      fiiSellValue: fiiNet > 0 ? 5000 : Math.abs(fiiNet) + 5000,
      fiiNetValue: fiiNet,
      diiBuyValue: diiNet > 0 ? Math.abs(diiNet) + 3000 : 3000,
      diiSellValue: diiNet > 0 ? 3000 : Math.abs(diiNet) + 3000,
      diiNetValue: diiNet,
      totalNetValue: fiiNet + diiNet
    })
  }

  return data
}
