'use client'

import { useState, useEffect } from 'react'

interface CorrelationPair {
  stock1: string
  stock2: string
  correlation: number
  strength: string
  interpretation: string
}

interface CorrelationData {
  success: boolean
  symbols: string[]
  matrix: number[][]
  topCorrelations: CorrelationPair[]
  insights: {
    highlyCorrelated: CorrelationPair[]
    negativelyCorrrelated: CorrelationPair[]
    diversified: CorrelationPair[]
  }
  clusters: { name: string; stocks: string[]; avgCorrelation: number }[]
  portfolioScore?: {
    score: number
    interpretation: string
    warnings: string[]
  }
  dataPoints: number
  analyzedAt: string
}

interface CorrelationMatrixProps {
  portfolioSymbols?: string[]  // Current portfolio for score calculation
}

export default function CorrelationMatrix({ portfolioSymbols }: CorrelationMatrixProps) {
  const [data, setData] = useState<CorrelationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [customSymbols, setCustomSymbols] = useState('')

  const fetchCorrelation = async (symbols?: string) => {
    try {
      setLoading(true)
      setError(null)
      
      let url = '/api/market/correlation'
      const params = new URLSearchParams()
      
      if (symbols) {
        params.set('symbols', symbols)
      }
      if (portfolioSymbols && portfolioSymbols.length > 0) {
        params.set('portfolio', portfolioSymbols.join(','))
      }
      
      if (params.toString()) {
        url += '?' + params.toString()
      }
      
      const response = await fetch(url)
      const result = await response.json()
      
      if (result.success) {
        setData(result)
      } else {
        setError(result.error || 'Failed to fetch correlation data')
      }
    } catch (err: any) {
      setError(err.message || 'Network error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCorrelation()
  }, [portfolioSymbols])

  const getCorrelationColor = (corr: number): string => {
    if (corr >= 0.7) return '#FF4444'
    if (corr >= 0.4) return '#FF8888'
    if (corr >= 0.2) return '#FFBBBB'
    if (corr <= -0.7) return '#4444FF'
    if (corr <= -0.4) return '#8888FF'
    if (corr <= -0.2) return '#BBBBFF'
    return 'rgba(255,255,255,0.1)'
  }

  if (loading && !data) {
    return (
      <div style={{
        background: 'rgba(0, 0, 0, 0.3)',
        borderRadius: '16px',
        padding: '20px',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="animate-spin" style={{ 
            width: '20px', 
            height: '20px', 
            border: '2px solid rgba(255,255,255,0.3)',
            borderTopColor: '#8B5CF6',
            borderRadius: '50%'
          }}></div>
          <span style={{ color: 'rgba(255,255,255,0.7)' }}>Calculating correlations...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        background: 'rgba(0, 0, 0, 0.3)',
        borderRadius: '16px',
        padding: '20px',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: '#EF4444' }}>⚠️ {error}</span>
          <button 
            onClick={() => fetchCorrelation(customSymbols || undefined)}
            style={{
              background: 'rgba(139, 92, 246, 0.2)',
              border: '1px solid rgba(139, 92, 246, 0.5)',
              borderRadius: '8px',
              padding: '8px 16px',
              color: '#8B5CF6',
              cursor: 'pointer'
            }}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div style={{
      background: 'rgba(0, 0, 0, 0.3)',
      borderRadius: '16px',
      padding: '20px',
      marginBottom: '20px'
    }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.3em' }}>📊 Correlation Matrix</h3>
          <div style={{ fontSize: '0.85em', opacity: 0.7 }}>
            {data.symbols.length} stocks • {data.dataPoints} days of data
          </div>
        </div>
        <button
          onClick={() => setShowHeatmap(!showHeatmap)}
          style={{
            background: showHeatmap ? 'rgba(139, 92, 246, 0.3)' : 'rgba(139, 92, 246, 0.1)',
            border: '1px solid rgba(139, 92, 246, 0.5)',
            borderRadius: '8px',
            padding: '8px 16px',
            color: '#8B5CF6',
            cursor: 'pointer'
          }}
        >
          {showHeatmap ? 'Hide' : 'Show'} Heatmap
        </button>
      </div>

      {/* Portfolio Score (if available) */}
      {data.portfolioScore && (
        <div style={{
          background: data.portfolioScore.score > 50 ? 'rgba(239, 68, 68, 0.15)' : 
                     data.portfolioScore.score > 30 ? 'rgba(245, 158, 11, 0.15)' : 
                     'rgba(16, 185, 129, 0.15)',
          borderRadius: '12px',
          padding: '15px',
          marginBottom: '20px',
          border: `1px solid ${data.portfolioScore.score > 50 ? 'rgba(239, 68, 68, 0.3)' : 
                              data.portfolioScore.score > 30 ? 'rgba(245, 158, 11, 0.3)' : 
                              'rgba(16, 185, 129, 0.3)'}`
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Portfolio Correlation Score</div>
              <div style={{ fontSize: '1.2em', fontWeight: 'bold' }}>
                {data.portfolioScore.score.toFixed(1)}%
              </div>
            </div>
            <div style={{ textAlign: 'right', maxWidth: '60%' }}>
              <div style={{ fontSize: '0.9em' }}>{data.portfolioScore.interpretation}</div>
            </div>
          </div>
          {data.portfolioScore.warnings.length > 0 && (
            <div style={{ marginTop: '10px', fontSize: '0.85em' }}>
              {data.portfolioScore.warnings.map((w, i) => (
                <div key={i} style={{ color: '#F59E0B' }}>{w}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Heatmap (when expanded) */}
      {showHeatmap && (
        <div style={{ 
          overflowX: 'auto', 
          marginBottom: '20px',
          background: 'rgba(0,0,0,0.2)',
          borderRadius: '12px',
          padding: '15px'
        }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '0.75em' }}>
            <thead>
              <tr>
                <th style={{ padding: '4px', textAlign: 'left' }}></th>
                {data.symbols.map(s => (
                  <th key={s} style={{ 
                    padding: '4px', 
                    writingMode: 'vertical-rl',
                    textOrientation: 'mixed',
                    maxWidth: '30px'
                  }}>
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.symbols.map((row, i) => (
                <tr key={row}>
                  <td style={{ padding: '4px', fontWeight: 'bold' }}>{row}</td>
                  {data.matrix[i].map((corr, j) => (
                    <td key={j} style={{
                      padding: '4px',
                      textAlign: 'center',
                      background: getCorrelationColor(corr),
                      color: Math.abs(corr) > 0.5 ? 'white' : 'inherit',
                      minWidth: '35px'
                    }}>
                      {i === j ? '1' : corr.toFixed(2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Insights Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '15px' }}>
        {/* Highly Correlated */}
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', borderRadius: '12px', padding: '15px' }}>
          <div style={{ fontSize: '0.9em', fontWeight: 'bold', marginBottom: '10px', color: '#EF4444' }}>
            🔴 Highly Correlated ({data.insights.highlyCorrelated.length})
          </div>
          {data.insights.highlyCorrelated.length === 0 ? (
            <div style={{ fontSize: '0.85em', opacity: 0.7 }}>No highly correlated pairs found</div>
          ) : (
            data.insights.highlyCorrelated.slice(0, 5).map((pair, i) => (
              <div key={i} style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                fontSize: '0.85em',
                marginBottom: '5px',
                padding: '5px',
                background: 'rgba(0,0,0,0.2)',
                borderRadius: '6px'
              }}>
                <span>{pair.stock1} ↔ {pair.stock2}</span>
                <span style={{ color: '#FF6B6B', fontWeight: 'bold' }}>
                  {(pair.correlation * 100).toFixed(0)}%
                </span>
              </div>
            ))
          )}
        </div>

        {/* Negatively Correlated (Good for hedging) */}
        <div style={{ background: 'rgba(59, 130, 246, 0.1)', borderRadius: '12px', padding: '15px' }}>
          <div style={{ fontSize: '0.9em', fontWeight: 'bold', marginBottom: '10px', color: '#3B82F6' }}>
            🔵 Negative Correlation ({data.insights.negativelyCorrrelated.length})
          </div>
          {data.insights.negativelyCorrrelated.length === 0 ? (
            <div style={{ fontSize: '0.85em', opacity: 0.7 }}>No negative correlations found</div>
          ) : (
            data.insights.negativelyCorrrelated.slice(0, 5).map((pair, i) => (
              <div key={i} style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                fontSize: '0.85em',
                marginBottom: '5px',
                padding: '5px',
                background: 'rgba(0,0,0,0.2)',
                borderRadius: '6px'
              }}>
                <span>{pair.stock1} ↔ {pair.stock2}</span>
                <span style={{ color: '#60A5FA', fontWeight: 'bold' }}>
                  {(pair.correlation * 100).toFixed(0)}%
                </span>
              </div>
            ))
          )}
          <div style={{ fontSize: '0.75em', opacity: 0.6, marginTop: '8px' }}>
            💡 Good for hedging
          </div>
        </div>
      </div>

      {/* Clusters */}
      {data.clusters.length > 0 && (
        <div style={{ marginTop: '15px' }}>
          <div style={{ fontSize: '0.9em', fontWeight: 'bold', marginBottom: '10px' }}>
            🔗 Stock Clusters (move together)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {data.clusters.map((cluster, i) => (
              <div key={i} style={{
                background: 'rgba(139, 92, 246, 0.15)',
                borderRadius: '8px',
                padding: '10px',
                border: '1px solid rgba(139, 92, 246, 0.3)'
              }}>
                <div style={{ fontSize: '0.75em', opacity: 0.7 }}>
                  Avg: {(cluster.avgCorrelation * 100).toFixed(0)}% correlated
                </div>
                <div style={{ fontSize: '0.85em', fontWeight: 'bold' }}>
                  {cluster.stocks.join(', ')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Custom symbols input */}
      <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            value={customSymbols}
            onChange={(e) => setCustomSymbols(e.target.value)}
            placeholder="Enter symbols: RELIANCE,TCS,INFY..."
            style={{
              flex: 1,
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '8px',
              padding: '10px',
              color: 'white',
              fontSize: '0.9em'
            }}
          />
          <button
            onClick={() => fetchCorrelation(customSymbols || undefined)}
            disabled={loading}
            style={{
              background: 'rgba(139, 92, 246, 0.3)',
              border: '1px solid rgba(139, 92, 246, 0.5)',
              borderRadius: '8px',
              padding: '10px 20px',
              color: '#8B5CF6',
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.5 : 1
            }}
          >
            {loading ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>
        <div style={{ fontSize: '0.75em', opacity: 0.5, marginTop: '5px' }}>
          Leave empty for default top 15 liquid stocks
        </div>
      </div>
    </div>
  )
}
