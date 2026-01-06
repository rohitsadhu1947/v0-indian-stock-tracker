'use client'

import { useState, useEffect } from 'react'

interface FIIDIIData {
  date: string
  fiiBuyValue: number
  fiiSellValue: number
  fiiNetValue: number
  diiBuyValue: number
  diiSellValue: number
  diiNetValue: number
  totalNetValue: number
}

interface BulkDeal {
  date: string
  symbol: string
  clientName: string
  dealType: string
  buySell: 'BUY' | 'SELL'
  quantity: number
  price: number
  value: number
}

interface Insight {
  type: string
  severity: string
  title: string
  description: string
  value?: number
  symbol?: string
}

interface SmartMoneyData {
  success: boolean
  signal: string
  signalEmoji: string
  signalColor: string
  confidence: number
  latest: FIIDIIData | null
  fiiTrend: { direction: string; totalNet: number; avgDaily: number; consecutiveDays: number; description: string }
  diiTrend: { direction: string; totalNet: number; avgDaily: number; consecutiveDays: number; description: string }
  history: FIIDIIData[]
  bulkDeals: BulkDeal[]
  insights: Insight[]
  dataSource: string
  periodDays: number
  analyzedAt: string
  cached: boolean
}

export default function SmartMoneyCard() {
  const [data, setData] = useState<SmartMoneyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch('/api/market/smart-money')
      const result = await response.json()
      
      if (result.success) {
        setData(result)
      } else {
        setError(result.error || 'Failed to fetch data')
      }
    } catch (err: any) {
      setError(err.message || 'Network error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  if (loading && !data) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(147, 51, 234, 0.15) 100%)',
        borderRadius: '16px',
        padding: '20px',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.5em' }}>🐋</span>
          <span style={{ color: 'rgba(255,255,255,0.7)' }}>Loading smart money data...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        background: 'rgba(239, 68, 68, 0.15)',
        borderRadius: '16px',
        padding: '20px',
        marginBottom: '20px'
      }}>
        <span style={{ color: '#EF4444' }}>⚠️ {error}</span>
      </div>
    )
  }

  if (!data) return null

  const getSignalBackground = () => {
    if (data.signal.includes('BULLISH')) {
      return 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.05) 100%)'
    } else if (data.signal.includes('BEARISH')) {
      return 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(239, 68, 68, 0.05) 100%)'
    }
    return 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(245, 158, 11, 0.05) 100%)'
  }

  return (
    <div 
      style={{
        background: getSignalBackground(),
        borderRadius: '16px',
        padding: '20px',
        border: `1px solid ${data.signalColor}40`,
        marginBottom: '20px',
        cursor: 'pointer'
      }}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '2em' }}>{data.signalEmoji}</span>
          <div>
            <div style={{ fontSize: '1.2em', fontWeight: 'bold', color: data.signalColor }}>
              Smart Money: {data.signal.replace('_', ' ')}
            </div>
            <div style={{ fontSize: '0.85em', opacity: 0.7 }}>
              {data.confidence}% confidence • {data.periodDays} days analyzed • Click to {expanded ? 'collapse' : 'expand'}
            </div>
          </div>
        </div>
        
        {/* Latest Net */}
        {data.latest && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.8em', opacity: 0.7 }}>Today's Net Flow</div>
            <div style={{ 
              fontSize: '1.3em', 
              fontWeight: 'bold',
              color: data.latest.totalNetValue >= 0 ? '#10B981' : '#EF4444'
            }}>
              {data.latest.totalNetValue >= 0 ? '+' : ''}₹{data.latest.totalNetValue.toLocaleString()} Cr
            </div>
          </div>
        )}
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div style={{ marginTop: '20px' }}>
          {/* FII/DII Summary */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(2, 1fr)', 
            gap: '15px',
            marginBottom: '20px'
          }}>
            {/* FII Card */}
            <div style={{
              background: 'rgba(0,0,0,0.2)',
              borderRadius: '12px',
              padding: '15px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <span>🌍</span>
                <span style={{ fontWeight: 'bold' }}>FII (Foreign)</span>
              </div>
              <div style={{ 
                fontSize: '1.5em', 
                fontWeight: 'bold',
                color: data.fiiTrend.direction === 'BUYING' ? '#10B981' : 
                       data.fiiTrend.direction === 'SELLING' ? '#EF4444' : '#F59E0B',
                marginBottom: '5px'
              }}>
                {data.fiiTrend.direction === 'BUYING' ? '+' : data.fiiTrend.direction === 'SELLING' ? '-' : ''}
                ₹{Math.abs(data.fiiTrend.totalNet).toLocaleString()} Cr
              </div>
              <div style={{ fontSize: '0.85em', opacity: 0.8 }}>
                {data.fiiTrend.description}
              </div>
              {data.fiiTrend.consecutiveDays >= 3 && (
                <div style={{ 
                  fontSize: '0.8em', 
                  marginTop: '5px',
                  color: data.fiiTrend.direction === 'BUYING' ? '#34D399' : '#F87171'
                }}>
                  🔥 {data.fiiTrend.consecutiveDays} consecutive days
                </div>
              )}
            </div>

            {/* DII Card */}
            <div style={{
              background: 'rgba(0,0,0,0.2)',
              borderRadius: '12px',
              padding: '15px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <span>🏠</span>
                <span style={{ fontWeight: 'bold' }}>DII (Domestic)</span>
              </div>
              <div style={{ 
                fontSize: '1.5em', 
                fontWeight: 'bold',
                color: data.diiTrend.direction === 'BUYING' ? '#10B981' : 
                       data.diiTrend.direction === 'SELLING' ? '#EF4444' : '#F59E0B',
                marginBottom: '5px'
              }}>
                {data.diiTrend.direction === 'BUYING' ? '+' : data.diiTrend.direction === 'SELLING' ? '-' : ''}
                ₹{Math.abs(data.diiTrend.totalNet).toLocaleString()} Cr
              </div>
              <div style={{ fontSize: '0.85em', opacity: 0.8 }}>
                {data.diiTrend.description}
              </div>
              {data.diiTrend.consecutiveDays >= 3 && (
                <div style={{ 
                  fontSize: '0.8em', 
                  marginTop: '5px',
                  color: data.diiTrend.direction === 'BUYING' ? '#34D399' : '#F87171'
                }}>
                  🔥 {data.diiTrend.consecutiveDays} consecutive days
                </div>
              )}
            </div>
          </div>

          {/* Insights */}
          {data.insights.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '0.9em', fontWeight: 'bold', marginBottom: '10px' }}>
                💡 Key Insights
              </div>
              {data.insights.slice(0, 4).map((insight, i) => (
                <div key={i} style={{
                  background: insight.severity === 'HIGH' ? 'rgba(139, 92, 246, 0.15)' : 'rgba(0,0,0,0.15)',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '8px',
                  borderLeft: `3px solid ${insight.severity === 'HIGH' ? '#8B5CF6' : '#6B7280'}`
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{insight.title}</div>
                  <div style={{ fontSize: '0.85em', opacity: 0.8 }}>{insight.description}</div>
                </div>
              ))}
            </div>
          )}

          {/* Recent Bulk Deals */}
          {data.bulkDeals.length > 0 && (
            <div style={{ marginBottom: '15px' }}>
              <div style={{ fontSize: '0.9em', fontWeight: 'bold', marginBottom: '10px' }}>
                🐋 Recent Bulk/Block Deals
              </div>
              <div style={{ 
                background: 'rgba(0,0,0,0.2)', 
                borderRadius: '8px', 
                overflow: 'hidden'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85em' }}>
                  <thead>
                    <tr style={{ background: 'rgba(0,0,0,0.3)' }}>
                      <th style={{ padding: '8px', textAlign: 'left' }}>Symbol</th>
                      <th style={{ padding: '8px', textAlign: 'left' }}>Client</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>Type</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bulkDeals.slice(0, 5).map((deal, i) => (
                      <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        <td style={{ padding: '8px', fontWeight: 'bold' }}>{deal.symbol}</td>
                        <td style={{ padding: '8px', opacity: 0.8 }}>{deal.clientName}</td>
                        <td style={{ 
                          padding: '8px', 
                          textAlign: 'center',
                          color: deal.buySell === 'BUY' ? '#10B981' : '#EF4444'
                        }}>
                          {deal.buySell === 'BUY' ? '🟢 BUY' : '🔴 SELL'}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          ₹{deal.value.toFixed(0)} Cr
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Historical Chart (Simple Bar Chart) */}
          {data.history.length > 0 && (
            <div style={{ marginBottom: '15px' }}>
              <div style={{ fontSize: '0.9em', fontWeight: 'bold', marginBottom: '10px' }}>
                📊 FII/DII Flow (Last {data.history.length} Days)
              </div>
              <div style={{ 
                display: 'flex', 
                alignItems: 'flex-end', 
                justifyContent: 'space-between',
                height: '100px',
                background: 'rgba(0,0,0,0.2)',
                borderRadius: '8px',
                padding: '10px'
              }}>
                {data.history.slice(0, 7).reverse().map((day, i) => {
                  const maxVal = Math.max(...data.history.map(d => Math.abs(d.totalNetValue)))
                  const height = Math.abs(day.totalNetValue) / maxVal * 70
                  const isPositive = day.totalNetValue >= 0
                  
                  return (
                    <div key={i} style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'center',
                      flex: 1
                    }}>
                      <div style={{
                        width: '20px',
                        height: `${height}px`,
                        background: isPositive ? '#10B981' : '#EF4444',
                        borderRadius: '4px 4px 0 0',
                        marginBottom: '5px'
                      }} title={`${day.date}: ₹${day.totalNetValue.toLocaleString()} Cr`}></div>
                      <div style={{ fontSize: '0.65em', opacity: 0.6 }}>
                        {new Date(day.date).toLocaleDateString('en-IN', { weekday: 'short' })}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                gap: '20px', 
                marginTop: '8px',
                fontSize: '0.75em'
              }}>
                <span>🟢 Net Buying</span>
                <span>🔴 Net Selling</span>
              </div>
            </div>
          )}

          {/* Footer */}
          <div style={{ 
            paddingTop: '10px', 
            borderTop: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.75em',
            opacity: 0.6
          }}>
            <span>Source: {data.dataSource}</span>
            <span>{data.cached ? '📦 Cached' : '🔄 Fresh'} • {new Date(data.analyzedAt).toLocaleTimeString()}</span>
          </div>
        </div>
      )}
    </div>
  )
}
