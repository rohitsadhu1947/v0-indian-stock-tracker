'use client'

/**
 * Paper trades opened from the old swing scanner.
 *
 * The scanner was removed after testing showed its buy signal did worse
 * than a random day in the same stocks. Positions it opened are still
 * tracked here and closed at their stop or target; no new ones can be
 * opened. New paper investing happens in the Monthly Plan.
 */
import React, { memo, useEffect } from 'react'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useMarketStore } from '@/lib/stores/market-store'
import { usePositionsStore } from '@/lib/stores/positions-store'
import RiskDashboard from './RiskDashboard'

export default memo(function PaperTradesTab() {
  const { authStatus } = useAuthStore()
  // Capital and position limits the trades were sized against
  const { momentumCapital, momentumMaxPositions } = useMarketStore()

  const {
    paperPositions,
    setPaperPositions,
    setIsLoadingPaperPositions,
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

  useEffect(() => { loadPaperPositions() }, [authStatus.authenticated])

  return (
    <div>
      <div className="card" style={{ marginBottom: '25px', padding: '25px' }}>
        <h3 style={{ marginBottom: '12px', fontSize: '1.8em' }}>📝 Paper Trades</h3>
        <p style={{ marginBottom: '20px', opacity: 0.85, lineHeight: '1.6' }}>
          Trades opened from the old swing scanner. That scanner has been removed: when tested, stocks did worse after its
          buy signal than on a random day. Open positions are still tracked and closed at their stop or target. Nothing new
          can be opened here; the Monthly Plan has its own paper book.
        </p>
        <div>
          {/* Paper Positions Summary */}
          {paperPositions.length > 0 && (
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
          {(
            <RiskDashboard
              paperPositions={paperPositions}
              capital={300000}
            />
          )}

          {/* Detailed Paper Positions Table */}
          {paperPositions.length > 0 && (
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
      </div>
    </div>
  )
})
