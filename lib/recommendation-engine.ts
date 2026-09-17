/**
 * 🎯 RECOMMENDATION ENGINE
 *
 * The brain that synthesizes ALL intelligence into actionable stock picks.
 * Instead of showing raw data ("crude is up 5%"), it tells you:
 * "BUY ONGC because crude oil is up 5% which benefits upstream E&P companies,
 *  global sentiment is risk-on, VIX is low, and technicals confirm momentum."
 *
 * Data sources consumed:
 * - Macro snapshot (US markets, crude, gold, VIX, USD/INR, Asian markets)
 * - Geopolitical events (wars, tariffs, sanctions)
 * - Sector-level second-order effects
 * - Stock-specific macro alignment scores
 * - News sentiment (Gemini AI + keyword-based)
 * - Technical momentum signals (if available from scanner)
 * - Risk management constraints
 */

import { getMacroSnapshot, getMacroImpactForStock, type MacroSnapshot } from './macro-intelligence'
import { detectGeopoliticalEvents, getGeopoliticalImpactForStock, type GeopoliticalSnapshot } from './geopolitical-monitor'
import { STOCK_SECTOR_MAP, getSectorInfo, getSecondOrderImpacts, getEffectsForStock, formatSecondOrderInsights, type SectorInfo } from './sector-mapping'

// ============================================================================
// TYPES
// ============================================================================

export interface StockRecommendation {
  symbol: string
  sector: string
  industry: string
  action: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'AVOID' | 'SELL'
  conviction: number           // 0-100 (how confident)
  macroAlignmentScore: number  // -100 to +100

  // The full story — WHY this stock
  thesis: {
    oneLiner: string           // "Buy ONGC — crude oil surge benefits upstream E&P"
    summary: string            // 2-3 sentence explanation
    bullishFactors: string[]   // Why this is good (with emojis)
    bearishFactors: string[]   // What could go wrong
    macroTailwinds: string[]   // Global factors helping this stock
    macroHeadwinds: string[]   // Global factors hurting this stock
    secondOrderEffects: string[] // Non-obvious effects
    geopoliticalContext: string[] // War/tariff/sanctions impacts
  }

  // Actionable trade plan
  tradePlan: {
    suggestedAction: string    // "Enter on dips near ₹280-285 range"
    timeframe: string          // "1-5 days" or "Swing (1-2 weeks)"
    positionSizeAdvice: string // "Use 60% of normal position size (VIX elevated)"
    riskNote: string           // "Set SL at 2.5% below entry"
  }

  // Scoring breakdown (transparency)
  scoreBreakdown: {
    macroAlignment: number     // -50 to +50
    sectorMomentum: number     // -25 to +25
    geopoliticalRisk: number   // -25 to +25
    vixAdjustment: number      // -10 to +10
    currencyEffect: number     // -10 to +10
  }

  // Source data for transparency
  relevantMacroData: {
    factor: string
    value: string
    impact: string
  }[]
}

export interface RecommendationReport {
  timestamp: Date
  marketContext: {
    overallSentiment: string
    sentimentScore: number
    summary: string
    riskLevel: string
    keyFactors: string[]
  }
  topPicks: StockRecommendation[]      // Best opportunities (BUY/STRONG_BUY)
  avoidList: StockRecommendation[]     // Stocks to stay away from
  sectorOutlook: {
    sector: string
    outlook: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
    score: number
    reason: string
    topStock: string
  }[]
  geopoliticalAlerts: string[]
  generatedAt: Date
}

// ============================================================================
// CORE ENGINE
// ============================================================================

/**
 * Generate actionable stock recommendations based on ALL available intelligence.
 * This is the main entry point — call this and get back "buy THESE stocks because XYZ"
 */
export async function generateRecommendations(options?: {
  forceRefresh?: boolean
  includeAllStocks?: boolean  // Include HOLD/AVOID stocks too
}): Promise<RecommendationReport> {
  const startTime = Date.now()
  console.log('🎯 Recommendation Engine: Starting full analysis...')

  // Step 1: Fetch all intelligence in parallel
  const [macroSnapshot, geoSnapshot] = await Promise.all([
    getMacroSnapshot(options?.forceRefresh).catch(err => {
      console.error('❌ Macro fetch failed:', err)
      return null
    }),
    detectGeopoliticalEvents([], options?.forceRefresh).catch(err => {
      console.error('❌ Geopolitical fetch failed:', err)
      return null
    }),
  ])

  // Step 2: Analyze every mapped stock against current conditions
  const allStocks = Object.keys(STOCK_SECTOR_MAP)
  const recommendations: StockRecommendation[] = []

  for (const symbol of allStocks) {
    const rec = analyzeStock(symbol, macroSnapshot, geoSnapshot)
    recommendations.push(rec)
  }

  // Step 3: Sort by conviction (highest first)
  recommendations.sort((a, b) => b.conviction - a.conviction)

  // Step 4: Separate into picks and avoids
  const topPicks = recommendations.filter(r =>
    r.action === 'STRONG_BUY' || r.action === 'BUY'
  ).slice(0, 10) // Top 10 picks

  const avoidList = recommendations.filter(r =>
    r.action === 'AVOID' || r.action === 'SELL'
  ).slice(0, 5) // Top 5 to avoid

  // Step 5: Generate sector outlook
  const sectorOutlook = generateSectorOutlook(macroSnapshot, geoSnapshot)

  // Step 6: Generate geopolitical alerts
  const geoAlerts = generateGeoAlerts(geoSnapshot)

  // Step 7: Build market context
  const marketContext = buildMarketContext(macroSnapshot, geoSnapshot)

  const elapsed = Date.now() - startTime
  console.log(`🎯 Recommendation Engine: Completed in ${elapsed}ms — ${topPicks.length} picks, ${avoidList.length} avoids`)

  return {
    timestamp: new Date(),
    marketContext,
    topPicks,
    avoidList: options?.includeAllStocks ? avoidList : avoidList,
    sectorOutlook,
    geopoliticalAlerts: geoAlerts,
    generatedAt: new Date(),
  }
}

// ============================================================================
// STOCK ANALYSIS
// ============================================================================

export function analyzeStock(
  symbol: string,
  macro: MacroSnapshot | null,
  geo: GeopoliticalSnapshot | null
): StockRecommendation {
  const sectorInfo = getSectorInfo(symbol)!
  const sector = sectorInfo.sector
  const industry = sectorInfo.industry

  // ---- Score Components ----

  // 1. Macro alignment (-50 to +50)
  let macroAlignment = 0
  const macroData: StockRecommendation['relevantMacroData'] = []
  const macroTailwinds: string[] = []
  const macroHeadwinds: string[] = []
  const bullishFactors: string[] = []
  const bearishFactors: string[] = []

  if (macro) {
    const impact = getMacroImpactForStock(symbol, macro)
    // Stock-specific score is the PRIMARY driver — give it full weight
    macroAlignment = Math.round(impact.score * 0.6) // -100..+100 → -60..+60

    // Parse individual factors
    analyzeMacroFactors(symbol, sectorInfo, macro, macroTailwinds, macroHeadwinds, macroData, bullishFactors, bearishFactors)
  }

  // 2. Sector momentum (-20 to +20) — SUPPORTING signal, not primary
  let sectorMomentum = 0
  if (macro?.sectorImpacts) {
    const sectorScore = macro.sectorImpacts[sector] || 0
    sectorMomentum = Math.round(sectorScore / 5) // -100..+100 → -20..+20

    // KEY INSIGHT: When stock diverges from sector, that's an opportunity
    if (macroAlignment > 10 && sectorMomentum < -5) {
      bullishFactors.push(`🔀 ${symbol} is an OUTLIER in ${sector} — benefits even while sector struggles`)
      // Reduce sector drag when stock specifically benefits
      sectorMomentum = Math.round(sectorMomentum * 0.3)
    } else if (macroAlignment < -10 && sectorMomentum > 5) {
      bearishFactors.push(`🔀 ${symbol} faces headwinds even though ${sector} sector is positive`)
      sectorMomentum = Math.round(sectorMomentum * 0.3)
    } else if (sectorScore > 20) {
      bullishFactors.push(`📊 ${sector} sector receiving macro tailwind (+${sectorScore.toFixed(0)})`)
    } else if (sectorScore < -20) {
      bearishFactors.push(`📊 ${sector} sector under macro pressure (${sectorScore.toFixed(0)})`)
    }
  }

  // 3. Geopolitical risk (-25 to +25)
  let geopoliticalRisk = 0
  const geoContext: string[] = []
  if (geo && geo.events.length > 0) {
    const geoImpact = getGeopoliticalImpactForStock(symbol, geo)
    geopoliticalRisk = Math.round(geoImpact.impactScore / 4) // -100..+100 → -25..+25
    geoContext.push(...geoImpact.warnings)

    if (geoImpact.impactScore > 15) {
      bullishFactors.push(`🌍 Geopolitical events favor this stock (+${geoImpact.impactScore.toFixed(0)})`)
    } else if (geoImpact.impactScore < -15) {
      bearishFactors.push(`🌍 Geopolitical risk negative for this stock (${geoImpact.impactScore.toFixed(0)})`)
    }
  }

  // 4. VIX adjustment (-10 to +10)
  let vixAdjustment = 0
  if (macro) {
    const vix = macro.volatility.indiaVix
    if (vix > 30) {
      vixAdjustment = -10
      bearishFactors.push(`⚠️ Extreme VIX (${vix.toFixed(1)}) — market in panic mode`)
    } else if (vix > 25) {
      vixAdjustment = -7
      bearishFactors.push(`⚠️ High VIX (${vix.toFixed(1)}) — elevated fear`)
    } else if (vix > 20) {
      vixAdjustment = -3
      bearishFactors.push(`⚡ VIX elevated (${vix.toFixed(1)}) — caution warranted`)
    } else if (vix < 13) {
      vixAdjustment = 5
      bullishFactors.push(`✅ Low VIX (${vix.toFixed(1)}) — calm market, favorable for longs`)
    } else if (vix < 16) {
      vixAdjustment = 3
    }
  }

  // 5. Currency effect (-10 to +10) — only for meaningful moves (>0.4%)
  let currencyEffect = 0
  if (macro && Math.abs(macro.currency.usdInrChange) > 0.4) {
    const usdChange = macro.currency.usdInrChange
    const exporterSectors = ['IT', 'Healthcare', 'Chemicals']
    const importerSectors = ['Energy', 'Metals', 'Fertilizers', 'Aviation']

    if (exporterSectors.includes(sector)) {
      // IT/Pharma/Chemicals benefit from weak INR (higher USD/INR)
      currencyEffect = Math.round(usdChange * 5)
      currencyEffect = Math.max(-10, Math.min(10, currencyEffect))
      if (usdChange > 0.5) {
        macroTailwinds.push(`💰 Weak INR (USD/INR +${usdChange.toFixed(1)}%) boosts ${sector} export earnings`)
      }
    } else if (importerSectors.includes(sector)) {
      // Energy/Metals/Fertilizers hurt by weak INR (higher import costs)
      currencyEffect = Math.round(-usdChange * 3)
      currencyEffect = Math.max(-10, Math.min(10, currencyEffect))
      if (usdChange > 0.5) {
        macroHeadwinds.push(`💰 Weak INR increases import costs for ${sector}`)
      }
    }
  }

  // 6. Second-order effects
  const secondOrderEffects = getSecondOrderEffectsForStock(symbol, sectorInfo, macro)

  // ---- Total Score ----
  const totalScore = macroAlignment + sectorMomentum + geopoliticalRisk + vixAdjustment + currencyEffect
  // totalScore range: -125 to +125, normalize to -100..+100
  const normalizedScore = Math.max(-100, Math.min(100, Math.round(totalScore * 0.8)))

  // ---- Determine Action ----
  const action = determineAction(normalizedScore, macro)
  const conviction = scoreToConviction(normalizedScore, action)

  // ---- Build Thesis ----
  const thesis = buildThesis(
    symbol, sector, industry, action, normalizedScore,
    bullishFactors, bearishFactors, macroTailwinds, macroHeadwinds,
    secondOrderEffects, geoContext, macro
  )

  // ---- Trade Plan ----
  const tradePlan = buildTradePlan(action, conviction, macro)

  return {
    symbol,
    sector,
    industry,
    action,
    conviction,
    macroAlignmentScore: normalizedScore,
    thesis,
    tradePlan,
    scoreBreakdown: {
      macroAlignment,
      sectorMomentum,
      geopoliticalRisk,
      vixAdjustment,
      currencyEffect,
    },
    relevantMacroData: macroData,
  }
}

// ============================================================================
// ANALYSIS HELPERS
// ============================================================================

function analyzeMacroFactors(
  symbol: string,
  sectorInfo: SectorInfo,
  macro: MacroSnapshot,
  tailwinds: string[],
  headwinds: string[],
  macroData: StockRecommendation['relevantMacroData'],
  bullish: string[],
  bearish: string[]
) {
  const sector = sectorInfo.sector

  // US Market impact
  const usDirection = macro.usMarket.direction
  const sp500Change = macro.usMarket.sp500Change
  if (Math.abs(sp500Change) > 0.5) {
    macroData.push({
      factor: 'S&P 500',
      value: `${sp500Change > 0 ? '+' : ''}${sp500Change.toFixed(1)}%`,
      impact: usDirection === 'RISK_ON' ? 'Positive for Indian markets' : 'Negative for Indian markets',
    })
    if (usDirection === 'RISK_ON') {
      tailwinds.push(`🇺🇸 US markets up ${sp500Change.toFixed(1)}% — positive global cue`)
    } else if (usDirection === 'RISK_OFF') {
      headwinds.push(`🇺🇸 US markets down ${Math.abs(sp500Change).toFixed(1)}% — risk-off sentiment`)
    }
  }

  // Crude Oil impact
  const crudeChange = macro.commodities.crudeChange
  if (Math.abs(crudeChange) > 1) {
    const crudeDirectionWord = crudeChange > 0 ? 'up' : 'down'
    macroData.push({
      factor: 'Crude Oil',
      value: `$${macro.commodities.crudePrice.toFixed(1)} (${crudeChange > 0 ? '+' : ''}${crudeChange.toFixed(1)}%)`,
      impact: getCrudeImpactForSector(sector, crudeChange),
    })

    // Oil impact by subsector/sector — the key differentiator
    const subsector = sectorInfo.subsector
    if (subsector === 'Exploration & Production') {
      // ONGC, OIL — upstream benefits from higher crude
      if (crudeChange > 2) {
        tailwinds.push(`🛢️ Crude oil ${crudeDirectionWord} ${Math.abs(crudeChange).toFixed(1)}% — ${symbol} benefits from higher realization prices`)
        bullish.push(`🛢️ Rising crude boosts upstream E&P revenue — direct price pass-through`)
      } else if (crudeChange < -2) {
        headwinds.push(`🛢️ Crude oil falling — lower realization for upstream E&P`)
      }
    } else if (subsector === 'Refining & Marketing') {
      // BPCL, IOC, RELIANCE — refiners squeezed by rising crude
      if (crudeChange > 2) {
        headwinds.push(`🛢️ Crude oil ${crudeDirectionWord} ${Math.abs(crudeChange).toFixed(1)}% — squeezes refining margins`)
        bearish.push(`🛢️ Rising crude increases input costs — government may cap retail prices`)
      } else if (crudeChange < -2) {
        tailwinds.push(`🛢️ Crude oil falling — improves refining margins (wider GRM)`)
        bullish.push(`🛢️ Lower crude = wider GRM (gross refining margin)`)
      }
    } else if (sector === 'Aviation') {
      // Airlines — ATF is 40% of costs, HUGE crude sensitivity
      if (crudeChange > 2) {
        headwinds.push(`✈️ Crude ${crudeDirectionWord} ${Math.abs(crudeChange).toFixed(1)}% — ATF (jet fuel) = 40% of airline costs`)
        bearish.push(`✈️ Every $1/bbl crude increase costs airlines ~₹200-300 Cr annually`)
      } else if (crudeChange < -2) {
        tailwinds.push(`✈️ Crude falling — massive cost relief for airlines (ATF = 40% of costs)`)
        bullish.push(`✈️ Lower ATF prices directly boost airline profitability`)
      }
    } else if (sector === 'Paints') {
      // Asian Paints, Berger — crude derivatives = 35-40% of raw material cost
      if (crudeChange > 2) {
        headwinds.push(`🎨 Crude ${crudeDirectionWord} ${Math.abs(crudeChange).toFixed(1)}% — raises paint raw material costs (TiO2, solvents, monomers)`)
        bearish.push(`🎨 Crude-derived inputs are ~40% of paint manufacturing costs`)
      } else if (crudeChange < -2) {
        tailwinds.push(`🎨 Crude falling — lower raw material costs expand paint company margins`)
        bullish.push(`🎨 Lower crude reduces TiO2, solvent, and monomer costs — margin expansion`)
      }
    } else if (sectorInfo.industry === 'Tyre Manufacturer') {
      // MRF, Apollo, CEAT — synthetic rubber + carbon black from crude
      if (crudeChange > 2) {
        headwinds.push(`🛞 Crude ${crudeDirectionWord} ${Math.abs(crudeChange).toFixed(1)}% — raises synthetic rubber & carbon black costs`)
        bearish.push(`🛞 Tyre raw material costs (rubber + crude derivatives) = 60% of revenue`)
      } else if (crudeChange < -2) {
        tailwinds.push(`🛞 Crude falling — lower synthetic rubber and carbon black costs boost margins`)
        bullish.push(`🛞 Lower crude = significant raw material cost relief for tyre companies`)
      }
    } else if (sector === 'Chemicals') {
      // SRF, ATUL, Deepak Nitrite — crude/naphtha is feedstock
      if (crudeChange > 2) {
        headwinds.push(`🧪 Crude ${crudeDirectionWord} ${Math.abs(crudeChange).toFixed(1)}% — higher feedstock costs for chemical companies`)
        bearish.push(`🧪 Naphtha and crude derivatives are primary feedstock for specialty chemicals`)
      } else if (crudeChange < -2) {
        tailwinds.push(`🧪 Crude falling — lower feedstock costs benefit chemical manufacturers`)
        bullish.push(`🧪 Lower crude/naphtha prices reduce input costs, expand margins`)
      }
    } else if (sector === 'Logistics') {
      // Delhivery, BlueDart — diesel = 30-40% of operating cost
      if (crudeChange > 2) {
        headwinds.push(`🚛 Crude ${crudeDirectionWord} ${Math.abs(crudeChange).toFixed(1)}% — diesel costs (35% of ops) rise for logistics`)
        bearish.push(`🚛 Higher diesel prices directly impact logistics company profitability`)
      } else if (crudeChange < -2) {
        tailwinds.push(`🚛 Crude falling — lower diesel costs benefit logistics companies`)
        bullish.push(`🚛 Lower diesel = significant margin improvement (35% of operating costs)`)
      }
    } else if (sectorInfo.industry === 'Cement') {
      // Energy is 25-30% of cement production cost
      if (crudeChange > 3) {
        headwinds.push(`🏗️ Crude ${crudeDirectionWord} ${Math.abs(crudeChange).toFixed(1)}% — higher energy costs for cement production`)
        bearish.push(`🏗️ Energy (coal + petroleum coke) = 30% of cement manufacturing cost`)
      } else if (crudeChange < -3) {
        tailwinds.push(`🏗️ Crude falling — lower energy costs improve cement margins`)
      }
    } else if (sector === 'Automobile' || sector === 'Auto Ancillary') {
      if (crudeChange > 2) {
        headwinds.push(`🚗 Crude ${crudeDirectionWord} ${Math.abs(crudeChange).toFixed(1)}% — higher fuel costs reduce vehicle demand + component costs rise`)
      } else if (crudeChange < -2) {
        tailwinds.push(`🚗 Lower crude — cheaper fuel boosts vehicle demand`)
      }
    } else if (sector === 'Fertilizers') {
      // Fertilizers: natural gas (urea feedstock) is linked to crude, naphtha for complex fertilizers
      if (crudeChange > 2) {
        headwinds.push(`🌾 Crude ${crudeDirectionWord} ${Math.abs(crudeChange).toFixed(1)}% — raises gas/naphtha feedstock costs for fertilizer production`)
        bearish.push(`🌾 Natural gas & naphtha (crude-linked) are primary feedstock — higher crude = margin pressure`)
      } else if (crudeChange < -2) {
        tailwinds.push(`🌾 Crude falling — lower gas/naphtha feedstock costs improve fertilizer margins`)
        bullish.push(`🌾 Lower crude reduces input costs; government subsidy remains — double margin benefit`)
      }
    } else if (sector === 'Hotels') {
      if (crudeChange > 3) {
        headwinds.push(`🏨 Crude ${crudeDirectionWord} ${Math.abs(crudeChange).toFixed(1)}% — higher travel costs may reduce tourist footfall`)
      } else if (crudeChange < -3) {
        tailwinds.push(`🏨 Lower crude reduces travel costs — positive for tourism and hotel occupancy`)
      }
    } else if (sector === 'Travel') {
      if (crudeChange > 2) {
        headwinds.push(`✈️ Crude ${crudeDirectionWord} ${Math.abs(crudeChange).toFixed(1)}% — higher fuel surcharges dampen travel demand`)
        bearish.push(`✈️ Higher crude = higher ticket prices via fuel surcharges → demand destruction`)
      } else if (crudeChange < -2) {
        tailwinds.push(`✈️ Lower crude reduces fuel surcharges — stimulates travel demand`)
        bullish.push(`✈️ Cheaper travel costs boost demand across rail and air`)
      }
    } else if (sector === 'Infrastructure') {
      if (crudeChange > 2) {
        headwinds.push(`🏗️ Crude ${crudeDirectionWord} ${Math.abs(crudeChange).toFixed(1)}% — raises bitumen, diesel, and steel costs for infra projects`)
      } else if (crudeChange < -2) {
        tailwinds.push(`🏗️ Lower crude reduces construction input costs (bitumen, diesel, transport)`)
      }
    } else if (sector === 'FMCG') {
      if (crudeChange > 3) {
        headwinds.push(`📦 Crude ${crudeDirectionWord} ${Math.abs(crudeChange).toFixed(1)}% — higher transport + packaging costs for FMCG`)
      } else if (crudeChange < -3) {
        tailwinds.push(`📦 Lower crude reduces FMCG transport and packaging costs`)
      }
    } else if (subsector === 'Gold Loans') {
      // Gold loan NBFCs benefit when crude/inflation pushes gold up
      if (crudeChange > 3) {
        tailwinds.push(`🪙 Crude surge → inflation fears → gold prices rise → larger gold loan books`)
        bullish.push(`🪙 Higher gold prices expand loan-to-value for gold loan NBFCs`)
      }
    }
  }

  // USD/INR impact — only meaningful moves (>0.4%), not noise
  const usdChange = macro.currency.usdInrChange
  if (Math.abs(usdChange) > 0.4) {
    macroData.push({
      factor: 'USD/INR',
      value: `₹${macro.currency.usdInr.toFixed(2)} (${usdChange > 0 ? '+' : ''}${usdChange.toFixed(1)}%)`,
      impact: getCurrencyImpactForSector(sector, usdChange),
    })

    if (sector === 'IT' && usdChange > 0.4) {
      tailwinds.push(`💱 Weak INR (USD/INR +${usdChange.toFixed(1)}%) translates to higher rupee revenue for IT exporters`)
      bullish.push(`💱 Every 1% INR depreciation adds ~0.3-0.5% to IT sector revenue in INR terms`)
    } else if (sector === 'IT' && usdChange < -0.4) {
      headwinds.push(`💱 Strong INR (USD/INR ${usdChange.toFixed(1)}%) reduces IT rupee revenue`)
    } else if (sector === 'Healthcare' && usdChange > 0.4) {
      tailwinds.push(`💱 Weak INR benefits pharma exporters — 50%+ revenue is USD-denominated`)
    } else if (sector === 'Fertilizers' && usdChange > 0.4) {
      headwinds.push(`💱 Weak INR raises imported raw material costs (potash, phosphoric acid)`)
    }
  }

  // Gold impact
  const goldChange = macro.commodities.goldChange
  if (Math.abs(goldChange) > 1) {
    macroData.push({
      factor: 'Gold',
      value: `$${macro.commodities.goldPrice.toFixed(0)} (${goldChange > 0 ? '+' : ''}${goldChange.toFixed(1)}%)`,
      impact: goldChange > 2 ? 'Risk-off signal (safe haven demand)' : 'Market confidence',
    })
    if (goldChange > 3) {
      headwinds.push(`🪙 Gold surging ${goldChange.toFixed(1)}% — typically signals risk-off/fear in markets`)
    }
  }

  // Asian markets
  const nikkeiChange = macro.asianMarkets.nikkeiChange
  const hangSengChange = macro.asianMarkets.hangSengChange
  if (Math.abs(nikkeiChange) > 1 || Math.abs(hangSengChange) > 1) {
    const asianDirection = macro.asianMarkets.direction
    macroData.push({
      factor: 'Asian Markets',
      value: `Nikkei ${nikkeiChange > 0 ? '+' : ''}${nikkeiChange.toFixed(1)}%, HSI ${hangSengChange > 0 ? '+' : ''}${hangSengChange.toFixed(1)}%`,
      impact: asianDirection === 'RISK_ON' ? 'Positive Asian sentiment' : 'Weak Asian sentiment',
    })
    if (asianDirection === 'RISK_ON') {
      tailwinds.push(`🌏 Asian markets positive — regional risk appetite healthy`)
    } else if (asianDirection === 'RISK_OFF') {
      headwinds.push(`🌏 Asian markets weak — regional risk-off sentiment`)
    }
  }

  // US Yields
  if (macro.yields.us10y > 4.5) {
    macroData.push({
      factor: 'US 10Y Yield',
      value: `${macro.yields.us10y.toFixed(2)}%`,
      impact: 'High yields may attract capital away from EMs',
    })
    headwinds.push(`📈 US yields at ${macro.yields.us10y.toFixed(2)}% — FII outflows risk for Indian equities`)
    if (sector === 'Banking') {
      bullish.push(`🏦 Higher global yields → higher Indian bond yields → better bank NIMs`)
    }
  }
}

function getSecondOrderEffectsForStock(
  symbol: string,
  sectorInfo: SectorInfo,
  macro: MacroSnapshot | null
): string[] {
  if (!macro) return []

  const effects: string[] = []

  // Check crude oil effects
  if (Math.abs(macro.commodities.crudeChange) > 2) {
    const direction = macro.commodities.crudeChange > 0 ? 'UP' : 'DOWN'
    const crudeEffects = getEffectsForStock(symbol, 'Crude Oil Prices', direction)
    effects.push(...crudeEffects.map(e => `${e.order === 2 ? '2️⃣' : '1️⃣'} ${e.reasoning} (${e.impact > 0 ? '+' : ''}${e.impact})`))
  }

  // Check USD/INR effects
  if (Math.abs(macro.currency.usdInrChange) > 0.3) {
    const direction = macro.currency.usdInrChange > 0 ? 'UP' : 'DOWN'
    const fxEffects = getEffectsForStock(symbol, 'USD-INR', direction)
    effects.push(...fxEffects.map(e => `${e.order === 2 ? '2️⃣' : '1️⃣'} ${e.reasoning} (${e.impact > 0 ? '+' : ''}${e.impact})`))
  }

  // Check interest rate effects (use US yields as proxy)
  if (macro.yields.us10yChange > 0.05) {
    const rateEffects = getEffectsForStock(symbol, 'Interest Rates', 'UP')
    effects.push(...rateEffects.map(e => `${e.order === 2 ? '2️⃣' : '1️⃣'} ${e.reasoning} (${e.impact > 0 ? '+' : ''}${e.impact})`))
  }

  return effects.slice(0, 5) // Max 5 effects
}

function determineAction(score: number, macro: MacroSnapshot | null): StockRecommendation['action'] {
  // VIX-based adjustment: in extreme vol, raise the bar for BUY recommendations
  const vixPenalty = macro?.volatility?.indiaVix && macro.volatility.indiaVix > 25 ? 5 : 0

  if (score >= 30 - vixPenalty) return 'STRONG_BUY'
  if (score >= 8 - vixPenalty) return 'BUY'
  if (score >= -8) return 'HOLD'
  if (score >= -30) return 'AVOID'
  return 'SELL'
}

function scoreToConviction(score: number, action: string): number {
  // Map score range to conviction 0-100
  const absScore = Math.abs(score)

  if (action === 'STRONG_BUY' || action === 'SELL') {
    return Math.min(95, 60 + Math.round(absScore * 0.35))
  } else if (action === 'BUY' || action === 'AVOID') {
    return Math.min(80, 40 + Math.round(absScore * 0.4))
  }
  return Math.min(50, 20 + Math.round(absScore * 0.3))
}

function buildThesis(
  symbol: string,
  sector: string,
  industry: string,
  action: StockRecommendation['action'],
  score: number,
  bullish: string[],
  bearish: string[],
  tailwinds: string[],
  headwinds: string[],
  secondOrderEffects: string[],
  geoContext: string[],
  macro: MacroSnapshot | null
): StockRecommendation['thesis'] {
  // Build one-liner
  const actionWord = action === 'STRONG_BUY' ? 'Strong Buy' :
    action === 'BUY' ? 'Buy' :
    action === 'AVOID' ? 'Avoid' :
    action === 'SELL' ? 'Sell' : 'Hold'

  // Pick the most relevant factor based on action direction
  // Prefer stock-specific factors (bearish/bullish) over generic macro (headwinds/tailwinds)
  const topFactor = (action === 'AVOID' || action === 'SELL')
    ? (bearish[0] || headwinds[0] || tailwinds[0] || `${sector} sector headwinds`)
    : (bullish[0] || tailwinds[0] || headwinds[0] || `${sector} sector in focus`)
  // Clean emoji from one-liner factor
  const cleanFactor = topFactor.replace(/^[^\w]*/, '').trim()
  const oneLiner = `${actionWord} ${symbol} — ${cleanFactor}`

  // Build summary
  let summary = ''
  if (action === 'STRONG_BUY' || action === 'BUY') {
    summary = `${symbol} (${industry}) is well-positioned given current macro conditions. `
    if (tailwinds.length > 0) {
      summary += `Key tailwinds include ${cleanFactorList(tailwinds.slice(0, 2))}. `
    }
    if (bearish.length > 0) {
      summary += `Watch out for: ${cleanFactorList(bearish.slice(0, 1))}. `
    }
    const sentimentLabel = macro?.overallSentiment?.replace(/_/g, ' ').toLowerCase() || 'neutral'
    summary += `Global sentiment is ${sentimentLabel}.`
  } else if (action === 'AVOID' || action === 'SELL') {
    summary = `${symbol} (${industry}) faces significant headwinds in current conditions. `
    if (headwinds.length > 0) {
      summary += `Key concerns: ${cleanFactorList(headwinds.slice(0, 2))}. `
    }
    summary += `Risk-reward unfavorable at this time.`
  } else {
    summary = `${symbol} (${industry}) has mixed signals. `
    summary += `No strong macro alignment either way. Wait for clearer directional cues.`
  }

  return {
    oneLiner,
    summary,
    bullishFactors: bullish.length > 0 ? bullish : ['No strong bullish macro factors currently'],
    bearishFactors: bearish.length > 0 ? bearish : ['No significant bearish macro factors'],
    macroTailwinds: tailwinds,
    macroHeadwinds: headwinds,
    secondOrderEffects,
    geopoliticalContext: geoContext,
  }
}

function buildTradePlan(
  action: StockRecommendation['action'],
  conviction: number,
  macro: MacroSnapshot | null
): StockRecommendation['tradePlan'] {
  const vix = macro?.volatility?.indiaVix || 15
  const positionPct = vix > 25 ? 40 : vix > 20 ? 60 : vix > 17 ? 80 : 100

  if (action === 'STRONG_BUY') {
    return {
      suggestedAction: 'Enter on minor dips or at market open. Strong conviction setup.',
      timeframe: 'Swing trade (3-7 days)',
      positionSizeAdvice: `Use ${positionPct}% of normal position size${vix > 20 ? ' (VIX elevated)' : ''}`,
      riskNote: 'Set stop-loss at 2-2.5% below entry. Trail stops after 3% profit.',
    }
  } else if (action === 'BUY') {
    return {
      suggestedAction: 'Enter on pullbacks to support levels. Wait for volume confirmation.',
      timeframe: 'Swing trade (3-10 days)',
      positionSizeAdvice: `Use ${Math.round(positionPct * 0.8)}% of normal position size`,
      riskNote: 'Set stop-loss at 2.5-3% below entry. Book partial at 2% profit.',
    }
  } else if (action === 'AVOID') {
    return {
      suggestedAction: 'Do not initiate new long positions. Exit existing if no strong thesis.',
      timeframe: 'Stay on sidelines',
      positionSizeAdvice: 'Zero new allocation recommended',
      riskNote: 'Macro headwinds create unfavorable risk-reward.',
    }
  } else if (action === 'SELL') {
    return {
      suggestedAction: 'Exit existing positions on rallies. Consider hedging.',
      timeframe: 'Immediate action advised',
      positionSizeAdvice: 'Reduce exposure by 50-100%',
      riskNote: 'Strong macro headwinds — protect capital.',
    }
  }
  return {
    suggestedAction: 'No action. Monitor for directional clarity.',
    timeframe: 'Wait and watch',
    positionSizeAdvice: 'Hold existing, no new allocation',
    riskNote: 'Mixed signals — patience is the best strategy.',
  }
}

// ============================================================================
// SECTOR OUTLOOK
// ============================================================================

function generateSectorOutlook(
  macro: MacroSnapshot | null,
  geo: GeopoliticalSnapshot | null
): RecommendationReport['sectorOutlook'] {
  if (!macro) return []

  const sectors = new Map<string, { stocks: string[], totalImpact: number }>()

  // Group stocks by sector
  for (const [symbol, info] of Object.entries(STOCK_SECTOR_MAP)) {
    if (!sectors.has(info.sector)) {
      sectors.set(info.sector, { stocks: [], totalImpact: 0 })
    }
    const sectorData = sectors.get(info.sector)!
    sectorData.stocks.push(symbol)

    const impact = getMacroImpactForStock(symbol, macro)
    sectorData.totalImpact += impact.score
  }

  const outlook: RecommendationReport['sectorOutlook'] = []

  for (const [sector, data] of sectors) {
    const avgImpact = data.totalImpact / data.stocks.length
    const sectorImpact = macro.sectorImpacts[sector] || 0

    // Add overall macro sentiment as a base bias (scaled to ±15)
    // This ensures risk-off markets push ALL sectors toward bearish
    const sentimentBias = (macro.sentimentScore || 0) * 0.15

    // Combine: stock-level impact + sector macro impact + overall sentiment bias
    const finalScore = Math.round((avgImpact + sectorImpact + sentimentBias) / 2)

    let sectorOutlook: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
    let reason: string

    if (finalScore > 8) {
      sectorOutlook = 'BULLISH'
      reason = getSectorBullishReason(sector, macro)
    } else if (finalScore < -8) {
      sectorOutlook = 'BEARISH'
      reason = getSectorBearishReason(sector, macro)
    } else {
      sectorOutlook = 'NEUTRAL'
      reason = getNeutralSectorReason(sector, finalScore, macro)
    }

    // Find best stock in sector
    let bestStock = data.stocks[0]
    let bestScore = -Infinity
    for (const stock of data.stocks) {
      const s = getMacroImpactForStock(stock, macro).score
      if (s > bestScore) {
        bestScore = s
        bestStock = stock
      }
    }

    outlook.push({
      sector,
      outlook: sectorOutlook,
      score: finalScore,
      reason,
      topStock: bestStock,
    })
  }

  // Sort: bullish first, then neutral, then bearish
  outlook.sort((a, b) => b.score - a.score)

  return outlook
}

function getSectorBullishReason(sector: string, macro: MacroSnapshot): string {
  const crude = macro.commodities.crudePrice
  const vix = macro.volatility.indiaVix
  const usdInr = macro.currency.usdInr

  switch (sector) {
    case 'IT':
      return `Weak INR (₹${usdInr.toFixed(1)}) boosts IT export revenue. US tech spending resilient.`
    case 'Healthcare':
      return `Weak INR + stable US demand supports pharma export margins.`
    case 'Energy':
      return macro.commodities.crudeChange > 0
        ? `Rising crude ($${crude.toFixed(1)}) benefits upstream E&P. Mixed for refiners.`
        : `Falling crude improves OMC margins and reduces subsidy burden.`
    case 'Banking':
      return `Credit growth + stable rates support bank NIMs. Government policy supportive.`
    case 'Financial Services':
      return `Stable markets and credit growth benefit NBFCs and AMCs.`
    case 'Insurance':
      return `Growing insurance penetration + stable equity markets support AUM growth.`
    case 'Metals':
      return `Global demand signals positive. Infrastructure push supports steel demand.`
    case 'FMCG':
      return `Stable commodity prices protect margins. Rural demand recovery underway.`
    case 'Automobile':
      return `Lower fuel costs boost demand. Festive/rural recovery supports sales.`
    case 'Auto Ancillary':
      return `OEM order books healthy. Export demand and EV transition create new opportunities.`
    case 'Chemicals':
      return `Lower crude reduces feedstock costs. China+1 strategy brings orders to India.`
    case 'Fertilizers':
      return `Lower gas/crude prices reduce input costs. Government subsidy provides floor. Monsoon outlook positive.`
    case 'Aviation':
      return `Lower crude = lower ATF costs (40% of expenses). Passenger demand remains strong.`
    case 'Hotels':
      return `Tourism demand robust. Business travel recovery + lower fuel costs boost occupancy.`
    case 'Travel':
      return `Lower fuel surcharges stimulate travel demand. Growing middle-class travel appetite.`
    case 'Defence':
      return `Government capex push + indigenization policy. Order books at multi-year highs.`
    case 'Power':
      return `Rising electricity demand + government focus on capacity addition.`
    case 'Infrastructure':
      return `Government infra spending at record levels. Order inflows strong.`
    case 'Paints':
      return `Lower crude reduces raw material costs (TiO2, solvents). Housing demand supportive.`
    case 'Telecom':
      return `Tariff hikes improving ARPU. Data consumption growing steadily.`
    case 'Real Estate':
      return `Affordable housing demand + stable rates support property sales.`
    case 'Logistics':
      return `Lower diesel costs improve margins. E-commerce growth drives volumes.`
    case 'Retail':
      return `Consumer spending resilient. Store expansion and premiumization trends intact.`
    case 'Consumer Durables':
      return `Lower input costs + festive/cooling demand. Premiumization trend continues.`
    case 'Capital Goods':
      return `Industrial capex cycle uptick. Government + private capex orders growing.`
    default:
      return `Macro conditions favorable for ${sector}. Low volatility supports risk appetite.`
  }
}

function getSectorBearishReason(sector: string, macro: MacroSnapshot): string {
  const crude = macro.commodities.crudePrice
  const crudeDir = macro.commodities.crudeChange > 0 ? 'rising' : 'falling'
  const vix = macro.volatility.indiaVix
  const sp500 = macro.usMarket.sp500Change
  const usdInr = macro.currency.usdInr

  switch (sector) {
    case 'IT':
      return Math.abs(macro.currency.usdInrChange) > 0.4
        ? `INR movement (₹${usdInr.toFixed(1)}) pressures IT margins. US recession fears weigh on tech spending.`
        : `Global risk-off (S&P ${sp500.toFixed(1)}%) signals US slowdown — weighs on IT deal pipeline and FII sentiment.`
    case 'Energy':
      return macro.commodities.crudeChange > 0
        ? `Rising crude ($${crude.toFixed(0)}) squeezes refining margins. Government may cap retail prices.`
        : `Falling crude hurts upstream E&P realization prices.`
    case 'Banking':
      return `Risk-off sentiment (VIX ${vix.toFixed(1)}) → FII outflows from financials. Credit growth concerns.`
    case 'Financial Services':
      return `Risk-off markets (VIX ${vix.toFixed(1)}) hurt AUM-linked revenue. FII selling impacts valuations.`
    case 'Insurance':
      return `Equity market weakness reduces ULIP/equity AUM. New business growth may slow.`
    case 'Metals':
      return `Weak China demand (HSI ${macro.asianMarkets.hangSengChange > 0 ? '+' : ''}${macro.asianMarkets.hangSengChange.toFixed(1)}%) + global slowdown fears pressure metal prices.`
    case 'Automobile':
      return `High crude ($${crude.toFixed(0)}) + risk-off sentiment hurt vehicle demand and consumer confidence.`
    case 'Auto Ancillary':
      return `Auto sector headwinds cascade to component makers. Export orders at risk from global slowdown.`
    case 'Chemicals':
      return `${crudeDir} crude affects feedstock costs. Global demand weakness limits pricing power.`
    case 'Fertilizers':
      return `High crude ($${crude.toFixed(0)}) raises gas/naphtha feedstock costs. Government subsidy delays add margin pressure.`
    case 'Aviation':
      return `Crude at $${crude.toFixed(0)} raises ATF costs (40% of expenses). Yield pressure from competition.`
    case 'Hotels':
      return `Global risk-off may dampen business/leisure travel. Higher fuel costs raise tourist transport expenses.`
    case 'Travel':
      return `Rising fuel costs increase ticket prices. Global uncertainty dampens discretionary travel spending.`
    case 'Defence':
      return `Risk-off sentiment drags even policy-driven sectors. Valuation rich after prolonged rally.`
    case 'Power':
      return `Rising fuel costs pressure thermal generators. Discoms' payment delays persist.`
    case 'Infrastructure':
      return `High crude ($${crude.toFixed(0)}) raises bitumen/diesel costs. Government fiscal constraints may slow capex.`
    case 'Paints':
      return `Crude-derived raw materials (TiO2, solvents) account for ~40% of costs. Competitive intensity rising.`
    case 'Telecom':
      return `High capex (5G rollout) + competitive pricing limits free cash flow. Debt overhang persists.`
    case 'Real Estate':
      return `Rising rates increase EMI burden, dampening demand. Risk-off sentiment hurts housing sentiment.`
    case 'FMCG':
      return `Rising crude increases transport/packaging costs. Rural demand recovery still uneven.`
    case 'Logistics':
      return `Diesel at elevated levels (crude $${crude.toFixed(0)}) squeezes margins. E-commerce growth moderating.`
    case 'Retail':
      return `Consumer confidence weak in risk-off markets. Discretionary spending under pressure.`
    case 'Consumer Durables':
      return `Rising input costs (plastics, components) + weak consumer sentiment in risk-off environment.`
    case 'Capital Goods':
      return `Global slowdown fears may delay private capex decisions. Order execution challenges.`
    default:
      return `Global risk-off (S&P ${sp500.toFixed(1)}%, VIX ${vix.toFixed(1)}) creates headwinds for ${sector}.`
  }
}

function getNeutralSectorReason(sector: string, score: number, macro: MacroSnapshot): string {
  const leaning = score < -3 ? 'slightly negative' : score > 3 ? 'slightly positive' : 'mixed'
  const vix = macro.volatility.indiaVix
  const sentiment = macro.overallSentiment.replace(/_/g, ' ').toLowerCase()

  // Sector-specific neutral context
  switch (sector) {
    case 'Banking':
      return `Banking has offsetting factors — domestic credit growth steady but global risk-off (${sentiment}) caps upside. Watch RBI policy.`
    case 'Financial Services':
      return `NBFCs/AMCs face crosswinds — strong domestic AUM growth vs FII selling pressure in risk-off markets.`
    case 'Insurance':
      return `Insurance penetration growing but equity-linked products face mark-to-market pressure in volatile markets (VIX ${vix.toFixed(0)}).`
    case 'Telecom':
      return `Telecom is largely domestic/defensive — tariff hikes support ARPU but 5G capex weighs. Minimal global macro sensitivity.`
    case 'Defence':
      return `Defence is policy-driven (government orders), largely insulated from global macro. Order book visibility strong but valuations elevated.`
    case 'Fertilizers':
      return `Fertilizers: crude/gas flat today = no new input cost signal. Government subsidy provides floor. Watch monsoon forecasts for demand catalyst.`
    case 'Hotels':
      return `Hotels are in a structural upturn (tourism recovery) but short-term macro uncertainty (${sentiment}) limits momentum. Occupancy trends still healthy.`
    case 'Travel':
      return `Travel demand robust domestically but global uncertainty and fuel costs create a wait-and-watch setup. No strong directional catalyst.`
    case 'Real Estate':
      return `Real estate demand holding in affordable segment. Premium segment sensitive to rates and sentiment. No clear macro trigger.`
    case 'Retail':
      return `Consumer retail stable — discretionary spending under mild pressure from risk-off sentiment but no sharp catalyst either way.`
    case 'Metals':
      return `Metals face mixed signals — China recovery patchy (Hang Seng ${macro.asianMarkets.hangSengChange > 0 ? '+' : ''}${macro.asianMarkets.hangSengChange.toFixed(1)}%), domestic infra demand offsets global weakness.`
    case 'Capital Goods':
      return `Capital goods in secular capex upcycle but global slowdown fears and high valuations create near-term uncertainty.`
    default:
      return score < -3
        ? `${sector} faces mild headwinds from global ${sentiment} mood, but no strong sector-specific catalyst. Leaning cautious.`
        : score > 3
          ? `${sector} has mild tailwinds but not enough conviction for a directional call. Wait for stronger signals.`
          : `${sector}: no dominant macro factor at play today. Monitor for sector-specific catalysts.`
  }
}

// ============================================================================
// GEOPOLITICAL ALERTS
// ============================================================================

function generateGeoAlerts(geo: GeopoliticalSnapshot | null): string[] {
  if (!geo || geo.events.length === 0) return []

  return geo.events
    .filter(e => e.severity === 'HIGH' || e.severity === 'CRITICAL')
    .map(e => {
      const emoji = e.severity === 'CRITICAL' ? '🚨' : '⚠️'
      return `${emoji} ${e.title} — Affects: ${e.affectedSectors.join(', ')} (${e.duration})`
    })
    .slice(0, 5)
}

// ============================================================================
// MARKET CONTEXT
// ============================================================================

function buildMarketContext(
  macro: MacroSnapshot | null,
  geo: GeopoliticalSnapshot | null
): RecommendationReport['marketContext'] {
  if (!macro) {
    return {
      overallSentiment: 'NEUTRAL',
      sentimentScore: 0,
      summary: 'Macro data unavailable. Recommendations based on limited context.',
      riskLevel: 'MODERATE',
      keyFactors: ['Macro data not available'],
    }
  }

  const keyFactors: string[] = []

  // US markets
  if (Math.abs(macro.usMarket.sp500Change) > 0.5) {
    keyFactors.push(`US Markets: S&P 500 ${macro.usMarket.sp500Change > 0 ? '+' : ''}${macro.usMarket.sp500Change.toFixed(1)}%`)
  }

  // Crude
  if (Math.abs(macro.commodities.crudeChange) > 1) {
    keyFactors.push(`Crude Oil: $${macro.commodities.crudePrice.toFixed(1)} (${macro.commodities.crudeChange > 0 ? '+' : ''}${macro.commodities.crudeChange.toFixed(1)}%)`)
  }

  // VIX
  keyFactors.push(`India VIX: ${macro.volatility.indiaVix.toFixed(1)} (${macro.volatility.vixTrend})`)

  // USD/INR
  if (Math.abs(macro.currency.usdInrChange) > 0.1) {
    keyFactors.push(`USD/INR: ₹${macro.currency.usdInr.toFixed(2)} (${macro.currency.trend})`)
  }

  // Geo events
  if (geo && geo.events.length > 0) {
    const highSev = geo.events.filter(e => e.severity === 'HIGH' || e.severity === 'CRITICAL')
    if (highSev.length > 0) {
      keyFactors.push(`Geopolitical: ${highSev.length} high-severity event(s) detected`)
    }
  }

  return {
    overallSentiment: macro.overallSentiment,
    sentimentScore: macro.sentimentScore,
    summary: macro.summary,
    riskLevel: macro.volatility.riskLevel,
    keyFactors,
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

function getCrudeImpactForSector(sector: string, crudeChange: number): string {
  const direction = crudeChange > 0 ? 'rising' : 'falling'
  switch (sector) {
    case 'Energy': return crudeChange > 0 ? 'Mixed — E&P benefits, refiners squeezed' : 'Mixed — E&P hurt, refiners benefit'
    case 'Automobile': return `${direction} fuel costs ${crudeChange > 0 ? 'negative' : 'positive'} for auto demand`
    case 'FMCG': return crudeChange > 0 ? 'Slightly negative (transport/packaging costs)' : 'Slightly positive (lower costs)'
    case 'IT': return 'Minimal direct impact'
    default: return `${direction} crude — ${crudeChange > 0 ? 'inflation risk' : 'cost relief'}`
  }
}

function getCurrencyImpactForSector(sector: string, usdChange: number): string {
  if (sector === 'IT' || sector === 'Healthcare') {
    return usdChange > 0 ? 'Positive — export earnings increase in INR' : 'Negative — lower rupee revenue'
  }
  if (sector === 'Energy') {
    return usdChange > 0 ? 'Negative — import costs rise' : 'Positive — import costs fall'
  }
  return 'Indirect impact via FII flows'
}

function cleanFactorList(factors: string[]): string {
  return factors
    .map(f => f.replace(/^[^\w]*/, '').trim())
    .join(' and ')
}
