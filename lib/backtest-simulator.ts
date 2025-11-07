/**
 * Backtest Simulator
 * Replays trading strategy on historical data
 */

import type { BacktestConfig, Trade, BacktestResult } from './backtesting-engine'
import { calculateSharpeRatio, calculateSortinoRatio, calculateMaxDrawdown } from './backtesting-engine'
import { fetchBatchHistoricalData, calculateIndicators, hasBuySignal, type HistoricalCandle } from './backtest-data-fetcher'

interface Position {
  symbol: string
  entryDate: Date
  entryPrice: number
  quantity: number
  stopLoss: number
  target: number
  score: number
}

/**
 * Simulate Master Score strategy on historical data
 */
export async function simulateMasterScoreStrategy(
  config: BacktestConfig,
  accessToken: string
): Promise<BacktestResult> {
  console.log('🎯 Starting backtest simulation...')
  console.log(`Period: ${config.startDate.toDateString()} to ${config.endDate.toDateString()}`)
  console.log(`Initial Capital: ₹${config.initialCapital.toLocaleString()}`)
  
  const trades: Trade[] = []
  const equityCurve: BacktestResult['equityCurve'] = []
  
  let currentCapital = config.initialCapital
  let peakCapital = config.initialCapital
  const openPositions: Map<string, Position> = new Map()
  
  // Determine symbols to test
  const symbols = config.symbols || getDefaultSymbols() // Top 50 Nifty stocks
  
  // Fetch historical data for all symbols
  console.log(`📊 Fetching historical data for ${symbols.length} symbols...`)
  const historicalData = await fetchBatchHistoricalData(
    symbols.map(symbol => ({ symbol, exchange: 'NSE' })),
    {
      from: config.startDate,
      to: config.endDate,
      interval: 'day' // Daily candles for backtesting
    },
    accessToken
  )
  
  console.log(`✅ Fetched data for ${historicalData.size} symbols`)
  
  // Debug: Show which symbols have data
  if (historicalData.size === 0) {
    console.error('❌ No historical data fetched! Check:')
    console.error('  1. Are you logged in to Kite?')
    console.error('  2. Is your access token valid?')
    console.error('  3. Are the dates correct?')
    console.error(`  Dates: ${config.startDate.toISOString()} to ${config.endDate.toISOString()}`)
  } else {
    console.log('📈 Data fetched for symbols:')
    historicalData.forEach((candles, symbol) => {
      console.log(`  ${symbol}: ${candles.length} candles`)
    })
  }
  
  // Get all unique dates across all symbols
  const allDates = new Set<string>()
  historicalData.forEach(candles => {
    candles.forEach(candle => {
      allDates.add(candle.date.toISOString().split('T')[0])
    })
  })
  
  const sortedDates = Array.from(allDates).sort()
  console.log(`📅 Simulating ${sortedDates.length} trading days...`)
  
  if (sortedDates.length === 0) {
    console.error('❌ No trading days found! Returning empty result.')
    return {
      trades: [],
      equityCurve: [],
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalReturn: 0,
      finalCapital: config.initialCapital,
      peakCapital: config.initialCapital,
      maxDrawdown: 0,
      maxDrawdownDate: null,
      sharpeRatio: 0,
      sortinoRatio: 0,
      profitFactor: 0,
      avgRiskReward: 0,
      startDate: config.startDate,
      endDate: config.endDate
    }
  }
  
  // Simulate day by day
  for (const dateStr of sortedDates) {
    const currentDate = new Date(dateStr)
    
    // Check for exits first (stop-loss or target)
    for (const [symbol, position] of openPositions.entries()) {
      const candles = historicalData.get(symbol)
      if (!candles) continue
      
      const todayCandle = candles.find(c => 
        c.date.toISOString().split('T')[0] === dateStr
      )
      
      if (!todayCandle) continue
      
      let exitPrice: number | null = null
      let exitReason: Trade['exitReason'] | null = null
      
      // Check stop-loss
      if (todayCandle.low <= position.stopLoss) {
        exitPrice = position.stopLoss
        exitReason = 'STOP_LOSS'
      }
      // Check target
      else if (todayCandle.high >= position.target) {
        exitPrice = position.target
        exitReason = 'TARGET'
      }
      
      if (exitPrice && exitReason) {
        // Close position
        const pnl = (exitPrice - position.entryPrice) * position.quantity
        const pnlPercent = ((exitPrice - position.entryPrice) / position.entryPrice) * 100
        
        currentCapital += position.quantity * exitPrice
        
        const trade: Trade = {
          symbol: position.symbol,
          entryDate: position.entryDate,
          entryPrice: position.entryPrice,
          exitDate: currentDate,
          exitPrice,
          quantity: position.quantity,
          stopLoss: position.stopLoss,
          target: position.target,
          exitReason,
          pnl,
          pnlPercent,
          holdingDays: Math.floor((currentDate.getTime() - position.entryDate.getTime()) / (1000 * 60 * 60 * 24)),
          score: position.score
        }
        
        trades.push(trade)
        openPositions.delete(symbol)
        
        console.log(`${exitReason === 'TARGET' ? '✅' : '❌'} ${symbol}: ${exitReason} @ ₹${exitPrice.toFixed(2)} | P&L: ₹${pnl.toFixed(2)} (${pnlPercent > 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)`)
      }
    }
    
    // Look for new entry signals
    if (openPositions.size < config.maxPositions) {
      for (const symbol of symbols) {
        if (openPositions.has(symbol)) continue
        
        const candles = historicalData.get(symbol)
        if (!candles || candles.length < 30) continue
        
        const todayIndex = candles.findIndex(c => 
          c.date.toISOString().split('T')[0] === dateStr
        )
        
        if (todayIndex < 20) continue
        
        const indicators = calculateIndicators(candles.slice(0, todayIndex + 1))
        const signal = hasBuySignal(candles, todayIndex, indicators)
        
        if (signal.signal && signal.score >= (config.minScore || 60)) {
          // Calculate position size
          const entryPrice = candles[todayIndex].close
          const stopLoss = entryPrice * 0.975 // 2.5% stop-loss
          const target = entryPrice * 1.05 // 5% target
          
          const riskPerShare = entryPrice - stopLoss
          const maxRiskAmount = currentCapital * (config.riskPercentPerTrade / 100)
          const quantity = Math.floor(maxRiskAmount / riskPerShare)
          const capitalRequired = quantity * entryPrice
          
          if (capitalRequired <= currentCapital && quantity > 0) {
            // Open position
            currentCapital -= capitalRequired
            
            openPositions.set(symbol, {
              symbol,
              entryDate: currentDate,
              entryPrice,
              quantity,
              stopLoss,
              target,
              score: signal.score
            })
            
            console.log(`🔵 BUY ${symbol} @ ₹${entryPrice.toFixed(2)} | Qty: ${quantity} | Score: ${signal.score}`)
          }
        }
      }
    }
    
    // Update equity curve
    const portfolioValue = currentCapital + Array.from(openPositions.values()).reduce((sum, pos) => {
      const candles = historicalData.get(pos.symbol)
      if (!candles) return sum
      
      const todayCandle = candles.find(c => 
        c.date.toISOString().split('T')[0] === dateStr
      )
      
      return sum + (todayCandle ? todayCandle.close * pos.quantity : pos.entryPrice * pos.quantity)
    }, 0)
    
    if (portfolioValue > peakCapital) {
      peakCapital = portfolioValue
    }
    
    equityCurve.push({
      date: currentDate,
      capital: portfolioValue,
      drawdown: ((peakCapital - portfolioValue) / peakCapital) * 100
    })
  }
  
  // Close any remaining open positions at end date
  for (const [symbol, position] of openPositions.entries()) {
    const candles = historicalData.get(symbol)
    if (!candles || candles.length === 0) continue
    
    const lastCandle = candles[candles.length - 1]
    const exitPrice = lastCandle.close
    const pnl = (exitPrice - position.entryPrice) * position.quantity
    const pnlPercent = ((exitPrice - position.entryPrice) / position.entryPrice) * 100
    
    currentCapital += position.quantity * exitPrice
    
    trades.push({
      symbol: position.symbol,
      entryDate: position.entryDate,
      entryPrice: position.entryPrice,
      exitDate: config.endDate,
      exitPrice,
      quantity: position.quantity,
      stopLoss: position.stopLoss,
      target: position.target,
      exitReason: 'END_OF_BACKTEST',
      pnl,
      pnlPercent,
      holdingDays: Math.floor((config.endDate.getTime() - position.entryDate.getTime()) / (1000 * 60 * 60 * 24)),
      score: position.score
    })
  }
  
  console.log(`✅ Backtest complete: ${trades.length} trades executed`)
  
  // Calculate performance metrics
  const winningTrades = trades.filter(t => t.pnl > 0)
  const losingTrades = trades.filter(t => t.pnl < 0)
  const returns = trades.map(t => t.pnlPercent / 100)
  
  const { maxDrawdown, maxDrawdownIndex } = calculateMaxDrawdown(equityCurve)
  
  const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0)
  const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0))
  
  const result: BacktestResult = {
    config,
    trades,
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate: trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0,
    totalReturn: ((currentCapital - config.initialCapital) / config.initialCapital) * 100,
    avgReturn: trades.length > 0 ? trades.reduce((sum, t) => sum + t.pnlPercent, 0) / trades.length : 0,
    bestTrade: trades.length > 0 ? trades.reduce((best, t) => t.pnl > best.pnl ? t : best, trades[0]) : null,
    worstTrade: trades.length > 0 ? trades.reduce((worst, t) => t.pnl < worst.pnl ? t : worst, trades[0]) : null,
    maxDrawdown: maxDrawdown * 100,
    maxDrawdownDate: maxDrawdownIndex >= 0 ? equityCurve[maxDrawdownIndex].date : null,
    sharpeRatio: calculateSharpeRatio(returns),
    sortinoRatio: calculateSortinoRatio(returns),
    calmarRatio: maxDrawdown > 0 ? ((currentCapital - config.initialCapital) / config.initialCapital) / maxDrawdown : 0,
    avgRiskReward: trades.length > 0 ? trades.reduce((sum, t) => {
      const risk = t.entryPrice - t.stopLoss
      const reward = t.exitPrice - t.entryPrice
      return sum + (risk > 0 ? reward / risk : 0)
    }, 0) / trades.length : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    finalCapital: currentCapital,
    peakCapital,
    avgCapitalDeployed: trades.length > 0 ? trades.reduce((sum, t) => sum + (t.entryPrice * t.quantity), 0) / trades.length : 0,
    avgHoldingDays: trades.length > 0 ? trades.reduce((sum, t) => sum + t.holdingDays, 0) / trades.length : 0,
    totalDays: Math.floor((config.endDate.getTime() - config.startDate.getTime()) / (1000 * 60 * 60 * 24)),
    equityCurve
  }
  
  return result
}

/**
 * Get default symbols (Top 50 Nifty stocks)
 */
function getDefaultSymbols(): string[] {
  return [
    'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
    'HINDUNILVR', 'ITC', 'SBIN', 'BHARTIARTL', 'KOTAKBANK',
    'LT', 'AXISBANK', 'ASIANPAINT', 'MARUTI', 'TITAN',
    'SUNPHARMA', 'ULTRACEMCO', 'BAJFINANCE', 'NESTLEIND', 'WIPRO',
    'HCLTECH', 'ONGC', 'NTPC', 'POWERGRID', 'TATAMOTORS',
    'BAJAJFINSV', 'M&M', 'TECHM', 'ADANIENT', 'TATASTEEL',
    'INDUSINDBK', 'DRREDDY', 'COALINDIA', 'GRASIM', 'JSWSTEEL',
    'EICHERMOT', 'BRITANNIA', 'HINDALCO', 'ADANIPORTS', 'CIPLA',
    'DIVISLAB', 'SBILIFE', 'BPCL', 'APOLLOHOSP', 'TATACONSUM',
    'HEROMOTOCO', 'UPL', 'BAJAJ-AUTO', 'SHREECEM', 'HDFCLIFE'
  ]
}

