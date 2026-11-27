/**
 * Portfolio backtest.
 *
 * The rules that keep it honest:
 *   - A strategy sees the market only through a context bound to the signal
 *     date; nothing after that date's close is reachable.
 *   - Signals are taken at the close of the last session of a month and
 *     traded during the NEXT session, at its volume-weighted average price.
 *   - Every fill pays slippage and the statutory charges the paper book pays
 *     (lib/backtest/costs.ts), and realised gains pay capital gains tax.
 *   - The universe is point-in-time, and a holding that is delisted is
 *     written down rather than silently dropped.
 */
import { applySlippage, calculateTradeCosts, DEFAULT_COSTS, type CostConfig } from '@/lib/backtest/costs'
import { RESIZE_BAND } from '@/lib/portfolio/config'
import type { DailyBar } from '@/lib/portfolio/momentum'
import { daysBetween, financialYear, isoDate, lastAtOrBefore } from './dates'
import { barsUpTo, indexBarsUpTo, universeAsOf, type Market, type StockSeries } from './market'
import { GroupedTaxLedger, INDIA_EQUITY_TAX, TaxLedger, type Ledger, type TaxGroup, type TaxRules, type YearTax } from './tax'

export interface StrategyContext {
  /** Signal date (YYYYMMDD). Its close is known; nothing later is. */
  date: number
  /** The `size` most traded stocks as known on the signal date. */
  universe(size: number): string[]
  /** Last `count` bars of a stock up to the signal date. Empty if it has none. */
  bars(symbol: string, count: number): DailyBar[]
  /** Last `count` closes of an index (daily_bars symbol, e.g. "IDX:NIFTY 200"). */
  indexBars(symbol: string, count: number): Array<{ date: string; close: number }>
  /** Dates (YYYY-MM-DD, ascending) of a stock's results board meetings up to the signal date. */
  resultsDates(symbol: string): string[]
  /** Current portfolio weights at the signal date's close. */
  holdings: ReadonlyMap<string, number>
}

export interface Strategy {
  name: string
  /** Target weights by symbol. They may sum to less than 1; the rest is cash. */
  targets(ctx: StrategyContext): Record<string, number>
}

export interface SimOptions {
  start: number
  end: number
  capital: number
  costs: CostConfig
  /** A holding is resized only when it is off target by more than this fraction. */
  band: number
  /** Annual return on idle cash (a liquid fund). */
  cashYield: number
  /** null for a before-tax run. */
  tax: TaxRules | null
  /** Holdings taxed under other rules than `tax` (gold, bond and foreign funds). */
  taxGroups?: TaxGroup[]
  /** Reinvest ordinary dividends (total return) rather than ignore them (price return). */
  dividends: boolean
  /** Share of the last traded price lost when a holding is delisted. */
  delistingHaircut: number
}

export const DEFAULT_SIM: Omit<SimOptions, 'start' | 'end'> = {
  capital: 1_000_000,
  costs: DEFAULT_COSTS,
  band: RESIZE_BAND,
  cashYield: 0.06,
  tax: INDIA_EQUITY_TAX,
  dividends: true,
  delistingHaircut: 0.2,
}

export interface Trade {
  date: number
  symbol: string
  side: 'BUY' | 'SELL'
  value: number     // at the fill price
  charges: number
}

export interface SimResult {
  strategy: string
  dates: number[]
  equity: number[]
  trades: Trade[]
  rebalances: Array<{ date: number; positions: number; investedPct: number }>
  taxes: YearTax[]
  delistings: Array<{ date: number; symbol: string; writtenOff: number }>
  totals: { traded: number; charges: number; slippage: number; tax: number }
}

/** A stock with no bar for this many sessions, and none ever again, is treated as delisted. */
const DELISTED_AFTER_SESSIONS = 20

export function simulate(market: Market, strategy: Strategy, options: Partial<SimOptions> & Pick<SimOptions, 'start' | 'end'>): SimResult {
  const opt: SimOptions = { ...DEFAULT_SIM, ...options }
  const { sessions } = market
  const first = lastAtOrBefore(sessions, opt.start - 1) + 1
  const last = lastAtOrBefore(sessions, opt.end)

  let cash = opt.capital
  const units = new Map<string, number>()
  const ledger: Ledger | null = !opt.tax ? null : opt.taxGroups?.length ? new GroupedTaxLedger(opt.tax, opt.taxGroups) : new TaxLedger(opt.tax)
  const result: SimResult = {
    strategy: strategy.name, dates: [], equity: [], trades: [], rebalances: [], taxes: [], delistings: [],
    totals: { traded: 0, charges: 0, slippage: 0, tax: 0 },
  }

  const seriesOf = (symbol: string): StockSeries | undefined => market.stocks.get(symbol)
  const px = (s: StockSeries, i: number, field: 'fill' | 'close') => s[field][i] * (opt.dividends ? s.dividendFactor[i] : 1)
  /** Value of one unit at the close on or before `date`. */
  const lastClose = (symbol: string, date: number): number => {
    const s = seriesOf(symbol)!
    return px(s, lastAtOrBefore(s.dates, date), 'close')
  }
  /** Today's fill price if the stock trades today, else null. */
  const fillToday = (symbol: string, date: number): number | null => {
    const s = seriesOf(symbol)
    if (!s) return null
    const i = lastAtOrBefore(s.dates, date)
    return i >= 0 && s.dates[i] === date ? px(s, i, 'fill') : null
  }
  const equityAt = (date: number, price: (symbol: string) => number): number => {
    let value = cash
    for (const [symbol, u] of units) value += u * price(symbol)
    return value
  }

  const sell = (symbol: string, sellUnits: number, open: number, date: number) => {
    const fill = applySlippage(open, 'SELL', opt.costs)
    const charges = calculateTradeCosts(fill, fill, sellUnits, opt.costs).exitCosts
    const proceeds = sellUnits * fill - charges
    cash += proceeds
    ledger?.sell(symbol, sellUnits, proceeds, date)
    const left = units.get(symbol)! - sellUnits
    if (left > 1e-9) units.set(symbol, left)
    else units.delete(symbol)
    result.trades.push({ date, symbol, side: 'SELL', value: sellUnits * fill, charges })
    result.totals.traded += sellUnits * fill
    result.totals.charges += charges
    result.totals.slippage += sellUnits * (open - fill)
  }

  const rebalance = (date: number, targets: Record<string, number>, blockedExits: Set<string>) => {
    const price = (symbol: string) => fillToday(symbol, date) ?? lastClose(symbol, date)
    const equity = equityAt(date, price)

    // Sells first, so the cash is there for the buys
    for (const [symbol, held] of [...units]) {
      const open = fillToday(symbol, date)
      const weight = targets[symbol] ?? 0
      if (open == null) {
        if (weight === 0) blockedExits.add(symbol) // not trading today: sell when it next does
        continue
      }
      const target = weight * equity
      const current = held * open
      if (weight === 0) sell(symbol, held, open, date)
      else if (current > target * (1 + opt.band)) sell(symbol, (current - target) / open, open, date)
    }

    // A tax payment can leave cash negative: raise it from every holding in proportion
    if (cash < -1) {
      const tradable = [...units].map(([symbol, held]) => ({ symbol, held, open: fillToday(symbol, date) }))
        .filter((h): h is { symbol: string; held: number; open: number } => h.open != null)
      const value = tradable.reduce((sum, h) => sum + h.held * h.open, 0)
      const share = Math.min(1, (-cash * 1.01) / value)
      if (value > 0) for (const h of tradable) sell(h.symbol, h.held * share, h.open, date)
    }

    const buys: Array<{ symbol: string; open: number; spend: number }> = []
    for (const [symbol, weight] of Object.entries(targets)) {
      const open = fillToday(symbol, date)
      if (!(weight > 0) || open == null) continue
      const target = weight * equity
      const current = (units.get(symbol) ?? 0) * open
      if (current === 0) buys.push({ symbol, open, spend: target })
      else if (current < target * (1 - opt.band)) buys.push({ symbol, open, spend: target - current })
    }
    const cost = (b: { open: number; spend: number }) => {
      const fill = applySlippage(b.open, 'BUY', opt.costs)
      const bought = b.spend / b.open
      return { fill, bought, charges: calculateTradeCosts(fill, fill, bought, opt.costs).entryCosts }
    }
    const needed = buys.reduce((sum, b) => { const c = cost(b); return sum + c.bought * c.fill + c.charges }, 0)
    const scale = needed > cash ? Math.max(0, cash) / needed : 1
    for (const b of buys) {
      const c = cost({ open: b.open, spend: b.spend * scale })
      if (!(c.bought > 0)) continue
      const paid = c.bought * c.fill + c.charges
      cash -= paid
      units.set(b.symbol, (units.get(b.symbol) ?? 0) + c.bought)
      ledger?.buy(b.symbol, c.bought, paid, date)
      result.trades.push({ date, symbol: b.symbol, side: 'BUY', value: c.bought * c.fill, charges: c.charges })
      result.totals.traded += c.bought * c.fill
      result.totals.charges += c.charges
      result.totals.slippage += c.bought * (c.fill - b.open)
    }

    const after = equityAt(date, price)
    result.rebalances.push({ date, positions: units.size, investedPct: after > 0 ? (1 - cash / after) * 100 : 0 })
  }

  let pending: Record<string, number> | null = null
  const blockedExits = new Set<string>()

  for (let t = first; t <= last; t++) {
    const date = sessions[t]
    const previous = t > first ? sessions[t - 1] : null

    if (previous != null) {
      if (cash > 0) cash *= (1 + opt.cashYield) ** (daysBetween(previous, date) / 365)
      if (ledger && financialYear(date) !== financialYear(previous)) {
        const year = ledger.settleYear(financialYear(previous))
        cash -= year.tax
        result.taxes.push(year)
        result.totals.tax += year.tax
      }
    }

    if (pending) {
      rebalance(date, pending, blockedExits)
      pending = null
    }
    for (const symbol of [...blockedExits]) {
      const open = fillToday(symbol, date)
      if (!units.has(symbol)) blockedExits.delete(symbol)
      else if (open != null) { sell(symbol, units.get(symbol)!, open, date); blockedExits.delete(symbol) }
    }

    for (const [symbol, held] of [...units]) {
      const s = seriesOf(symbol)!
      const lastBar = s.dates[s.dates.length - 1]
      if (lastBar < date && t - lastAtOrBefore(sessions, lastBar) > DELISTED_AFTER_SESSIONS) {
        const value = held * px(s, s.dates.length - 1, 'close')
        const proceeds = value * (1 - opt.delistingHaircut)
        cash += proceeds
        ledger?.sell(symbol, held, proceeds, date)
        units.delete(symbol)
        blockedExits.delete(symbol)
        result.delistings.push({ date, symbol, writtenOff: value - proceeds })
      }
    }

    const equity = equityAt(date, symbol => lastClose(symbol, date))
    result.dates.push(date)
    result.equity.push(equity)

    const monthEnd = t < last && Math.floor(sessions[t + 1] / 100) !== Math.floor(date / 100)
    if (monthEnd) {
      const holdings = new Map<string, number>()
      for (const [symbol, u] of units) holdings.set(symbol, (u * lastClose(symbol, date)) / equity)
      const targets = strategy.targets({
        date,
        universe: size => universeAsOf(market, date, size),
        bars: (symbol, count) => { const s = seriesOf(symbol); return s ? barsUpTo(s, date, count) : [] },
        indexBars: (symbol, count) => { const s = market.indices.get(symbol); return s ? indexBarsUpTo(s, date, count) : [] },
        resultsDates: symbol => {
          const s = seriesOf(symbol)
          return s ? Array.from(s.resultsDates.subarray(0, lastAtOrBefore(s.resultsDates, date) + 1), isoDate) : []
        },
        holdings,
      })
      const total = Object.values(targets).reduce((a, b) => a + b, 0)
      if (total > 1 + 1e-9 || Object.values(targets).some(w => !(w >= 0))) {
        throw new Error(`${strategy.name}: invalid target weights on ${date} (sum ${total})`)
      }
      pending = targets
    }
  }
  return result
}
