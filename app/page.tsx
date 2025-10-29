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
import {
  analyzeHistoricalPatterns,
  generateStockIntelligence,
  analyzeMarketClose,
  sleep,
  type DailyCandle,
  type StockIntelligence,
  type MarketCloseAnalysis
} from '@/lib/pattern-analysis'
import {
  calculateFundamentalScore,
  getCombinedSignal,
  formatLargeNumber,
  getCompanySize,
  type FundamentalData,
  type FundamentalScore
} from '@/lib/fundamentals-utils'
import {
  generateCombinedIntelligence,
  type CombinedIntelligence
} from '@/lib/combined-intelligence'

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
  const [activeTab, setActiveTab] = useState<'watchlist' | 'screener' | 'signals' | 'intraday' | 'universe' | 'fundamentals' | 'market'>('watchlist')
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
  
  // NIFTY 50 stocks for ORB Scanner
  const NIFTY_50_STOCKS = [
    'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
    'HINDUNILVR', 'ITC', 'SBIN', 'BHARTIARTL', 'KOTAKBANK',
    'LT', 'AXISBANK', 'ASIANPAINT', 'MARUTI', 'BAJFINANCE',
    'HCLTECH', 'WIPRO', 'ULTRACEMCO', 'NTPC', 'SUNPHARMA',
    'TITAN', 'NESTLEIND', 'POWERGRID', 'M&M', 'TATAMOTORS',
    'TECHM', 'BAJAJFINSV', 'ADANIPORTS', 'ONGC', 'TATASTEEL',
    'COALINDIA', 'JSWSTEEL', 'INDUSINDBK', 'SBILIFE', 'DRREDDY',
    'DIVISLAB', 'CIPLA', 'GRASIM', 'HINDALCO', 'BRITANNIA',
    'EICHERMOT', 'HEROMOTOCO', 'UPL', 'BPCL', 'SHREECEM',
    'TATACONSUM', 'APOLLOHOSP', 'ADANIENT', 'VEDL', 'BAJAJ-AUTO'
  ]
  
  // Opening Range Breakout (ORB) states
  const [orbRanges, setOrbRanges] = useState<Record<string, { high: number; low: number; open: number; rangeCaptured: boolean; timestamp: Date }>>({})
  const [orbSignals, setOrbSignals] = useState<any[]>([])
  const [isCapturingORB, setIsCapturingORB] = useState(false)
  const [orbWatchlist, setOrbWatchlist] = useState<string[]>(NIFTY_50_STOCKS) // Now scanning all NIFTY 50!
  
  // Trade Watch (Smart Monitor Bucket) states
  const [tradeWatch, setTradeWatch] = useState<any[]>([])
  const [entryAlerts, setEntryAlerts] = useState<any[]>([])
  const [isMonitoringWatch, setIsMonitoringWatch] = useState(false)
  const [watchMonitorInterval, setWatchMonitorInterval] = useState(120) // 2 minutes default
  
  // Universe Scanner states
  const [universeScans, setUniverseScans] = useState<any[]>([])
  const [isScanningUniverse, setIsScanningUniverse] = useState(false)
  const [scanResults, setScanResults] = useState<any[]>([])
  const [selectedSector, setSelectedSector] = useState<string>('All')
  const [minVolume, setMinVolume] = useState(100000) // 1 lakh minimum volume
  const [minGapPercent, setMinGapPercent] = useState(0.5) // 0.5% gap minimum
  const [scanProgress, setScanProgress] = useState(0)
  
  // Market Close Analysis states
  const [marketCloseAnalysis, setMarketCloseAnalysis] = useState<MarketCloseAnalysis | null>(null)
  const [isAnalyzingClose, setIsAnalyzingClose] = useState(false)
  
  // Fundamentals states
  const [fundamentalData, setFundamentalData] = useState<FundamentalData | null>(null)
  const [fundamentalScore, setFundamentalScore] = useState<FundamentalScore | null>(null)
  const [fundamentalSymbol, setFundamentalSymbol] = useState('')
  const [fundamentalExchange, setFundamentalExchange] = useState<'NSE' | 'BSE'>('NSE')
  const [isFetchingFundamentals, setIsFetchingFundamentals] = useState(false)
  
  // News states
  const [stockNews, setStockNews] = useState<any[]>([])
  const [marketNews, setMarketNews] = useState<any[]>([])
  const [isFetchingNews, setIsFetchingNews] = useState(false)
  const [newsTab, setNewsTab] = useState<'stock' | 'market' | 'multi'>('multi')
  const [stockSentiment, setStockSentiment] = useState<any>(null)
  const [marketSentiment, setMarketSentiment] = useState<any>(null)
  const [multiLayerNews, setMultiLayerNews] = useState<any>(null)
  
  // Combined Intelligence state
  const [combinedIntelligence, setCombinedIntelligence] = useState<CombinedIntelligence | null>(null)
  
  // Market Dashboard states
  const [marketDashboard, setMarketDashboard] = useState<any>(null)
  const [isFetchingMarketDashboard, setIsFetchingMarketDashboard] = useState(false)
  
  // Manual position entry
  const [manualEntrySymbol, setManualEntrySymbol] = useState('')
  const [manualEntryPrice, setManualEntryPrice] = useState('')
  const [manualEntryQuantity, setManualEntryQuantity] = useState('')
  const [manualEntryType, setManualEntryType] = useState<'BUY' | 'SELL'>('BUY')

  // 🗄️ DATABASE: Load watchlist from database on mount
  useEffect(() => {
    if (!authStatus.authenticated) return
    
    async function loadWatchlistFromDB() {
      try {
        console.log('🗄️ Loading watchlist from database...')
        const response = await fetch('/api/watchlist')
        const result = await response.json()
        
        if (result.success && result.watchlist.length > 0) {
          const symbols = result.watchlist.map((item: any) => item.symbol)
          setWatchlist(symbols)
          console.log(`✅ Loaded ${symbols.length} stocks from database:`, symbols.join(', '))
        } else {
          console.log('ℹ️ No watchlist found in database, using defaults')
        }
      } catch (error) {
        console.error('❌ Error loading watchlist from database:', error)
      }
    }
    
    loadWatchlistFromDB()
  }, [authStatus.authenticated])

  // 🗄️ DATABASE: Load positions from database on mount
  useEffect(() => {
    if (!authStatus.authenticated) return
    
    async function loadPositionsFromDB() {
      try {
        console.log('🗄️ Loading positions from database...')
        const response = await fetch('/api/positions')
        const result = await response.json()
        
        if (result.success && result.positions.length > 0) {
          // Convert DB format to frontend Position format
          const loadedPositions = result.positions.map((pos: any) => ({
            symbol: pos.symbol,
            type: pos.positionType,
            entry_price: pos.entryPrice,
            current_price: pos.currentPrice,
            quantity: pos.quantity,
            entry_time: new Date(pos.entryTime),
            target: pos.target,
            stop_loss: pos.stopLoss,
            pnl: pos.pnl,
            pnl_percent: pos.pnlPercent,
            status: 'open',
            _dbId: pos.id // Store DB ID for updates
          }))
          
          setIntradayPositions(loadedPositions)
          
          // Calculate total P&L
          const totalPnL = loadedPositions.reduce((sum: number, pos: any) => sum + Number(pos.pnl || 0), 0)
          setTotalPnL(totalPnL)
          
          console.log(`✅ Loaded ${loadedPositions.length} positions from database`)
        } else {
          console.log('ℹ️ No positions found in database')
        }
      } catch (error) {
        console.error('❌ Error loading positions from database:', error)
      }
    }
    
    loadPositionsFromDB()
  }, [authStatus.authenticated])

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
    
    // Auto-load yesterday's market close analysis
    const savedAnalysis = localStorage.getItem('marketCloseAnalysis')
    const savedDate = localStorage.getItem('marketCloseDate')
    
    if (savedAnalysis && savedDate) {
      try {
        const analysis = JSON.parse(savedAnalysis)
        const analysisDate = new Date(savedDate)
        const today = new Date()
        const daysDiff = Math.floor((today.getTime() - analysisDate.getTime()) / (1000 * 60 * 60 * 24))
        
        // Only auto-load if less than 2 days old
        if (daysDiff <= 2) {
          setMarketCloseAnalysis(analysis)
          console.log(`✅ Auto-loaded market analysis from ${analysisDate.toLocaleDateString()}`)
        }
      } catch (err) {
        console.error('Error auto-loading analysis:', err)
      }
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

  // Calculate Combined Intelligence when we have all data
  useEffect(() => {
    if (!fundamentalData || !fundamentalScore || !multiLayerNews) {
      setCombinedIntelligence(null)
      return
    }

    // Check if we have technical data for this stock
    const technicalData = stockData[fundamentalData.symbol]
    if (!technicalData) {
      console.log(`⏳ Waiting for technical data for ${fundamentalData.symbol}...`)
      setCombinedIntelligence(null)
      return
    }

    console.log(`🧠 Calculating Combined Intelligence for ${fundamentalData.symbol}...`)

    // Generate trading signal from technical data
    const technicalSignal = generateTradingSignal(
      technicalData.current,
      technicalData.prices,
      technicalData.volumes
    )

    // Prepare data for combined intelligence
    const technical = {
      signal: technicalSignal.signal as any,
      reason: technicalSignal.reason
    }

    const fundamental = {
      pe: fundamentalData.peRatio,
      roe: fundamentalData.roe,
      debtToEquity: fundamentalData.debtToEquity,
      marketCap: fundamentalData.marketCap
    }

    const sentiment = {
      dayTradingSignal: multiLayerNews.dayTradingSignal,
      combinedSentiment: multiLayerNews.combinedSentiment
    }

    // Generate combined intelligence
    const intelligence = generateCombinedIntelligence(technical, fundamental, sentiment)
    setCombinedIntelligence(intelligence)

    console.log(`✅ Combined Intelligence: ${intelligence.scenario} (${intelligence.overallSignal})`)
  }, [fundamentalData, fundamentalScore, multiLayerNews, stockData])

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
      console.log(`📊 Fetching historical for ${symbol} (token: ${quote.instrument_token})`)
      
      const historicalRes = await fetch(
        `/api/kite/historical?instrument_token=${quote.instrument_token}&interval=day`
      )
      
      let prices: number[] = []
      let volumes: number[] = []
      
      if (historicalRes.ok) {
        const histData = await historicalRes.json()
        const candles = histData.candles || histData.data || []
        
        console.log(`📈 ${symbol}: Received ${candles.length} candles`)
        
        // Kite returns objects {date, open, high, low, close, volume}
        if (candles.length > 0) {
          prices = candles.map((d: any) => d.close).reverse()
          volumes = candles.map((d: any) => d.volume).reverse()
          console.log(`✅ ${symbol}: Parsed ${prices.length} prices, ${volumes.length} volumes`)
        } else {
          console.warn(`⚠️ ${symbol}: No historical data available (candles array is empty)`)
        }
      } else {
        console.error(`❌ ${symbol}: Failed to fetch historical data (${historicalRes.status})`)
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

          async function addStock() {
    const symbol = stockInput.trim().toUpperCase()
            
            if (!symbol) {
      alert('Please enter a stock symbol')
      return
            }
            
            if (watchlist.includes(symbol)) {
      alert('Stock already in watchlist')
      return
    }
    
    // 🗄️ DATABASE: Save to database if authenticated
    if (authStatus.authenticated) {
      try {
        console.log(`🗄️ Adding ${symbol} to database...`)
        const response = await fetch('/api/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol, exchange })
        })
        
        const result = await response.json()
        
        if (!result.success) {
          alert(result.error || 'Failed to add to watchlist')
          return
        }
        
        console.log(`✅ Added ${symbol} to database`)
      } catch (error) {
        console.error('❌ Error adding to watchlist:', error)
        alert('Failed to add stock to watchlist')
        return
      }
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

  async function removeFromWatchlist(symbol: string) {
    // 🗄️ DATABASE: Remove from database if authenticated
    if (authStatus.authenticated) {
      try {
        console.log(`🗄️ Removing ${symbol} from database...`)
        const response = await fetch('/api/watchlist', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol, exchange })
        })
        
        const result = await response.json()
        
        if (!result.success) {
          console.error('Failed to remove from database:', result.error)
        } else {
          console.log(`✅ Removed ${symbol} from database`)
        }
      } catch (error) {
        console.error('❌ Error removing from watchlist:', error)
      }
    }
    
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
  async function enterPosition(symbol: string, entryPrice: number, quantity: number, type: 'BUY' | 'SELL') {
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
    
    // 🗄️ DATABASE: Save to database if authenticated
    if (authStatus.authenticated) {
      try {
        console.log(`🗄️ Saving position ${symbol} to database...`)
        const response = await fetch('/api/positions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol,
            exchange,
            entryPrice,
            quantity,
            positionType: type,
            stopLoss: newPosition.stop_loss,
            target: newPosition.target
          })
        })
        
        const result = await response.json()
        
        if (result.success) {
          // Add DB ID to position for future updates
          (newPosition as any)._dbId = result.position.id
          console.log(`✅ Position saved to database with ID ${result.position.id}`)
        } else {
          console.error('Failed to save position:', result.error)
        }
      } catch (error) {
        console.error('❌ Error saving position to database:', error)
      }
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

  async function exitPosition(symbol: string) {
    const position = intradayPositions.find(p => p.symbol === symbol)
    if (!position) return

    const pnl = position.pnl || 0
    
    // 🗄️ DATABASE: Close position in database if authenticated
    if (authStatus.authenticated && (position as any)._dbId) {
      try {
        console.log(`🗄️ Closing position ${symbol} in database...`)
        const response = await fetch(`/api/positions?id=${(position as any)._dbId}`, {
          method: 'DELETE'
        })
        
        const result = await response.json()
        
        if (result.success) {
          console.log(`✅ Position ${symbol} closed in database`)
        } else {
          console.error('Failed to close position:', result.error)
        }
      } catch (error) {
        console.error('❌ Error closing position in database:', error)
      }
    }
    
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

  // ========== UNIVERSE SCANNER FUNCTIONS ==========

  // Scan NIFTY 500 for best intraday candidates (WITH HISTORICAL ANALYSIS)
  async function scanUniverse() {
    setIsScanningUniverse(true)
    setIsLoading(true)
    setScanProgress(0)

    try {
      console.log('🔍 Scanning NIFTY 500 universe with historical analysis...')

      // Fetch universe stocks
      const universeResponse = await fetch('/api/kite/universe')
      if (!universeResponse.ok) throw new Error('Failed to fetch universe')
      
      const universeData = await universeResponse.json()
      const stocks = universeData.data || []

      console.log(`📊 Fetched ${stocks.length} stocks from universe`)

      // Analyze each stock with rate limiting
      const results: any[] = []
      const totalStocks = Math.min(stocks.length, 150) // Try 150 stocks (more attempts = better chance of success)
      
      console.log(`🔄 Starting analysis of ${totalStocks} stocks...`)
      
      let successCount = 0
      let failCount = 0
      
      for (let i = 0; i < totalStocks; i++) {
        const stock = stocks[i]
        
        try {
          // Rate limiting: 150ms delay between requests (faster but still safe)
          if (i > 0) await sleep(150)
          
          // Fetch current quote
          console.log(`📊 [${i + 1}/${totalStocks}] Analyzing ${stock.tradingsymbol}...`)
          const data = await fetchStockQuote(stock.tradingsymbol)
          
          if (!data) {
            console.warn(`⚠️ ${stock.tradingsymbol}: No quote data available`)
            failCount++
            continue
          }
          
          // Fetch historical data (last 10 days)
          const historicalResponse = await fetch(
            `/api/kite/historical?instrument_token=${data.instrumentToken}&interval=day`
          )
          
          if (!historicalResponse.ok) {
            console.warn(`⚠️ ${stock.tradingsymbol}: Failed to fetch historical (${historicalResponse.status})`)
            failCount++
            continue
          }
          
          const historicalData = await historicalResponse.json()
          const candles = historicalData.candles || historicalData.data || []
          
          console.log(`📈 ${stock.tradingsymbol}: Received ${candles.length} historical candles`)
          
          if (historicalData.meta) {
            console.log(`   From: ${historicalData.meta.from?.split('T')[0]}, To: ${historicalData.meta.to?.split('T')[0]}`)
          }
          
          // FALLBACK MODE: If no historical data, use current day data
          let intelligence: any
          let pattern: any
          
          if (candles.length < 2) {
            console.log(`ℹ️ ${stock.tradingsymbol}: No historical data (${candles.length} days) - using current day analysis`)
            
            // Generate recommendation based ONLY on current day's data
            const gap = ((data.current - data.open) / data.open) * 100
            const dayRange = ((data.dayHigh - data.dayLow) / data.open) * 100
            const volumeScore = data.volume >= minVolume ? 1 : 0
            
            // Simple scoring without historical patterns
            let score = 0
            const reasons: string[] = []
            let recommendation: 'STRONG_BUY' | 'BUY' | 'WATCH' | 'SKIP' = 'WATCH'
            
            // Gap analysis
            if (Math.abs(gap) >= 1.5) {
              score += 30
              reasons.push(`Strong gap: ${gap > 0 ? '+' : ''}${gap.toFixed(2)}%`)
              if (Math.abs(gap) >= 2.5) recommendation = 'BUY'
            } else if (Math.abs(gap) >= 0.5) {
              score += 15
              reasons.push(`Moderate gap: ${gap > 0 ? '+' : ''}${gap.toFixed(2)}%`)
            }
            
            // Volume analysis
            if (volumeScore) {
              score += 25
              reasons.push(`Good volume: ${(data.volume / 100000).toFixed(1)}L`)
            }
            
            // Range analysis
            if (dayRange >= 2) {
              score += 25
              reasons.push(`High volatility: ${dayRange.toFixed(2)}% range`)
              if (dayRange >= 4 && Math.abs(gap) >= 2) recommendation = 'STRONG_BUY'
            } else if (dayRange >= 1) {
              score += 15
              reasons.push(`Moderate range: ${dayRange.toFixed(2)}%`)
            }
            
            // Price level
            reasons.push(`Price: ₹${data.current.toFixed(2)}`)
            
            if (score < 30) recommendation = 'SKIP'
            else if (score < 50) recommendation = 'WATCH'
            
            intelligence = {
              symbol: stock.tradingsymbol,
              recommendation,
              confidence: Math.min(score, 100),
              pattern: {
                gapFillRate: 0,
                volatilityConsistency: 0,
                momentumFollowThrough: 0,
                averageDayRange: dayRange,
                successRate: 0,
                bestEntry: gap > 0 ? 'GAP_UP' : gap < 0 ? 'GAP_DOWN' : 'BREAKOUT',
                confidence: Math.min(score, 100)
              },
              reasons: [`⚠️ Current day analysis only (no historical data)`, ...reasons],
              historicalScore: score,
              keyLevels: {
                support: [data.dayLow],
                resistance: [data.dayHigh]
              },
              expectedMove: {
                direction: gap > 0 ? 'UP' : gap < 0 ? 'DOWN' : 'NEUTRAL',
                target: data.current * (gap > 0 ? 1.02 : 0.98),
                stopLoss: data.current * (gap > 0 ? 0.985 : 1.015)
              }
            }
            
            pattern = intelligence.pattern
            
              } else {
            // NORMAL MODE: We have historical data
            if (candles.length < 5) {
              console.log(`ℹ️ ${stock.tradingsymbol}: Limited historical data (${candles.length} days) - analysis may be less accurate`)
            }
            
            // Convert to DailyCandle format (Kite returns objects, not arrays!)
            const dailyCandles: DailyCandle[] = candles.map((c: any) => ({
              date: new Date(c.date),
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
              volume: c.volume
            }))
            
            // Analyze historical patterns
            pattern = analyzeHistoricalPatterns(stock.tradingsymbol, dailyCandles)
            
            // Generate intelligence
            intelligence = generateStockIntelligence(
              stock.tradingsymbol,
              pattern,
              data.current,
              dailyCandles
            )
          }
          
          // Calculate basic score for sorting
          const gap = ((data.current - data.open) / data.open) * 100
          const dayRange = ((data.dayHigh - data.dayLow) / data.open) * 100
          
          results.push({
            ...intelligence,
            current: data.current,
            open: data.open,
            high: data.dayHigh,
            low: data.dayLow,
            volume: data.volume,
            gap: gap,
            gapType: gap > 0 ? 'GAP_UP' : gap < 0 ? 'GAP_DOWN' : 'FLAT',
            change: data.change,
            changePercent: data.changePercent,
            score: intelligence.historicalScore,
            dayRange: dayRange,
            instrumentToken: data.instrumentToken
          })
          
          successCount++
          
          // Log only significant signals (BUY or STRONG_BUY)
          if (intelligence.recommendation === 'STRONG_BUY' || intelligence.recommendation === 'BUY') {
            console.log(`✅ ${stock.tradingsymbol}: ${intelligence.recommendation} (score: ${intelligence.historicalScore}, success: ${pattern.successRate.toFixed(0)}%)`)
          }
          
          // Update progress
          setScanProgress(Math.round((i + 1) / totalStocks * 100))
          
        } catch (err) {
          console.error(`❌ Error analyzing ${stock.tradingsymbol}:`, err)
          failCount++
        }
      }

      console.log(`\n📊 Scan Summary: ${successCount} successful, ${failCount} failed out of ${totalStocks} stocks`)

      // Sort by historical score (highest first)
      const sortedResults = results
        // TEMPORARILY DISABLED: .filter(r => r.recommendation !== 'SKIP') // Filter out SKIP recommendations
        .sort((a, b) => b.historicalScore - a.historicalScore)
        .slice(0, 50) // Top 50 candidates

      setScanResults(sortedResults)
      
      const strongBuy = sortedResults.filter(r => r.recommendation === 'STRONG_BUY').length
      const buy = sortedResults.filter(r => r.recommendation === 'BUY').length
      
      if (results.length === 0) {
        alert(
          `⚠️ No stocks analyzed successfully!\n\n` +
          `Attempted: ${totalStocks} stocks\n` +
          `Failed: ${failCount} stocks\n\n` +
          `Check browser console for details.\n` +
          `Possible issues:\n` +
          `- Market is closed (weekend/holiday)\n` +
          `- API rate limiting\n` +
          `- Authentication expired`
        )
            } else {
        alert(
          `✅ Intelligence Scan Complete!\n\n` +
          `📊 Analyzed ${results.length} stocks with historical patterns\n` +
          `❌ Failed ${failCount} stocks\n\n` +
          `🚨 ${strongBuy} STRONG BUY signals\n` +
          `✅ ${buy} BUY signals\n` +
          `👀 ${sortedResults.length - strongBuy - buy} WATCH signals`
        )
      }

    } catch (error: any) {
      console.error('Universe scan error:', error)
      alert(`❌ Scan failed: ${error.message}`)
    } finally {
      setIsScanningUniverse(false)
      setIsLoading(false)
      setScanProgress(0)
    }
  }

  // Market Close Analyzer - Run after 3:30 PM for tomorrow's strategy
  async function runMarketCloseAnalysis() {
    setIsAnalyzingClose(true)
    setIsLoading(true)

    try {
      console.log('🌙 Running Market Close Analysis for tomorrow\'s strategy...')

      // First run universe scan with historical analysis
      await scanUniverse()
      
      // Generate market close analysis from scan results
      if (scanResults.length === 0) {
        alert('⚠️ No scan data available')
        return
      }

      const analysis = analyzeMarketClose(scanResults)
      setMarketCloseAnalysis(analysis)
      
      // Save to localStorage for morning review
      localStorage.setItem('marketCloseAnalysis', JSON.stringify(analysis))
      localStorage.setItem('marketCloseDate', new Date().toISOString())
      
      alert(
        `✅ Market Close Analysis Complete!\n\n` +
        `📊 Tomorrow's Top ${analysis.topPicks.length} Picks Ready\n` +
        `📈 Market Sentiment: ${analysis.marketSentiment}\n` +
        `⚡ Risk Level: ${analysis.riskLevel}\n\n` +
        `Analysis saved for tomorrow morning!`
      )

    } catch (error: any) {
      console.error('Market close analysis error:', error)
      alert(`❌ Analysis failed: ${error.message}`)
    } finally {
      setIsAnalyzingClose(false)
      setIsLoading(false)
    }
  }

  // Load yesterday's analysis
  function loadYesterdayAnalysis() {
    try {
      const savedAnalysis = localStorage.getItem('marketCloseAnalysis')
      const savedDate = localStorage.getItem('marketCloseDate')
      
      if (!savedAnalysis || !savedDate) {
        alert('⚠️ No previous analysis found')
        return
      }
      
      const analysis = JSON.parse(savedAnalysis)
      setMarketCloseAnalysis(analysis)
      
      // Check if analysis is from yesterday
      const analysisDate = new Date(savedDate)
      const today = new Date()
      const daysDiff = Math.floor((today.getTime() - analysisDate.getTime()) / (1000 * 60 * 60 * 24))
      
      if (daysDiff > 2) {
        alert('⚠️ Analysis is more than 2 days old. Consider running a fresh scan.')
      } else {
        alert(`✅ Loaded analysis from ${analysisDate.toLocaleDateString()}`)
      }
      
    } catch (error) {
      console.error('Error loading analysis:', error)
      alert('❌ Failed to load previous analysis')
    }
  }

  // Load yesterday's top picks into screeners
  function loadYesterdayPicks() {
    if (!marketCloseAnalysis) {
      alert('⚠️ No market close analysis available. Load yesterday\'s analysis first!')
      return
    }

    const topStocks = marketCloseAnalysis.topPicks.slice(0, 15).map(p => p.symbol)
    
    // Update intraday watchlist
    setIntradayWatchlist(topStocks)
    
    // Update screener group
    const updatedGroups = {
      ...screenerGroups,
      'Yesterday\'s Analysis': topStocks
    }
    setScreenerGroups(updatedGroups)
    setActiveScreenerGroup('Yesterday\'s Analysis')

    alert(`✅ Loaded ${topStocks.length} stocks from yesterday's analysis!\n\nReady to run morning screener!`)
  }

  // Load top candidates into screener watchlists
  function loadTopCandidates(count: number = 15) {
    if (scanResults.length === 0) {
      alert('⚠️ No scan results. Run Universe Scanner first!')
      return
    }

    const topStocks = scanResults.slice(0, count).map(r => r.symbol)
    
    // Update intraday watchlist
    setIntradayWatchlist(topStocks)
    
    // Update screener group
    const updatedGroups = {
      ...screenerGroups,
      'Today\'s Top Picks': topStocks
    }
    setScreenerGroups(updatedGroups)
    setActiveScreenerGroup('Today\'s Top Picks')

    alert(`✅ Loaded top ${count} candidates!\n\n${topStocks.slice(0, 5).join(', ')}...\n\nReady to run screeners!`)
  }

  // Clear scan results
  function clearScanResults() {
    setScanResults([])
  }

  // Fetch multi-layer news (stock + sector + macro)
  async function fetchMultiLayerNews(symbol?: string) {
    const targetSymbol = symbol || fundamentalSymbol.trim().toUpperCase()
    
    if (!targetSymbol) {
      alert('⚠️ Please enter a stock symbol first')
      return
    }
    
    setIsFetchingNews(true)
    
    try {
      console.log(`🎯 Fetching multi-layer news for ${targetSymbol}...`)
      
      const response = await fetch(`/api/news/multi-layer?symbol=${targetSymbol}&exchange=${fundamentalExchange}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch multi-layer news')
      }
      
      const result = await response.json()
      
      if (result.success) {
        setMultiLayerNews(result)
        // Also update individual states for backward compatibility
        setStockNews(result.stockNews.news)
        setStockSentiment(result.stockNews.sentiment)
        console.log(`✅ Multi-layer analysis complete for ${targetSymbol}`)
        console.log(`   📰 Stock: ${result.stockNews.sentiment.aggregate.overall}`)
        if (result.sectorNews) console.log(`   🏢 Sector: ${result.sectorNews.sentiment.aggregate.overall}`)
        if (result.macroNews) console.log(`   🌍 Macro: ${result.macroNews.sentiment.aggregate.overall}`)
        console.log(`   ⚡ Combined: ${result.combinedSentiment.overall} (${result.combinedSentiment.tradingSignal.signal})`)
      }
      
    } catch (error: any) {
      console.error('❌ Error fetching multi-layer news:', error)
      alert(`❌ Failed to fetch news: ${error.message}`)
    } finally {
      setIsFetchingNews(false)
    }
  }

  // Fetch stock-specific news
  async function fetchStockNews(symbol?: string) {
    const targetSymbol = symbol || fundamentalSymbol.trim().toUpperCase()
    
    if (!targetSymbol) {
      alert('⚠️ Please enter a stock symbol first')
      return
    }
    
    setIsFetchingNews(true)
    
    try {
      console.log(`📰 Fetching news for ${targetSymbol}...`)
      
      const response = await fetch(`/api/news/quote?symbol=${targetSymbol}&exchange=${fundamentalExchange}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch news')
      }
      
      const result = await response.json()
      
      if (result.success && result.news) {
        setStockNews(result.news)
        setStockSentiment(result.sentiment)
        console.log(`✅ Loaded ${result.count} news items for ${targetSymbol}`)
        console.log(`📊 Sentiment: ${result.sentiment.aggregate.overall} (${result.sentiment.trading.signal})`)
      }
      
    } catch (error: any) {
      console.error('❌ Error fetching stock news:', error)
      alert(`❌ Failed to fetch news: ${error.message}`)
    } finally {
      setIsFetchingNews(false)
    }
  }

  // Fetch general market news
  async function fetchMarketNews() {
    setIsFetchingNews(true)
    
    try {
      console.log('📰 Fetching market news...')
      
      const response = await fetch('/api/news/market')
      
      if (!response.ok) {
        throw new Error('Failed to fetch market news')
      }
      
      const result = await response.json()
      
      if (result.success && result.news) {
        setMarketNews(result.news)
        setMarketSentiment(result.sentiment)
        console.log(`✅ Loaded ${result.count} market news items`)
        console.log(`📊 Market Sentiment: ${result.sentiment.aggregate.overall} (${result.sentiment.trading.signal})`)
      }
      
    } catch (error: any) {
      console.error('❌ Error fetching market news:', error)
      alert(`❌ Failed to fetch market news: ${error.message}`)
    } finally {
      setIsFetchingNews(false)
    }
  }

  // Fetch Market Dashboard
  async function fetchMarketDashboard() {
    setIsFetchingMarketDashboard(true)
    setMarketDashboard(null)
    
    try {
      console.log('📊 Fetching market dashboard...')
      
      const response = await fetch('/api/market/dashboard')
      
      if (!response.ok) {
        throw new Error('Failed to fetch market dashboard')
      }
      
      const result = await response.json()
      
      if (result.success && result.data) {
        setMarketDashboard(result.data)
        console.log(`✅ Market dashboard loaded successfully`)
        if (result.data.marketSentiment) {
          console.log(`📊 Market Sentiment: ${result.data.marketSentiment.overall} (${result.data.marketSentiment.score}/100)`)
        }
      }
      
    } catch (error: any) {
      console.error('❌ Error fetching market dashboard:', error)
      alert(`❌ Failed to fetch market dashboard: ${error.message}`)
    } finally {
      setIsFetchingMarketDashboard(false)
    }
  }

  // Fetch fundamental data for a stock
  async function fetchFundamentals() {
    const symbol = fundamentalSymbol.trim().toUpperCase()
            
            if (!symbol) {
      alert('⚠️ Please enter a stock symbol')
      return
    }
    
    setIsFetchingFundamentals(true)
    setFundamentalData(null)
    setFundamentalScore(null)
    
    try {
      console.log(`📊 Fetching fundamentals for ${symbol}...`)
      
      const response = await fetch(`/api/fundamentals/quote?symbol=${symbol}&exchange=${fundamentalExchange}`)
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch fundamentals')
      }
      
      const result = await response.json()
      
      if (result.success && result.data) {
        setFundamentalData(result.data)
        
        // Calculate fundamental score
        const score = calculateFundamentalScore(result.data)
        setFundamentalScore(score)
        
        console.log(`✅ ${symbol} fundamentals loaded`)
        console.log(`   Score: ${score.overall}/100 (${score.rating})`)
        
      // Auto-fetch multi-layer news for this stock
      fetchMultiLayerNews(symbol)
      } else {
        throw new Error('No data received')
      }
      
    } catch (error: any) {
      console.error('❌ Error fetching fundamentals:', error)
      
      // Try to get more details from the error response
      let errorMessage = error.message || 'Unknown error'
      let suggestion = 'Try different exchange (NSE/BSE) or check symbol spelling.'
      
      // If we have an error response with details, use that
      if (error.message.includes('Failed to fetch fundamental data')) {
        errorMessage = `Could not fetch data for ${symbol}`
        suggestion = 'This could be due to:\n• Invalid symbol name\n• Yahoo Finance API issue\n• Network connectivity\n• Symbol not available on selected exchange\n\nCheck browser console for detailed error logs.'
      }
      
      alert(`❌ ${errorMessage}\n\n${suggestion}`)
    } finally {
      setIsFetchingFundamentals(false)
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
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <a 
                href="https://github.com/rohitsadhu1947/v0-indian-stock-tracker/blob/main/USER_GUIDE.md"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '6px 12px',
                  fontSize: '0.9em',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  border: '2px solid rgba(102, 126, 234, 0.5)',
                  borderRadius: '6px',
                  color: '#fff',
                  textDecoration: 'none',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.boxShadow = '0 5px 15px rgba(102, 126, 234, 0.4)'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                📚 User Guide
              </a>
              <a 
                href="https://github.com/rohitsadhu1947/v0-indian-stock-tracker/blob/main/QUICK_REFERENCE.md"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '6px 12px',
                  fontSize: '0.9em',
                  background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                  border: '2px solid rgba(245, 87, 108, 0.5)',
                  borderRadius: '6px',
                  color: '#fff',
                  textDecoration: 'none',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.boxShadow = '0 5px 15px rgba(245, 87, 108, 0.4)'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                🚀 Quick Ref
              </a>
              <button onClick={handleLogout} style={{ padding: '6px 12px', fontSize: '0.9em' }}>
                Logout
              </button>
            </div>
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
        <button 
          className={`tab ${activeTab === 'universe' ? 'active' : ''}`}
          onClick={() => setActiveTab('universe')}
        >
          🔍 Universe Scanner
        </button>
        <button 
          className={`tab ${activeTab === 'fundamentals' ? 'active' : ''}`}
          onClick={() => setActiveTab('fundamentals')}
        >
          📊 Fundamentals
        </button>
        <button 
          className={`tab ${activeTab === 'market' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('market')
            if (!marketDashboard) {
              fetchMarketDashboard()
            }
          }}
        >
          🌐 Market
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

      {activeTab === 'universe' && (
        <div>
          <div className="strategy-info" style={{ 
            background: 'linear-gradient(135deg, rgba(138, 43, 226, 0.2), rgba(75, 0, 130, 0.2))',
            border: '2px solid rgba(138, 43, 226, 0.5)'
          }}>
            <h2 style={{ fontSize: '1.8em', marginBottom: '10px' }}>🔍 Universe Scanner - NIFTY 500</h2>
            <p style={{ fontSize: '1.1em', marginBottom: '15px' }}>
              Automatically scan 200+ stocks to find the BEST intraday candidates based on gap, volume, and volatility!
            </p>
            <div style={{ 
              background: 'rgba(0, 0, 0, 0.3)', 
              padding: '15px', 
              borderRadius: '10px',
              marginTop: '15px'
            }}>
              <h3 style={{ marginBottom: '10px' }}>🎯 How it works:</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px' }}>
                <div>
                  <strong>1. 📊 Scan Universe</strong><br/>
                  <span style={{ fontSize: '0.9em', opacity: 0.8 }}>Analyzes 200+ stocks for intraday potential</span>
                </div>
                <div>
                  <strong>2. 🎯 Smart Scoring</strong><br/>
                  <span style={{ fontSize: '0.9em', opacity: 0.8 }}>Ranks stocks by gap, volume, volatility (0-100)</span>
                </div>
                <div>
                  <strong>3. ✅ Load to Screeners</strong><br/>
                  <span style={{ fontSize: '0.9em', opacity: 0.8 }}>One-click to populate watchlists & screeners</span>
                </div>
                <div>
                  <strong>4. 🚀 Run Screeners</strong><br/>
                  <span style={{ fontSize: '0.9em', opacity: 0.8 }}>Get precise entry signals for best candidates</span>
                </div>
              </div>
            </div>
          </div>

          {/* Scanner Controls */}
          <div className="controls" style={{ 
            marginTop: '20px', 
            padding: '20px', 
            background: 'rgba(138, 43, 226, 0.1)',
            border: '1px solid rgba(138, 43, 226, 0.3)',
            borderRadius: '10px'
          }}>
            <h3 style={{ marginBottom: '15px' }}>⚙️ Scanner Settings</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  📊 Minimum Volume (shares)
                </label>
                <input
                  type="number"
                  value={minVolume}
                  onChange={(e) => setMinVolume(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '10px',
                    fontSize: '1em',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '6px',
                    color: 'white'
                  }}
                />
                <div style={{ fontSize: '0.85em', opacity: 0.7, marginTop: '5px' }}>
                  Current: {(minVolume / 100000).toFixed(1)} Lakh shares
                </div>
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  📈 Minimum Gap % (open vs yesterday close)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={minGapPercent}
                  onChange={(e) => setMinGapPercent(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '10px',
                    fontSize: '1em',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '6px',
                    color: 'white'
                  }}
                />
                <div style={{ fontSize: '0.85em', opacity: 0.7, marginTop: '5px' }}>
                  Lower = more results, Higher = stricter filter
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
              <button
                onClick={scanUniverse}
                disabled={isScanningUniverse || !authStatus.authenticated}
                style={{
                  padding: '15px 30px',
                  fontSize: '1.1em',
                  fontWeight: 'bold',
                  background: isScanningUniverse ? 'rgba(128, 128, 128, 0.3)' : 'linear-gradient(135deg, #8a2be2, #4b0082)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: isScanningUniverse ? 'not-allowed' : 'pointer',
                  flex: '1',
                  minWidth: '200px'
                }}
              >
                {isScanningUniverse 
                  ? `🔄 Scanning... ${scanProgress}%` 
                  : '🔍 Scan Universe (Morning)'}
              </button>

              <button
                onClick={runMarketCloseAnalysis}
                disabled={isAnalyzingClose || !authStatus.authenticated}
                style={{
                  padding: '15px 30px',
                  fontSize: '1.1em',
                  fontWeight: 'bold',
                  background: isAnalyzingClose ? 'rgba(128, 128, 128, 0.3)' : 'linear-gradient(135deg, #ff6b6b, #c92a2a)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: isAnalyzingClose ? 'not-allowed' : 'pointer'
                }}
              >
                {isAnalyzingClose ? '🔄 Analyzing...' : '🌙 Market Close Analysis (Evening)'}
              </button>

              {marketCloseAnalysis && (
                <button
                  onClick={loadYesterdayPicks}
                  style={{
                    padding: '15px 30px',
                    fontSize: '1.1em',
                    fontWeight: 'bold',
                    background: 'linear-gradient(135deg, #ffd700, #ffed4e)',
                    color: '#000',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: 'pointer'
                  }}
                >
                  ⭐ Load Yesterday's Picks
                </button>
              )}

              {scanResults.length > 0 && (
                <>
                  <button
                    onClick={() => loadTopCandidates(15)}
                    style={{
                      padding: '15px 30px',
                      fontSize: '1.1em',
                      fontWeight: 'bold',
                      background: 'linear-gradient(135deg, #00ff64, #00cc51)',
                      color: '#000',
                      border: 'none',
                      borderRadius: '10px',
                      cursor: 'pointer'
                    }}
                  >
                    ✅ Load Top 15 to Screeners
                  </button>
                  
                  <button
                    onClick={clearScanResults}
                    style={{
                      padding: '15px 30px',
                      fontSize: '1.1em',
                      fontWeight: 'bold',
                      background: 'rgba(255, 0, 100, 0.2)',
                      color: 'white',
                      border: '1px solid rgba(255, 0, 100, 0.5)',
                      borderRadius: '10px',
                      cursor: 'pointer'
                    }}
                  >
                    🗑️ Clear Results
                  </button>
                </>
              )}
            </div>

            {!authStatus.authenticated && (
              <div style={{
                marginTop: '15px',
                padding: '12px',
                background: 'rgba(255, 193, 7, 0.2)',
                border: '1px solid rgba(255, 193, 7, 0.5)',
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                ⚠️ Please login to use Universe Scanner
              </div>
            )}
          </div>

          {/* Scan Results */}
          {scanResults.length > 0 && (
            <div style={{ marginTop: '30px' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
                padding: '15px',
                background: 'rgba(138, 43, 226, 0.1)',
                border: '1px solid rgba(138, 43, 226, 0.3)',
                borderRadius: '10px'
              }}>
                <h3 style={{ margin: 0 }}>🎯 Top Intraday Candidates</h3>
                <div style={{ fontSize: '1.2em', fontWeight: 'bold' }}>
                  {scanResults.length} stocks found
                </div>
              </div>

              <div style={{
                background: 'rgba(0, 0, 0, 0.2)',
                padding: '20px',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <table className="screener-table" style={{ width: '100%' }}>
                    <thead>
                        <tr>
                      <th>Rank</th>
                            <th>Symbol</th>
                      <th>Recommendation</th>
                      <th>Confidence</th>
                      <th>Success Rate</th>
                      <th>Current Price</th>
                      <th>Gap</th>
                      <th>Best Entry</th>
                      <th>Historical Insights</th>
                      <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                    {scanResults.map((result, idx) => {
                      const gapColor = result.gap > 0 ? '#00ff64' : result.gap < 0 ? '#ff0064' : '#ffc107'
                      const recommendationColor = 
                        result.recommendation === 'STRONG_BUY' ? '#00ff64' :
                        result.recommendation === 'BUY' ? '#00cc51' :
                        result.recommendation === 'WATCH' ? '#ffc107' : '#ff9800'
                      
                      return (
                        <tr key={idx}>
                          <td>
                            <div style={{
                              width: '30px',
                              height: '30px',
                              borderRadius: '50%',
                              background: idx < 3 ? 'linear-gradient(135deg, #ffd700, #ffed4e)' : 
                                         idx < 10 ? 'linear-gradient(135deg, #c0c0c0, #e8e8e8)' :
                                         'rgba(255, 255, 255, 0.1)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 'bold',
                              color: idx < 10 ? '#000' : '#fff',
                              margin: '0 auto'
                            }}>
                              {idx + 1}
                            </div>
                          </td>
                          <td><strong style={{ fontSize: '1.1em' }}>{result.symbol}</strong></td>
                          <td>
                            <div style={{
                              padding: '6px 14px',
                              background: recommendationColor,
                              color: '#000',
                              borderRadius: '8px',
                              fontWeight: 'bold',
                              display: 'inline-block',
                              fontSize: '0.95em'
                            }}>
                              {result.recommendation === 'STRONG_BUY' ? '🚨 STRONG BUY' :
                               result.recommendation === 'BUY' ? '✅ BUY' :
                               result.recommendation === 'WATCH' ? '👀 WATCH' : '⏭️ SKIP'}
                            </div>
                          </td>
                          <td>
                            <div style={{
                              padding: '5px 12px',
                              background: result.confidence >= 70 ? 'rgba(0, 255, 100, 0.2)' :
                                         result.confidence >= 50 ? 'rgba(255, 193, 7, 0.2)' : 'rgba(255, 152, 0, 0.2)',
                              border: `1px solid ${result.confidence >= 70 ? '#00ff64' :
                                                   result.confidence >= 50 ? '#ffc107' : '#ff9800'}`,
                              borderRadius: '6px',
                              fontWeight: 'bold',
                              display: 'inline-block'
                            }}>
                              {result.confidence}%
                            </div>
                          </td>
                          <td>
                            <div style={{
                              fontSize: '1.1em',
                              fontWeight: 'bold',
                              color: result.pattern?.successRate >= 70 ? '#00ff64' :
                                     result.pattern?.successRate >= 60 ? '#ffc107' : '#ff9800'
                            }}>
                              {result.pattern?.successRate?.toFixed(0) || 'N/A'}%
                            </div>
                            <div style={{ fontSize: '0.8em', opacity: 0.7 }}>
                              {result.pattern?.averageDayRange?.toFixed(2) || 'N/A'}% avg range
                            </div>
                          </td>
                          <td>₹{result.current.toFixed(2)}</td>
                          <td>
                            <div style={{
                              padding: '5px 12px',
                              background: gapColor,
                              color: '#000',
                              borderRadius: '6px',
                              fontWeight: 'bold',
                              display: 'inline-block'
                            }}>
                              {result.gap >= 0 ? '+' : ''}{result.gap.toFixed(2)}%
                            </div>
                          </td>
                          <td>
                            <span style={{
                              padding: '5px 10px',
                              background: 'rgba(138, 43, 226, 0.2)',
                              border: '1px solid rgba(138, 43, 226, 0.5)',
                              borderRadius: '6px',
                              fontSize: '0.9em',
                              fontWeight: 'bold'
                            }}>
                              {result.pattern?.bestEntry?.replace('_', ' ') || 'BREAKOUT'}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.85em', color: 'rgba(255, 255, 255, 0.8)', maxWidth: '300px' }}>
                            {result.reasons?.slice(0, 3).join(' • ') || 'No data'}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '5px', justifyContent: 'center' }}>
                              <button
                                onClick={() => {
                                  setIntradayWatchlist(prev => 
                                    prev.includes(result.symbol) ? prev : [...prev, result.symbol]
                                  )
                                  alert(`✅ ${result.symbol} added to Intraday Watchlist!`)
                                }}
                                style={{
                                  padding: '6px 12px',
                                  fontSize: '0.9em',
                                  background: 'rgba(0, 255, 100, 0.2)',
                                  border: '1px solid #00ff64',
                                  color: '#00ff64',
                                  borderRadius: '6px',
                                  cursor: 'pointer'
                                }}
                              >
                                + Intraday
                              </button>
                              <button
                                onClick={() => addToTradeWatch(result.symbol, 'universe-scan', result)}
                                style={{
                                  padding: '6px 12px',
                                  fontSize: '0.9em',
                                  background: 'rgba(138, 43, 226, 0.2)',
                                  border: '1px solid #8a2be2',
                                  color: '#8a2be2',
                                  borderRadius: '6px',
                                  cursor: 'pointer'
                                }}
                              >
                                👁️ Watch
                              </button>
                            </div>
                          </td>
                    </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Quick Stats */}
              <div style={{
                marginTop: '20px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '15px'
              }}>
                <div style={{
                  padding: '15px',
                  background: 'rgba(0, 255, 100, 0.1)',
                  border: '1px solid rgba(0, 255, 100, 0.3)',
                  borderRadius: '10px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '2em', fontWeight: 'bold', color: '#00ff64' }}>
                    {scanResults.filter(r => r.gapType === 'GAP_UP').length}
                  </div>
                  <div style={{ fontSize: '0.9em', opacity: 0.8 }}>Gap Up Stocks</div>
                </div>
                
                <div style={{
                  padding: '15px',
                  background: 'rgba(255, 0, 100, 0.1)',
                  border: '1px solid rgba(255, 0, 100, 0.3)',
                  borderRadius: '10px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '2em', fontWeight: 'bold', color: '#ff0064' }}>
                    {scanResults.filter(r => r.gapType === 'GAP_DOWN').length}
                  </div>
                  <div style={{ fontSize: '0.9em', opacity: 0.8 }}>Gap Down Stocks</div>
                </div>
                
                <div style={{
                  padding: '15px',
                  background: 'rgba(138, 43, 226, 0.1)',
                  border: '1px solid rgba(138, 43, 226, 0.3)',
                  borderRadius: '10px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '2em', fontWeight: 'bold', color: '#8a2be2' }}>
                    {scanResults.filter(r => r.score >= 70).length}
                  </div>
                  <div style={{ fontSize: '0.9em', opacity: 0.8 }}>High Score (70+)</div>
                </div>
                
                <div style={{
                  padding: '15px',
                  background: 'rgba(255, 193, 7, 0.1)',
                  border: '1px solid rgba(255, 193, 7, 0.3)',
                  borderRadius: '10px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '2em', fontWeight: 'bold', color: '#ffc107' }}>
                    {Math.max(...scanResults.map(r => r.score))}
                  </div>
                  <div style={{ fontSize: '0.9em', opacity: 0.8 }}>Top Score</div>
                </div>
              </div>
            </div>
          )}

          {/* Empty State */}
          {scanResults.length === 0 && !isScanningUniverse && (
            <div style={{
              marginTop: '30px',
              padding: '60px 20px',
              textAlign: 'center',
              background: 'rgba(138, 43, 226, 0.05)',
              border: '2px dashed rgba(138, 43, 226, 0.3)',
              borderRadius: '15px'
            }}>
              <div style={{ fontSize: '4em', marginBottom: '15px' }}>🔍</div>
              <h3 style={{ marginBottom: '10px' }}>No Scan Results Yet</h3>
              <p style={{ fontSize: '1.1em', opacity: 0.8, marginBottom: '20px' }}>
                Click "Scan NIFTY 500 Universe" to find the best intraday trading candidates!
              </p>
              <div style={{
                padding: '20px',
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: '10px',
                display: 'inline-block',
                textAlign: 'left'
              }}>
                <h4 style={{ marginBottom: '10px' }}>💡 Pro Tips:</h4>
                <ul style={{ marginLeft: '20px', lineHeight: '1.8' }}>
                  <li>Run scanner between <strong>9:00-9:30 AM</strong> for pre-market analysis</li>
                  <li>Lower minimum gap % to find more candidates</li>
                  <li>Higher volume = better liquidity & tighter spreads</li>
                  <li>Top 15 stocks are automatically loaded to screeners</li>
                  <li>Scan takes ~2-3 minutes to analyze 200+ stocks</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* FUNDAMENTALS TAB */}
      {activeTab === 'fundamentals' && (
        <div>
          {/* Search Section */}
          <div className="screener-results" style={{ marginBottom: '20px' }}>
            <h3 style={{ marginBottom: '15px' }}>📊 Fundamental Analysis</h3>
            <p style={{ color: 'rgba(255, 255, 255, 0.7)', marginBottom: '20px' }}>
              Get comprehensive fundamental data, valuation metrics, and combined technical + fundamental signals
            </p>
            
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text"
                value={fundamentalSymbol}
                onChange={(e) => setFundamentalSymbol(e.target.value.toUpperCase())}
                onKeyPress={(e) => e.key === 'Enter' && fetchFundamentals()}
                placeholder="Enter Stock Symbol (e.g., RELIANCE, TCS)"
                style={{
                  flex: '1',
                  minWidth: '250px',
                  padding: '12px',
                  fontSize: '15px'
                }}
              />
              <select 
                value={fundamentalExchange} 
                onChange={(e) => setFundamentalExchange(e.target.value as 'NSE' | 'BSE')}
                style={{ padding: '12px', fontSize: '15px' }}
              >
                <option value="NSE">NSE</option>
                <option value="BSE">BSE</option>
              </select>
              <button
                onClick={fetchFundamentals}
                disabled={isFetchingFundamentals || !fundamentalSymbol}
                style={{
                  padding: '12px 30px',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  background: isFetchingFundamentals 
                    ? 'rgba(255, 255, 255, 0.2)' 
                    : 'linear-gradient(45deg, #667eea, #764ba2)',
                  cursor: isFetchingFundamentals || !fundamentalSymbol ? 'not-allowed' : 'pointer'
                }}
              >
                {isFetchingFundamentals ? '🔄 Analyzing...' : '📊 Analyze'}
              </button>
            </div>
          </div>

          {/* Loading State */}
          {isFetchingFundamentals && (
            <div style={{
              padding: '60px 20px',
              textAlign: 'center',
              background: 'rgba(102, 126, 234, 0.1)',
              borderRadius: '15px',
              border: '2px solid rgba(102, 126, 234, 0.3)'
            }}>
              <div style={{ fontSize: '4em', marginBottom: '20px' }}>📊</div>
              <h3>Fetching Fundamental Data...</h3>
              <p style={{ opacity: 0.7, marginTop: '10px' }}>
                Analyzing valuation, profitability, financial health, and growth metrics
              </p>
            </div>
          )}

          {/* Fundamental Data Display */}
          {fundamentalData && fundamentalScore && !isFetchingFundamentals && (
            <div>
              {/* Company Header */}
              <div className="screener-results" style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
                  <div>
                    <h2 style={{ fontSize: '2em', margin: 0, marginBottom: '5px', color: '#4facfe' }}>
                      {fundamentalData.symbol}
                    </h2>
                    <p style={{ fontSize: '1.1em', margin: 0, opacity: 0.8 }}>
                      {fundamentalData.companyName}
                    </p>
                    {fundamentalData.sector && (
                      <p style={{ fontSize: '0.9em', margin: 0, marginTop: '5px', opacity: 0.6 }}>
                        {fundamentalData.sector} • {getCompanySize(fundamentalData.marketCap)}
                      </p>
                    )}
                  </div>
                  
                  {/* Overall Score */}
                  <div style={{
                    padding: '20px 30px',
                    background: fundamentalScore.overall >= 70 
                      ? 'linear-gradient(135deg, rgba(0, 255, 100, 0.2), rgba(0, 255, 100, 0.1))'
                      : fundamentalScore.overall >= 50
                      ? 'linear-gradient(135deg, rgba(255, 193, 7, 0.2), rgba(255, 193, 7, 0.1))'
                      : 'linear-gradient(135deg, rgba(255, 0, 100, 0.2), rgba(255, 0, 100, 0.1))',
                    border: `2px solid ${
                      fundamentalScore.overall >= 70 ? '#00ff64' :
                      fundamentalScore.overall >= 50 ? '#ffc107' : '#ff0064'
                    }`,
                    borderRadius: '12px',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '3em', fontWeight: 'bold', lineHeight: '1' }}>
                      {fundamentalScore.overall}
                    </div>
                    <div style={{ fontSize: '0.9em', opacity: 0.8, marginTop: '5px' }}>
                      out of 100
                    </div>
                    <div style={{
                      fontSize: '1.2em',
                      fontWeight: 'bold',
                      marginTop: '10px',
                      color: fundamentalScore.overall >= 70 ? '#00ff64' :
                             fundamentalScore.overall >= 50 ? '#ffc107' : '#ff0064'
                    }}>
                      {fundamentalScore.rating}
                    </div>
                  </div>
                </div>
              </div>

              {/* 🧠 COMBINED INTELLIGENCE - The Ultimate Trading Strategy */}
              {combinedIntelligence && (
                <div style={{
                  marginBottom: '20px',
                  padding: '30px',
                  background: `linear-gradient(135deg, ${combinedIntelligence.signalColor}15, ${combinedIntelligence.signalColor}08)`,
                  border: `3px solid ${combinedIntelligence.signalColor}`,
                  borderRadius: '20px',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  {/* Animated background effect */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    fontSize: '15em',
                    opacity: 0.03,
                    transform: 'rotate(-15deg)',
                    pointerEvents: 'none'
                  }}>
                    {combinedIntelligence.scenarioEmoji}
                  </div>

                  {/* Header */}
                  <div style={{ marginBottom: '25px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
                      <span style={{ fontSize: '3.5em' }}>{combinedIntelligence.scenarioEmoji}</span>
                      <div style={{ flex: 1 }}>
                        <h3 style={{ 
                          margin: 0, 
                          fontSize: '2em', 
                          color: combinedIntelligence.signalColor,
                          textShadow: `0 0 20px ${combinedIntelligence.signalColor}40`
                        }}>
                          {combinedIntelligence.scenario}
                        </h3>
                        <div style={{ marginTop: '8px', fontSize: '1.1em', opacity: 0.9 }}>
                          <strong style={{ color: combinedIntelligence.signalColor }}>
                            {combinedIntelligence.overallSignal}
                          </strong>
                          {' • '}
                          <span style={{ opacity: 0.8 }}>
                            {combinedIntelligence.timeframe}
                          </span>
                          {' • '}
                          <span style={{ 
                            padding: '4px 12px', 
                            background: `${combinedIntelligence.riskColor}20`,
                            border: `1px solid ${combinedIntelligence.riskColor}`,
                            borderRadius: '8px',
                            color: combinedIntelligence.riskColor,
                            fontSize: '0.9em',
                            fontWeight: 'bold'
                          }}>
                            {combinedIntelligence.riskLevel} Risk
                          </span>
                        </div>
                      </div>
                      <div style={{
                        padding: '20px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        borderRadius: '15px',
                        textAlign: 'center',
                        minWidth: '120px'
                      }}>
                        <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: '5px' }}>CONFIDENCE</div>
                        <div style={{ fontSize: '2.5em', fontWeight: 'bold', color: combinedIntelligence.signalColor }}>
                          {combinedIntelligence.confidence}%
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Trading Strategy */}
                  <div style={{
                    padding: '20px',
                    background: 'rgba(0, 0, 0, 0.4)',
                    borderRadius: '15px',
                    marginBottom: '20px'
                  }}>
                    <h4 style={{ margin: '0 0 15px 0', fontSize: '1.3em' }}>📋 Trading Strategy</h4>
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                      gap: '15px'
                    }}>
                      <div>
                        <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: '5px' }}>💰 Entry</div>
                        <div style={{ fontSize: '1.1em', fontWeight: 'bold' }}>{combinedIntelligence.strategy.entry}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: '5px' }}>🛑 Stop-Loss</div>
                        <div style={{ fontSize: '1.1em', fontWeight: 'bold', color: '#ff0064' }}>{combinedIntelligence.strategy.stopLoss}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: '5px' }}>🎯 Target</div>
                        <div style={{ fontSize: '1.1em', fontWeight: 'bold', color: '#00ff64' }}>{combinedIntelligence.strategy.target}</div>
                      </div>
                    </div>
                    
                    {/* Exit Conditions */}
                    <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                      <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: '8px' }}>🚪 Exit When:</div>
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                        gap: '8px' 
                      }}>
                        {combinedIntelligence.strategy.exitConditions.map((condition, idx) => (
                          <div key={idx} style={{
                            padding: '8px 12px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            borderRadius: '8px',
                            fontSize: '0.9em',
                            borderLeft: `2px solid ${combinedIntelligence.signalColor}`
                          }}>
                            • {condition}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Explanation */}
                  <div style={{
                    padding: '20px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '15px',
                    marginBottom: '20px'
                  }}>
                    <h4 style={{ margin: '0 0 15px 0', fontSize: '1.3em' }}>💡 Why This Strategy?</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ padding: '10px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px' }}>
                        <strong style={{ color: '#4facfe' }}>📊 Technical:</strong> {combinedIntelligence.explanation.technical}
                      </div>
                      <div style={{ padding: '10px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px' }}>
                        <strong style={{ color: '#00ff64' }}>💼 Fundamental:</strong> {combinedIntelligence.explanation.fundamental}
                      </div>
                      <div style={{ padding: '10px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px' }}>
                        <strong style={{ color: '#ffa500' }}>📰 Sentiment:</strong> {combinedIntelligence.explanation.sentiment}
                      </div>
                      <div style={{ 
                        padding: '15px', 
                        background: `${combinedIntelligence.signalColor}10`,
                        border: `2px solid ${combinedIntelligence.signalColor}40`,
                        borderRadius: '10px',
                        fontSize: '1.05em',
                        lineHeight: '1.6'
                      }}>
                        <strong style={{ color: combinedIntelligence.signalColor }}>🎯 Synthesis:</strong> {combinedIntelligence.explanation.synthesis}
                      </div>
                    </div>
                  </div>

                  {/* Alerts & Warnings */}
                  {combinedIntelligence.alerts.length > 0 && (
                    <div style={{
                      padding: '15px 20px',
                      background: 'rgba(255, 193, 7, 0.1)',
                      border: '2px solid rgba(255, 193, 7, 0.4)',
                      borderRadius: '12px'
                    }}>
                      <h5 style={{ margin: '0 0 12px 0', fontSize: '1.1em', color: '#ffc107' }}>⚠️ Important Alerts</h5>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {combinedIntelligence.alerts.map((alert, idx) => (
                          <div key={idx} style={{ 
                            fontSize: '0.95em', 
                            padding: '8px',
                            background: 'rgba(0, 0, 0, 0.2)',
                            borderRadius: '6px'
                          }}>
                            {alert}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Category Scores */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '15px',
                marginBottom: '20px'
              }}>
                <div className="card">
                  <h4 style={{ marginBottom: '10px', color: '#4facfe' }}>💰 Valuation</h4>
                  <div style={{ fontSize: '2em', fontWeight: 'bold' }}>{fundamentalScore.valuation}/100</div>
                  <div style={{ fontSize: '0.85em', opacity: 0.7, marginTop: '5px' }}>
                    P/E, P/B, Dividend Yield
                  </div>
                </div>
                
                <div className="card">
                  <h4 style={{ marginBottom: '10px', color: '#00ff64' }}>📈 Profitability</h4>
                  <div style={{ fontSize: '2em', fontWeight: 'bold' }}>{fundamentalScore.profitability}/100</div>
                  <div style={{ fontSize: '0.85em', opacity: 0.7, marginTop: '5px' }}>
                    ROE, Profit Margins
                  </div>
                </div>
                
                <div className="card">
                  <h4 style={{ marginBottom: '10px', color: '#ffc107' }}>🏦 Financial Health</h4>
                  <div style={{ fontSize: '2em', fontWeight: 'bold' }}>{fundamentalScore.financial_health}/100</div>
                  <div style={{ fontSize: '0.85em', opacity: 0.7, marginTop: '5px' }}>
                    Debt, Liquidity Ratios
                  </div>
                </div>
                
                <div className="card">
                  <h4 style={{ marginBottom: '10px', color: '#8a2be2' }}>🚀 Growth</h4>
                  <div style={{ fontSize: '2em', fontWeight: 'bold' }}>{fundamentalScore.growth}/100</div>
                  <div style={{ fontSize: '0.85em', opacity: 0.7, marginTop: '5px' }}>
                    Revenue, Earnings Growth
                  </div>
                </div>
              </div>

              {/* Key Insights */}
              {fundamentalScore.reasons.length > 0 && (
                <div className="screener-results" style={{ marginBottom: '20px' }}>
                  <h4 style={{ marginBottom: '15px' }}>💡 Key Insights</h4>
                  <ul style={{ marginLeft: '20px', lineHeight: '1.8' }}>
                    {fundamentalScore.reasons.map((reason, idx) => (
                      <li key={idx} style={{ marginBottom: '8px' }}>
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Detailed Metrics */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
                gap: '20px',
                marginBottom: '20px'
              }}>
                {/* Valuation Metrics */}
                <div className="card">
                  <h4 style={{ marginBottom: '15px', color: '#4facfe' }}>💰 Valuation Metrics</h4>
                  <div style={{ display: 'grid', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                      <span style={{ opacity: 0.7 }}>Market Cap:</span>
                      <strong>{formatLargeNumber(fundamentalData.marketCap)}</strong>
                    </div>
                    {fundamentalData.peRatio && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                        <span style={{ opacity: 0.7 }}>P/E Ratio:</span>
                        <strong>{fundamentalData.peRatio.toFixed(2)}</strong>
                      </div>
                    )}
                    {fundamentalData.pbRatio && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                        <span style={{ opacity: 0.7 }}>P/B Ratio:</span>
                        <strong>{fundamentalData.pbRatio.toFixed(2)}</strong>
                      </div>
                    )}
                    {fundamentalData.dividendYield && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                        <span style={{ opacity: 0.7 }}>Dividend Yield:</span>
                        <strong>{(fundamentalData.dividendYield * 100).toFixed(2)}%</strong>
                      </div>
                    )}
                    {fundamentalData.eps && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                        <span style={{ opacity: 0.7 }}>EPS:</span>
                        <strong>₹{fundamentalData.eps.toFixed(2)}</strong>
                      </div>
                    )}
                  </div>
                </div>

                {/* Profitability Metrics */}
                <div className="card">
                  <h4 style={{ marginBottom: '15px', color: '#00ff64' }}>📈 Profitability</h4>
                  <div style={{ display: 'grid', gap: '10px' }}>
                    {fundamentalData.roe && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                        <span style={{ opacity: 0.7 }}>ROE:</span>
                        <strong style={{ color: fundamentalData.roe > 0.15 ? '#00ff64' : '#fff' }}>
                          {(fundamentalData.roe * 100).toFixed(2)}%
                        </strong>
                      </div>
                    )}
                    {fundamentalData.profitMargin && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                        <span style={{ opacity: 0.7 }}>Profit Margin:</span>
                        <strong>{(fundamentalData.profitMargin * 100).toFixed(2)}%</strong>
                      </div>
                    )}
                    {fundamentalData.operatingMargin && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                        <span style={{ opacity: 0.7 }}>Operating Margin:</span>
                        <strong>{(fundamentalData.operatingMargin * 100).toFixed(2)}%</strong>
                      </div>
                    )}
                  </div>
                </div>

                {/* Financial Health */}
                <div className="card">
                  <h4 style={{ marginBottom: '15px', color: '#ffc107' }}>🏦 Financial Health</h4>
                  <div style={{ display: 'grid', gap: '10px' }}>
                    {fundamentalData.debtToEquity !== undefined && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                        <span style={{ opacity: 0.7 }}>Debt/Equity:</span>
                        <strong style={{ color: fundamentalData.debtToEquity < 0.5 ? '#00ff64' : fundamentalData.debtToEquity > 2 ? '#ff0064' : '#fff' }}>
                          {fundamentalData.debtToEquity.toFixed(2)}
                        </strong>
                      </div>
                    )}
                    {fundamentalData.currentRatio && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                        <span style={{ opacity: 0.7 }}>Current Ratio:</span>
                        <strong>{fundamentalData.currentRatio.toFixed(2)}</strong>
                      </div>
                    )}
                    {fundamentalData.quickRatio && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                        <span style={{ opacity: 0.7 }}>Quick Ratio:</span>
                        <strong>{fundamentalData.quickRatio.toFixed(2)}</strong>
                      </div>
                    )}
                  </div>
                </div>

                {/* Growth Metrics */}
                <div className="card">
                  <h4 style={{ marginBottom: '15px', color: '#8a2be2' }}>🚀 Growth</h4>
                  <div style={{ display: 'grid', gap: '10px' }}>
                    {fundamentalData.revenueGrowth && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                        <span style={{ opacity: 0.7 }}>Revenue Growth:</span>
                        <strong style={{ color: fundamentalData.revenueGrowth > 0.15 ? '#00ff64' : fundamentalData.revenueGrowth < 0 ? '#ff0064' : '#fff' }}>
                          {(fundamentalData.revenueGrowth * 100).toFixed(2)}%
                        </strong>
                      </div>
                    )}
                    {fundamentalData.earningsGrowth && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                        <span style={{ opacity: 0.7 }}>Earnings Growth:</span>
                        <strong style={{ color: fundamentalData.earningsGrowth > 0.15 ? '#00ff64' : fundamentalData.earningsGrowth < 0 ? '#ff0064' : '#fff' }}>
                          {(fundamentalData.earningsGrowth * 100).toFixed(2)}%
                        </strong>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Market Data */}
              <div className="screener-results">
                <h4 style={{ marginBottom: '15px' }}>📊 Market Data</h4>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '15px'
                }}>
                  {fundamentalData.fiftyTwoWeekHigh && (
                    <div>
                      <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: '5px' }}>52-Week High</div>
                      <div style={{ fontSize: '1.3em', fontWeight: 'bold' }}>₹{fundamentalData.fiftyTwoWeekHigh.toFixed(2)}</div>
                    </div>
                  )}
                  {fundamentalData.fiftyTwoWeekLow && (
                    <div>
                      <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: '5px' }}>52-Week Low</div>
                      <div style={{ fontSize: '1.3em', fontWeight: 'bold' }}>₹{fundamentalData.fiftyTwoWeekLow.toFixed(2)}</div>
                    </div>
                  )}
                  {fundamentalData.beta && (
                    <div>
                      <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: '5px' }}>Beta</div>
                      <div style={{ fontSize: '1.3em', fontWeight: 'bold' }}>{fundamentalData.beta.toFixed(2)}</div>
                    </div>
                  )}
                  {fundamentalData.averageVolume && (
                    <div>
                      <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: '5px' }}>Avg Volume</div>
                      <div style={{ fontSize: '1.3em', fontWeight: 'bold' }}>
                        {(fundamentalData.averageVolume / 1000000).toFixed(2)}M
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Combined Signal (if technical data exists) */}
              {stockData[fundamentalData.symbol] && (
                <div className="screener-results" style={{
                  marginTop: '20px',
                  background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.2), rgba(138, 43, 226, 0.2))',
                  border: '2px solid rgba(102, 126, 234, 0.5)'
                }}>
                  <h4 style={{ marginBottom: '15px' }}>🎯 Combined Signal (Technical + Fundamental)</h4>
                  {(() => {
                    const data = stockData[fundamentalData.symbol]
                    const signal = generateTradingSignal(data.current, data.prices, data.volumes)
                    const combined = getCombinedSignal(signal.signal, fundamentalScore.overall)
                    
                    return (
                      <div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px', marginBottom: '20px' }}>
                          <div style={{ padding: '15px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '10px' }}>
                            <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: '5px' }}>Technical Signal</div>
                            <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: ['STRONG BUY', 'BUY'].includes(signal.signal) ? '#00ff64' : ['STRONG SELL', 'SELL'].includes(signal.signal) ? '#ff0064' : '#ffc107' }}>
                              {signal.signal}
                            </div>
                          </div>
                          <div style={{ padding: '15px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '10px' }}>
                            <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: '5px' }}>Fundamental Score</div>
                            <div style={{ fontSize: '1.5em', fontWeight: 'bold' }}>
                              {fundamentalScore.overall}/100 ({fundamentalScore.rating})
                            </div>
                          </div>
                          <div style={{ padding: '15px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '10px', border: '2px solid ' + (combined.signal === 'STRONG BUY' ? '#00ff64' : combined.signal === 'BUY' ? '#00ff64' : combined.signal === 'STRONG SELL' ? '#ff0064' : combined.signal === 'SELL' ? '#ff0064' : '#ffc107') }}>
                            <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: '5px' }}>COMBINED SIGNAL</div>
                            <div style={{ fontSize: '1.8em', fontWeight: 'bold', color: ['STRONG BUY', 'BUY'].includes(combined.signal) ? '#00ff64' : ['STRONG SELL', 'SELL'].includes(combined.signal) ? '#ff0064' : '#ffc107' }}>
                              {combined.signal}
                            </div>
                            <div style={{ fontSize: '0.9em', marginTop: '5px', opacity: 0.8 }}>
                              {combined.confidence}% confidence
                            </div>
                          </div>
                        </div>
                        <div style={{
                          padding: '15px',
                          background: 'rgba(102, 126, 234, 0.1)',
                          borderRadius: '10px',
                          border: '1px solid rgba(102, 126, 234, 0.3)'
                        }}>
                          <strong>Analysis:</strong> {combined.reason}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* News Section */}
              <div className="screener-results" style={{ marginTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
                  <h4 style={{ margin: 0 }}>📰 Latest News</h4>
                  
                {/* News Type Tabs */}
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => {
                      setNewsTab('multi')
                      if (!multiLayerNews) fetchMultiLayerNews()
                    }}
                    style={{
                      padding: '8px 16px',
                      background: newsTab === 'multi' ? 'linear-gradient(45deg, #f093fb, #f5576c)' : 'rgba(255, 255, 255, 0.1)',
                      border: newsTab === 'multi' ? '2px solid #f5576c' : '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: newsTab === 'multi' ? 'bold' : 'normal'
                    }}
                  >
                    🎯 Multi-Layer Analysis
                  </button>
                  <button
                    onClick={() => {
                      setNewsTab('stock')
                      if (stockNews.length === 0) fetchStockNews()
                    }}
                    style={{
                      padding: '8px 16px',
                      background: newsTab === 'stock' ? 'linear-gradient(45deg, #667eea, #764ba2)' : 'rgba(255, 255, 255, 0.1)',
                      border: newsTab === 'stock' ? '2px solid #667eea' : '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: newsTab === 'stock' ? 'bold' : 'normal'
                    }}
                  >
                    📰 {fundamentalData.symbol} News
                  </button>
                  <button
                    onClick={() => {
                      setNewsTab('market')
                      if (marketNews.length === 0) fetchMarketNews()
                    }}
                    style={{
                      padding: '8px 16px',
                      background: newsTab === 'market' ? 'linear-gradient(45deg, #667eea, #764ba2)' : 'rgba(255, 255, 255, 0.1)',
                      border: newsTab === 'market' ? '2px solid #667eea' : '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: newsTab === 'market' ? 'bold' : 'normal'
                    }}
                  >
                    🌍 Market News
                  </button>
                  <button
                    onClick={() => {
                      if (newsTab === 'multi') fetchMultiLayerNews()
                      else if (newsTab === 'stock') fetchStockNews()
                      else fetchMarketNews()
                    }}
                    disabled={isFetchingNews}
                    style={{
                      padding: '8px 16px',
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '8px',
                      cursor: isFetchingNews ? 'not-allowed' : 'pointer',
                      opacity: isFetchingNews ? 0.5 : 1
                    }}
                  >
                    {isFetchingNews ? '🔄' : '🔄 Refresh'}
                  </button>
                </div>
                </div>

                {/* News Loading State */}
                {isFetchingNews && (
                  <div style={{ padding: '40px 20px', textAlign: 'center', opacity: 0.7 }}>
                    <div style={{ fontSize: '2em', marginBottom: '10px' }}>📰</div>
                    <div>Fetching latest news...</div>
                  </div>
                )}

                {/* Multi-Layer Sentiment Analysis */}
                {!isFetchingNews && newsTab === 'multi' && multiLayerNews && (() => {
                  const combined = multiLayerNews.combinedSentiment;
                  const color = combined.overall === 'POSITIVE' ? '#00ff64' : combined.overall === 'NEGATIVE' ? '#ff0064' : '#888888';
                  const emoji = combined.overall === 'POSITIVE' ? '🚀' : combined.overall === 'NEGATIVE' ? '💥' : '😐';
                  
                  return (
                    <div style={{ marginBottom: '20px' }}>
                      {/* Combined Sentiment Header */}
                      <div style={{
                        padding: '25px',
                        background: `linear-gradient(135deg, ${color}20, ${color}10)`,
                        border: `3px solid ${color}`,
                        borderRadius: '15px',
                        marginBottom: '15px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
                              <span style={{ fontSize: '3em' }}>{emoji}</span>
                              <div>
                                <h3 style={{ margin: 0, fontSize: '1.8em', color }}>
                                  {combined.overall} COMBINED SENTIMENT
                                </h3>
                                <p style={{ margin: '5px 0 0 0', fontSize: '1em', opacity: 0.9 }}>
                                  {combined.reasoning}
                                </p>
                              </div>
                            </div>
                            
                            {/* Layer Breakdown */}
                            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '15px' }}>
                              <div style={{ flex: 1, minWidth: '150px', padding: '10px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px' }}>
                                <div style={{ fontSize: '0.85em', opacity: 0.7 }}>📰 STOCK NEWS</div>
                                <div style={{ fontSize: '1.3em', fontWeight: 'bold', marginTop: '5px' }}>
                                  {multiLayerNews.stockNews.sentiment.aggregate.overall}
                                </div>
                                <div style={{ fontSize: '0.85em', opacity: 0.7, marginTop: '5px' }}>
                                  Score: {combined.layers.stock.toFixed(2)}
                                </div>
                              </div>
                              
                              {multiLayerNews.sectorNews && (
                                <div style={{ flex: 1, minWidth: '150px', padding: '10px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px' }}>
                                  <div style={{ fontSize: '0.85em', opacity: 0.7 }}>🏢 SECTOR NEWS</div>
                                  <div style={{ fontSize: '1.3em', fontWeight: 'bold', marginTop: '5px' }}>
                                    {multiLayerNews.sectorNews.sentiment.aggregate.overall}
                                  </div>
                                  <div style={{ fontSize: '0.85em', opacity: 0.7, marginTop: '5px' }}>
                                    {multiLayerNews.sectorNews.sector} / {multiLayerNews.sectorNews.industry}
                                  </div>
                                  <div style={{ fontSize: '0.75em', opacity: 0.6, marginTop: '2px' }}>
                                    Score: {combined.layers.sector.toFixed(2)}
                                  </div>
                                </div>
                              )}
                              
                              {multiLayerNews.macroNews && (
                                <div style={{ flex: 1, minWidth: '150px', padding: '10px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px' }}>
                                  <div style={{ fontSize: '0.85em', opacity: 0.7 }}>🌍 MACRO NEWS</div>
                                  <div style={{ fontSize: '1.3em', fontWeight: 'bold', marginTop: '5px' }}>
                                    {multiLayerNews.macroNews.sentiment.aggregate.overall}
                                  </div>
                                  <div style={{ fontSize: '0.85em', opacity: 0.7, marginTop: '5px' }}>
                                    {multiLayerNews.macroNews.affectedFactors[0]}
                                  </div>
                                  <div style={{ fontSize: '0.75em', opacity: 0.6, marginTop: '2px' }}>
                                    Score: {combined.layers.macro.toFixed(2)}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {/* Trading Signal */}
                          <div style={{
                            padding: '25px',
                            background: 'rgba(255, 255, 255, 0.08)',
                            borderRadius: '12px',
                            textAlign: 'center',
                            minWidth: '200px'
                          }}>
                            <div style={{ fontSize: '0.9em', opacity: 0.7, marginBottom: '8px' }}>⚡ TRADING SIGNAL</div>
                            <div style={{ fontSize: '1.8em', fontWeight: 'bold', color }}>
                              {combined.tradingSignal.signal}
                            </div>
                            <div style={{ fontSize: '1.1em', marginTop: '8px', opacity: 0.9 }}>
                              Strength: {combined.tradingSignal.strength}/10
                            </div>
                            <div style={{ fontSize: '0.9em', marginTop: '12px', opacity: 0.75, lineHeight: '1.4' }}>
                              {combined.tradingSignal.reason}
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Day Trading Signal Card */}
                      {multiLayerNews.dayTradingSignal && (() => {
                        const daySignal = multiLayerNews.dayTradingSignal;
                        let signalColor = '#888888';
                        let signalEmoji = '👀';
                        
                        if (daySignal.signal === 'STRONG BUY') {
                          signalColor = '#00ff64';
                          signalEmoji = '🚀';
                        } else if (daySignal.signal === 'BUY') {
                          signalColor = '#00ff64';
                          signalEmoji = '📈';
                        } else if (daySignal.signal === 'SHORT') {
                          signalColor = '#ff0064';
                          signalEmoji = '📉';
                        } else if (daySignal.signal === 'AVOID') {
                          signalColor = '#ff8800';
                          signalEmoji = '⚠️';
                        } else {
                          signalColor = '#4facfe';
                          signalEmoji = '👀';
                        }
                        
                        return (
                          <div style={{
                            marginTop: '20px',
                            padding: '25px',
                            background: `linear-gradient(135deg, ${signalColor}15, ${signalColor}08)`,
                            border: `2px solid ${signalColor}`,
                            borderRadius: '15px'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px' }}>
                              <div style={{ flex: 1, minWidth: '250px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '15px' }}>
                                  <span style={{ fontSize: '2.5em' }}>{signalEmoji}</span>
                                  <div>
                                    <h4 style={{ margin: 0, fontSize: '1.5em', color: signalColor }}>
                                      DAY TRADING: {daySignal.signal}
                                    </h4>
                                    <div style={{ marginTop: '5px', opacity: 0.9 }}>
                                      <span style={{ fontSize: '0.95em', fontWeight: 'bold' }}>Confidence: {daySignal.confidence}%</span>
                                      <span style={{ marginLeft: '15px', fontSize: '0.9em', opacity: 0.8 }}>⏰ {daySignal.timeframe}</span>
                                    </div>
                                  </div>
                                </div>
                                <p style={{ margin: '10px 0', fontSize: '1em', lineHeight: '1.5', opacity: 0.9 }}>
                                  {daySignal.reason}
                                </p>
                              </div>
                              
                              <div style={{
                                padding: '20px',
                                background: 'rgba(255, 255, 255, 0.05)',
                                borderRadius: '12px',
                                minWidth: '200px'
                              }}>
                                <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: '5px', textTransform: 'uppercase' }}>Strength</div>
                                <div style={{ fontSize: '2em', fontWeight: 'bold', color: signalColor }}>
                                  {daySignal.strength}/10
                                </div>
                                <div style={{
                                  width: '100%',
                                  height: '8px',
                                  background: 'rgba(255, 255, 255, 0.1)',
                                  borderRadius: '4px',
                                  marginTop: '10px',
                                  overflow: 'hidden'
                                }}>
                                  <div style={{
                                    width: `${(daySignal.strength / 10) * 100}%`,
                                    height: '100%',
                                    background: signalColor,
                                    borderRadius: '4px'
                                  }} />
                                </div>
                              </div>
                            </div>
                            
                            {/* Action Items */}
                            {daySignal.actions && daySignal.actions.length > 0 && (
                              <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                                <h5 style={{ margin: '0 0 12px 0', fontSize: '1.05em', opacity: 0.9 }}>📋 Action Plan:</h5>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                                  {daySignal.actions.map((action: string, idx: number) => (
                                    <div key={idx} style={{
                                      padding: '12px 15px',
                                      background: 'rgba(255, 255, 255, 0.05)',
                                      borderRadius: '8px',
                                      borderLeft: `3px solid ${signalColor}`,
                                      fontSize: '0.9em',
                                      lineHeight: '1.4'
                                    }}>
                                      <span style={{ opacity: 0.7, marginRight: '8px' }}>•</span>
                                      {action}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      
                      {/* Detailed News by Layer */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '15px' }}>
                        {/* Stock News */}
                        <div style={{ padding: '15px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                          <h5 style={{ margin: '0 0 10px 0', fontSize: '1.1em' }}>📰 Stock-Specific News ({multiLayerNews.stockNews.news.length})</h5>
                          {multiLayerNews.stockNews.news.slice(0, 3).map((item: any, idx: number) => (
                            <div key={idx} style={{ fontSize: '0.85em', padding: '8px 0', borderBottom: idx < 2 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none' }}>
                              <div style={{ fontWeight: 'bold', marginBottom: '3px' }}>{item.sentiment.emoji} {item.title.substring(0, 60)}...</div>
                              <div style={{ opacity: 0.6, fontSize: '0.9em' }}>{item.source}</div>
                            </div>
                          ))}
                        </div>
                        
                        {/* Sector News */}
                        {multiLayerNews.sectorNews && (
                          <div style={{ padding: '15px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                            <h5 style={{ margin: '0 0 10px 0', fontSize: '1.1em' }}>🏢 Sector News ({multiLayerNews.sectorNews.news.length})</h5>
                            {multiLayerNews.sectorNews.news.slice(0, 3).map((item: any, idx: number) => (
                              <div key={idx} style={{ fontSize: '0.85em', padding: '8px 0', borderBottom: idx < 2 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none' }}>
                                <div style={{ fontWeight: 'bold', marginBottom: '3px' }}>{item.sentiment.emoji} {item.title.substring(0, 60)}...</div>
                                <div style={{ opacity: 0.6, fontSize: '0.9em' }}>{item.source}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {/* Macro News */}
                        {multiLayerNews.macroNews && (
                          <div style={{ padding: '15px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                            <h5 style={{ margin: '0 0 10px 0', fontSize: '1.1em' }}>🌍 Macro News ({multiLayerNews.macroNews.news.length})</h5>
                            {multiLayerNews.macroNews.news.slice(0, 3).map((item: any, idx: number) => (
                              <div key={idx} style={{ fontSize: '0.85em', padding: '8px 0', borderBottom: idx < 2 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none' }}>
                                <div style={{ fontWeight: 'bold', marginBottom: '3px' }}>{item.sentiment.emoji} {item.title.substring(0, 60)}...</div>
                                <div style={{ opacity: 0.6, fontSize: '0.9em' }}>{item.source}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Sentiment Summary Card (for stock/market tabs) */}
                {!isFetchingNews && newsTab !== 'multi' && (newsTab === 'stock' ? stockSentiment : marketSentiment) && (newsTab === 'stock' ? stockNews : marketNews).length > 0 && (() => {
                  const sentiment = newsTab === 'stock' ? stockSentiment : marketSentiment;
                  const aggregate = sentiment.aggregate;
                  const trading = sentiment.trading;
                  
                  return (
                    <div style={{
                      padding: '20px',
                      background: `linear-gradient(135deg, ${aggregate.color}20, ${aggregate.color}10)`,
                      border: `2px solid ${aggregate.color}`,
                      borderRadius: '15px',
                      marginBottom: '20px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                            <span style={{ fontSize: '2.5em' }}>{aggregate.emoji}</span>
                            <div>
                              <h4 style={{ margin: 0, fontSize: '1.5em', color: aggregate.color }}>
                                {aggregate.overall} SENTIMENT
                              </h4>
                              <p style={{ margin: 0, fontSize: '0.9em', opacity: 0.8 }}>
                                {aggregate.description}
                              </p>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '20px', fontSize: '0.9em', marginTop: '10px' }}>
                            <span style={{ color: '#00ff64' }}>📈 {aggregate.positive} Positive</span>
                            <span style={{ color: '#ff0064' }}>📉 {aggregate.negative} Negative</span>
                            <span style={{ color: '#888888' }}>😐 {aggregate.neutral} Neutral</span>
                          </div>
                        </div>
                        <div style={{
                          padding: '20px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          borderRadius: '12px',
                          textAlign: 'center'
                        }}>
                          <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: '5px' }}>TRADING SIGNAL</div>
                          <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: aggregate.color }}>
                            {trading.signal}
                          </div>
                          <div style={{ fontSize: '0.9em', marginTop: '5px', opacity: 0.8 }}>
                            Strength: {trading.strength}/10
                          </div>
                          <div style={{ fontSize: '0.85em', marginTop: '10px', opacity: 0.7, maxWidth: '200px' }}>
                            {trading.reason}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* News List (only for stock/market tabs, not multi-layer) */}
                {!isFetchingNews && newsTab !== 'multi' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {(newsTab === 'stock' ? stockNews : marketNews).length === 0 ? (
                      <div style={{ padding: '40px 20px', textAlign: 'center', opacity: 0.6 }}>
                        <div style={{ fontSize: '2em', marginBottom: '10px' }}>📰</div>
                        <div>No news articles loaded yet</div>
                        <div style={{ fontSize: '0.9em', marginTop: '10px' }}>
                          Click the {newsTab === 'stock' ? `"${fundamentalData.symbol} News"` : '"Market News"'} tab to load articles
                        </div>
                      </div>
                    ) : (
                      (newsTab === 'stock' ? stockNews : marketNews).slice(0, 10).map((item, index) => (
                        <div key={index} style={{
                          padding: '15px',
                          background: 'rgba(255, 255, 255, 0.03)',
                          borderRadius: '10px',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          transition: 'all 0.2s ease',
                          cursor: 'pointer'
                        }}
                        onClick={() => window.open(item.link, '_blank')}
                        onMouseOver={(e) => {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'
                          e.currentTarget.style.transform = 'translateY(-2px)'
                          e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.5)'
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'
                          e.currentTarget.style.transform = 'translateY(0)'
                          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                        }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '15px' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                <h5 style={{ 
                                  margin: 0, 
                                  fontSize: '1.05em', 
                                  color: '#4facfe',
                                  fontWeight: 'bold',
                                  flex: 1
                                }}>
                                  {item.title}
                                </h5>
                                {item.sentiment && (
                                  <span style={{
                                    padding: '4px 12px',
                                    background: `${item.sentiment.color}20`,
                                    border: `1px solid ${item.sentiment.color}`,
                                    borderRadius: '12px',
                                    fontSize: '0.75em',
                                    fontWeight: 'bold',
                                    color: item.sentiment.color,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    <span>{item.sentiment.emoji}</span>
                                    <span>{item.sentiment.label}</span>
                                  </span>
                                )}
                              </div>
                              {item.snippet && (
                                <p style={{ 
                                  margin: 0, 
                                  marginBottom: '8px', 
                                  fontSize: '0.9em', 
                                  opacity: 0.7,
                                  lineHeight: '1.4'
                                }}>
                                  {item.snippet}
                                </p>
                              )}
                              <div style={{ 
                                display: 'flex', 
                                gap: '15px', 
                                fontSize: '0.85em', 
                                opacity: 0.6 
                              }}>
                                <span>🏢 {item.source}</span>
                                <span>⏰ {new Date(item.pubDate).toLocaleDateString()} {new Date(item.pubDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                {item.sentiment && item.sentiment.confidence > 0 && (
                                  <span>💡 {item.sentiment.confidence}% confidence</span>
                                )}
                              </div>
                            </div>
                            <div style={{ fontSize: '1.5em', opacity: 0.5 }}>
                              🔗
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!fundamentalData && !isFetchingFundamentals && (
            <div style={{
              marginTop: '30px',
              padding: '60px 20px',
              textAlign: 'center',
              background: 'rgba(102, 126, 234, 0.05)',
              border: '2px dashed rgba(102, 126, 234, 0.3)',
              borderRadius: '15px'
            }}>
              <div style={{ fontSize: '4em', marginBottom: '15px' }}>📊</div>
              <h3 style={{ marginBottom: '10px' }}>Ready to Analyze Fundamentals</h3>
              <p style={{ fontSize: '1.1em', opacity: 0.8, marginBottom: '20px' }}>
                Enter a stock symbol above to get comprehensive fundamental analysis!
              </p>
              <div style={{
                padding: '20px',
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: '10px',
                display: 'inline-block',
                textAlign: 'left'
              }}>
                <h4 style={{ marginBottom: '10px' }}>💡 What You'll Get:</h4>
                <ul style={{ marginLeft: '20px', lineHeight: '1.8' }}>
                  <li><strong>Valuation Metrics:</strong> Market Cap, P/E, P/B, Dividend Yield</li>
                  <li><strong>Profitability:</strong> ROE, Profit Margins, Operating Margins</li>
                  <li><strong>Financial Health:</strong> Debt/Equity, Current Ratio, Quick Ratio</li>
                  <li><strong>Growth:</strong> Revenue Growth, Earnings Growth</li>
                  <li><strong>Overall Score:</strong> 0-100 rating (EXCELLENT → VERY POOR)</li>
                  <li><strong>Combined Signal:</strong> Technical + Fundamental analysis together!</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MARKET DASHBOARD TAB */}
      {activeTab === 'market' && (
        <div>
          {/* Header */}
          <div className="screener-results" style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
              <div>
                <h3 style={{ marginBottom: '8px', fontSize: '2em' }}>🌐 Market Dashboard</h3>
                <p style={{ margin: 0, opacity: 0.8 }}>
                  Comprehensive market intelligence - Indices, Sectors, Breadth, Top Movers & Sentiment
                </p>
              </div>
              <button
                onClick={fetchMarketDashboard}
                disabled={isFetchingMarketDashboard}
                style={{
                  padding: '12px 30px',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  background: isFetchingMarketDashboard 
                    ? 'rgba(255, 255, 255, 0.2)' 
                    : 'linear-gradient(45deg, #667eea, #764ba2)',
                  cursor: isFetchingMarketDashboard ? 'not-allowed' : 'pointer'
                }}
              >
                {isFetchingMarketDashboard ? '🔄 Loading...' : '🔄 Refresh Dashboard'}
              </button>
            </div>
          </div>

          {/* Loading State */}
          {isFetchingMarketDashboard && (
            <div style={{
              padding: '60px 20px',
              textAlign: 'center',
              background: 'rgba(102, 126, 234, 0.1)',
              borderRadius: '15px',
              border: '2px solid rgba(102, 126, 234, 0.3)'
            }}>
              <div style={{ fontSize: '4em', marginBottom: '20px' }}>📊</div>
              <h3>Fetching Market Data...</h3>
              <p style={{ opacity: 0.7, marginTop: '10px' }}>
                Loading indices, sectors, breadth, and market sentiment
              </p>
            </div>
          )}

          {/* Market Dashboard Content */}
          {marketDashboard && marketDashboard.marketSentiment && !isFetchingMarketDashboard && (
            <div>
              {/* Market Sentiment Overview */}
              <div style={{
                marginBottom: '25px',
                padding: '30px',
                background: `linear-gradient(135deg, ${
                  marketDashboard.marketSentiment.overall === 'BULLISH' ? 'rgba(0, 255, 100, 0.2)' :
                  marketDashboard.marketSentiment.overall === 'BEARISH' ? 'rgba(255, 0, 100, 0.2)' : 'rgba(255, 193, 7, 0.2)'
                }, rgba(0, 0, 0, 0.1))`,
                border: `3px solid ${
                  marketDashboard.marketSentiment.overall === 'BULLISH' ? '#00ff64' :
                  marketDashboard.marketSentiment.overall === 'BEARISH' ? '#ff0064' : '#ffc107'
                }`,
                borderRadius: '20px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
                      <span style={{ fontSize: '4em' }}>
                        {marketDashboard.marketSentiment.overall === 'BULLISH' ? '🚀' :
                         marketDashboard.marketSentiment.overall === 'BEARISH' ? '💥' : '😐'}
                      </span>
                      <div>
                        <h2 style={{
                          margin: 0,
                          fontSize: '2.5em',
                          color: marketDashboard.marketSentiment.overall === 'BULLISH' ? '#00ff64' :
                                 marketDashboard.marketSentiment.overall === 'BEARISH' ? '#ff0064' : '#ffc107'
                        }}>
                          {marketDashboard.marketSentiment.overall}
                        </h2>
                        <p style={{ margin: '8px 0 0 0', fontSize: '1.1em', opacity: 0.9 }}>
                          {marketDashboard.marketSentiment.description}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div style={{
                    padding: '30px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    borderRadius: '15px',
                    textAlign: 'center',
                    minWidth: '150px'
                  }}>
                    <div style={{ fontSize: '0.9em', opacity: 0.7, marginBottom: '8px' }}>SENTIMENT SCORE</div>
                    <div style={{
                      fontSize: '3.5em',
                      fontWeight: 'bold',
                      color: marketDashboard.marketSentiment.overall === 'BULLISH' ? '#00ff64' :
                             marketDashboard.marketSentiment.overall === 'BEARISH' ? '#ff0064' : '#ffc107'
                    }}>
                      {marketDashboard.marketSentiment.score}
                    </div>
                    <div style={{ fontSize: '0.9em', opacity: 0.7 }}>out of 100</div>
                  </div>
                </div>
              </div>

              {/* 🎯 STOCK SPOTLIGHT - Detailed Intelligence */}
              {marketDashboard.stockSpotlight && marketDashboard.stockSpotlight.length > 0 && (
                <div className="screener-results" style={{ marginBottom: '25px' }}>
                  <h4 style={{ marginBottom: '15px', fontSize: '1.5em' }}>🎯 Stock Spotlight - Market Intelligence</h4>
                  <p style={{ margin: '0 0 20px 0', opacity: 0.8, fontSize: '1.05em' }}>
                    Detailed analysis of key market movers with actionable insights
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {marketDashboard.stockSpotlight.map((stock: any, idx: number) => {
                      const signalColor = 
                        stock.signal === 'STRONG_BUY' ? '#00ff64' :
                        stock.signal === 'MOMENTUM_BUY' ? '#4ade80' :
                        stock.signal === 'BUY' ? '#a3e635' :
                        stock.signal === 'SHORT' ? '#ff0064' :
                        stock.signal === 'SELL' ? '#f87171' : '#ffc107';
                      
                      const signalBg = 
                        stock.signal === 'STRONG_BUY' || stock.signal === 'MOMENTUM_BUY' || stock.signal === 'BUY' ? 
                        'linear-gradient(135deg, rgba(0, 255, 100, 0.15), rgba(0, 255, 100, 0.05))' :
                        stock.signal === 'SHORT' || stock.signal === 'SELL' ?
                        'linear-gradient(135deg, rgba(255, 0, 100, 0.15), rgba(255, 0, 100, 0.05))' :
                        'linear-gradient(135deg, rgba(255, 193, 7, 0.15), rgba(255, 193, 7, 0.05))';
                      
                      const riskColor = 
                        stock.risk === 'HIGH' ? '#ff0064' :
                        stock.risk === 'MODERATE' ? '#ffc107' : '#00ff64';
                      
                      return (
                        <div key={idx} style={{
                          padding: '25px',
                          background: signalBg,
                          border: `2px solid ${signalColor}40`,
                          borderRadius: '15px',
                          position: 'relative'
                        }}>
                          {/* Header */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: '15px', marginBottom: '20px' }}>
                            <div style={{ flex: 1, minWidth: '200px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                                <h3 style={{ margin: 0, fontSize: '2em', fontWeight: 'bold' }}>{stock.symbol}</h3>
                                <span style={{
                                  padding: '6px 14px',
                                  background: `${signalColor}30`,
                                  border: `2px solid ${signalColor}`,
                                  borderRadius: '8px',
                                  fontSize: '1em',
                                  fontWeight: 'bold',
                                  color: signalColor,
                                  textTransform: 'uppercase'
                                }}>
                                  {stock.signal.replace('_', ' ')}
                                </span>
                                <div style={{ display: 'flex', gap: '2px' }}>
                                  {[...Array(5)].map((_, i) => (
                                    <span key={i} style={{ 
                                      color: i < stock.signalStrength ? signalColor : 'rgba(255, 255, 255, 0.2)',
                                      fontSize: '1.2em'
                                    }}>★</span>
                                  ))}
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: '15px', fontSize: '0.95em', opacity: 0.8 }}>
                                <span>Sector: <strong>{stock.sector}</strong></span>
                                <span>Risk: <strong style={{ color: riskColor }}>{stock.risk}</strong></span>
                              </div>
                            </div>
                            
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '2.5em', fontWeight: 'bold', marginBottom: '5px' }}>
                                ₹{stock.current.toFixed(2)}
                              </div>
                              <div style={{
                                fontSize: '1.5em',
                                fontWeight: 'bold',
                                color: stock.changePercent >= 0 ? '#00ff64' : '#ff0064'
                              }}>
                                {stock.changePercent >= 0 ? '▲' : '▼'} {Math.abs(stock.changePercent).toFixed(2)}%
                              </div>
                              <div style={{ fontSize: '0.9em', opacity: 0.7, marginTop: '5px' }}>
                                Vol: {(stock.volume / 100000).toFixed(1)}L ({stock.volumeRatio.toFixed(1)}x avg)
                              </div>
                            </div>
                          </div>
                          
                          {/* Analysis */}
                          <div style={{
                            padding: '20px',
                            background: 'rgba(0, 0, 0, 0.3)',
                            borderRadius: '10px',
                            marginBottom: '20px'
                          }}>
                            <div style={{ fontSize: '1.1em', lineHeight: '1.7', marginBottom: '15px' }}>
                              {stock.analysis}
                            </div>
                            <div style={{ fontSize: '0.95em', opacity: 0.9, fontStyle: 'italic' }}>
                              {stock.priceAction}
                            </div>
                          </div>
                          
                          {/* Key Factors */}
                          <div style={{ marginBottom: '20px' }}>
                            <h4 style={{ fontSize: '1.1em', marginBottom: '12px', opacity: 0.9 }}>📊 Key Factors:</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                              {stock.keyFactors.map((factor: string, i: number) => (
                                <div key={i} style={{
                                  padding: '10px 15px',
                                  background: 'rgba(0, 0, 0, 0.2)',
                                  borderRadius: '8px',
                                  fontSize: '0.95em',
                                  border: '1px solid rgba(255, 255, 255, 0.1)'
                                }}>
                                  {factor}
                                </div>
                              ))}
                            </div>
                          </div>
                          
                          {/* Recommendation */}
                          <div style={{
                            padding: '20px',
                            background: `${signalColor}10`,
                            border: `2px solid ${signalColor}40`,
                            borderRadius: '10px'
                          }}>
                            <h4 style={{ 
                              fontSize: '1.1em',
                              marginBottom: '10px',
                              color: signalColor,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}>
                              💡 Trading Strategy
                            </h4>
                            <p style={{ margin: 0, fontSize: '1.05em', lineHeight: '1.6' }}>
                              {stock.recommendation}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Indices Grid */}
              {marketDashboard.indices && marketDashboard.indices.length > 0 && (
                <div className="screener-results" style={{ marginBottom: '25px' }}>
                  <h4 style={{ marginBottom: '15px' }}>📊 Indices</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                    {marketDashboard.indices.map((index: any, idx: number) => {
                    const changeColor = index.changePercent >= 0 ? '#00ff64' : '#ff0064';
                    return (
                      <div key={idx} className="card" style={{ padding: '20px' }}>
                        <div style={{ fontSize: '1.1em', fontWeight: 'bold', marginBottom: '10px', opacity: 0.9 }}>
                          {index.name}
                        </div>
                        <div style={{ fontSize: '2em', fontWeight: 'bold', marginBottom: '5px' }}>
                          {index.current.toFixed(2)}
                        </div>
                        <div style={{
                          fontSize: '1.2em',
                          fontWeight: 'bold',
                          color: changeColor,
                          marginBottom: '10px'
                        }}>
                          {index.changePercent >= 0 ? '▲' : '▼'} {Math.abs(index.changePercent).toFixed(2)}%
                        </div>
                        <div style={{ fontSize: '0.85em', opacity: 0.6, lineHeight: '1.6' }}>
                          <div>High: {index.high.toFixed(2)}</div>
                          <div>Low: {index.low.toFixed(2)}</div>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              )}

              {/* Market Breadth */}
              {marketDashboard.marketBreadth && (
                <div className="screener-results" style={{ marginBottom: '25px' }}>
                  <h4 style={{ marginBottom: '15px' }}>📊 Market Breadth</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                  <div className="card" style={{
                    padding: '20px',
                    background: 'rgba(0, 255, 100, 0.1)',
                    border: '2px solid rgba(0, 255, 100, 0.3)'
                  }}>
                    <div style={{ fontSize: '0.9em', opacity: 0.7, marginBottom: '5px' }}>Advancers</div>
                    <div style={{ fontSize: '3em', fontWeight: 'bold', color: '#00ff64' }}>
                      {marketDashboard.marketBreadth.advancers}
                    </div>
                  </div>
                  <div className="card" style={{
                    padding: '20px',
                    background: 'rgba(255, 0, 100, 0.1)',
                    border: '2px solid rgba(255, 0, 100, 0.3)'
                  }}>
                    <div style={{ fontSize: '0.9em', opacity: 0.7, marginBottom: '5px' }}>Decliners</div>
                    <div style={{ fontSize: '3em', fontWeight: 'bold', color: '#ff0064' }}>
                      {marketDashboard.marketBreadth.decliners}
                    </div>
                  </div>
                  <div className="card" style={{ padding: '20px' }}>
                    <div style={{ fontSize: '0.9em', opacity: 0.7, marginBottom: '5px' }}>A/D Ratio</div>
                    <div style={{ fontSize: '3em', fontWeight: 'bold' }}>
                      {marketDashboard.marketBreadth.advanceDeclineRatio.toFixed(2)}
                    </div>
                    <div style={{
                      marginTop: '10px',
                      padding: '5px 12px',
                      background: `${
                        marketDashboard.marketBreadth.sentiment === 'STRONG_BULLISH' || marketDashboard.marketBreadth.sentiment === 'BULLISH' ? 'rgba(0, 255, 100, 0.2)' :
                        marketDashboard.marketBreadth.sentiment === 'STRONG_BEARISH' || marketDashboard.marketBreadth.sentiment === 'BEARISH' ? 'rgba(255, 0, 100, 0.2)' : 'rgba(255, 193, 7, 0.2)'
                      }`,
                      borderRadius: '6px',
                      fontSize: '0.85em',
                      fontWeight: 'bold',
                      textAlign: 'center'
                    }}>
                      {marketDashboard.marketBreadth.sentiment.replace('_', ' ')}
                    </div>
                  </div>
                </div>
                </div>
              )}

              {/* Sector Performance */}
              {marketDashboard.sectorPerformance && marketDashboard.sectorPerformance.length > 0 && (
                <div className="screener-results" style={{ marginBottom: '25px' }}>
                  <h4 style={{ marginBottom: '15px' }}>🎨 Sector Performance</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '15px' }}>
                  {marketDashboard.sectorPerformance
                    .sort((a: any, b: any) => b.change - a.change)
                    .map((sector: any, idx: number) => {
                      const changeColor = sector.change >= 0 ? '#00ff64' : '#ff0064';
                      const sentimentColor = sector.sentiment === 'BULLISH' ? '#00ff64' :
                                             sector.sentiment === 'BEARISH' ? '#ff0064' : '#ffc107';
                      return (
                        <div key={idx} className="card" style={{ padding: '20px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <div style={{ fontSize: '1.2em', fontWeight: 'bold' }}>{sector.sector}</div>
                            <div style={{
                              padding: '4px 10px',
                              background: `${sentimentColor}20`,
                              border: `1px solid ${sentimentColor}`,
                              borderRadius: '8px',
                              fontSize: '0.75em',
                              fontWeight: 'bold',
                              color: sentimentColor
                            }}>
                              {sector.sentiment}
                            </div>
                          </div>
                          <div style={{
                            fontSize: '2.5em',
                            fontWeight: 'bold',
                            color: changeColor,
                            marginBottom: '10px'
                          }}>
                            {sector.change >= 0 ? '+' : ''}{sector.change.toFixed(2)}%
                          </div>
                          <div style={{ fontSize: '0.9em', opacity: 0.8, lineHeight: '1.6' }}>
                            <div>🔼 Top: {sector.topGainer}</div>
                            <div>🔽 Bottom: {sector.topLoser}</div>
                            <div style={{ marginTop: '8px', opacity: 0.6 }}>
                              {sector.stocksUp} up • {sector.stocksDown} down
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
                </div>
              )}

              {/* Top Gainers & Losers */}
              {marketDashboard.topGainers && marketDashboard.topLosers && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px', marginBottom: '25px' }}>
                  {/* Top Gainers */}
                  <div className="screener-results">
                    <h4 style={{ marginBottom: '15px' }}>🚀 Top Gainers</h4>
                  <table className="screener-table">
                    <thead>
                      <tr>
                        <th>Symbol</th>
                        <th>Price</th>
                        <th>Change</th>
                        <th>Volume</th>
                      </tr>
                    </thead>
                    <tbody>
                      {marketDashboard.topGainers.slice(0, 5).map((stock: any, idx: number) => (
                        <tr key={idx}>
                          <td><strong>{stock.symbol}</strong></td>
                          <td>₹{stock.current.toFixed(2)}</td>
                          <td className="positive">
                            +{stock.changePercent.toFixed(2)}%
                          </td>
                          <td>{(stock.volume / 100000).toFixed(1)}L</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Top Losers */}
                <div className="screener-results">
                  <h4 style={{ marginBottom: '15px' }}>💥 Top Losers</h4>
                  <table className="screener-table">
                    <thead>
                      <tr>
                        <th>Symbol</th>
                        <th>Price</th>
                        <th>Change</th>
                        <th>Volume</th>
                      </tr>
                    </thead>
                    <tbody>
                      {marketDashboard.topLosers.slice(0, 5).map((stock: any, idx: number) => (
                        <tr key={idx}>
                          <td><strong>{stock.symbol}</strong></td>
                          <td>₹{stock.current.toFixed(2)}</td>
                          <td className="negative">
                            {stock.changePercent.toFixed(2)}%
                          </td>
                          <td>{(stock.volume / 100000).toFixed(1)}L</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}

              {/* Market Alerts */}
              {marketDashboard.alerts && marketDashboard.alerts.length > 0 && (
                <div className="screener-results" style={{
                  background: 'rgba(255, 193, 7, 0.1)',
                  border: '2px solid rgba(255, 193, 7, 0.4)'
                }}>
                  <h4 style={{ marginBottom: '15px', color: '#ffc107' }}>⚠️ Market Alerts</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {marketDashboard.alerts.map((alert: any, idx: number) => (
                      <div key={idx} style={{
                        padding: '15px',
                        background: 'rgba(0, 0, 0, 0.3)',
                        borderRadius: '10px',
                        border: '1px solid rgba(255, 193, 7, 0.3)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <div style={{ fontSize: '1.1em', fontWeight: 'bold', color: '#ffc107' }}>
                            {alert.type.replace('_', ' ')}
                          </div>
                          <div style={{
                            padding: '4px 12px',
                            background: alert.severity === 'HIGH' ? 'rgba(255, 0, 100, 0.2)' :
                                       alert.severity === 'MEDIUM' ? 'rgba(255, 193, 7, 0.2)' : 'rgba(0, 255, 100, 0.2)',
                            border: `1px solid ${alert.severity === 'HIGH' ? '#ff0064' : alert.severity === 'MEDIUM' ? '#ffc107' : '#00ff64'}`,
                            borderRadius: '6px',
                            fontSize: '0.8em',
                            fontWeight: 'bold'
                          }}>
                            {alert.severity}
                          </div>
                        </div>
                        <p style={{ margin: 0, opacity: 0.9, lineHeight: '1.5' }}>{alert.message}</p>
                        {alert.action && (
                          <div style={{ marginTop: '10px', fontSize: '0.9em', opacity: 0.8 }}>
                            💡 <strong>Action:</strong> {alert.action}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Timestamp */}
              <div style={{ marginTop: '20px', textAlign: 'center', opacity: 0.6, fontSize: '0.9em' }}>
                📅 Last updated: {new Date(marketDashboard.timestamp).toLocaleString()}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!marketDashboard && !isFetchingMarketDashboard && (
            <div style={{
              marginTop: '30px',
              padding: '60px 20px',
              textAlign: 'center',
              background: 'rgba(102, 126, 234, 0.05)',
              border: '2px dashed rgba(102, 126, 234, 0.3)',
              borderRadius: '15px'
            }}>
              <div style={{ fontSize: '4em', marginBottom: '15px' }}>🌐</div>
              <h3 style={{ marginBottom: '10px' }}>Market Dashboard Ready</h3>
              <p style={{ fontSize: '1.1em', opacity: 0.8, marginBottom: '20px' }}>
                Click "Refresh Dashboard" to load comprehensive market intelligence!
              </p>
              <div style={{
                padding: '20px',
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: '10px',
                display: 'inline-block',
                textAlign: 'left'
              }}>
                <h4 style={{ marginBottom: '10px' }}>💡 What You'll Get:</h4>
                <ul style={{ marginLeft: '20px', lineHeight: '1.8' }}>
                  <li><strong>Indices:</strong> Real-time NIFTY, BANK, IT, AUTO, PHARMA levels</li>
                  <li><strong>Market Sentiment:</strong> Overall bullish/bearish market mood</li>
                  <li><strong>Market Breadth:</strong> Advance/Decline ratio, 52-week highs/lows</li>
                  <li><strong>Sector Performance:</strong> Which sectors are leading/lagging</li>
                  <li><strong>Top Movers:</strong> Biggest gainers and losers of the day</li>
                  <li><strong>Market Alerts:</strong> Significant events and actionable insights</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        ${require('./styles').default}
      `}</style>
    </div>
  )
}
