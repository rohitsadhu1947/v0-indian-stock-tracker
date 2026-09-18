/**
 * Walk-forward backtester.
 *
 * Runs THE LIVE SIGNAL CODE (scanForMomentumSignals) over historical bars, so
 * what is measured is what is traded. The previous backtester had its own
 * scoring, its own levels and zero costs, so its results said nothing about
 * the strategy the app actually runs.
 *
 * Rules that keep it honest:
 *  - Signals are computed from bars up to and including day D's close.
 *  - Entries fill at day D+1's OPEN, plus slippage. No same-bar entry.
 *  - Exits are checked intrabar on each later day: stop before target when a
 *    single day touched both; a gap through a level fills at that day's open.
 *  - Positions still open at the end are closed at the final close (marked).
 *  - Every round trip pays brokerage, STT, exchange, SEBI, stamp duty, GST,
 *    DP charges and slippage.
 */

import { scanForMomentumSignals } from '@/lib/momentum-scanner'
import { getProfile, type TradeProfile, type TradeProfileId } from '@/lib/trade-profiles'
import { calculateTradeCosts, applySlippage, DEFAULT_COSTS, type CostConfig } from './costs'

export interface Bar {
  date: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface BacktestParams {
  /** Daily bars per symbol, oldest first. */
  barsBySymbol: Record<string, Bar[]>
  capital: number
  profile?: TradeProfileId | TradeProfile
  costs?: CostConfig
  /** Bars of history required before the first trade date. */
  warmupBars?: number
  /** Only take signals at or above this momentum score (0-100). */
  minScore?: number
  /** Max new entries per day. */
  maxNewPositionsPerDay?: number
  startDate?: Date
  endDate?: Date
}

export interface BacktestTrade {
  symbol: string
  entryDate: Date
  entryPrice: number
  exitDate: Date
  exitPrice: number
  quantity: number
  exitReason: 'STOP_LOSS' | 'TARGET_1' | 'TARGET_2' | 'TIME_STOP' | 'END_OF_TEST'
  grossPnl: number
  costs: number
  netPnl: number
  netPnlPercent: number
  holdingDays: number
  momentumScore: number
  stopLoss: number
  target1: number
  target2: number
}

export interface BacktestResult {
  profile: string
  from: Date
  to: Date
  tradingDays: number
  startingCapital: number
  endingCapital: number
  totalReturnPercent: number
  trades: BacktestTrade[]
  totalTrades: number
  wins: number
  losses: number
  winRate: number
  avgWinPercent: number
  avgLossPercent: number
  avgTradePercent: number
  profitFactor: number
  expectancyPercent: number
  maxDrawdownPercent: number
  avgHoldingDays: number
  totalCosts: number
  exitBreakdown: Record<string, number>
  equityCurve: Array<{ date: Date; equity: number }>
}

interface OpenPosition {
  symbol: string
  entryDate: Date
  entryPrice: number
  quantity: number
  stopLoss: number
  target1: number
  target2: number
  momentumScore: number
  barsHeld: number
}

/** First level touched on a bar, if any. Stop wins ties (conservative). */
function exitOnBar(bar: Bar, p: OpenPosition): { reason: BacktestTrade['exitReason']; price: number } | null {
  if (bar.low <= p.stopLoss) {
    // A gap down below the stop fills at the open, not the stop price
    return { reason: 'STOP_LOSS', price: Math.min(bar.open, p.stopLoss) }
  }
  if (bar.high >= p.target2) {
    return { reason: 'TARGET_2', price: Math.max(bar.open, p.target2) }
  }
  if (bar.high >= p.target1) {
    return { reason: 'TARGET_1', price: Math.max(bar.open, p.target1) }
  }
  return null
}

function averageVolume(bars: Bar[], period = 20): number {
  const slice = bars.slice(-period)
  if (slice.length === 0) return 0
  return slice.reduce((sum, b) => sum + b.volume, 0) / slice.length
}

export async function runWalkForwardBacktest(params: BacktestParams): Promise<BacktestResult> {
  const {
    barsBySymbol,
    capital: startingCapital,
    costs = DEFAULT_COSTS,
    warmupBars = 60,
    minScore = 0,
    maxNewPositionsPerDay = 3,
  } = params

  const profile = typeof params.profile === 'object' ? params.profile : getProfile(params.profile)
  const symbols = Object.keys(barsBySymbol)

  // Union of all trading dates, chronological
  const dateKeys = new Set<string>()
  for (const bars of Object.values(barsBySymbol)) {
    for (const b of bars) dateKeys.add(b.date.toISOString().slice(0, 10))
  }
  let dates = [...dateKeys].sort()
  if (params.startDate) dates = dates.filter(d => d >= params.startDate!.toISOString().slice(0, 10))
  if (params.endDate) dates = dates.filter(d => d <= params.endDate!.toISOString().slice(0, 10))

  // Per-symbol index for O(1) lookup by date
  const indexBySymbol: Record<string, Map<string, number>> = {}
  for (const [symbol, bars] of Object.entries(barsBySymbol)) {
    const m = new Map<string, number>()
    bars.forEach((b, i) => m.set(b.date.toISOString().slice(0, 10), i))
    indexBySymbol[symbol] = m
  }

  let cash = startingCapital
  const open: OpenPosition[] = []
  const trades: BacktestTrade[] = []
  const equityCurve: Array<{ date: Date; equity: number }> = []
  let pendingEntries: Array<Omit<OpenPosition, 'barsHeld' | 'entryDate' | 'entryPrice'> & { signalPrice: number }> = []
  let totalCosts = 0

  const closeTrade = (
    p: OpenPosition,
    exitDateKey: string,
    rawExitPrice: number,
    reason: BacktestTrade['exitReason']
  ) => {
    const exitPrice = applySlippage(rawExitPrice, 'SELL', costs)
    const grossPnl = (exitPrice - p.entryPrice) * p.quantity
    const tradeCosts = calculateTradeCosts(p.entryPrice, exitPrice, p.quantity, costs).totalCosts
    const netPnl = grossPnl - tradeCosts
    const exitDate = new Date(exitDateKey)

    cash += p.quantity * exitPrice - tradeCosts
    totalCosts += tradeCosts

    trades.push({
      symbol: p.symbol,
      entryDate: p.entryDate,
      entryPrice: p.entryPrice,
      exitDate,
      exitPrice,
      quantity: p.quantity,
      exitReason: reason,
      grossPnl,
      costs: tradeCosts,
      netPnl,
      netPnlPercent: (netPnl / (p.entryPrice * p.quantity)) * 100,
      holdingDays: Math.max(1, Math.round((exitDate.getTime() - p.entryDate.getTime()) / 86400000)),
      momentumScore: p.momentumScore,
      stopLoss: p.stopLoss,
      target1: p.target1,
      target2: p.target2,
    })
  }

  for (let d = 0; d < dates.length; d++) {
    const dateKey = dates[d]
    const barFor = (symbol: string): Bar | null => {
      const i = indexBySymbol[symbol]?.get(dateKey)
      return i === undefined ? null : barsBySymbol[symbol][i]
    }

    // ── 1. Fill yesterday's signals at today's open ───────────────────────
    for (const entry of pendingEntries) {
      const bar = barFor(entry.symbol)
      if (!bar) continue
      if (open.some(p => p.symbol === entry.symbol)) continue
      if (open.length >= profile.maxPositions) break

      const entryPrice = applySlippage(bar.open, 'BUY', costs)

      // Size was computed on yesterday's close; a gap up can push the position
      // past the per-trade capital cap, so trim it to the actual fill price.
      const maxCapital = Math.min(cash, startingCapital * profile.maxCapitalPerTradePct)
      let quantity = entry.quantity
      if (quantity * entryPrice > maxCapital) {
        quantity = Math.floor(maxCapital / entryPrice)
      }
      const cost = entryPrice * quantity
      if (quantity <= 0 || cost > cash) continue

      // Levels move with the actual fill, not the signal-day close
      const scale = entryPrice / entry.signalPrice
      cash -= cost
      open.push({
        symbol: entry.symbol,
        entryDate: new Date(dateKey),
        entryPrice,
        quantity,
        stopLoss: entry.stopLoss * scale,
        target1: entry.target1 * scale,
        target2: entry.target2 * scale,
        momentumScore: entry.momentumScore,
        barsHeld: 0,
      })
    }
    pendingEntries = []

    // ── 2. Manage open positions on today's bar ──────────────────────────
    for (let i = open.length - 1; i >= 0; i--) {
      const p = open[i]
      const bar = barFor(p.symbol)
      if (!bar) continue

      p.barsHeld++
      const hit = exitOnBar(bar, p)

      if (hit) {
        closeTrade(p, dateKey, hit.price, hit.reason)
        open.splice(i, 1)
      } else if (p.barsHeld >= profile.maxHoldDays) {
        closeTrade(p, dateKey, bar.close, 'TIME_STOP')
        open.splice(i, 1)
      }
    }

    // ── 3. Generate signals from data up to today's close ────────────────
    const room = profile.maxPositions - open.length
    if (d >= warmupBars && d < dates.length - 1 && room > 0) {
      const stocksData = []
      for (const symbol of symbols) {
        const idx = indexBySymbol[symbol].get(dateKey)
        if (idx === undefined || idx < warmupBars) continue
        if (open.some(p => p.symbol === symbol)) continue

        const history = barsBySymbol[symbol].slice(Math.max(0, idx - warmupBars), idx + 1)
        const today = history[history.length - 1]
        const prev = history[history.length - 2]
        if (!prev || !today) continue

        stocksData.push({
          symbol,
          exchange: 'NSE',
          instrumentToken: '0',
          current: today.close,
          change: today.close - prev.close,
          changePercent: ((today.close - prev.close) / prev.close) * 100,
          volume: today.volume,
          avgVolume: averageVolume(history.slice(0, -1)),
          // Newest-LAST, as the live scanner receives from Kite
          candles: history,
        })
      }

      if (stocksData.length > 0) {
        const scan = await scanForMomentumSignals(stocksData, cash, { profile, maxPositions: profile.maxPositions })
        const candidates = scan.signals
          .filter(s => s.signal !== 'SKIP' && s.momentumScore >= minScore && s.positionSize > 0)
          .sort((a, b) => b.momentumScore - a.momentumScore)
          .slice(0, Math.min(room, maxNewPositionsPerDay))

        pendingEntries = candidates.map(s => ({
          symbol: s.symbol,
          quantity: s.positionSize,
          stopLoss: s.stopLoss,
          target1: s.target1,
          target2: s.target2,
          momentumScore: s.momentumScore,
          signalPrice: s.entryPrice,
        }))
      }
    }

    // ── 4. Mark to market ────────────────────────────────────────────────
    let holdings = 0
    for (const p of open) {
      const bar = barFor(p.symbol)
      holdings += p.quantity * (bar ? bar.close : p.entryPrice)
    }
    equityCurve.push({ date: new Date(dateKey), equity: cash + holdings })
  }

  // Close anything still open at the last available price
  const lastKey = dates[dates.length - 1]
  for (const p of open) {
    const i = indexBySymbol[p.symbol]?.get(lastKey)
    const price = i === undefined ? p.entryPrice : barsBySymbol[p.symbol][i].close
    closeTrade(p, lastKey, price, 'END_OF_TEST')
  }
  open.length = 0

  // The last curve point valued open positions at the close; after liquidating
  // them it must equal cash, or the reported return omits exit costs.
  if (equityCurve.length) equityCurve[equityCurve.length - 1].equity = cash

  // ── Statistics ─────────────────────────────────────────────────────────
  const wins = trades.filter(t => t.netPnl > 0)
  const losses = trades.filter(t => t.netPnl <= 0)
  const grossProfit = wins.reduce((s, t) => s + t.netPnl, 0)
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0))

  let peak = startingCapital
  let maxDrawdown = 0
  for (const point of equityCurve) {
    peak = Math.max(peak, point.equity)
    maxDrawdown = Math.max(maxDrawdown, ((peak - point.equity) / peak) * 100)
  }

  const endingCapital = equityCurve.length ? equityCurve[equityCurve.length - 1].equity : startingCapital
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  const winRate = trades.length ? (wins.length / trades.length) * 100 : 0
  const avgWinPercent = avg(wins.map(t => t.netPnlPercent))
  const avgLossPercent = avg(losses.map(t => t.netPnlPercent))

  const exitBreakdown: Record<string, number> = {}
  for (const t of trades) exitBreakdown[t.exitReason] = (exitBreakdown[t.exitReason] || 0) + 1

  return {
    profile: profile.id,
    from: new Date(dates[0]),
    to: new Date(lastKey),
    tradingDays: dates.length,
    startingCapital,
    endingCapital,
    totalReturnPercent: ((endingCapital - startingCapital) / startingCapital) * 100,
    trades,
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate,
    avgWinPercent,
    avgLossPercent,
    avgTradePercent: avg(trades.map(t => t.netPnlPercent)),
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    expectancyPercent: (winRate / 100) * avgWinPercent + (1 - winRate / 100) * avgLossPercent,
    maxDrawdownPercent: maxDrawdown,
    avgHoldingDays: avg(trades.map(t => t.holdingDays)),
    totalCosts,
    exitBreakdown,
    equityCurve,
  }
}
