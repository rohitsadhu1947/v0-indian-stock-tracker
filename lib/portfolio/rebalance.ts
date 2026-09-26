/**
 * Turn target weights into whole-share buy/sell orders, and apply them to a
 * paper book with realistic fills (slippage + Indian delivery charges).
 */

import { applySlippage, calculateTradeCosts, DEFAULT_COSTS, type CostConfig } from '@/lib/backtest/costs'
import { MIN_TRADE_VALUE, RESIZE_BAND } from './config'

export interface Holding {
  qty: number
  avgPrice: number
}

export interface BookState {
  cash: number
  holdings: Record<string, Holding>
}

export interface Order {
  symbol: string
  side: 'BUY' | 'SELL'
  qty: number
  price: number        // reference price used for planning (last traded)
  value: number
  reason: 'exit' | 'entry' | 'resize'
}

export interface RebalancePlan {
  totalValue: number
  orders: Order[]
  /** Holdings after the orders, at reference prices. */
  targetQty: Record<string, number>
  estimatedCosts: number
  cashAfter: number
  missingPrices: string[]
}

export function bookValue(state: BookState, prices: Record<string, number>): number {
  let value = state.cash
  for (const [symbol, h] of Object.entries(state.holdings)) {
    value += h.qty * (prices[symbol] ?? h.avgPrice)
  }
  return value
}

/**
 * Plan orders to move `state` towards `targets` (symbol -> weight of total value).
 * Weights may sum to less than 1; the rest stays in cash.
 *
 * - Holdings not in targets are sold in full.
 * - New names are bought in full.
 * - Existing names are resized only when off target by more than `band`.
 * - Orders below `minTradeValue` are skipped.
 */
export function planRebalance(params: {
  state: BookState
  targets: Record<string, number>
  prices: Record<string, number>
  band?: number
  minTradeValue?: number
  costs?: CostConfig
}): RebalancePlan {
  const { state, targets, prices } = params
  const band = params.band ?? RESIZE_BAND
  const minTradeValue = params.minTradeValue ?? MIN_TRADE_VALUE
  const costs = params.costs ?? DEFAULT_COSTS

  const missingPrices = [...new Set([...Object.keys(targets), ...Object.keys(state.holdings)])]
    .filter(s => !(prices[s] > 0))
  const totalValue = bookValue(state, prices)

  const orders: Order[] = []
  const targetQty: Record<string, number> = {}

  // Sells first, so their proceeds fund the buys
  for (const [symbol, h] of Object.entries(state.holdings)) {
    const price = prices[symbol]
    if (!(price > 0)) { targetQty[symbol] = h.qty; continue }
    const weight = targets[symbol] ?? 0

    if (weight === 0) {
      orders.push({ symbol, side: 'SELL', qty: h.qty, price, value: h.qty * price, reason: 'exit' })
      targetQty[symbol] = 0
      continue
    }

    const wantQty = Math.floor((weight * totalValue) / price)
    const drift = Math.abs(h.qty * price - weight * totalValue) / (weight * totalValue)
    if (drift > band && h.qty > wantQty && (h.qty - wantQty) * price >= minTradeValue) {
      orders.push({ symbol, side: 'SELL', qty: h.qty - wantQty, price, value: (h.qty - wantQty) * price, reason: 'resize' })
      targetQty[symbol] = wantQty
    } else {
      targetQty[symbol] = h.qty
    }
  }

  let cash = state.cash + orders.reduce((s, o) => s + o.value, 0)
  let estimatedCosts = orders.reduce(
    (s, o) => s + calculateTradeCosts(o.price, o.price, o.qty, costs).exitCosts + o.value * costs.slippagePercent,
    0
  )
  cash -= estimatedCosts

  // Buys, largest shortfall first
  const buys = Object.entries(targets)
    .filter(([symbol]) => prices[symbol] > 0)
    .map(([symbol, weight]) => {
      const price = prices[symbol]
      const held = state.holdings[symbol]?.qty ?? 0
      const wantQty = Math.floor((weight * totalValue) / price)
      const isNew = held === 0
      const drift = isNew ? 1 : Math.abs(held * price - weight * totalValue) / (weight * totalValue)
      return { symbol, price, held, wantQty, isNew, drift }
    })
    .filter(b => b.wantQty > b.held && (b.isNew || b.drift > band))
    .sort((a, b) => (b.wantQty - b.held) * b.price - (a.wantQty - a.held) * a.price)

  for (const b of buys) {
    const fillPrice = b.price * (1 + costs.slippagePercent)
    let qty = b.wantQty - b.held
    // Keep enough cash for charges on this order
    while (qty > 0) {
      const charge = calculateTradeCosts(b.price, b.price, qty, costs).entryCosts
      if (qty * fillPrice + charge <= cash) break
      qty--
    }
    if (qty <= 0 || qty * b.price < minTradeValue) {
      targetQty[b.symbol] = b.held
      continue
    }
    const charge = calculateTradeCosts(b.price, b.price, qty, costs).entryCosts
    orders.push({
      symbol: b.symbol, side: 'BUY', qty, price: b.price, value: qty * b.price,
      reason: b.isNew ? 'entry' : 'resize',
    })
    cash -= qty * fillPrice + charge
    estimatedCosts += charge + qty * b.price * costs.slippagePercent
    targetQty[b.symbol] = b.held + qty
  }

  // Top-up: whole-share rounding leaves cash idle (a Rs 9,600 share against a
  // Rs 15,000 target buys only one). Spend it on the most underweight targets,
  // one share at a time, never taking a position above 125% of its target.
  const TOP_UP_CAP = 1.25
  for (let guard = 0; guard < 1000; guard++) {
    const candidates = Object.entries(targets)
      .filter(([symbol]) => prices[symbol] > 0)
      .map(([symbol, weight]) => {
        const price = prices[symbol]
        const qty = targetQty[symbol] ?? state.holdings[symbol]?.qty ?? 0
        const targetValue = weight * totalValue
        return { symbol, price, qty, targetValue, shortfall: (targetValue - qty * price) / targetValue }
      })
      .filter(c => c.qty > 0 && (c.qty + 1) * c.price <= c.targetValue * TOP_UP_CAP)
      .filter(c => c.price * (1 + costs.slippagePercent) + calculateTradeCosts(c.price, c.price, 1, costs).entryCosts <= cash)
      .sort((x, y) => y.shortfall - x.shortfall)

    // Most underweight first; names already at target can still absorb
    // leftover cash up to the 125% cap
    const pick = candidates[0]
    if (!pick) break

    const charge = calculateTradeCosts(pick.price, pick.price, 1, costs).entryCosts
    cash -= pick.price * (1 + costs.slippagePercent) + charge
    estimatedCosts += charge + pick.price * costs.slippagePercent
    targetQty[pick.symbol] = pick.qty + 1

    const existing = orders.find(o => o.symbol === pick.symbol && o.side === 'BUY')
    if (existing) {
      existing.qty += 1
      existing.value = existing.qty * existing.price
    } else {
      orders.push({ symbol: pick.symbol, side: 'BUY', qty: 1, price: pick.price, value: pick.price, reason: 'resize' })
    }
  }

  return { totalValue, orders, targetQty, estimatedCosts, cashAfter: cash, missingPrices }
}

/**
 * Execute orders against a paper book. Fills at the given price plus slippage;
 * charges from the Indian delivery cost model. Returns the new state.
 */
export function applyOrders(
  state: BookState,
  orders: Order[],
  fillPrices: Record<string, number>,
  costs: CostConfig = DEFAULT_COSTS
): { state: BookState; fills: Array<Order & { fillPrice: number; charges: number }> } {
  const holdings: Record<string, Holding> = Object.fromEntries(
    Object.entries(state.holdings).map(([s, h]) => [s, { ...h }])
  )
  let cash = state.cash
  const fills: Array<Order & { fillPrice: number; charges: number }> = []

  const ordered = [...orders].sort((a, b) => (a.side === b.side ? 0 : a.side === 'SELL' ? -1 : 1))
  for (const o of ordered) {
    const ref = fillPrices[o.symbol] ?? o.price
    const fillPrice = applySlippage(ref, o.side, costs)
    const c = calculateTradeCosts(fillPrice, fillPrice, o.qty, costs)

    if (o.side === 'SELL') {
      const h = holdings[o.symbol]
      if (!h) continue
      const qty = Math.min(o.qty, h.qty)
      const charges = calculateTradeCosts(fillPrice, fillPrice, qty, costs).exitCosts
      cash += qty * fillPrice - charges
      h.qty -= qty
      if (h.qty === 0) delete holdings[o.symbol]
      fills.push({ ...o, qty, fillPrice, charges })
    } else {
      const charges = c.entryCosts
      const cost = o.qty * fillPrice + charges
      if (cost > cash) continue // cannot afford at the actual fill: skip rather than go negative
      cash -= cost
      const h = holdings[o.symbol] ?? { qty: 0, avgPrice: 0 }
      h.avgPrice = (h.avgPrice * h.qty + fillPrice * o.qty) / (h.qty + o.qty)
      h.qty += o.qty
      holdings[o.symbol] = h
      fills.push({ ...o, fillPrice, charges })
    }
  }

  return { state: { cash, holdings }, fills }
}
