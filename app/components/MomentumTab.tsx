'use client'

import React, { memo, useEffect } from 'react'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useMarketStore } from '@/lib/stores/market-store'
import { usePositionsStore } from '@/lib/stores/positions-store'
import type { MomentumScanResult, MomentumSignal } from '@/lib/momentum-scanner'
import RiskDashboard from './RiskDashboard'

export default memo(function MomentumTab() {
  const { authStatus } = useAuthStore()

  const {
    momentumScanResult,
    setMomentumScanResult,
    isScanningMomentum,
    setIsScanningMomentum,
    momentumCapital,
    setMomentumCapital,
    momentumMaxPositions,
    setMomentumMaxPositions,
    momentumMinScore,
    momentumProfile,
    setMomentumProfile,
    setMomentumMinScore,
    customStocksInput,
    setCustomStocksInput,
    isQuickScan,
    setIsQuickScan,
  } = useMarketStore()

  const {
    isPaperMode,
    setIsPaperMode,
    paperPositions,
    setPaperPositions,
    isLoadingPaperPositions,
    setIsLoadingPaperPositions,
    isExecutingTrade,
    setIsExecutingTrade,
    analystReportsCache,
    mergeAnalystCache,
    autoUpdateEnabled,
    setAutoUpdateEnabled,
    lastPnLUpdate,
    setLastPnLUpdate,
    autoExitAlerts,
    setAutoExitAlerts,
    appendAutoExits,
    positionFilter,
    setPositionFilter,
  } = usePositionsStore()

  // 💰 Run Momentum Scanner for Swing Trades
  async function runMomentumScanner() {
    if (!authStatus.authenticated) {
      alert('⚠️ Please login first')
      return
    }

    setIsScanningMomentum(true)
    setMomentumScanResult(null)

    try {
      console.log(`💰 Running momentum scanner (Capital: ₹${(momentumCapital / 100000).toFixed(1)}L, Max Positions: ${momentumMaxPositions})...`)

      // Parse custom stocks (comma-separated, trim whitespace, uppercase)
      const customStocks = customStocksInput
        .split(',')
        .map(s => s.trim().toUpperCase())
        .filter(s => s.length > 0)

      // Build query params
      const params = new URLSearchParams({
        capital: momentumCapital.toString(),
        maxPositions: momentumMaxPositions.toString(),
        minScore: momentumMinScore.toString(),
        quickScan: isQuickScan.toString(),
        profile: momentumProfile
      })

      // Add custom stocks if provided
      if (customStocks.length > 0) {
        params.append('customStocks', customStocks.join(','))
        console.log(`📝 Including custom stocks: ${customStocks.join(', ')}`)
      }

      const response = await fetch(`/api/scanner/momentum?${params.toString()}`)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('❌ Scanner API error:', errorData)
        throw new Error(errorData.error || 'Failed to run momentum scanner')
      }

      const result = await response.json()

      if (result.success && result.scan) {
        setMomentumScanResult(result.scan)
        console.log(`✅ Momentum scan complete: ${result.scan.signalsFound} signals found`)
        console.log(`📊 Market Sentiment: ${result.scan.marketSentiment}`)

        if (result.scan.signalsFound === 0) {
          alert('⚠️ No momentum signals found. Try lowering the minimum score or widening your filters.')
        } else {
          alert(
            `✅ Momentum Scan Complete!\n\n` +
            `📊 Found ${result.scan.signalsFound} signals\n` +
            `🔥 ${result.scan.strongBuyCount} STRONG_BUY signals\n` +
            `📈 Market Sentiment: ${result.scan.marketSentiment}\n\n` +
            `Check the Momentum tab for detailed analysis!`
          )
        }
      }

    } catch (error: any) {
      console.error('❌ Error running momentum scanner:', error)
      alert(`❌ Momentum scanner failed: ${error.message}`)
    } finally {
      setIsScanningMomentum(false)
    }
  }

  // 📝 Load Paper Positions from Database
  async function loadPaperPositions() {
    if (!authStatus.authenticated) return

    setIsLoadingPaperPositions(true)
    try {
      console.log('📝 Loading paper positions from database...')
      const response = await fetch('/api/positions/paper?status=all')

      if (!response.ok) {
        throw new Error('Failed to load paper positions')
      }

      const result = await response.json()

      if (result.success) {
        setPaperPositions(result.positions || [])
        console.log(`✅ Loaded ${result.positions?.length || 0} paper positions`)
      }
    } catch (error: any) {
      console.error('❌ Error loading paper positions:', error)
    } finally {
      setIsLoadingPaperPositions(false)
    }
  }

  // 📝 Execute Paper Trade
  async function executePaperTrade(signal: any) {
    if (!authStatus.authenticated) {
      alert('⚠️ Please login first')
      return
    }

    setIsExecutingTrade(true)
    try {
      console.log(`📝 Executing paper trade: ${signal.symbol} (${signal.positionSize} shares @ ₹${signal.entryPrice})...`)

      // 🚨 RISK CHECK: Calculate total capital used
      const totalCapitalUsed = paperPositions
        .filter(p => p.status === 'open')
        .reduce((sum, p) => sum + (p.capitalRequired || 0), 0)

      const newTradeCapital = signal.capitalRequired || (signal.positionSize * signal.entryPrice)
      const totalAfterTrade = totalCapitalUsed + newTradeCapital

      console.log(`💰 Capital Check:`)
      console.log(`   Current: ₹${totalCapitalUsed.toLocaleString()}`)
      console.log(`   New Trade: ₹${newTradeCapital.toLocaleString()}`)
      console.log(`   Total: ₹${totalAfterTrade.toLocaleString()}`)
      console.log(`   Limit: ₹${momentumCapital.toLocaleString()}`)

      // Check if exceeds capital limit
      if (totalAfterTrade > momentumCapital) {
        const exceeded = totalAfterTrade - momentumCapital
        alert(
          `🚨 RISK LIMIT EXCEEDED!\n\n` +
          `You have ₹${totalCapitalUsed.toLocaleString()} deployed in ${paperPositions.filter(p => p.status === 'open').length} positions.\n` +
          `This trade needs ₹${newTradeCapital.toLocaleString()}.\n\n` +
          `Total would be: ₹${totalAfterTrade.toLocaleString()}\n` +
          `Your limit: ₹${momentumCapital.toLocaleString()}\n\n` +
          `❌ Exceeds limit by: ₹${exceeded.toLocaleString()}\n\n` +
          `💡 Either:\n` +
          `• Close some positions first\n` +
          `• Increase your capital limit\n` +
          `• Skip this trade`
        )
        setIsExecutingTrade(false)
        return
      }

      // Check max positions limit
      const openPositionsCount = paperPositions.filter(p => p.status === 'open').length
      if (openPositionsCount >= momentumMaxPositions) {
        alert(
          `🚨 MAX POSITIONS REACHED!\n\n` +
          `You have ${openPositionsCount} open positions.\n` +
          `Your limit: ${momentumMaxPositions} positions\n\n` +
          `💡 Close a position before opening new ones.`
        )
        setIsExecutingTrade(false)
        return
      }

      const response = await fetch('/api/positions/paper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: signal.symbol,
          exchange: 'NSE',
          positionType: 'BUY',
          entryPrice: signal.entryPrice,
          quantity: signal.positionSize,
          stopLoss: signal.stopLoss,
          target1: signal.target1,
          target2: signal.target2,
          strategy: 'momentum',
          momentumScore: signal.momentumScore,
          confidence: signal.confidence,
          rsi: signal.rsi,
          volumeRatio: signal.volumeRatio,
          reasons: signal.reasons,
          warnings: signal.warnings,
          capitalRequired: signal.capitalRequired,
          riskAmount: signal.riskAmount,
          signalData: signal, // Store full signal as JSONB
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('❌ Paper trade API error:', errorData)
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to execute paper trade`)
      }

      const result = await response.json()

      if (result.success) {
        alert(
          `✅ Paper Trade Executed!\n\n` +
          `${signal.symbol}: ${signal.positionSize} shares @ ₹${signal.entryPrice}\n` +
          `Stop Loss: ₹${signal.stopLoss}\n` +
          `Target 1: ₹${signal.target1}\n` +
          `Target 2: ₹${signal.target2}\n\n` +
          `Check your paper positions to track P&L!`
        )

        // Reload paper positions
        await loadPaperPositions()
      }
    } catch (error: any) {
      console.error('❌ Error executing paper trade:', error)
      alert(`❌ Failed to execute paper trade: ${error.message}`)
    } finally {
      setIsExecutingTrade(false)
    }
  }

  // 📊 Fetch Analyst Reports for a symbol
  async function fetchAnalystReports(symbol: string) {
    // Check cache first
    if (analystReportsCache[symbol]) {
      return analystReportsCache[symbol]
    }

    try {
      const response = await fetch(`/api/reports/upload?symbol=${symbol}&limit=3`)
      if (!response.ok) {
        throw new Error('Failed to fetch reports')
      }

      const data = await response.json()
      const reports = data.reports || []

      // Cache the results
      mergeAnalystCache(symbol, reports)

      return reports
    } catch (error: any) {
      console.error(`Error fetching reports for ${symbol}:`, error)
      return []
    }
  }

  // 🔄 Load analyst reports for visible signals
  useEffect(() => {
    if (momentumScanResult?.signals && momentumScanResult.signals.length > 0) {
      // Fetch reports for first 10 signals (to avoid too many API calls)
      const symbols = momentumScanResult.signals.slice(0, 10).map(s => s.symbol)
      symbols.forEach(symbol => {
        if (!analystReportsCache[symbol]) {
          fetchAnalystReports(symbol)
        }
      })
    }
  }, [momentumScanResult])

  // 🔄 Auto P&L Update Function
  async function updateAllPositionsPnL() {
    if (!authStatus.authenticated) return

    try {
      console.log('🔄 Updating all positions P&L...')

      const response = await fetch('/api/positions/paper/update-pnl', {
        method: 'POST'
      })

      if (!response.ok) {
        throw new Error('Failed to update P&L')
      }

      const data = await response.json()

      console.log(`✅ P&L updated: ${data.updated} positions`)

      if (data.autoExits && data.autoExits.length > 0) {
        console.log(`🎯 Auto-exited ${data.autoExits.length} positions:`)
        data.autoExits.forEach((exit: any) => {
          console.log(`  ${exit.symbol}: ${exit.reason} @ ₹${exit.exitPrice} | P&L: ₹${exit.pnl.toFixed(2)}`)
        })

        // Add to alerts
        appendAutoExits(data.autoExits)

        // Show browser notification if supported
        if ('Notification' in window && Notification.permission === 'granted') {
          data.autoExits.forEach((exit: any) => {
            new Notification(`Position Auto-Exited: ${exit.symbol}`, {
              body: `${exit.reason}: ₹${exit.pnl.toFixed(2)} (${exit.pnlPercent.toFixed(2)}%)`,
              icon: exit.pnl >= 0 ? '💰' : '💸'
            })
          })
        }
      }

      setLastPnLUpdate(new Date())

      // Reload positions to show updated data
      await loadPaperPositions()

    } catch (error: any) {
      console.error('❌ Error updating P&L:', error)
    }
  }

  // 🔄 Auto-update interval (every 5 minutes when enabled)
  useEffect(() => {
    if (!autoUpdateEnabled || !authStatus.authenticated) return

    // Initial update
    updateAllPositionsPnL()

    // Set up interval (5 minutes = 300000ms)
    const interval = setInterval(() => {
      updateAllPositionsPnL()
    }, 300000) // 5 minutes

    console.log('✅ Auto P&L updates enabled (every 5 min)')

    return () => {
      clearInterval(interval)
      console.log('⏹️ Auto P&L updates disabled')
    }
  }, [autoUpdateEnabled, authStatus.authenticated])

  return (
    <div>
      {/* Scanner Controls */}
      <div className="card" style={{ marginBottom: '25px', padding: '25px' }}>
        <h3 style={{ marginBottom: '20px', fontSize: '1.8em' }}>💰 Momentum Swing Scanner</h3>
        <p style={{ marginBottom: '20px', opacity: 0.85, lineHeight: '1.6' }}>
          Systematic scanner for 1-2% swing trades. Target holding: 1-7 days. Scans NIFTY 500 for clean uptrends with volume confirmation.
        </p>

        {/* Paper/Live Mode Toggle */}
        <div style={{
          marginBottom: '25px',
          padding: '20px',
          background: isPaperMode ? 'rgba(102, 126, 234, 0.1)' : 'rgba(255, 0, 100, 0.1)',
          border: `2px solid ${isPaperMode ? 'rgba(102, 126, 234, 0.4)' : 'rgba(255, 0, 100, 0.4)'}`,
          borderRadius: '10px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <div>
              <div style={{ fontSize: '1.2em', fontWeight: 'bold', marginBottom: '5px' }}>
                {isPaperMode ? '📝 Paper Trading Mode' : '🔴 LIVE Trading Mode'}
              </div>
              <div style={{ fontSize: '0.9em', opacity: 0.8 }}>
                {isPaperMode
                  ? 'Risk-free simulation - test strategies before trading real money'
                  : '⚠️ Real money at risk - orders will be placed on your Zerodha account'}
              </div>
            </div>
            <button
              onClick={() => setIsPaperMode(!isPaperMode)}
              style={{
                padding: '10px 20px',
                fontSize: '1em',
                background: isPaperMode ? 'rgba(255, 0, 100, 0.2)' : 'rgba(102, 126, 234, 0.2)',
                border: `2px solid ${isPaperMode ? '#ff0064' : '#667eea'}`,
                borderRadius: '8px',
                color: '#fff',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap'
              }}
            >
              {isPaperMode ? 'Switch to LIVE' : 'Switch to Paper'}
            </button>
          </div>

          {/* Paper Positions Summary */}
          {isPaperMode && paperPositions.length > 0 && (
            <div style={{
              padding: '12px',
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '8px',
              fontSize: '0.9em',
              marginBottom: '15px'
            }}>
              <div style={{ opacity: 0.7, marginBottom: '5px' }}>📊 Paper Positions:</div>
              <div style={{ fontWeight: 'bold' }}>
                {paperPositions.filter(p => p.status === 'open').length} open • {' '}
                {paperPositions.filter(p => p.status === 'closed').length} closed • {' '}
                Total P&L: ₹
                {paperPositions
                  .reduce((sum, p) => sum + (p.pnl || 0), 0)
                  .toFixed(2)}
              </div>
            </div>
          )}

          {/* Risk Dashboard */}
          {isPaperMode && (
            <RiskDashboard
              paperPositions={paperPositions}
              capital={300000}
            />
          )}

          {/* Detailed Paper Positions Table */}
          {isPaperMode && paperPositions.length > 0 && (
            <div style={{
              background: 'rgba(0, 0, 0, 0.2)',
              borderRadius: '10px',
              padding: '20px',
              marginBottom: '20px'
            }}>
              {/* Auto-Update Controls & Alerts */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
                flexWrap: 'wrap',
                gap: '15px'
              }}>
                <h4 style={{ margin: 0, fontSize: '1.3em' }}>📝 Your Paper Positions</h4>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* Position Filter */}
                  <div style={{ display: 'flex', gap: '5px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '8px', padding: '4px' }}>
                    <button
                      onClick={() => setPositionFilter('open')}
                      style={{
                        padding: '6px 12px',
                        background: positionFilter === 'open' ? 'rgba(0, 255, 100, 0.3)' : 'transparent',
                        border: positionFilter === 'open' ? '1px solid rgba(0, 255, 100, 0.5)' : '1px solid transparent',
                        borderRadius: '6px',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '0.85em',
                        fontWeight: positionFilter === 'open' ? 'bold' : 'normal'
                      }}
                    >
                      Open ({paperPositions.filter(p => p.status === 'open').length})
                    </button>
                    <button
                      onClick={() => setPositionFilter('closed')}
                      style={{
                        padding: '6px 12px',
                        background: positionFilter === 'closed' ? 'rgba(100, 100, 100, 0.3)' : 'transparent',
                        border: positionFilter === 'closed' ? '1px solid rgba(100, 100, 100, 0.5)' : '1px solid transparent',
                        borderRadius: '6px',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '0.85em',
                        fontWeight: positionFilter === 'closed' ? 'bold' : 'normal'
                      }}
                    >
                      Closed ({paperPositions.filter(p => p.status === 'closed').length})
                    </button>
                    <button
                      onClick={() => setPositionFilter('all')}
                      style={{
                        padding: '6px 12px',
                        background: positionFilter === 'all' ? 'rgba(102, 126, 234, 0.3)' : 'transparent',
                        border: positionFilter === 'all' ? '1px solid rgba(102, 126, 234, 0.5)' : '1px solid transparent',
                        borderRadius: '6px',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '0.85em',
                        fontWeight: positionFilter === 'all' ? 'bold' : 'normal'
                      }}
                    >
                      All ({paperPositions.length})
                    </button>
                  </div>

                  {/* Auto-Update Toggle */}
                  <button
                    onClick={() => setAutoUpdateEnabled(!autoUpdateEnabled)}
                    style={{
                      padding: '10px 20px',
                      background: autoUpdateEnabled
                        ? 'linear-gradient(135deg, #00ff64 0%, #00b894 100%)'
                        : 'rgba(255, 255, 255, 0.1)',
                      border: `2px solid ${autoUpdateEnabled ? 'rgba(0, 255, 100, 0.5)' : 'rgba(255, 255, 255, 0.3)'}`,
                      borderRadius: '8px',
                      color: '#fff',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      fontSize: '0.9em'
                    }}
                  >
                    {autoUpdateEnabled ? '⚡ Auto-Update ON' : '⏸️ Auto-Update OFF'}
                  </button>

                  {/* Manual Update Button */}
                  <button
                    onClick={() => updateAllPositionsPnL()}
                    style={{
                      padding: '10px 20px',
                      background: 'rgba(102, 126, 234, 0.2)',
                      border: '2px solid rgba(102, 126, 234, 0.4)',
                      borderRadius: '8px',
                      color: '#fff',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      fontSize: '0.9em'
                    }}
                  >
                    🔄 Update Now
                  </button>

                  {/* Last Update Time */}
                  {lastPnLUpdate && (
                    <span style={{
                      fontSize: '0.85em',
                      opacity: 0.7,
                      padding: '8px 12px',
                      background: 'rgba(0, 0, 0, 0.3)',
                      borderRadius: '6px'
                    }}>
                      Last: {lastPnLUpdate.toLocaleTimeString()}
                    </span>
                  )}
                </div>
              </div>

              {/* P&L Summary Section */}
              {paperPositions.length > 0 && (
                <div style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  borderRadius: '12px',
                  padding: '15px 20px',
                  marginBottom: '15px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: '15px'
                }}>
                  {(() => {
                    const filteredPositions = paperPositions.filter(position => {
                      if (positionFilter === 'open') return position.status === 'open'
                      if (positionFilter === 'closed') return position.status === 'closed'
                      return true
                    })

                    const totalCapitalUsed = filteredPositions
                      .filter(p => p.status === 'open')
                      .reduce((sum, p) => sum + (p.capitalRequired || 0), 0)

                    const totalPnL = filteredPositions.reduce((sum, p) => sum + (p.pnl || 0), 0)
                    const totalPnLPercent = totalCapitalUsed > 0
                      ? (totalPnL / totalCapitalUsed) * 100
                      : 0

                    const winners = filteredPositions.filter(p => (p.pnl || 0) > 0).length
                    const losers = filteredPositions.filter(p => (p.pnl || 0) < 0).length
                    const winRate = filteredPositions.length > 0
                      ? ((winners / filteredPositions.length) * 100).toFixed(1)
                      : '0.0'

                    return (
                      <>
                        <div>
                          <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: '4px' }}>
                            {positionFilter === 'open' ? 'Capital Deployed' : 'Total P&L'}
                          </div>
                          <div style={{
                            fontSize: '1.3em',
                            fontWeight: 'bold',
                            color: positionFilter === 'open' ? '#3B82F6' : (totalPnL >= 0 ? '#10B981' : '#EF4444')
                          }}>
                            ₹{(positionFilter === 'open' ? totalCapitalUsed : totalPnL).toLocaleString()}
                          </div>
                          {positionFilter === 'open' && (
                            <div style={{ fontSize: '0.8em', opacity: 0.6, marginTop: '2px' }}>
                              of ₹{momentumCapital.toLocaleString()} ({((totalCapitalUsed / momentumCapital) * 100).toFixed(1)}%)
                            </div>
                          )}
                        </div>

                        <div>
                          <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: '4px' }}>Unrealized P&L</div>
                          <div style={{
                            fontSize: '1.3em',
                            fontWeight: 'bold',
                            color: totalPnL >= 0 ? '#10B981' : '#EF4444'
                          }}>
                            {totalPnL >= 0 ? '+' : ''}₹{totalPnL.toLocaleString()}
                          </div>
                          <div style={{
                            fontSize: '0.9em',
                            color: totalPnL >= 0 ? '#10B981' : '#EF4444',
                            opacity: 0.8,
                            marginTop: '2px'
                          }}>
                            ({totalPnLPercent >= 0 ? '+' : ''}{totalPnLPercent.toFixed(2)}%)
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: '4px' }}>Positions</div>
                          <div style={{ fontSize: '1.3em', fontWeight: 'bold', color: '#A78BFA' }}>
                            {filteredPositions.length}
                          </div>
                          <div style={{ fontSize: '0.8em', opacity: 0.6, marginTop: '2px' }}>
                            {positionFilter === 'open' && `of ${momentumMaxPositions} max`}
                            {positionFilter === 'closed' && 'Exited'}
                            {positionFilter === 'all' && `${paperPositions.filter(p => p.status === 'open').length} open`}
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: '4px' }}>Win Rate</div>
                          <div style={{ fontSize: '1.3em', fontWeight: 'bold', color: '#F59E0B' }}>
                            {winRate}%
                          </div>
                          <div style={{ fontSize: '0.8em', opacity: 0.6, marginTop: '2px' }}>
                            {winners}W / {losers}L
                          </div>
                        </div>
                      </>
                    )
                  })()}
                </div>
              )}

              {/* Auto-Exit Alerts */}
              {autoExitAlerts.length > 0 && (
                <div style={{
                  marginBottom: '15px',
                  padding: '15px',
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '2px solid rgba(245, 158, 11, 0.3)',
                  borderRadius: '8px'
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '10px'
                  }}>
                    <h5 style={{ margin: 0, color: '#FCD34D' }}>🎯 Recent Auto-Exits</h5>
                    <button
                      onClick={() => setAutoExitAlerts([])}
                      style={{
                        padding: '4px 8px',
                        background: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: '4px',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '0.8em'
                      }}
                    >
                      Clear
                    </button>
                  </div>
                  {autoExitAlerts.slice(-5).reverse().map((exit, i) => (
                    <div key={i} style={{
                      padding: '8px',
                      background: 'rgba(0, 0, 0, 0.2)',
                      borderRadius: '4px',
                      marginBottom: '5px',
                      fontSize: '0.9em'
                    }}>
                      <strong>{exit.symbol}</strong>: {exit.reason.replace('_', ' ')} @ ₹{exit.exitPrice.toFixed(2)}
                      <span style={{
                        marginLeft: '10px',
                        fontWeight: 'bold',
                        color: exit.pnl >= 0 ? '#00ff64' : '#ff0064'
                      }}>
                        {exit.pnl >= 0 ? '+' : ''}₹{exit.pnl.toFixed(2)} ({exit.pnlPercent > 0 ? '+' : ''}{exit.pnlPercent.toFixed(2)}%)
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ overflowX: 'auto' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.9em'
                }}>
                  <thead>
                    <tr style={{
                      background: 'rgba(102, 126, 234, 0.1)',
                      borderBottom: '2px solid rgba(102, 126, 234, 0.3)'
                    }}>
                      <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 'bold' }}>Symbol</th>
                      <th style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 'bold' }}>Type</th>
                      <th style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 'bold' }}>Status</th>
                      <th style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 'bold' }}>Qty</th>
                      <th style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 'bold' }}>Entry</th>
                      <th style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 'bold' }}>Current</th>
                      <th style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 'bold' }}>Stop Loss</th>
                      <th style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 'bold' }}>Target 1</th>
                      <th style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 'bold' }}>Target 2</th>
                      <th style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 'bold' }}>P&L</th>
                      <th style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 'bold' }}>P&L %</th>
                      <th style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 'bold' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paperPositions
                      .filter(position => {
                        if (positionFilter === 'open') return position.status === 'open'
                        if (positionFilter === 'closed') return position.status === 'closed'
                        return true // 'all'
                      })
                      .map((position, index) => {
                      const pnl = position.pnl || 0
                      const pnlPercent = position.pnlPercent || 0
                      const isProfitable = pnl >= 0

                      return (
                        <tr key={position.id} style={{
                          background: index % 2 === 0 ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.05)',
                          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(102, 126, 234, 0.1)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = index % 2 === 0 ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.05)'}
                        >
                          <td style={{ padding: '12px 10px', fontWeight: 'bold' }}>
                            {position.symbol}
                            <div style={{ fontSize: '0.75em', opacity: 0.6, marginTop: '2px' }}>
                              {position.strategy}
                            </div>
                          </td>
                          <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                            <span style={{
                              padding: '4px 8px',
                              background: position.positionType === 'BUY'
                                ? 'rgba(0, 255, 100, 0.2)'
                                : 'rgba(255, 0, 100, 0.2)',
                              border: `1px solid ${
                                position.positionType === 'BUY'
                                  ? 'rgba(0, 255, 100, 0.4)'
                                  : 'rgba(255, 0, 100, 0.4)'
                              }`,
                              borderRadius: '4px',
                              fontSize: '0.8em',
                              fontWeight: 'bold',
                              textTransform: 'uppercase'
                            }}>
                              {position.positionType === 'BUY' ? '📈 BUY' : '📉 SELL'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                            <span style={{
                              padding: '4px 8px',
                              background: position.status === 'open'
                                ? 'rgba(102, 126, 234, 0.2)'
                                : position.status === 'closed'
                                  ? 'rgba(100, 100, 100, 0.2)'
                                  : 'rgba(255, 0, 100, 0.2)',
                              border: `1px solid ${
                                position.status === 'open'
                                  ? 'rgba(102, 126, 234, 0.4)'
                                  : position.status === 'closed'
                                    ? 'rgba(100, 100, 100, 0.4)'
                                    : 'rgba(255, 0, 100, 0.4)'
                              }`,
                              borderRadius: '4px',
                              fontSize: '0.8em',
                              fontWeight: 'bold',
                              textTransform: 'uppercase'
                            }}>
                              {position.status}
                            </span>
                          </td>
                          <td style={{ padding: '12px 10px', textAlign: 'right' }}>{position.quantity}</td>
                          <td style={{ padding: '12px 10px', textAlign: 'right' }}>₹{position.entryPrice.toFixed(2)}</td>
                          <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 'bold' }}>
                            ₹{(position.currentPrice || position.entryPrice).toFixed(2)}
                          </td>
                          <td style={{ padding: '12px 10px', textAlign: 'right', color: '#EF4444' }}>
                            ₹{position.stopLoss?.toFixed(2) || '-'}
                          </td>
                          <td style={{ padding: '12px 10px', textAlign: 'right', color: '#10B981' }}>
                            ₹{position.target1?.toFixed(2) || '-'}
                          </td>
                          <td style={{ padding: '12px 10px', textAlign: 'right', color: '#00ff64' }}>
                            ₹{position.target2?.toFixed(2) || '-'}
                          </td>
                          <td style={{
                            padding: '12px 10px',
                            textAlign: 'right',
                            fontWeight: 'bold',
                            color: isProfitable ? '#00ff64' : '#ff0064'
                          }}>
                            ₹{pnl.toFixed(2)}
                          </td>
                          <td style={{
                            padding: '12px 10px',
                            textAlign: 'right',
                            fontWeight: 'bold',
                            color: isProfitable ? '#00ff64' : '#ff0064'
                          }}>
                            {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                          </td>
                          <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                            {position.status === 'open' && (
                              <button
                                onClick={async () => {
                                  if (confirm(`Close position for ${position.symbol}?`)) {
                                    try {
                                      const response = await fetch('/api/positions/paper', {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                          id: position.id,
                                          status: 'closed',
                                          exitPrice: position.currentPrice || position.entryPrice,
                                          exitTime: new Date(),
                                          exitReason: 'manual',
                                          notes: 'Manually closed'
                                        })
                                      })

                                      if (response.ok) {
                                        await loadPaperPositions()
                                        alert('✅ Position closed!')
                                      } else {
                                        throw new Error('Failed to close position')
                                      }
                                    } catch (error: any) {
                                      alert(`❌ Error: ${error.message}`)
                                    }
                                  }
                                }}
                                style={{
                                  padding: '6px 12px',
                                  background: 'rgba(255, 0, 100, 0.2)',
                                  border: '1px solid rgba(255, 0, 100, 0.5)',
                                  borderRadius: '4px',
                                  color: '#fff',
                                  cursor: 'pointer',
                                  fontSize: '0.85em',
                                  fontWeight: 'bold'
                                }}
                              >
                                Close
                              </button>
                            )}
                            {position.status === 'closed' && (
                              <span style={{ fontSize: '0.8em', opacity: 0.6 }}>
                                {new Date(position.exitTime!).toLocaleDateString()}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>

                  {/* Summary Row */}
                  <tfoot>
                    <tr style={{
                      background: 'rgba(102, 126, 234, 0.15)',
                      borderTop: '2px solid rgba(102, 126, 234, 0.4)',
                      fontWeight: 'bold'
                    }}>
                      <td colSpan={9} style={{ padding: '12px 10px', textAlign: 'right' }}>
                        Total P&L:
                      </td>
                      <td colSpan={2} style={{
                        padding: '12px 10px',
                        textAlign: 'right',
                        fontSize: '1.1em',
                        color: paperPositions.reduce((sum, p) => sum + (p.pnl || 0), 0) >= 0 ? '#00ff64' : '#ff0064'
                      }}>
                        ₹{paperPositions.reduce((sum, p) => sum + (p.pnl || 0), 0).toFixed(2)}
                      </td>
                      <td style={{ padding: '12px 10px' }}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Quick Stats */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '10px',
                marginTop: '15px',
                padding: '15px',
                background: 'rgba(0, 0, 0, 0.2)',
                borderRadius: '8px',
                fontSize: '0.9em'
              }}>
                <div>
                  <div style={{ opacity: 0.7, fontSize: '0.85em' }}>Open Positions</div>
                  <div style={{ fontSize: '1.3em', fontWeight: 'bold', color: '#3B82F6' }}>
                    {paperPositions.filter(p => p.status === 'open').length}
                  </div>
                </div>
                <div>
                  <div style={{ opacity: 0.7, fontSize: '0.85em' }}>Closed Positions</div>
                  <div style={{ fontSize: '1.3em', fontWeight: 'bold' }}>
                    {paperPositions.filter(p => p.status === 'closed').length}
                  </div>
                </div>
                <div>
                  <div style={{ opacity: 0.7, fontSize: '0.85em' }}>Win Rate</div>
                  <div style={{ fontSize: '1.3em', fontWeight: 'bold', color: '#10B981' }}>
                    {paperPositions.filter(p => p.status === 'closed').length > 0
                      ? `${((paperPositions.filter(p => p.status === 'closed' && (p.pnl || 0) > 0).length / paperPositions.filter(p => p.status === 'closed').length) * 100).toFixed(0)}%`
                      : '-'}
                  </div>
                </div>
                <div>
                  <div style={{ opacity: 0.7, fontSize: '0.85em' }}>Total Capital Used</div>
                  <div style={{ fontSize: '1.3em', fontWeight: 'bold' }}>
                    ₹{(paperPositions
                      .filter(p => p.status === 'open')
                      .reduce((sum, p) => sum + (p.capitalRequired || 0), 0) / 1000).toFixed(0)}k
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Configuration */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '20px',
          marginBottom: '25px'
        }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              💰 Capital (₹)
            </label>
            <input
              type="number"
              value={momentumCapital}
              onChange={(e) => setMomentumCapital(parseInt(e.target.value) || 300000)}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '1em',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '6px',
                color: '#fff'
              }}
              min={50000}
              max={100000000}
              step={50000}
            />
            <div style={{ fontSize: '0.85em', opacity: 0.6, marginTop: '5px' }}>
              {`₹${(momentumCapital / 100000).toFixed(1)}L available`}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              📊 Max Positions
            </label>
            <input
              type="number"
              value={momentumMaxPositions}
              onChange={(e) => setMomentumMaxPositions(parseInt(e.target.value) || 5)}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '1em',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '6px',
                color: '#fff'
              }}
              min={1}
              max={20}
            />
            <div style={{ fontSize: '0.85em', opacity: 0.6, marginTop: '5px' }}>
              Simultaneous trades
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              📐 Trade Profile
            </label>
            <select
              value={momentumProfile}
              onChange={(e) => setMomentumProfile(e.target.value as 'swing' | 'intraday')}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '1em',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '6px',
                color: '#fff'
              }}
            >
              <option value="swing">Swing — +10% / +15% targets, up to 45d</option>
              <option value="intraday">Intraday — +1.5% / +2.5%, up to 7d</option>
            </select>
            <div style={{ fontSize: '0.85em', opacity: 0.6, marginTop: '5px' }}>
              {momentumProfile === 'swing'
                ? 'Reward ≈ 2x risk (stop capped at 6%)'
                : '⚠️ Risks ~2.5-3% to make 1.5%'}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              🎯 Min Score
            </label>
            <input
              type="number"
              value={momentumMinScore}
              onChange={(e) => setMomentumMinScore(parseInt(e.target.value) || 45)}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '1em',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '6px',
                color: '#fff'
              }}
              min={0}
              max={100}
              step={5}
            />
            <div style={{ fontSize: '0.85em', opacity: 0.6, marginTop: '5px' }}>
              45+ = balanced, 60+ = conservative, 75+ = aggressive
            </div>
          </div>
        </div>

        {/* Custom Stocks Input */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <label style={{ fontWeight: 'bold' }}>
              📝 Custom Stocks <span style={{ opacity: 0.6, fontWeight: 'normal' }}>(Optional)</span>
            </label>
            {customStocksInput && (
              <button
                onClick={() => setCustomStocksInput('')}
                style={{
                  padding: '4px 12px',
                  fontSize: '0.85em',
                  background: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  borderRadius: '6px',
                  color: '#EF4444',
                  cursor: 'pointer'
                }}
              >
                ✕ Clear
              </button>
            )}
          </div>
          <input
            type="text"
            value={customStocksInput}
            onChange={(e) => setCustomStocksInput(e.target.value)}
            placeholder="e.g., INFY, TCS, RELIANCE (comma-separated)"
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '1em',
              background: 'rgba(0, 0, 0, 0.3)',
              border: '2px solid rgba(102, 126, 234, 0.3)',
              borderRadius: '8px',
              color: '#fff'
            }}
          />
          <div style={{ fontSize: '0.85em', opacity: 0.7, marginTop: '8px', lineHeight: '1.5' }}>
            💡 <strong>Add any stock to scan</strong> - Include stocks from tips, news, or research<br/>
            • Separate multiple stocks with commas<br/>
            • Leave empty to scan only NIFTY 500<br/>
            • Examples: TATAMOTORS, ADANIENT, PAYTM
            {customStocksInput && (
              <>
                <br/>
                <span style={{ color: '#FCD34D', fontWeight: 'bold' }}>
                  ⚠️ Custom stocks are active - Clear to run full scan!
                </span>
              </>
            )}
          </div>
        </div>

        {/* Quick Scan Toggle */}
        <div style={{
          marginBottom: '20px',
          padding: '15px',
          background: 'rgba(102, 126, 234, 0.1)',
          borderRadius: '8px',
          border: '1px solid rgba(102, 126, 234, 0.3)'
        }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
            fontSize: '1em'
          }}>
            <input
              type="checkbox"
              checked={isQuickScan}
              onChange={(e) => setIsQuickScan(e.target.checked)}
              style={{
                width: '20px',
                height: '20px',
                marginRight: '10px',
                cursor: 'pointer'
              }}
            />
            <div>
              <strong>⚡ Quick Scan Mode</strong>
              <div style={{ fontSize: '0.85em', opacity: 0.7, marginTop: '3px' }}>
                {isQuickScan
                  ? '✓ Scan top 100 stocks + custom (~30 seconds)'
                  : '⏱ Full scan of 500 stocks (~2-3 minutes)'}
              </div>
            </div>
          </label>
        </div>

        {/* Scan Button */}
        <button
          onClick={runMomentumScanner}
          disabled={isScanningMomentum}
          style={{
            padding: '15px 30px',
            fontSize: '1.2em',
            background: isScanningMomentum ? '#666' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            fontWeight: 'bold',
            cursor: isScanningMomentum ? 'not-allowed' : 'pointer',
            width: '100%',
            transition: 'all 0.2s ease'
          }}
        >
          {isScanningMomentum
            ? (isQuickScan ? '⚡ Quick Scanning...' : '🔍 Full Scanning...')
            : (isQuickScan ? '⚡ Quick Scan (Top 100)' : '🔍 Full Scan (500 stocks)')}
        </button>
      </div>

      {/* Scan Results */}
      {momentumScanResult && (
        <div>
          {/* Market Context */}
          <div className="card" style={{ marginBottom: '25px', padding: '25px' }}>
            <h3 style={{ marginBottom: '20px' }}>📊 Market Context</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
              <div style={{ padding: '15px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '8px' }}>
                <div style={{ opacity: 0.7, fontSize: '0.9em', marginBottom: '5px' }}>Market Sentiment</div>
                <div style={{ fontSize: '1.5em', fontWeight: 'bold' }}>
                  {momentumScanResult.marketSentiment}
                </div>
              </div>
              <div style={{ padding: '15px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '8px' }}>
                <div style={{ opacity: 0.7, fontSize: '0.9em', marginBottom: '5px' }}>Signals Found</div>
                <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: '#00ff64' }}>
                  {momentumScanResult.signalsFound}
                </div>
              </div>
              <div style={{ padding: '15px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '8px' }}>
                <div style={{ opacity: 0.7, fontSize: '0.9em', marginBottom: '5px' }}>STRONG BUY</div>
                <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: '#10B981' }}>
                  {momentumScanResult.strongBuyCount}
                </div>
              </div>
              <div style={{ padding: '15px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '8px' }}>
                <div style={{ opacity: 0.7, fontSize: '0.9em', marginBottom: '5px' }}>BUY</div>
                <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: '#3B82F6' }}>
                  {momentumScanResult.buyCount}
                </div>
              </div>
              <div style={{ padding: '15px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '8px' }}>
                <div style={{ opacity: 0.7, fontSize: '0.9em', marginBottom: '5px' }}>Capital Allocation</div>
                <div style={{ fontSize: '1.5em', fontWeight: 'bold' }}>
                  {(momentumScanResult.recommendedCapitalAllocation * 100).toFixed(0)}%
                </div>
              </div>
            </div>
          </div>

          {/* Trading Signals - COMPACT GRID VIEW */}
          {momentumScanResult.signals && momentumScanResult.signals.length > 0 ? (
            <div className="screener-results">
              <h3 style={{ marginBottom: '20px' }}>🎯 Trading Signals ({momentumScanResult.signals.length})</h3>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
                gap: '15px',
                marginTop: '20px'
              }}>
              {momentumScanResult.signals.map((signal: MomentumSignal, index: number) => {
                const signalColor =
                  signal.signal === 'STRONG_BUY' ? '#10B981' :
                  signal.signal === 'BUY' ? '#3B82F6' :
                  signal.signal === 'WATCH' ? '#F59E0B' : '#9CA3AF'

                const riskReward = ((signal.target1 - signal.entryPrice) / (signal.entryPrice - signal.stopLoss)).toFixed(1)

                return (
                  <div key={index} style={{
                    background: 'linear-gradient(145deg, #1a1a1a, #2a2a2a)',
                    borderRadius: '10px',
                    padding: '15px',
                    border: `2px solid ${signalColor}`,
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                    fontSize: '0.9em'
                  }}>
                    {/* Compact Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '1.5em', fontWeight: 'bold', marginBottom: '4px' }}>
                          {signal.symbol}
                        </div>
                        <div style={{ display: 'flex', gap: '6px', fontSize: '0.8em', opacity: 0.8, flexWrap: 'wrap' }}>
                          <span style={{
                            padding: '2px 6px',
                            background: signalColor,
                            borderRadius: '3px',
                            fontWeight: 'bold'
                          }}>
                            {signal.signal.replace('_', ' ')}
                          </span>
                          <span>Score: {signal.momentumScore}</span>
                          <span>Conf: {signal.confidence}%</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '1.3em', fontWeight: 'bold' }}>₹{signal.current.toFixed(2)}</div>
                        <div style={{
                          fontSize: '0.85em',
                          color: signal.changePercent >= 0 ? '#10B981' : '#EF4444',
                          fontWeight: 'bold'
                        }}>
                          {signal.changePercent >= 0 ? '▲' : '▼'} {Math.abs(signal.changePercent).toFixed(2)}%
                        </div>
                      </div>
                    </div>

                    {/* Compact Trading Levels */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '6px',
                      marginBottom: '10px',
                      padding: '10px',
                      background: 'rgba(0, 0, 0, 0.3)',
                      borderRadius: '6px',
                      fontSize: '0.85em'
                    }}>
                      <div>
                        <div style={{ opacity: 0.6, fontSize: '0.8em' }}>Entry</div>
                        <div style={{ fontWeight: 'bold', color: '#3B82F6' }}>₹{signal.entryPrice.toFixed(2)}</div>
                      </div>
                      <div>
                        <div style={{ opacity: 0.6, fontSize: '0.8em' }}>Stop Loss</div>
                        <div style={{ fontWeight: 'bold', color: '#EF4444' }}>
                          ₹{signal.stopLoss.toFixed(2)}
                          <span style={{ fontSize: '0.75em', opacity: 0.6, marginLeft: '3px' }}>
                            ({(((signal.stopLoss - signal.entryPrice) / signal.entryPrice) * 100).toFixed(1)}%)
                          </span>
                        </div>
                      </div>
                      <div>
                        <div style={{ opacity: 0.6, fontSize: '0.8em' }}>Target 1</div>
                        <div style={{ fontWeight: 'bold', color: '#10B981' }}>₹{signal.target1.toFixed(2)}</div>
                      </div>
                      <div>
                        <div style={{ opacity: 0.6, fontSize: '0.8em' }}>Target 2</div>
                        <div style={{ fontWeight: 'bold', color: '#00ff64' }}>₹{signal.target2.toFixed(2)}</div>
                      </div>
                    </div>

                    {/* Compact Position Info */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr',
                      gap: '6px',
                      padding: '8px',
                      background: 'rgba(102, 126, 234, 0.1)',
                      borderRadius: '6px',
                      marginBottom: '10px',
                      fontSize: '0.8em'
                    }}>
                      <div>
                        <div style={{ opacity: 0.6, fontSize: '0.85em' }}>Qty</div>
                        <div style={{ fontWeight: 'bold' }}>{signal.positionSize}</div>
                      </div>
                      <div>
                        <div style={{ opacity: 0.6, fontSize: '0.85em' }}>Capital</div>
                        <div style={{ fontWeight: 'bold' }}>₹{(signal.capitalRequired / 1000).toFixed(0)}k</div>
                      </div>
                      <div>
                        <div style={{ opacity: 0.6, fontSize: '0.85em' }}>R:R</div>
                        <div style={{ fontWeight: 'bold', color: '#F59E0B' }}>1:{riskReward}</div>
                      </div>
                    </div>

                    {/* Compact Technicals */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '6px',
                      background: 'rgba(0, 0, 0, 0.2)',
                      borderRadius: '4px',
                      fontSize: '0.75em',
                      marginBottom: '10px'
                    }}>
                      <span>RSI: <strong>{signal.rsi.toFixed(0)}</strong></span>
                      <span>Vol: <strong>{signal.volumeRatio.toFixed(1)}x</strong></span>
                      <span>⏱ <strong>{signal.timeframe}</strong></span>
                    </div>

                    {/* Compact Reasons (first 3) */}
                    <div style={{
                      fontSize: '0.75em',
                      opacity: 0.8,
                      lineHeight: '1.4',
                      marginBottom: '10px',
                      maxHeight: '55px',
                      overflow: 'hidden'
                    }}>
                      {signal.reasons.slice(0, 3).map((reason, i) => (
                        <div key={i}>• {reason}</div>
                      ))}
                    </div>

                    {/* Warnings (first one only) */}
                    {signal.warnings.length > 0 && (
                      <div style={{
                        fontSize: '0.7em',
                        padding: '5px',
                        background: 'rgba(245, 158, 11, 0.1)',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        borderRadius: '4px',
                        marginBottom: '10px',
                        color: '#FCA5A5'
                      }}>
                        ⚠️ {signal.warnings[0]}
                      </div>
                    )}

                    {/* Analyst Reports */}
                    {analystReportsCache[signal.symbol] && analystReportsCache[signal.symbol].length > 0 && (
                      <div style={{
                        fontSize: '0.75em',
                        padding: '8px',
                        background: 'rgba(102, 126, 234, 0.15)',
                        border: '1px solid rgba(102, 126, 234, 0.3)',
                        borderRadius: '6px',
                        marginBottom: '10px'
                      }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#A78BFA' }}>
                          💡 Analyst View
                        </div>
                        {analystReportsCache[signal.symbol].slice(0, 1).map((report: any) => (
                          <div key={report.id}>
                            {report.structuredData?.rating && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                                <span style={{ opacity: 0.8 }}>Rating:</span>
                                <span style={{
                                  fontWeight: 'bold',
                                  color: report.structuredData.rating === 'BUY' || report.structuredData.rating === 'ACCUMULATE'
                                    ? '#00ff64'
                                    : report.structuredData.rating === 'SELL' || report.structuredData.rating === 'REDUCE'
                                      ? '#EF4444'
                                      : '#FCD34D'
                                }}>
                                  {report.structuredData.rating}
                                </span>
                              </div>
                            )}
                            {report.structuredData?.targetPrice && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                                <span style={{ opacity: 0.8 }}>Target:</span>
                                <span style={{ fontWeight: 'bold', color: '#3B82F6' }}>
                                  ₹{report.structuredData.targetPrice}
                                  {report.structuredData.upside && (
                                    <span style={{
                                      fontSize: '0.85em',
                                      marginLeft: '4px',
                                      color: report.structuredData.upside > 0 ? '#00ff64' : '#EF4444'
                                    }}>
                                      ({report.structuredData.upside > 0 ? '+' : ''}{report.structuredData.upside.toFixed(1)}%)
                                    </span>
                                  )}
                                </span>
                              </div>
                            )}
                            <div style={{ fontSize: '0.9em', opacity: 0.7, marginTop: '4px' }}>
                              {report.source} • {new Date(report.reportDate).toLocaleDateString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Execute Button */}
                    <button
                      onClick={() => executePaperTrade(signal)}
                      disabled={isExecutingTrade || !isPaperMode}
                      style={{
                        width: '100%',
                        padding: '10px',
                        background: isPaperMode
                          ? (isExecutingTrade ? '#666' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)')
                          : 'rgba(255, 0, 100, 0.3)',
                        border: isPaperMode ? 'none' : '2px solid #ff0064',
                        borderRadius: '6px',
                        color: '#fff',
                        fontWeight: 'bold',
                        cursor: (isExecutingTrade || !isPaperMode) ? 'not-allowed' : 'pointer',
                        opacity: (isExecutingTrade || !isPaperMode) ? 0.6 : 1,
                        fontSize: '0.9em'
                      }}
                    >
                      {isExecutingTrade
                        ? '⏳ Executing...'
                        : isPaperMode
                          ? '📝 Execute Paper Trade'
                          : '🔴 LIVE Trading Not Implemented'}
                    </button>
                  </div>
                )
              })}
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
              <h3 style={{ marginBottom: '10px' }}>No Signals Found</h3>
              <p style={{ fontSize: '1.1em', opacity: 0.7 }}>
                Try lowering the minimum score or run the scan during market hours for better results.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Initial State */}
      {!momentumScanResult && !isScanningMomentum && (
        <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
          <h3 style={{ marginBottom: '15px' }}>Ready to Find Money-Making Setups! 💰</h3>
          <p style={{ fontSize: '1.1em', opacity: 0.8, marginBottom: '20px', lineHeight: '1.7' }}>
            This scanner identifies high-probability swing trade opportunities with:
          </p>
          <div style={{
            padding: '25px',
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '10px',
            display: 'inline-block',
            textAlign: 'left'
          }}>
            <ul style={{ marginLeft: '20px', lineHeight: '2' }}>
              <li><strong>Clean uptrends:</strong> SMA5 {'>'} SMA10 {'>'} SMA20</li>
              <li><strong>Volume confirmation:</strong> Above-average volume</li>
              <li><strong>Momentum:</strong> Recent strength (60%+ up days)</li>
              <li><strong>Risk management:</strong> Max 1.5% risk per trade</li>
              <li><strong>Position sizing:</strong> Automatic calculation based on your capital</li>
              <li><strong>Clear levels:</strong> Entry, stop-loss, targets pre-calculated</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
})
