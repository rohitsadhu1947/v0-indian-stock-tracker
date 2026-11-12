/**
 * Portfolio engine service: this month's plan, paper rebalance, daily
 * snapshots and performance for the user's paper stock book.
 *
 * The plan is decided as of the last session of the previous month, with the
 * same ranking and selection code the research harness backtests
 * (lib/portfolio/factors.ts), on the same universe rule.
 */

import { db } from '@/db'
import { modelPortfolios, modelPortfolioEvents } from '@/db/schema'
import { and, eq, asc } from 'drizzle-orm'
import type { BrokerClient } from '@/lib/broker'
import { MODES, PORTFOLIO_RULES, INDEX_INSTRUMENTS, type RiskMode } from './config'
import { trendRegime, type TrendRegime } from './regime'
import { exposure, rebalanceStatus, type Exposure } from './allocation'
import { rankByFactors, selectWithBuffer, stockFacts, type StockFacts } from './factors'
import { planRebalance, applyOrders, bookValue, type BookState, type RebalancePlan } from './rebalance'
import { loadBars, dataFreshness, latestPrices, liveUniverse, signalDate, istDate, type DataFreshness } from './data'
import { INDUSTRY_BY_SYMBOL } from './universe'

/** One paper book per user. */
const BOOK_KIND = 'stock'
export const DEFAULT_CAPITAL = 300000
const BENCHMARK_INDEX = 'IDX:NIFTY 500'
/** Rows of the ranking sent to the page: everything down to the exit rank. */
const RANKING_ROWS = PORTFOLIO_RULES.exitRank

/** `days` calendar days before an ISO date. */
function daysBefore(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

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
  selected: boolean
  held: boolean
}

export interface MonthlyPlan {
  /** The month-end session the ranking is taken at. */
  asOf: string
  mode: RiskMode
  trendFilter: boolean
  modeInfo: (typeof MODES)[RiskMode]
  regime: TrendRegime | null
  exposure: Exposure
  freshness: DataFreshness
  universe: { size: number; ranked: number }
  book: {
    exists: boolean
    mode: RiskMode
    startingCapital: number
    state: BookState
    value: number
    rebalance: { due: boolean; reason: string; last: string | null }
    targets: Record<string, number>
    plan: RebalancePlan
    priceSource: 'live' | 'last close'
    notes: string[]
    ranking: RankedRow[]
    skippedUnaffordable: string[]
  }
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
  const { topN, exitRank, universeSize } = PORTFOLIO_RULES

  const [freshness, asOfDate, portfolio] = await Promise.all([dataFreshness(), signalDate(), getPortfolio(userId)])
  const asOf = asOfDate ?? istDate()
  const since = daysBefore(asOf, 420)
  const state = stateOf(portfolio, capital)
  const held = Object.keys(state.holdings)

  const [indexBars, universe] = await Promise.all([
    loadBars([INDEX_INSTRUMENTS.NIFTY_200.barSymbol], since, asOf),
    asOfDate ? liveUniverse(asOf, universeSize) : Promise.resolve([]),
  ])
  const regime = trendRegime(indexBars[INDEX_INSTRUMENTS.NIFTY_200.barSymbol] ?? [])
  const invested = exposure(regime, trendFilter)

  const bars = await loadBars(universe, since, asOf)
  const ranked = rankByFactors(bars, MODES[mode].factors)

  // A share that costs more than one position's budget cannot be bought even once
  const budget = (portfolio ? bookValue(state, {}) : capital) / topN
  const lastClose = new Map(ranked.map(r => [r.symbol, r.lastClose]))
  const picks = selectWithBuffer(ranked, held, topN, exitRank, symbol => lastClose.get(symbol)! <= budget)
  const selected = new Set(picks)
  const skippedUnaffordable = ranked.slice(0, topN).filter(r => !selected.has(r.symbol) && r.lastClose > budget).map(r => r.symbol)

  const notes: string[] = []
  if (!freshness.ok) notes.push(`No orders: ${freshness.message}`)
  if (!invested.invested) notes.push(invested.reason)
  const targets: Record<string, number> = invested.invested && freshness.ok
    ? Object.fromEntries(picks.map(symbol => [symbol, 1 / topN]))
    : {}

  const symbols = [...new Set([...Object.keys(targets), ...held])]
  const { prices, source } = await latestPrices(symbols, client)
  const plan = planRebalance({ state, targets, prices })
  const last = portfolio?.lastRebalance ? String(portfolio.lastRebalance) : null

  return {
    asOf,
    mode,
    trendFilter,
    modeInfo: MODES[mode],
    regime,
    exposure: invested,
    freshness,
    universe: { size: universe.length, ranked: ranked.length },
    book: {
      exists: !!portfolio,
      mode: (portfolio?.mode as RiskMode) ?? mode,
      startingCapital: portfolio?.startingCapital ?? capital,
      state,
      value: bookValue(state, prices),
      rebalance: { ...rebalanceStatus(last, istDate()), last },
      targets,
      plan,
      priceSource: source,
      notes,
      ranking: ranked.slice(0, RANKING_ROWS).map((r, i) => ({
        ...stockFacts(bars[r.symbol]),
        symbol: r.symbol,
        rank: i + 1,
        scorePct: r.score * 100,
        industry: INDUSTRY_BY_SYMBOL[r.symbol] ?? '',
        selected: selected.has(r.symbol),
        held: r.symbol in state.holdings,
      })),
      skippedUnaffordable,
    },
  }
}

export class RebalanceRefused extends Error {}

/** Execute this month's orders at current prices (paper). */
export async function executeRebalance(params: {
  userId: number
  mode: RiskMode
  trendFilter?: boolean
  capital?: number
  client: BrokerClient | null
  force?: boolean
}) {
  const capital = params.capital ?? DEFAULT_CAPITAL
  const plan = await buildMonthlyPlan({
    userId: params.userId, mode: params.mode, trendFilter: params.trendFilter, capital, client: params.client,
  })
  const { book } = plan

  if (!book.rebalance.due && !params.force) throw new RebalanceRefused(book.rebalance.reason)
  if (!plan.freshness.ok) throw new RebalanceRefused(plan.freshness.message)
  if (book.plan.missingPrices.length) {
    throw new RebalanceRefused(`No price for ${book.plan.missingPrices.join(', ')}; cannot rebalance safely.`)
  }

  const symbols = [...new Set([...Object.keys(book.targets), ...Object.keys(book.state.holdings)])]
  const { prices, source } = await latestPrices(symbols, params.client)
  const { state, fills } = applyOrders(book.state, book.plan.orders, prices)
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
      trendFilter: plan.trendFilter,
      signalDate: plan.asOf,
      regime: plan.regime,
      exposure: plan.exposure,
      priceSource: source,
      fills,
      // Every name and its rank at the signal date, so the picks can be scored later
      picks: book.ranking.filter(r => r.selected).map(r => ({ symbol: r.symbol, rank: r.rank })),
    },
  })

  return { value, cash: state.cash, fills, priceSource: source }
}

/** Daily valuation of every model portfolio at stored closes (cron). */
export async function snapshotAllPortfolios(): Promise<number> {
  const all = await db.select().from(modelPortfolios)
  const today = istDate()
  let written = 0
  for (const p of all) {
    const state = stateOf(p, p.startingCapital)
    const { prices } = await latestPrices(Object.keys(state.holdings), null)
    await db.insert(modelPortfolioEvents).values({
      portfolioId: p.id, date: today, type: 'snapshot',
      value: bookValue(state, prices), cash: state.cash, holdings: state.holdings,
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
