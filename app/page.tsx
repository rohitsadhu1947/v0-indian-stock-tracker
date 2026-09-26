"use client"

import React, { useEffect, Suspense, lazy } from 'react'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useWatchlistStore, type StockData } from '@/lib/stores/watchlist-store'
import { usePositionsStore } from '@/lib/stores/positions-store'
import { useMarketStore } from '@/lib/stores/market-store'
import { useUIStore } from '@/lib/stores/ui-store'
import ResearchTab from './components/ResearchTab'
import TradeNowTab from './components/TradeNowTab'
import NewsPopTab from './components/NewsPopTab'
// SectorRotationTab merged into MarketTab
import DataTab from './components/DataTab'
import SettingsTab from './components/SettingsTab'
import BacktestTab from './components/BacktestTab'
// MacroDashboard merged into MarketTab
import RiskDashboard from './components/RiskDashboard'
import { generateTradingSignal } from '@/lib/market-utils'
import { fetchStockQuote } from '@/lib/stock-fetcher'
import { TabErrorBoundary } from './components/TabErrorBoundary'

// WatchlistTab removed — use Portfolio tab for position analysis
const IntradayTab = lazy(() => import('./components/IntradayTab'))
const UniverseTab = lazy(() => import('./components/UniverseTab'))
const FundamentalsTab = lazy(() => import('./components/FundamentalsTab'))
const MarketTab = lazy(() => import('./components/MarketTab'))
const MomentumTab = lazy(() => import('./components/MomentumTab'))
const PortfolioAnalyst = lazy(() => import('./components/PortfolioAnalyst'))
const MonthlyPlanTab = lazy(() => import('./components/MonthlyPlanTab'))

export default function StockTracker() {
  // ── Auth store ────────────────────────────────────────────────────────────
  const {
    authStatus, setAuthStatus,
    userRole, setUserRole,
    authLoading, setAuthLoading,
    isLoggingOut, setIsLoggingOut,
    brokerExpired, setBrokerExpired,
  } = useAuthStore()

  // ── Watchlist store ───────────────────────────────────────────────────────
  const {
    watchlist, setWatchlist,
    stockData, setStockData,
    updateStockData,
    stockInput, setStockInput,
    exchange, setExchange,
    setScreenerResults,
    appendActiveSignals,
    screenerGroups, setScreenerGroups,
    activeScreenerGroup, setActiveScreenerGroup,
  } = useWatchlistStore()

  // ── Positions store ───────────────────────────────────────────────────────
  const {
    setIntradayPositions,
    setTotalPnL,
    setIntradayWatchlist,
    isPaperMode,
    paperPositions, setPaperPositions,
    isExecutingTrade, setIsExecutingTrade,
  } = usePositionsStore()

  // ── Market store ──────────────────────────────────────────────────────────
  const {
    momentumCapital,
    momentumMaxPositions,
    setMarketCloseAnalysis,
  } = useMarketStore()

  // ── UI store ──────────────────────────────────────────────────────────────
  const {
    activeTab, setActiveTab,
    isLoading, setIsLoading,
    error, setError,
  } = useUIStore()

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

  // 🚀 AUTO-FETCH: Fetch stock data when watchlist is loaded
  useEffect(() => {
    if (!authStatus.authenticated || watchlist.length === 0) return
    
    console.log(`🚀 Auto-fetching data for ${watchlist.length} stocks...`)
    updateWatchlist()
  }, [watchlist.length, authStatus.authenticated])

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

  // Check authentication on mount (uses UNIFIED session API)
  useEffect(() => {
    async function checkAuth() {
      try {
        // Use unified session endpoint that works for BOTH auth systems
        const res = await fetch('/api/auth/session')
        
        if (!res.ok) {
          // Not authenticated - redirect to login
          console.log('❌ Not authenticated, redirecting to login')
          window.location.href = '/login'
          return
        }
        
        const data = await res.json()
        
        if (data.authenticated && data.user) {
          // Set auth status
          setAuthStatus({ 
            authenticated: true, 
            user: { userId: data.user.id.toString() } 
          })
          
          // Set user role from API (no more hardcoding!)
          setUserRole(data.user.role)
          
          console.log('✅ Authenticated:', data.user.email, '| Role:', data.user.role, '| Method:', data.authMethod)
          
          setAuthLoading(false) // Auth check complete!
          return
        }
        
        // No valid session - redirect to login
        window.location.href = '/login'
      } catch (err) {
        console.error('Auth check failed:', err)
        window.location.href = '/login'
      }
    }
    checkAuth()
  }, [])

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
      // Set logging out state to show loading screen
      setIsLoggingOut(true)
      
      // Logout from both systems (new and legacy)
      await Promise.all([
        fetch('/api/auth/logout', { method: 'POST' }).catch(() => {}), // New auth
        fetch('/api/auth/kite/logout', { method: 'POST' }).catch(() => {}), // Legacy Kite auth
      ])
      
      setAuthStatus({ authenticated: false, user: null })
      setStockData({})
      setError(null)
      
      // Redirect to login page
      window.location.href = '/login'
    } catch (err) {
      console.error('Error logging out:', err)
      setIsLoggingOut(false)
    }
  }

          async function updateWatchlist() {
    if (isLoading || !authStatus.authenticated) return
    
    setIsLoading(true)
    setError(null)
    
    // 🚀 PARALLEL FETCHING - Fetch all stocks at once!
    console.log(`⚡ Fetching data for ${watchlist.length} stocks in parallel...`)
    
    const fetchPromises = watchlist.map(symbol => fetchStockQuote(symbol))
    const results = await Promise.all(fetchPromises)
    
    const newStockData: Record<string, StockData> = {}
    const newActiveSignals: any[] = []
    
    results.forEach((data, index) => {
      if (data) {
        const symbol = watchlist[index]
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
    })

    setStockData(newStockData)
    appendActiveSignals(newActiveSignals)
    setIsLoading(false)
    console.log(`✅ Fetched ${Object.keys(newStockData).length} stocks in parallel!`)
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
          updateStockData(symbol, data)
        }
      })
    }
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
    // setActiveTab('screener') // DEPRECATED - screener tab removed
            
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
    
    // 🗄️ Save screener results to database
    if (authStatus.authenticated && results.length > 0) {
      try {
        const signalCount = results.filter(r => r.signal === 'BUY' || r.signal === 'STRONG BUY').length
        console.log(`💾 Saving screener results to database (${results.length} stocks, ${signalCount} signals)...`)
        
        const response = await fetch('/api/screener', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            screenerType: 'custom',
            screenerLevel: null,
            results: results,
            totalStocks: stocksToScreen.length,
            signalCount: signalCount
          })
        })
        
        const result = await response.json()
        if (result.success) {
          console.log(`✅ Screener results saved to database!`)
        } else {
          console.error('❌ Failed to save screener results:', result.error)
        }
      } catch (error) {
        console.error('❌ Error saving screener results:', error)
      }
    }
    
    setIsLoading(false)
  }

  // 🔔 Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          console.log('✅ Notification permission granted')
        }
      })
    }
  }, [])



  // 🔒 EARLY RETURN: Show loading while checking auth, don't show "not authenticated" yet
  if (authLoading || isLoggingOut) {
    return (
      <div className="container" style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: '20px'
      }}>
        <div style={{
          width: '60px',
          height: '60px',
          border: '4px solid rgba(0, 255, 255, 0.2)',
          borderTop: '4px solid #00ffff',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <h2 style={{ color: '#00ffff', margin: 0 }}>
          {isLoggingOut ? 'Logging out...' : 'Loading...'}
        </h2>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  if (!authStatus.authenticated) {
    return (
      <div className="container">
        <h1>⚡ Vibe Trades</h1>
        
        <div className="alert warning">
          <strong>🔐 Authentication Required</strong>
          <p style={{ marginTop: '10px' }}>Catch the vibe, stack the cash 💸</p>
          <p style={{ marginTop: '5px', fontSize: '0.95em' }}>Login with your Zerodha account to access live NSE/BSE market data.</p>
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
            <li>⚡ Real-time NSE/BSE stock quotes via Zerodha Kite Connect</li>
            <li>🧠 AI-powered technical analysis (RSI, MACD, Bollinger Bands)</li>
            <li>🎯 Automated trading signals (Buy/Sell/Hold)</li>
            <li>💎 Master scoring system (Technical + Fundamental + Intelligence)</li>
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
      <h1>⚡ Vibe Trades <span style={{ fontSize: '0.6em', color: '#FCD34D', fontWeight: 'normal' }}>- Do I Smell Money? 💸</span></h1>

      <div className={error ? "alert warning" : "alert"}>
        {error ? (
          <>
            <strong>⚠️ Error:</strong> {error}
          </>
        ) : (
          <>
            <strong>✅ Connected:</strong> Logged in as {authStatus.user?.userId}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <a href="https://github.com/rohitsadhu1947/v0-indian-stock-tracker/blob/main/USER_GUIDE.md" target="_blank" rel="noopener noreferrer" className="tab" style={{ textDecoration: 'none', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>📚 Guide</a>
              <a href="https://github.com/rohitsadhu1947/v0-indian-stock-tracker/blob/main/QUICK_REFERENCE.md" target="_blank" rel="noopener noreferrer" className="tab" style={{ textDecoration: 'none', background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}>🚀 Quick Ref</a>
              <button className={`tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>⚙️ Settings</button>
              <button className={`tab ${activeTab === 'backtest' ? 'active' : ''}`} onClick={() => setActiveTab('backtest')}>🔬 Backtest</button>
              {userRole === 'admin' && <button className={`tab ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => setActiveTab('admin')}>👑 Admin</button>}
              <button className="tab" onClick={handleLogout}>Logout</button>
            </div>
          </>
        )}
      </div>

      {brokerExpired && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(234,179,8,0.15), rgba(234,179,8,0.05))',
          border: '1px solid rgba(234,179,8,0.4)',
          borderRadius: '12px',
          padding: '12px 20px',
          marginBottom: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
        }}>
          <div>
            <strong style={{ color: '#eab308' }}>Broker Token Expired</strong>
            <span style={{ color: '#a3a3a3', fontSize: '13px', marginLeft: '8px' }}>
              Zerodha token needs daily refresh. Reconnect to resume live data.
            </span>
          </div>
          <button
            onClick={() => setActiveTab('admin')}
            style={{
              background: 'linear-gradient(135deg, #eab308, #ca8a04)',
              color: '#000',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 20px',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontSize: '13px',
            }}
          >
            Reconnect
          </button>
        </div>
      )}

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
          className={`tab ${activeTab === 'plan' ? 'active' : ''}`}
          onClick={() => setActiveTab('plan')}
          style={{
            background: activeTab === 'plan' ? 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)' : undefined,
            fontWeight: activeTab === 'plan' ? 'bold' : undefined,
            color: activeTab === 'plan' ? '#fff' : undefined,
          }}
        >
          🧭 Monthly Plan
        </button>
        <button
          className={`tab ${activeTab === 'portfolio' ? 'active' : ''}`}
          onClick={() => setActiveTab('portfolio')}
          style={{
            background: activeTab === 'portfolio' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : undefined,
            fontWeight: activeTab === 'portfolio' ? 'bold' : undefined,
            color: activeTab === 'portfolio' ? '#fff' : undefined,
          }}
        >
          💼 Portfolio
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
          onClick={() => setActiveTab('market')}
        >
          🌐 Market
        </button>
        <button
          className={`tab ${activeTab === 'tradenow' ? 'active' : ''}`}
          onClick={() => setActiveTab('tradenow')}
          style={{
            background: activeTab === 'tradenow' ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)' : undefined,
            fontWeight: activeTab === 'tradenow' ? 'bold' : undefined
          }}
        >
          🎯 TRADE NOW
        </button>
        <button 
          className={`tab ${activeTab === 'newspop' ? 'active' : ''}`}
          onClick={() => setActiveTab('newspop')}
          style={{
            background: activeTab === 'newspop' ? 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)' : undefined,
            fontWeight: activeTab === 'newspop' ? 'bold' : undefined
          }}
        >
          📰 News Pops
        </button>
        <button 
          className={`tab ${activeTab === 'momentum' ? 'active' : ''}`}
          onClick={() => setActiveTab('momentum')}
        >
          💰 Momentum
        </button>
        <button 
          className={`tab ${activeTab === 'research' ? 'active' : ''}`}
          onClick={() => setActiveTab('research')}
        >
          📊 Research
        </button>
        <button 
          className={`tab ${activeTab === 'data' ? 'active' : ''}`}
          onClick={() => setActiveTab('data')}
          style={{
            background: activeTab === 'data' ? 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)' : undefined,
            fontWeight: activeTab === 'data' ? 'bold' : undefined
          }}
        >
          📁 Data
        </button>
      </div>

      {activeTab === 'plan' && <Suspense fallback={<div className="loading">Loading...</div>}><TabErrorBoundary tabName="Monthly Plan"><MonthlyPlanTab /></TabErrorBoundary></Suspense>}


      {activeTab === 'portfolio' && <Suspense fallback={<div className="loading">Loading...</div>}><TabErrorBoundary tabName="Portfolio"><PortfolioAnalyst /></TabErrorBoundary></Suspense>}

      {activeTab === 'intraday' && <Suspense fallback={<div className="loading">Loading...</div>}><TabErrorBoundary tabName="Intraday"><IntradayTab /></TabErrorBoundary></Suspense>}

      {activeTab === 'universe' && <Suspense fallback={<div className="loading">Loading...</div>}><TabErrorBoundary tabName="Universe"><UniverseTab /></TabErrorBoundary></Suspense>}

      {/* FUNDAMENTALS TAB */}
      {activeTab === 'fundamentals' && <Suspense fallback={<div className="loading">Loading...</div>}><TabErrorBoundary tabName="Fundamentals"><FundamentalsTab /></TabErrorBoundary></Suspense>}

      {/* MARKET DASHBOARD TAB */}
      {activeTab === 'market' && <Suspense fallback={<div className="loading">Loading...</div>}><TabErrorBoundary tabName="Market"><MarketTab /></TabErrorBoundary></Suspense>}

      {/* 💰 MOMENTUM SCANNER TAB */}
      {activeTab === 'momentum' && <Suspense fallback={<div className="loading">Loading...</div>}><TabErrorBoundary tabName="Momentum"><MomentumTab /></TabErrorBoundary></Suspense>}

      {/* 🎯 TRADE NOW TAB */}
      {activeTab === 'tradenow' && (
        <TradeNowTab
          capitalAvailable={momentumCapital}
          capitalDeployed={paperPositions
            .filter(p => p.status === 'open')
            .reduce((sum, p) => sum + (p.capitalRequired || 0), 0)
          }
          openPositions={paperPositions.filter(p => p.status === 'open').length}
          maxPositions={momentumMaxPositions}
          todayPnL={paperPositions
            .filter(p => p.status === 'open')
            .reduce((sum, p) => sum + (p.pnl || 0), 0)
          }
          onExecuteTrade={async (signal, tradeType) => {
            try {
              console.log(`🚀 Executing ${tradeType} trade for ${signal.symbol}`)
              
              // Handle different signal types
              const isMomentum = 'totalScore' in signal
              const tradePlan = (signal as any).tradePlan
              
              // Get target prices based on signal type
              let target1, target2
              if (isMomentum) {
                // MasterScore type has target1 and target2
                target1 = tradePlan.target1
                target2 = tradePlan.target2
              } else {
                // NewsPop type has quickTarget
                target1 = (tradePlan as any).quickTarget
                target2 = (tradePlan as any).quickTarget
              }
              
              // Get reasoning
              const notes = isMomentum 
                ? (signal as any).reasoning?.join('; ') || '' 
                : `News pop detected at ${new Date().toLocaleTimeString()}`
              
              // Execute paper trade
              const response = await fetch('/api/positions/paper', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  symbol: signal.symbol,
                  exchange: signal.exchange || 'NSE',
                  positionType: 'LONG',  // Required field!
                  entryPrice: tradePlan.entry,
                  quantity: tradePlan.positionSize,
                  stopLoss: tradePlan.stopLoss,
                  target1: target1,
                  target2: target2,
                  capitalRequired: tradePlan.capitalRequired,
                  riskAmount: tradePlan.riskAmount,
                  strategy: tradeType,  // 'MOMENTUM' or 'NEWS_POP'
                  momentumScore: isMomentum ? signal.totalScore : 0,
                  confidence: isMomentum ? signal.totalScore : 100,
                  reasons: isMomentum ? (signal as any).reasoning : [`News pop detected at ${new Date().toLocaleTimeString()}`],
                  tradeType: tradeType,
                  notes: notes
                })
              })
              
              if (response.ok) {
                const data = await response.json()
                console.log('✅ Trade executed:', data)
                alert(`✅ Paper trade executed!\n\n${signal.symbol}\nEntry: ₹${tradePlan.entry}\nSize: ${tradePlan.positionSize} shares`)
                
                // Refresh paper positions
                const posRes = await fetch('/api/positions/paper')
                if (posRes.ok) {
                  const posData = await posRes.json()
                  if (posData.success) setPaperPositions(posData.positions)
                }
              } else {
                const errorData = await response.json()
                console.error('❌ Trade execution failed:', errorData)
                alert(`❌ Failed to execute trade: ${errorData.error}`)
              }
            } catch (error: any) {
              console.error('❌ Trade execution error:', error)
              alert(`❌ Error: ${error.message}`)
            }
          }}
        />
      )}

      {/* 📰 NEWS POP TAB */}
      {activeTab === 'newspop' && (
        <NewsPopTab
          capitalAvailable={momentumCapital}
          onExecuteTrade={async (signal, tradeType) => {
            try {
              console.log(`🚀 Executing ${tradeType} trade for ${signal.symbol}`)
              
              // News Pop signals have full master score data
              const tradePlan = (signal as any).tradePlan
              
              // Execute paper trade
              const response = await fetch('/api/positions/paper', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  symbol: signal.symbol,
                  exchange: signal.exchange || 'NSE',
                  positionType: 'LONG',
                  entryPrice: tradePlan.entry,
                  quantity: tradePlan.positionSize,
                  stopLoss: tradePlan.stopLoss,
                  target1: tradePlan.target1,
                  target2: tradePlan.target2,
                  capitalRequired: tradePlan.capitalRequired,
                  riskAmount: tradePlan.riskAmount,
                  strategy: tradeType,
                  momentumScore: signal.totalScore,
                  confidence: signal.totalScore,
                  reasons: signal.reasoning || [`News pop: ${signal.newsSentiment}`],
                  tradeType: tradeType,
                  notes: `News pop detected. Sentiment: ${signal.newsSentiment}. Volume spike: ${signal.volumeSpike.toFixed(1)}x`
                })
              })
              
              if (response.ok) {
                const data = await response.json()
                console.log('✅ Trade executed:', data)
                alert(`✅ Paper trade executed!\n\n${signal.symbol}\nEntry: ₹${tradePlan.entry}\nSize: ${tradePlan.positionSize} shares`)
                
                // Refresh paper positions
                const posRes = await fetch('/api/positions/paper')
                if (posRes.ok) {
                  const posData = await posRes.json()
                  if (posData.success) setPaperPositions(posData.positions)
                }
              } else {
                const errorData = await response.json()
                console.error('❌ Trade execution failed:', errorData)
                alert(`❌ Failed to execute trade: ${errorData.error}`)
              }
            } catch (error: any) {
              console.error('❌ Trade execution error:', error)
              alert(`❌ Error: ${error.message}`)
            }
          }}
        />
      )}

      {/* 📊 RESEARCH TAB */}
      {activeTab === 'research' && (
        <ResearchTab />
      )}

      {/* 📁 DATA TAB */}
      {activeTab === 'data' && (
        <DataTab />
      )}

      {/* ⚙️ SETTINGS TAB */}
      {activeTab === 'settings' && (
        <SettingsTab />
      )}

      {/* 🔬 BACKTEST TAB */}
      {activeTab === 'backtest' && (
        <BacktestTab />
      )}

      {/* 👑 ADMIN TAB */}
      {activeTab === 'admin' && (
        <div style={{ padding: '20px' }}>
          <iframe 
            src="/admin" 
            style={{ 
              width: '100%', 
              height: 'calc(100vh - 200px)', 
              border: 'none',
              borderRadius: '8px'
            }}
            title="Admin Dashboard"
          />
        </div>
      )}

      <style jsx>{`
        ${require('./styles').default}
      `}</style>
    </div>
  )
}
