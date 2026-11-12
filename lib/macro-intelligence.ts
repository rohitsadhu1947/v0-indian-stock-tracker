/**
 * 🌍 GLOBAL MACRO INTELLIGENCE
 *
 * Fetches and analyzes global macro indicators that impact Indian markets:
 * - US Markets (S&P 500, Dow, Nasdaq)
 * - Commodities (Crude Oil, Gold)
 * - Currency (USD/INR)
 * - Volatility (India VIX)
 * - Asian Markets (Nikkei, Hang Seng)
 * - US Yields (10Y Treasury)
 *
 * Uses Yahoo Finance chart API.
 * Results cached for 5 minutes.
 */

import https from 'https'
import { MACRO_IMPACT_MAP, getSectorInfo } from './sector-mapping'

// ============================================================================
// TYPES
// ============================================================================

export interface MacroSnapshot {
  timestamp: Date
  usMarket: {
    sp500: number
    sp500Change: number
    dow: number
    dowChange: number
    nasdaq: number
    nasdaqChange: number
    direction: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL'
  }
  commodities: {
    crudePrice: number
    crudeChange: number
    crudePrevClose: number
    crudeLabel: 'Brent' | 'WTI'
    wtiPrice: number
    wtiChange: number
    brentPrice: number
    brentChange: number
    goldPrice: number
    goldChange: number
    goldPrevClose: number
  }
  currency: {
    usdInr: number
    usdInrChange: number
    usdInrPrevClose: number
    trend: 'STRENGTHENING' | 'WEAKENING' | 'STABLE'  // INR perspective
  }
  volatility: {
    indiaVix: number
    indiaVixChange: number
    vixTrend: 'RISING' | 'FALLING' | 'STABLE'
    riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME'
  }
  asianMarkets: {
    nikkei: number
    nikkeiChange: number
    hangSeng: number
    hangSengChange: number
    direction: 'RISK_ON' | 'RISK_OFF' | 'MIXED'
  }
  yields: {
    us10y: number
    us10yChange: number
  }
  overallSentiment: 'STRONGLY_RISK_ON' | 'RISK_ON' | 'NEUTRAL' | 'RISK_OFF' | 'STRONGLY_RISK_OFF'
  sentimentScore: number // -100 to +100
  sectorImpacts: Record<string, number> // sector name → impact score (-100 to +100)
  summary: string // Human-readable summary
  fetchErrors: string[] // Track which indicators failed to fetch
}

// ============================================================================
// YAHOO FINANCE FETCHER
// ============================================================================

interface YahooQuoteResult {
  price: number
  previousClose: number
  change: number
  changePercent: number
  name: string
}

/**
 * Fetch a single quote from Yahoo Finance chart API
 */
function fetchYahooQuote(symbol: string): Promise<YahooQuoteResult | null> {
  return new Promise((resolve) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`

    const timeout = setTimeout(() => {
      resolve(null)
    }, 8000) // 8s timeout

    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' } }, (res) => {
      let data = ''
      res.on('data', (chunk: string) => data += chunk)
      res.on('end', () => {
        clearTimeout(timeout)
        try {
          const json = JSON.parse(data)
          const meta = json?.chart?.result?.[0]?.meta
          if (!meta) {
            resolve(null)
            return
          }

          const price = meta.regularMarketPrice || 0
          const previousClose = meta.chartPreviousClose || meta.previousClose || price
          const change = price - previousClose
          const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0

          resolve({
            price,
            previousClose,
            change,
            changePercent,
            name: meta.shortName || meta.longName || symbol,
          })
        } catch {
          resolve(null)
        }
      })
    })

    req.on('error', () => {
      clearTimeout(timeout)
      resolve(null)
    })
  })
}

// ============================================================================
// CACHE
// ============================================================================

let cachedSnapshot: MacroSnapshot | null = null
let cacheTimestamp: number = 0
const CACHE_TTL = 2 * 60 * 1000 // 2 minutes (markets move fast)

// ============================================================================
// MAIN FETCHER
// ============================================================================

/**
 * Fetch global macro snapshot.
 * Cached for 5 minutes. Returns cached data if fresh enough.
 */
export async function getMacroSnapshot(forceRefresh: boolean = false): Promise<MacroSnapshot> {
  const now = Date.now()

  // Return cache if fresh
  if (!forceRefresh && cachedSnapshot && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedSnapshot
  }

  console.log('🌍 Fetching global macro data...')
  const fetchErrors: string[] = []

  // Fetch all indicators in parallel (includes both WTI + Brent crude)
  const [
    sp500Result,
    dowResult,
    nasdaqResult,
    crudeResult,
    brentResult,
    goldResult,
    usdInrResult,
    vixResult,
    nikkeiResult,
    hangSengResult,
    us10yResult,
  ] = await Promise.all([
    fetchYahooQuote('^GSPC'),        // S&P 500
    fetchYahooQuote('^DJI'),         // Dow Jones
    fetchYahooQuote('^IXIC'),        // Nasdaq
    fetchYahooQuote('CL=F'),         // WTI Crude Oil Futures
    fetchYahooQuote('BZ=F'),         // Brent Crude Oil Futures
    fetchYahooQuote('GC=F'),         // Gold Futures
    fetchYahooQuote('USDINR=X'),     // USD/INR
    fetchYahooQuote('^INDIAVIX'),    // India VIX
    fetchYahooQuote('^N225'),        // Nikkei 225
    fetchYahooQuote('^HSI'),         // Hang Seng
    fetchYahooQuote('^TNX'),         // US 10Y Treasury Yield
  ])

  // Track errors
  if (!sp500Result) fetchErrors.push('S&P 500')
  if (!crudeResult && !brentResult) fetchErrors.push('Crude Oil')
  if (!usdInrResult) fetchErrors.push('USD/INR')
  if (!vixResult) fetchErrors.push('India VIX')

  // Build US Market
  const usMarket = {
    sp500: sp500Result?.price || 0,
    sp500Change: sp500Result?.changePercent || 0,
    dow: dowResult?.price || 0,
    dowChange: dowResult?.changePercent || 0,
    nasdaq: nasdaqResult?.price || 0,
    nasdaqChange: nasdaqResult?.changePercent || 0,
    direction: determineDirection([
      sp500Result?.changePercent || 0,
      dowResult?.changePercent || 0,
      nasdaqResult?.changePercent || 0,
    ]) as 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL',
  }

  // Build Commodities — prefer Brent (India imports Brent-linked crude), fallback to WTI
  const primaryCrude = brentResult || crudeResult
  const commodities = {
    crudePrice: primaryCrude?.price || 0,
    crudeChange: primaryCrude?.changePercent || 0,
    crudePrevClose: primaryCrude?.previousClose || 0,
    crudeLabel: (brentResult ? 'Brent' : 'WTI') as 'Brent' | 'WTI',
    // Also expose WTI separately
    wtiPrice: crudeResult?.price || 0,
    wtiChange: crudeResult?.changePercent || 0,
    brentPrice: brentResult?.price || 0,
    brentChange: brentResult?.changePercent || 0,
    goldPrice: goldResult?.price || 0,
    goldChange: goldResult?.changePercent || 0,
    goldPrevClose: goldResult?.previousClose || 0,
  }

  // Build Currency
  const usdInrChange = usdInrResult?.changePercent || 0
  const currency = {
    usdInr: usdInrResult?.price || 0,
    usdInrChange,
    usdInrPrevClose: usdInrResult?.previousClose || 0,
    // From INR perspective: USD going up = INR weakening
    trend: (Math.abs(usdInrChange) < 0.1 ? 'STABLE'
      : usdInrChange > 0 ? 'WEAKENING'
        : 'STRENGTHENING') as 'STRENGTHENING' | 'WEAKENING' | 'STABLE',
  }

  // Build Volatility
  const vixLevel = vixResult?.price || 15
  const vixChange = vixResult?.changePercent || 0
  const volatility = {
    indiaVix: vixLevel,
    indiaVixChange: vixChange,
    vixTrend: (Math.abs(vixChange) < 3 ? 'STABLE'
      : vixChange > 0 ? 'RISING'
        : 'FALLING') as 'RISING' | 'FALLING' | 'STABLE',
    riskLevel: (vixLevel > 30 ? 'EXTREME'
      : vixLevel > 20 ? 'HIGH'
        : vixLevel > 15 ? 'MODERATE'
          : 'LOW') as 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME',
  }

  // Build Asian Markets
  const asianMarkets = {
    nikkei: nikkeiResult?.price || 0,
    nikkeiChange: nikkeiResult?.changePercent || 0,
    hangSeng: hangSengResult?.price || 0,
    hangSengChange: hangSengResult?.changePercent || 0,
    direction: determineDirection([
      nikkeiResult?.changePercent || 0,
      hangSengResult?.changePercent || 0,
    ]) as 'RISK_ON' | 'RISK_OFF' | 'MIXED',
  }

  // Build Yields
  const yields = {
    us10y: us10yResult?.price || 0,
    us10yChange: us10yResult?.changePercent || 0,
  }

  // Calculate overall sentiment
  const { overallSentiment, sentimentScore } = calculateOverallSentiment(
    usMarket, commodities, currency, volatility, asianMarkets, yields
  )

  // Calculate sector impacts
  const sectorImpacts = calculateSectorImpacts(commodities, currency, volatility, yields)

  // Generate summary
  const summary = generateSummary(usMarket, commodities, currency, volatility, overallSentiment)

  const snapshot: MacroSnapshot = {
    timestamp: new Date(),
    usMarket,
    commodities,
    currency,
    volatility,
    asianMarkets,
    yields,
    overallSentiment,
    sentimentScore,
    sectorImpacts,
    summary,
    fetchErrors,
  }

  // Cache the result
  cachedSnapshot = snapshot
  cacheTimestamp = now

  console.log(`✅ Macro snapshot: ${overallSentiment} (score: ${sentimentScore})`)
  if (fetchErrors.length > 0) {
    console.log(`⚠️ Failed to fetch: ${fetchErrors.join(', ')}`)
  }

  return snapshot
}

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

function determineDirection(changes: number[]): string {
  const validChanges = changes.filter(c => c !== 0)
  if (validChanges.length === 0) return 'NEUTRAL'

  const avg = validChanges.reduce((a, b) => a + b, 0) / validChanges.length
  if (avg > 0.5) return 'RISK_ON'
  if (avg < -0.5) return 'RISK_OFF'
  return 'NEUTRAL'
}

function calculateOverallSentiment(
  usMarket: MacroSnapshot['usMarket'],
  commodities: MacroSnapshot['commodities'],
  currency: MacroSnapshot['currency'],
  volatility: MacroSnapshot['volatility'],
  asianMarkets: MacroSnapshot['asianMarkets'],
  yields: MacroSnapshot['yields'],
): { overallSentiment: MacroSnapshot['overallSentiment']; sentimentScore: number } {
  let score = 0

  // US Markets (weight: 30)
  score += Math.max(-30, Math.min(30, usMarket.sp500Change * 10))

  // Asian Markets (weight: 15)
  const asianAvg = (asianMarkets.nikkeiChange + asianMarkets.hangSengChange) / 2
  score += Math.max(-15, Math.min(15, asianAvg * 5))

  // Crude Oil (weight: 15) - Rising crude is BAD for India (net importer)
  score += Math.max(-15, Math.min(15, -commodities.crudeChange * 3))

  // VIX (weight: 20) - High/rising VIX is bearish
  // India VIX: <12 = calm, 12-15 = normal, 15-18 = elevated, 18-22 = high, >22 = very high, >30 = extreme
  if (volatility.indiaVix > 30) score -= 25
  else if (volatility.indiaVix > 22) score -= 18
  else if (volatility.indiaVix > 18) score -= 12
  else if (volatility.indiaVix > 15) score -= 6
  else if (volatility.indiaVix < 12) score += 10
  if (volatility.vixTrend === 'RISING') score -= 7
  if (volatility.vixTrend === 'FALLING') score += 5

  // USD/INR (weight: 10) - Weakening INR is slightly bearish
  if (currency.trend === 'WEAKENING' && Math.abs(currency.usdInrChange) > 0.3) score -= 8
  if (currency.trend === 'STRENGTHENING' && Math.abs(currency.usdInrChange) > 0.3) score += 5

  // US Yields (weight: 10) - Rising yields = risk-off
  if (yields.us10yChange > 2) score -= 8
  if (yields.us10yChange < -2) score += 5

  // Clamp to -100 to +100
  score = Math.max(-100, Math.min(100, score))

  let overallSentiment: MacroSnapshot['overallSentiment']
  if (score >= 40) overallSentiment = 'STRONGLY_RISK_ON'
  else if (score >= 15) overallSentiment = 'RISK_ON'
  else if (score <= -40) overallSentiment = 'STRONGLY_RISK_OFF'
  else if (score <= -15) overallSentiment = 'RISK_OFF'
  else overallSentiment = 'NEUTRAL'

  return { overallSentiment, sentimentScore: Math.round(score) }
}

/**
 * Calculate per-sector impact scores from macro data.
 * Uses MACRO_IMPACT_MAP from sector-mapping.ts.
 */
function calculateSectorImpacts(
  commodities: MacroSnapshot['commodities'],
  currency: MacroSnapshot['currency'],
  volatility: MacroSnapshot['volatility'],
  yields: MacroSnapshot['yields'],
): Record<string, number> {
  const impacts: Record<string, number> = {}

  // Crude Oil impact
  const crudeImpact = -commodities.crudeChange * 5 // Rising crude = negative for India
  const crudeAffected = MACRO_IMPACT_MAP['Crude Oil Prices'] || []
  for (const sector of crudeAffected) {
    impacts[sector] = (impacts[sector] || 0) + Math.max(-50, Math.min(50, crudeImpact))
  }
  // Positive for upstream oil (ONGC, Oil India) — override for Energy sector
  if (commodities.crudeChange > 2) {
    impacts['Energy (Upstream)'] = commodities.crudeChange * 8
  }

  // USD/INR impact
  const currencyImpact = currency.usdInrChange * 3 // Rupee weakening = positive for IT, negative for importers
  const currencyAffected = MACRO_IMPACT_MAP['USD-INR'] || []
  for (const sector of currencyAffected) {
    // IT and Pharma benefit from weak rupee, others hurt
    if (sector === 'IT' || sector === 'Healthcare') {
      impacts[sector] = (impacts[sector] || 0) + Math.max(-30, Math.min(30, currencyImpact))
    } else {
      impacts[sector] = (impacts[sector] || 0) + Math.max(-30, Math.min(30, -currencyImpact))
    }
  }

  // Interest rates / yields impact
  if (yields.us10yChange > 1) {
    // Rising US yields → FII outflow risk
    const rateAffected = MACRO_IMPACT_MAP['Interest Rates'] || []
    for (const sector of rateAffected) {
      impacts[sector] = (impacts[sector] || 0) - 10
    }
  }

  // Commodity prices general impact
  const commodityAffected = MACRO_IMPACT_MAP['Commodity Prices'] || []
  const goldImpact = commodities.goldChange * 2
  for (const sector of commodityAffected) {
    impacts[sector] = (impacts[sector] || 0) + Math.max(-20, Math.min(20, -goldImpact))
  }

  // VIX impact — elevated VIX negative for all sectors
  const vixPenalty = volatility.indiaVix > 30 ? -25
    : volatility.indiaVix > 22 ? -18
    : volatility.indiaVix > 18 ? -10
    : volatility.indiaVix > 15 ? -5
    : 0
  if (vixPenalty !== 0) {
    for (const sector of Object.keys(impacts)) {
      impacts[sector] = (impacts[sector] || 0) + vixPenalty
    }
  }

  // Broad market sentiment: S&P 500 down hard = negative for ALL sectors (global risk-off)
  // This ensures a -1.9% S&P day doesn't just affect US-linked sectors
  if (Math.abs(commodities.crudeChange) < 0.01 && Object.keys(impacts).length === 0) {
    // No commodity-driven impacts computed — seed all known sectors
    const allSectors = [...new Set([
      ...MACRO_IMPACT_MAP['Interest Rates'] || [],
      ...MACRO_IMPACT_MAP['Crude Oil Prices'] || [],
      ...MACRO_IMPACT_MAP['USD-INR'] || [],
      ...MACRO_IMPACT_MAP['Consumer Spending'] || [],
    ])]
    for (const sector of allSectors) {
      impacts[sector] = impacts[sector] || 0
    }
  }

  // Clamp all impacts to -100 to +100
  for (const sector of Object.keys(impacts)) {
    impacts[sector] = Math.max(-100, Math.min(100, Math.round(impacts[sector])))
  }

  return impacts
}

function generateSummary(
  usMarket: MacroSnapshot['usMarket'],
  commodities: MacroSnapshot['commodities'],
  currency: MacroSnapshot['currency'],
  volatility: MacroSnapshot['volatility'],
  sentiment: MacroSnapshot['overallSentiment'],
): string {
  const parts: string[] = []

  // US Markets
  if (usMarket.sp500Change !== 0) {
    const dir = usMarket.sp500Change > 0 ? 'up' : 'down'
    parts.push(`US markets ${dir} ${Math.abs(usMarket.sp500Change).toFixed(1)}%`)
  }

  // Crude
  if (Math.abs(commodities.crudeChange) > 1) {
    const dir = commodities.crudeChange > 0 ? 'up' : 'down'
    parts.push(`crude oil ${dir} ${Math.abs(commodities.crudeChange).toFixed(1)}% ($${commodities.crudePrice.toFixed(0)})`)
  }

  // VIX
  if (volatility.riskLevel === 'HIGH' || volatility.riskLevel === 'EXTREME') {
    parts.push(`India VIX elevated at ${volatility.indiaVix.toFixed(1)}`)
  }

  // Currency
  if (Math.abs(currency.usdInrChange) > 0.2) {
    const dir = currency.trend === 'WEAKENING' ? 'weakening' : 'strengthening'
    parts.push(`rupee ${dir} (₹${currency.usdInr.toFixed(2)})`)
  }

  if (parts.length === 0) {
    return `Global macro conditions are stable. Overall sentiment: ${sentiment}.`
  }

  return `${parts.join(', ')}. Overall: ${sentiment.replace(/_/g, ' ').toLowerCase()}.`
}

// ============================================================================
// STOCK-LEVEL MACRO IMPACT
// ============================================================================

/**
 * Get macro impact score for a specific stock based on its sector and macro factors.
 * Returns -100 to +100 where negative = headwind, positive = tailwind.
 */
export function getMacroImpactForStock(
  symbol: string,
  snapshot: MacroSnapshot
): {
  score: number
  factors: string[]
} {
  const sectorInfo = getSectorInfo(symbol)
  if (!sectorInfo) {
    return { score: 0, factors: ['No sector mapping available'] }
  }

  let score = 0
  const factors: string[] = []

  // Check each macro factor that affects this stock
  for (const macroFactor of sectorInfo.macroFactors) {
    switch (macroFactor) {
      case 'Crude Oil Prices': {
        const impact = getOilImpact(sectorInfo, snapshot.commodities.crudeChange)
        score += impact.score
        if (Math.abs(impact.score) > 5) factors.push(impact.reason)
        break
      }
      case 'USD-INR': {
        const impact = getCurrencyImpact(sectorInfo, snapshot.currency)
        score += impact.score
        if (Math.abs(impact.score) > 5) factors.push(impact.reason)
        break
      }
      case 'Interest Rates':
      case 'RBI Policy': {
        if (Math.abs(snapshot.yields.us10yChange) > 1) {
          const impact = snapshot.yields.us10yChange > 0 ? -10 : 5
          score += impact
          factors.push(`US yields ${snapshot.yields.us10yChange > 0 ? 'rising' : 'falling'} → ${impact > 0 ? 'positive' : 'negative'} for rate-sensitive sectors`)
        }
        break
      }
      case 'Global Tech':
      case 'US Economy': {
        const techImpact = snapshot.usMarket.nasdaqChange * 3
        score += Math.max(-20, Math.min(20, techImpact))
        if (Math.abs(snapshot.usMarket.nasdaqChange) > 1) {
          factors.push(`Nasdaq ${snapshot.usMarket.nasdaqChange > 0 ? '+' : ''}${snapshot.usMarket.nasdaqChange.toFixed(1)}% → ${techImpact > 0 ? 'positive' : 'negative'} for tech`)
        }
        break
      }
      case 'China Demand': {
        if (Math.abs(snapshot.asianMarkets.hangSengChange) > 1) {
          const chinaImpact = snapshot.asianMarkets.hangSengChange * 2
          score += Math.max(-15, Math.min(15, chinaImpact))
          factors.push(`Hang Seng ${snapshot.asianMarkets.hangSengChange > 0 ? '+' : ''}${snapshot.asianMarkets.hangSengChange.toFixed(1)}% → ${chinaImpact > 0 ? 'positive' : 'negative'} for metals/exports`)
        }
        break
      }
      case 'Steel Prices':
      case 'Commodity Prices': {
        // Commodity stocks benefit from higher commodities
        const goldImpact = snapshot.commodities.goldChange * 1.5
        score += Math.max(-10, Math.min(10, goldImpact))
        break
      }
    }
  }

  // VIX penalty for all stocks
  if (snapshot.volatility.indiaVix > 25) {
    score -= 10
    factors.push(`High VIX (${snapshot.volatility.indiaVix.toFixed(1)}) → increased uncertainty`)
  }

  // Overall global sentiment influence
  score += snapshot.sentimentScore * 0.1

  // Clamp
  score = Math.max(-100, Math.min(100, Math.round(score)))

  return { score, factors }
}

function getOilImpact(
  sectorInfo: { sector: string; industry: string; subsector?: string },
  crudeChange: number
): { score: number; reason: string } {
  const dir = crudeChange > 0 ? '+' : ''
  const pct = `${dir}${crudeChange.toFixed(1)}%`

  // Upstream oil (ONGC, Oil India) — DIRECTLY benefits from higher crude
  if (sectorInfo.subsector === 'Exploration & Production') {
    const score = Math.max(-25, Math.min(25, crudeChange * 5))
    return { score, reason: `Crude ${pct} → ${score > 0 ? 'positive' : 'negative'} for upstream oil (realization prices)` }
  }

  // Downstream/OMCs (BPCL, IOC) — hurt by rising crude (input cost squeeze)
  if (sectorInfo.subsector === 'Refining & Marketing') {
    const score = Math.max(-25, Math.min(25, -crudeChange * 4))
    return { score, reason: `Crude ${pct} → ${score > 0 ? 'positive' : 'negative'} for refiners (margin squeeze)` }
  }

  // General energy (gas transmission, LNG)
  if (sectorInfo.sector === 'Energy') {
    const score = Math.max(-15, Math.min(15, crudeChange * 2))
    return { score, reason: `Crude ${pct} → mixed for energy sector` }
  }

  // Airlines — ATF (jet fuel) is 40% of airline costs, MASSIVE crude sensitivity
  if (sectorInfo.sector === 'Aviation' || sectorInfo.industry === 'Airlines') {
    const score = Math.max(-25, Math.min(10, -crudeChange * 4))
    return { score, reason: `Crude ${pct} → ${score > 0 ? 'positive' : 'negative'} for airlines (ATF = 40% of costs)` }
  }

  // Paints — TiO2 + crude derivatives are 35-40% of raw materials
  if (sectorInfo.sector === 'Paints') {
    const score = Math.max(-20, Math.min(15, -crudeChange * 3))
    return { score, reason: `Crude ${pct} → ${score > 0 ? 'positive' : 'negative'} for paints (crude-derived raw materials ~40% of cost)` }
  }

  // Chemicals — crude/naphtha is feedstock for specialty chemicals
  if (sectorInfo.sector === 'Chemicals') {
    const score = Math.max(-20, Math.min(10, -crudeChange * 2.5))
    return { score, reason: `Crude ${pct} → ${score > 0 ? 'positive' : 'negative'} for chemicals (feedstock costs)` }
  }

  // Tyres — natural rubber + crude-synthetic rubber, 60% raw material exposure
  if (sectorInfo.industry === 'Tyre Manufacturer') {
    const score = Math.max(-20, Math.min(10, -crudeChange * 3))
    return { score, reason: `Crude ${pct} → ${score > 0 ? 'positive' : 'negative'} for tyre cos (synthetic rubber + carbon black costs)` }
  }

  // Automobile — fuel costs affect demand + steel/component costs
  if (sectorInfo.sector === 'Automobile' || sectorInfo.sector === 'Auto Ancillary') {
    const score = Math.max(-20, Math.min(10, -crudeChange * 2.5))
    return { score, reason: `Crude ${pct} → ${score > 0 ? 'positive' : 'negative'} for auto (fuel costs affect demand)` }
  }

  // Logistics — diesel is 30-40% of operating cost
  if (sectorInfo.sector === 'Logistics') {
    const score = Math.max(-20, Math.min(10, -crudeChange * 3))
    return { score, reason: `Crude ${pct} → ${score > 0 ? 'positive' : 'negative'} for logistics (diesel = 35% of costs)` }
  }

  // Cement — energy is 25-30% of cement production cost
  if (sectorInfo.industry === 'Cement') {
    const score = Math.max(-15, Math.min(10, -crudeChange * 2))
    return { score, reason: `Crude ${pct} → ${score > 0 ? 'positive' : 'negative'} for cement (energy = 30% of cost)` }
  }

  // Power — thermal power affected by fuel costs
  if (sectorInfo.sector === 'Power' && sectorInfo.industry !== 'Renewable Energy' && sectorInfo.industry !== 'Hydropower') {
    const score = Math.max(-15, Math.min(10, -crudeChange * 1.5))
    return { score, reason: `Crude ${pct} → ${score > 0 ? 'positive' : 'negative'} for thermal power (fuel costs)` }
  }

  // FMCG — transport + packaging costs (indirect but real)
  if (sectorInfo.sector === 'FMCG') {
    const score = Math.max(-10, Math.min(5, -crudeChange * 1))
    return { score, reason: `Crude ${pct} → ${score > 0 ? 'slight positive' : 'slight negative'} for FMCG (transport/packaging costs)` }
  }

  // Fertilizers — natural gas is primary feedstock for urea, crude derivatives for complex fertilizers
  // BUT government subsidizes heavily, so margin impact is partially cushioned
  if (sectorInfo.sector === 'Fertilizers') {
    const score = Math.max(-20, Math.min(10, -crudeChange * 2.5))
    return { score, reason: `Crude ${pct} → ${score > 0 ? 'lower' : 'higher'} feedstock costs for fertilizers (gas/naphtha-linked)` }
  }

  // Hotels — crude impacts transport costs and tourism indirectly
  if (sectorInfo.sector === 'Hotels') {
    const score = Math.max(-10, Math.min(5, -crudeChange * 1))
    return { score, reason: `Crude ${pct} → ${score > 0 ? 'positive' : 'mild negative'} for hotels (travel/transport costs)` }
  }

  // Travel — fuel costs directly affect ticket prices and demand
  if (sectorInfo.sector === 'Travel') {
    const score = Math.max(-15, Math.min(10, -crudeChange * 2))
    return { score, reason: `Crude ${pct} → ${score > 0 ? 'positive' : 'negative'} for travel (fuel surcharges, tourism demand)` }
  }

  // Infrastructure — diesel + bitumen + steel (all crude-linked) are major inputs
  if (sectorInfo.sector === 'Infrastructure') {
    const score = Math.max(-15, Math.min(10, -crudeChange * 2))
    return { score, reason: `Crude ${pct} → ${score > 0 ? 'positive' : 'negative'} for infra (diesel, bitumen, input costs)` }
  }

  // Consumer Durables — plastics, transport, component costs
  if (sectorInfo.sector === 'Consumer Durables') {
    const score = Math.max(-10, Math.min(8, -crudeChange * 1.5))
    return { score, reason: `Crude ${pct} → ${score > 0 ? 'positive' : 'negative'} for durables (plastics, component costs)` }
  }

  // Gold loan NBFCs — gold rises with crude/inflation, benefits them
  if (sectorInfo.subsector === 'Gold Loans') {
    const score = Math.max(-5, Math.min(10, crudeChange * 1))
    return { score, reason: `Crude ${pct} → gold prices tend to rise with crude → positive for gold loan book` }
  }

  return { score: 0, reason: '' }
}

function getCurrencyImpact(
  sectorInfo: { sector: string; industry: string },
  currency: MacroSnapshot['currency']
): { score: number; reason: string } {
  const change = currency.usdInrChange // Positive = INR weakening (USD/INR going up)

  // MINIMUM THRESHOLD: Currency moves below 0.4% are noise, not signal
  // A 10 paisa move on ₹87 is ~0.1% — irrelevant to fundamentals
  if (Math.abs(change) < 0.4) {
    return { score: 0, reason: '' }
  }

  // IT: Export earners — 90%+ USD revenue, benefit massively from weak INR
  if (sectorInfo.sector === 'IT') {
    const score = Math.max(-20, Math.min(20, change * 10))
    if (Math.abs(score) > 3) {
      return { score, reason: `Rupee ${currency.trend.toLowerCase()} → ${score > 0 ? 'positive' : 'negative'} for IT export revenue (90% USD)` }
    }
  }

  // Pharma: 50-60% export revenue in USD
  if (sectorInfo.sector === 'Healthcare') {
    const score = Math.max(-15, Math.min(15, change * 7))
    if (Math.abs(score) > 3) {
      return { score, reason: `Rupee ${currency.trend.toLowerCase()} → ${score > 0 ? 'positive' : 'negative'} for pharma exports (50-60% USD revenue)` }
    }
  }

  // Chemicals: Export-oriented, benefit from weak INR
  if (sectorInfo.sector === 'Chemicals') {
    const score = Math.max(-10, Math.min(10, change * 5))
    if (Math.abs(score) > 3) {
      return { score, reason: `Rupee ${currency.trend.toLowerCase()} → ${score > 0 ? 'positive' : 'negative'} for chemical exports` }
    }
  }

  // Auto (exports like BAJAJ-AUTO, TATAMOTORS JLR): Mixed — exports benefit, imports hurt
  if (sectorInfo.sector === 'Automobile') {
    const score = Math.max(-8, Math.min(8, -change * 3)) // Net import-heavy
    if (Math.abs(score) > 3) {
      return { score, reason: `Rupee ${currency.trend.toLowerCase()} → ${score > 0 ? 'positive' : 'negative'} for auto (import-heavy components)` }
    }
  }

  // Oil importers hurt by weak INR (higher USD = higher oil import bill)
  if (sectorInfo.sector === 'Energy' && sectorInfo.industry !== 'Exploration & Production') {
    const score = Math.max(-15, Math.min(10, -change * 5))
    if (Math.abs(score) > 3) {
      return { score, reason: `Rupee ${currency.trend.toLowerCase()} → ${score > 0 ? 'positive' : 'negative'} for oil importers` }
    }
  }

  // Metals: USD-denominated commodity prices, mixed impact
  if (sectorInfo.sector === 'Metals') {
    const score = Math.max(-10, Math.min(10, change * 3))
    if (Math.abs(score) > 3) {
      return { score, reason: `Rupee ${currency.trend.toLowerCase()} → ${score > 0 ? 'positive' : 'negative'} for metals (USD-priced commodities)` }
    }
  }

  // Capital Goods with defence exports
  if (sectorInfo.industry === 'Defence & Aerospace' || sectorInfo.industry === 'Defence Electronics') {
    const score = Math.max(-8, Math.min(8, change * 3))
    if (Math.abs(score) > 3) {
      return { score, reason: `Rupee ${currency.trend.toLowerCase()} → ${score > 0 ? 'positive' : 'negative'} for defence exports` }
    }
  }

  // Airlines: USD-denominated lease costs + ATF partially USD-priced
  if (sectorInfo.sector === 'Aviation') {
    const score = Math.max(-15, Math.min(5, -change * 5))
    if (Math.abs(score) > 3) {
      return { score, reason: `Rupee ${currency.trend.toLowerCase()} → ${score > 0 ? 'positive' : 'negative'} for airlines (USD lease + ATF costs)` }
    }
  }

  return { score: 0, reason: '' }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function getSentimentEmoji(sentiment: MacroSnapshot['overallSentiment']): string {
  switch (sentiment) {
    case 'STRONGLY_RISK_ON': return '🟢🚀'
    case 'RISK_ON': return '🟢'
    case 'NEUTRAL': return '🟡'
    case 'RISK_OFF': return '🔴'
    case 'STRONGLY_RISK_OFF': return '🔴🔻'
  }
}

export function getSentimentColor(sentiment: MacroSnapshot['overallSentiment']): string {
  switch (sentiment) {
    case 'STRONGLY_RISK_ON': return '#10B981'
    case 'RISK_ON': return '#34D399'
    case 'NEUTRAL': return '#F59E0B'
    case 'RISK_OFF': return '#F87171'
    case 'STRONGLY_RISK_OFF': return '#EF4444'
  }
}
