/**
 * Stock characteristics ("factors") that can be computed from daily bars,
 * and a cross-sectional ranking on one or several of them.
 *
 * Definitions follow the published research with standard settings; nothing
 * here was tuned on our own backtests. The research harness
 * (lib/research) and the live app rank with this same code.
 */
import { STOCK_MOMENTUM } from './config'
import type { DailyBar } from './momentum'

export type FactorId = 'momentum' | 'momentumRaw' | 'momentum6m' | 'lowVolatility' | 'high52w' | 'deliveryRise'

const YEAR = 252
const MONTH = 21

function stdev(xs: number[]): number {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (xs.length - 1))
}

/** Annualised volatility of daily returns over the last `window` bars. */
export function annualVolatility(bars: DailyBar[], window = YEAR): number | null {
  const n = bars.length
  if (n < window + 1) return null
  const returns: number[] = []
  for (let i = n - window; i < n; i++) returns.push(bars[i].close / bars[i - 1].close - 1)
  const vol = stdev(returns) * Math.sqrt(YEAR)
  return vol > 0 ? vol : null
}

/** Return from `lookback` bars ago to `skip` bars ago. */
function pastReturn(bars: DailyBar[], lookback: number, skip: number): number | null {
  const n = bars.length
  if (n < lookback + 1) return null
  const past = bars[n - 1 - lookback].close, recent = bars[n - 1 - skip].close
  return past > 0 && recent > 0 ? recent / past - 1 : null
}

/** Share of traded volume taken into delivery over bars [from, to). Null without delivery data. */
function deliveryShare(bars: DailyBar[], from: number, to: number): number | null {
  let delivered = 0, traded = 0
  for (let i = from; i < to; i++) {
    const d = bars[i].deliveryQty
    if (d == null || !(bars[i].volume > 0)) continue
    delivered += d
    traded += bars[i].volume
  }
  return traded > 0 ? delivered / traded : null
}

export interface FactorDefinition {
  label: string
  /** What it measures and where the idea comes from. */
  basis: string
  /** Higher is better. Null when the stock cannot be scored. `bars` are oldest first. */
  score(bars: DailyBar[]): number | null
}

export const FACTORS: Record<FactorId, FactorDefinition> = {
  momentum: {
    label: 'Risk-adjusted momentum',
    basis: '12-month return skipping the latest month, divided by volatility. The Monthly Plan ranking; NSE momentum indices use the same idea.',
    score(bars) {
      const r = pastReturn(bars, YEAR, MONTH), vol = annualVolatility(bars)
      return r == null || vol == null ? null : r / vol
    },
  },
  momentumRaw: {
    label: '12-month momentum',
    basis: '12-month return skipping the latest month (Jegadeesh and Titman, 1993).',
    score: bars => pastReturn(bars, YEAR, MONTH),
  },
  momentum6m: {
    label: '6-month momentum',
    basis: '6-month return skipping the latest month.',
    score: bars => pastReturn(bars, 6 * MONTH, MONTH),
  },
  lowVolatility: {
    label: 'Low volatility',
    basis: 'Lowest one-year volatility of daily returns (Ang et al., 2006; Baker et al., 2011).',
    score(bars) {
      const vol = annualVolatility(bars)
      return vol == null ? null : -vol
    },
  },
  high52w: {
    label: 'Near 52-week high',
    basis: 'Latest close as a share of the highest close in a year (George and Hwang, 2004).',
    score(bars) {
      if (bars.length < YEAR) return null
      let high = 0
      for (let i = bars.length - YEAR; i < bars.length; i++) high = Math.max(high, bars[i].close)
      return high > 0 ? bars[bars.length - 1].close / high : null
    },
  },
  deliveryRise: {
    label: 'Rising delivery share',
    basis: 'Share of volume taken into delivery over the last month, minus its one-year average. Exploratory: an India-specific idea without a published record.',
    score(bars) {
      const n = bars.length
      if (n < YEAR) return null
      const recent = deliveryShare(bars, n - MONTH, n), usual = deliveryShare(bars, n - YEAR, n)
      return recent == null || usual == null ? null : recent - usual
    },
  },
}

export interface FactorRanked {
  symbol: string
  /** Average percentile across the requested factors, 0 (worst) to 1 (best). */
  score: number
  lastClose: number
}

/**
 * Whether a stock can be ranked at all: a year of history, clean prices, and
 * liquid enough to trade (median traded value over 60 days).
 */
export function isRankable(bars: DailyBar[], opts = STOCK_MOMENTUM): boolean {
  if (bars.length < opts.lookbackDays + 1) return false
  const recent = bars.slice(-opts.liquidityWindowDays).map(b => (b.close * b.volume) / 1e7).sort((a, b) => a - b)
  const median = recent.length % 2 ? recent[recent.length >> 1] : (recent[(recent.length >> 1) - 1] + recent[recent.length >> 1]) / 2
  return median >= opts.minTradedValueCr
}

/**
 * Rank stocks on one factor, or on the average of their percentile ranks on
 * several (so no factor dominates because of its scale). Best first.
 */
export function rankByFactors(barsBySymbol: Record<string, DailyBar[]>, factors: FactorId[]): FactorRanked[] {
  const rows: Array<{ symbol: string; values: number[]; lastClose: number }> = []
  for (const [symbol, bars] of Object.entries(barsBySymbol)) {
    if (!isRankable(bars)) continue
    const values = factors.map(f => FACTORS[f].score(bars))
    if (values.some(v => v == null || !Number.isFinite(v))) continue
    rows.push({ symbol, values: values as number[], lastClose: bars[bars.length - 1].close })
  }
  if (!rows.length) return []

  const percentile = rows.map(() => 0)
  for (let f = 0; f < factors.length; f++) {
    const order = rows.map((r, i) => i).sort((a, b) => rows[a].values[f] - rows[b].values[f])
    order.forEach((rowIndex, position) => {
      percentile[rowIndex] += (rows.length > 1 ? position / (rows.length - 1) : 1) / factors.length
    })
  }
  return rows
    .map((r, i) => ({ symbol: r.symbol, score: percentile[i], lastClose: r.lastClose }))
    .sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol))
}

/**
 * Choose up to `topN` names from a ranking (best first).
 *
 * With `exitRank`, a stock already held stays until it falls below that
 * rank, and only the freed slots are refilled from the top. The backtests
 * show this roughly halves trading (and the charges and short-term gains tax
 * that come with it) without lowering returns.
 *
 * `canBuy` filters new entries only (for example a share price above the
 * per-position budget); it never forces a sale.
 *
 * `cap` limits how many picks may come from one group (a sector). A stock
 * with no known group is not limited.
 */
export function selectWithBuffer(
  ranked: Array<{ symbol: string }>,
  held: Iterable<string>,
  topN: number,
  exitRank?: number,
  canBuy: (symbol: string) => boolean = () => true,
  cap?: { groupOf: (symbol: string) => string | undefined; max: number }
): string[] {
  const picks: string[] = []
  const perGroup = new Map<string, number>()
  const take = (symbol: string): boolean => {
    const group = cap?.groupOf(symbol)
    if (group && (perGroup.get(group) ?? 0) >= cap!.max) return false
    if (group) perGroup.set(group, (perGroup.get(group) ?? 0) + 1)
    picks.push(symbol)
    return true
  }

  if (exitRank) {
    const rankOf = new Map(ranked.map((r, i) => [r.symbol, i + 1]))
    // Best-ranked holdings first, so a cap drops the weakest of a crowded group
    const keep = [...held]
      .filter(symbol => (rankOf.get(symbol) ?? Infinity) <= exitRank)
      .sort((x, y) => rankOf.get(x)! - rankOf.get(y)!)
    for (const symbol of keep) if (picks.length < topN) take(symbol)
  }
  for (const r of ranked) {
    if (picks.length >= topN) break
    if (!picks.includes(r.symbol) && canBuy(r.symbol)) take(r.symbol)
  }
  return picks
}

export interface StockFacts {
  momentumPct: number | null     // 12-month return skipping the latest month
  volatilityPct: number | null   // annualised
  tradedValueCr: number          // median daily traded value over 60 days, crore
  lastClose: number
  lastDate: string
}

/** The numbers behind a stock's rank, for display. */
export function stockFacts(bars: DailyBar[], opts = STOCK_MOMENTUM): StockFacts {
  const momentum = FACTORS.momentumRaw.score(bars), vol = annualVolatility(bars)
  const traded = bars.slice(-opts.liquidityWindowDays).map(b => (b.close * b.volume) / 1e7).sort((a, b) => a - b)
  const last = bars[bars.length - 1]
  return {
    momentumPct: momentum == null ? null : momentum * 100,
    volatilityPct: vol == null ? null : vol * 100,
    tradedValueCr: traded.length ? traded[traded.length >> 1] : 0,
    lastClose: last.close,
    lastDate: last.date,
  }
}
