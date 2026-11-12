/**
 * Cross-sectional stock momentum ranking.
 *
 * Risk-adjusted 12-1 momentum: return from 252 to 21 trading days ago,
 * divided by annualised volatility of daily returns over the last 252 days.
 * Same definition as research/research.py ("Risk-adj momentum").
 *
 * Liquidity: median daily traded value over 60 days must be at least
 * `minTradedValueCr` crore, so every pick can be bought and sold easily.
 */

import { STOCK_MOMENTUM } from './config'

export interface DailyBar {
  date: string   // YYYY-MM-DD
  close: number
  volume: number
  /** Shares taken into delivery (same basis as volume), when known. */
  deliveryQty?: number | null
}

export interface RankedStock {
  symbol: string
  score: number          // momentum / volatility
  momentumPct: number    // 12-1 month return, %
  volatilityPct: number  // annualised, %
  tradedValueCr: number  // median daily traded value, crore
  lastClose: number
  lastDate: string
}

export interface RankingResult {
  ranked: RankedStock[]
  considered: number
  excluded: { shortHistory: number; illiquid: number; badData: number }
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function stdev(xs: number[]): number {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (xs.length - 1))
}

/**
 * Score one stock. `bars` are oldest first and end at the as-of date.
 * Returns null (with a reason) when the stock cannot be scored.
 */
export function scoreMomentum(
  bars: DailyBar[],
  opts = STOCK_MOMENTUM
): { stock: Omit<RankedStock, 'symbol'> } | { reason: 'shortHistory' | 'illiquid' | 'badData' } {
  const { lookbackDays, skipDays, volWindowDays, liquidityWindowDays, minTradedValueCr } = opts
  if (bars.length < lookbackDays + 1) return { reason: 'shortHistory' }

  const n = bars.length
  const past = bars[n - 1 - lookbackDays].close
  const recent = bars[n - 1 - skipDays].close
  if (!(past > 0) || !(recent > 0)) return { reason: 'badData' }

  const returns: number[] = []
  for (let i = n - volWindowDays; i < n; i++) {
    const prev = bars[i - 1].close
    const cur = bars[i].close
    if (!(prev > 0) || !(cur > 0)) return { reason: 'badData' }
    returns.push(cur / prev - 1)
  }
  const vol = stdev(returns) * Math.sqrt(252)
  if (!(vol > 0)) return { reason: 'badData' }

  const tradedValueCr = median(
    bars.slice(-liquidityWindowDays).map(b => (b.close * b.volume) / 1e7)
  )
  if (tradedValueCr < minTradedValueCr) return { reason: 'illiquid' }

  const momentum = recent / past - 1
  const last = bars[n - 1]
  return {
    stock: {
      score: momentum / vol,
      momentumPct: momentum * 100,
      volatilityPct: vol * 100,
      tradedValueCr,
      lastClose: last.close,
      lastDate: last.date,
    },
  }
}

/** Rank every stock with enough clean, liquid history. Highest score first. */
export function rankMomentum(
  barsBySymbol: Record<string, DailyBar[]>,
  opts = STOCK_MOMENTUM
): RankingResult {
  const excluded = { shortHistory: 0, illiquid: 0, badData: 0 }
  const ranked: RankedStock[] = []

  for (const [symbol, bars] of Object.entries(barsBySymbol)) {
    const result = scoreMomentum(bars, opts)
    if ('reason' in result) {
      excluded[result.reason]++
      continue
    }
    ranked.push({ symbol, ...result.stock })
  }

  ranked.sort((a, b) => b.score - a.score)
  return { ranked, considered: Object.keys(barsBySymbol).length, excluded }
}

/**
 * Pick the top N that the account can actually buy: a stock priced above its
 * per-position budget cannot be bought even once, so the next name is used.
 */
export function selectAffordable(
  ranked: RankedStock[],
  topN: number,
  capital: number
): { picks: RankedStock[]; skippedUnaffordable: string[] } {
  const budget = capital / topN
  const picks: RankedStock[] = []
  const skippedUnaffordable: string[] = []
  for (const s of ranked) {
    if (picks.length >= topN) break
    if (s.lastClose > budget) {
      skippedUnaffordable.push(s.symbol)
      continue
    }
    picks.push(s)
  }
  return { picks, skippedUnaffordable }
}
