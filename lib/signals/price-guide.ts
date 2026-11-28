/**
 * The price guide beside a buy: where past signals of the same rule ended,
 * as rupee prices. Pure functions over research/results/price-guide.json.
 *
 * These are not sell targets. Every target tested cut the return. They show
 * the spread of past outcomes so the reader knows what is normal.
 */
import guide from '@/research/results/price-guide.json'

export interface Spread { trades: number; badPct: number; typicalPct: number; goodPct: number; wonPct: number; avgPct: number; typicalLowPct?: number }
export interface PriceGuide {
  /** A quarter of past trades ended below this price. */
  bad: number
  /** The middle trade ended here. */
  typical: number
  /** A quarter of past trades ended above this price. */
  good: number
  /** When the prices are for: "at the exit", "in 6 months". */
  when: string
  trades: number
  wonPct: number
}

const round2 = (x: number) => Math.round(x * 100) / 100

/** Rupee prices for a spread at a buy price. Null without a price. */
export function guidePrices(price: number | null | undefined, spread: Spread | undefined, when: string): PriceGuide | null {
  if (!price || !(price > 0) || !spread) return null
  const at = (pct: number) => round2(price * (1 + pct / 100))
  return { bad: at(spread.badPct), typical: at(spread.typicalPct), good: at(spread.goodPct), when, trades: spread.trades, wonPct: spread.wonPct }
}

const strengthKey = (rank: number | null | undefined): string | null =>
  rank == null ? null : rank >= 0.8 ? 'top fifth' : rank >= 0.6 ? 'second fifth' : rank >= 0.4 ? 'middle fifth' : 'fourth fifth'

/** A results buy, by the stock's 12-month strength when it is known. */
export function resultsGuide(price: number | null | undefined, strengthRank: number | null | undefined): PriceGuide | null {
  const key = strengthKey(strengthRank)
  const spread = (key && (guide.resultsBuy.byStrength as Record<string, Spread>)[key]) || guide.resultsBuy.all
  return guidePrices(price, spread, 'on session 60')
}

export const splitGuide = (price: number | null | undefined): PriceGuide | null => guidePrices(price, guide.splitBuy.all, 'the day before the split')
export const dividendGuide = (price: number | null | undefined): PriceGuide | null => guidePrices(price, guide.dividendBuy.all, 'the day before the dividend date')

export type PlanHorizon = 'oneMonth' | 'threeMonths' | 'sixMonths' | 'twelveMonths'
const HORIZON_WORDS: Record<PlanHorizon, string> = { oneMonth: 'in 1 month', threeMonths: 'in 3 months', sixMonths: 'in 6 months', twelveMonths: 'in 12 months' }

/** A Monthly Plan pick. `mode` is the mode's id or label: growth, balanced or defensive. */
export function planGuide(price: number | null | undefined, mode: string, horizon: PlanHorizon = 'sixMonths'): PriceGuide | null {
  const spreads = (guide.monthlyPlan as unknown as Record<string, Record<string, Spread>>)[mode.toLowerCase()]
  return guidePrices(price, spreads?.[horizon], HORIZON_WORDS[horizon])
}

/** The middle trade's lowest close on the way, as a price: what a normal dip looks like. */
export function typicalLow(price: number | null | undefined, kind: 'results' | { mode: string; horizon: PlanHorizon }): number | null {
  const spread: Spread | undefined = kind === 'results' ? guide.resultsBuy.all : (guide.monthlyPlan as unknown as Record<string, Record<string, Spread>>)[kind.mode.toLowerCase()]?.[kind.horizon]
  return price && spread?.typicalLowPct != null ? round2(price * (1 + spread.typicalLowPct / 100)) : null
}
