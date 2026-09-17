/**
 * Morning Note Intelligence Engine
 *
 * Generates a structured "India Equity Morning Note" by aggregating:
 *   - Market regime (SMA/RSI/trend from market-regime.ts)
 *   - Macro snapshot (VIX, crude, USD/INR, global markets from macro-intelligence.ts)
 *   - FII/DII institutional flows (from smart-money-tracker.ts)
 *   - Geopolitical events (from geopolitical-monitor.ts)
 *   - Intraday index data + breadth
 *   - Sector performance
 *   - News headlines
 *
 * Output: 10-section morning note matching the reference report format.
 */

import type { RegimeAnalysis, MarketRegime } from './market-regime'
import type { MacroSnapshot } from './macro-intelligence'
import type { SmartMoneyAnalysis, FIIDIIData } from './smart-money-tracker'
import type { GeopoliticalSnapshot } from './geopolitical-monitor'
import type {
  MarketIndex,
  SectorPerformance,
  MarketBreadth,
} from './market-dashboard'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MorningNoteParams {
  indices: MarketIndex[]
  sectorPerformance: SectorPerformance[]
  breadth: MarketBreadth
  macro: MacroSnapshot | null
  regime: RegimeAnalysis | null
  smartMoney: SmartMoneyAnalysis | null
  geopolitical: GeopoliticalSnapshot | null
  newsHeadlines: string[]
  /** Pre-generated recommendations from recommendation-engine.ts (optional) */
  recommendations?: import('./recommendation-engine').RecommendationReport | null
}

export interface MarketSnapshotSection {
  nifty: { price: number; change: number; changePercent: number } | null
  bankNifty: { price: number; change: number; changePercent: number } | null
  vix: { value: number; change: number; riskLevel: string } | null
  crude: { price: number; change: number; label: string } | null
  usdInr: { rate: number; change: number; trend: string } | null
  gold: { price: number; change: number } | null
  giftNifty: null // placeholder — no data source yet
  regime: { label: MarketRegime; confidence: number } | null
}

export interface KeyDriversSection {
  drivers: string[]
  source: string
}

export interface GeopoliticalSection {
  riskLevel: string
  events: Array<{ type: string; title: string; severity: string; sentimentImpact: number }>
  summary: string
}

export interface InstitutionalFlowsSection {
  fiiNet: number | null
  diiNet: number | null
  fiiTrend: string | null
  diiTrend: string | null
  fiiConsecutiveDays: number
  diiConsecutiveDays: number
  signal: string | null
  confidence: number
  summary: string
}

export type SectorCall = 'BUY' | 'TACTICAL' | 'CAUTIOUS' | 'AVOID'

export interface SectorCallEntry {
  sector: string
  call: SectorCall
  rationale: string
  change: number
}

export interface SectorCallsSection {
  calls: SectorCallEntry[]
}

export interface TechnicalLevel {
  label: string
  value: number
}

export interface TechnicalLevelsSection {
  nifty: { supports: TechnicalLevel[]; resistances: TechnicalLevel[] } | null
  bankNifty: { supports: TechnicalLevel[]; resistances: TechnicalLevel[] } | null
}

export interface FxCommoditiesSection {
  crude: { price: number; change: number; outlook: string } | null
  gold: { price: number; change: number; outlook: string } | null
  usdInr: { rate: number; change: number; outlook: string } | null
  usMarkets: { direction: string; sp500Change: number } | null
  asianMarkets: { direction: string } | null
}

export interface RiskScenario {
  label: 'Bull' | 'Base' | 'Bear'
  probability: number
  niftyTarget: string
  triggers: string[]
  sectorImplications: string[]
}

export interface StockPick {
  symbol: string
  cmp: number
  direction: 'LONG' | 'SHORT'
  entry: string          // e.g. "₹280-285"
  target1: string
  target2: string
  stopLoss: string
  rationale: string
}

export interface StockRecommendationsSection {
  intraday: StockPick[]    // Intraday picks
  swing: StockPick[]       // Swing trades (3-10 days)
  mediumTerm: StockPick[]  // Medium-term positions (1-3 months)
}

export interface PlaybookSection {
  dos: string[]
  donts: string[]
}

export interface SentimentV2 {
  overall: 'VERY_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'VERY_BEARISH'
  score: number // 0-100
  components: {
    regime: number
    vixMacro: number
    fiiDii: number
    technicals: number
    breadth: number
    newsGeo: number
    sectors: number
  }
  overrides: string[] // active override descriptions
  recommendation: string
}

export interface MorningNote {
  marketSnapshot: MarketSnapshotSection
  keyDrivers: KeyDriversSection
  geopolitical: GeopoliticalSection
  institutionalFlows: InstitutionalFlowsSection
  sectorCalls: SectorCallsSection
  technicalLevels: TechnicalLevelsSection
  stockRecommendations: StockRecommendationsSection
  fxCommodities: FxCommoditiesSection
  riskScenarios: RiskScenario[]
  playbook: PlaybookSection
  sentiment: SentimentV2
  generatedAt: string
}

// ─── Main Generator ──────────────────────────────────────────────────────────

export function generateMorningNote(params: MorningNoteParams): MorningNote {
  const { indices, sectorPerformance, breadth, macro, regime, smartMoney, geopolitical, newsHeadlines, recommendations } = params

  const niftyIndex = indices.find(i => i.name === 'NIFTY' || i.symbol === 'NIFTY50' || i.name.includes('NIFTY'))
  const bankNiftyIndex = indices.find(i => i.name === 'BANK' || i.symbol === 'BANKNIFTY' || i.name.includes('BANK'))

  return {
    marketSnapshot: buildMarketSnapshot(niftyIndex, bankNiftyIndex, macro, regime),
    keyDrivers: buildKeyDrivers(newsHeadlines, geopolitical, macro),
    geopolitical: buildGeopoliticalSection(geopolitical),
    institutionalFlows: buildInstitutionalFlows(smartMoney),
    sectorCalls: buildSectorCalls(sectorPerformance, macro, regime, smartMoney),
    technicalLevels: buildTechnicalLevels(niftyIndex, bankNiftyIndex, regime),
    stockRecommendations: buildStockRecommendations(recommendations ?? null, regime),
    fxCommodities: buildFxCommodities(macro),
    riskScenarios: buildRiskScenarios(regime, macro, smartMoney, geopolitical),
    playbook: buildPlaybook(regime, macro, smartMoney, breadth, sectorPerformance),
    sentiment: calculateSentimentV2(params),
    generatedAt: new Date().toISOString(),
  }
}

// ─── Section 1: Market Snapshot ──────────────────────────────────────────────

function buildMarketSnapshot(
  nifty: MarketIndex | undefined,
  bankNifty: MarketIndex | undefined,
  macro: MacroSnapshot | null,
  regime: RegimeAnalysis | null,
): MarketSnapshotSection {
  return {
    nifty: nifty ? { price: nifty.current, change: nifty.change, changePercent: nifty.changePercent } : null,
    bankNifty: bankNifty ? { price: bankNifty.current, change: bankNifty.change, changePercent: bankNifty.changePercent } : null,
    vix: macro?.volatility ? { value: macro.volatility.indiaVix, change: macro.volatility.indiaVixChange, riskLevel: macro.volatility.riskLevel } : null,
    crude: macro?.commodities ? { price: macro.commodities.crudePrice, change: macro.commodities.crudeChange, label: macro.commodities.crudeLabel } : null,
    usdInr: macro?.currency ? { rate: macro.currency.usdInr, change: macro.currency.usdInrChange, trend: macro.currency.trend } : null,
    gold: macro?.commodities ? { price: macro.commodities.goldPrice, change: macro.commodities.goldChange } : null,
    giftNifty: null,
    regime: regime ? { label: regime.regime, confidence: regime.confidence } : null,
  }
}

// ─── Section 2: Key Drivers ─────────────────────────────────────────────────

function buildKeyDrivers(
  headlines: string[],
  geo: GeopoliticalSnapshot | null,
  macro: MacroSnapshot | null,
): KeyDriversSection {
  const drivers: string[] = []

  // Top 3 headlines
  for (const h of headlines.slice(0, 3)) {
    drivers.push(h)
  }

  // Geopolitical events
  if (geo && geo.events.length > 0) {
    for (const e of geo.events.slice(0, 2)) {
      drivers.push(`[${e.type}] ${e.title}`)
    }
  }

  // Macro highlights
  if (macro) {
    if (macro.volatility && macro.volatility.indiaVix > 20) {
      drivers.push(`India VIX elevated at ${macro.volatility.indiaVix.toFixed(1)} — ${macro.volatility.riskLevel} risk`)
    }
    if (macro.commodities && Math.abs(macro.commodities.crudeChange) > 2) {
      const dir = macro.commodities.crudeChange > 0 ? 'surging' : 'falling'
      drivers.push(`Crude oil ${dir} ${Math.abs(macro.commodities.crudeChange).toFixed(1)}% — impacts energy, airlines, paints`)
    }
    if (macro.usMarket && macro.usMarket.direction === 'RISK_OFF') {
      drivers.push(`US markets in RISK-OFF mode — S&P 500 ${macro.usMarket.sp500Change > 0 ? '+' : ''}${macro.usMarket.sp500Change.toFixed(1)}%`)
    }
  }

  return {
    drivers: drivers.length > 0 ? drivers : ['No significant drivers detected'],
    source: geo?.source === 'gemini' ? 'Gemini AI + Headlines' : 'Headline Analysis',
  }
}

// ─── Section 3: Geopolitical ─────────────────────────────────────────────────

function buildGeopoliticalSection(geo: GeopoliticalSnapshot | null): GeopoliticalSection {
  if (!geo || geo.events.length === 0) {
    return { riskLevel: 'LOW', events: [], summary: 'No significant geopolitical risks detected.' }
  }

  return {
    riskLevel: geo.overallRisk,
    events: geo.events.map(e => ({
      type: e.type,
      title: e.title,
      severity: e.severity,
      sentimentImpact: e.sentimentImpact,
    })),
    summary: geo.overallRisk === 'EXTREME'
      ? 'CRITICAL geopolitical risk — expect elevated volatility and risk-off flows.'
      : geo.overallRisk === 'HIGH'
      ? 'High geopolitical risk — defensive positioning recommended.'
      : geo.overallRisk === 'MODERATE'
      ? 'Moderate geopolitical risk — monitor developments closely.'
      : 'Low geopolitical risk — no material impact expected.',
  }
}

// ─── Section 4: Institutional Flows ──────────────────────────────────────────

function buildInstitutionalFlows(sm: SmartMoneyAnalysis | null): InstitutionalFlowsSection {
  if (!sm) {
    return {
      fiiNet: null, diiNet: null, fiiTrend: null, diiTrend: null,
      fiiConsecutiveDays: 0, diiConsecutiveDays: 0,
      signal: null, confidence: 0,
      summary: 'Institutional flow data unavailable.',
    }
  }

  const parts: string[] = []
  if (sm.fiiTrend.direction === 'SELLING' && sm.fiiTrend.totalNet < -2000) {
    parts.push(`FIIs net sold Rs${Math.abs(sm.fiiTrend.totalNet).toLocaleString()} Cr (${sm.fiiTrend.consecutiveDays} consecutive days)`)
  } else if (sm.fiiTrend.direction === 'BUYING' && sm.fiiTrend.totalNet > 2000) {
    parts.push(`FIIs net bought Rs${sm.fiiTrend.totalNet.toLocaleString()} Cr (${sm.fiiTrend.consecutiveDays} consecutive days)`)
  }

  if (sm.diiTrend.direction === 'BUYING' && sm.diiTrend.totalNet > 1000) {
    parts.push(`DIIs providing support with Rs${sm.diiTrend.totalNet.toLocaleString()} Cr net buying`)
  }

  return {
    fiiNet: sm.latestFIIDII?.fiiNetValue ?? null,
    diiNet: sm.latestFIIDII?.diiNetValue ?? null,
    fiiTrend: sm.fiiTrend.direction,
    diiTrend: sm.diiTrend.direction,
    fiiConsecutiveDays: sm.fiiTrend.consecutiveDays,
    diiConsecutiveDays: sm.diiTrend.consecutiveDays,
    signal: sm.overallSignal,
    confidence: sm.confidence,
    summary: parts.length > 0 ? parts.join('. ') + '.' : `Institutional flows: ${sm.overallSignal} (${sm.confidence}% confidence).`,
  }
}

// ─── Section 5: Sector Calls ─────────────────────────────────────────────────

function buildSectorCalls(
  sectors: SectorPerformance[],
  macro: MacroSnapshot | null,
  regime: RegimeAnalysis | null,
  sm: SmartMoneyAnalysis | null,
): SectorCallsSection {
  const calls: SectorCallEntry[] = []

  for (const s of sectors) {
    const macroImpact = macro?.sectorImpacts?.[s.sector] ?? 0
    const regimeBearish = regime && (regime.regime === 'BEAR' || regime.regime === 'STRONG_BEAR')

    let call: SectorCall
    let rationale: string

    // Combine intraday performance + macro impact
    const combinedScore = s.change + (macroImpact / 20) // macro impact is -100..+100, scale down

    if (combinedScore > 1.5 && !regimeBearish) {
      call = 'BUY'
      rationale = `+${s.change.toFixed(1)}% today${macroImpact > 10 ? ', macro tailwinds' : ''}. Top gainer: ${s.topGainer}.`
    } else if (combinedScore > 0.3) {
      call = 'TACTICAL'
      rationale = `${s.change >= 0 ? '+' : ''}${s.change.toFixed(1)}% today. Selective opportunities in ${s.topGainer}.`
    } else if (combinedScore > -1.0) {
      call = 'CAUTIOUS'
      rationale = `${s.change.toFixed(1)}% today${macroImpact < -10 ? ', macro headwinds' : ''}. Wait for clarity.`
    } else {
      call = 'AVOID'
      rationale = `${s.change.toFixed(1)}% today${macroImpact < -20 ? ', significant macro headwinds' : ''}. Worst performer: ${s.topLoser}.`
    }

    // Override: in STRONG_BEAR regime, cap at TACTICAL
    if (regimeBearish && call === 'BUY') {
      call = 'TACTICAL'
      rationale += ' (Capped: bear market regime.)'
    }

    calls.push({ sector: s.sector, call, rationale, change: s.change })
  }

  // Sort: BUY first, AVOID last
  const order: Record<SectorCall, number> = { BUY: 0, TACTICAL: 1, CAUTIOUS: 2, AVOID: 3 }
  calls.sort((a, b) => order[a.call] - order[b.call])

  return { calls }
}

// ─── Section 6: Technical Levels ─────────────────────────────────────────────

function buildTechnicalLevels(
  nifty: MarketIndex | undefined,
  bankNifty: MarketIndex | undefined,
  regime: RegimeAnalysis | null,
): TechnicalLevelsSection {
  function levelsFor(idx: MarketIndex | undefined, sma20?: number, sma50?: number, sma200?: number) {
    if (!idx) return null

    const price = idx.current
    const supports: TechnicalLevel[] = []
    const resistances: TechnicalLevel[] = []

    // Day low / high
    if (idx.low < price) supports.push({ label: 'Day Low', value: Math.round(idx.low) })
    if (idx.high > price) resistances.push({ label: 'Day High', value: Math.round(idx.high) })

    // Percentage levels
    supports.push({ label: '-1%', value: Math.round(price * 0.99) })
    supports.push({ label: '-2%', value: Math.round(price * 0.98) })
    resistances.push({ label: '+1%', value: Math.round(price * 1.01) })
    resistances.push({ label: '+2%', value: Math.round(price * 1.02) })

    // SMA levels if available
    if (sma20 && sma20 < price) supports.push({ label: 'SMA20', value: Math.round(sma20) })
    if (sma20 && sma20 > price) resistances.push({ label: 'SMA20', value: Math.round(sma20) })
    if (sma50 && sma50 < price) supports.push({ label: 'SMA50', value: Math.round(sma50) })
    if (sma50 && sma50 > price) resistances.push({ label: 'SMA50', value: Math.round(sma50) })
    if (sma200 && sma200 < price) supports.push({ label: 'SMA200', value: Math.round(sma200) })
    if (sma200 && sma200 > price) resistances.push({ label: 'SMA200', value: Math.round(sma200) })

    // Sort supports descending (nearest first), resistances ascending
    supports.sort((a, b) => b.value - a.value)
    resistances.sort((a, b) => a.value - b.value)

    return { supports: supports.slice(0, 4), resistances: resistances.slice(0, 4) }
  }

  return {
    nifty: levelsFor(nifty, regime?.sma20 ?? undefined, regime?.sma50 ?? undefined, regime?.sma200 ?? undefined),
    bankNifty: levelsFor(bankNifty),
  }
}

// ─── Section 7 (FX & Commodities) ───────────────────────────────────────────

function buildFxCommodities(macro: MacroSnapshot | null): FxCommoditiesSection {
  if (!macro) {
    return { crude: null, gold: null, usdInr: null, usMarkets: null, asianMarkets: null }
  }

  const crudeOutlook = macro.commodities.crudeChange > 3 ? 'Spiking — negative for India (net importer)'
    : macro.commodities.crudeChange < -3 ? 'Falling — positive for India, eases fiscal pressure'
    : 'Stable — no major impact'

  const goldOutlook = macro.commodities.goldChange > 2 ? 'Rising — risk-off signal, safe haven bid'
    : macro.commodities.goldChange < -2 ? 'Falling — risk-on rotation out of safe havens'
    : 'Stable'

  const fxOutlook = macro.currency.trend === 'WEAKENING' ? 'INR weakening — pressure on importers, benefits IT/pharma exporters'
    : macro.currency.trend === 'STRENGTHENING' ? 'INR strengthening — benefits importers, headwind for exporters'
    : 'INR stable — no major currency impact'

  return {
    crude: { price: macro.commodities.crudePrice, change: macro.commodities.crudeChange, outlook: crudeOutlook },
    gold: { price: macro.commodities.goldPrice, change: macro.commodities.goldChange, outlook: goldOutlook },
    usdInr: { rate: macro.currency.usdInr, change: macro.currency.usdInrChange, outlook: fxOutlook },
    usMarkets: { direction: macro.usMarket.direction, sp500Change: macro.usMarket.sp500Change },
    asianMarkets: macro.asianMarkets ? { direction: macro.asianMarkets.direction } : null,
  }
}

// ─── Section 8: Risk Scenarios ───────────────────────────────────────────────

function buildRiskScenarios(
  regime: RegimeAnalysis | null,
  macro: MacroSnapshot | null,
  sm: SmartMoneyAnalysis | null,
  geo: GeopoliticalSnapshot | null,
): RiskScenario[] {
  const vix = macro?.volatility?.indiaVix ?? 15
  const regimeLabel = regime?.regime ?? 'SIDEWAYS'
  const regimeConf = regime?.confidence ?? 50
  const geoRisk = geo?.overallRisk ?? 'LOW'
  const fiiSelling = sm?.fiiTrend?.direction === 'SELLING'
  const niftyPrice = regime?.niftyPrice ?? 22000

  // Base probabilities adjusted by regime + VIX + geopolitics
  let bullProb = 30
  let baseProb = 45
  let bearProb = 25

  // Regime adjustments
  if (regimeLabel === 'STRONG_BULL') { bullProb += 25; bearProb -= 15 }
  else if (regimeLabel === 'BULL') { bullProb += 15; bearProb -= 10 }
  else if (regimeLabel === 'BEAR') { bearProb += 15; bullProb -= 10 }
  else if (regimeLabel === 'STRONG_BEAR') { bearProb += 25; bullProb -= 15 }

  // VIX adjustments
  if (vix > 30) { bearProb += 15; bullProb -= 10 }
  else if (vix > 25) { bearProb += 10; bullProb -= 5 }
  else if (vix < 13) { bullProb += 5 }

  // Geopolitical adjustments
  if (geoRisk === 'EXTREME') { bearProb += 15; bullProb -= 10 }
  else if (geoRisk === 'HIGH') { bearProb += 10; bullProb -= 5 }

  // FII selling pressure
  if (fiiSelling && sm && sm.fiiTrend.totalNet < -5000) {
    bearProb += 10; bullProb -= 5
  }

  // Normalize to 100%
  const total = bullProb + baseProb + bearProb
  bullProb = Math.round((bullProb / total) * 100)
  bearProb = Math.round((bearProb / total) * 100)
  baseProb = 100 - bullProb - bearProb

  // Scenario targets
  const bullTarget = `${Math.round(niftyPrice * 1.02)}-${Math.round(niftyPrice * 1.04)}`
  const baseTarget = `${Math.round(niftyPrice * 0.99)}-${Math.round(niftyPrice * 1.015)}`
  const bearTarget = `${Math.round(niftyPrice * 0.95)}-${Math.round(niftyPrice * 0.98)}`

  return [
    {
      label: 'Bull',
      probability: bullProb,
      niftyTarget: bullTarget,
      triggers: buildBullTriggers(macro, sm, geo),
      sectorImplications: ['Banking, IT, Auto rally', 'FII buying resumes', 'Risk-on across board'],
    },
    {
      label: 'Base',
      probability: baseProb,
      niftyTarget: baseTarget,
      triggers: ['Range-bound trading', 'Mixed global cues', 'Stock-specific action dominates'],
      sectorImplications: ['Selective sector rotation', 'Defensives hold', 'Quality over momentum'],
    },
    {
      label: 'Bear',
      probability: bearProb,
      niftyTarget: bearTarget,
      triggers: buildBearTriggers(macro, sm, geo),
      sectorImplications: ['Broad selling pressure', 'FII outflows accelerate', 'Defensives outperform'],
    },
  ]
}

function buildBullTriggers(macro: MacroSnapshot | null, sm: SmartMoneyAnalysis | null, geo: GeopoliticalSnapshot | null): string[] {
  const triggers: string[] = []
  if (macro?.volatility && macro.volatility.indiaVix > 20) triggers.push('VIX drops below 18')
  if (sm?.fiiTrend?.direction === 'SELLING') triggers.push('FII selling reverses to buying')
  if (geo && geo.overallRisk !== 'LOW') triggers.push('Geopolitical de-escalation')
  if (macro?.usMarket?.direction === 'RISK_OFF') triggers.push('US markets recover')
  if (triggers.length === 0) triggers.push('Momentum continues', 'Positive global cues')
  return triggers
}

function buildBearTriggers(macro: MacroSnapshot | null, sm: SmartMoneyAnalysis | null, geo: GeopoliticalSnapshot | null): string[] {
  const triggers: string[] = []
  if (macro?.commodities && macro.commodities.crudeChange > 0) triggers.push('Crude oil spikes further')
  if (macro?.volatility && macro.volatility.indiaVix < 25) triggers.push('VIX spikes above 25')
  if (sm?.fiiTrend?.direction === 'BUYING') triggers.push('FII buying reverses to selling')
  if (geo && geo.overallRisk === 'LOW') triggers.push('Geopolitical escalation')
  if (triggers.length === 0) triggers.push('Global risk-off event', 'Sharp FII outflows')
  return triggers
}

// ─── Section 9: Playbook ─────────────────────────────────────────────────────

function buildPlaybook(
  regime: RegimeAnalysis | null,
  macro: MacroSnapshot | null,
  sm: SmartMoneyAnalysis | null,
  breadth: MarketBreadth,
  sectors: SectorPerformance[],
): PlaybookSection {
  const dos: string[] = []
  const donts: string[] = []
  const regimeLabel = regime?.regime ?? 'SIDEWAYS'
  const vix = macro?.volatility?.indiaVix ?? 15
  const bullishSectors = sectors.filter(s => s.sentiment === 'BULLISH').map(s => s.sector)
  const bearishSectors = sectors.filter(s => s.sentiment === 'BEARISH').map(s => s.sector)

  // Regime-based
  if (regimeLabel === 'STRONG_BEAR' || regimeLabel === 'BEAR') {
    dos.push('Preserve capital — reduce long exposure to 30-50%')
    dos.push('Focus on high-quality defensives (FMCG, Pharma, Utilities)')
    dos.push('Use trailing stop-losses on all positions')
    donts.push('Do NOT buy dips aggressively in a bear regime')
    donts.push('Do NOT hold leveraged long positions overnight')
    donts.push('Do NOT ignore stop-losses — discipline is survival')
  } else if (regimeLabel === 'SIDEWAYS') {
    dos.push('Trade the range — buy near support, sell near resistance')
    dos.push('Focus on stock-specific catalysts over broad market bets')
    dos.push('Keep position sizes moderate')
    donts.push('Do NOT chase breakouts without volume confirmation')
    donts.push('Do NOT oversize positions in a choppy market')
  } else {
    dos.push('Stay invested — ride the trend with trailing stops')
    dos.push('Add to winners on pullbacks to moving averages')
    if (bullishSectors.length > 0) {
      dos.push(`Focus on leading sectors: ${bullishSectors.slice(0, 3).join(', ')}`)
    }
    donts.push('Do NOT short the market against the trend')
    donts.push('Do NOT rotate too frequently — let winners run')
  }

  // VIX-based
  if (vix > 25) {
    dos.push('Hedge with index puts or reduce position sizes')
    donts.push('Do NOT ignore elevated VIX — reduce overnight risk')
  }

  // FII-based
  if (sm?.fiiTrend?.direction === 'SELLING' && sm.fiiTrend.totalNet < -3000) {
    donts.push('Do NOT fight sustained FII selling — wait for flow reversal')
  }

  // Breadth-based
  if (breadth.advanceDeclineRatio < 0.5) {
    donts.push('Do NOT assume bottom — broad weakness = more downside risk')
  }

  // Bearish sectors
  if (bearishSectors.length > 0) {
    donts.push(`Avoid weak sectors: ${bearishSectors.slice(0, 3).join(', ')}`)
  }

  return { dos: dos.slice(0, 6), donts: donts.slice(0, 6) }
}

// ─── Section 7b: Stock Recommendations ──────────────────────────────────────

function buildStockRecommendations(
  report: import('./recommendation-engine').RecommendationReport | null,
  regime: RegimeAnalysis | null,
): StockRecommendationsSection {
  const empty: StockRecommendationsSection = { intraday: [], swing: [], mediumTerm: [] }
  if (!report) return empty

  const regimeBearish = regime && (regime.regime === 'BEAR' || regime.regime === 'STRONG_BEAR')
  const allPicks = report.topPicks || []

  // Helper to format price as range string
  const priceRange = (price: number, pctLow: number, pctHigh: number) =>
    `₹${Math.round(price * (1 + pctLow))}-${Math.round(price * (1 + pctHigh))}`

  const toStockPick = (rec: import('./recommendation-engine').StockRecommendation, timeframe: 'intraday' | 'swing' | 'medium'): StockPick => {
    // Estimate CMP from the trade plan or macro data
    // The recommendation engine doesn't carry CMP directly, but conviction + macro alignment gives us direction
    const conviction = rec.conviction
    const baseEntry = rec.tradePlan.suggestedAction

    // Derive approximate levels from conviction and macro alignment
    // In practice these come from the master scorer / momentum scanner when available
    const entryStr = baseEntry || `Enter on pullback`
    const isBuy = rec.action === 'STRONG_BUY' || rec.action === 'BUY'

    return {
      symbol: rec.symbol,
      cmp: 0, // Will be filled by caller if quote data available
      direction: isBuy ? 'LONG' : 'SHORT',
      entry: entryStr,
      target1: rec.tradePlan.timeframe.includes('day') ? '+1.5%' : '+3-5%',
      target2: rec.tradePlan.timeframe.includes('day') ? '+2.5%' : '+6-10%',
      stopLoss: rec.tradePlan.riskNote || 'SL at 2.5% below entry',
      rationale: rec.thesis.oneLiner,
    }
  }

  // Sort by conviction descending
  const sorted = [...allPicks].sort((a, b) => b.conviction - a.conviction)

  // Intraday: top 3-4 highest conviction BUY picks (skip in strong bear)
  const intradayPicks = regimeBearish
    ? sorted.filter(r => r.action === 'BUY' || r.action === 'STRONG_BUY').slice(0, 2)
    : sorted.filter(r => r.action === 'BUY' || r.action === 'STRONG_BUY').slice(0, 4)
  const intraday = intradayPicks.map(r => toStockPick(r, 'intraday'))

  // Swing (3-10d): next set of picks with moderate conviction
  const swingPool = sorted.filter(r =>
    (r.action === 'BUY' || r.action === 'STRONG_BUY') &&
    !intradayPicks.includes(r)
  ).slice(0, 4)
  const swing = swingPool.map(r => toStockPick(r, 'swing'))

  // Medium-term (1-3mo): high-conviction picks with macro tailwinds
  const mediumPool = sorted.filter(r =>
    (r.action === 'STRONG_BUY') &&
    r.macroAlignmentScore > 20 &&
    !intradayPicks.includes(r) &&
    !swingPool.includes(r)
  ).slice(0, 3)
  const mediumTerm = mediumPool.map(r => ({
    ...toStockPick(r, 'medium'),
    target1: '+5-8%',
    target2: '+10-15%',
    stopLoss: 'SL at 5% below entry',
  }))

  return { intraday, swing, mediumTerm }
}

// ─── Sentiment V2 ────────────────────────────────────────────────────────────

/**
 * Weighted multi-source sentiment with hard override rules.
 *
 * Weights:
 *   Regime 25% | VIX+Macro 20% | FII/DII 15% | Technicals 15% |
 *   Breadth 10% | News+Geo 10% | Sectors 5%
 *
 * Hard overrides:
 *   VIX > 25 → max 45 (NEUTRAL)
 *   VIX > 30 → max 35 (BEARISH)
 *   Regime STRONG_BEAR → max 40
 *   NIFTY intraday < -3% → max 15
 *   FII selling > 3000 Cr for 3+ days AND regime BEAR → max 30
 */
export function calculateSentimentV2(params: MorningNoteParams): SentimentV2 {
  const { indices, breadth, macro, regime, smartMoney, geopolitical, sectorPerformance } = params

  const nifty = indices.find(i => i.name === 'NIFTY' || i.symbol === 'NIFTY50' || i.name.includes('NIFTY'))
  const overrides: string[] = []

  // ── Component scores (0-100, 50 = neutral) ──

  // 1. Regime (25%)
  let regimeScore = 50
  if (regime) {
    switch (regime.regime) {
      case 'STRONG_BULL': regimeScore = 90; break
      case 'BULL': regimeScore = 72; break
      case 'SIDEWAYS': regimeScore = 50; break
      case 'BEAR': regimeScore = 28; break
      case 'STRONG_BEAR': regimeScore = 10; break
    }
  }

  // 2. VIX + Macro (20%)
  let vixMacroScore = 50
  if (macro) {
    const vix = macro.volatility?.indiaVix ?? 15
    // VIX component
    if (vix < 13) vixMacroScore = 75
    else if (vix < 18) vixMacroScore = 60
    else if (vix < 22) vixMacroScore = 45
    else if (vix < 28) vixMacroScore = 30
    else vixMacroScore = 15

    // US market direction
    if (macro.usMarket.direction === 'RISK_ON') vixMacroScore += 10
    else if (macro.usMarket.direction === 'RISK_OFF') vixMacroScore -= 10

    // Crude oil impact on India (net importer)
    if (macro.commodities.crudeChange > 5) vixMacroScore -= 10
    else if (macro.commodities.crudeChange < -5) vixMacroScore += 5

    vixMacroScore = clamp(vixMacroScore, 0, 100)
  }

  // 3. FII/DII (15%)
  let fiiDiiScore = 50
  if (smartMoney) {
    switch (smartMoney.overallSignal) {
      case 'STRONG_BULLISH': fiiDiiScore = 85; break
      case 'BULLISH': fiiDiiScore = 68; break
      case 'NEUTRAL': fiiDiiScore = 50; break
      case 'BEARISH': fiiDiiScore = 32; break
      case 'STRONG_BEARISH': fiiDiiScore = 15; break
    }
  }

  // 4. Intraday Technicals (15%)
  let technicalsScore = 50
  if (nifty) {
    const pct = nifty.changePercent
    if (pct > 2) technicalsScore = 85
    else if (pct > 1) technicalsScore = 70
    else if (pct > 0.3) technicalsScore = 58
    else if (pct > -0.3) technicalsScore = 50
    else if (pct > -1) technicalsScore = 40
    else if (pct > -2) technicalsScore = 28
    else technicalsScore = 12
  }

  // 5. Market Breadth (10%)
  let breadthScore = 50
  const ad = breadth.advanceDeclineRatio
  if (ad > 2.5) breadthScore = 85
  else if (ad > 1.5) breadthScore = 68
  else if (ad > 0.8) breadthScore = 50
  else if (ad > 0.5) breadthScore = 32
  else breadthScore = 15

  // 6. News + Geopolitical (10%)
  let newsGeoScore = 50
  if (geopolitical) {
    switch (geopolitical.overallRisk) {
      case 'LOW': newsGeoScore = 65; break
      case 'MODERATE': newsGeoScore = 45; break
      case 'HIGH': newsGeoScore = 25; break
      case 'EXTREME': newsGeoScore = 10; break
    }
  }

  // 7. Sectors (5%)
  let sectorsScore = 50
  const bullish = sectorPerformance.filter(s => s.change > 1.0).length
  const bearish = sectorPerformance.filter(s => s.change < -1.0).length
  const totalSectors = sectorPerformance.length || 1
  sectorsScore = clamp(50 + ((bullish - bearish) / totalSectors) * 50, 0, 100)

  // ── Weighted score ──
  let score = Math.round(
    regimeScore * 0.25 +
    vixMacroScore * 0.20 +
    fiiDiiScore * 0.15 +
    technicalsScore * 0.15 +
    breadthScore * 0.10 +
    newsGeoScore * 0.10 +
    sectorsScore * 0.05
  )

  // ── Hard overrides ──
  const vix = macro?.volatility?.indiaVix ?? 0

  if (nifty && nifty.changePercent < -3) {
    score = Math.min(score, 15)
    overrides.push(`NIFTY crash override: ${nifty.changePercent.toFixed(1)}% intraday — max score capped at 15`)
  }

  if (vix > 30) {
    score = Math.min(score, 35)
    overrides.push(`VIX > 30 override: VIX at ${vix.toFixed(1)} — max score capped at 35`)
  } else if (vix > 25) {
    score = Math.min(score, 45)
    overrides.push(`VIX > 25 override: VIX at ${vix.toFixed(1)} — max score capped at 45`)
  }

  if (regime?.regime === 'STRONG_BEAR') {
    score = Math.min(score, 40)
    overrides.push('STRONG_BEAR regime override — max score capped at 40')
  }

  if (
    smartMoney?.fiiTrend?.direction === 'SELLING' &&
    Math.abs(smartMoney.fiiTrend.totalNet) > 3000 &&
    smartMoney.fiiTrend.consecutiveDays >= 3 &&
    regime && (regime.regime === 'BEAR' || regime.regime === 'STRONG_BEAR')
  ) {
    score = Math.min(score, 30)
    overrides.push('FII selling 3000+ Cr for 3+ days in bear regime — max score capped at 30')
  }

  score = clamp(score, 0, 100)

  // ── Map to sentiment label ──
  let overall: SentimentV2['overall']
  let recommendation: string

  if (score >= 72) {
    overall = 'VERY_BULLISH'
    recommendation = 'Strong bullish setup. Increase long exposure. Buy quality on dips. Trail stops.'
  } else if (score >= 58) {
    overall = 'BULLISH'
    recommendation = 'Positive bias. Favor longs with momentum confirmation. Normal position sizes.'
  } else if (score >= 42) {
    overall = 'NEUTRAL'
    recommendation = 'Mixed signals. Stock-specific action. Avoid directional bets. Wait for clarity.'
  } else if (score >= 28) {
    overall = 'BEARISH'
    recommendation = 'Caution warranted. Reduce long exposure. Focus on defensives. Tighten stops.'
  } else {
    overall = 'VERY_BEARISH'
    recommendation = 'High-risk environment. Preserve capital. Minimize exposure. Consider hedging.'
  }

  return {
    overall,
    score,
    components: {
      regime: regimeScore,
      vixMacro: vixMacroScore,
      fiiDii: fiiDiiScore,
      technicals: technicalsScore,
      breadth: breadthScore,
      newsGeo: newsGeoScore,
      sectors: sectorsScore,
    },
    overrides,
    recommendation,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}
