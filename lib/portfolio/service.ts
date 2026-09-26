/**
 * Portfolio engine service: monthly plan, paper rebalance, daily snapshots
 * and performance. Two paper books per user:
 *   core      - factor index funds (momentum / low-vol) by risk mode
 *   satellite - top-20 risk-adjusted momentum stocks from the NIFTY 500
 */

import { db } from '@/db'
import { modelPortfolios, modelPortfolioEvents } from '@/db/schema'
import { and, eq, asc } from 'drizzle-orm'
import type { BrokerClient } from '@/lib/broker'
import { MODES, STOCK_MOMENTUM, INDEX_INSTRUMENTS, SLEEVE_FUNDS, type RiskMode } from './config'
import { trendRegime, type TrendRegime } from './regime'
import { allocateSleeves, coreTargets, rebalanceStatus, type SleeveAllocation } from './allocation'
import { rankMomentum, selectAffordable, type RankedStock } from './momentum'
import { planRebalance, applyOrders, bookValue, type BookState, type RebalancePlan } from './rebalance'
import { loadBars, dataFreshness, latestPrices, istDate, type DataFreshness } from './data'
import { UNIVERSE_SYMBOLS, INDUSTRY_BY_SYMBOL } from './universe'

export type BookKind = 'core' | 'satellite'
export const DEFAULT_CAPITAL = 300000

function sinceDate(daysBack: number): string {
  return istDate(new Date(Date.now() - daysBack * 86400000))
}

async function getPortfolio(userId: number, kind: BookKind) {
  const [p] = await db.select().from(modelPortfolios)
    .where(and(eq(modelPortfolios.userId, userId), eq(modelPortfolios.kind, kind))).limit(1)
  return p ?? null
}

function stateOf(p: { cash: number; holdings: unknown } | null, capital: number): BookState {
  return p ? { cash: p.cash, holdings: (p.holdings as BookState['holdings']) ?? {} } : { cash: capital, holdings: {} }
}

async function currentRegime(): Promise<TrendRegime | null> {
  const bars = await loadBars([INDEX_INSTRUMENTS.NIFTY_200.barSymbol], sinceDate(420))
  return trendRegime(bars[INDEX_INSTRUMENTS.NIFTY_200.barSymbol] ?? [])
}

export interface BookPlan {
  kind: BookKind
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
}

export interface MonthlyPlan {
  asOf: string
  mode: RiskMode
  modeInfo: (typeof MODES)[RiskMode]
  regime: TrendRegime | null
  allocation: SleeveAllocation
  freshness: DataFreshness
  core: BookPlan
  satellite: BookPlan & {
    ranking: Array<RankedStock & { industry: string; rank: number; selected: boolean }>
    skippedUnaffordable: string[]
    excluded: { shortHistory: number; illiquid: number; badData: number }
  }
}

async function planBook(params: {
  kind: BookKind
  userId: number
  mode: RiskMode
  capital: number
  targets: Record<string, number>
  client: BrokerClient | null
  notes: string[]
}): Promise<BookPlan> {
  const p = await getPortfolio(params.userId, params.kind)
  const state = stateOf(p, params.capital)
  const symbols = [...new Set([...Object.keys(params.targets), ...Object.keys(state.holdings)])]
  const { prices, source } = await latestPrices(symbols, params.client)
  const plan = planRebalance({ state, targets: params.targets, prices })
  const last = p?.lastRebalance ? String(p.lastRebalance) : null
  return {
    kind: params.kind,
    exists: !!p,
    mode: (p?.mode as RiskMode) ?? params.mode,
    startingCapital: p?.startingCapital ?? params.capital,
    state,
    value: bookValue(state, prices),
    rebalance: { ...rebalanceStatus(last, istDate()), last },
    targets: params.targets,
    plan,
    priceSource: source,
    notes: params.notes,
  }
}

export async function buildMonthlyPlan(params: {
  userId: number
  mode: RiskMode
  capital?: number
  client: BrokerClient | null
}): Promise<MonthlyPlan> {
  const { userId, mode, client } = params
  const capital = params.capital ?? DEFAULT_CAPITAL

  const [freshness, regime] = await Promise.all([dataFreshness(), currentRegime()])
  const allocation = allocateSleeves(mode, regime)

  // Core: index funds
  const core = coreTargets(allocation)
  const coreNotes = core.unfunded.map(s =>
    `The ${s === 'momentum' ? 'momentum' : 'low-volatility'} fund is not configured yet, so its ${Math.round(allocation[s] * 100)}% target has no orders.`)

  // Satellite: stock momentum, same trend rule as the chosen mode
  const bars = await loadBars(UNIVERSE_SYMBOLS, sinceDate(420))
  const ranking = rankMomentum(bars)
  const satPortfolio = await getPortfolio(userId, 'satellite')
  const satCapital = satPortfolio ? bookValue(stateOf(satPortfolio, capital), {}) : capital
  const { picks, skippedUnaffordable } = selectAffordable(ranking.ranked, STOCK_MOMENTUM.topN, satCapital)
  const satInvested = allocation.cash < 1
  const satTargets: Record<string, number> = satInvested && freshness.ok
    ? Object.fromEntries(picks.map(s => [s.symbol, 1 / STOCK_MOMENTUM.topN]))
    : {}
  const satNotes: string[] = []
  if (!freshness.ok) satNotes.push(`No orders: ${freshness.message}`)
  if (!satInvested) satNotes.push(allocation.reason)

  const [corePlan, satPlan] = await Promise.all([
    planBook({ kind: 'core', userId, mode, capital, targets: core.targets, client, notes: coreNotes }),
    planBook({ kind: 'satellite', userId, mode, capital, targets: satTargets, client, notes: satNotes }),
  ])

  const selected = new Set(picks.map(p => p.symbol))
  return {
    asOf: freshness.latestDate ?? istDate(),
    mode,
    modeInfo: MODES[mode],
    regime,
    allocation,
    freshness,
    core: corePlan,
    satellite: {
      ...satPlan,
      ranking: ranking.ranked.slice(0, 40).map((s, i) => ({
        ...s, rank: i + 1, industry: INDUSTRY_BY_SYMBOL[s.symbol] ?? '', selected: selected.has(s.symbol),
      })),
      skippedUnaffordable,
      excluded: ranking.excluded,
    },
  }
}

export class RebalanceRefused extends Error {}

/** Execute this month's orders for one book at current prices (paper). */
export async function executeRebalance(params: {
  userId: number
  kind: BookKind
  mode: RiskMode
  capital?: number
  client: BrokerClient | null
  force?: boolean
}) {
  const capital = params.capital ?? DEFAULT_CAPITAL
  const plan = await buildMonthlyPlan({ userId: params.userId, mode: params.mode, capital, client: params.client })
  const book = plan[params.kind]

  if (!book.rebalance.due && !params.force) throw new RebalanceRefused(book.rebalance.reason)
  if (params.kind === 'satellite' && !plan.freshness.ok) throw new RebalanceRefused(plan.freshness.message)
  if (book.plan.missingPrices.length) {
    throw new RebalanceRefused(`No price for ${book.plan.missingPrices.join(', ')}; cannot rebalance safely.`)
  }

  const symbols = [...new Set([...Object.keys(book.targets), ...Object.keys(book.state.holdings)])]
  const { prices, source } = await latestPrices(symbols, params.client)
  const { state, fills } = applyOrders(book.state, book.plan.orders, prices)
  const today = istDate()
  const value = bookValue(state, prices)

  let portfolio = await getPortfolio(params.userId, params.kind)
  if (!portfolio) {
    ;[portfolio] = await db.insert(modelPortfolios).values({
      userId: params.userId, kind: params.kind, mode: params.mode,
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
      regime: plan.regime,
      allocation: plan.allocation,
      priceSource: source,
      fills,
      ranking: params.kind === 'satellite' ? plan.satellite.ranking.filter(r => r.selected).map(r => r.symbol) : undefined,
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

/** Value history for both books plus NIFTY 50 over the same dates. */
export async function portfolioPerformance(userId: number) {
  const books = await db.select().from(modelPortfolios).where(eq(modelPortfolios.userId, userId))
  const out: Record<string, { startingCapital: number; points: Array<{ date: string; value: number; type: string }> }> = {}
  let firstDate: string | null = null

  for (const b of books) {
    const events = await db.select().from(modelPortfolioEvents)
      .where(eq(modelPortfolioEvents.portfolioId, b.id))
      .orderBy(asc(modelPortfolioEvents.date), asc(modelPortfolioEvents.id))
    const byDate = new Map<string, { date: string; value: number; type: string }>()
    for (const e of events) byDate.set(String(e.date), { date: String(e.date), value: e.value, type: e.type })
    const points = [...byDate.values()]
    out[b.kind] = { startingCapital: b.startingCapital, points }
    if (points[0] && (!firstDate || points[0].date < firstDate)) firstDate = points[0].date
  }

  let benchmark: Array<{ date: string; value: number }> = []
  if (firstDate) {
    const bars = await loadBars([INDEX_INSTRUMENTS.NIFTY_50.barSymbol], firstDate)
    benchmark = (bars[INDEX_INSTRUMENTS.NIFTY_50.barSymbol] ?? []).map(b => ({ date: b.date, value: b.close }))
  }
  return { books: out, benchmark, fundsConfigured: SLEEVE_FUNDS }
}
