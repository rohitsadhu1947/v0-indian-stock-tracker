'use client'

import React, { useState, useEffect } from 'react'

interface QuarterlyData {
  quarter: string
  fiscalYear: string
  revenue: number | null
  operatingProfit: number | null
  netProfit: number | null
  eps: number | null
  operatingMargin: number | null
  endDate: string
}

interface StockFinancials {
  symbol: string
  quarters: QuarterlyData[]
  latestQuarter: string
  updatedAt: string
}

export default function FinancialsViewer() {
  const [stocks, setStocks] = useState<StockFinancials[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStock, setSelectedStock] = useState<string | null>(null)
  const [stockDetails, setStockDetails] = useState<any>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)

  // Fetch all stocks with data
  useEffect(() => {
    fetchStocks()
  }, [])

  const fetchStocks = async () => {
    try {
      const response = await fetch('/api/financials/list')
      const data = await response.json()
      if (data.success) {
        setStocks(data.stocks)
      }
    } catch (err) {
      console.error('Failed to fetch stocks:', err)
    } finally {
      setLoading(false)
    }
  }

  // Fetch details for a stock
  const fetchStockDetails = async (symbol: string) => {
    setLoadingDetails(true)
    try {
      const response = await fetch(`/api/financials/${symbol}`)
      const data = await response.json()
      setStockDetails(data)
      setSelectedStock(symbol)
    } catch (err) {
      console.error('Failed to fetch stock details:', err)
    } finally {
      setLoadingDetails(false)
    }
  }

  // Delete stock data
  const deleteStock = async (symbol: string) => {
    if (!confirm(`Delete all financial data for ${symbol}?`)) return
    
    try {
      const response = await fetch(`/api/financials/${symbol}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        setStocks(stocks.filter(s => s.symbol !== symbol))
        if (selectedStock === symbol) {
          setSelectedStock(null)
          setStockDetails(null)
        }
      }
    } catch (err) {
      console.error('Failed to delete:', err)
    }
  }

  const formatNumber = (num: number | null) => {
    if (num === null || num === undefined) return '-'
    return num.toLocaleString('en-IN', { maximumFractionDigits: 2 })
  }

  const formatPercent = (num: number | null) => {
    if (num === null || num === undefined) return '-'
    return `${num.toFixed(1)}%`
  }

  // Calculate growth
  const calcGrowth = (current: number | null, previous: number | null) => {
    if (!current || !previous || previous === 0) return null
    return ((current - previous) / previous) * 100
  }

  return (
    <div style={{
      background: 'rgba(0, 0, 0, 0.3)',
      borderRadius: '16px',
      padding: '24px',
      border: '1px solid rgba(255, 255, 255, 0.1)'
    }}>
      <h3 style={{ margin: '0 0 20px 0', fontSize: '1.3em' }}>
        📊 View Uploaded Data
      </h3>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', opacity: 0.6 }}>
          ⏳ Loading...
        </div>
      ) : stocks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', opacity: 0.6 }}>
          <div style={{ fontSize: '2em', marginBottom: '12px' }}>📭</div>
          <div>No financial data uploaded yet</div>
          <div style={{ fontSize: '0.9em', marginTop: '8px' }}>
            Go to "Upload Financials" to add data
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '20px' }}>
          {/* Stock List */}
          <div style={{ width: '250px', flexShrink: 0 }}>
            <div style={{ 
              fontWeight: 'bold', 
              marginBottom: '12px',
              fontSize: '0.9em',
              opacity: 0.7
            }}>
              {stocks.length} STOCKS WITH DATA
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {stocks.map(stock => (
                <div
                  key={stock.symbol}
                  onClick={() => fetchStockDetails(stock.symbol)}
                  style={{
                    background: selectedStock === stock.symbol 
                      ? 'rgba(59, 130, 246, 0.2)' 
                      : 'rgba(0, 0, 0, 0.2)',
                    border: selectedStock === stock.symbol
                      ? '2px solid rgba(59, 130, 246, 0.5)'
                      : '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    padding: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 'bold' }}>{stock.symbol}</div>
                    <div style={{ fontSize: '0.8em', opacity: 0.7 }}>
                      {stock.quarters.length} quarters • {stock.latestQuarter}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteStock(stock.symbol)
                    }}
                    style={{
                      background: 'rgba(239, 68, 68, 0.2)',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      cursor: 'pointer',
                      fontSize: '0.8em'
                    }}
                    title="Delete data"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Stock Details */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {!selectedStock ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '60px 20px',
                opacity: 0.5 
              }}>
                👈 Click a stock to view details
              </div>
            ) : loadingDetails ? (
              <div style={{ textAlign: 'center', padding: '60px' }}>
                ⏳ Loading details...
              </div>
            ) : stockDetails ? (
              <div>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginBottom: '20px'
                }}>
                  <h4 style={{ margin: 0, fontSize: '1.2em' }}>
                    {stockDetails.symbol} - Quarterly Results
                  </h4>
                  {stockDetails.analysis && (
                    <span style={{
                      padding: '4px 12px',
                      borderRadius: '20px',
                      fontSize: '0.85em',
                      fontWeight: 'bold',
                      background: stockDetails.analysis.verdict === 'STRONG' ? 'rgba(16, 185, 129, 0.3)' :
                                  stockDetails.analysis.verdict === 'GOOD' ? 'rgba(59, 130, 246, 0.3)' :
                                  stockDetails.analysis.verdict === 'NEUTRAL' ? 'rgba(107, 114, 128, 0.3)' :
                                  stockDetails.analysis.verdict === 'WEAK' ? 'rgba(251, 191, 36, 0.3)' :
                                  'rgba(239, 68, 68, 0.3)'
                    }}>
                      {stockDetails.analysis.verdict}
                    </span>
                  )}
                </div>

                {/* Analysis Summary */}
                {stockDetails.analysis?.signals?.length > 0 && (
                  <div style={{
                    background: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    borderRadius: '8px',
                    padding: '12px',
                    marginBottom: '16px',
                    fontSize: '0.9em'
                  }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>📊 Analysis:</div>
                    {stockDetails.analysis.signals.map((signal: string, i: number) => (
                      <div key={i} style={{ marginBottom: '4px' }}>• {signal}</div>
                    ))}
                  </div>
                )}

                {/* Quarterly Table */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ 
                    width: '100%', 
                    borderCollapse: 'collapse',
                    fontSize: '0.9em'
                  }}>
                    <thead>
                      <tr style={{ background: 'rgba(0, 0, 0, 0.3)' }}>
                        <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Quarter</th>
                        <th style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Revenue</th>
                        <th style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Op Profit</th>
                        <th style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Net Profit</th>
                        <th style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>EPS</th>
                        <th style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>QoQ Growth</th>
                        <th style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>YoY Growth</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockDetails.quarterly?.map((q: any, idx: number) => {
                        const prevQ = stockDetails.quarterly[idx + 1]
                        const yoyQ = stockDetails.quarterly[idx + 4]
                        const qoqGrowth = calcGrowth(q.netProfit, prevQ?.netProfit)
                        const yoyGrowth = calcGrowth(q.netProfit, yoyQ?.netProfit)
                        
                        return (
                          <tr 
                            key={`${q.quarter}-${q.fiscalYear}`}
                            style={{ 
                              background: idx === 0 ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                              borderBottom: '1px solid rgba(255,255,255,0.05)'
                            }}
                          >
                            <td style={{ padding: '10px' }}>
                              <strong>{q.quarter} {q.fiscalYear}</strong>
                              {idx === 0 && <span style={{ fontSize: '0.8em', opacity: 0.6, marginLeft: '8px' }}>Latest</span>}
                            </td>
                            <td style={{ padding: '10px', textAlign: 'right' }}>₹{formatNumber(q.revenue)} Cr</td>
                            <td style={{ padding: '10px', textAlign: 'right' }}>₹{formatNumber(q.operatingProfit)} Cr</td>
                            <td style={{ padding: '10px', textAlign: 'right' }}>₹{formatNumber(q.netProfit)} Cr</td>
                            <td style={{ padding: '10px', textAlign: 'right' }}>₹{formatNumber(q.eps)}</td>
                            <td style={{ 
                              padding: '10px', 
                              textAlign: 'right',
                              color: qoqGrowth === null ? 'inherit' : qoqGrowth >= 0 ? '#10B981' : '#EF4444'
                            }}>
                              {qoqGrowth === null ? '-' : `${qoqGrowth >= 0 ? '+' : ''}${qoqGrowth.toFixed(1)}%`}
                            </td>
                            <td style={{ 
                              padding: '10px', 
                              textAlign: 'right',
                              color: yoyGrowth === null ? 'inherit' : yoyGrowth >= 0 ? '#10B981' : '#EF4444'
                            }}>
                              {yoyGrowth === null ? '-' : `${yoyGrowth >= 0 ? '+' : ''}${yoyGrowth.toFixed(1)}%`}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
