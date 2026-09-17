/**
 * 🤖 GEMINI-POWERED SENTIMENT ANALYSIS
 *
 * Uses Google Gemini (gemini-2.5-flash) for contextual sentiment analysis
 * that understands financial nuance, sarcasm, and second-order effects.
 *
 * Unlike bag-of-words (sentiment npm):
 * - "Not bullish" → correctly identified as NEGATIVE (bag-of-words: positive)
 * - "Markets crash on Iran tensions" → geopolitical negative (bag-of-words: neutral/positive)
 * - "Price cut is great for consumers" → understands it's negative for the company
 *
 * Rate limited: max 10 calls per scan run.
 * Falls back to bag-of-words if Gemini fails.
 */

import { GoogleGenerativeAI } from '@google/generative-ai'

// ============================================================================
// TYPES
// ============================================================================

export interface GeminiSentimentResult {
  sentiment: number        // -100 to +100
  confidence: number       // 0-100
  keyFactors: string[]     // What drives this sentiment
  risks: string[]          // Identified risks
  opportunities: string[]  // Identified opportunities
  timeHorizon: 'IMMEDIATE' | 'SHORT_TERM' | 'MEDIUM_TERM' | 'LONG_TERM'
  category: 'VERY_POSITIVE' | 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'VERY_NEGATIVE'
  source: 'gemini' | 'fallback'
}

// ============================================================================
// GEMINI CLIENT (LAZY INIT)
// ============================================================================

let genAI: GoogleGenerativeAI | null = null

function getGenAI(): GoogleGenerativeAI | null {
  if (genAI) return genAI
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.warn('⚠️ GEMINI_API_KEY not set — LLM sentiment unavailable')
    return null
  }
  genAI = new GoogleGenerativeAI(apiKey)
  return genAI
}

// ============================================================================
// RATE LIMITING
// ============================================================================

let callsThisRun = 0
let lastRunReset = Date.now()
const MAX_CALLS_PER_RUN = 10
const RUN_RESET_INTERVAL = 5 * 60 * 1000 // Reset every 5 minutes

function checkRateLimit(): boolean {
  const now = Date.now()
  if (now - lastRunReset > RUN_RESET_INTERVAL) {
    callsThisRun = 0
    lastRunReset = now
  }
  return callsThisRun < MAX_CALLS_PER_RUN
}

function incrementCallCount(): void {
  callsThisRun++
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Analyze news headlines for a stock using Gemini AI.
 * Returns structured sentiment with key factors.
 */
export async function analyzeNewsSentiment(
  headlines: string[],
  stockContext: {
    symbol: string
    sector?: string
    industry?: string
    currentPrice?: number
    changePercent?: number
  }
): Promise<GeminiSentimentResult> {
  // Check rate limit
  if (!checkRateLimit()) {
    console.log(`⚠️ Gemini rate limit reached (${MAX_CALLS_PER_RUN} calls/run) — using fallback`)
    return createFallbackResult(headlines, stockContext)
  }

  // Check Gemini availability
  const ai = getGenAI()
  if (!ai) {
    return createFallbackResult(headlines, stockContext)
  }

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' })

    const prompt = buildPrompt(headlines, stockContext)

    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini timeout')), 15000)
      ),
    ])

    incrementCallCount()

    const text = result.response.text()
    return parseGeminiResponse(text, stockContext.symbol)
  } catch (error: any) {
    console.error(`⚠️ Gemini sentiment failed for ${stockContext.symbol}:`, error.message)
    return createFallbackResult(headlines, stockContext)
  }
}

/**
 * Batch analyze sentiment for multiple stocks.
 * Respects rate limits — processes in priority order.
 */
export async function batchAnalyzeSentiment(
  stockHeadlines: Array<{
    symbol: string
    sector?: string
    headlines: string[]
  }>
): Promise<Record<string, GeminiSentimentResult>> {
  const results: Record<string, GeminiSentimentResult> = {}

  // Sort by headline count (more news = more important to analyze correctly)
  const sorted = [...stockHeadlines].sort((a, b) => b.headlines.length - a.headlines.length)

  for (const stock of sorted) {
    if (stock.headlines.length === 0) {
      results[stock.symbol] = {
        sentiment: 0,
        confidence: 20,
        keyFactors: ['No news available'],
        risks: [],
        opportunities: [],
        timeHorizon: 'SHORT_TERM',
        category: 'NEUTRAL',
        source: 'fallback',
      }
      continue
    }

    results[stock.symbol] = await analyzeNewsSentiment(
      stock.headlines.slice(0, 15), // Max 15 headlines per stock
      { symbol: stock.symbol, sector: stock.sector }
    )
  }

  return results
}

// ============================================================================
// PROMPT BUILDING
// ============================================================================

function buildPrompt(headlines: string[], stockContext: {
  symbol: string
  sector?: string
  industry?: string
  currentPrice?: number
  changePercent?: number
}): string {
  const headlineList = headlines
    .slice(0, 15)
    .map((h, i) => `${i + 1}. ${h}`)
    .join('\n')

  const context = [
    `Stock: ${stockContext.symbol}`,
    stockContext.sector ? `Sector: ${stockContext.sector}` : null,
    stockContext.industry ? `Industry: ${stockContext.industry}` : null,
    stockContext.currentPrice ? `Current Price: ₹${stockContext.currentPrice.toFixed(2)}` : null,
    stockContext.changePercent ? `Today's Change: ${stockContext.changePercent > 0 ? '+' : ''}${stockContext.changePercent.toFixed(2)}%` : null,
  ].filter(Boolean).join(', ')

  return `You are a financial analyst specializing in Indian stock markets.

Analyze these news headlines for ${context}.

Headlines:
${headlineList}

Consider:
- Geopolitical implications (wars, sanctions, trade tensions)
- Regulatory risk (government policies, SEBI, RBI)
- Sector-wide impact vs company-specific impact
- Supply chain effects and second-order consequences
- Sentiment vs actual business impact
- Market timing (is news already priced in?)

Return ONLY valid JSON (no markdown, no code blocks):
{
  "sentiment": <number from -100 to 100>,
  "confidence": <number from 0 to 100>,
  "keyFactors": [<up to 3 short strings explaining sentiment drivers>],
  "risks": [<up to 2 short strings of identified risks>],
  "opportunities": [<up to 2 short strings of identified opportunities>],
  "timeHorizon": "<IMMEDIATE|SHORT_TERM|MEDIUM_TERM|LONG_TERM>"
}`
}

// ============================================================================
// RESPONSE PARSING
// ============================================================================

function parseGeminiResponse(text: string, symbol: string): GeminiSentimentResult {
  try {
    // Strip markdown code blocks if present
    let cleaned = text.trim()
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }

    const parsed = JSON.parse(cleaned)

    const sentiment = Math.max(-100, Math.min(100, Number(parsed.sentiment) || 0))
    const confidence = Math.max(0, Math.min(100, Number(parsed.confidence) || 50))

    let category: GeminiSentimentResult['category']
    if (sentiment >= 40) category = 'VERY_POSITIVE'
    else if (sentiment >= 15) category = 'POSITIVE'
    else if (sentiment <= -40) category = 'VERY_NEGATIVE'
    else if (sentiment <= -15) category = 'NEGATIVE'
    else category = 'NEUTRAL'

    return {
      sentiment,
      confidence,
      keyFactors: (parsed.keyFactors || []).slice(0, 3),
      risks: (parsed.risks || []).slice(0, 2),
      opportunities: (parsed.opportunities || []).slice(0, 2),
      timeHorizon: ['IMMEDIATE', 'SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM'].includes(parsed.timeHorizon)
        ? parsed.timeHorizon
        : 'SHORT_TERM',
      category,
      source: 'gemini',
    }
  } catch (parseError) {
    console.error(`⚠️ Failed to parse Gemini response for ${symbol}:`, parseError)
    return {
      sentiment: 0,
      confidence: 10,
      keyFactors: ['Unable to parse AI analysis'],
      risks: [],
      opportunities: [],
      timeHorizon: 'SHORT_TERM',
      category: 'NEUTRAL',
      source: 'fallback',
    }
  }
}

// ============================================================================
// FALLBACK (BAG-OF-WORDS)
// ============================================================================

function createFallbackResult(
  headlines: string[],
  stockContext: { symbol: string }
): GeminiSentimentResult {
  // Simple word-based sentiment as fallback
  const positiveWords = ['surge', 'rally', 'gain', 'profit', 'growth', 'upgrade', 'buy', 'bullish', 'record', 'strong', 'up', 'rise', 'positive', 'boost', 'outperform']
  const negativeWords = ['crash', 'fall', 'loss', 'decline', 'downgrade', 'sell', 'bearish', 'weak', 'down', 'drop', 'negative', 'concern', 'risk', 'fear', 'plunge', 'slump']

  let posCount = 0
  let negCount = 0

  for (const headline of headlines) {
    const lower = headline.toLowerCase()
    for (const word of positiveWords) {
      if (lower.includes(word)) posCount++
    }
    for (const word of negativeWords) {
      if (lower.includes(word)) negCount++
    }
  }

  const total = posCount + negCount
  const sentiment = total > 0 ? Math.round(((posCount - negCount) / total) * 60) : 0

  let category: GeminiSentimentResult['category'] = 'NEUTRAL'
  if (sentiment >= 30) category = 'VERY_POSITIVE'
  else if (sentiment >= 10) category = 'POSITIVE'
  else if (sentiment <= -30) category = 'VERY_NEGATIVE'
  else if (sentiment <= -10) category = 'NEGATIVE'

  return {
    sentiment,
    confidence: Math.min(50, total * 5), // Low confidence for word-counting
    keyFactors: [`Keyword analysis: ${posCount} positive, ${negCount} negative mentions`],
    risks: [],
    opportunities: [],
    timeHorizon: 'SHORT_TERM',
    category,
    source: 'fallback',
  }
}
