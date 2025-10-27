"use client"

import { useState, useEffect } from 'react'
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
  const [isDemoData, setIsDemoData] = useState(false)
  const [intradayStockInput, setIntradayStockInput] = useState('')
  const [screenerLevel, setScreenerLevel] = useState<'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE'>('MODERATE')
  
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
      alert('Please login first')
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

    for (const symbol of intradayWatchlist) {
      try {
        // Fetch current quote
        const data = await fetchStockQuote(symbol)
        if (!data) continue

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
      entryPrice,
      quantity,
      type,
      entryTime: new Date(),
      currentPrice: entryPrice,
      pnl: 0,
      pnlPercent: 0
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
    
    alert(`✅ Position closed: ${symbol}\nP&L: ₹${pnl.toFixed(2)} (${((pnl / (position.entryPrice * position.quantity)) * 100).toFixed(2)}%)`)
  }

  async function updatePositionPrices() {
    // Update current prices for all open positions
    const updatedPositions = await Promise.all(
      intradayPositions.map(async (position) => {
        try {
          const data = await fetchStockQuote(position.symbol)
          if (data) {
            const pnl = position.type === 'BUY' 
              ? (data.current - position.entryPrice) * position.quantity
              : (position.entryPrice - data.current) * position.quantity
            
            const pnlPercent = (pnl / (position.entryPrice * position.quantity)) * 100
            
            return {
              ...position,
              currentPrice: data.current,
              pnl: Number(pnl),
              pnlPercent: Number(pnlPercent)
            }
          }
        } catch (err) {
          console.error(`Failed to update price for ${position.symbol}`)
        }
        return position
      })
    )
    
    setIntradayPositions(updatedPositions)
    alert('✅ Prices updated successfully!')
  }

  function addMockPositions() {
    const mockPositions: Position[] = [
      {
        symbol: 'RELIANCE',
        entryPrice: 2830.50,
        quantity: 10,
        type: 'BUY',
        entryTime: new Date(Date.now() - 1000 * 60 * 45), // 45 min ago
        currentPrice: 2858.20,
        pnl: 277.00,
        pnlPercent: 0.98
      },
      {
        symbol: 'HDFCBANK',
        entryPrice: 1635.80,
        quantity: 15,
        type: 'BUY',
        entryTime: new Date(Date.now() - 1000 * 60 * 30), // 30 min ago
        currentPrice: 1648.50,
        pnl: 190.50,
        pnlPercent: 0.78
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

                      {/* Action Button */}
                      <button 
                        onClick={() => addToWatchlist(signal.symbol)}
                        style={{ 
                          width: '100%', 
                          marginTop: '15px',
                          padding: '12px',
                          fontSize: '1em',
                          fontWeight: 'bold'
                        }}
                      >
                        📊 Add to Watchlist
                      </button>
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
                disabled={intradayPositions.length === 0 || !authStatus.authenticated}
                style={{ 
                  flex: 1,
                  padding: '12px',
                  fontSize: '15px',
                  background: 'rgba(79, 172, 254, 0.2)',
                  border: '1px solid rgba(79, 172, 254, 0.5)'
                }}
              >
                🔄 Update Prices
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
              <div style={{ display: 'grid', gap: '20px' }}>
                {intradayPositions.map((position, idx) => {
                  const pnlColor = Number(position.pnl || 0) >= 0 
                    ? { bg: 'rgba(0, 255, 100, 0.1)', border: '#00ff64', text: '#00ff64' }
                    : { bg: 'rgba(255, 0, 100, 0.1)', border: '#ff0064', text: '#ff0064' }

                  const timeHeld = Math.floor((Date.now() - position.entryTime.getTime()) / 1000 / 60)

                  return (
                    <div 
                      key={idx}
                      className="card"
                      style={{
                        background: pnlColor.bg,
                        border: `2px solid ${pnlColor.border}`,
                        position: 'relative'
                      }}
                    >
                      {/* Position Type Badge */}
                      <div style={{
                        position: 'absolute',
                        top: '15px',
                        right: '15px',
                        padding: '6px 12px',
                        background: position.type === 'BUY' ? '#00ff64' : '#ff0064',
                        color: '#000',
                        borderRadius: '6px',
                        fontSize: '0.85em',
                        fontWeight: 'bold'
                      }}>
                        {position.type}
                      </div>

                      {/* Symbol and Price */}
                      <div style={{ marginBottom: '20px' }}>
                        <h2 style={{ fontSize: '1.8em', margin: 0 }}>
                          {position.symbol}
                        </h2>
                        <div style={{ 
                          fontSize: '1.1em', 
                          color: 'rgba(255, 255, 255, 0.7)',
                          marginTop: '5px'
                        }}>
                          Entry: ₹{position.entryPrice.toFixed(2)} × {position.quantity} shares
                        </div>
                        <div style={{ fontSize: '0.9em', color: 'rgba(255, 255, 255, 0.5)' }}>
                          {timeHeld} minutes ago
                        </div>
                      </div>

                      {/* P&L Display */}
                      <div style={{
                        padding: '20px',
                        background: 'rgba(0, 0, 0, 0.3)',
                        borderRadius: '10px',
                        marginBottom: '15px'
                      }}>
                        <div className="indicators">
                          <div className="indicator">
                            <div className="indicator-label">Current Price</div>
                            <div className="indicator-value">
                              ₹{position.currentPrice.toFixed(2)}
                            </div>
                          </div>

                          <div className="indicator">
                            <div className="indicator-label">P&L</div>
                            <div className="indicator-value" style={{ color: pnlColor.text }}>
                              {Number(position.pnl || 0) >= 0 ? '+' : ''}₹{Number(position.pnl || 0).toFixed(2)}
                            </div>
                            <div style={{ fontSize: '0.8em', color: 'rgba(255, 255, 255, 0.6)' }}>
                              {Number(position.pnlPercent || 0) >= 0 ? '+' : ''}{Number(position.pnlPercent || 0).toFixed(2)}%
                            </div>
                          </div>

                          <div className="indicator">
                            <div className="indicator-label">Total Value</div>
                            <div className="indicator-value">
                              ₹{(position.currentPrice * position.quantity).toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button 
                          onClick={() => exitPosition(position.symbol)}
                          style={{
                            flex: 1,
                            padding: '12px',
                            fontSize: '1em',
                            fontWeight: 'bold',
                            background: pnlColor.border,
                            color: '#000',
                            border: 'none'
                          }}
                        >
                          🚪 Close Position
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
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
