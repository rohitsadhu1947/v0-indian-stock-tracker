/**
 * Indian equity trading costs (NSE delivery, Zerodha-style).
 *
 * The old backtester modelled zero costs, which on a 1.5% target is the
 * difference between a profitable-looking system and a losing one.
 *
 * Rates as of 2025-26 (delivery / CNC equity):
 *   brokerage      ₹0 (Zerodha delivery); set brokeragePerOrder for others
 *   STT            0.1% on buy AND sell turnover
 *   exchange txn   0.00297% (NSE) both sides
 *   SEBI           ₹10 per crore = 0.0001% both sides
 *   stamp duty     0.015% on buy only
 *   GST            18% on (brokerage + exchange txn + SEBI)
 *   DP charge      ₹15.34 per scrip per sell day (CDSL + broker)
 *
 * Slippage is modelled separately because it is an execution assumption,
 * not a statutory charge.
 */

export interface CostConfig {
  brokeragePerOrder: number
  sttPercent: number
  exchangeTxnPercent: number
  sebiPercent: number
  stampDutyPercent: number
  gstPercent: number
  dpChargePerSell: number
  /** One-way slippage as a fraction of price (0.001 = 0.1%). Applied on entry and exit. */
  slippagePercent: number
}

export const DEFAULT_COSTS: CostConfig = {
  brokeragePerOrder: 0,       // Zerodha delivery
  sttPercent: 0.001,          // 0.1%
  exchangeTxnPercent: 0.0000297,
  sebiPercent: 0.000001,
  stampDutyPercent: 0.00015,  // buy side only
  gstPercent: 0.18,
  dpChargePerSell: 15.34,
  slippagePercent: 0.001,     // 0.1% each way for liquid large/mid caps
}

export interface TradeCosts {
  entryCosts: number
  exitCosts: number
  totalCosts: number
  /** Costs as a % of the capital deployed in the trade. */
  costPercent: number
}

/** Statutory + broker charges for one round trip (buy then sell). */
export function calculateTradeCosts(
  entryPrice: number,
  exitPrice: number,
  quantity: number,
  config: CostConfig = DEFAULT_COSTS
): TradeCosts {
  const buyValue = entryPrice * quantity
  const sellValue = exitPrice * quantity

  const buyTxn = buyValue * config.exchangeTxnPercent
  const buySebi = buyValue * config.sebiPercent
  const entryCosts =
    config.brokeragePerOrder +
    buyValue * config.sttPercent +
    buyTxn +
    buySebi +
    buyValue * config.stampDutyPercent +
    (config.brokeragePerOrder + buyTxn + buySebi) * config.gstPercent

  const sellTxn = sellValue * config.exchangeTxnPercent
  const sellSebi = sellValue * config.sebiPercent
  const exitCosts =
    config.brokeragePerOrder +
    sellValue * config.sttPercent +
    sellTxn +
    sellSebi +
    config.dpChargePerSell +
    (config.brokeragePerOrder + sellTxn + sellSebi) * config.gstPercent

  const totalCosts = entryCosts + exitCosts

  return {
    entryCosts,
    exitCosts,
    totalCosts,
    costPercent: buyValue > 0 ? (totalCosts / buyValue) * 100 : 0,
  }
}

/** Fill price after slippage: buys fill higher, sells fill lower. */
export function applySlippage(
  price: number,
  side: 'BUY' | 'SELL',
  config: CostConfig = DEFAULT_COSTS
): number {
  const factor = side === 'BUY' ? 1 + config.slippagePercent : 1 - config.slippagePercent
  return price * factor
}

/**
 * Round-trip cost as a % of position value — the hurdle every trade must clear
 * before it makes money. Useful for sanity-checking a target size.
 */
export function roundTripCostPercent(price: number, quantity: number, config: CostConfig = DEFAULT_COSTS): number {
  const charges = calculateTradeCosts(price, price, quantity, config).costPercent
  return charges + config.slippagePercent * 100 * 2
}
