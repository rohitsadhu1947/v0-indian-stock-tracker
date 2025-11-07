/**
 * Backtesting Engine for Indian Stock Tracker
 * 
 * Tests trading strategies on historical data to validate performance
 * before risking real money.
 */

export interface BacktestConfig {
  startDate: Date
  endDate: Date
  initialCapital: number
  maxPositions: number
  riskPercentPerTrade: number
  strategy: 'MASTER_SCORE' | 'MOMENTUM_ONLY' | 'BUY_HOLD' | 'RANDOM'
  minScore?: number // For MASTER_SCORE strategy
  symbols?: string[] // Specific symbols to test, or use Nifty 500
}

export interface Trade {
  symbol: string
  entryDate: Date
  entryPrice: number
  exitDate: Date
  exitPrice: number
  quantity: number
  stopLoss: number
  target: number
  exitReason: 'TARGET' | 'STOP_LOSS' | 'TIME_STOP' | 'END_OF_BACKTEST'
  pnl: number
  pnlPercent: number
  holdingDays: number
  score?: number // Master score at entry
}

export interface BacktestResult {
  config: BacktestConfig
  trades: Trade[]
  
  // Performance Metrics
  totalTrades: number
  winningTrades: number
  losingTrades: number
  winRate: number // Percentage
  
  // Returns
  totalReturn: number // Percentage
  avgReturn: number // Per trade
  bestTrade: Trade | null
  worstTrade: Trade | null
  
  // Risk Metrics
  maxDrawdown: number // Percentage
  maxDrawdownDate: Date | null
  sharpeRatio: number // Risk-adjusted return
  sortinoRatio: number // Downside risk-adjusted return
  calmarRatio: number // Return / max drawdown
  
  // Risk-Reward
  avgRiskReward: number // Average R:R per trade
  profitFactor: number // Gross profit / gross loss
  
  // Capital Metrics
  finalCapital: number
  peakCapital: number
  avgCapitalDeployed: number
  
  // Time Metrics
  avgHoldingDays: number
  totalDays: number
  
  // Equity Curve (for charting)
  equityCurve: Array<{
    date: Date
    capital: number
    drawdown: number
  }>
  
  // Comparison
  buyHoldReturn?: number // If comparing to buy-hold
  excessReturn?: number // Alpha over buy-hold
}

/**
 * Calculate Sharpe Ratio
 * (Avg Return - Risk Free Rate) / Standard Deviation of Returns
 */
export function calculateSharpeRatio(returns: number[], riskFreeRate: number = 0.06): number {
  if (returns.length === 0) return 0
  
  const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
  const stdDev = Math.sqrt(variance)
  
  if (stdDev === 0) return 0
  
  // Annualized Sharpe Ratio (assuming daily returns)
  const dailyRiskFreeRate = riskFreeRate / 252
  const sharpe = (avgReturn - dailyRiskFreeRate) / stdDev
  return sharpe * Math.sqrt(252) // Annualize
}

/**
 * Calculate Sortino Ratio
 * Only penalizes downside volatility
 */
export function calculateSortinoRatio(returns: number[], riskFreeRate: number = 0.06): number {
  if (returns.length === 0) return 0
  
  const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length
  const negativeReturns = returns.filter(r => r < 0)
  
  if (negativeReturns.length === 0) return Infinity
  
  const downsideVariance = negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / returns.length
  const downsideStdDev = Math.sqrt(downsideVariance)
  
  if (downsideStdDev === 0) return 0
  
  const dailyRiskFreeRate = riskFreeRate / 252
  const sortino = (avgReturn - dailyRiskFreeRate) / downsideStdDev
  return sortino * Math.sqrt(252) // Annualize
}

/**
 * Calculate Maximum Drawdown
 * Peak to trough decline
 */
export function calculateMaxDrawdown(equityCurve: Array<{ capital: number }>): {
  maxDrawdown: number
  maxDrawdownIndex: number
} {
  // Handle empty equity curve
  if (!equityCurve || equityCurve.length === 0) {
    return { maxDrawdown: 0, maxDrawdownIndex: -1 }
  }
  
  let peak = equityCurve[0].capital
  let maxDrawdown = 0
  let maxDrawdownIndex = 0
  
  equityCurve.forEach((point, i) => {
    if (point.capital > peak) {
      peak = point.capital
    }
    
    const drawdown = peak > 0 ? (peak - point.capital) / peak : 0
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown
      maxDrawdownIndex = i
    }
  })
  
  return { maxDrawdown, maxDrawdownIndex }
}

/**
 * Simulate Buy-and-Hold strategy for comparison
 */
export async function simulateBuyHold(
  symbols: string[],
  startDate: Date,
  endDate: Date,
  initialCapital: number
): Promise<number> {
  // Allocate capital equally across symbols
  const capitalPerSymbol = initialCapital / symbols.length
  let totalValue = initialCapital
  
  // In real implementation, fetch historical prices
  // For now, return a placeholder
  
  // TODO: Implement actual buy-hold simulation
  return totalValue
}

/**
 * Main backtesting function
 */
export async function runBacktest(config: BacktestConfig): Promise<BacktestResult> {
  const trades: Trade[] = []
  const equityCurve: BacktestResult['equityCurve'] = []
  
  let currentCapital = config.initialCapital
  let peakCapital = config.initialCapital
  const openPositions: Map<string, Trade> = new Map()
  
  // TODO: Implement actual backtesting logic
  // This is a placeholder structure
  
  const result: BacktestResult = {
    config,
    trades,
    totalTrades: trades.length,
    winningTrades: trades.filter(t => t.pnl > 0).length,
    losingTrades: trades.filter(t => t.pnl < 0).length,
    winRate: trades.length > 0 ? (trades.filter(t => t.pnl > 0).length / trades.length) * 100 : 0,
    totalReturn: ((currentCapital - config.initialCapital) / config.initialCapital) * 100,
    avgReturn: trades.length > 0 ? trades.reduce((sum, t) => sum + t.pnlPercent, 0) / trades.length : 0,
    bestTrade: trades.length > 0 ? trades.reduce((best, t) => t.pnl > best.pnl ? t : best) : null,
    worstTrade: trades.length > 0 ? trades.reduce((worst, t) => t.pnl < worst.pnl ? t : worst) : null,
    maxDrawdown: 0,
    maxDrawdownDate: null,
    sharpeRatio: 0,
    sortinoRatio: 0,
    calmarRatio: 0,
    avgRiskReward: 0,
    profitFactor: 0,
    finalCapital: currentCapital,
    peakCapital,
    avgCapitalDeployed: 0,
    avgHoldingDays: 0,
    totalDays: Math.floor((config.endDate.getTime() - config.startDate.getTime()) / (1000 * 60 * 60 * 24)),
    equityCurve
  }
  
  return result
}

/**
 * Compare multiple strategies
 */
export async function compareStrategies(
  configs: BacktestConfig[]
): Promise<{
  results: BacktestResult[]
  winner: BacktestConfig
  comparison: Array<{
    strategy: string
    return: number
    sharpe: number
    maxDrawdown: number
    winRate: number
  }>
}> {
  const results = await Promise.all(configs.map(config => runBacktest(config)))
  
  // Determine winner by Sharpe ratio
  const winner = configs[results.reduce((bestIdx, result, idx) => 
    result.sharpeRatio > results[bestIdx].sharpeRatio ? idx : bestIdx
  , 0)]
  
  const comparison = results.map((result, idx) => ({
    strategy: configs[idx].strategy,
    return: result.totalReturn,
    sharpe: result.sharpeRatio,
    maxDrawdown: result.maxDrawdown,
    winRate: result.winRate
  }))
  
  return { results, winner, comparison }
}

