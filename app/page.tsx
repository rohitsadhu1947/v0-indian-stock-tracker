"use client"

import React, { useState, useEffect } from 'react'
import { formatSymbolForKite, generateTradingSignal } from '@/lib/kite-utils'
import { 
  calculateVWAP, 
  generateIntradaySignal, 
  checkExitSignal, 
  calculatePnL,
  detectGap,
  isMarketHours,
  type Position,
  type IntradaySignal,
  type IntradayCandle
} from '@/lib/intraday-utils'

interface StockData {
  symbol: string
  name: string
  instrumentToken: number
  current: number
  change: number
  changePercent: number
  volume: number
  dayHigh: number
  dayLow: number
  open: number
  prices: number[]
  volumes: number[]
  timestamp: string
}

interface AuthStatus {
  authenticated: boolean
  user: { userId: string } | null
}

export default function StockTracker() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ authenticated: false, user: null })
  const [watchlist, setWatchlist] = useState<string[]>(['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK'])
  const [stockData, setStockData] = useState<Record<string, StockData>>({})
  const [activeTab, setActiveTab] = useState<'watchlist' | 'screener' | 'signals' | 'intraday'>('watchlist')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stockInput, setStockInput] = useState('')
  const [exchange, setExchange] = useState('NSE')
  const [screenerResults, setScreenerResults] = useState<any[]>([])
  const [activeSignals, setActiveSignals] = useState<any[]>([])
  const [customScreenerStocks, setCustomScreenerStocks] = useState<string[]>([])
  const [screenerInput, setScreenerInput] = useState('')
  const [screenerGroups, setScreenerGroups] = useState<Record<string, string[]>>({
    'Popular Large Caps': ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'WIPRO', 'ITC', 'HINDUNILVR', 'BHARTIARTL', 'ASIANPAINT', 'MARUTI', 'TITAN', 'BAJFINANCE', 'TATASTEEL', 'SUNPHARMA'],
    'Custom': []
  })
  const [activeScreenerGroup, setActiveScreenerGroup] = useState('Popular Large Caps')
  
  // Intraday trading states
  const [intradayPositions, setIntradayPositions] = useState<Position[]>([])
  const [intradaySignals, setIntradaySignals] = useState<IntradaySignal[]>([])
  const [marketStatus, setMarketStatus] = useState(isMarketHours())
  const [totalPnL, setTotalPnL] = useState(0)
  const [intradayWatchlist, setIntradayWatchlist] = useState<string[]>(['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK'])
  const [autoRefreshIntraday, setAutoRefreshIntraday] = useState(false)
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(60) // seconds
  const [isDemoData, setIsDemoData] = useState(false)
  const [intradayStockInput, setIntradayStockInput] = useState('')
  const [exitSignals, setExitSignals] = useState<Record<string, any>>({})
  const [screenerLevel, setScreenerLevel] = useState<'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE'>('MODERATE')
  
  // Opening Range Breakout (ORB) states
  const [orbRanges, setOrbRanges] = useState<Record<string, { high: number; low: number; open: number; rangeCaptured: boolean; timestamp: Date }>>({})
  const [orbSignals, setOrbSignals] = useState<any[]>([])
  const [isCapturingORB, setIsCapturingORB] = useState(false)
  const [orbWatchlist, setOrbWatchlist] = useState<string[]>(['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK'])
  
  // Trade Watch (Smart Monitor Bucket) states
  const [tradeWatch, setTradeWatch] = useState<any[]>([])
  const [entryAlerts, setEntryAlerts] = useState<any[]>([])
  const [isMonitoringWatch, setIsMonitoringWatch] = useState(false)
  const [watchMonitorInterval, setWatchMonitorInterval] = useState(120) // 2 minutes default
  
  // Manual position entry
  const [manualEntrySymbol, setManualEntrySymbol] = useState('')
  const [manualEntryPrice, setManualEntryPrice] = useState('')
  const [manualEntryQuantity, setManualEntryQuantity] = useState('')
  const [manualEntryType, setManualEntryType] = useState<'BUY' | 'SELL'>('BUY')

  // Load custom screener settings from localStorage
  useEffect(() => {
    const savedGroups = localStorage.getItem('screenerGroups')
    const savedActiveGroup = localStorage.getItem('activeScreenerGroup')
    const savedIntradayWatchlist = localStorage.getItem('intradayWatchlist')

    if (savedGroups) {
      setScreenerGroups(JSON.parse(savedGroups))
    }
    if (savedActiveGroup) {
      setActiveScreenerGroup(savedActiveGroup)
    }
    if (savedIntradayWatchlist) {
      setIntradayWatchlist(JSON.parse(savedIntradayWatchlist))
    }
  }, [])

  // Save screener settings to localStorage
  useEffect(() => {
    localStorage.setItem('screenerGroups', JSON.stringify(screenerGroups))
    localStorage.setItem('activeScreenerGroup', activeScreenerGroup)
  }, [screenerGroups, activeScreenerGroup])

  // Save intraday watchlist to localStorage
  useEffect(() => {
    localStorage.setItem('intradayWatchlist', JSON.stringify(intradayWatchlist))
  }, [intradayWatchlist])

  // Auto-refresh positions at intervals
  useEffect(() => {
    if (!autoRefreshIntraday || intradayPositions.length === 0 || !authStatus.authenticated) {
      return
    }

    console.log(`✅ Position auto-refresh ENABLED - Interval: ${autoRefreshInterval}s`)

    const intervalId = setInterval(() => {
      console.log(`🔄 Auto-refreshing positions (${new Date().toLocaleTimeString()})...`)
      monitorPositions()
    }, autoRefreshInterval * 1000)

    // Run immediately on enable
    monitorPositions()

    return () => {
      console.log(`❌ Position auto-refresh STOPPED`)
      clearInterval(intervalId)
    }
  }, [autoRefreshIntraday, autoRefreshInterval, intradayPositions.length, authStatus.authenticated])

  // Auto-monitor Trade Watch for entry signals
  useEffect(() => {
    if (!isMonitoringWatch || tradeWatch.length === 0 || !authStatus.authenticated) {
      return
    }

    const intervalId = setInterval(() => {
      console.log(`👁️ Monitoring Trade Watch for entry signals (${new Date().toLocaleTimeString()})...`)
      monitorTradeWatch()
    }, watchMonitorInterval * 1000)

    // Run immediately on enable
    monitorTradeWatch()

    return () => clearInterval(intervalId)
  }, [isMonitoringWatch, watchMonitorInterval, tradeWatch.length, authStatus.authenticated])

  // Request notification permissions on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Check authentication status on mount
  useEffect(() => {
    checkAuthStatus()
    
    // Check for auth callback
    const params = new URLSearchParams(window.location.search)
    if (params.get('authenticated') === 'true') {
      setError(null)
      setTimeout(() => {
        window.history.replaceState({}, '', '/')
        checkAuthStatus()
      }, 500)
    } else if (params.get('error')) {
      setError(`Authentication failed: ${params.get('error')}`)
      window.history.replaceState({}, '', '/')
    }
  }, [])

  // Load watchlist when authenticated
  useEffect(() => {
    if (authStatus.authenticated && watchlist.length > 0) {
      updateWatchlist()
    }
  }, [authStatus.authenticated])

  async function checkAuthStatus() {
    try {
      const res = await fetch('/api/auth/kite/session')
      const data = await res.json()
      setAuthStatus(data)
    } catch (err) {
      console.error('Error checking auth status:', err)
    }
  }

  async function handleLogin() {
    window.location.href = '/api/auth/kite/login'
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/kite/logout', { method: 'POST' })
      setAuthStatus({ authenticated: false, user: null })
      setStockData({})
      setError(null)
    } catch (err) {
      console.error('Error logging out:', err)
    }
  }

  async function fetchStockQuote(symbol: string): Promise<StockData | null> {
    try {
      const kiteSymbol = formatSymbolForKite(symbol, exchange)
      const res = await fetch(`/api/kite/quote?symbols=${encodeURIComponent(kiteSymbol)}`)
      
      if (!res.ok) {
        const errorData = await res.json()
        if (errorData.code === 'TOKEN_EXPIRED') {
          setError('Session expired. Please login again.')
          setAuthStatus({ authenticated: false, user: null })
        }
        throw new Error(errorData.error || 'Failed to fetch quote')
      }

      const { data } = await res.json()
      const quote = data[kiteSymbol]

      if (!quote) {
        throw new Error('No data received for ' + symbol)
      }

      // Fetch historical data for technical analysis
      const historicalRes = await fetch(
        `/api/kite/historical?instrument_token=${quote.instrument_token}&interval=day`
      )
      
      let prices: number[] = []
      let volumes: number[] = []
      
      if (historicalRes.ok) {
        const histData = await historicalRes.json()
        prices = histData.data.map((d: any) => d.close).reverse()
        volumes = histData.data.map((d: any) => d.volume).reverse()
            }
            
            return {
        symbol: symbol,
        name: quote.tradingsymbol || symbol,
        instrumentToken: quote.instrument_token,
        current: quote.last_price,
        change: quote.last_price - quote.ohlc.close,
        changePercent: ((quote.last_price - quote.ohlc.close) / quote.ohlc.close) * 100,
        volume: quote.volume,
        dayHigh: quote.ohlc.high,
        dayLow: quote.ohlc.low,
        open: quote.ohlc.open,
        prices: prices,
        volumes: volumes,
        timestamp: new Date().toLocaleTimeString()
      }
    } catch (err: any) {
      console.error(`Error fetching ${symbol}:`, err)
      return null
    }
          }

          async function updateWatchlist() {
    if (isLoading || !authStatus.authenticated) return
    
    setIsLoading(true)
    setError(null)
    
    const newStockData: Record<string, StockData> = {}
    const newActiveSignals: any[] = []
            
            for (const symbol of watchlist) {
      const data = await fetchStockQuote(symbol)
              
              if (data) {
        newStockData[symbol] = data
        
        // Generate trading signal
        const analysis = generateTradingSignal(data.current, data.prices, data.volumes)
                
                if (analysis.signal.includes('STRONG')) {
          newActiveSignals.push({
                    symbol: symbol,
                    signal: analysis.signal,
                    price: data.current,
                    reason: analysis.reason,
                    time: new Date().toLocaleString()
          })
        }
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    setStockData(newStockData)
    setActiveSignals(prev => [...prev, ...newActiveSignals].slice(-15))
    setIsLoading(false)
          }

          function addStock() {
    const symbol = stockInput.trim().toUpperCase()
            
            if (!symbol) {
      alert('Please enter a stock symbol')
      return
            }
            
            if (watchlist.includes(symbol)) {
      alert('Stock already in watchlist')
      return
    }
    
    setWatchlist([...watchlist, symbol])
    setStockInput('')
    
    // Fetch data for new stock
    if (authStatus.authenticated) {
      fetchStockQuote(symbol).then(data => {
        if (data) {
          setStockData(prev => ({ ...prev, [symbol]: data }))
        }
      })
    }
  }

  function removeFromWatchlist(symbol: string) {
    setWatchlist(watchlist.filter(s => s !== symbol))
    const newData = { ...stockData }
    delete newData[symbol]
    setStockData(newData)
          }

          async function runScreener() {
    if (!authStatus.authenticated) {
      alert('Please login first')
      return
    }

    const stocksToScreen = screenerGroups[activeScreenerGroup]
    
    if (!stocksToScreen || stocksToScreen.length === 0) {
      alert('Please add stocks to screen first')
      return
    }

    setIsLoading(true)
    setActiveTab('screener')
            
    const results: any[] = []
            
            for (const symbol of stocksToScreen) {
      const data = await fetchStockQuote(symbol)
              if (data) {
        const analysis = generateTradingSignal(data.current, data.prices, data.volumes)
                results.push({
                  symbol: symbol,
                  price: data.current,
                  change: data.changePercent,
                  signal: analysis.signal,
                  strength: analysis.strength,
                  reason: analysis.reason
        })
      }
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    results.sort((a, b) => b.strength - a.strength)
    setScreenerResults(results)
    setIsLoading(false)
  }

  function addToWatchlist(symbol: string) {
    if (!watchlist.includes(symbol)) {
      setWatchlist([...watchlist, symbol])
      alert(`${symbol} added to watchlist. Click Refresh to load data.`)
    } else {
      alert('Already in watchlist')
    }
  }

  function addToScreener() {
    const symbol = screenerInput.trim().toUpperCase()
    
    if (!symbol) {
      alert('Please enter a stock symbol')
      return
    }
    
    const currentStocks = screenerGroups[activeScreenerGroup] || []
    
    if (currentStocks.includes(symbol)) {
      alert('Stock already in screener group')
      return
    }
    
    setScreenerGroups({
      ...screenerGroups,
      [activeScreenerGroup]: [...currentStocks, symbol]
    })
    
    setScreenerInput('')
    alert(`${symbol} added to ${activeScreenerGroup} screener`)
  }

  function removeFromScreener(symbol: string) {
    const currentStocks = screenerGroups[activeScreenerGroup] || []
    
    setScreenerGroups({
      ...screenerGroups,
      [activeScreenerGroup]: currentStocks.filter(s => s !== symbol)
    })
  }

  function createNewScreenerGroup() {
    const groupName = prompt('Enter name for new screener group:')
    
    if (!groupName || !groupName.trim()) {
      return
    }
    
    const trimmedName = groupName.trim()
    
    if (screenerGroups[trimmedName]) {
      alert('A group with this name already exists')
      return
    }
    
    setScreenerGroups({
      ...screenerGroups,
      [trimmedName]: []
    })
    
    setActiveScreenerGroup(trimmedName)
    alert(`Created new screener group: ${trimmedName}`)
  }

  function deleteScreenerGroup() {
    if (activeScreenerGroup === 'Popular Large Caps') {
      alert('Cannot delete the default group')
      return
    }
    
    if (!confirm(`Delete screener group "${activeScreenerGroup}"?`)) {
      return
    }
    
    const newGroups = { ...screenerGroups }
    delete newGroups[activeScreenerGroup]
    
    setScreenerGroups(newGroups)
    setActiveScreenerGroup('Popular Large Caps')
  }

  // Intraday Functions
  async function runMorningScreener() {
    if (!authStatus.authenticated) {
      alert('⚠️ Please login first!\n\nClick "Login with Kite Connect" at the top to authenticate.')
      return
    }

    // Check if market is closed
    const today = new Date().getDay()
    if (today === 0 || today === 6) {
      alert('⚠️ Market is closed on weekends!\n\nThe Morning Screener only works on trading days (Monday-Friday).\n\nPlease try again on a trading day between 9:00 AM - 3:30 PM.')
      return
    }

    setIsLoading(true)
    setIsDemoData(false)
    const signals: IntradaySignal[] = []
    let processedCount = 0
    let authError = false

    for (const symbol of intradayWatchlist) {
      try {
        // Fetch current quote
        const data = await fetchStockQuote(symbol)
        if (!data) {
          // Check if it's an auth error
          if (!authStatus.authenticated) {
            authError = true
            break
          }
          continue
        }

        // Fetch intraday 5-minute candles
        const intradayRes = await fetch(
          `/api/kite/intraday?instrument_token=${data.instrumentToken}&interval=5minute`
        )

        if (!intradayRes.ok) continue

        const intradayData = await intradayRes.json()
        const candles: IntradayCandle[] = intradayData.data.map((d: any) => ({
          timestamp: new Date(d.date),
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          volume: d.volume
        }))

        if (candles.length === 0) continue

        // Check for gap
        const yesterdayClose = data.prices[1] || data.current
        const todayOpen = candles[0].open
        const gap = detectGap(yesterdayClose, todayOpen)

        // Calculate RSI from daily data
        const rsi = data.prices.length >= 14 
          ? parseFloat(generateTradingSignal(data.current, data.prices, data.volumes).indicators.rsi)
          : 50

        // Generate intraday signal with selected screener level
        const marketOpen = new Date()
        marketOpen.setHours(9, 15, 0, 0)
        
        const signal = generateIntradaySignal(
          symbol,
          candles,
          data.current,
          rsi,
          marketOpen,
          screenerLevel
        )

        if (signal) {
          signals.push({
            ...signal,
            reasons: [
              ...signal.reasons,
              gap.hasGap ? `${gap.gapType.replace('_', ' ')}: ${gap.gapPercent > 0 ? '+' : ''}${gap.gapPercent.toFixed(2)}%` : ''
            ].filter(Boolean)
          })
        }

        await new Promise(resolve => setTimeout(resolve, 500))
      } catch (err) {
        console.error(`Error screening ${symbol}:`, err)
      }
    }

    // Sort by signal strength
    signals.sort((a, b) => b.strength - a.strength)
    setIntradaySignals(signals)
    setIsLoading(false)
    
    // Show auth error if detected
    if (authError) {
      alert('❌ Session expired!\n\nYour Kite Connect session has expired. Please login again to continue.')
      setAuthStatus({ authenticated: false, user: null })
    } else if (signals.length === 0) {
      alert(`ℹ️ No signals found\n\nScreened ${intradayWatchlist.length} stocks with ${screenerLevel} criteria.\n\nTry:\n• Different risk level (AGGRESSIVE for early morning)\n• Wait for more market data (best after 10 AM)\n• Add more stocks to intraday watchlist`)
    }
  }

  function addToIntradayWatchlist(symbol: string) {
    const upperSymbol = symbol.toUpperCase().trim()
    
    if (!upperSymbol) {
      alert('⚠️ Please enter a stock symbol')
      return
    }
    
    if (intradayWatchlist.includes(upperSymbol)) {
      alert(`⚠️ ${upperSymbol} is already in your intraday watchlist`)
      return
    }
    
    setIntradayWatchlist([...intradayWatchlist, upperSymbol])
    setIntradayStockInput('')
    alert(`✅ ${upperSymbol} added to intraday watchlist`)
  }

  function removeFromIntradayWatchlist(symbol: string) {
    setIntradayWatchlist(intradayWatchlist.filter(s => s !== symbol))
  }

  function bulkAddToIntradayWatchlist() {
    const newStocks = watchlist.filter(s => !intradayWatchlist.includes(s))
    
    if (newStocks.length === 0) {
      alert('⚠️ All main watchlist stocks are already in intraday watchlist')
      return
    }
    
    setIntradayWatchlist([...intradayWatchlist, ...newStocks])
    alert(`✅ Added ${newStocks.length} stocks from main watchlist: ${newStocks.join(', ')}`)
  }

  function clearIntradayWatchlist() {
    if (intradayWatchlist.length === 0) {
      alert('⚠️ Intraday watchlist is already empty')
      return
    }
    
    if (confirm(`Clear all ${intradayWatchlist.length} stocks from intraday watchlist?`)) {
      setIntradayWatchlist([])
      alert('✅ Intraday watchlist cleared')
    }
  }

  // Position Management Functions
  function enterPosition(symbol: string, entryPrice: number, quantity: number, type: 'BUY' | 'SELL') {
    const newPosition: Position = {
      symbol,
      type,
      entry_price: entryPrice,
      quantity,
      entry_time: new Date(),
      target: type === 'BUY' ? entryPrice * 1.025 : entryPrice * 0.975,
      stop_loss: type === 'BUY' ? entryPrice * 0.99 : entryPrice * 1.01,
      current_price: entryPrice,
      pnl: 0,
      pnl_percent: 0,
      status: 'open'
    }
    
    setIntradayPositions([...intradayPositions, newPosition])
    alert(`✅ ${type} position entered: ${quantity} shares of ${symbol} at ₹${entryPrice}`)
  }

  function handleManualEntry() {
    const symbol = manualEntrySymbol.toUpperCase().trim()
    const price = parseFloat(manualEntryPrice)
    const quantity = parseInt(manualEntryQuantity)

    if (!symbol) {
      alert('⚠️ Please enter a stock symbol')
      return
    }

    if (isNaN(price) || price <= 0) {
      alert('⚠️ Please enter a valid entry price')
      return
    }

    if (isNaN(quantity) || quantity <= 0) {
      alert('⚠️ Please enter a valid quantity')
      return
    }

    // Check if position already exists
    if (intradayPositions.some(p => p.symbol === symbol)) {
      alert(`⚠️ You already have an open position in ${symbol}`)
      return
    }

    enterPosition(symbol, price, quantity, manualEntryType)
    
    // Clear form
    setManualEntrySymbol('')
    setManualEntryPrice('')
    setManualEntryQuantity('')
    setManualEntryType('BUY')
  }

  function exitPosition(symbol: string) {
    const position = intradayPositions.find(p => p.symbol === symbol)
    if (!position) return

    const pnl = position.pnl || 0
    
    setIntradayPositions(intradayPositions.filter(p => p.symbol !== symbol))
    setTotalPnL(prev => Number(prev) + Number(pnl))
    
    alert(`✅ Position closed: ${symbol}\nP&L: ₹${pnl.toFixed(2)} (${((pnl / (position.entry_price * position.quantity)) * 100).toFixed(2)}%)`)
  }

  async function updatePositionPrices() {
    if (intradayPositions.length === 0) {
      alert('⚠️ No positions to update')
      return
    }

    setIsLoading(true)
    
    try {
      // Update current prices for all open positions
      const updatedPositions = await Promise.all(
        intradayPositions.map(async (position) => {
          try {
            console.log(`Updating price for ${position.symbol}...`)
            const data = await fetchStockQuote(position.symbol)
            
            if (data) {
              console.log(`✅ ${position.symbol}: ₹${data.current}`)
              
              const pnl = position.type === 'BUY' 
                ? (data.current - position.entry_price) * position.quantity
                : (position.entry_price - data.current) * position.quantity
              
              const pnlPercent = (pnl / (position.entry_price * position.quantity)) * 100
            
            return {
                ...position,
                current_price: data.current,
                pnl: Number(pnl),
                pnl_percent: Number(pnlPercent)
              }
            } else {
              console.error(`❌ No data returned for ${position.symbol}`)
              return position
            }
          } catch (err) {
            console.error(`❌ Failed to update ${position.symbol}:`, err)
            return position
          }
        })
      )
      
      setIntradayPositions(updatedPositions)
      
      // Calculate total P&L
      const totalPnL = updatedPositions.reduce((sum, pos) => sum + Number(pos.pnl || 0), 0)
      setTotalPnL(totalPnL)
      
      alert('✅ Prices updated successfully!')
    } catch (err) {
      console.error('Error updating positions:', err)
      alert('❌ Failed to update prices. Check console for details.')
    } finally {
      setIsLoading(false)
    }
  }

  // Monitor positions with intelligent exit detection
  async function monitorPositions() {
    if (intradayPositions.length === 0) return

    try {
      const newExitSignals: Record<string, any> = {}
      
      // Update prices and check exit signals for all positions
      const updatedPositions = await Promise.all(
        intradayPositions.map(async (position) => {
          try {
            const data = await fetchStockQuote(position.symbol)
            
            if (data) {
              const pnl = position.type === 'BUY' 
                ? (data.current - position.entry_price) * position.quantity
                : (position.entry_price - data.current) * position.quantity
              
              const pnlPercent = (pnl / (position.entry_price * position.quantity)) * 100
              
              const updatedPosition = {
                ...position,
                current_price: data.current,
                pnl: Number(pnl),
                pnl_percent: Number(pnlPercent)
              }

              // Check exit signal using intraday-utils
              const exitCheck = checkExitSignal(updatedPosition, data.current, new Date())
              
              if (exitCheck.shouldExit) {
                // Create exit signal object
                const exitSignal = {
                  shouldExit: true,
                  reason: exitCheck.reason,
                  strength: exitCheck.reason.includes('Stop Loss') || exitCheck.reason.includes('Time Stop') ? 5 : 3,
                  reasons: [exitCheck.reason],
                  pnl: pnl
                }
                
                newExitSignals[position.symbol] = exitSignal
                
                // Send browser notification for critical exits (stop loss or time stop)
                if (exitSignal.strength >= 4) {
                  sendNotification(
                    `🚨 EXIT SIGNAL: ${position.symbol}`,
                    `${exitCheck.reason} | P&L: ₹${pnl.toFixed(2)}`
                  )
                }
              }
              
              return updatedPosition
            }
            return position
          } catch (err) {
            console.error(`Failed to monitor ${position.symbol}:`, err)
            return position
          }
        })
      )
      
      setIntradayPositions(updatedPositions)
      setExitSignals(newExitSignals)
      
      // Update total P&L
      const totalPnL = updatedPositions.reduce((sum, pos) => sum + Number(pos.pnl || 0), 0)
      setTotalPnL(totalPnL)
      
    } catch (err) {
      console.error('Error monitoring positions:', err)
    }
  }

  // Send browser notification
  function sendNotification(title: string, body: string) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        requireInteraction: true
      })
    }
  }

  function addMockPositions() {
    const mockPositions: Position[] = [
      {
        symbol: 'RELIANCE',
        type: 'BUY',
        entry_price: 2830.50,
        quantity: 10,
        entry_time: new Date(Date.now() - 1000 * 60 * 45), // 45 min ago
        target: 2901.26,
        stop_loss: 2802.20,
        current_price: 2858.20,
        pnl: 277.00,
        pnl_percent: 0.98,
        status: 'open'
      },
      {
        symbol: 'HDFCBANK',
        type: 'BUY',
        entry_price: 1635.80,
        quantity: 15,
        entry_time: new Date(Date.now() - 1000 * 60 * 30), // 30 min ago
        target: 1676.69,
        stop_loss: 1619.44,
        current_price: 1648.50,
        pnl: 190.50,
        pnl_percent: 0.78,
        status: 'open'
      }
    ]
    
    setIntradayPositions(mockPositions)
    setTotalPnL(467.50)
    alert('✅ Added 2 mock positions (RELIANCE & HDFCBANK)')
  }

  function clearAllPositions() {
    if (intradayPositions.length === 0) {
      alert('⚠️ No open positions')
      return
    }
    
    if (confirm(`Close all ${intradayPositions.length} positions?`)) {
      const finalPnL = intradayPositions.reduce((sum, pos) => sum + (pos.pnl || 0), 0)
      setTotalPnL(prev => Number(prev) + Number(finalPnL))
      setIntradayPositions([])
      alert(`✅ All positions closed\nTotal P&L: ₹${finalPnL.toFixed(2)}`)
    }
  }

  // ========== OPENING RANGE BREAKOUT (ORB) FUNCTIONS ==========

  // Capture Opening Range (9:15-9:30 AM)
  async function captureOpeningRange() {
    const now = new Date()
    const hours = now.getHours()
    const minutes = now.getMinutes()
    
    // Check if we're in the opening range window (9:15-9:30)
    if (hours !== 9 || minutes >= 30) {
      alert('⚠️ Opening Range can only be captured between 9:15-9:30 AM')
      return
    }

    setIsCapturingORB(true)
    setIsLoading(true)

    try {
      const ranges: Record<string, any> = {}
      
      // Fetch 1-min candles for each stock
      await Promise.all(
        orbWatchlist.map(async (symbol) => {
          try {
            console.log(`📊 Capturing ORB for ${symbol}...`)
            const data = await fetchStockQuote(symbol)
            
            if (data) {
              // For simplicity, use current price as approximation
              // In production, you'd fetch actual 1-min candles from 9:15-9:30
              const range = {
                high: data.dayHigh,
                low: data.dayLow,
                open: data.open,
                current: data.current,
                rangeCaptured: true,
                timestamp: now
              }
              
              ranges[symbol] = range
              console.log(`✅ ${symbol}: ORB High=₹${range.high.toFixed(2)}, Low=₹${range.low.toFixed(2)}`)
            }
          } catch (err) {
            console.error(`Failed to capture ORB for ${symbol}:`, err)
          }
        })
      )
      
      setOrbRanges(ranges)
      alert(`✅ Opening Range captured for ${Object.keys(ranges).length} stocks!\n\nNow monitoring for breakouts...`)
    } catch (err) {
      console.error('Error capturing opening range:', err)
      alert('❌ Failed to capture opening range. Check console.')
    } finally {
      setIsLoading(false)
      setIsCapturingORB(true)
    }
  }

  // Scan for ORB Breakouts
  async function scanORBBreakouts() {
    if (Object.keys(orbRanges).length === 0) {
      alert('⚠️ Please capture Opening Range first (9:15-9:30 AM)')
      return
    }

    setIsLoading(true)

    try {
      const signals: any[] = []
      
      await Promise.all(
        Object.keys(orbRanges).map(async (symbol) => {
          try {
            const range = orbRanges[symbol]
            const data = await fetchStockQuote(symbol)
            
            if (data) {
              const currentPrice = data.current
              const volume = data.volume || 0
              const avgVolume = (data.volume / 2) || 1 // Rough estimate: current volume / 2
              
              // Check for breakout above ORB High
              if (currentPrice > range.high * 1.001) { // 0.1% above high
                const rangeSize = range.high - range.low
                const target = currentPrice + (rangeSize * 1.5) // Target = 1.5x range
                const stopLoss = range.high - (rangeSize * 0.3) // Stop below breakout level
                
                const signal = {
                  symbol,
                  signal_type: 'BUY',
                  strategy: 'ORB Bullish Breakout',
                  entry_price: currentPrice,
                  target: target,
                  stop_loss: stopLoss,
                  orb_high: range.high,
                  orb_low: range.low,
                  breakout_type: 'ABOVE HIGH',
                  range_size: rangeSize,
                  current_price: currentPrice,
                  strength: volume > avgVolume * 1.5 ? 5 : 4,
                  reasons: [
                    `Broke above ORB High (₹${range.high.toFixed(2)})`,
                    `Current: ₹${currentPrice.toFixed(2)}`,
                    `Range: ₹${rangeSize.toFixed(2)} (${((rangeSize / range.open) * 100).toFixed(2)}%)`,
                    volume > avgVolume * 1.5 ? 'Strong Volume' : 'Moderate Volume',
                    `Target: ₹${target.toFixed(2)} (+${((target - currentPrice) / currentPrice * 100).toFixed(2)}%)`,
                    `Risk: ₹${(currentPrice - stopLoss).toFixed(2)}`
                  ],
                  risk_reward: (target - currentPrice) / (currentPrice - stopLoss)
                }
                
                signals.push(signal)
                console.log(`🚀 ORB BREAKOUT: ${symbol} broke above ₹${range.high.toFixed(2)}`)
              }
              
              // Check for breakdown below ORB Low
              else if (currentPrice < range.low * 0.999) { // 0.1% below low
                const rangeSize = range.high - range.low
                const target = currentPrice - (rangeSize * 1.5) // Target = 1.5x range down
                const stopLoss = range.low + (rangeSize * 0.3) // Stop above breakdown level
                
                const signal = {
                  symbol,
                  signal_type: 'SELL',
                  strategy: 'ORB Bearish Breakdown',
                  entry_price: currentPrice,
                  target: target,
                  stop_loss: stopLoss,
                  orb_high: range.high,
                  orb_low: range.low,
                  breakout_type: 'BELOW LOW',
                  range_size: rangeSize,
                  current_price: currentPrice,
                  strength: volume > avgVolume * 1.5 ? 5 : 4,
                  reasons: [
                    `Broke below ORB Low (₹${range.low.toFixed(2)})`,
                    `Current: ₹${currentPrice.toFixed(2)}`,
                    `Range: ₹${rangeSize.toFixed(2)} (${((rangeSize / range.open) * 100).toFixed(2)}%)`,
                    volume > avgVolume * 1.5 ? 'Strong Volume' : 'Moderate Volume',
                    `Target: ₹${target.toFixed(2)} (${((target - currentPrice) / currentPrice * 100).toFixed(2)}%)`,
                    `Risk: ₹${(stopLoss - currentPrice).toFixed(2)}`
                  ],
                  risk_reward: (currentPrice - target) / (stopLoss - currentPrice)
                }
                
                signals.push(signal)
                console.log(`📉 ORB BREAKDOWN: ${symbol} broke below ₹${range.low.toFixed(2)}`)
              }
            }
          } catch (err) {
            console.error(`Failed to scan ORB for ${symbol}:`, err)
          }
        })
      )
      
      setOrbSignals(signals)
      
      if (signals.length === 0) {
        alert('📊 No ORB breakouts detected yet. Stocks are still within opening range.')
            } else {
        alert(`🚀 Found ${signals.length} ORB Breakout Signal(s)!`)
      }
    } catch (err) {
      console.error('Error scanning ORB breakouts:', err)
      alert('❌ Failed to scan breakouts. Check console.')
    } finally {
      setIsLoading(false)
    }
  }

  // Reset ORB for new day
  function resetORB() {
    setOrbRanges({})
    setOrbSignals([])
    setIsCapturingORB(false)
    alert('✅ ORB data reset. Ready for new trading day!')
  }

  // ========== TRADE WATCH (SMART MONITOR BUCKET) FUNCTIONS ==========

  // Add stock to Trade Watch
  function addToTradeWatch(symbol: string, source: string = 'manual', initialData?: any) {
    // Check if already in watch
    if (tradeWatch.some(w => w.symbol === symbol)) {
      alert(`⚠️ ${symbol} is already in Trade Watch`)
      return
    }

    // Check if already in positions
    if (intradayPositions.some(p => p.symbol === symbol)) {
      alert(`⚠️ ${symbol} is already in your open positions`)
      return
    }

    const watchItem = {
      symbol,
      addedAt: new Date(),
      addedFrom: source,
      currentPrice: initialData?.entry_price || initialData?.current_price || 0,
      addedPrice: initialData?.entry_price || initialData?.current_price || 0,
      targetPrice: initialData?.target || 0,
      stopLoss: initialData?.stop_loss || 0,
      expectedType: initialData?.signal_type || 'BUY',
      conditions: {
        momentum: false,
        volume: false,
        rsi: false,
        vwap: false,
        support: false
      },
      conditionsMet: 0,
      lastChecked: new Date()
    }

    setTradeWatch([...tradeWatch, watchItem])
    alert(`✅ ${symbol} added to Trade Watch!\n\nSystem will monitor for perfect entry conditions.`)
  }

  // Remove from Trade Watch
  function removeFromTradeWatch(symbol: string) {
    setTradeWatch(tradeWatch.filter(w => w.symbol !== symbol))
    setEntryAlerts(entryAlerts.filter(a => a.symbol !== symbol))
  }

  // Clear all from Trade Watch
  function clearTradeWatch() {
    if (confirm(`Clear all ${tradeWatch.length} stocks from Trade Watch?`)) {
      setTradeWatch([])
      setEntryAlerts([])
      alert('✅ Trade Watch cleared')
    }
  }

  // Monitor Trade Watch for perfect entry signals
  async function monitorTradeWatch() {
    if (tradeWatch.length === 0) return

    try {
      const newAlerts: any[] = []
      const updatedWatch = await Promise.all(
        tradeWatch.map(async (watchItem) => {
          try {
            const data = await fetchStockQuote(watchItem.symbol)
            
            if (data) {
              // Update current price
              const updated = {
                ...watchItem,
                currentPrice: data.current,
                priceChange: ((data.current - watchItem.addedPrice) / watchItem.addedPrice) * 100,
                lastChecked: new Date()
              }

              // Analyze entry conditions
              const analysis = analyzeEntryConditions(watchItem.symbol, data, watchItem)
              updated.conditions = analysis.conditions
              updated.conditionsMet = analysis.conditionsMet

              // Check if perfect entry (all 5 conditions met OR 4+ for aggressive)
              const isPerfectEntry = analysis.conditionsMet >= 4 // 4 out of 5 conditions
              
              if (isPerfectEntry && !entryAlerts.some(a => a.symbol === watchItem.symbol)) {
                const alert = {
                  symbol: watchItem.symbol,
                  type: analysis.signalType,
                  entry_price: data.current,
                  target: analysis.target,
                  stop_loss: analysis.stopLoss,
                  conditions: analysis.conditions,
                  conditionsMet: analysis.conditionsMet,
                  reasons: analysis.reasons,
                  strength: analysis.conditionsMet,
                  timestamp: new Date(),
                  risk_reward: (analysis.target - data.current) / (data.current - analysis.stopLoss)
                }
                
                newAlerts.push(alert)
                
                // Send browser notification
                sendNotification(
                  `🚨 PERFECT ENTRY: ${watchItem.symbol}`,
                  `${analysis.conditionsMet}/5 conditions met! Entry: ₹${data.current.toFixed(2)}`
                )
              }

              return updated
            }
            return watchItem
          } catch (err) {
            console.error(`Failed to monitor ${watchItem.symbol}:`, err)
            return watchItem
          }
        })
      )

      setTradeWatch(updatedWatch)
      
      if (newAlerts.length > 0) {
        setEntryAlerts([...entryAlerts, ...newAlerts])
      }
    } catch (err) {
      console.error('Error monitoring Trade Watch:', err)
    }
  }

  // Analyze entry conditions for a stock
  function analyzeEntryConditions(symbol: string, data: any, watchItem: any) {
    const conditions = {
      momentum: false,
      volume: false,
      rsi: false,
      vwap: false,
      support: false
    }
    const reasons: string[] = []
    let conditionsMet = 0

    // Simple heuristic analysis (in production, fetch actual intraday data)
    
    // 1. Momentum check
    const priceChange = ((data.current - data.open) / data.open) * 100
    if (watchItem.expectedType === 'BUY' && priceChange > 0.3) {
      conditions.momentum = true
      conditionsMet++
      reasons.push(`✅ Momentum: +${priceChange.toFixed(2)}%`)
    } else if (watchItem.expectedType === 'SELL' && priceChange < -0.3) {
      conditions.momentum = true
      conditionsMet++
      reasons.push(`✅ Momentum: ${priceChange.toFixed(2)}%`)
              } else {
      reasons.push(`⏳ Momentum: ${priceChange.toFixed(2)}% (waiting)`)
    }

    // 2. Volume check (rough estimate)
    const hasVolume = data.volume > 0
    if (hasVolume) {
      conditions.volume = true
      conditionsMet++
      reasons.push(`✅ Volume: Active`)
    } else {
      reasons.push(`⏳ Volume: Low`)
    }

    // 3. RSI check (estimate based on price movement)
    const estimatedRSI = 50 + (priceChange * 2) // Rough approximation
    if (estimatedRSI >= 45 && estimatedRSI <= 65) {
      conditions.rsi = true
      conditionsMet++
      reasons.push(`✅ RSI: ~${Math.round(estimatedRSI)} (Good range)`)
    } else {
      reasons.push(`⏳ RSI: ~${Math.round(estimatedRSI)} (waiting)`)
    }

    // 4. VWAP check (use average of open and current)
    const estimatedVWAP = (data.open + data.current) / 2
    const nearVWAP = Math.abs(data.current - estimatedVWAP) / estimatedVWAP < 0.005 // Within 0.5%
    if (nearVWAP) {
      conditions.vwap = true
      conditionsMet++
      reasons.push(`✅ Near VWAP (₹${estimatedVWAP.toFixed(2)})`)
            } else {
      reasons.push(`⏳ Away from VWAP (₹${estimatedVWAP.toFixed(2)})`)
    }

    // 5. Support/Resistance check (use day low/high)
    const nearSupport = Math.abs(data.current - data.dayLow) / data.dayLow < 0.01 // Within 1%
    const nearResistance = Math.abs(data.current - data.dayHigh) / data.dayHigh < 0.01
    if ((watchItem.expectedType === 'BUY' && nearSupport) || 
        (watchItem.expectedType === 'SELL' && nearResistance)) {
      conditions.support = true
      conditionsMet++
      reasons.push(`✅ At key level (₹${data.current.toFixed(2)})`)
    } else {
      reasons.push(`⏳ Not at key level yet`)
    }

    // Calculate target and stop loss
    const target = watchItem.expectedType === 'BUY'
      ? data.current * 1.025  // 2.5% target
      : data.current * 0.975
    
    const stopLoss = watchItem.expectedType === 'BUY'
      ? data.current * 0.99   // 1% stop loss
      : data.current * 1.01

    return {
      conditions,
      conditionsMet,
      reasons,
      signalType: watchItem.expectedType,
      target,
      stopLoss
    }
  }

  // Demo Mode - Generate mock signals for testing
  function runDemoScreener() {
    setIsLoading(true)
    setIsDemoData(true)
    
    // Simulate API delay
    setTimeout(() => {
      const mockSignals: IntradaySignal[] = [
        {
          symbol: 'RELIANCE',
          signal_type: 'BUY',
          strength: 5,
          entry_price: 2845.50,
          target: 2916.63,
          stop_loss: 2817.05,
          reasons: [
            'Momentum: +0.85%',
            'Volume: 2.8x avg',
            'RSI: 58 (Good range)',
            'Above VWAP (₹2,840.20)',
            'Support at ₹2,815.00',
            'GAP UP: +1.2%'
          ],
          risk_reward: 2.5,
          position_size_suggested: 35
        },
        {
          symbol: 'TCS',
          signal_type: 'BUY',
          strength: 4,
          entry_price: 3850.75,
          target: 3947.02,
          stop_loss: 3812.24,
          reasons: [
            'Momentum: +0.65%',
            'Volume: 2.2x avg',
            'RSI: 62 (Good range)',
            'Above VWAP (₹3,845.30)',
            'Support at ₹3,810.00'
          ],
          risk_reward: 2.5,
          position_size_suggested: 26
        },
        {
          symbol: 'INFY',
          signal_type: 'SELL',
          strength: 3,
          entry_price: 1456.30,
          target: 1420.10,
          stop_loss: 1470.92,
          reasons: [
            'Momentum: -0.72%',
            'Volume: 2.5x avg',
            'RSI: 68 (Near overbought)',
            'Below VWAP (₹1,460.50)',
            'GAP DOWN: -0.8%'
          ],
          risk_reward: 2.5,
          position_size_suggested: 68
        },
        {
          symbol: 'HDFCBANK',
          signal_type: 'BUY',
          strength: 5,
          entry_price: 1642.80,
          target: 1683.87,
          stop_loss: 1626.37,
          reasons: [
            'Momentum: +0.95%',
            'Volume: 3.1x avg',
            'RSI: 55 (Good range)',
            'Above VWAP (₹1,638.50)',
            'Support at ₹1,625.00',
            'GAP UP: +1.5%'
          ],
          risk_reward: 2.5,
          position_size_suggested: 61
        },
        {
          symbol: 'ICICIBANK',
          signal_type: 'BUY',
          strength: 4,
          entry_price: 1089.20,
          target: 1116.44,
          stop_loss: 1078.31,
          reasons: [
            'Momentum: +0.55%',
            'Volume: 2.6x avg',
            'RSI: 60 (Good range)',
            'Above VWAP (₹1,086.75)',
            'Support at ₹1,077.00'
          ],
          risk_reward: 2.5,
          position_size_suggested: 92
        }
      ]
      
      setIntradaySignals(mockSignals)
      setIsLoading(false)
    }, 2000) // 2 second delay to simulate API calls
  }

  const StockCard = ({ stock, analysis }: { stock: StockData; analysis: any }) => {
    const changeClass = stock.change >= 0 ? 'positive' : 'negative'
            const signalClass = analysis.signal.includes('BUY') ? 'buy-signal' : 
                       analysis.signal.includes('SELL') ? 'sell-signal' : 'hold-signal'
    
    return (
      <div className="card">
        <div className="stock-header">
          <span className="stock-symbol">{stock.name}</span>
          <button className="remove-btn" onClick={() => removeFromWatchlist(stock.symbol)}>
            Remove
          </button>
                    </div>
        <div className="stock-price">₹{stock.current.toFixed(2)}</div>
        <span className={`price-change ${changeClass}`}>
          {stock.change >= 0 ? '▲' : '▼'} {Math.abs(stock.change).toFixed(2)} 
          ({stock.changePercent.toFixed(2)}%)
                    </span>
                    
        <div className="indicators">
          <div className="indicator">
            <div className="indicator-label">RSI (14)</div>
            <div className="indicator-value">{analysis.indicators.rsi}</div>
                        </div>
          <div className="indicator">
            <div className="indicator-label">MACD</div>
            <div className="indicator-value">{analysis.indicators.macd}</div>
                        </div>
          <div className="indicator">
            <div className="indicator-label">Day Range</div>
            <div className="indicator-value">₹{stock.dayLow.toFixed(2)} - ₹{stock.dayHigh.toFixed(2)}</div>
                        </div>
          <div className="indicator">
            <div className="indicator-label">Volume</div>
            <div className="indicator-value">{(stock.volume / 1000000).toFixed(2)}M</div>
                        </div>
                    </div>
                    
        <div className={`signal-box ${signalClass}`}>
          <h3>{analysis.signal}</h3>
          <p style={{ fontSize: '0.9em', marginTop: '8px' }}>{analysis.reason}</p>
          <div className="signal-strength">
            {Array(5).fill('').map((_, i) => (
              <div key={i} className={`strength-bar ${i < analysis.strength ? 'filled' : ''}`}></div>
            ))}
                        </div>
                    </div>
                    
        <div style={{ textAlign: 'center', marginTop: '10px', color: 'rgba(255,255,255,0.5)', fontSize: '0.85em' }}>
          Updated: {stock.timestamp}
                    </div>
                </div>
    )
  }

  if (!authStatus.authenticated) {
    return (
      <div className="container">
        <h1>🚀 Indian Stock Tracker - Zerodha Kite</h1>
        
        <div className="alert warning">
          <strong>🔐 Authentication Required</strong>
          <p style={{ marginTop: '10px' }}>Please login with your Zerodha account to access live NSE/BSE market data.</p>
          <button onClick={handleLogin} style={{ marginTop: '15px' }}>
            Login with Zerodha Kite
          </button>
        </div>

        {error && (
          <div className="error">
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className="card">
          <h3>Features</h3>
          <ul style={{ marginTop: '15px', lineHeight: '1.8' }}>
            <li>✅ Real-time NSE/BSE stock quotes via Zerodha Kite Connect</li>
            <li>📊 Advanced technical analysis (RSI, MACD, Bollinger Bands)</li>
            <li>🎯 Automated trading signals (Buy/Sell/Hold)</li>
            <li>🔍 Stock screener for top opportunities</li>
            <li>📈 Historical data for comprehensive analysis</li>
            <li>⚡ Live market data with no rate limits</li>
          </ul>
        </div>

        <style jsx>{`
          ${require('./styles').default}
        `}</style>
      </div>
    )
  }

  return (
    <div className="container">
      <h1>🚀 Indian Stock Tracker - Zerodha Kite</h1>

      <div className={error ? "alert warning" : "alert"}>
        {error ? (
          <>
            <strong>⚠️ Error:</strong> {error}
          </>
        ) : (
          <>
            <strong>✅ Connected:</strong> Logged in as {authStatus.user?.userId}
            <button onClick={handleLogout} style={{ marginLeft: '15px', padding: '5px 15px', fontSize: '0.9em' }}>
              Logout
            </button>
          </>
        )}
      </div>

      <div className="controls">
        <div className="input-group">
          <input
            type="text"
            value={stockInput}
            onChange={(e) => setStockInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addStock()}
            placeholder="Enter Stock Symbol (e.g., RELIANCE, TCS, INFY)"
          />
          <select value={exchange} onChange={(e) => setExchange(e.target.value)}>
            <option value="NSE">NSE (India)</option>
            <option value="BSE">BSE (India)</option>
          </select>
          <button onClick={addStock}>Add to Watchlist</button>
          <button onClick={runScreener} disabled={isLoading}>Run Screener</button>
          <button onClick={updateWatchlist} disabled={isLoading}>
            🔄 {isLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'watchlist' ? 'active' : ''}`}
          onClick={() => setActiveTab('watchlist')}
        >
          Watchlist
        </button>
        <button 
          className={`tab ${activeTab === 'screener' ? 'active' : ''}`}
          onClick={() => setActiveTab('screener')}
        >
          Screener
        </button>
        <button 
          className={`tab ${activeTab === 'signals' ? 'active' : ''}`}
          onClick={() => setActiveTab('signals')}
        >
          Active Signals
        </button>
        <button 
          className={`tab ${activeTab === 'intraday' ? 'active' : ''}`}
          onClick={() => setActiveTab('intraday')}
        >
          🔥 Intraday
        </button>
      </div>

      {activeTab === 'watchlist' && (
                        <div>
          <div className="watchlist">
            <h3>Your Watchlist</h3>
            <div>
              {watchlist.map(symbol => {
                const data = stockData[symbol]
                if (!data) return (
                  <div key={symbol} className="watchlist-item">
                    <strong>{symbol}</strong>
                    <span>Loading...</span>
                        </div>
                )
                
                const changeClass = data.change >= 0 ? 'positive' : 'negative'
                return (
                  <div key={symbol} className="watchlist-item">
                    <div>
                      <strong>{symbol}</strong>
                      <span style={{ marginLeft: '15px' }}>₹{data.current.toFixed(2)}</span>
                    </div>
                    <span className={`price-change ${changeClass}`}>
                      {data.changePercent.toFixed(2)}%
                        </span>
                    </div>
                )
              })}
                        </div>
                    </div>
          
          <div className="dashboard">
            {watchlist.map(symbol => {
              const data = stockData[symbol]
              if (!data) return (
                <div key={symbol} className="card">
                  <div className="loading">Loading {symbol}...</div>
                </div>
              )
              
              const analysis = generateTradingSignal(data.current, data.prices, data.volumes)
              return <StockCard key={symbol} stock={data} analysis={analysis} />
            })}
          </div>
        </div>
      )}

      {activeTab === 'screener' && (
        <div>
          <div className="strategy-info">
            <h3>📊 Custom Screener Groups</h3>
            <p><strong>Momentum Breakout:</strong> Stocks breaking above resistance with high volume</p>
            <p><strong>Oversold Bounce:</strong> Stocks at RSI &lt; 30 ready for reversal</p>
            <p><strong>Trend Following:</strong> Stocks in strong uptrend with good momentum</p>
          </div>

          <div className="controls" style={{ marginBottom: '20px' }}>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                Select Screener Group:
              </label>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                <select 
                  value={activeScreenerGroup} 
                  onChange={(e) => setActiveScreenerGroup(e.target.value)}
                  style={{ flex: '1', minWidth: '200px' }}
                >
                  {Object.keys(screenerGroups).map(group => (
                    <option key={group} value={group}>
                      {group} ({screenerGroups[group].length} stocks)
                    </option>
                  ))}
                </select>
                <button onClick={createNewScreenerGroup}>
                  ➕ New Group
                </button>
                {activeScreenerGroup !== 'Popular Large Caps' && (
                  <button 
                    onClick={deleteScreenerGroup}
                    style={{ background: 'rgba(255, 0, 100, 0.3)', color: '#ff0064' }}
                  >
                    🗑️ Delete Group
                  </button>
                )}
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                Add Stock to {activeScreenerGroup}:
              </label>
              <div className="input-group">
                <input
                  type="text"
                  value={screenerInput}
                  onChange={(e) => setScreenerInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addToScreener()}
                  placeholder="Enter stock symbol (e.g., ADANIENT)"
                  style={{ flex: '1' }}
                />
                <button onClick={addToScreener}>Add to Screener</button>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                Stocks in {activeScreenerGroup}: ({screenerGroups[activeScreenerGroup]?.length || 0})
              </label>
              <div style={{ 
                display: 'flex', 
                flexWrap: 'wrap', 
                gap: '8px',
                padding: '10px',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '8px',
                minHeight: '50px'
              }}>
                {screenerGroups[activeScreenerGroup]?.length > 0 ? (
                  screenerGroups[activeScreenerGroup].map(symbol => (
                    <span 
                      key={symbol}
                      style={{
                        padding: '6px 12px',
                        background: 'rgba(79, 172, 254, 0.2)',
                        border: '1px solid rgba(79, 172, 254, 0.5)',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      {symbol}
                      <button 
                        onClick={() => removeFromScreener(symbol)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ff0064',
                          cursor: 'pointer',
                          padding: '0',
                          fontSize: '16px',
                          lineHeight: '1'
                        }}
                      >
                        ✕
                      </button>
                    </span>
                  ))
                ) : (
                  <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
                    No stocks added. Add stocks above to screen them.
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="screener-results">
            <h3>Top Opportunities</h3>
            {isLoading ? (
              <div className="loading">Screening stocks... Please wait...</div>
            ) : screenerResults.length === 0 ? (
              <p>Click "Run Screener" to find trading opportunities</p>
            ) : (
              <table className="screener-table">
                    <thead>
                        <tr>
                            <th>Symbol</th>
                            <th>Price</th>
                            <th>Change %</th>
                            <th>Signal</th>
                            <th>Reason</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                  {screenerResults.map(stock => {
                    const changeClass = stock.change >= 0 ? 'positive' : 'negative'
              const signalClass = stock.signal.includes('BUY') ? 'positive' : 
                                       stock.signal.includes('SELL') ? 'negative' : 'neutral'
                    return (
                      <tr key={stock.symbol}>
                        <td><strong>{stock.symbol}</strong></td>
                        <td>₹{stock.price.toFixed(2)}</td>
                        <td className={changeClass}>{stock.change.toFixed(2)}%</td>
                        <td className={signalClass}>{stock.signal}</td>
                        <td style={{ fontSize: '0.9em' }}>{stock.reason}</td>
                        <td>
                          <button 
                            onClick={() => addToWatchlist(stock.symbol)}
                            style={{ fontSize: '0.9em', padding: '5px 10px' }}
                          >
                                Add
                            </button>
                        </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'signals' && (
        <div className="screener-results">
          <h3>Active Trading Signals</h3>
          {activeSignals.length === 0 ? (
            <p>No active strong signals. Refresh your watchlist or run the screener to find opportunities.</p>
          ) : (
            <table className="screener-table">
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Symbol</th>
                            <th>Signal</th>
                            <th>Price</th>
                            <th>Reason</th>
                        </tr>
                    </thead>
                    <tbody>
                {activeSignals.slice().reverse().map((signal, idx) => {
                  const signalClass = signal.signal.includes('BUY') ? 'positive' : 'negative'
                  return (
                    <tr key={idx}>
                      <td>{signal.time}</td>
                      <td><strong>{signal.symbol}</strong></td>
                      <td className={signalClass}>{signal.signal}</td>
                      <td>₹{signal.price.toFixed(2)}</td>
                      <td>{signal.reason}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'intraday' && (
        <div>
          {/* Market Status Banner */}
          {(() => {
            const today = new Date().getDay()
            const isWeekend = today === 0 || today === 6
            
            if (isWeekend) {
              return (
                <div className="alert warning" style={{ 
                  background: 'rgba(255, 69, 0, 0.2)',
                  border: '1px solid rgba(255, 69, 0, 0.5)'
                }}>
                  <strong>🚫 Market Closed - {today === 0 ? 'Sunday' : 'Saturday'}</strong>
                  <p style={{ marginTop: '10px', fontSize: '0.9em' }}>
                    The intraday screener only works on trading days (Monday-Friday, 9:00 AM - 3:30 PM).
                    <br />
                    Come back on Monday to use the Morning Screener!
                  </p>
                </div>
              )
            }
            
            return (
              <div className="alert" style={{ 
                background: marketStatus.isOpen 
                  ? 'rgba(0, 255, 100, 0.2)' 
                  : 'rgba(255, 193, 7, 0.2)',
                border: `1px solid ${marketStatus.isOpen ? 'rgba(0, 255, 100, 0.5)' : 'rgba(255, 193, 7, 0.5)'}`
              }}>
                <strong>🕐 Market Status:</strong> {marketStatus.phase.toUpperCase().replace('_', ' ')}
                {marketStatus.minutesToOpen && ` - Opens in ${marketStatus.minutesToOpen} minutes`}
                {marketStatus.minutesToClose && ` - Closes in ${Math.floor(marketStatus.minutesToClose / 60)}h ${marketStatus.minutesToClose % 60}m`}
              </div>
            )
          })()}

          {/* Morning Screener Section */}
          <div className="strategy-info">
            <h3>🌅 Morning Screener (9:00-9:30 AM)</h3>
            <p><strong>Gap Up/Down:</strong> Stocks with significant overnight moves</p>
            <p><strong>High Volume:</strong> Stocks with volume {'>'} 2x average</p>
            <p><strong>Breakout Candidates:</strong> Strong momentum in first 15 minutes</p>
            
            {/* Screener Level Selector */}
            <div style={{ marginTop: '15px', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
              <div style={{ marginBottom: '8px', fontSize: '0.9em', fontWeight: 'bold' }}>
                Select Risk Level:
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setScreenerLevel('CONSERVATIVE')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    fontSize: '0.85em',
                    background: screenerLevel === 'CONSERVATIVE' ? 'linear-gradient(135deg, #00ff64 0%, #00cc50 100%)' : 'rgba(0, 255, 100, 0.1)',
                    border: screenerLevel === 'CONSERVATIVE' ? '2px solid #00ff64' : '1px solid rgba(0, 255, 100, 0.3)',
                    color: screenerLevel === 'CONSERVATIVE' ? '#000' : '#fff',
                    fontWeight: screenerLevel === 'CONSERVATIVE' ? 'bold' : 'normal'
                  }}
                >
                  ⭐⭐⭐⭐⭐<br />CONSERVATIVE<br />(5/5 conditions)
                </button>
                <button
                  onClick={() => setScreenerLevel('MODERATE')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    fontSize: '0.85em',
                    background: screenerLevel === 'MODERATE' ? 'linear-gradient(135deg, #ffa500 0%, #ff8c00 100%)' : 'rgba(255, 165, 0, 0.1)',
                    border: screenerLevel === 'MODERATE' ? '2px solid #ffa500' : '1px solid rgba(255, 165, 0, 0.3)',
                    color: screenerLevel === 'MODERATE' ? '#000' : '#fff',
                    fontWeight: screenerLevel === 'MODERATE' ? 'bold' : 'normal'
                  }}
                >
                  ⭐⭐⭐<br />MODERATE<br />(3-4/5 conditions)
                </button>
                <button
                  onClick={() => setScreenerLevel('AGGRESSIVE')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    fontSize: '0.85em',
                    background: screenerLevel === 'AGGRESSIVE' ? 'linear-gradient(135deg, #ff0064 0%, #cc0050 100%)' : 'rgba(255, 0, 100, 0.1)',
                    border: screenerLevel === 'AGGRESSIVE' ? '2px solid #ff0064' : '1px solid rgba(255, 0, 100, 0.3)',
                    color: screenerLevel === 'AGGRESSIVE' ? '#000' : '#fff',
                    fontWeight: screenerLevel === 'AGGRESSIVE' ? 'bold' : 'normal'
                  }}
                >
                  ⭐<br />AGGRESSIVE<br />(2+/5 conditions)
                </button>
              </div>
            </div>
          </div>

          {/* Intraday Watchlist Manager */}
          <div className="controls" style={{ marginBottom: '20px' }}>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                Intraday Watchlist: ({intradayWatchlist.length} stocks)
              </label>
              
              {/* Add Stock Input */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <input
                  type="text"
                  value={intradayStockInput}
                  onChange={(e) => setIntradayStockInput(e.target.value.toUpperCase())}
                  onKeyPress={(e) => {
              if (e.key === 'Enter') {
                      addToIntradayWatchlist(intradayStockInput)
                    }
                  }}
                  placeholder="Enter symbol (e.g., WIPRO)"
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '14px'
                  }}
                />
                <button 
                  onClick={() => addToIntradayWatchlist(intradayStockInput)}
                  disabled={!intradayStockInput.trim()}
                  style={{ 
                    padding: '10px 20px',
                    fontSize: '14px',
                    whiteSpace: 'nowrap'
                  }}
                >
                  ➕ Add
                </button>
                <button 
                  onClick={bulkAddToIntradayWatchlist}
                  style={{ 
                    padding: '10px 15px',
                    fontSize: '14px',
                    whiteSpace: 'nowrap',
                    background: 'rgba(79, 172, 254, 0.2)',
                    border: '1px solid rgba(79, 172, 254, 0.5)'
                  }}
                  title="Import all stocks from main watchlist"
                >
                  📥 Import
                </button>
                <button 
                  onClick={clearIntradayWatchlist}
                  disabled={intradayWatchlist.length === 0}
                  style={{ 
                    padding: '10px 15px',
                    fontSize: '14px',
                    whiteSpace: 'nowrap',
                    background: 'rgba(255, 0, 100, 0.2)',
                    border: '1px solid rgba(255, 0, 100, 0.5)'
                  }}
                  title="Clear all stocks from intraday watchlist"
                >
                  🗑️ Clear
                </button>
              </div>

              {/* Stock Tags */}
              <div style={{ 
                display: 'flex', 
                flexWrap: 'wrap', 
                gap: '8px',
                padding: '10px',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '8px',
                minHeight: '50px'
              }}>
                {intradayWatchlist.length === 0 ? (
                  <p style={{ 
                    margin: 0, 
                    color: 'rgba(255, 255, 255, 0.5)',
                    fontSize: '0.9em',
                    padding: '5px'
                  }}>
                    No stocks in intraday watchlist. Add some above or import from main watchlist.
                  </p>
                ) : (
                  intradayWatchlist.map(symbol => (
                    <span 
                      key={symbol}
                      style={{
                        padding: '6px 12px',
                        background: 'rgba(255, 165, 0, 0.2)',
                        border: '1px solid rgba(255, 165, 0, 0.5)',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '0.9em'
                      }}
                    >
                      {symbol}
                      <button 
                        onClick={() => removeFromIntradayWatchlist(symbol)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ff0064',
                          cursor: 'pointer',
                          padding: '0',
                          fontSize: '16px',
                          lineHeight: '1'
                        }}
                        title={`Remove ${symbol}`}
                      >
                        ✕
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={runMorningScreener} 
                disabled={isLoading || !authStatus.authenticated || new Date().getDay() === 0 || new Date().getDay() === 6}
                style={{ flex: 1, fontSize: '16px', padding: '15px' }}
              >
                {isLoading 
                  ? '🔍 Screening...' 
                  : (new Date().getDay() === 0 || new Date().getDay() === 6)
                    ? '🚫 Market Closed (Weekend)'
                    : '🚀 Run Morning Screener'}
              </button>
              
              <button 
                onClick={runDemoScreener}
                disabled={isLoading}
                style={{ 
                  flex: 1, 
                  fontSize: '16px', 
                  padding: '15px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  border: '2px solid rgba(102, 126, 234, 0.5)'
                }}
              >
                {isLoading ? '🎬 Loading Demo...' : '🎭 Demo Mode (Test UI)'}
              </button>
            </div>
            
            {(new Date().getDay() === 0 || new Date().getDay() === 6) && (
              <div style={{ 
                marginTop: '10px', 
                padding: '12px',
                background: 'rgba(102, 126, 234, 0.1)',
                border: '1px solid rgba(102, 126, 234, 0.3)',
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                <p style={{ 
                  color: 'rgba(255, 193, 7, 1)',
                  fontSize: '0.9em',
                  margin: 0,
                  marginBottom: '5px'
                }}>
                  💡 <strong>Market Closed:</strong> The screener will work on Monday morning when the market opens!
                </p>
                <p style={{ 
                  color: 'rgba(102, 126, 234, 1)',
                  fontSize: '0.85em',
                  margin: 0
                }}>
                  🎭 Try <strong>Demo Mode</strong> to see how the screener results will look!
                </p>
              </div>
            )}
          </div>

          {/* Intraday Signals Results */}
          <div className="screener-results">
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
              <h3 style={{ margin: 0 }}>📊 Intraday Entry Signals</h3>
              {isDemoData && (
                <span style={{
                  padding: '6px 12px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  border: '1px solid rgba(102, 126, 234, 0.5)',
                  borderRadius: '6px',
                  fontSize: '0.75em',
                  fontWeight: 'bold',
                  letterSpacing: '0.5px'
                }}>
                  🎭 DEMO DATA
                </span>
              )}
            </div>
            {intradaySignals.length === 0 ? (
              <p>
                {isLoading 
                  ? 'Analyzing stocks for intraday opportunities...' 
                  : 'Click "Run Morning Screener" to find intraday trading opportunities'}
              </p>
            ) : (
              <div style={{ display: 'grid', gap: '20px' }}>
                {intradaySignals.map((signal, idx) => {
                  const signalColor = signal.signal_type === 'BUY' 
                    ? { bg: 'rgba(0, 255, 100, 0.1)', border: '#00ff64', text: '#00ff64' }
                    : { bg: 'rgba(255, 0, 100, 0.1)', border: '#ff0064', text: '#ff0064' }
                  
                  const riskColor = signal.risk_level === 'CONSERVATIVE' ? { bg: '#00ff64', text: '#000' } :
                                   signal.risk_level === 'MODERATE' ? { bg: '#ffa500', text: '#000' } :
                                   { bg: '#ff0064', text: '#fff' }

                  return (
                    <div 
                      key={idx}
                      className="card"
                      style={{
                        background: signalColor.bg,
                        border: `2px solid ${signalColor.border}`
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                        <div>
                          <h2 style={{ fontSize: '1.8em', margin: 0, color: signalColor.text }}>
                            {signal.symbol}
                          </h2>
                          <div style={{ fontSize: '1.3em', fontWeight: 'bold', marginTop: '5px' }}>
                            ₹{signal.entry_price.toFixed(2)}
                          </div>
                          {/* Risk Level Badge */}
                          <div style={{
                            marginTop: '8px',
                            padding: '4px 10px',
                            background: riskColor.bg,
                            color: riskColor.text,
                            borderRadius: '6px',
                            fontSize: '0.75em',
                            fontWeight: 'bold',
                            display: 'inline-block'
                          }}>
                            {signal.risk_level} • {signal.conditions_met}/{signal.total_conditions} conditions
                          </div>
                        </div>
                        <div style={{ 
                          padding: '10px 20px', 
                          background: signalColor.border,
                          color: '#000',
                          borderRadius: '8px',
                          fontWeight: 'bold',
                          fontSize: '1.2em'
                        }}>
                          {signal.signal_type}
                        </div>
                      </div>

                      {/* Signal Strength */}
                      <div style={{ marginBottom: '15px' }}>
                        <div style={{ fontSize: '0.9em', color: 'rgba(255,255,255,0.7)', marginBottom: '5px' }}>
                          Signal Strength:
                        </div>
                        <div className="signal-strength">
                          {Array(5).fill('').map((_, i) => (
                            <div 
                              key={i} 
                              className={`strength-bar ${i < signal.strength ? 'filled' : ''}`}
                              style={{ background: i < signal.strength ? signalColor.border : 'rgba(255,255,255,0.1)' }}
                            ></div>
                          ))}
                        </div>
                      </div>

                      {/* Entry Details */}
                      <div className="indicators">
                        <div className="indicator">
                          <div className="indicator-label">🎯 Target</div>
                          <div className="indicator-value" style={{ color: '#00ff64' }}>
                            ₹{signal.target.toFixed(2)}
                          </div>
                          <div style={{ fontSize: '0.8em', color: 'rgba(255,255,255,0.6)' }}>
                            +{((signal.target - signal.entry_price) / signal.entry_price * 100).toFixed(2)}%
                          </div>
                        </div>

                        <div className="indicator">
                          <div className="indicator-label">🛑 Stop Loss</div>
                          <div className="indicator-value" style={{ color: '#ff0064' }}>
                            ₹{signal.stop_loss.toFixed(2)}
                          </div>
                          <div style={{ fontSize: '0.8em', color: 'rgba(255,255,255,0.6)' }}>
                            -{((signal.entry_price - signal.stop_loss) / signal.entry_price * 100).toFixed(2)}%
                          </div>
                        </div>

                        <div className="indicator">
                          <div className="indicator-label">⚖️ Risk:Reward</div>
                          <div className="indicator-value">
                            1:{signal.risk_reward.toFixed(2)}
                          </div>
                        </div>

                        <div className="indicator">
                          <div className="indicator-label">📦 Position Size</div>
                          <div className="indicator-value">
                            {signal.position_size_suggested} shares
                          </div>
                        </div>
                      </div>

                      {/* Reasons */}
                      <div style={{ 
                        marginTop: '15px', 
                        padding: '12px',
                        background: 'rgba(255,255,255,0.05)',
                        borderRadius: '8px'
                      }}>
                        <div style={{ fontSize: '0.85em', color: 'rgba(255,255,255,0.7)', marginBottom: '8px' }}>
                          ✓ Entry Reasons:
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          {signal.reasons.map((reason, i) => (
                            <div key={i} style={{ fontSize: '0.9em' }}>
                              • {reason}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                        <button 
                          onClick={() => addToTradeWatch(signal.symbol, 'Morning Screener', signal)}
                          style={{ 
                            flex: 1,
                            padding: '12px',
                            fontSize: '1em',
                            fontWeight: 'bold',
                            background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                            border: '2px solid rgba(79, 172, 254, 0.5)',
                            color: '#000'
                          }}
                        >
                          👁️ Add to Watch
                        </button>
                        <button 
                          onClick={() => addToWatchlist(signal.symbol)}
                          style={{ 
                            flex: 1,
                            padding: '12px',
                            fontSize: '1em',
                            fontWeight: 'bold'
                          }}
                        >
                          📊 Add to List
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Info Box */}
          <div style={{ 
            marginTop: '20px',
            padding: '15px',
            background: 'rgba(79, 172, 254, 0.1)',
            border: '1px solid rgba(79, 172, 254, 0.3)',
            borderRadius: '10px'
          }}>
            <h4 style={{ marginBottom: '10px' }}>📚 How to Use Morning Screener:</h4>
            <ol style={{ marginLeft: '20px', lineHeight: '1.8' }}>
              <li><strong>Best Time:</strong> Run between 9:00-9:30 AM for pre-market analysis</li>
              <li><strong>Entry Conditions:</strong> All 5 conditions must match (Momentum, Volume, RSI, VWAP, Support)</li>
              <li><strong>Risk Management:</strong> Always use suggested stop-loss and targets</li>
              <li><strong>Position Sizing:</strong> Follow the suggested position size (1% risk per trade)</li>
              <li><strong>Exit Strategy:</strong> Exit at target (2-3%), stop-loss (0.5-1%), or 3:00 PM</li>
            </ol>
          </div>

          {/* Opening Range Breakout (ORB) Scanner */}
          <div style={{ marginTop: '40px', borderTop: '2px solid rgba(255, 193, 7, 0.3)', paddingTop: '30px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
              <div>
                <h2 style={{ fontSize: '1.8em', marginBottom: '8px' }}>🎯 Opening Range Breakout (ORB)</h2>
                <p style={{ color: 'rgba(255, 255, 255, 0.7)', margin: 0, fontSize: '0.95em' }}>
                  Capture first 15 minutes (9:15-9:30 AM) and detect breakouts for high-probability trades
                </p>
              </div>
              <button
                onClick={resetORB}
                disabled={Object.keys(orbRanges).length === 0}
                style={{
                  padding: '10px 20px',
                  fontSize: '0.9em',
                  background: 'rgba(255, 193, 7, 0.2)',
                  border: '1px solid rgba(255, 193, 7, 0.5)',
                  borderRadius: '8px',
                  cursor: Object.keys(orbRanges).length === 0 ? 'not-allowed' : 'pointer',
                  opacity: Object.keys(orbRanges).length === 0 ? 0.5 : 1
                }}
              >
                🔄 Reset ORB
              </button>
            </div>

            {/* ORB Control Panel */}
            <div style={{
              padding: '25px',
              background: 'linear-gradient(135deg, rgba(255, 193, 7, 0.15) 0%, rgba(255, 152, 0, 0.1) 100%)',
              border: '2px solid rgba(255, 193, 7, 0.4)',
              borderRadius: '12px',
              marginBottom: '25px'
            }}>
              <h3 style={{ marginBottom: '15px', fontSize: '1.3em' }}>
                {isCapturingORB ? '✅ ORB Captured - Monitoring for Breakouts' : '📊 Step 1: Capture Opening Range'}
              </h3>
              
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button 
                  onClick={captureOpeningRange}
                  disabled={isLoading || isCapturingORB}
                  style={{
                    flex: 1,
                    minWidth: '200px',
                    padding: '14px 20px',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    background: isCapturingORB 
                      ? 'rgba(0, 255, 100, 0.2)'
                      : 'linear-gradient(135deg, #ffa500 0%, #ff8c00 100%)',
                    border: isCapturingORB 
                      ? '2px solid #00ff64'
                      : '2px solid rgba(255, 193, 7, 0.5)',
                    color: isCapturingORB ? '#00ff64' : '#000',
                    borderRadius: '8px',
                    cursor: (isLoading || isCapturingORB) ? 'not-allowed' : 'pointer',
                    opacity: (isLoading || isCapturingORB) ? 0.6 : 1
                  }}
                >
                  {isLoading ? '⏳ Capturing...' : isCapturingORB ? '✅ ORB Captured' : '📊 Capture ORB (9:15-9:30 AM)'}
                </button>

                <button 
                  onClick={scanORBBreakouts}
                  disabled={!isCapturingORB || isLoading}
                  style={{
                    flex: 1,
                    minWidth: '200px',
                    padding: '14px 20px',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    background: (!isCapturingORB || isLoading)
                      ? 'rgba(255, 255, 255, 0.1)'
                      : 'linear-gradient(135deg, #00ff64 0%, #00cc50 100%)',
                    border: (!isCapturingORB || isLoading)
                      ? '1px solid rgba(255, 255, 255, 0.2)'
                      : '2px solid #00ff64',
                    color: (!isCapturingORB || isLoading) ? 'rgba(255, 255, 255, 0.5)' : '#000',
                    borderRadius: '8px',
                    cursor: (!isCapturingORB || isLoading) ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isLoading ? '⏳ Scanning...' : '🚀 Scan for Breakouts'}
                </button>
              </div>

              {/* ORB Watchlist Info */}
              <div style={{ marginTop: '15px', fontSize: '0.9em', color: 'rgba(255, 255, 255, 0.8)' }}>
                <strong>Monitoring:</strong> {orbWatchlist.join(', ')}
              </div>
            </div>

            {/* ORB Range Display */}
            {Object.keys(orbRanges).length > 0 && (
              <div style={{ marginBottom: '25px' }}>
                <h3 style={{ marginBottom: '15px', fontSize: '1.2em' }}>📏 Opening Ranges (9:15-9:30 AM)</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px' }}>
                  {Object.entries(orbRanges).map(([symbol, range]) => (
                    <div 
                      key={symbol}
                      style={{
                        padding: '15px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: '10px'
                      }}
                    >
                      <h4 style={{ marginBottom: '10px', fontSize: '1.1em' }}>{symbol}</h4>
                      <div style={{ fontSize: '0.9em', lineHeight: '1.8' }}>
                        <div>🔼 High: <strong style={{ color: '#00ff64' }}>₹{range.high.toFixed(2)}</strong></div>
                        <div>🔽 Low: <strong style={{ color: '#ff0064' }}>₹{range.low.toFixed(2)}</strong></div>
                        <div>📊 Range: ₹{(range.high - range.low).toFixed(2)}</div>
                        <div style={{ fontSize: '0.85em', color: 'rgba(255, 255, 255, 0.6)', marginTop: '5px' }}>
                          {range.timestamp.toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ORB Breakout Signals */}
            {orbSignals.length > 0 ? (
              <div>
                <h3 style={{ marginBottom: '15px', fontSize: '1.2em', color: '#ffa500' }}>
                  🚀 ORB Breakout Signals ({orbSignals.length})
                </h3>
                <div style={{ display: 'grid', gap: '20px' }}>
                  {orbSignals.map((signal, idx) => {
                    const signalColor = signal.signal_type === 'BUY'
                      ? { bg: 'rgba(0, 255, 100, 0.1)', border: '#00ff64', text: '#00ff64' }
                      : { bg: 'rgba(255, 0, 100, 0.1)', border: '#ff0064', text: '#ff0064' }

                    return (
                      <div 
                        key={idx}
                        className="card"
                        style={{
                          background: signalColor.bg,
                          border: `2px solid ${signalColor.border}`,
                          position: 'relative'
                        }}
                      >
                        {/* Signal Badge */}
                        <div style={{
                          position: 'absolute',
                          top: '15px',
                          right: '15px',
                          padding: '8px 16px',
                          background: signalColor.border,
                          color: '#000',
                          borderRadius: '8px',
                          fontSize: '0.9em',
                          fontWeight: 'bold'
                        }}>
                          {signal.signal_type}
                        </div>

                        {/* Symbol and Strategy */}
                        <div style={{ marginBottom: '15px' }}>
                          <h2 style={{ fontSize: '2em', margin: 0, marginBottom: '5px' }}>
                            {signal.symbol}
                          </h2>
                          <div style={{ 
                            fontSize: '1.1em', 
                            color: 'rgba(255, 255, 255, 0.8)',
                            fontWeight: 'bold'
                          }}>
                            {signal.strategy}
                          </div>
                          <div style={{ fontSize: '0.9em', color: 'rgba(255, 255, 255, 0.6)', marginTop: '5px' }}>
                            Breakout: {signal.breakout_type}
                          </div>
                        </div>

                        {/* Entry Details */}
                        <div className="indicators">
                          <div className="indicator">
                            <div className="indicator-label">💰 Entry</div>
                            <div className="indicator-value">
                              ₹{signal.entry_price.toFixed(2)}
                            </div>
                          </div>

                          <div className="indicator">
                            <div className="indicator-label">🎯 Target</div>
                            <div className="indicator-value" style={{ color: '#00ff64' }}>
                              ₹{signal.target.toFixed(2)}
                            </div>
                            <div style={{ fontSize: '0.8em', color: 'rgba(255, 255, 255, 0.6)' }}>
                              +{((Math.abs(signal.target - signal.entry_price)) / signal.entry_price * 100).toFixed(2)}%
                            </div>
                          </div>

                          <div className="indicator">
                            <div className="indicator-label">🛑 Stop Loss</div>
                            <div className="indicator-value" style={{ color: '#ff0064' }}>
                              ₹{signal.stop_loss.toFixed(2)}
                            </div>
                            <div style={{ fontSize: '0.8em', color: 'rgba(255, 255, 255, 0.6)' }}>
                              -{((Math.abs(signal.entry_price - signal.stop_loss)) / signal.entry_price * 100).toFixed(2)}%
                            </div>
                          </div>

                          <div className="indicator">
                            <div className="indicator-label">⚖️ Risk:Reward</div>
                            <div className="indicator-value">
                              1:{signal.risk_reward.toFixed(2)}
                            </div>
                          </div>
                        </div>

                        {/* Signal Strength */}
                        <div style={{ marginTop: '15px', marginBottom: '15px' }}>
                          <div style={{ fontSize: '0.9em', marginBottom: '5px', color: 'rgba(255, 255, 255, 0.7)' }}>
                            Signal Strength: {signal.strength}/5
                          </div>
                          <div className="signal-strength">
                            {Array(5).fill('').map((_, i) => (
                              <div 
                                key={i} 
                                className={`strength-bar ${i < signal.strength ? 'filled' : ''}`}
                                style={{ background: i < signal.strength ? signalColor.border : 'rgba(255,255,255,0.1)' }}
                              ></div>
                            ))}
                          </div>
                        </div>

                        {/* ORB Levels */}
                        <div style={{
                          padding: '15px',
                          background: 'rgba(0, 0, 0, 0.3)',
                          borderRadius: '10px',
                          marginBottom: '15px'
                        }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '0.95em' }}>
                            📏 ORB Levels:
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.9em' }}>
                            <div>ORB High: ₹{signal.orb_high.toFixed(2)}</div>
                            <div>ORB Low: ₹{signal.orb_low.toFixed(2)}</div>
                            <div>Range Size: ₹{signal.range_size.toFixed(2)}</div>
                            <div>Breakout: {signal.breakout_type}</div>
                          </div>
                        </div>

                        {/* Reasons */}
                        <div style={{
                          padding: '15px',
                          background: 'rgba(0, 0, 0, 0.3)',
                          borderRadius: '10px',
                          marginBottom: '15px'
                        }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Why this signal:</div>
                          <div style={{ lineHeight: '1.8' }}>
                            {signal.reasons.map((reason: string, i: number) => (
                              <div key={i} style={{ fontSize: '0.9em' }}>
                                • {reason}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                          <button 
                            onClick={() => addToTradeWatch(signal.symbol, 'ORB Scanner', signal)}
                            style={{ 
                              flex: 1,
                              padding: '14px',
                              fontSize: '1em',
                              fontWeight: 'bold',
                              background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                              border: '2px solid rgba(79, 172, 254, 0.5)',
                              color: '#000',
                              borderRadius: '8px',
                              cursor: 'pointer'
                            }}
                          >
                            👁️ Add to Watch
                          </button>
                          <button 
                            onClick={() => {
                              setManualEntrySymbol(signal.symbol)
                              setManualEntryPrice(signal.entry_price.toString())
                              setManualEntryQuantity('')
                              setManualEntryType(signal.signal_type as 'BUY' | 'SELL')
                              alert(`✅ Pre-filled entry form with ${signal.symbol}!\n\nScroll to "Add Position Manually" and enter quantity.`)
                            }}
                            style={{ 
                              flex: 1,
                              padding: '14px',
                              fontSize: '1em',
                              fontWeight: 'bold',
                              background: signalColor.border,
                              color: '#000',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: 'pointer'
                            }}
                          >
                            🚀 Enter ({signal.signal_type})
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : isCapturingORB ? (
              <div style={{
                padding: '30px',
                textAlign: 'center',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '12px',
                border: '1px dashed rgba(255, 255, 255, 0.2)'
              }}>
                <div style={{ fontSize: '2.5em', marginBottom: '15px' }}>📊</div>
                <h3>ORB Captured - Monitoring for Breakouts</h3>
                <p style={{ color: 'rgba(255, 255, 255, 0.6)', marginBottom: '20px' }}>
                  Click "🚀 Scan for Breakouts" to check if any stock has broken out of the opening range.
                </p>
              </div>
            ) : null}

            {/* Info Box */}
            <div style={{ 
              marginTop: '25px',
              padding: '15px',
              background: 'rgba(255, 193, 7, 0.1)',
              border: '1px solid rgba(255, 193, 7, 0.3)',
              borderRadius: '10px'
            }}>
              <h4 style={{ marginBottom: '10px' }}>📚 How to Use ORB Scanner:</h4>
              <ol style={{ marginLeft: '20px', lineHeight: '1.8' }}>
                <li><strong>9:15-9:30 AM:</strong> Click "📊 Capture ORB" during first 15 minutes</li>
                <li><strong>9:30+ AM:</strong> Click "🚀 Scan for Breakouts" every 5-10 minutes</li>
                <li><strong>Entry:</strong> Enter when price breaks above High (BUY) or below Low (SELL)</li>
                <li><strong>Target:</strong> 1.5x the opening range size</li>
                <li><strong>Stop-Loss:</strong> Below breakout level (30% of range)</li>
                <li><strong>Best Results:</strong> Trending days, high volume stocks, clear breakouts</li>
              </ol>
            </div>
          </div>

          {/* Trade Watch (Smart Monitor Bucket) Section */}
          <div style={{ marginTop: '40px', borderTop: '2px solid rgba(79, 172, 254, 0.3)', paddingTop: '30px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
              <div>
                <h2 style={{ fontSize: '1.8em', marginBottom: '8px' }}>👁️ Trade Watch - Smart Monitor</h2>
                <p style={{ color: 'rgba(255, 255, 255, 0.7)', margin: 0, fontSize: '0.95em' }}>
                  Add interesting stocks here - system monitors continuously and alerts when perfect entry conditions appear
                </p>
              </div>
              <button
                onClick={clearTradeWatch}
                disabled={tradeWatch.length === 0}
                style={{
                  padding: '10px 20px',
                  fontSize: '0.9em',
                  background: 'rgba(255, 0, 100, 0.2)',
                  border: '1px solid rgba(255, 0, 100, 0.5)',
                  borderRadius: '8px',
                  cursor: tradeWatch.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: tradeWatch.length === 0 ? 0.5 : 1
                }}
              >
                🗑️ Clear All
              </button>
            </div>

            {/* Monitoring Control Panel */}
            <div style={{
              padding: '25px',
              background: 'linear-gradient(135deg, rgba(79, 172, 254, 0.15) 0%, rgba(99, 102, 241, 0.1) 100%)',
              border: '2px solid rgba(79, 172, 254, 0.4)',
              borderRadius: '12px',
              marginBottom: '25px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={isMonitoringWatch}
                      onChange={(e) => setIsMonitoringWatch(e.target.checked)}
                      disabled={tradeWatch.length === 0}
                      style={{ width: '18px', height: '18px', cursor: tradeWatch.length === 0 ? 'not-allowed' : 'pointer' }}
                    />
                    <span style={{ fontWeight: 'bold', fontSize: '15px' }}>
                      👁️ Auto-Monitor for Entry Signals
                    </span>
                  </label>
                </div>

                {isMonitoringWatch && (
                  <>
                    <div style={{ height: '20px', width: '1px', background: 'rgba(255, 255, 255, 0.3)' }} />
                    <div>
                      <label style={{ marginRight: '8px', fontSize: '14px' }}>Check Every:</label>
                      <select
                        value={watchMonitorInterval}
                        onChange={(e) => setWatchMonitorInterval(Number(e.target.value))}
                        style={{
                          padding: '6px 12px',
                          background: 'rgba(255, 255, 255, 0.1)',
                          border: '1px solid rgba(255, 255, 255, 0.3)',
                          borderRadius: '6px',
                          color: '#fff',
                          fontSize: '14px',
                          cursor: 'pointer'
                        }}
                      >
                        <option value={60} style={{ background: '#1a1a1a' }}>1 minute</option>
                        <option value={120} style={{ background: '#1a1a1a' }}>2 minutes</option>
                        <option value={180} style={{ background: '#1a1a1a' }}>3 minutes</option>
                        <option value={300} style={{ background: '#1a1a1a' }}>5 minutes</option>
                      </select>
                    </div>
                    <div style={{ height: '20px', width: '1px', background: 'rgba(255, 255, 255, 0.3)' }} />
                    <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.8)' }}>
                      ✅ Monitoring {tradeWatch.length} stock{tradeWatch.length !== 1 ? 's' : ''} - Will alert on perfect entry
                    </div>
                  </>
                )}
              </div>
              
              {!isMonitoringWatch && tradeWatch.length > 0 && (
                <div style={{ marginTop: '10px', fontSize: '13px', color: 'rgba(255, 255, 255, 0.6)' }}>
                  💡 Enable monitoring to get alerts when entry conditions become perfect (4-5/5 conditions met)
                </div>
              )}

              {tradeWatch.length === 0 && (
                <div style={{ marginTop: '10px', fontSize: '13px', color: 'rgba(255, 255, 255, 0.6)' }}>
                  💡 Add stocks from Morning Screener or ORB signals using "📊 Add to Watch" button
                </div>
              )}
            </div>

            {/* Entry Alerts (Perfect Entry Detected!) */}
            {entryAlerts.length > 0 && (
              <div style={{ marginBottom: '25px' }}>
                <h3 style={{ marginBottom: '15px', fontSize: '1.3em', color: '#00ff64' }}>
                  🚨 PERFECT ENTRY OPPORTUNITIES ({entryAlerts.length})
                </h3>
                <div style={{ display: 'grid', gap: '20px' }}>
                  {entryAlerts.map((alert, idx) => {
                    const signalColor = alert.type === 'BUY'
                      ? { bg: 'rgba(0, 255, 100, 0.2)', border: '#00ff64', text: '#00ff64' }
                      : { bg: 'rgba(255, 0, 100, 0.2)', border: '#ff0064', text: '#ff0064' }

                    return (
                      <div 
                        key={idx}
                        className="card"
                        style={{
                          background: signalColor.bg,
                          border: `3px solid ${signalColor.border}`,
                          position: 'relative',
                          animation: 'pulse 2s ease-in-out infinite'
                        }}
                      >
                        {/* Flashing Alert Badge */}
                        <div style={{
                          position: 'absolute',
                          top: '15px',
                          right: '15px',
                          padding: '10px 20px',
                          background: signalColor.border,
                          color: '#000',
                          borderRadius: '8px',
                          fontSize: '1em',
                          fontWeight: 'bold',
                          animation: 'flash 1s ease-in-out infinite'
                        }}>
                          🚨 {alert.type} NOW!
                        </div>

                        {/* Symbol */}
                        <div style={{ marginBottom: '15px' }}>
                          <h2 style={{ fontSize: '2.2em', margin: 0, marginBottom: '5px' }}>
                            {alert.symbol}
                          </h2>
                          <div style={{ 
                            fontSize: '1.2em', 
                            color: signalColor.text,
                            fontWeight: 'bold'
                          }}>
                            ✅ ALL CONDITIONS MET - PERFECT ENTRY!
                          </div>
                          <div style={{ fontSize: '0.9em', color: 'rgba(255, 255, 255, 0.6)', marginTop: '5px' }}>
                            {alert.timestamp.toLocaleTimeString()}
                          </div>
                        </div>

                        {/* Entry Details */}
                        <div className="indicators">
                          <div className="indicator">
                            <div className="indicator-label">💰 Entry NOW</div>
                            <div className="indicator-value" style={{ color: signalColor.text }}>
                              ₹{alert.entry_price.toFixed(2)}
                            </div>
                          </div>

                          <div className="indicator">
                            <div className="indicator-label">🎯 Target</div>
                            <div className="indicator-value" style={{ color: '#00ff64' }}>
                              ₹{alert.target.toFixed(2)}
                            </div>
                            <div style={{ fontSize: '0.8em', color: 'rgba(255, 255, 255, 0.6)' }}>
                              +{((alert.target - alert.entry_price) / alert.entry_price * 100).toFixed(2)}%
                            </div>
                          </div>

                          <div className="indicator">
                            <div className="indicator-label">🛑 Stop Loss</div>
                            <div className="indicator-value" style={{ color: '#ff0064' }}>
                              ₹{alert.stop_loss.toFixed(2)}
                            </div>
                            <div style={{ fontSize: '0.8em', color: 'rgba(255, 255, 255, 0.6)' }}>
                              -{((alert.entry_price - alert.stop_loss) / alert.entry_price * 100).toFixed(2)}%
                            </div>
                          </div>

                          <div className="indicator">
                            <div className="indicator-label">⚖️ Risk:Reward</div>
                            <div className="indicator-value">
                              1:{alert.risk_reward.toFixed(2)}
                            </div>
                          </div>
                        </div>

                        {/* Conditions Met */}
                        <div style={{
                          padding: '15px',
                          background: 'rgba(0, 0, 0, 0.3)',
                          borderRadius: '10px',
                          marginTop: '15px',
                          marginBottom: '15px'
                        }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '10px', fontSize: '1em' }}>
                            ✅ {alert.conditionsMet}/5 Conditions Met:
                          </div>
                          <div style={{ lineHeight: '1.8' }}>
                            {alert.reasons.map((reason: string, i: number) => (
                              <div key={i} style={{ fontSize: '0.95em' }}>
                                {reason}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button 
                            onClick={() => {
                              setManualEntrySymbol(alert.symbol)
                              setManualEntryPrice(alert.entry_price.toString())
                              setManualEntryQuantity('')
                              setManualEntryType(alert.type as 'BUY' | 'SELL')
                              removeFromTradeWatch(alert.symbol)
                              alert(`✅ Pre-filled entry form!\n\nScroll to "Add Position Manually" and enter quantity.`)
                            }}
                            style={{ 
                              flex: 1,
                              padding: '16px',
                              fontSize: '1.2em',
                              fontWeight: 'bold',
                              background: signalColor.border,
                              color: '#000',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: 'pointer'
                            }}
                          >
                            🚀 ENTER NOW ({alert.type})
                          </button>
                          <button 
                            onClick={() => {
                              setEntryAlerts(entryAlerts.filter((_, i) => i !== idx))
                              alert('✅ Alert dismissed')
                            }}
                            style={{ 
                              padding: '16px 20px',
                              fontSize: '1em',
                              background: 'rgba(255, 255, 255, 0.1)',
                              border: '1px solid rgba(255, 255, 255, 0.3)',
                              borderRadius: '8px',
                              cursor: 'pointer'
                            }}
                          >
                            ✖️
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Trade Watch List */}
            {tradeWatch.length > 0 ? (
              <div>
                <h3 style={{ marginBottom: '15px', fontSize: '1.2em' }}>
                  📊 Watching ({tradeWatch.length})
                </h3>
                <div style={{ display: 'grid', gap: '15px' }}>
                  {tradeWatch.map((watchItem, idx) => {
                    const priceChangeColor = watchItem.priceChange >= 0 ? '#00ff64' : '#ff0064'
                    const conditionsProgress = (watchItem.conditionsMet / 5) * 100

                    return (
                      <div 
                        key={idx}
                        style={{
                          padding: '20px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: `2px solid ${conditionsProgress >= 80 ? '#00ff64' : 'rgba(255, 255, 255, 0.2)'}`,
                          borderRadius: '12px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
                          <div>
                            <h3 style={{ fontSize: '1.5em', margin: 0, marginBottom: '5px' }}>
                              {watchItem.symbol}
                            </h3>
                            <div style={{ fontSize: '0.85em', color: 'rgba(255, 255, 255, 0.6)' }}>
                              Added from: {watchItem.addedFrom} • Expected: {watchItem.expectedType}
                            </div>
                          </div>
                          <button
                            onClick={() => removeFromTradeWatch(watchItem.symbol)}
                            style={{
                              padding: '8px 16px',
                              fontSize: '0.9em',
                              background: 'rgba(255, 0, 100, 0.2)',
                              border: '1px solid rgba(255, 0, 100, 0.5)',
                              borderRadius: '6px',
                              cursor: 'pointer'
                            }}
                          >
                            ✖️ Remove
                          </button>
                        </div>

                        {/* Price Info */}
                        <div style={{ marginBottom: '15px' }}>
                          <div style={{ fontSize: '1.8em', fontWeight: 'bold' }}>
                            ₹{watchItem.currentPrice.toFixed(2)}
                          </div>
                          <div style={{ fontSize: '0.95em', color: priceChangeColor }}>
                            {watchItem.priceChange >= 0 ? '+' : ''}{watchItem.priceChange?.toFixed(2)}% from add price
                          </div>
                        </div>

                        {/* Conditions Progress */}
                        <div style={{ marginBottom: '10px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                            <span style={{ fontSize: '0.9em', fontWeight: 'bold' }}>
                              Entry Conditions: {watchItem.conditionsMet}/5
                            </span>
                            <span style={{ fontSize: '0.9em', color: conditionsProgress >= 80 ? '#00ff64' : 'rgba(255, 255, 255, 0.7)' }}>
                              {conditionsProgress.toFixed(0)}%
                            </span>
                          </div>
                          <div style={{
                            width: '100%',
                            height: '10px',
                            background: 'rgba(255, 255, 255, 0.1)',
                            borderRadius: '5px',
                            overflow: 'hidden'
                          }}>
                            <div style={{
                              width: `${conditionsProgress}%`,
                              height: '100%',
                              background: conditionsProgress >= 80 ? '#00ff64' : '#4facfe',
                              transition: 'width 0.5s ease'
                            }} />
                          </div>
                        </div>

                        {/* Individual Conditions */}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(5, 1fr)',
                          gap: '8px',
                          fontSize: '0.85em'
                        }}>
                          <div style={{ textAlign: 'center', color: watchItem.conditions?.momentum ? '#00ff64' : 'rgba(255, 255, 255, 0.5)' }}>
                            {watchItem.conditions?.momentum ? '✅' : '⏳'} Momentum
                          </div>
                          <div style={{ textAlign: 'center', color: watchItem.conditions?.volume ? '#00ff64' : 'rgba(255, 255, 255, 0.5)' }}>
                            {watchItem.conditions?.volume ? '✅' : '⏳'} Volume
                          </div>
                          <div style={{ textAlign: 'center', color: watchItem.conditions?.rsi ? '#00ff64' : 'rgba(255, 255, 255, 0.5)' }}>
                            {watchItem.conditions?.rsi ? '✅' : '⏳'} RSI
                          </div>
                          <div style={{ textAlign: 'center', color: watchItem.conditions?.vwap ? '#00ff64' : 'rgba(255, 255, 255, 0.5)' }}>
                            {watchItem.conditions?.vwap ? '✅' : '⏳'} VWAP
                          </div>
                          <div style={{ textAlign: 'center', color: watchItem.conditions?.support ? '#00ff64' : 'rgba(255, 255, 255, 0.5)' }}>
                            {watchItem.conditions?.support ? '✅' : '⏳'} Level
                          </div>
                        </div>

                        {/* Last Checked */}
                        <div style={{ marginTop: '10px', fontSize: '0.8em', color: 'rgba(255, 255, 255, 0.5)' }}>
                          Last checked: {watchItem.lastChecked?.toLocaleTimeString()}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div style={{
                padding: '40px',
                textAlign: 'center',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '12px',
                border: '1px dashed rgba(255, 255, 255, 0.2)'
              }}>
                <div style={{ fontSize: '3em', marginBottom: '15px' }}>👁️</div>
                <h3 style={{ marginBottom: '10px' }}>No Stocks in Trade Watch</h3>
                <p style={{ color: 'rgba(255, 255, 255, 0.6)', marginBottom: '20px', maxWidth: '600px', margin: '0 auto 20px' }}>
                  Add stocks from Morning Screener or ORB signals that you're interested in but not ready to enter yet.
                  System will monitor them and alert you when ALL entry conditions become perfect!
                </p>
              </div>
            )}

            {/* Info Box */}
            <div style={{ 
              marginTop: '25px',
              padding: '15px',
              background: 'rgba(79, 172, 254, 0.1)',
              border: '1px solid rgba(79, 172, 254, 0.3)',
              borderRadius: '10px'
            }}>
              <h4 style={{ marginBottom: '10px' }}>📚 How Trade Watch Works:</h4>
              <ol style={{ marginLeft: '20px', lineHeight: '1.8' }}>
                <li><strong>Morning:</strong> Run screeners → See interesting stocks → Click "📊 Add to Watch"</li>
                <li><strong>Auto-Monitor:</strong> System checks every 1-5 minutes for perfect entry conditions</li>
                <li><strong>Entry Conditions:</strong> Momentum, Volume, RSI, VWAP, Support (needs 4-5/5)</li>
                <li><strong>Alert:</strong> When conditions met → 🚨 Flashing card appears + browser notification</li>
                <li><strong>Enter:</strong> One-click to pre-fill entry form → Add quantity → Execute!</li>
                <li><strong>Benefits:</strong> No manual checking, never miss perfect entries, focus on your work!</li>
              </ol>
            </div>
          </div>

          {/* Position Tracking Section */}
          <div style={{ marginTop: '40px', borderTop: '2px solid rgba(255, 255, 255, 0.1)', paddingTop: '30px' }}>
            <h2 style={{ fontSize: '1.8em', marginBottom: '20px' }}>📊 Position Tracking</h2>

            {/* P&L Summary Banner */}
            <div style={{
              padding: '20px',
              background: totalPnL >= 0 
                ? 'linear-gradient(135deg, rgba(0, 255, 100, 0.2) 0%, rgba(0, 200, 80, 0.1) 100%)'
                : 'linear-gradient(135deg, rgba(255, 0, 100, 0.2) 0%, rgba(200, 0, 80, 0.1) 100%)',
              border: `2px solid ${totalPnL >= 0 ? '#00ff64' : '#ff0064'}`,
              borderRadius: '12px',
              marginBottom: '25px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ fontSize: '0.9em', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '5px' }}>
                  Today's Total P&L
                </div>
                <div style={{ 
                  fontSize: '2.2em', 
                  fontWeight: 'bold',
                  color: totalPnL >= 0 ? '#00ff64' : '#ff0064'
                }}>
                  {totalPnL >= 0 ? '+' : ''}₹{Number(totalPnL).toFixed(2)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.9em', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '5px' }}>
                  Open Positions
                </div>
                <div style={{ fontSize: '1.8em', fontWeight: 'bold' }}>
                  {intradayPositions.length}
                </div>
              </div>
            </div>

            {/* Manual Position Entry Form */}
            <div style={{
              padding: '20px',
              background: 'rgba(79, 172, 254, 0.1)',
              border: '1px solid rgba(79, 172, 254, 0.3)',
              borderRadius: '12px',
              marginBottom: '25px'
            }}>
              <h4 style={{ marginBottom: '15px', fontSize: '1.1em' }}>📝 Enter Position Manually</h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: '10px', alignItems: 'end' }}>
                {/* Symbol Input */}
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9em' }}>
                    Symbol
                  </label>
                  <input
                    type="text"
                    value={manualEntrySymbol}
                    onChange={(e) => setManualEntrySymbol(e.target.value.toUpperCase())}
                    placeholder="e.g., RELIANCE"
                    style={{
                      width: '100%',
                      padding: '10px',
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '6px',
                      color: '#fff',
                      fontSize: '14px'
                    }}
                  />
                </div>

                {/* Entry Price */}
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9em' }}>
                    Entry Price
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={manualEntryPrice}
                    onChange={(e) => setManualEntryPrice(e.target.value)}
                    placeholder="₹"
                    style={{
                      width: '100%',
                      padding: '10px',
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '6px',
                      color: '#fff',
                      fontSize: '14px'
                    }}
                  />
                </div>

                {/* Quantity */}
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9em' }}>
                    Quantity
                  </label>
                  <input
                    type="number"
                    value={manualEntryQuantity}
                    onChange={(e) => setManualEntryQuantity(e.target.value)}
                    placeholder="Qty"
                    style={{
                      width: '100%',
                      padding: '10px',
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '6px',
                      color: '#fff',
                      fontSize: '14px'
                    }}
                  />
                </div>

                {/* Buy/Sell Toggle */}
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9em' }}>
                    Type
                  </label>
                  <select
                    value={manualEntryType}
                    onChange={(e) => setManualEntryType(e.target.value as 'BUY' | 'SELL')}
                    style={{
                      width: '100%',
                      padding: '10px',
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '6px',
                      color: '#fff',
                      fontSize: '14px'
                    }}
                  >
                    <option value="BUY" style={{ background: '#1a1a1a' }}>BUY</option>
                    <option value="SELL" style={{ background: '#1a1a1a' }}>SELL</option>
                  </select>
                </div>

                {/* Submit Button */}
                <button
                  onClick={handleManualEntry}
                  disabled={!manualEntrySymbol || !manualEntryPrice || !manualEntryQuantity}
                  style={{
                    padding: '10px 20px',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    background: manualEntryType === 'BUY' 
                      ? 'linear-gradient(135deg, #00ff64 0%, #00cc50 100%)'
                      : 'linear-gradient(135deg, #ff0064 0%, #cc0050 100%)',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#000',
                    cursor: !manualEntrySymbol || !manualEntryPrice || !manualEntryQuantity ? 'not-allowed' : 'pointer',
                    opacity: !manualEntrySymbol || !manualEntryPrice || !manualEntryQuantity ? 0.5 : 1
                  }}
                >
                  {manualEntryType === 'BUY' ? '📈 BUY' : '📉 SELL'}
                </button>
              </div>
            </div>

            {/* Auto-Refresh Controls */}
            <div style={{
              padding: '20px',
              background: 'rgba(79, 172, 254, 0.1)',
              border: '2px solid rgba(79, 172, 254, 0.3)',
              borderRadius: '12px',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={autoRefreshIntraday}
                      onChange={(e) => setAutoRefreshIntraday(e.target.checked)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <span style={{ fontWeight: 'bold', fontSize: '15px' }}>
                      🤖 Auto-Monitor Positions
                    </span>
                  </label>
                </div>

                {autoRefreshIntraday && (
                  <>
                    <div style={{ height: '20px', width: '1px', background: 'rgba(255, 255, 255, 0.3)' }} />
                    <div>
                      <label style={{ marginRight: '8px', fontSize: '14px' }}>Update Every:</label>
                      <select
                        value={autoRefreshInterval}
                        onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
                        style={{
                          padding: '6px 12px',
                          background: 'rgba(255, 255, 255, 0.1)',
                          border: '1px solid rgba(255, 255, 255, 0.3)',
                          borderRadius: '6px',
                          color: '#fff',
                          fontSize: '14px',
                          cursor: 'pointer'
                        }}
                      >
                        <option value={30} style={{ background: '#1a1a1a' }}>30 seconds</option>
                        <option value={60} style={{ background: '#1a1a1a' }}>1 minute</option>
                        <option value={120} style={{ background: '#1a1a1a' }}>2 minutes</option>
                        <option value={300} style={{ background: '#1a1a1a' }}>5 minutes</option>
                      </select>
                    </div>
                    <div style={{ height: '20px', width: '1px', background: 'rgba(255, 255, 255, 0.3)' }} />
                    <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.8)' }}>
                      ✅ Monitoring active - Exit signals will show automatically
                    </div>
                  </>
                )}
              </div>
              
              {!autoRefreshIntraday && (
                <div style={{ marginTop: '10px', fontSize: '13px', color: 'rgba(255, 255, 255, 0.6)' }}>
                  💡 Enable to get real-time exit alerts based on targets, stop-loss, and momentum shifts
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '25px' }}>
              <button 
                onClick={addMockPositions}
                disabled={intradayPositions.length > 0}
                style={{ 
                  flex: 1,
                  padding: '12px',
                  fontSize: '15px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  border: '2px solid rgba(102, 126, 234, 0.5)'
                }}
              >
                🎭 Add Mock Positions (Test)
              </button>
              <button 
                onClick={updatePositionPrices}
                disabled={intradayPositions.length === 0 || !authStatus.authenticated || isLoading}
                style={{ 
                  flex: 1,
                  padding: '12px',
                  fontSize: '15px',
                  background: 'rgba(79, 172, 254, 0.2)',
                  border: '1px solid rgba(79, 172, 254, 0.5)',
                  opacity: (intradayPositions.length === 0 || !authStatus.authenticated || isLoading) ? 0.5 : 1
                }}
              >
                {isLoading ? '⏳ Updating...' : '🔄 Update Prices'}
              </button>
              <button 
                onClick={clearAllPositions}
                disabled={intradayPositions.length === 0}
                style={{ 
                  flex: 1,
                  padding: '12px',
                  fontSize: '15px',
                  background: 'rgba(255, 0, 100, 0.2)',
                  border: '1px solid rgba(255, 0, 100, 0.5)'
                }}
              >
                🗑️ Close All
              </button>
            </div>

            {/* Open Positions */}
            {intradayPositions.length === 0 ? (
              <div style={{
                padding: '40px',
                textAlign: 'center',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '12px',
                border: '1px dashed rgba(255, 255, 255, 0.2)'
              }}>
                <div style={{ fontSize: '3em', marginBottom: '15px' }}>📊</div>
                <h3 style={{ marginBottom: '10px' }}>No Open Positions</h3>
                <p style={{ color: 'rgba(255, 255, 255, 0.6)', marginBottom: '20px' }}>
                  Add mock positions to see the tracker in action, or enter real trades when the market opens.
                </p>
                <button 
                  onClick={addMockPositions}
                  style={{ 
                    padding: '12px 24px',
                    fontSize: '15px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    border: '2px solid rgba(102, 126, 234, 0.5)'
                  }}
                >
                  🎭 Try Demo Positions
                </button>
              </div>
            ) : (
              <table className="screener-table" style={{ width: '100%' }}>
                    <thead>
                        <tr>
                    <th>Type</th>
                            <th>Symbol</th>
                    <th>Entry Price</th>
                    <th>Current Price</th>
                    <th>Qty</th>
                    <th>Total Value</th>
                    <th>P&L</th>
                    <th>Time</th>
                    <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                  {intradayPositions.map((position, idx) => {
                    const pnlColor = Number(position.pnl || 0) >= 0 ? 'positive' : 'negative'
                    const pnlValue = Number(position.pnl || 0)
                    const pnlPercent = Number(position.pnl_percent || 0)
                    const timeHeld = Math.floor((Date.now() - position.entry_time.getTime()) / 1000 / 60)
                    const exitSignal = exitSignals[position.symbol]

                    return (
                      <React.Fragment key={idx}>
                      <tr>
                        {/* Type Badge */}
                        <td>
                          <span style={{
                            padding: '4px 10px',
                            background: position.type === 'BUY' ? '#00ff64' : '#ff0064',
                            color: '#000',
                            borderRadius: '6px',
                            fontSize: '0.85em',
                            fontWeight: 'bold',
                            display: 'inline-block'
                          }}>
                            {position.type}
                          </span>
                        </td>

                        {/* Symbol */}
                        <td><strong>{position.symbol}</strong></td>

                        {/* Entry Price */}
                        <td>₹{position.entry_price.toFixed(2)}</td>

                        {/* Current Price */}
                        <td>₹{position.current_price.toFixed(2)}</td>

                        {/* Quantity */}
                        <td>{position.quantity}</td>

                        {/* Total Value */}
                        <td>₹{(position.current_price * position.quantity).toFixed(2)}</td>

                        {/* P&L */}
                        <td className={pnlColor}>
                          <strong>
                            {pnlValue >= 0 ? '+' : ''}₹{pnlValue.toFixed(2)}
                          </strong>
                          <br />
                          <span style={{ fontSize: '0.85em' }}>
                            ({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%)
                          </span>
                        </td>

                        {/* Time Held */}
                        <td style={{ fontSize: '0.9em' }}>{timeHeld}m ago</td>

                        {/* Close Button */}
                        <td>
                          <button 
                            onClick={() => exitPosition(position.symbol)}
                            style={{
                              padding: '6px 12px',
                              fontSize: '0.9em',
                              fontWeight: 'bold',
                              background: pnlValue >= 0 ? '#00ff64' : '#ff0064',
                              color: '#000',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer'
                            }}
                          >
                            Close
                          </button>
                        </td>
                      </tr>

                      {/* Exit Signal Alert Row */}
                      {exitSignal && (
                        <tr style={{ 
                          background: exitSignal.strength >= 4 
                            ? 'rgba(255, 0, 100, 0.2)' 
                            : 'rgba(255, 193, 7, 0.2)',
                          borderLeft: `4px solid ${exitSignal.strength >= 4 ? '#ff0064' : '#ffc107'}`
                        }}>
                          <td colSpan={9} style={{ padding: '15px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                              <div style={{ fontSize: '1.5em' }}>
                                {exitSignal.strength >= 4 ? '🚨' : '⚠️'}
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 'bold', marginBottom: '5px', fontSize: '1.05em' }}>
                                  {exitSignal.strength >= 4 ? '🚨 STRONG EXIT SIGNAL' : '⚠️ Consider Exit'}
                                </div>
                                <div style={{ fontSize: '0.9em', color: 'rgba(255, 255, 255, 0.8)' }}>
                                  {exitSignal.reasons.join(' • ')}
                                </div>
                              </div>
                              <button
                                onClick={() => exitPosition(position.symbol)}
                                style={{
                                  padding: '10px 20px',
                                  fontSize: '0.95em',
                                  fontWeight: 'bold',
                                  background: exitSignal.strength >= 4 ? '#ff0064' : '#ffc107',
                                  color: '#000',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {exitSignal.strength >= 4 ? '🚨 EXIT NOW' : '⚠️ EXIT POSITION'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            )}

            {/* Info Box */}
            <div style={{ 
              marginTop: '25px',
              padding: '15px',
              background: 'rgba(255, 193, 7, 0.1)',
              border: '1px solid rgba(255, 193, 7, 0.3)',
              borderRadius: '10px'
            }}>
              <h4 style={{ marginBottom: '10px' }}>💡 Position Tracking Tips:</h4>
              <ul style={{ marginLeft: '20px', lineHeight: '1.8' }}>
                <li><strong>Update Prices:</strong> Click "Update Prices" to fetch live P&L</li>
                <li><strong>Auto-refresh:</strong> Coming in next update (every 30 seconds)</li>
                <li><strong>Exit Strategy:</strong> Close positions at target or stop-loss</li>
                <li><strong>End of Day:</strong> All positions should be closed by 3:15 PM</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        ${require('./styles').default}
      `}</style>
    </div>
  )
}
