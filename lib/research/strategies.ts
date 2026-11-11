/**
 * Strategies the harness can run. Each one calls the app's own code for its
 * decision, so a backtest result describes what the app would actually do.
 */
import { STOCK_MOMENTUM } from '@/lib/portfolio/config'
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
