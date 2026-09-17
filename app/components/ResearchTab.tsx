'use client'

import React, { useState, useEffect } from 'react'

interface AnalystReport {
  id: number
  symbol: string | null
  title: string
  source: string
  sentiment: string
  sentimentScore: number
  summary: string
  reportDate: string
  uploadedAt: string
  pdfPath: string
  structuredData: {
    rating?: string
    targetPrice?: number
    currentPrice?: number
    upside?: number
    companyName?: string
    analystName?: string
    keyPoints?: string[]
    risks?: string[]
  }
}

export default function ResearchTab(): JSX.Element {
  const [reports, setReports] = useState<AnalystReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterSymbol, setFilterSymbol] = useState<string>('')
  const [filterSentiment, setFilterSentiment] = useState<string>('ALL')
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadText, setUploadText] = useState('')
  const [useTextInput, setUseTextInput] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    fetchReports()
  }, [])

  async function fetchReports() {
    try {
      setLoading(true)
      const response = await fetch('/api/reports/upload?limit=50')
      
      if (!response.ok) {
        throw new Error('Failed to fetch reports')
      }

      const data = await response.json()
      setReports(data.reports || [])
      setError(null)
    } catch (err: any) {
      console.error('Error fetching reports:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function uploadReport() {
    if (!useTextInput && !uploadFile) {
      alert('Please select a PDF file')
      return
    }
    
    if (useTextInput && !uploadText.trim()) {
      alert('Please enter report text')
      return
    }

    setUploading(true)

    try {
      const formData = new FormData()
      
      if (useTextInput) {
        const blob = new Blob([uploadText], { type: 'text/plain' })
        const textFile = new File([blob], 'manual-report.txt', { type: 'text/plain' })
        formData.append('file', textFile)
      } else {
        formData.append('file', uploadFile!)
      }
      
      formData.append('type', 'STOCK_REPORT')
      formData.append('source', 'HDFC Securities')

      const response = await fetch('/api/reports/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Upload failed')
      }

      const data = await response.json()
      console.log('✅ Upload result:', data)

      // Reset form and refresh reports
      setUploadFile(null)
      setUploadText('')
      setShowUploadForm(false)
      await fetchReports()

    } catch (err: any) {
      console.error('❌ Upload error:', err)
      alert(`Upload failed: ${err.message}`)
    } finally {
      setUploading(false)
    }
  }

  // Filter reports
  const filteredReports = reports.filter(report => {
    if (filterSymbol && report.symbol && !report.symbol.includes(filterSymbol.toUpperCase())) {
      return false
    }
    if (filterSentiment !== 'ALL' && report.sentiment !== filterSentiment) {
      return false
    }
    return true
  })

  // Group reports by symbol
  const reportsBySymbol = filteredReports.reduce((acc, report) => {
    const symbol = report.symbol || 'UNKNOWN'
    if (!acc[symbol]) {
      acc[symbol] = []
    }
    acc[symbol].push(report)
    return acc
  }, {} as Record<string, AnalystReport[]>)

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <div style={{ fontSize: '2em', marginBottom: '10px' }}>⏳</div>
        <div>Loading analyst reports...</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.8em' }}>📊 Research Hub</h2>
          <p style={{ margin: '5px 0 0 0', opacity: 0.8, fontSize: '0.9em' }}>
            Analyst reports powered by AI extraction
          </p>
        </div>
        <button
          onClick={() => setShowUploadForm(!showUploadForm)}
          style={{
            padding: '12px 24px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '1em'
          }}
        >
          {showUploadForm ? '❌ Cancel' : '📤 Upload Report'}
        </button>
      </div>

      {/* Upload Form */}
      {showUploadForm && (
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '20px',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <h3 style={{ marginTop: 0 }}>Upload New Report</h3>
          
          {/* Toggle between PDF and Text */}
          <div style={{ marginBottom: '15px', display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setUseTextInput(false)}
              style={{
                padding: '8px 16px',
                background: !useTextInput ? 'rgba(0, 255, 100, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                border: `2px solid ${!useTextInput ? 'rgba(0, 255, 100, 0.5)' : 'rgba(255, 255, 255, 0.3)'}`,
                borderRadius: '6px',
                color: '#fff',
                cursor: 'pointer'
              }}
            >
              📄 Upload PDF
            </button>
            <button
              onClick={() => setUseTextInput(true)}
              style={{
                padding: '8px 16px',
                background: useTextInput ? 'rgba(0, 255, 100, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                border: `2px solid ${useTextInput ? 'rgba(0, 255, 100, 0.5)' : 'rgba(255, 255, 255, 0.3)'}`,
                borderRadius: '6px',
                color: '#fff',
                cursor: 'pointer'
              }}
            >
              ✏️ Paste Text
            </button>
          </div>

          {!useTextInput ? (
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              style={{
                marginBottom: '15px',
                padding: '10px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '6px',
                color: '#fff',
                width: '100%',
                cursor: 'pointer'
              }}
            />
          ) : (
            <textarea
              value={uploadText}
              onChange={(e) => setUploadText(e.target.value)}
              placeholder="Paste report text here..."
              style={{
                width: '100%',
                minHeight: '200px',
                padding: '15px',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '0.9em',
                fontFamily: 'monospace',
                marginBottom: '15px',
                resize: 'vertical'
              }}
            />
          )}

          <button
            onClick={uploadReport}
            disabled={uploading || (!uploadFile && !uploadText.trim())}
            style={{
              padding: '12px 24px',
              background: uploading ? '#666' : 'linear-gradient(135deg, #00ff64 0%, #00b894 100%)',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              cursor: uploading || (!uploadFile && !uploadText.trim()) ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              opacity: uploading || (!uploadFile && !uploadText.trim()) ? 0.6 : 1
            }}
          >
            {uploading ? '⏳ Uploading...' : '🚀 Upload & Parse'}
          </button>
        </div>
      )}

      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: '15px',
        marginBottom: '20px',
        flexWrap: 'wrap'
      }}>
        <input
          type="text"
          placeholder="Filter by symbol (e.g., DABUR)"
          value={filterSymbol}
          onChange={(e) => setFilterSymbol(e.target.value)}
          style={{
            flex: '1',
            minWidth: '200px',
            padding: '10px 15px',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '1em'
          }}
        />
        <select
          value={filterSentiment}
          onChange={(e) => setFilterSentiment(e.target.value)}
          style={{
            padding: '10px 15px',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '1em',
            cursor: 'pointer'
          }}
        >
          <option value="ALL">All Sentiments</option>
          <option value="BULLISH">🟢 Bullish</option>
          <option value="NEUTRAL">⚪ Neutral</option>
          <option value="BEARISH">🔴 Bearish</option>
        </select>
        <button
          onClick={fetchReports}
          style={{
            padding: '10px 20px',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '8px',
            color: '#fff',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          🔄 Refresh
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div style={{
          padding: '15px',
          background: 'rgba(255, 0, 100, 0.2)',
          border: '2px solid rgba(255, 0, 100, 0.5)',
          borderRadius: '8px',
          marginBottom: '20px',
          color: '#ff0064'
        }}>
          ❌ Error: {error}
        </div>
      )}

      {/* Reports Display */}
      {filteredReports.length === 0 ? (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '12px',
          border: '2px dashed rgba(255, 255, 255, 0.2)'
        }}>
          <div style={{ fontSize: '3em', marginBottom: '10px' }}>📄</div>
          <h3>No Reports Found</h3>
          <p style={{ opacity: 0.8 }}>
            {filterSymbol || filterSentiment !== 'ALL'
              ? 'Try adjusting your filters'
              : 'Upload your first analyst report to get started!'}
          </p>
        </div>
      ) : (
        <div>
          <div style={{
            marginBottom: '15px',
            padding: '10px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span>
              <strong>{filteredReports.length}</strong> reports found
              {Object.keys(reportsBySymbol).length > 1 && (
                <span style={{ opacity: 0.7 }}>
                  {' '}across {Object.keys(reportsBySymbol).length} stocks
                </span>
              )}
            </span>
          </div>

          {/* Group by symbol */}
          {Object.entries(reportsBySymbol).map(([symbol, symbolReports]) => (
            <div key={symbol} style={{ marginBottom: '30px' }}>
              <h3 style={{
                marginBottom: '15px',
                fontSize: '1.4em',
                borderBottom: '2px solid rgba(255, 255, 255, 0.2)',
                paddingBottom: '10px'
              }}>
                {symbol}
                <span style={{
                  marginLeft: '10px',
                  fontSize: '0.7em',
                  opacity: 0.7
                }}>
                  ({symbolReports.length} report{symbolReports.length > 1 ? 's' : ''})
                </span>
              </h3>

              <div style={{ display: 'grid', gap: '15px' }}>
                {symbolReports.map((report) => (
                  <div
                    key={report.id}
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      borderRadius: '12px',
                      padding: '20px',
                      border: '2px solid rgba(255, 255, 255, 0.1)',
                      transition: 'all 0.3s ease'
                    }}
                  >
                    {/* Header */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '15px'
                    }}>
                      <div style={{ flex: 1 }}>
                        <h4 style={{ margin: 0, fontSize: '1.2em' }}>{report.title}</h4>
                        <div style={{
                          fontSize: '0.85em',
                          opacity: 0.7,
                          marginTop: '5px'
                        }}>
                          {report.source} • {new Date(report.reportDate).toLocaleDateString()}
                        </div>
                      </div>

                      {/* Sentiment Badge */}
                      <div style={{
                        padding: '8px 16px',
                        borderRadius: '20px',
                        fontWeight: 'bold',
                        fontSize: '0.9em',
                        background: report.sentiment === 'BULLISH'
                          ? 'rgba(0, 255, 100, 0.2)'
                          : report.sentiment === 'BEARISH'
                            ? 'rgba(255, 0, 100, 0.2)'
                            : 'rgba(255, 255, 255, 0.1)',
                        border: `2px solid ${
                          report.sentiment === 'BULLISH'
                            ? 'rgba(0, 255, 100, 0.5)'
                            : report.sentiment === 'BEARISH'
                              ? 'rgba(255, 0, 100, 0.5)'
                              : 'rgba(255, 255, 255, 0.3)'
                        }`
                      }}>
                        {report.sentiment === 'BULLISH' ? '🟢' : report.sentiment === 'BEARISH' ? '🔴' : '⚪'}{' '}
                        {report.sentiment}
                      </div>
                    </div>

                    {/* Rating & Target */}
                    {report.structuredData.rating && (
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                        gap: '10px',
                        marginBottom: '15px'
                      }}>
                        <div style={{
                          padding: '10px',
                          background: 'rgba(0, 0, 0, 0.2)',
                          borderRadius: '8px'
                        }}>
                          <div style={{ fontSize: '0.8em', opacity: 0.7 }}>Rating</div>
                          <div style={{ fontSize: '1.2em', fontWeight: 'bold' }}>
                            {report.structuredData.rating}
                          </div>
                        </div>

                        {report.structuredData.targetPrice && (
                          <div style={{
                            padding: '10px',
                            background: 'rgba(0, 0, 0, 0.2)',
                            borderRadius: '8px'
                          }}>
                            <div style={{ fontSize: '0.8em', opacity: 0.7 }}>Target Price</div>
                            <div style={{ fontSize: '1.2em', fontWeight: 'bold' }}>
                              ₹{report.structuredData.targetPrice}
                            </div>
                          </div>
                        )}

                        {report.structuredData.currentPrice && (
                          <div style={{
                            padding: '10px',
                            background: 'rgba(0, 0, 0, 0.2)',
                            borderRadius: '8px'
                          }}>
                            <div style={{ fontSize: '0.8em', opacity: 0.7 }}>Current Price</div>
                            <div style={{ fontSize: '1.2em', fontWeight: 'bold' }}>
                              ₹{report.structuredData.currentPrice}
                            </div>
                          </div>
                        )}

                        {report.structuredData.upside && (
                          <div style={{
                            padding: '10px',
                            background: 'rgba(0, 0, 0, 0.2)',
                            borderRadius: '8px'
                          }}>
                            <div style={{ fontSize: '0.8em', opacity: 0.7 }}>Upside</div>
                            <div style={{
                              fontSize: '1.2em',
                              fontWeight: 'bold',
                              color: report.structuredData.upside > 0 ? '#00ff64' : '#ff0064'
                            }}>
                              {report.structuredData.upside > 0 ? '+' : ''}{report.structuredData.upside.toFixed(1)}%
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Summary */}
                    {report.summary && (
                      <div style={{
                        padding: '12px',
                        background: 'rgba(0, 0, 0, 0.2)',
                        borderRadius: '8px',
                        marginBottom: '15px',
                        fontSize: '0.95em',
                        lineHeight: '1.5'
                      }}>
                        💡 {report.summary}
                      </div>
                    )}

                    {/* Key Points */}
                    {report.structuredData.keyPoints && report.structuredData.keyPoints.length > 0 && (
                      <div style={{ marginBottom: '15px' }}>
                        <div style={{
                          fontSize: '0.9em',
                          fontWeight: 'bold',
                          marginBottom: '8px'
                        }}>
                          ✅ Key Points:
                        </div>
                        <div style={{
                          fontSize: '0.85em',
                          lineHeight: '1.6',
                          opacity: 0.9
                        }}>
                          {report.structuredData.keyPoints.slice(0, 3).map((point, i) => (
                            <div key={i} style={{ marginBottom: '5px' }}>
                              • {point}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <a
                        href={report.pdfPath}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          padding: '8px 16px',
                          background: 'rgba(255, 255, 255, 0.1)',
                          border: '1px solid rgba(255, 255, 255, 0.3)',
                          borderRadius: '6px',
                          color: '#fff',
                          textDecoration: 'none',
                          fontSize: '0.85em',
                          fontWeight: 'bold'
                        }}
                      >
                        📄 View PDF
                      </a>
                      {report.structuredData.analystName && (
                        <div style={{
                          padding: '8px 16px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          borderRadius: '6px',
                          fontSize: '0.85em',
                          opacity: 0.7
                        }}>
                          By {report.structuredData.analystName}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

