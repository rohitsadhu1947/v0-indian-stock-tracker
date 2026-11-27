/**
 * The parts of the Monthly Plan that turn a ranking into plain statements:
 * what kind of step the user is looking at, and why each order or holding is
 * what it is. Pure functions, so every sentence the page shows is tested.
 */
import { PLAN_FUNDS, type RiskMode } from './config'

/**
 * start     no book yet: buy the mode's picks
 * rebalance the book already follows this mode: the monthly update
 * switch    the book follows another mode: convert it to this one
 */
export type ActionKind = 'start' | 'rebalance' | 'switch'

export function actionKind(bookMode: RiskMode | null, viewedMode: RiskMode): ActionKind {
  if (!bookMode) return 'start'
  return bookMode === viewedMode ? 'rebalance' : 'switch'
}

const FUND_LABEL = new Map<string, string>(PLAN_FUNDS.map(f => [f.symbol, f.label]))
export const isPlanFund = (symbol: string): boolean => FUND_LABEL.has(symbol)
export const fundLabel = (symbol: string): string => FUND_LABEL.get(symbol) ?? symbol

/**
 * Target weights for the whole book: `fundShare` split equally between the
 * funds, and the rest split equally between `topN` stock slots. With
 * `stocksInvested` false (the trend filter is in cash) only the funds are held.
 */
export function planTargets(picks: string[], topN: number, fundShare: number, stocksInvested: boolean): Record<string, number> {
  const out: Record<string, number> = {}
  if (stocksInvested) for (const symbol of picks) out[symbol] = (1 - fundShare) / topN
  if (fundShare > 0) for (const f of PLAN_FUNDS) out[f.symbol] = fundShare / PLAN_FUNDS.length
  return out
}

/** One sentence for an order in a fund. */
export function fundOrderReason(order: { symbol: string; side: 'BUY' | 'SELL'; reason: 'exit' | 'entry' | 'resize' }, fundShare: number): string {
  const each = Math.round((fundShare / PLAN_FUNDS.length) * 1000) / 10
  if (order.reason === 'exit') return 'The share kept in funds is set to 0'
  if (order.reason === 'entry') return `${fundLabel(order.symbol)}: ${each}% of the book`
  return `${fundLabel(order.symbol)}: back to ${each}% of the book`
}

export interface ReasonContext {
  kind: ActionKind
  modeLabel: string
  /** Rank of each ranked stock in the mode being applied, 1 = best. */
  rankOf: ReadonlyMap<string, number>
  exitRank: number
  maxPerSector: number
  sectorOf: (symbol: string) => string | undefined
  /** False when the trend filter has the book in cash this month. */
  invested: boolean
  /** Rank of the mode's lowest-ranked pick. A stock ranked above it that is not a pick lost its place to the sector limit. */
  lastPickRank?: number
}

/** Why a holding is being sold, or would be at the next rebalance. */
export function exitReason(symbol: string, ctx: ReasonContext): string {
  if (!ctx.invested) return 'Trend filter is on and the market is in a downtrend: move to cash'
  const rank = ctx.rankOf.get(symbol)
  if (ctx.kind === 'switch') {
    const sector = ctx.sectorOf(symbol)
    if (rank && sector && ctx.lastPickRank && rank < ctx.lastPickRank) {
      return `Rank ${rank} in ${ctx.modeLabel}, but ${sector} already has ${ctx.maxPerSector} picks that rank higher`
    }
    return rank ? `Not one of ${ctx.modeLabel}'s picks (rank ${rank} there)` : `Not one of ${ctx.modeLabel}'s picks`
  }
  if (!rank) return 'No longer ranked: too little trading or history'
  if (rank > ctx.exitRank) return `Rank fell to ${rank}; holdings are kept only down to rank ${ctx.exitRank}`
  const sector = ctx.sectorOf(symbol)
  return sector
    ? `${sector} already has ${ctx.maxPerSector} holdings that rank higher`
    : `Rank ${rank}, but the ${ctx.maxPerSector} per sector limit left no room`
}

/** One sentence for an order, in the user's terms. */
export function orderReason(order: { symbol: string; side: 'BUY' | 'SELL'; reason: 'exit' | 'entry' | 'resize' }, ctx: ReasonContext): string {
  const rank = ctx.rankOf.get(order.symbol)
  if (order.reason === 'resize') return 'Back to an equal share of the book'
  if (order.side === 'BUY') return rank ? `New pick, rank ${rank}` : 'New pick'
  return exitReason(order.symbol, ctx)
}

/** Profit figures for one holding at a price. */
export function holdingValue(qty: number, avgPrice: number, price: number, previousClose: number | null) {
  const cost = qty * avgPrice
  const value = qty * price
  return {
    cost,
    value,
    pnl: value - cost,
    pnlPct: cost > 0 ? (value / cost - 1) * 100 : 0,
    dayChangePct: previousClose && previousClose > 0 ? (price / previousClose - 1) * 100 : null,
  }
}

/** NSE cash market hours, Monday to Friday 09:15 to 15:30 IST. Holidays are not known here. */
export function isMarketHours(now: Date = new Date()): boolean {
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000)
  const day = ist.getUTCDay()
  if (day === 0 || day === 6) return false
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes()
  return minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 30
}
