/**
 * A swing rule run as a real book: a fixed number of positions, whole
 * shares, charges on every order, and tax at each financial year end.
 *
 * Per-trade averages flatter a rule whose signals bunch on a few bad days,
 * because a book can only take so many of them. This shows what the money
 * would have done.
 */
import { calculateTradeCosts, DEFAULT_COSTS, type CostConfig } from '@/lib/backtest/costs'
import { daysBetween, financialYear, lastAtOrBefore } from './dates'
import type { Market } from './market'
import type { Curve } from './metrics'
import { indicators, type SignalContext, type SwingSignal } from './swing'
import { TaxLedger } from './tax'

export interface Candidate {
  symbol: string
  /** Bar of the stock's series to buy on (the session after the signal). */
  entryIndex: number
  /** 5-session return at the signal, and rupees traded that day. */
  ret5: number
  turnover: number
  /** Rise over the two sessions before the signal, when the rule is about a jump. */
  jump?: number
}

/** Every time `signal` fires for a stock in the universe, keyed by the session to buy on. */
export function scanSignal(market: Market, signal: SwingSignal, start: number, universeSize = 500): Map<number, Candidate[]> {
  const sessionIndex = new Map<number, number>()
  market.sessions.forEach((d, i) => sessionIndex.set(d, i))
  const members = new Map<number, Set<string>>()
  for (const d of market.universeDates) members.set(d, new Set(market.universe.get(d)!.slice(0, universeSize)))
  const memberOn = (symbol: string, date: number): boolean => {
    const i = lastAtOrBefore(market.universeDates, date)
    return i >= 0 && members.get(market.universeDates[i])!.has(symbol)
  }

  const out = new Map<number, Candidate[]>()
  for (const s of market.stocks.values()) {
    const ind = indicators(s)
    let resultsPointer = 0
    for (let i = 252; i < s.dates.length - 1; i++) {
      if (s.dates[i] < start || !memberOn(s.symbol, s.dates[i])) continue
      if (sessionIndex.get(s.dates[i + 1]) !== sessionIndex.get(s.dates[i])! + 1) continue
      while (resultsPointer < s.resultsDates.length && s.resultsDates[resultsPointer] < s.dates[i - 1]) resultsPointer++
      // The cross-sectional cut-offs are not needed by the rules a book is run on
      const context: SignalContext = {
        s, ind, i, ret5Low: -Infinity, ret5High: Infinity,
        resultsJustOut: resultsPointer < s.resultsDates.length && s.resultsDates[resultsPointer] <= s.dates[i],
      }
      if (!signal.fires(context)) continue
      const date = s.dates[i + 1]
      out.set(date, [...(out.get(date) ?? []), { symbol: s.symbol, entryIndex: i + 1, ret5: ind.ret5[i], turnover: s.turnover[i] }])
    }
  }
  return out
}

export interface BookOptions {
  start: number
  capital: number
  /** Most positions held at once; each new one gets this share of the book. */
  slots: number
  /** Sell at the close of this session, counting the entry session as 1. */
  maxSessions: number
  /** Sell when the price falls this far below the entry. Null: no stop. */
  stopPct: number | null
  /** Sell when the price rises this far above the entry. Left out or null: no target. */
  targetPct?: number | null
  /**
   * Trailing stop: sell when the price falls this far below the highest close since the entry.
   * It works alongside `stopPct`; whichever level is higher applies.
   */
  trailPct?: number | null
  /** Buy at the open, at the session's average price, or at its close. */
  entry: 'open' | 'vwap' | 'close'
  /** Called for every closed trade, for per-trade figures. */
  onTrade?: (trade: { symbol: string; entryDate: number; exitDate: number; retPct: number; sessions: number; reason: 'stop' | 'target' | 'time' | 'delisted' }) => void
  /** Which candidates to take first when there are more than free slots. */
  priority: (a: Candidate, b: Candidate) => number
  payTax: boolean
  /** Yearly return on idle cash, as a fraction. Left out: cash earns nothing. */
  cashYield?: number
  costs?: CostConfig
}

interface Position { symbol: string; qty: number; cost: number; entryIndex: number; stop: number; target: number; peak: number; next: number }

export interface BookResult {
  curve: Curve
  trades: number
  wins: number
  /** Signals not taken because the book was full or short of cash. */
  skipped: number
  /** Average share of the book in shares rather than cash. */
  avgInvested: number
  /** Share of the book in shares at each close, in step with the curve. */
  invested: number[]
  charges: number
  tax: number
}

export function simulateSwingBook(market: Market, candidates: Map<number, Candidate[]>, options: BookOptions): BookResult {
  const costs = options.costs ?? DEFAULT_COSTS
  const ledger = new TaxLedger()
  const positions = new Map<string, Position>()
  const curve: Curve = { dates: [], equity: [] }
  let cash = options.capital, equity = options.capital
  let trades = 0, wins = 0, skipped = 0, charges = 0, tax = 0, investedSum = 0
  const invested: number[] = []

  const sessions = market.sessions
  for (let si = lastAtOrBefore(sessions, options.start - 1) + 1; si < sessions.length; si++) {
    const date = sessions[si]
    if (options.cashYield && curve.dates.length && cash > 0) cash *= (1 + options.cashYield) ** (daysBetween(sessions[si - 1], date) / 365)

    // Buy this morning's candidates, sized on last night's book value
    const today = (candidates.get(date) ?? []).filter(c => !positions.has(c.symbol)).sort(options.priority)
    for (const c of today) {
      if (positions.size >= options.slots) { skipped++; continue }
      const s = market.stocks.get(c.symbol)!
      const raw = options.entry === 'vwap' ? s.fill[c.entryIndex] : options.entry === 'close' ? s.close[c.entryIndex] : s.open[c.entryIndex]
      const buy = raw * (1 + costs.slippagePercent)
      const qty = Math.floor(Math.min(equity / options.slots, cash) / (buy * 1.002))
      if (!(raw > 0) || qty < 1) { skipped++; continue }
      const fee = calculateTradeCosts(buy, buy, qty, costs).entryCosts
      cash -= qty * buy + fee
      charges += fee
      ledger.buy(c.symbol, qty, qty * buy + fee, date)
      positions.set(c.symbol, {
        symbol: c.symbol, qty, cost: qty * buy + fee, entryIndex: c.entryIndex,
        stop: options.stopPct == null ? 0 : raw * (1 - options.stopPct / 100),
        target: options.targetPct == null ? Infinity : raw * (1 + options.targetPct / 100), peak: raw, next: c.entryIndex,
      })
    }

    // Sell what hits its stop or runs out of time today
    let held = 0
    for (const p of [...positions.values()]) {
      const s = market.stocks.get(p.symbol)!
      while (p.next < s.dates.length && s.dates[p.next] < date) p.next++
      const j = p.next
      const tradedToday = j < s.dates.length && s.dates[j] === date
      const gone = j >= s.dates.length
      let exit: number | null = null
      let reason: 'stop' | 'target' | 'time' | 'delisted' = 'time'
      // A position bought at the close cannot be stopped or reach its target the same day
      const live = j > p.entryIndex || options.entry !== 'close'
      // The stop in force today: the fixed one, or the trailing one from the highest close so far
      const stop = options.trailPct == null ? p.stop : Math.max(p.stop, p.peak * (1 - options.trailPct / 100))
      if (gone) { exit = s.close[s.close.length - 1]; reason = 'delisted' }
      else if (tradedToday) {
        // When a day touches both levels the stop is taken to come first
        if (live && j > p.entryIndex && s.open[j] <= stop) { exit = s.open[j]; reason = 'stop' }
        else if (live && s.low[j] <= stop) { exit = stop; reason = 'stop' }
        else if (live && j > p.entryIndex && s.open[j] >= p.target) { exit = s.open[j]; reason = 'target' }
        else if (live && s.high[j] >= p.target) { exit = p.target; reason = 'target' }
        else if (j >= p.entryIndex + options.maxSessions - 1) exit = s.close[j]
        if (exit == null && s.close[j] > p.peak) p.peak = s.close[j]
      }
      if (exit == null) {
        held += p.qty * s.close[tradedToday ? j : Math.max(0, j - 1)]
        continue
      }
      const sell = exit * (1 - costs.slippagePercent)
      const fee = calculateTradeCosts(sell, sell, p.qty, costs).exitCosts
      const proceeds = p.qty * sell - fee
      cash += proceeds
      charges += fee
      ledger.sell(p.symbol, p.qty, proceeds, date)
      trades++
      if (proceeds > p.cost) wins++
      options.onTrade?.({ symbol: p.symbol, entryDate: s.dates[p.entryIndex], exitDate: date, retPct: (proceeds / p.cost - 1) * 100, sessions: Math.min(j, s.dates.length - 1) - p.entryIndex + 1, reason })
      positions.delete(p.symbol)
    }

    // Tax for the financial year is paid from cash on its last session
    if (si === sessions.length - 1 || financialYear(sessions[si + 1]) !== financialYear(date)) {
      const due = ledger.settleYear(financialYear(date)).tax
      if (options.payTax) { cash -= due; tax += due }
    }

    equity = cash + held
    investedSum += held / equity
    invested.push(held / equity)
    curve.dates.push(date)
    curve.equity.push(equity)
  }
  return { curve, trades, wins, skipped, avgInvested: investedSum / curve.dates.length, invested, charges, tax }
}
