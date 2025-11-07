'use client'

import React, { useState } from 'react'
import type { BacktestResult } from '@/lib/backtesting-engine'

export default function BacktestTab() {
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // Configuration
  const [startDate, setStartDate] = useState(() => {
    const date = new Date()
    date.setMonth(date.getMonth() - 6) // 6 months ago
    return date.toISOString().split('T')[0]
  })
  const [endDate, setEndDate] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() - 1) // Yesterday (not today, markets aren't closed yet)
    return date.toISOString().split('T')[0]
  })
  const [initialCapital, setInitialCapital] = useState(300000)
  const [maxPositions, setMaxPositions] = useState(5)
  const [riskPercent, setRiskPercent] = useState(2.0)
  const [minScore, setMinScore] = useState(60)

  const runBacktest = async () => {
    setIsRunning(true)
    setError(null)
    setResult(null)

    try {
      console.log('🚀 Starting backtest...')
      const response = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate,
          endDate,
          initialCapital,
          maxPositions,
          riskPercentPerTrade: riskPercent,
          strategy: 'MASTER_SCORE',
          minScore
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || errorData.details || 'Backtest failed')
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || data.details || 'Backtest failed')
      }

      console.log('✅ Backtest complete:', data.result)
      setResult(data.result)
    } catch (err: any) {
      console.error('❌ Backtest error:', err)
      setError(err.message || 'An unknown error occurred')
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto', color: '#fff' }}>
      <h1 style={{ fontSize: '2.5em', marginBottom: '10px' }}>📊 Backtesting Lab</h1>
      <p style={{ opacity: 0.7, marginBottom: '30px' }}>
        Test your Master Score strategy on historical data. See what would have happened if you traded in the past.
      </p>

      {/* Configuration Panel */}
      <div style={{
        background: 'rgba(0, 0, 0, 0.4)',
        borderRadius: '12px',
        padding: '25px',
        marginBottom: '30px',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        <h2 style={{ fontSize: '1.5em', marginBottom: '20px' }}>⚙️ Configuration</h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '20px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '1em'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '1em'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Initial Capital (₹)</label>
            <input
              type="number"
              value={initialCapital}
              onChange={(e) => setInitialCapital(Number(e.target.value))}
              step={10000}
              style={{
                width: '100%',
                padding: '10px',
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '1em'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Max Positions</label>
            <input
              type="number"
              value={maxPositions}
              onChange={(e) => setMaxPositions(Number(e.target.value))}
              min={1}
              max={10}
              style={{
                width: '100%',
                padding: '10px',
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '1em'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Risk Per Trade (%)</label>
            <input
              type="number"
              value={riskPercent}
              onChange={(e) => setRiskPercent(Number(e.target.value))}
              step={0.1}
              min={0.5}
              max={5}
              style={{
                width: '100%',
                padding: '10px',
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '1em'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Min Score</label>
            <input
              type="number"
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              min={50}
              max={90}
              step={5}
              style={{
                width: '100%',
                padding: '10px',
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '1em'
              }}
            />
          </div>
        </div>

        <button
          onClick={runBacktest}
          disabled={isRunning}
          style={{
            padding: '15px 30px',
            background: isRunning ? 'rgba(107, 114, 128, 0.3)' : 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '1.1em',
            fontWeight: 'bold',
            cursor: isRunning ? 'not-allowed' : 'pointer',
            boxShadow: isRunning ? 'none' : '0 4px 15px rgba(102, 126, 234, 0.4)',
            opacity: isRunning ? 0.6 : 1
          }}
        >
          {isRunning ? '⏳ Running Backtest... (This may take 2-3 minutes)' : '🚀 Run Backtest'}
        </button>

        <div style={{ marginTop: '15px', fontSize: '0.9em', opacity: 0.7 }}>
          <p>💡 <strong>Tip:</strong> Backtest tests your strategy on Top 50 Nifty stocks using historical data.</p>
          <p>⏱️ Longer periods (6-12 months) give more reliable results but take longer to run.</p>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.2)',
          border: '1px solid #EF4444',
          color: '#EF4444',
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>❌ Error</div>
          <div>{error}</div>
          {error.includes('401') || error.includes('authenticated') || error.includes('login') ? (
            <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '4px' }}>
              <strong>💡 Solution:</strong> You need to login to Kite Connect first!
              <br />
              1. Click the "Login" button in the header
              <br />
              2. Complete Kite authentication
              <br />
              3. Return here and try again
            </div>
          ) : null}
        </div>
      )}

      {/* Results Display */}
      {result && (
        <div>
          {/* No Trades Warning */}
          {result.totalTrades === 0 && (
            <div style={{
              background: 'rgba(251, 191, 36, 0.2)',
              border: '1px solid #F59E0B',
              color: '#F59E0B',
              padding: '20px',
              borderRadius: '12px',
              marginBottom: '20px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '3em', marginBottom: '10px' }}>📊</div>
              <h3 style={{ fontSize: '1.5em', marginBottom: '10px' }}>No Trades Executed</h3>
              <p style={{ marginBottom: '15px', opacity: 0.9 }}>
                Your strategy didn't find any opportunities during this period.
              </p>
              <div style={{ 
                background: 'rgba(0, 0, 0, 0.3)', 
                padding: '15px', 
                borderRadius: '8px',
                textAlign: 'left'
              }}>
                <strong>💡 Try adjusting:</strong>
                <ul style={{ marginTop: '10px', paddingLeft: '20px' }}>
                  <li><strong>Min Score:</strong> Lower from 60 to 50 (more signals)</li>
                  <li><strong>Date Range:</strong> Try a different period (maybe market was sideways)</li>
                  <li><strong>Max Positions:</strong> Increase to allow more trades</li>
                  <li><strong>Check Authentication:</strong> Make sure you're logged in to Kite</li>
                </ul>
              </div>
            </div>
          )}
          
          {/* Performance Summary */}
          <div style={{
            background: 'rgba(0, 0, 0, 0.4)',
            borderRadius: '12px',
            padding: '25px',
            marginBottom: '20px',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <h2 style={{ fontSize: '1.8em', marginBottom: '20px' }}>📈 Performance Summary</h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
              <MetricCard
                label="Total Return"
                value={`${result.totalReturn >= 0 ? '+' : ''}${result.totalReturn.toFixed(2)}%`}
                color={result.totalReturn >= 0 ? '#10B981' : '#EF4444'}
                subtext={`₹${result.finalCapital.toLocaleString()}`}
              />
              <MetricCard
                label="Win Rate"
                value={`${result.winRate.toFixed(1)}%`}
                color="#3B82F6"
                subtext={`${result.winningTrades}W / ${result.losingTrades}L`}
              />
              <MetricCard
                label="Sharpe Ratio"
                value={result.sharpeRatio.toFixed(2)}
                color="#A78BFA"
                subtext={result.sharpeRatio > 1 ? 'Excellent' : result.sharpeRatio > 0.5 ? 'Good' : 'Poor'}
              />
              <MetricCard
                label="Max Drawdown"
                value={`${result.maxDrawdown.toFixed(2)}%`}
                color="#F59E0B"
                subtext={result.maxDrawdownDate ? new Date(result.maxDrawdownDate).toLocaleDateString() : 'N/A'}
              />
              <MetricCard
                label="Profit Factor"
                value={result.profitFactor === Infinity ? '∞' : result.profitFactor.toFixed(2)}
                color="#10B981"
                subtext={result.profitFactor > 2 ? 'Excellent' : result.profitFactor > 1 ? 'Good' : 'Poor'}
              />
              <MetricCard
                label="Avg R:R"
                value={result.avgRiskReward.toFixed(2)}
                color="#EF4444"
                subtext={`1:${result.avgRiskReward.toFixed(1)}`}
              />
            </div>
          </div>

          {/* Equity Curve (Placeholder for now) */}
          <div style={{
            background: 'rgba(0, 0, 0, 0.4)',
            borderRadius: '12px',
            padding: '25px',
            marginBottom: '20px',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <h2 style={{ fontSize: '1.8em', marginBottom: '20px' }}>📉 Equity Curve</h2>
            <div style={{
              height: '300px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0, 0, 0, 0.2)',
              borderRadius: '8px',
              border: '1px dashed rgba(255, 255, 255, 0.2)'
            }}>
              <div style={{ textAlign: 'center', opacity: 0.6 }}>
                <p style={{ fontSize: '1.2em', marginBottom: '10px' }}>📊 Chart Coming Soon!</p>
                <p style={{ fontSize: '0.9em' }}>
                  Equity curve shows capital growth over time.<br/>
                  Peak: ₹{result.peakCapital.toLocaleString()} | Final: ₹{result.finalCapital.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Trade List */}
          <div style={{
            background: 'rgba(0, 0, 0, 0.4)',
            borderRadius: '12px',
            padding: '25px',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <h2 style={{ fontSize: '1.8em', marginBottom: '20px' }}>
              📋 All Trades ({result.totalTrades})
            </h2>
            
            {result.trades.length === 0 ? (
              <p style={{ opacity: 0.6, textAlign: 'center', padding: '40px' }}>
                No trades executed during this period. Try adjusting your parameters.
              </p>
            ) : (
              <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid rgba(255, 255, 255, 0.2)' }}>
                      <th style={{ padding: '12px', textAlign: 'left' }}>Symbol</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>Entry</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>Exit</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>P&L</th>
                      <th style={{ padding: '12px', textAlign: 'center' }}>Days</th>
                      <th style={{ padding: '12px', textAlign: 'center' }}>Exit Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades.map((trade, index) => (
                      <tr
                        key={index}
                        style={{
                          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                          background: index % 2 === 0 ? 'rgba(0, 0, 0, 0.2)' : 'transparent'
                        }}
                      >
                        <td style={{ padding: '12px', fontWeight: 'bold' }}>{trade.symbol}</td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          ₹{trade.entryPrice.toFixed(2)}
                          <div style={{ fontSize: '0.8em', opacity: 0.6 }}>
                            {new Date(trade.entryDate).toLocaleDateString()}
                          </div>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          ₹{trade.exitPrice.toFixed(2)}
                          <div style={{ fontSize: '0.8em', opacity: 0.6 }}>
                            {new Date(trade.exitDate).toLocaleDateString()}
                          </div>
                        </td>
                        <td style={{
                          padding: '12px',
                          textAlign: 'right',
                          color: trade.pnl >= 0 ? '#10B981' : '#EF4444',
                          fontWeight: 'bold'
                        }}>
                          {trade.pnl >= 0 ? '+' : ''}₹{trade.pnl.toFixed(2)}
                          <div style={{ fontSize: '0.8em' }}>
                            ({trade.pnlPercent >= 0 ? '+' : ''}{trade.pnlPercent.toFixed(2)}%)
                          </div>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>{trade.holdingDays}d</td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '0.85em',
                            background: trade.exitReason === 'TARGET' ? 'rgba(16, 185, 129, 0.2)' :
                                       trade.exitReason === 'STOP_LOSS' ? 'rgba(239, 68, 68, 0.2)' :
                                       'rgba(107, 114, 128, 0.2)',
                            color: trade.exitReason === 'TARGET' ? '#10B981' :
                                  trade.exitReason === 'STOP_LOSS' ? '#EF4444' :
                                  '#9CA3AF'
                          }}>
                            {trade.exitReason === 'TARGET' ? '✅ Target' :
                             trade.exitReason === 'STOP_LOSS' ? '❌ Stop Loss' :
                             '⏹️ ' + trade.exitReason.replace('_', ' ')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Metric Card Component
function MetricCard({ label, value, color, subtext }: {
  label: string
  value: string
  color: string
  subtext: string
}) {
  return (
    <div style={{
      background: 'rgba(0, 0, 0, 0.3)',
      borderRadius: '8px',
      padding: '15px',
      border: `1px solid ${color}33`
    }}>
      <div style={{ fontSize: '0.9em', opacity: 0.7, marginBottom: '5px' }}>{label}</div>
      <div style={{ fontSize: '1.8em', fontWeight: 'bold', color, marginBottom: '5px' }}>{value}</div>
      <div style={{ fontSize: '0.85em', opacity: 0.6 }}>{subtext}</div>
    </div>
  )
}

