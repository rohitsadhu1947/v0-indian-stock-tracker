'use client'

import { useState, useEffect } from 'react'

interface RegimeData {
  success: boolean
  regime: string
  regimeEmoji: string
  regimeColor: string
  confidence: number
  market: {
    index: string
    price: number
    change: number
    changePercent: number
    dayHigh: number
    dayLow: number
    open: number
  }
  indicators: {
    sma20: number | null
    sma50: number | null
    sma200: number | null
    rsi: number
    trendStrength: number
    trendDirection: string
  }
  pricePosition: {
    vsSma20: string
    vsSma50: string
    vsSma200: string
  }
  volatility: {
    regime: string
    percent: number
  }
  trading: {
    positionSizeMultiplier: number
    riskTolerance: string
    recommendation: string
  }
  signals: string[]
  warnings: string[]
  analyzedAt: string
  cached: boolean
}

export default function MarketRegimeCard() {
  const [regime, setRegime] = useState<RegimeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const fetchRegime = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch('/api/market/regime')
      const data = await response.json()
      
      if (data.success) {
        setRegime(data)
      } else {
        setError(data.error || 'Failed to fetch regime')
      }
    } catch (err: any) {
      setError(err.message || 'Network error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRegime()
    
    // Refresh every 5 minutes
    const interval = setInterval(fetchRegime, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  if (loading && !regime) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        borderRadius: '16px',
        padding: '20px',
        border: '1px solid rgba(255,255,255,0.1)',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="animate-spin" style={{ 
            width: '20px', 
            height: '20px', 
            border: '2px solid rgba(255,255,255,0.3)',
            borderTopColor: '#3B82F6',
            borderRadius: '50%'
          }}></div>
          <span style={{ color: 'rgba(255,255,255,0.7)' }}>Analyzing market regime...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        borderRadius: '16px',
        padding: '20px',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: '#EF4444' }}>⚠️ {error}</span>
          <button 
            onClick={fetchRegime}
            style={{
              background: 'rgba(59, 130, 246, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.5)',
              borderRadius: '8px',
              padding: '8px 16px',
              color: '#3B82F6',
              cursor: 'pointer'
            }}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!regime) return null

  const getRegimeBackground = () => {
    switch (regime.regime) {
      case 'STRONG_BULL': return 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.05) 100%)'
      case 'BULL': return 'linear-gradient(135deg, rgba(52, 211, 153, 0.15) 0%, rgba(52, 211, 153, 0.05) 100%)'
      case 'SIDEWAYS': return 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(245, 158, 11, 0.05) 100%)'
      case 'BEAR': return 'linear-gradient(135deg, rgba(248, 113, 113, 0.15) 0%, rgba(248, 113, 113, 0.05) 100%)'
      case 'STRONG_BEAR': return 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(239, 68, 68, 0.05) 100%)'
      default: return 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)'
    }
  }

  return (
    <div style={{
      background: getRegimeBackground(),
      borderRadius: '16px',
      padding: '20px',
      border: `1px solid ${regime.regimeColor}40`,
      marginBottom: '20px',
      cursor: 'pointer',
      transition: 'all 0.3s ease'
    }} onClick={() => setExpanded(!expanded)}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: expanded ? '15px' : '0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '2em' }}>{regime.regimeEmoji}</span>
          <div>
            <div style={{ fontSize: '1.3em', fontWeight: 'bold', color: regime.regimeColor }}>
              {regime.regime.replace('_', ' ')} Market
            </div>
            <div style={{ fontSize: '0.85em', opacity: 0.7 }}>
              {regime.confidence}% confidence • Click to {expanded ? 'collapse' : 'expand'}
            </div>
          </div>
        </div>
        
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '1.5em', fontWeight: 'bold' }}>
            {regime.market.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
          <div style={{ 
            fontSize: '0.9em', 
            color: regime.market.changePercent >= 0 ? '#10B981' : '#EF4444' 
          }}>
            {regime.market.changePercent >= 0 ? '+' : ''}{regime.market.changePercent.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <>
          {/* Trading Recommendation */}
          <div style={{
            background: 'rgba(0,0,0,0.2)',
            borderRadius: '12px',
            padding: '15px',
            marginBottom: '15px'
          }}>
            <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: '8px' }}>💡 Trading Recommendation</div>
            <div style={{ fontSize: '1em' }}>{regime.trading.recommendation}</div>
            <div style={{ 
              display: 'flex', 
              gap: '20px', 
              marginTop: '12px',
              fontSize: '0.85em'
            }}>
              <div>
                <span style={{ opacity: 0.7 }}>Position Size: </span>
                <span style={{ 
                  color: regime.trading.positionSizeMultiplier >= 1 ? '#10B981' : '#F59E0B',
                  fontWeight: 'bold'
                }}>
                  {(regime.trading.positionSizeMultiplier * 100).toFixed(0)}%
                </span>
              </div>
              <div>
                <span style={{ opacity: 0.7 }}>Risk Mode: </span>
                <span style={{ fontWeight: 'bold' }}>{regime.trading.riskTolerance}</span>
              </div>
            </div>
          </div>

          {/* Technical Indicators */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '10px',
            marginBottom: '15px'
          }}>
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75em', opacity: 0.7 }}>SMA 20</div>
              <div style={{ fontWeight: 'bold', color: regime.pricePosition.vsSma20 === 'ABOVE' ? '#10B981' : regime.pricePosition.vsSma20 === 'BELOW' ? '#EF4444' : '#9CA3AF' }}>
                {regime.indicators.sma20?.toFixed(0) ?? 'N/A'}
              </div>
              <div style={{ fontSize: '0.7em', opacity: 0.6 }}>{regime.pricePosition.vsSma20}</div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75em', opacity: 0.7 }}>SMA 50</div>
              <div style={{ fontWeight: 'bold', color: regime.pricePosition.vsSma50 === 'ABOVE' ? '#10B981' : regime.pricePosition.vsSma50 === 'BELOW' ? '#EF4444' : '#9CA3AF' }}>
                {regime.indicators.sma50?.toFixed(0) ?? 'N/A'}
              </div>
              <div style={{ fontSize: '0.7em', opacity: 0.6 }}>{regime.pricePosition.vsSma50}</div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75em', opacity: 0.7 }}>SMA 200</div>
              <div style={{ fontWeight: 'bold', color: regime.pricePosition.vsSma200 === 'ABOVE' ? '#10B981' : regime.pricePosition.vsSma200 === 'BELOW' ? '#EF4444' : '#9CA3AF' }}>
                {regime.indicators.sma200?.toFixed(0) ?? 'N/A'}
              </div>
              <div style={{ fontSize: '0.7em', opacity: 0.6 }}>{regime.pricePosition.vsSma200}</div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75em', opacity: 0.7 }}>RSI</div>
              <div style={{ 
                fontWeight: 'bold', 
                color: regime.indicators.rsi > 60 ? '#10B981' : regime.indicators.rsi < 40 ? '#EF4444' : '#F59E0B' 
              }}>
                {regime.indicators.rsi.toFixed(0)}
              </div>
              <div style={{ fontSize: '0.7em', opacity: 0.6 }}>
                {regime.indicators.rsi > 70 ? 'Overbought' : regime.indicators.rsi < 30 ? 'Oversold' : 'Neutral'}
              </div>
            </div>
          </div>

          {/* Volatility & Trend */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '10px',
            marginBottom: '15px'
          }}>
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.75em', opacity: 0.7 }}>Volatility</div>
              <div style={{ 
                fontWeight: 'bold',
                color: regime.volatility.regime === 'LOW' ? '#10B981' : 
                       regime.volatility.regime === 'NORMAL' ? '#3B82F6' :
                       regime.volatility.regime === 'HIGH' ? '#F59E0B' : '#EF4444'
              }}>
                {regime.volatility.regime} ({regime.volatility.percent.toFixed(2)}%)
              </div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.75em', opacity: 0.7 }}>Trend</div>
              <div style={{ fontWeight: 'bold' }}>
                {regime.indicators.trendDirection === 'UP' ? '📈' : 
                 regime.indicators.trendDirection === 'DOWN' ? '📉' : '↔️'} 
                {' '}{regime.indicators.trendDirection} ({regime.indicators.trendStrength.toFixed(0)}% strength)
              </div>
            </div>
          </div>

          {/* Signals */}
          {regime.signals.length > 0 && (
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: '8px' }}>📊 Signals</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {regime.signals.map((signal, i) => (
                  <span key={i} style={{
                    background: 'rgba(59, 130, 246, 0.2)',
                    padding: '4px 10px',
                    borderRadius: '12px',
                    fontSize: '0.8em'
                  }}>
                    {signal}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Warnings */}
          {regime.warnings.length > 0 && (
            <div>
              {regime.warnings.map((warning, i) => (
                <div key={i} style={{
                  background: 'rgba(245, 158, 11, 0.15)',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  fontSize: '0.85em',
                  marginBottom: '5px'
                }}>
                  {warning}
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div style={{ 
            marginTop: '15px', 
            paddingTop: '10px', 
            borderTop: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.75em',
            opacity: 0.6
          }}>
            <span>Updated: {new Date(regime.analyzedAt).toLocaleTimeString()}</span>
            <span>{regime.cached ? '📦 Cached' : '🔄 Fresh'}</span>
          </div>
        </>
      )}
    </div>
  )
}
