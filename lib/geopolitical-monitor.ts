/**
 * 🌍 GEOPOLITICAL EVENT MONITOR
 *
 * Detects geopolitical events from news headlines and maps them
 * to Indian market impact. Uses Gemini AI for classification when
 * available, with keyword-based fallback.
 *
 * Event types: WAR, SANCTIONS, TARIFF, REGULATION, NATURAL_DISASTER, POLITICAL_CHANGE
 * Maps events → affected Indian sectors → stock-level impact scores
 *
 * Cache: 30 minutes (geopolitical events don't change every second)
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import { MACRO_IMPACT_MAP, getSectorInfo } from './sector-mapping'

// ============================================================================
// TYPES
// ============================================================================

export type GeopoliticalEventType =
  | 'WAR'
  | 'SANCTIONS'
  | 'TARIFF'
  | 'REGULATION'
  | 'NATURAL_DISASTER'
  | 'POLITICAL_CHANGE'
  | 'TRADE_DEAL'
  | 'MONETARY_POLICY'

export type EventSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type EventDuration = 'TEMPORARY' | 'SHORT_TERM' | 'STRUCTURAL'

export interface GeopoliticalEvent {
  type: GeopoliticalEventType
  title: string                  // Short event description
  affectedRegions: string[]      // Countries/regions involved
  affectedSectors: string[]      // Indian sectors impacted
  severity: EventSeverity
  duration: EventDuration
  sentimentImpact: number        // -100 to +100 for Indian markets
  sectorImpacts: Record<string, number>  // sector → impact score
  confidence: number             // 0-100
  detectedFrom: string           // Source headline
}

export interface GeopoliticalSnapshot {
  events: GeopoliticalEvent[]
  overallRisk: 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME'
  timestamp: Date
  source: 'gemini' | 'keyword'
}

// ============================================================================
// CACHE
// ============================================================================

let cachedSnapshot: GeopoliticalSnapshot | null = null
let lastFetchTime = 0
const CACHE_TTL = 30 * 60 * 1000 // 30 minutes

// ============================================================================
// KEYWORD-BASED EVENT DETECTION (FAST FALLBACK)
// ============================================================================

interface KeywordRule {
  keywords: string[]
  type: GeopoliticalEventType
  severity: EventSeverity
  duration: EventDuration
  affectedRegions: string[]
  affectedSectors: string[]
  sentimentImpact: number
}

const KEYWORD_RULES: KeywordRule[] = [
  // Wars and military conflicts
  {
    keywords: ['war', 'military strike', 'airstrike', 'missile', 'invasion', 'armed conflict', 'bombing', 'troops deployed'],
    type: 'WAR',
    severity: 'CRITICAL',
    duration: 'SHORT_TERM',
    affectedRegions: [],
    affectedSectors: ['Energy', 'Aviation', 'Metals', 'Defence'],
    sentimentImpact: -60,
  },
  // Iran-specific (major crude oil impact)
  {
    keywords: ['iran', 'persian gulf', 'strait of hormuz', 'iran sanctions', 'iran nuclear'],
    type: 'WAR',
    severity: 'HIGH',
    duration: 'SHORT_TERM',
    affectedRegions: ['Middle East', 'Iran'],
    affectedSectors: ['Energy', 'Aviation', 'Automobile', 'Paints'],
    sentimentImpact: -45,
  },
  // Russia-Ukraine
  {
    keywords: ['russia ukraine', 'ukraine war', 'russian invasion', 'nato ukraine'],
    type: 'WAR',
    severity: 'HIGH',
    duration: 'STRUCTURAL',
    affectedRegions: ['Europe', 'Russia', 'Ukraine'],
    affectedSectors: ['Energy', 'Metals', 'FMCG', 'IT'],
    sentimentImpact: -35,
  },
  // China-Taiwan
  {
    keywords: ['china taiwan', 'taiwan strait', 'china military taiwan'],
    type: 'WAR',
    severity: 'CRITICAL',
    duration: 'STRUCTURAL',
    affectedRegions: ['Asia', 'China', 'Taiwan'],
    affectedSectors: ['IT', 'Automobile', 'Metals', 'Banking'],
    sentimentImpact: -70,
  },
  // Sanctions
  {
    keywords: ['sanctions', 'trade ban', 'embargo', 'blacklist', 'export controls'],
    type: 'SANCTIONS',
    severity: 'HIGH',
    duration: 'STRUCTURAL',
    affectedRegions: [],
    affectedSectors: ['IT', 'Healthcare', 'Energy', 'Metals'],
    sentimentImpact: -30,
  },
  // Tariffs
  {
    keywords: ['tariff', 'import duty', 'trade war', 'customs duty', 'anti-dumping', 'reciprocal tariff'],
    type: 'TARIFF',
    severity: 'MEDIUM',
    duration: 'SHORT_TERM',
    affectedRegions: [],
    affectedSectors: ['IT', 'Healthcare', 'Metals', 'Automobile'],
    sentimentImpact: -25,
  },
  // US tariffs on India
  {
    keywords: ['us tariff india', 'trump tariff india', 'india trade deficit', 'india tariff retaliation'],
    type: 'TARIFF',
    severity: 'HIGH',
    duration: 'SHORT_TERM',
    affectedRegions: ['USA', 'India'],
    affectedSectors: ['IT', 'Healthcare', 'Automobile', 'Metals', 'Telecom'],
    sentimentImpact: -40,
  },
  // Indian regulation
  {
    keywords: ['sebi regulation', 'rbi circular', 'government regulation india', 'policy change india', 'niti aayog'],
    type: 'REGULATION',
    severity: 'MEDIUM',
    duration: 'STRUCTURAL',
    affectedRegions: ['India'],
    affectedSectors: ['Banking', 'Financial Services'],
    sentimentImpact: -15,
  },
  // Natural disasters
  {
    keywords: ['earthquake', 'tsunami', 'cyclone', 'flood', 'drought', 'natural disaster', 'hurricane'],
    type: 'NATURAL_DISASTER',
    severity: 'HIGH',
    duration: 'TEMPORARY',
    affectedRegions: [],
    affectedSectors: ['Insurance', 'FMCG', 'Infrastructure'],
    sentimentImpact: -30,
  },
  // Elections / political change
  {
    keywords: ['election result', 'new government', 'prime minister', 'president elect', 'coalition', 'political crisis', 'coup'],
    type: 'POLITICAL_CHANGE',
    severity: 'MEDIUM',
    duration: 'SHORT_TERM',
    affectedRegions: [],
    affectedSectors: ['Banking', 'Infrastructure', 'Energy'],
    sentimentImpact: -10,
  },
  // Trade deals (positive)
  {
    keywords: ['trade deal', 'trade agreement', 'free trade', 'bilateral agreement', 'fta signed'],
    type: 'TRADE_DEAL',
    severity: 'MEDIUM',
    duration: 'STRUCTURAL',
    affectedRegions: [],
    affectedSectors: ['IT', 'Healthcare', 'Automobile'],
    sentimentImpact: 25,
  },
  // Global monetary policy
  {
    keywords: ['fed rate cut', 'federal reserve cut', 'ecb rate cut', 'boj rate'],
    type: 'MONETARY_POLICY',
    severity: 'HIGH',
    duration: 'SHORT_TERM',
    affectedRegions: ['USA', 'Global'],
    affectedSectors: ['Banking', 'IT', 'Real Estate'],
    sentimentImpact: 20,
  },
  {
    keywords: ['fed rate hike', 'federal reserve hike', 'hawkish fed', 'taper tantrum'],
    type: 'MONETARY_POLICY',
    severity: 'HIGH',
    duration: 'SHORT_TERM',
    affectedRegions: ['USA', 'Global'],
    affectedSectors: ['Banking', 'IT', 'Real Estate'],
    sentimentImpact: -30,
  },
]

function detectEventsFromKeywords(headlines: string[]): GeopoliticalEvent[] {
  const events: GeopoliticalEvent[] = []
  const seenTypes = new Set<string>()

  for (const headline of headlines) {
    const lower = headline.toLowerCase()

    for (const rule of KEYWORD_RULES) {
      const matchedKeyword = rule.keywords.find(kw => lower.includes(kw))
      if (!matchedKeyword) continue

      // Deduplicate: only one event per type per scan
      const dedupeKey = `${rule.type}-${rule.affectedRegions.join(',')}`
      if (seenTypes.has(dedupeKey)) continue
      seenTypes.add(dedupeKey)

      // Build sector impacts
      const sectorImpacts: Record<string, number> = {}
      for (const sector of rule.affectedSectors) {
        // Base impact from rule sentiment, adjusted per sector
        sectorImpacts[sector] = rule.sentimentImpact
      }

      events.push({
        type: rule.type,
        title: headline.substring(0, 120),
        affectedRegions: rule.affectedRegions,
        affectedSectors: rule.affectedSectors,
        severity: rule.severity,
        duration: rule.duration,
        sentimentImpact: rule.sentimentImpact,
        sectorImpacts,
        confidence: 60, // Lower confidence for keyword-based
        detectedFrom: headline,
      })
    }
  }

  return events
}

// ============================================================================
// GEMINI-BASED EVENT DETECTION (HIGHER ACCURACY)
// ============================================================================

let genAI: GoogleGenerativeAI | null = null

function getGenAI(): GoogleGenerativeAI | null {
  if (genAI) return genAI
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null
  genAI = new GoogleGenerativeAI(apiKey)
  return genAI
}

async function detectEventsWithGemini(headlines: string[]): Promise<GeopoliticalEvent[]> {
  const ai = getGenAI()
  if (!ai) return []

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' })

    const headlineList = headlines
      .slice(0, 20)
      .map((h, i) => `${i + 1}. ${h}`)
      .join('\n')

    const prompt = `You are a geopolitical risk analyst for Indian stock markets.

Analyze these news headlines and identify geopolitical events that could impact Indian markets.

Headlines:
${headlineList}

For each geopolitical event found, classify:
- type: WAR | SANCTIONS | TARIFF | REGULATION | NATURAL_DISASTER | POLITICAL_CHANGE | TRADE_DEAL | MONETARY_POLICY
- title: Short event description (max 100 chars)
- affectedRegions: Array of countries/regions involved
- affectedSectors: Array of Indian market sectors impacted (Banking, IT, Energy, Healthcare, Automobile, Metals, FMCG, Telecom, Real Estate, Infrastructure, Aviation, Defence)
- severity: LOW | MEDIUM | HIGH | CRITICAL
- duration: TEMPORARY | SHORT_TERM | STRUCTURAL
- sentimentImpact: Number from -100 to +100 (negative = bearish for Indian markets)
- confidence: Number 0-100

Consider second-order effects:
- Middle East war → crude oil spike → India (net importer) hurt
- US tariffs on India → IT/pharma exports hit
- Fed rate hike → FII outflow from India → market downturn
- China slowdown → metals demand drop → Indian metal stocks fall

Return ONLY valid JSON array (no markdown, no code blocks):
[{ "type": "...", "title": "...", ... }]

If no geopolitical events found, return empty array: []`

    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini timeout')), 15000)
      ),
    ])

    const text = result.response.text()
    return parseGeminiEvents(text)
  } catch (error: any) {
    console.error('⚠️ Gemini geopolitical detection failed:', error.message)
    return []
  }
}

function parseGeminiEvents(text: string): GeopoliticalEvent[] {
  try {
    let cleaned = text.trim()
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }

    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) return []

    const validTypes = ['WAR', 'SANCTIONS', 'TARIFF', 'REGULATION', 'NATURAL_DISASTER', 'POLITICAL_CHANGE', 'TRADE_DEAL', 'MONETARY_POLICY']
    const validSeverities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
    const validDurations = ['TEMPORARY', 'SHORT_TERM', 'STRUCTURAL']

    return parsed
      .filter((e: any) => e && e.type && validTypes.includes(e.type))
      .slice(0, 5) // Max 5 events
      .map((e: any): GeopoliticalEvent => {
        const sentimentImpact = Math.max(-100, Math.min(100, Number(e.sentimentImpact) || 0))

        // Build sector impacts from affected sectors
        const sectorImpacts: Record<string, number> = {}
        const sectors = Array.isArray(e.affectedSectors) ? e.affectedSectors : []
        for (const sector of sectors) {
          sectorImpacts[sector] = sentimentImpact
        }

        return {
          type: e.type as GeopoliticalEventType,
          title: String(e.title || '').substring(0, 120),
          affectedRegions: Array.isArray(e.affectedRegions) ? e.affectedRegions : [],
          affectedSectors: sectors,
          severity: validSeverities.includes(e.severity) ? e.severity : 'MEDIUM',
          duration: validDurations.includes(e.duration) ? e.duration : 'SHORT_TERM',
          sentimentImpact,
          sectorImpacts,
          confidence: Math.max(0, Math.min(100, Number(e.confidence) || 70)),
          detectedFrom: 'Gemini AI analysis',
        }
      })
  } catch {
    console.error('⚠️ Failed to parse Gemini geopolitical response')
    return []
  }
}

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Detect geopolitical events from news headlines.
 * Uses Gemini AI when available, falls back to keyword matching.
 * Results cached for 30 minutes.
 */
export async function detectGeopoliticalEvents(
  headlines: string[],
  forceRefresh = false
): Promise<GeopoliticalSnapshot> {
  // Check cache
  const now = Date.now()
  if (!forceRefresh && cachedSnapshot && (now - lastFetchTime) < CACHE_TTL) {
    return cachedSnapshot
  }

  if (headlines.length === 0) {
    return {
      events: [],
      overallRisk: 'LOW',
      timestamp: new Date(),
      source: 'keyword',
    }
  }

  console.log(`🌍 Scanning ${headlines.length} headlines for geopolitical events...`)

  // Try Gemini first, fall back to keywords
  let events: GeopoliticalEvent[]
  let source: 'gemini' | 'keyword' = 'keyword'

  const geminiEvents = await detectEventsWithGemini(headlines)
  if (geminiEvents.length > 0) {
    events = geminiEvents
    source = 'gemini'
    console.log(`  ✅ Gemini detected ${events.length} geopolitical events`)
  } else {
    events = detectEventsFromKeywords(headlines)
    console.log(`  ✅ Keyword detection found ${events.length} geopolitical events`)
  }

  // Calculate overall risk
  const overallRisk = calculateOverallRisk(events)

  const snapshot: GeopoliticalSnapshot = {
    events,
    overallRisk,
    timestamp: new Date(),
    source,
  }

  // Cache
  cachedSnapshot = snapshot
  lastFetchTime = now

  return snapshot
}

/**
 * Get the impact of current geopolitical events on a specific stock.
 */
export function getGeopoliticalImpactForStock(
  symbol: string,
  snapshot: GeopoliticalSnapshot
): {
  impactScore: number           // -100 to +100
  relevantEvents: GeopoliticalEvent[]
  warnings: string[]
} {
  const sectorInfo = getSectorInfo(symbol)
  if (!sectorInfo || snapshot.events.length === 0) {
    return { impactScore: 0, relevantEvents: [], warnings: [] }
  }

  const relevantEvents: GeopoliticalEvent[] = []
  const warnings: string[] = []
  let totalImpact = 0
  let impactCount = 0

  for (const event of snapshot.events) {
    // Check if event affects this stock's sector
    const sectorMatch = event.affectedSectors.some(
      s => s.toLowerCase() === sectorInfo.sector.toLowerCase()
    )

    // Check if event affects via macro factors
    const macroMatch = sectorInfo.macroFactors.some(factor => {
      const affectedSectors = MACRO_IMPACT_MAP[factor] || []
      return event.affectedSectors.some(es => affectedSectors.includes(es))
    })

    if (sectorMatch || macroMatch) {
      relevantEvents.push(event)

      // Weight by confidence and severity
      const severityWeight =
        event.severity === 'CRITICAL' ? 1.5 :
        event.severity === 'HIGH' ? 1.2 :
        event.severity === 'MEDIUM' ? 1.0 : 0.7

      const impact = event.sentimentImpact * severityWeight * (event.confidence / 100)
      totalImpact += impact
      impactCount++

      // Generate warning
      const emoji =
        event.type === 'WAR' ? '⚔️' :
        event.type === 'SANCTIONS' ? '🚫' :
        event.type === 'TARIFF' ? '📦' :
        event.type === 'REGULATION' ? '📋' :
        event.type === 'NATURAL_DISASTER' ? '🌊' :
        event.type === 'TRADE_DEAL' ? '🤝' :
        event.type === 'MONETARY_POLICY' ? '🏦' : '⚠️'

      warnings.push(`${emoji} ${event.title} — ${event.severity} severity, ${event.duration.replace('_', ' ').toLowerCase()} impact`)
    }
  }

  const impactScore = impactCount > 0
    ? Math.max(-100, Math.min(100, Math.round(totalImpact / impactCount)))
    : 0

  return { impactScore, relevantEvents, warnings }
}

// ============================================================================
// HELPERS
// ============================================================================

function calculateOverallRisk(events: GeopoliticalEvent[]): 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME' {
  if (events.length === 0) return 'LOW'

  const criticalCount = events.filter(e => e.severity === 'CRITICAL').length
  const highCount = events.filter(e => e.severity === 'HIGH').length
  const avgImpact = events.reduce((sum, e) => sum + Math.abs(e.sentimentImpact), 0) / events.length

  if (criticalCount > 0 || avgImpact > 50) return 'EXTREME'
  if (highCount >= 2 || avgImpact > 35) return 'HIGH'
  if (highCount >= 1 || avgImpact > 20) return 'MODERATE'
  return 'LOW'
}

/**
 * Get emoji for risk level
 */
export function getRiskEmoji(risk: string): string {
  switch (risk) {
    case 'EXTREME': return '🔴'
    case 'HIGH': return '🟠'
    case 'MODERATE': return '🟡'
    case 'LOW': return '🟢'
    default: return '⚪'
  }
}
