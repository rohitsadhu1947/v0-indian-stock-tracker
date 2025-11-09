/**
 * Sector Rotation Tab Component
 * 
 * Shows sector heat map and hot sector stocks for momentum trading.
 */

'use client'

import React, { useState, useEffect } from 'react'
import { generateSectorRecommendation } from '@/lib/sector-rotation'

interface SectorPerformance {
  sector: string
  stockCount: number
  avgChange: number
  positiveCount: number
  momentum: 'HOT' | 'WARM' | 'NEUTRAL' | 'COLD'
  topGainers: string[]
  topLosers: string[]
  volumeSpike: number
}

interface SectorStock {
  symbol: string
  sector: string
  sectorMomentum: string
  current: number
  changePercent: number
  volume: number
  volumeRatio: number
  totalScore?: number
  tier?: string
}

interface SectorRotationTabProps {
  onExecuteTrade?: (signal: any) => void
  isPaperMode?: boolean
  isExecutingTrade?: boolean
}

export default function SectorRotationTab({
  onExecuteTrade,
  isPaperMode = false,
  isExecutingTrade = false
}: SectorRotationTabProps) {
  const [sectorPerformance, setSectorPerformance] = useState<SectorPerformance[]>([])
  const [hotSectors, setHotSectors] = useState<SectorPerformance[]>([])
  const [hotSectorStocks, setHotSectorStocks] = useState<SectorStock[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  // Fetch sector data
  const fetchSectorData = async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      console.log('🔍 Fetching sector data...')
      const response = await fetch('/api/scanner/sector-rotation')
      
      console.log('📡 Response status:', response.status, response.statusText)
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('❌ API Error:', errorData)
        throw new Error(errorData.error || errorData.details || `HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      
      console.log('📊 Received data:', {
        totalSectors: data.totalSectors,
        hotSectors: data.hotSectors?.length,
        hotStocks: data.hotSectorStocks?.length,
        dataSource: data.dataSource
      })
      
      setSectorPerformance(data.sectorPerformance || [])
      setHotSectors(data.hotSectors || [])
      setHotSectorStocks(data.hotSectorStocks || [])
      setLastUpdate(new Date())
      
      console.log(`✅ Sector data loaded: ${data.totalSectors} sectors, ${data.hotSectorStocks?.length || 0} hot stocks`)
    } catch (err: any) {
      console.error('❌ Error fetching sector data:', err)
      setError(err.message || 'Unknown error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  // Initial load
  useEffect(() => {
    fetchSectorData()
  }, [])

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      console.log('🔄 Auto-refreshing sector data...')
      fetchSectorData()
    }, 5 * 60 * 1000) // 5 minutes

    return () => clearInterval(interval)
  }, [autoRefresh])

  // Get sector color based on momentum
  const getSectorColor = (momentum: string) => {
    switch (momentum) {
      case 'HOT':
        return { bg: 'rgba(16, 185, 129, 0.2)', border: '#10B981', text: '#10B981' }
      case 'WARM':
        return { bg: 'rgba(251, 191, 36, 0.2)', border: '#FCD34D', text: '#FCD34D' }
      case 'COLD':
        return { bg: 'rgba(239, 68, 68, 0.2)', border: '#EF4444', text: '#EF4444' }
      default:
        return { bg: 'rgba(156, 163, 175, 0.2)', border: '#9CA3AF', text: '#9CA3AF' }
    }
  }

  return (
    <div style={{ padding: '20px' }}>
      {/* Header */}
      <div style={{ marginBottom: '30px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <div>
            <h1 style={{ fontSize: '2em', marginBottom: '8px' }}>🔥 Sector Rotation Scanner</h1>
            <p style={{ color: 'rgba(255, 255, 255, 0.7)', margin: 0 }}>
              Ride sector momentum for higher win rates. Hot sectors = more opportunities!
            </p>
          </div>
          
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              background: autoRefresh ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.1)',
              border: `1px solid ${autoRefresh ? '#10B981' : 'rgba(255, 255, 255, 0.2)'}`,
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.9em'
            }}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <span>🔄 Auto-refresh (5min)</span>
            </label>
            
            <button
              onClick={fetchSectorData}
              disabled={isLoading}
              style={{
                padding: '10px 20px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                fontWeight: 'bold',
                cursor: isLoading ? 'wait' : 'pointer',
                opacity: isLoading ? 0.6 : 1
              }}
            >
              {isLoading ? '⏳ Scanning...' : '🔍 Scan Sectors'}
            </button>
          </div>
        </div>
        
        {lastUpdate && (
          <div style={{ fontSize: '0.85em', color: 'rgba(255, 255, 255, 0.5)' }}>
            Last updated: {lastUpdate.toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: '15px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid #EF4444',
          borderRadius: '8px',
          color: '#EF4444',
          marginBottom: '20px'
        }}>
          ❌ {error}
        </div>
      )}

      {/* Loading State */}
      {isLoading && sectorPerformance.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '12px'
        }}>
          <div style={{ fontSize: '3em', marginBottom: '15px' }}>🔍</div>
          <div style={{ fontSize: '1.2em', marginBottom: '10px' }}>Analyzing Sectors...</div>
          <div style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
            Calculating sector momentum and finding hot stocks
          </div>
        </div>
      )}

      {/* Sector Heat Map */}
      {!isLoading && sectorPerformance.length > 0 && (
        <div style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '1.5em', marginBottom: '20px' }}>📊 Sector Heat Map</h2>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '15px'
          }}>
            {sectorPerformance.map((sector) => {
              const colors = getSectorColor(sector.momentum)
              
              return (
                <div
                  key={sector.sector}
                  style={{
                    background: colors.bg,
                    border: `2px solid ${colors.border}`,
                    borderRadius: '12px',
                    padding: '20px',
                    transition: 'all 0.3s ease',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow = `0 4px 20px ${colors.border}40`
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  {/* Sector Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ fontSize: '1.2em', margin: 0 }}>{sector.sector}</h3>
                    <span style={{
                      padding: '4px 10px',
                      background: colors.border,
                      color: '#000',
                      borderRadius: '6px',
                      fontSize: '0.75em',
                      fontWeight: 'bold'
                    }}>
                      {sector.momentum}
                    </span>
                  </div>

                  {/* Stats */}
                  <div style={{ marginBottom: '15px' }}>
                    <div style={{ fontSize: '2em', fontWeight: 'bold', color: colors.text }}>
                      {sector.avgChange >= 0 ? '+' : ''}{sector.avgChange.toFixed(2)}%
                    </div>
                    <div style={{ fontSize: '0.85em', color: 'rgba(255, 255, 255, 0.7)' }}>
                      {sector.positiveCount}/{sector.stockCount} stocks positive
                    </div>
                  </div>

                  {/* Top Gainers */}
                  <div style={{
                    padding: '10px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '6px',
                    fontSize: '0.85em'
                  }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>📈 Top Gainers:</div>
                    <div style={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                      {sector.topGainers.join(', ')}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Hot Sector Stocks */}
      {!isLoading && hotSectorStocks.length > 0 && (
        <div>
          <h2 style={{ fontSize: '1.5em', marginBottom: '20px' }}>
            🚀 Hot Sector Stocks ({hotSectorStocks.length})
          </h2>
          <p style={{ color: 'rgba(255, 255, 255, 0.7)', marginBottom: '20px' }}>
            Stocks with momentum in hot sectors - double confirmation!
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {hotSectorStocks.slice(0, 20).map((stock) => {
              const colors = getSectorColor(stock.sectorMomentum)
              
              return (
                <div
                  key={stock.symbol}
                  style={{
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '12px',
                    padding: '20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  {/* Stock Info */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                      <h3 style={{ fontSize: '1.5em', margin: 0 }}>{stock.symbol}</h3>
                      <span style={{
                        padding: '4px 10px',
                        background: colors.bg,
                        color: colors.text,
                        border: `1px solid ${colors.border}`,
                        borderRadius: '6px',
                        fontSize: '0.75em',
                        fontWeight: 'bold'
                      }}>
                        {stock.sector}
                      </span>
                      {stock.totalScore && (
                        <span style={{
                          padding: '4px 10px',
                          background: stock.totalScore >= 75 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(251, 191, 36, 0.2)',
                          color: stock.totalScore >= 75 ? '#10B981' : '#FCD34D',
                          borderRadius: '6px',
                          fontSize: '0.75em',
                          fontWeight: 'bold'
                        }}>
                          Score: {stock.totalScore?.toFixed(1) || 'N/A'}/100
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '20px', fontSize: '0.9em' }}>
                      <div>
                        <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Price: </span>
                        <span style={{ fontWeight: 'bold' }}>₹{stock.current?.toFixed(2) || 'N/A'}</span>
                      </div>
                      <div>
                        <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Change: </span>
                        <span style={{
                          fontWeight: 'bold',
                          color: stock.changePercent >= 0 ? '#10B981' : '#EF4444'
                        }}>
                          {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent?.toFixed(2)}%
                        </span>
                      </div>
                      <div>
                        <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Volume: </span>
                        <span style={{ fontWeight: 'bold' }}>
                          {stock.volumeRatio ? `${stock.volumeRatio.toFixed(1)}x` : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Action Button */}
                  {onExecuteTrade && (
                    <button
                      onClick={() => onExecuteTrade(stock)}
                      disabled={isExecutingTrade || !isPaperMode}
                      style={{
                        padding: '12px 24px',
                        background: isPaperMode
                          ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
                          : 'rgba(100, 100, 100, 0.3)',
                        border: 'none',
                        borderRadius: '8px',
                        color: '#fff',
                        fontWeight: 'bold',
                        cursor: isPaperMode && !isExecutingTrade ? 'pointer' : 'not-allowed',
                        opacity: isPaperMode && !isExecutingTrade ? 1 : 0.5
                      }}
                    >
                      {isExecutingTrade ? '⏳' : '⚡ Trade'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && sectorPerformance.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '12px'
        }}>
          <div style={{ fontSize: '3em', marginBottom: '15px' }}>📊</div>
          <div style={{ fontSize: '1.2em', marginBottom: '10px' }}>No Sector Data</div>
          <div style={{ color: 'rgba(255, 255, 255, 0.6)', marginBottom: '20px' }}>
            Click "Scan Sectors" to analyze market sectors
          </div>
          <button
            onClick={fetchSectorData}
            style={{
              padding: '12px 24px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            🔍 Scan Now
          </button>
        </div>
      )}
    </div>
  )
}

