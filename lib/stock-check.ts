/**
 * Stock Check: a factual risk report card for one stock.
 *
 * It does NOT say buy or sell. Each fact carries an evidence rating:
 *   - 'strong'   volatility and liquidity: well established that they persist,
 *                so they size risk (how far it can move, whether you can exit)
 *   - 'moderate' momentum rank: documented but weak in India since 2020
 *   - 'weak'     trend and drawdown: widely used, but our own test could not
 *                show they predict returns (survivorship-biased data)
 *
 * The position-size guide turns volatility into "how much can this cost me":
 * the core of trading discipline, and the part with the strongest evidence.
 */

import { scoreMomentum, type DailyBar } from '@/lib/portfolio/momentum'
import { STOCK_MOMENTUM } from '@/lib/portfolio/config'

export type Evidence = 'strong' | 'moderate' | 'weak'
export type Severity = 'warning' | 'caution' | 'info' | 'positive'

export interface CheckItem {
  id: string
  title: string
  detail: string
  severity: Severity
  evidence: Evidence
}

export interface StockCheckResult {
  symbol: string
  asOf: string
  lastClose: number
  bars: number
  metrics: {
    return1yPct: number | null
    momentum12_1Pct: number | null
    momentumPercentile: number | null   // 0-100 within NIFTY 500
    volatilityPct: number | null
    universeMedianVolPct: number | null
    fromHigh52wPct: number | null
    maxDrawdown1yPct: number | null
    above200dma: boolean | null
    dma200SlopePct: number | null
    medianTradedValueCr: number | null
  }
  checks: CheckItem[]
  sizing: {
    capital: number
    maxLossPct: number
    maxLossAmount: number
    /** Typical 1-month move (one standard deviation), %. */
    typicalMonthMovePct: number | null
    /** Stop distance sized at 2x the typical daily move over ~10 days. */
    suggestedStopPct: number | null
    /** Position that loses maxLossAmount if the stop is hit. */
    maxPositionValue: number | null
    maxPositionPctOfCapital: number | null
    /** Position whose typical 1-month move equals maxLossAmount (no stop). */
    noStopPositionValue: number | null
  }
  context: {
    inNifty500: boolean
    industry: string | null
    inMomentumBook: boolean
  }
}

function stdev(xs: number[]): number {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1))
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Share of `sorted` (ascending) strictly below `value`, 0-100. */
export function percentileOf(sorted: number[], value: number): number {
  if (!sorted.length) return 50
  let lo = 0, hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid] < value) lo = mid + 1
    else hi = mid
  }
  return (lo / sorted.length) * 100
}

export function computeStockCheck(params: {
  symbol: string
  bars: DailyBar[]                 // oldest first
  universeScoresSorted: number[]   // NIFTY 500 momentum scores, ascending
  universeMedianVolPct: number | null
  capital: number
  maxLossPct: number               // % of capital you accept losing on this trade
  inNifty500: boolean
  industry: string | null
  inMomentumBook: boolean
}): StockCheckResult {
  const { symbol, bars, capital, maxLossPct } = params
  const n = bars.length
  const last = bars[n - 1]
  const closes = bars.map(b => b.close)
  const checks: CheckItem[] = []

  const window = (k: number) => closes.slice(Math.max(0, n - k))
  const returns = closes.slice(1).map((c, i) => c / closes[i] - 1)

  // ── Metrics ────────────────────────────────────────────────────────────
  const return1yPct = n > 252 ? (last.close / closes[n - 1 - 252] - 1) * 100 : null
  const dailyVol = returns.length >= 60 ? stdev(returns.slice(-252)) : null
  const volatilityPct = dailyVol !== null ? dailyVol * Math.sqrt(252) * 100 : null

  const high52 = Math.max(...window(252))
  const fromHigh52wPct = (last.close / high52 - 1) * 100
  let peak = -Infinity, maxDd = 0
  for (const c of window(252)) { peak = Math.max(peak, c); maxDd = Math.min(maxDd, c / peak - 1) }

  const sma = (k: number, end = n) => closes.slice(end - k, end).reduce((a, b) => a + b, 0) / k
  const dma200 = n >= 200 ? sma(200) : null
  const dma200Prev = n >= 220 ? sma(200, n - 20) : null
  const dma200SlopePct = dma200 !== null && dma200Prev !== null ? (dma200 / dma200Prev - 1) * 100 : null
  const above200dma = dma200 !== null ? last.close > dma200 : null

  const medianTradedValueCr = n >= 20
    ? median(bars.slice(-60).map(b => (b.close * b.volume) / 1e7))
    : null

  // Momentum on the same definition as the portfolio engine, without its
  // liquidity screen so any stock can be placed in the distribution
  const mom = scoreMomentum(bars, { ...STOCK_MOMENTUM, minTradedValueCr: 0 })
  const momentumScore = 'stock' in mom ? mom.stock.score : null
  const momentum12_1Pct = 'stock' in mom ? mom.stock.momentumPct : null
  const momentumPercentile = momentumScore !== null ? percentileOf(params.universeScoresSorted, momentumScore) : null

  // ── Checks ─────────────────────────────────────────────────────────────
  if (volatilityPct !== null) {
    const medVol = params.universeMedianVolPct
    const ratio = medVol ? volatilityPct / medVol : null
    checks.push({
      id: 'volatility',
      title: `Volatility ${volatilityPct.toFixed(0)}% a year${ratio ? ` (${ratio.toFixed(1)}x the NIFTY 500 median)` : ''}`,
      detail: volatilityPct > 60
        ? 'Very high. A normal month can move this stock 15-20% either way. Size small or skip.'
        : volatilityPct > 40
          ? 'High. Expect large swings; use the position-size guide below.'
          : 'Normal range for Indian stocks.',
      severity: volatilityPct > 60 ? 'warning' : volatilityPct > 40 ? 'caution' : 'info',
      evidence: 'strong',
    })
  }

  if (medianTradedValueCr !== null) {
    checks.push({
      id: 'liquidity',
      title: `Trades about ₹${medianTradedValueCr >= 1 ? medianTradedValueCr.toFixed(0) : medianTradedValueCr.toFixed(2)} Cr a day`,
      detail: medianTradedValueCr < 1
        ? 'Thin. Getting out quickly, especially in a sell-off, can cost several percent.'
        : medianTradedValueCr < 10
          ? 'Moderate. Fine for small positions; below the ₹10 Cr the momentum screen requires.'
          : 'Liquid: easy to enter and exit.',
      severity: medianTradedValueCr < 1 ? 'warning' : medianTradedValueCr < 10 ? 'caution' : 'info',
      evidence: 'strong',
    })
  }

  if (last.close < 20) {
    checks.push({
      id: 'penny',
      title: `Price ₹${last.close.toFixed(2)}`,
      detail: 'Very low-priced shares tend to be speculative and move on small orders.',
      severity: 'caution',
      evidence: 'moderate',
    })
  }

  if (momentumPercentile !== null && momentum12_1Pct !== null) {
    checks.push({
      id: 'momentum',
      title: `12-month momentum ${momentum12_1Pct >= 0 ? '+' : ''}${momentum12_1Pct.toFixed(0)}%: ranks above ${momentumPercentile.toFixed(0)}% of NIFTY 500 stocks`,
      detail: momentumPercentile >= 80
        ? 'Top fifth. Momentum has a long record, but in India it has not beaten the broad market since 2020.'
        : momentumPercentile <= 20
          ? 'Bottom fifth. The market has been marking this stock down for a year.'
          : 'Middle of the pack.',
      severity: momentumPercentile >= 80 ? 'positive' : momentumPercentile <= 20 ? 'caution' : 'info',
      evidence: 'moderate',
    })
  }

  if (above200dma !== null && dma200SlopePct !== null) {
    const falling = dma200SlopePct < 0
    checks.push({
      id: 'trend',
      title: above200dma
        ? `Above its 200-day average (${falling ? 'average still falling' : 'average rising'})`
        : `Below its 200-day average (${falling ? 'average falling' : 'average rising'})`,
      detail: !above200dma && falling
        ? 'Downtrend. Common rule of thumb to avoid; our own test could not confirm it predicts returns.'
        : above200dma && !falling
          ? 'Uptrend. Widely watched; weak evidence on its own.'
          : 'Mixed trend.',
      severity: !above200dma && falling ? 'caution' : above200dma && !falling ? 'positive' : 'info',
      evidence: 'weak',
    })
  }

  checks.push({
    id: 'drawdown',
    title: `${Math.abs(fromHigh52wPct).toFixed(0)}% below its 52-week high; worst fall this year ${Math.abs(maxDd * 100).toFixed(0)}%`,
    detail: fromHigh52wPct < -40
      ? 'Deep fall. Can mean real trouble at the company; check the news before assuming a bargain.'
      : fromHigh52wPct < -20
        ? 'Meaningful pullback from its high.'
        : 'Near its yearly high.',
    severity: fromHigh52wPct < -40 ? 'caution' : 'info',
    evidence: 'weak',
  })

  if (!params.inNifty500) {
    checks.push({
      id: 'index',
      title: 'Not in the NIFTY 500',
      detail: 'Smaller company outside the main index: less analyst coverage and usually weaker liquidity.',
      severity: 'info',
      evidence: 'moderate',
    })
  }

  // ── Position sizing ────────────────────────────────────────────────────
  const maxLossAmount = capital * (maxLossPct / 100)
  let typicalMonthMovePct: number | null = null
  let suggestedStopPct: number | null = null
  let maxPositionValue: number | null = null
  let noStopPositionValue: number | null = null
  if (dailyVol !== null && dailyVol > 0) {
    typicalMonthMovePct = dailyVol * Math.sqrt(21) * 100
    // Stop at 2 standard deviations of a 10-day move: wide enough that ordinary
    // noise rarely triggers it, capped between 4% and 25%
    suggestedStopPct = Math.min(25, Math.max(4, 2 * dailyVol * Math.sqrt(10) * 100))
    maxPositionValue = Math.min(capital, maxLossAmount / (suggestedStopPct / 100))
    noStopPositionValue = Math.min(capital, maxLossAmount / (typicalMonthMovePct / 100))
  }

  return {
    symbol,
    asOf: last.date,
    lastClose: last.close,
    bars: n,
    metrics: {
      return1yPct,
      momentum12_1Pct,
      momentumPercentile,
      volatilityPct,
      universeMedianVolPct: params.universeMedianVolPct,
      fromHigh52wPct,
      maxDrawdown1yPct: maxDd * 100,
      above200dma,
      dma200SlopePct,
      medianTradedValueCr,
    },
    checks,
    sizing: {
      capital,
      maxLossPct,
      maxLossAmount,
      typicalMonthMovePct,
      suggestedStopPct,
      maxPositionValue,
      maxPositionPctOfCapital: maxPositionValue !== null ? (maxPositionValue / capital) * 100 : null,
      noStopPositionValue,
    },
    context: { inNifty500: params.inNifty500, industry: params.industry, inMomentumBook: params.inMomentumBook },
  }
}
