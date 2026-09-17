/**
 * Derivatives Analyzer — F&O Intelligence for Stock Analysis
 *
 * Extracts from the F&O segment:
 *   - Put/Call Ratio (OI-based and Volume-based)
 *   - Open Interest distribution
 *   - Max Pain strike
 *   - Sentiment interpretation
 *   - Support/Resistance from OI clusters
 *
 * Uses Kite Connect's instrument + quote APIs.
 */

import type { BrokerClient, InstrumentData } from './broker/types'
import logger from './logger'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DerivativesAnalysis {
  available: boolean
  reason?: string           // Why not available (e.g., "not in F&O segment")

  // Core metrics
  expiry: string            // Selected expiry date
  putCallRatio: number      // OI-based PCR
  volumePCR: number         // Volume-based PCR (intraday sentiment)

  // OI data
  totalCallOI: number
  totalPutOI: number
  totalCallVolume: number
  totalPutVolume: number
  maxPainStrike: number | null

  // OI-based levels
  highestCallOIStrike: number | null    // Resistance (call writers sell here)
  highestPutOIStrike: number | null     // Support (put writers sell here)

  // Top strikes
  topCalls: { strike: number; oi: number; volume: number; ltp: number }[]
  topPuts: { strike: number; oi: number; volume: number; ltp: number }[]

  // Interpretation
  sentiment: 'VERY_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'VERY_BEARISH'
  sentimentScore: number     // -100 to +100
  interpretation: string     // Human-readable F&O reading
  signals: string[]          // Key signals from derivatives
}

// ─── Instrument Cache ───────────────────────────────────────────────────────

let nseInstrumentCache: InstrumentData[] | null = null
let nfoInstrumentCache: InstrumentData[] | null = null
let instrumentCacheTime = 0
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

async function getInstruments(client: BrokerClient, exchange: string): Promise<InstrumentData[]> {
  const now = Date.now()
  if (exchange === 'NSE' && nseInstrumentCache && now - instrumentCacheTime < CACHE_TTL) {
    return nseInstrumentCache
  }
  if (exchange === 'NFO' && nfoInstrumentCache && now - instrumentCacheTime < CACHE_TTL) {
    return nfoInstrumentCache
  }

  const instruments = await client.getInstruments(exchange)
  if (exchange === 'NSE') nseInstrumentCache = instruments
  if (exchange === 'NFO') nfoInstrumentCache = instruments
  instrumentCacheTime = now
  return instruments
}

// ─── Token Lookup ───────────────────────────────────────────────────────────

/**
 * Look up instrument tokens for equity symbols.
 * Returns a map of symbol → instrumentToken.
 */
export async function lookupInstrumentTokens(
  symbols: string[],
  client: BrokerClient,
  exchange: string = 'NSE',
): Promise<Map<string, number | string>> {
  const instruments = await getInstruments(client, exchange)
  const tokenMap = new Map<string, number | string>()

  for (const symbol of symbols) {
    const match = instruments.find(
      i => i.tradingsymbol === symbol && i.exchange === exchange && (!i.instrumentType || i.instrumentType === 'EQ')
    )
    if (match) {
      tokenMap.set(symbol, match.instrumentToken)
    }
  }

  return tokenMap
}

// ─── Derivatives Analysis ───────────────────────────────────────────────────

/**
 * Analyze the F&O segment for a stock — PCR, OI, max pain, sentiment.
 * Returns null for stocks not in F&O segment.
 */
export async function analyzeDerivatives(
  symbol: string,
  client: BrokerClient,
  currentPrice?: number,
): Promise<DerivativesAnalysis> {
  try {
    // Get NFO instruments for this symbol
    const instruments = await getInstruments(client, 'NFO')

    const symbolOptions = instruments.filter(
      i => i.name === symbol && (i.instrumentType === 'CE' || i.instrumentType === 'PE')
    )

    if (symbolOptions.length === 0) {
      return {
        available: false,
        reason: `${symbol} is not in F&O segment`,
        expiry: '', putCallRatio: 0, volumePCR: 0,
        totalCallOI: 0, totalPutOI: 0, totalCallVolume: 0, totalPutVolume: 0,
        maxPainStrike: null, highestCallOIStrike: null, highestPutOIStrike: null,
        topCalls: [], topPuts: [],
        sentiment: 'NEUTRAL', sentimentScore: 0,
        interpretation: `${symbol} does not have options trading.`,
        signals: [],
      }
    }

    // Get all expiries, pick the one with most liquidity (usually monthly)
    const expiryMap = new Map<number, { calls: InstrumentData[]; puts: InstrumentData[] }>()
    for (const opt of symbolOptions) {
      const expiryTime = new Date(opt.raw?.expiry).getTime()
      if (!expiryMap.has(expiryTime)) expiryMap.set(expiryTime, { calls: [], puts: [] })
      const entry = expiryMap.get(expiryTime)!
      if (opt.instrumentType === 'CE') entry.calls.push(opt)
      else entry.puts.push(opt)
    }

    // Select expiry with most options (likely monthly, more liquid)
    let bestExpiry = 0
    let bestCount = 0
    for (const [exp, data] of expiryMap) {
      const count = data.calls.length + data.puts.length
      if (data.calls.length > 0 && data.puts.length > 0 && count > bestCount) {
        bestCount = count
        bestExpiry = exp
      }
    }

    if (!bestExpiry) {
      return {
        available: false, reason: 'No valid expiry found',
        expiry: '', putCallRatio: 0, volumePCR: 0,
        totalCallOI: 0, totalPutOI: 0, totalCallVolume: 0, totalPutVolume: 0,
        maxPainStrike: null, highestCallOIStrike: null, highestPutOIStrike: null,
        topCalls: [], topPuts: [],
        sentiment: 'NEUTRAL', sentimentScore: 0,
        interpretation: 'Could not determine F&O expiry.', signals: [],
      }
    }

    const selected = expiryMap.get(bestExpiry)!
    const allOptions = [...selected.calls, ...selected.puts]
    const expiryDate = new Date(bestExpiry)

    logger.info(`Derivatives: ${symbol} — ${selected.calls.length} CE, ${selected.puts.length} PE for ${expiryDate.toLocaleDateString()}`)

    // Fetch quotes in batches
    const BATCH_SIZE = 400
    let allQuotes: Record<string, any> = {}
    for (let i = 0; i < allOptions.length; i += BATCH_SIZE) {
      const batch = allOptions.slice(i, i + BATCH_SIZE)
      const quoteSymbols = batch.map(o => `NFO:${o.tradingsymbol}`)
      try {
        const quotes = await client.getQuote(quoteSymbols)
        allQuotes = { ...allQuotes, ...quotes }
      } catch (err) {
        logger.warn(`Derivatives: Quote batch failed for ${symbol}`, { error: (err as Error).message })
      }
    }

    // Aggregate OI and volume
    let totalCallOI = 0, totalPutOI = 0, totalCallVolume = 0, totalPutVolume = 0
    const callDetails: { strike: number; oi: number; volume: number; ltp: number }[] = []
    const putDetails: { strike: number; oi: number; volume: number; ltp: number }[] = []

    for (const call of selected.calls) {
      const q = allQuotes[`NFO:${call.tradingsymbol}`]
      if (q) {
        const oi = q.raw?.oi || 0
        const vol = q.volume || 0
        totalCallOI += oi
        totalCallVolume += vol
        if (oi > 0) callDetails.push({ strike: call.raw?.strike, oi, volume: vol, ltp: q.lastPrice || 0 })
      }
    }

    for (const put of selected.puts) {
      const q = allQuotes[`NFO:${put.tradingsymbol}`]
      if (q) {
        const oi = q.raw?.oi || 0
        const vol = q.volume || 0
        totalPutOI += oi
        totalPutVolume += vol
        if (oi > 0) putDetails.push({ strike: put.raw?.strike, oi, volume: vol, ltp: q.lastPrice || 0 })
      }
    }

    // PCR
    const pcr = totalCallOI > 0 ? totalPutOI / totalCallOI : 0
    const volumePCR = totalCallVolume > 0 ? totalPutVolume / totalCallVolume : 0

    // Max pain (strike where total OI is highest — price gravitates here)
    const strikeOI: Record<number, number> = {}
    for (const c of callDetails) strikeOI[c.strike] = (strikeOI[c.strike] || 0) + c.oi
    for (const p of putDetails) strikeOI[p.strike] = (strikeOI[p.strike] || 0) + p.oi
    const maxPainEntry = Object.entries(strikeOI).sort((a, b) => b[1] - a[1])[0]
    const maxPainStrike = maxPainEntry ? Number(maxPainEntry[0]) : null

    // Highest OI strikes = key levels
    const sortedCalls = [...callDetails].sort((a, b) => b.oi - a.oi)
    const sortedPuts = [...putDetails].sort((a, b) => b.oi - a.oi)
    const highestCallOIStrike = sortedCalls[0]?.strike ?? null  // Resistance
    const highestPutOIStrike = sortedPuts[0]?.strike ?? null    // Support

    // Sentiment interpretation
    const { sentiment, sentimentScore, interpretation, signals } = interpretDerivatives(
      symbol, pcr, volumePCR, totalCallOI, totalPutOI,
      highestCallOIStrike, highestPutOIStrike, maxPainStrike,
      currentPrice, expiryDate,
    )

    return {
      available: true,
      expiry: expiryDate.toISOString().split('T')[0],
      putCallRatio: Math.round(pcr * 100) / 100,
      volumePCR: Math.round(volumePCR * 100) / 100,
      totalCallOI, totalPutOI, totalCallVolume, totalPutVolume,
      maxPainStrike,
      highestCallOIStrike,
      highestPutOIStrike,
      topCalls: sortedCalls.slice(0, 5),
      topPuts: sortedPuts.slice(0, 5),
      sentiment, sentimentScore, interpretation, signals,
    }
  } catch (error) {
    logger.error(`Derivatives: Failed for ${symbol}`, { error: (error as Error).message })
    return {
      available: false, reason: (error as Error).message,
      expiry: '', putCallRatio: 0, volumePCR: 0,
      totalCallOI: 0, totalPutOI: 0, totalCallVolume: 0, totalPutVolume: 0,
      maxPainStrike: null, highestCallOIStrike: null, highestPutOIStrike: null,
      topCalls: [], topPuts: [],
      sentiment: 'NEUTRAL', sentimentScore: 0,
      interpretation: 'Derivatives data unavailable.', signals: [],
    }
  }
}

// ─── Interpretation ─────────────────────────────────────────────────────────

function interpretDerivatives(
  symbol: string,
  pcr: number,
  volumePCR: number,
  totalCallOI: number,
  totalPutOI: number,
  highestCallOI: number | null,
  highestPutOI: number | null,
  maxPain: number | null,
  currentPrice: number | undefined,
  expiry: Date,
): { sentiment: DerivativesAnalysis['sentiment']; sentimentScore: number; interpretation: string; signals: string[] } {
  const signals: string[] = []
  let score = 0

  // PCR interpretation
  // PCR > 1.2 = heavy put writing = BULLISH (writers expect support)
  // PCR < 0.7 = heavy call writing = BEARISH (writers expect resistance)
  // PCR 0.7-1.2 = balanced = NEUTRAL
  if (pcr > 1.5) {
    score += 40
    signals.push(`Very high PCR (${pcr.toFixed(2)}) — heavy put writing signals strong support. Writers don't expect breakdown.`)
  } else if (pcr > 1.2) {
    score += 25
    signals.push(`Elevated PCR (${pcr.toFixed(2)}) — more puts than calls. Put writers expect stock to hold. Mildly bullish.`)
  } else if (pcr < 0.5) {
    score -= 40
    signals.push(`Very low PCR (${pcr.toFixed(2)}) — heavy call writing signals strong resistance. Writers expect stock to stay below.`)
  } else if (pcr < 0.7) {
    score -= 25
    signals.push(`Low PCR (${pcr.toFixed(2)}) — more calls than puts. Call writers expect limited upside. Mildly bearish.`)
  } else {
    signals.push(`PCR at ${pcr.toFixed(2)} — balanced. No strong directional bias from OI.`)
  }

  // Volume PCR (intraday sentiment — more reactive)
  if (volumePCR > 1.5 && pcr < 1.0) {
    score += 15
    signals.push(`Volume PCR (${volumePCR.toFixed(2)}) diverging from OI PCR — short-term put buying pickup suggests near-term hedging or reversal expected.`)
  } else if (volumePCR < 0.5 && pcr > 1.0) {
    score -= 15
    signals.push(`Volume PCR (${volumePCR.toFixed(2)}) falling despite high OI PCR — intraday call activity rising, possible sentiment shift.`)
  }

  // Max Pain analysis
  if (maxPain && currentPrice) {
    const pctFromMaxPain = ((currentPrice - maxPain) / maxPain) * 100
    if (Math.abs(pctFromMaxPain) < 2) {
      signals.push(`Stock near max pain (₹${maxPain}) — price likely to stay range-bound until expiry ${expiry.toLocaleDateString()}.`)
    } else if (pctFromMaxPain > 3) {
      score -= 10
      signals.push(`Stock ₹${currentPrice} is ${pctFromMaxPain.toFixed(1)}% ABOVE max pain (₹${maxPain}) — gravitational pull downward expected as expiry nears.`)
    } else if (pctFromMaxPain < -3) {
      score += 10
      signals.push(`Stock ₹${currentPrice} is ${Math.abs(pctFromMaxPain).toFixed(1)}% BELOW max pain (₹${maxPain}) — upward pull expected as options expire.`)
    }
  }

  // OI-based support/resistance
  if (highestPutOI && currentPrice) {
    if (currentPrice > highestPutOI) {
      signals.push(`Strong put OI support at ₹${highestPutOI} — put sellers defend this level. Unlikely to break easily.`)
    } else {
      score -= 15
      signals.push(`Stock BELOW highest put OI (₹${highestPutOI}) — support has broken. Put writers may be unwinding = more downside.`)
    }
  }

  if (highestCallOI && currentPrice) {
    if (currentPrice < highestCallOI) {
      signals.push(`Resistance at ₹${highestCallOI} (highest call OI) — call sellers cap upside here.`)
    } else {
      score += 15
      signals.push(`Stock ABOVE highest call OI (₹${highestCallOI}) — breakout above resistance. Call writers covering = bullish.`)
    }
  }

  // Sentiment classification
  const sentiment: DerivativesAnalysis['sentiment'] =
    score > 30 ? 'VERY_BULLISH' :
    score > 10 ? 'BULLISH' :
    score < -30 ? 'VERY_BEARISH' :
    score < -10 ? 'BEARISH' : 'NEUTRAL'

  // Build narrative
  const parts: string[] = []
  parts.push(`F&O outlook for ${symbol}: ${sentiment.replace('_', ' ')}.`)
  parts.push(`PCR at ${pcr.toFixed(2)} (OI) / ${volumePCR.toFixed(2)} (volume).`)
  if (maxPain) parts.push(`Max pain: ₹${maxPain}.`)
  if (highestPutOI) parts.push(`Put support: ₹${highestPutOI}.`)
  if (highestCallOI) parts.push(`Call resistance: ₹${highestCallOI}.`)
  const daysToExpiry = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (daysToExpiry > 0) parts.push(`${daysToExpiry} days to expiry.`)

  return {
    sentiment,
    sentimentScore: Math.max(-100, Math.min(100, score)),
    interpretation: parts.join(' '),
    signals,
  }
}
