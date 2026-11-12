/**
 * Strategies the harness can run. Each one calls the app's own code for its
 * decision, so a backtest result describes what the app would actually do.
 */
import { STOCK_MOMENTUM } from '@/lib/portfolio/config'
import { FACTORS, isRankable, rankByFactors, selectWithBuffer, type FactorId } from '@/lib/portfolio/factors'
import { rankMomentum, type DailyBar } from '@/lib/portfolio/momentum'
import { trendRegime } from '@/lib/portfolio/regime'
import type { Strategy, StrategyContext } from './simulate'

const TREND_INDEX = 'IDX:NIFTY 200'

/** Hold nothing while NIFTY 200 is below its 200-day average (the app's trend filter). */
export function withTrendFilter(strategy: Strategy): Strategy {
  return {
    name: `${strategy.name} + trend filter`,
    targets(ctx) {
      const regime = trendRegime(ctx.indexBars(TREND_INDEX, 200))
      return regime?.invested ? strategy.targets(ctx) : {}
    },
  }
}

function barsFor(ctx: StrategyContext, universeSize: number, count: number): Record<string, DailyBar[]> {
  const out: Record<string, DailyBar[]> = {}
  for (const symbol of ctx.universe(universeSize)) out[symbol] = ctx.bars(symbol, count)
  return out
}

/**
 * The Monthly Plan's stock book: the app's risk-adjusted 12-1 momentum
 * ranking (lib/portfolio/momentum.ts), top N at equal weight.
 */
export function stockMomentum(params: { universeSize?: number; topN?: number } = {}): Strategy {
  const universeSize = params.universeSize ?? 500
  const topN = params.topN ?? STOCK_MOMENTUM.topN
  const needed = Math.max(STOCK_MOMENTUM.lookbackDays, STOCK_MOMENTUM.volWindowDays) + 2
  return {
    name: `Stock momentum, top ${topN} of ${universeSize}`,
    targets(ctx) {
      const { ranked } = rankMomentum(barsFor(ctx, universeSize, needed))
      return Object.fromEntries(ranked.slice(0, topN).map(s => [s.symbol, 1 / topN]))
    },
  }
}

/**
 * Benchmark: every stock in the point-in-time universe at equal weight. It
 * pays the same costs and tax as a strategy, so beating it means the stock
 * selection added something beyond owning the market.
 */
export function equalWeightUniverse(universeSize = 500): Strategy {
  return {
    name: `Equal weight, top ${universeSize} by turnover`,
    targets(ctx) {
      const members = ctx.universe(universeSize).filter(s => ctx.bars(s, 1).length > 0)
      return Object.fromEntries(members.map(s => [s, 1 / members.length]))
    },
  }
}

/**
 * Top N stocks on one factor, or on the average rank across several, at
 * equal weight.
 *
 * `exitRank` adds a holding buffer: a stock already held stays until it
 * falls below that rank, and only the freed slots are refilled from the top.
 * That cuts trading, and with it charges and short-term gains tax.
 */
export function factorPortfolio(params: {
  factors: FactorId[]
  topN?: number
  universeSize?: number
  exitRank?: number
}): Strategy {
  const { factors, exitRank } = params
  const topN = params.topN ?? STOCK_MOMENTUM.topN
  const universeSize = params.universeSize ?? 500
  const needed = STOCK_MOMENTUM.lookbackDays + 2
  const label = factors.map(f => FACTORS[f].label).join(' + ')
  return {
    name: `${label}, top ${topN}${exitRank ? `, held to rank ${exitRank}` : ''}`,
    targets(ctx) {
      const ranked = rankByFactors(barsFor(ctx, universeSize, needed), factors)
      const picks = selectWithBuffer(ranked, ctx.holdings.keys(), topN, exitRank)
      return Object.fromEntries(picks.map(symbol => [symbol, 1 / topN]))
    },
  }
}

/**
 * Scale the whole book down when the market is turbulent: invested share =
 * target volatility / NIFTY 500's volatility over the last `window` sessions,
 * capped at fully invested (Moreira and Muir, 2017). The rest is cash.
 */
export function withVolatilityTarget(strategy: Strategy, targetVol = 0.15, window = 60): Strategy {
  return {
    name: `${strategy.name} + ${Math.round(targetVol * 100)}% volatility target`,
    targets(ctx) {
      const bars = ctx.indexBars('IDX:NIFTY 500', window + 1)
      if (bars.length < window + 1) return strategy.targets(ctx)
      const returns = bars.slice(1).map((b, i) => b.close / bars[i].close - 1)
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length
      const vol = Math.sqrt((returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1)) * 252)
      const invested = vol > 0 ? Math.min(1, targetVol / vol) : 1
      return Object.fromEntries(Object.entries(strategy.targets(ctx)).map(([symbol, w]) => [symbol, w * invested]))
    },
  }
}

/**
 * How a stock moved against the market around its latest results: from the
 * close before the board meeting to the close after it, minus NIFTY 500 over
 * the same days. Results often come out after trading hours, so the window
 * covers the meeting day and the next session. Null when there were no
 * results in the last `window` sessions, or the reaction is not complete yet.
 */
export function earningsReaction(
  bars: DailyBar[], resultsDates: string[], index: Map<string, number>, window = 63
): number | null {
  const latest = resultsDates[resultsDates.length - 1]
  if (!latest) return null
  const i = bars.findIndex(b => b.date >= latest)
  if (i < 1 || i + 1 >= bars.length || i < bars.length - window) return null
  const before = bars[i - 1], after = bars[i + 1]
  const marketBefore = index.get(before.date), marketAfter = index.get(after.date)
  if (!marketBefore || !marketAfter || !(before.close > 0)) return null
  return after.close / before.close - marketAfter / marketBefore
}

/**
 * Post-earnings-announcement drift (Bernard and Thomas, 1989): stocks that
 * jump on their results tend to keep drifting the same way for weeks. Holds
 * the stocks with the strongest reaction to results in the last three months.
 *
 * With `momentumFirst`, it instead takes the usual momentum ranking but only
 * from stocks whose latest results the market liked.
 */
export function earningsDrift(params: { topN?: number; universeSize?: number; momentumFirst?: boolean } = {}): Strategy {
  const topN = params.topN ?? STOCK_MOMENTUM.topN
  const universeSize = params.universeSize ?? 500
  const needed = STOCK_MOMENTUM.lookbackDays + 2
  return {
    name: params.momentumFirst
      ? `Risk-adjusted momentum among stocks with well-received results, top ${topN}`
      : `Strongest reaction to results, top ${topN}`,
    targets(ctx) {
      const index = new Map(ctx.indexBars('IDX:NIFTY 500', 80).map(b => [b.date, b.close]))
      const bars = barsFor(ctx, universeSize, needed)
      const reaction = new Map<string, number>()
      for (const [symbol, b] of Object.entries(bars)) {
        if (!isRankable(b)) continue
        const r = earningsReaction(b, ctx.resultsDates(symbol), index)
        if (r != null) reaction.set(symbol, r)
      }
      const picks = params.momentumFirst
        ? rankByFactors(bars, ['momentum']).filter(r => (reaction.get(r.symbol) ?? 0) > 0).slice(0, topN).map(r => r.symbol)
        : [...reaction.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, topN).map(([symbol]) => symbol)
      return Object.fromEntries(picks.map(symbol => [symbol, 1 / topN]))
    },
  }
}
