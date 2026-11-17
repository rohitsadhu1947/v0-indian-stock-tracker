/**
 * Portfolio engine service: this month's plan, the paper book and its
 * trades, live prices, daily snapshots and performance.
 *
 * The plan is decided as of the last session of the previous month, with the
 * same ranking and selection code the research harness backtests
 * (lib/portfolio/factors.ts), on the same universe rule.
 *
 * Three things are kept apart, because mixing them made the page unreadable:
 *   book    what the user's paper book holds now, at current prices
 *   picks   what the mode being looked at would hold this month
 *   action  the trades that would take the book there (start, monthly
 *           rebalance, or a switch from another mode)
 */

import { db } from '@/db'
import { modelPortfolios, modelPortfolioEvents } from '@/db/schema'
import { and, eq, asc } from 'drizzle-orm'
import type { BrokerClient, BrokerHolding } from '@/lib/broker'
import { MODES, PORTFOLIO_RULES, type RiskMode } from './config'
import type { TrendRegime } from './regime'
import { exposure, rebalanceStatus, type Exposure } from './allocation'
import { rankByFactors, selectWithBuffer, stockFacts, type FactorRanked, type StockFacts } from './factors'
import { planRebalance, applyOrders, bookValue, type BookState, type Order } from './rebalance'
import { loadBars, dataFreshness, signalDate, istDate, type DataFreshness } from './data'
import { brokerHoldings, liveQuotes, type LiveQuote } from './live'
import { actionKind, exitReason, holdingValue, isMarketHours, orderReason, type ActionKind, type ReasonContext } from './plan-core'
import { rankingInputs, SECTOR_CAP } from './signals'
import { SECTOR_BY_SYMBOL, sectorOf } from './sectors'

/** One paper book per user. */
const BOOK_KIND = 'stock'
export const DEFAULT_CAPITAL = 300000
const BENCHMARK_INDEX = 'IDX:NIFTY 500'
/** Rows of the ranking sent to the page: everything down to the exit rank. */
const RANKING_ROWS = PORTFOLIO_RULES.exitRank
const MODE_IDS = Object.keys(MODES) as RiskMode[]

async function getPortfolio(userId: number) {
  const [p] = await db.select().from(modelPortfolios)
    .where(and(eq(modelPortfolios.userId, userId), eq(modelPortfolios.kind, BOOK_KIND))).limit(1)
  return p ?? null
}

function stateOf(p: { cash: number; holdings: unknown } | null, capital: number): BookState {
  return p ? { cash: p.cash, holdings: (p.holdings as BookState['holdings']) ?? {} } : { cash: capital, holdings: {} }
}

export interface RankedRow extends StockFacts {
  symbol: string
  rank: number
  /** Average percentile on the mode's factors, 0 to 100. */
  scorePct: number
  industry: string
  /** One of the stocks this mode would hold this month. */
  selected: boolean
  /** In the paper book now. */
  held: boolean
}

export interface HoldingRow {
  symbol: string
  sector: string
  qty: number
  avgPrice: number
  price: number
  previousClose: number | null
  cost: number
  value: number
  pnl: number
  pnlPct: number
  dayChangePct: number | null
  /** Rank in the book's own mode at the last month-end, when ranked. */
  rank: number | null
  /** Whether the book's mode would keep it at a rebalance. */
  keep: boolean
  /** Why it would be sold, when `keep` is false. */
  note: string
}

export interface PlanOrder extends Order {
  why: string
}

export interface MonthlyPlan {
  /** The month-end session the ranking is taken at. */
  asOf: string
  /** The mode being looked at. */
  mode: RiskMode
  trendFilter: boolean
  modeInfo: (typeof MODES)[RiskMode]
  regime: TrendRegime | null
  exposure: Exposure
  freshness: DataFreshness
  universe: { size: number; ranked: number }
  brokerConnected: boolean
  marketOpen: boolean
  prices: { source: 'live' | 'last close'; at: string; lastCloseFor: string[] }
  /** What this mode would hold this month, best first. */
  picks: RankedRow[]
  ranking: RankedRow[]
  /** Rank of every ranked stock in each mode, to place any holding against the plan. */
  modeRanks: Record<string, Partial<Record<RiskMode, number>>>
  /** What each mode would hold if started fresh this month. */
  modePicks: Record<RiskMode, string[]>
  book: {
    exists: boolean
    /** The mode the book follows (the mode it was last rebalanced in). */
    mode: RiskMode | null
    startingCapital: number
    cash: number
    value: number
    invested: number
    pnl: number
    pnlPct: number
    lastRebalance: string | null
    holdings: HoldingRow[]
  }
  action: {
    kind: ActionKind
    canExecute: boolean
    /** Why it cannot be done now, when it cannot. */
    blocked: string | null
    orders: PlanOrder[]
    estimatedCosts: number
    cashAfter: number
    skippedUnaffordable: string[]
    notes: string[]
  }
}

interface Ranked { list: FactorRanked[]; rankOf: Map<string, number> }

function rankModes(bars: Record<string, import('./momentum').DailyBar[]>): Record<RiskMode, Ranked> {
  return Object.fromEntries(MODE_IDS.map(mode => {
    const list = rankByFactors(bars, MODES[mode].factors)
    return [mode, { list, rankOf: new Map(list.map((r, i) => [r.symbol, i + 1])) }]
  })) as Record<RiskMode, Ranked>
}

export async function buildMonthlyPlan(params: {
  userId: number
  mode: RiskMode
  trendFilter?: boolean
  capital?: number
  client: BrokerClient | null
}): Promise<MonthlyPlan> {
  const { userId, mode, client } = params
  const trendFilter = params.trendFilter ?? false
  const capital = params.capital ?? DEFAULT_CAPITAL
  const { topN, exitRank, maxPerSector } = PORTFOLIO_RULES

  const [freshness, asOfDate, portfolio] = await Promise.all([dataFreshness(), signalDate(), getPortfolio(userId)])
  const asOf = asOfDate ?? istDate()
  const state = stateOf(portfolio, capital)
  const held = Object.keys(state.holdings)
  const bookMode = portfolio ? ((portfolio.mode in MODES ? portfolio.mode : mode) as RiskMode) : null
  const kind = actionKind(bookMode, mode)

  const { universe, bars, regime } = asOfDate ? await rankingInputs(asOf) : { universe: [], bars: {}, regime: null }
  const invested = exposure(regime, trendFilter)
  const ranked = rankModes(bars)
  const viewed = ranked[mode]

  // A share that costs more than one position's budget cannot be bought even once
  const budget = (portfolio ? bookValue(state, {}) : capital) / topN
  const lastClose = new Map(viewed.list.map(r => [r.symbol, r.lastClose]))
  const affordable = (symbol: string) => lastClose.get(symbol)! <= budget
  // The monthly rebalance keeps holdings still inside the exit rank; a start or a switch takes the mode's picks as they are
  const pickSymbols = selectWithBuffer(viewed.list, kind === 'rebalance' ? held : [], topN, exitRank, affordable, SECTOR_CAP)
  const selected = new Set(pickSymbols)
  const skippedUnaffordable = viewed.list.slice(0, topN).filter(r => !selected.has(r.symbol) && r.lastClose > budget).map(r => r.symbol)

  const targets: Record<string, number> = invested.invested && freshness.ok
    ? Object.fromEntries(pickSymbols.map(symbol => [symbol, 1 / topN]))
    : {}
  const live = await liveQuotes([...new Set([...pickSymbols, ...held])], client)
  const prices = Object.fromEntries(Object.entries(live.quotes).map(([symbol, q]) => [symbol, q.price]))
  const rebalance = planRebalance({ state, targets, prices })

  const reasonContext: ReasonContext = {
    kind, modeLabel: MODES[mode].label, rankOf: viewed.rankOf, exitRank, maxPerSector, sectorOf, invested: invested.invested,
    lastPickRank: Math.max(0, ...pickSymbols.map(symbol => viewed.rankOf.get(symbol) ?? 0)),
  }
  const last = portfolio?.lastRebalance ? String(portfolio.lastRebalance) : null
  const due = rebalanceStatus(last, istDate())
  const blocked =
    !freshness.ok ? freshness.message
    : rebalance.missingPrices.length ? `No price for ${rebalance.missingPrices.join(', ')}`
    : kind === 'rebalance' && !due.due ? due.reason
    : rebalance.orders.length === 0 ? 'Nothing to trade: the book already matches.'
    : null

  const toRow = (r: FactorRanked, rank: number): RankedRow => ({
    ...stockFacts(bars[r.symbol]),
    symbol: r.symbol, rank, scorePct: r.score * 100, industry: SECTOR_BY_SYMBOL[r.symbol] ?? '',
    selected: selected.has(r.symbol), held: r.symbol in state.holdings,
  })
  // Show the ranking far enough down to include every pick: the sector limit can reach past the exit rank
  const rankingRows = Math.max(RANKING_ROWS, ...pickSymbols.map(symbol => viewed.rankOf.get(symbol) ?? 0))
  const ranking = viewed.list.slice(0, rankingRows).map((r, i) => toRow(r, i + 1))

  // The book as it stands, judged by the mode it follows
  const own = bookMode ? ranked[bookMode] : viewed
  const ownKeeps = new Set(selectWithBuffer(own.list, held, topN, exitRank, undefined, SECTOR_CAP))
  const ownContext: ReasonContext = { ...reasonContext, kind: 'rebalance', rankOf: own.rankOf, modeLabel: MODES[bookMode ?? mode].label }
  const holdings: HoldingRow[] = held.map(symbol => {
    const h = state.holdings[symbol]
    const quote: LiveQuote = live.quotes[symbol] ?? { price: h.avgPrice, previousClose: null }
    const keep = invested.invested && ownKeeps.has(symbol)
    return {
      symbol, sector: SECTOR_BY_SYMBOL[symbol] ?? '', qty: h.qty, avgPrice: h.avgPrice,
      price: quote.price, previousClose: quote.previousClose,
      ...holdingValue(h.qty, h.avgPrice, quote.price, quote.previousClose),
      rank: own.rankOf.get(symbol) ?? null, keep, note: keep ? '' : exitReason(symbol, ownContext),
    }
  }).sort((a, b) => b.value - a.value)
  const investedValue = holdings.reduce((sum, h) => sum + h.value, 0)
  const value = state.cash + investedValue
  const startingCapital = portfolio?.startingCapital ?? capital

  const modeRanks: MonthlyPlan['modeRanks'] = {}
  for (const m of MODE_IDS) for (const [symbol, rank] of ranked[m].rankOf) (modeRanks[symbol] ??= {})[m] = rank

  const notes: string[] = []
  if (!invested.invested) notes.push(invested.reason)
  if (live.source !== 'live' && isMarketHours()) {
    notes.push('The market is open but Zerodha is not connected, so these orders are priced at the last close, not the current price.')
  }

  return {
    asOf, mode, trendFilter, modeInfo: MODES[mode], regime, exposure: invested, freshness,
    universe: { size: universe.length, ranked: viewed.list.length },
    brokerConnected: !!client,
    marketOpen: isMarketHours(),
    prices: { source: live.source, at: live.at, lastCloseFor: live.lastCloseFor },
    picks: pickSymbols.map(symbol => toRow(viewed.list[viewed.rankOf.get(symbol)! - 1], viewed.rankOf.get(symbol)!)),
    ranking,
    modeRanks,
    modePicks: Object.fromEntries(MODE_IDS.map(m => [m, selectWithBuffer(ranked[m].list, [], topN, exitRank, undefined, SECTOR_CAP)])) as Record<RiskMode, string[]>,
    book: {
      exists: !!portfolio, mode: bookMode, startingCapital, cash: state.cash, value, invested: investedValue,
      pnl: value - startingCapital, pnlPct: (value / startingCapital - 1) * 100, lastRebalance: last, holdings,
    },
    action: {
      kind,
      canExecute: blocked === null,
      blocked,
      orders: rebalance.orders.map(o => ({ ...o, why: orderReason(o, reasonContext) })),
      estimatedCosts: rebalance.estimatedCosts,
      cashAfter: rebalance.cashAfter,
      skippedUnaffordable,
      notes,
    },
  }
}

export class RebalanceRefused extends Error {}

/**
 * Carry out the plan's action for a mode on the paper book at current
 * prices: start the book, do the monthly rebalance, or switch it to this mode.
 */
export async function executeRebalance(params: {
  userId: number
  mode: RiskMode
  trendFilter?: boolean
  capital?: number
  client: BrokerClient | null
}) {
  const capital = params.capital ?? DEFAULT_CAPITAL
  const plan = await buildMonthlyPlan({
    userId: params.userId, mode: params.mode, trendFilter: params.trendFilter, capital, client: params.client,
  })
  if (!plan.action.canExecute) throw new RebalanceRefused(plan.action.blocked ?? 'Nothing to do.')

  const before: BookState = {
    cash: plan.book.cash,
    holdings: Object.fromEntries(plan.book.holdings.map(h => [h.symbol, { qty: h.qty, avgPrice: h.avgPrice }])),
  }
  const symbols = [...new Set([...plan.action.orders.map(o => o.symbol), ...Object.keys(before.holdings)])]
  const live = await liveQuotes(symbols, params.client)
  const prices = Object.fromEntries(Object.entries(live.quotes).map(([symbol, q]) => [symbol, q.price]))
  const { state, fills } = applyOrders(before, plan.action.orders, prices)
  const today = istDate()
  const value = bookValue(state, prices)

  let portfolio = await getPortfolio(params.userId)
  if (!portfolio) {
    ;[portfolio] = await db.insert(modelPortfolios).values({
      userId: params.userId, kind: BOOK_KIND, mode: params.mode,
      startingCapital: capital, cash: state.cash, holdings: state.holdings, lastRebalance: today,
    }).returning()
  } else {
    await db.update(modelPortfolios).set({
      mode: params.mode, cash: state.cash, holdings: state.holdings, lastRebalance: today, updatedAt: new Date(),
    }).where(eq(modelPortfolios.id, portfolio.id))
  }

  await db.insert(modelPortfolioEvents).values({
    portfolioId: portfolio.id,
    date: today,
    type: 'rebalance',
    value,
    cash: state.cash,
    holdings: state.holdings,
    details: {
      mode: params.mode,
      kind: plan.action.kind,
      trendFilter: plan.trendFilter,
      signalDate: plan.asOf,
      regime: plan.regime,
      exposure: plan.exposure,
      priceSource: live.source,
      fills,
      // Every name and its rank at the signal date, so the picks can be scored later
      picks: plan.picks.map(r => ({ symbol: r.symbol, rank: r.rank })),
    },
  })

  return { kind: plan.action.kind, value, cash: state.cash, fills, priceSource: live.source }
}

/**
 * One manual trade on the paper book: sell part or all of a holding, or buy
 * more of any NSE stock, at the current price with slippage and charges.
 * This steps outside the monthly rule, so it is recorded as its own event.
 */
export async function executeTrade(params: {
  userId: number
  symbol: string
  side: 'BUY' | 'SELL'
  qty: number
  client: BrokerClient | null
}) {
  const { symbol, side, qty } = params
  if (!Number.isInteger(qty) || qty <= 0) throw new RebalanceRefused('Quantity must be a whole number above zero.')
  const portfolio = await getPortfolio(params.userId)
  if (!portfolio) throw new RebalanceRefused('Start the paper book first.')

  const before = stateOf(portfolio, portfolio.startingCapital)
  const held = before.holdings[symbol]?.qty ?? 0
  if (side === 'SELL' && held < qty) throw new RebalanceRefused(`The book holds ${held} ${symbol}, not ${qty}.`)

  const live = await liveQuotes([symbol], params.client)
  const price = live.quotes[symbol]?.price
  if (!(price > 0)) throw new RebalanceRefused(`No price for ${symbol}.`)

  const order: Order = { symbol, side, qty, price, value: qty * price, reason: side === 'SELL' ? 'exit' : 'entry' }
  const { state, fills } = applyOrders(before, [order], { [symbol]: price })
  if (!fills.length) throw new RebalanceRefused(`Not enough cash: ${qty} ${symbol} costs about ₹${Math.round(qty * price).toLocaleString('en-IN')} and the book has ₹${Math.round(before.cash).toLocaleString('en-IN')}.`)

  await db.update(modelPortfolios)
    .set({ cash: state.cash, holdings: state.holdings, updatedAt: new Date() })
    .where(eq(modelPortfolios.id, portfolio.id))
  const all = await liveQuotes(Object.keys(state.holdings), params.client)
  await db.insert(modelPortfolioEvents).values({
    portfolioId: portfolio.id,
    date: istDate(),
    type: 'trade',
    value: bookValue(state, Object.fromEntries(Object.entries(all.quotes).map(([s, q]) => [s, q.price]))),
    cash: state.cash,
    holdings: state.holdings,
    details: { priceSource: live.source, fills },
  })
  return { fill: fills[0], cash: state.cash, priceSource: live.source }
}

export interface BrokerHoldingRow extends BrokerHolding {
  cost: number
  value: number
  pnl: number
  pnlPct: number
  dayChangePct: number | null
}

/** Prices for the paper book and the user's real broker holdings, for the page to poll. */
export async function liveView(userId: number, client: BrokerClient | null) {
  const portfolio = await getPortfolio(userId)
  const state = stateOf(portfolio, DEFAULT_CAPITAL)
  const [live, real] = await Promise.all([liveQuotes(Object.keys(state.holdings), client), brokerHoldings(client)])
  return {
    brokerConnected: !!client,
    marketOpen: isMarketHours(),
    source: live.source,
    at: live.at,
    lastCloseFor: live.lastCloseFor,
    quotes: live.quotes,
    cash: state.cash,
    /** Null when the broker is not connected or the holdings call failed. */
    brokerHoldings: real?.map((h): BrokerHoldingRow => ({
      ...h, ...holdingValue(h.quantity, h.averagePrice, h.lastPrice, h.previousClose || null),
    })) ?? null,
  }
}

/** Daily valuation of every model portfolio at stored closes (cron). */
export async function snapshotAllPortfolios(): Promise<number> {
  const all = await db.select().from(modelPortfolios)
  const today = istDate()
  let written = 0
  for (const p of all) {
    const state = stateOf(p, p.startingCapital)
    const { quotes } = await liveQuotes(Object.keys(state.holdings), null)
    await db.insert(modelPortfolioEvents).values({
      portfolioId: p.id, date: today, type: 'snapshot',
      value: bookValue(state, Object.fromEntries(Object.entries(quotes).map(([s, q]) => [s, q.price]))),
      cash: state.cash, holdings: state.holdings,
    })
    written++
  }
  return written
}

/** Value history of the paper book, with NIFTY 500 over the same dates. */
export async function portfolioPerformance(userId: number) {
  const book = await getPortfolio(userId)
  if (!book) return { book: null, benchmark: [] as Array<{ date: string; value: number }> }

  const events = await db.select().from(modelPortfolioEvents)
    .where(eq(modelPortfolioEvents.portfolioId, book.id))
    .orderBy(asc(modelPortfolioEvents.date), asc(modelPortfolioEvents.id))
  const byDate = new Map<string, { date: string; value: number; type: string }>()
  for (const e of events) byDate.set(String(e.date), { date: String(e.date), value: e.value, type: e.type })
  const points = [...byDate.values()]

  const bars = points[0] ? await loadBars([BENCHMARK_INDEX], points[0].date) : {}
  return {
    book: { mode: book.mode as RiskMode, startingCapital: book.startingCapital, points },
    benchmark: (bars[BENCHMARK_INDEX] ?? []).map(b => ({ date: b.date, value: b.close })),
  }
}
