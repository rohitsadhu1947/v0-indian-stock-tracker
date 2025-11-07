/**
 * Test page for Analyst Reports Upload API
 * Access at: http://localhost:3000/test-reports
 */

'use client'

import { useState, useEffect } from 'react'

export default function TestReportsPage() {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string>('')
  const [reports, setReports] = useState<any[]>([])
  const [useTextInput, setUseTextInput] = useState(false)
  const [reportText, setReportText] = useState('')
  const [serverLogs, setServerLogs] = useState<string[]>([])
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(false)

  useEffect(() => {
    fetchReports()
  }, [])

  // Auto-refresh logs when enabled
  useEffect(() => {
    if (autoRefreshLogs) {
      const interval = setInterval(fetchServerLogs, 1000) // Refresh every second
      return () => clearInterval(interval)
    }
  }, [autoRefreshLogs])

  async function fetchServerLogs() {
    try {
      const response = await fetch('/api/reports/logs')
      if (response.ok) {
        const data = await response.json()
        setServerLogs(data.logs)
      }
    } catch (err) {
      // Silent fail for logs
    }
  }

  async function uploadReport() {
    if (!useTextInput && !file) {
      setError('Please select a PDF file first')
      return
    }
    
    if (useTextInput && !reportText.trim()) {
      setError('Please enter report text')
      return
    }

    // Enable auto-refresh logs and clear previous logs
    setAutoRefreshLogs(true)
    await fetch('/api/reports/logs', { method: 'DELETE' }) // Clear old logs

    setUploading(true)
    setError('')
    setResult(null)

    try {
      const formData = new FormData()
      
      if (useTextInput) {
        // Create a text file from the input
        const blob = new Blob([reportText], { type: 'text/plain' })
        const textFile = new File([blob], 'manual-report.txt', { type: 'text/plain' })
        formData.append('file', textFile)
      } else {
        formData.append('file', file!)
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
      setResult(data)
      console.log('✅ Upload result:', data)

      // Fetch all reports after upload
      await fetchReports()

    } catch (err: any) {
      console.error('❌ Upload error:', err)
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function fetchReports() {
    try {
      const response = await fetch('/api/reports/upload?limit=20')
      
      if (!response.ok) {
        throw new Error('Failed to fetch reports')
      }

      const data = await response.json()
      setReports(data.reports || [])
      console.log(`✅ Fetched ${data.reports?.length || 0} reports`)

    } catch (err: any) {
      console.error('❌ Fetch error:', err)
      setError(err.message)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '40px 20px',
      color: '#fff'
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto'
      }}>
        <h1 style={{ marginBottom: '30px', fontSize: '2.5em' }}>
          🧪 Analyst Reports API Test
        </h1>

        {/* Upload Section */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(10px)',
          borderRadius: '15px',
          padding: '30px',
          marginBottom: '30px'
        }}>
          <h2 style={{ marginBottom: '20px', fontSize: '1.5em' }}>📤 Upload Test Report</h2>
          
          {/* Toggle between PDF and Text */}
          <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setUseTextInput(false)}
              style={{
                padding: '10px 20px',
                background: !useTextInput ? 'rgba(0, 255, 100, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                border: `2px solid ${!useTextInput ? 'rgba(0, 255, 100, 0.5)' : 'rgba(255, 255, 255, 0.3)'}`,
                borderRadius: '8px',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              📄 Upload PDF
            </button>
            <button
              onClick={() => setUseTextInput(true)}
              style={{
                padding: '10px 20px',
                background: useTextInput ? 'rgba(0, 255, 100, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                border: `2px solid ${useTextInput ? 'rgba(0, 255, 100, 0.5)' : 'rgba(255, 255, 255, 0.3)'}`,
                borderRadius: '8px',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              ✏️ Paste Text
            </button>
          </div>
          
          {!useTextInput ? (
            <>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => {
                  const selectedFile = e.target.files?.[0]
                  setFile(selectedFile || null)
                  console.log('📄 Selected file:', selectedFile?.name)
                }}
                style={{
                  marginBottom: '20px',
                  padding: '10px',
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: '8px',
                  color: '#fff',
                  width: '100%',
                  cursor: 'pointer'
                }}
              />

              {file && (
                <div style={{
                  marginBottom: '20px',
                  padding: '10px',
                  background: 'rgba(0, 255, 100, 0.1)',
                  border: '1px solid rgba(0, 255, 100, 0.3)',
                  borderRadius: '8px'
                }}>
                  📄 Selected: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(2)} KB)
                </div>
              )}
            </>
          ) : (
            <textarea
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              placeholder={`Paste report text here. Example:

Company: Infosys Limited (INFY)
Rating: BUY
Current Price: ₹1,650
Target Price: ₹1,850

Key Highlights:
• Strong Q3 results
• Cloud growth accelerating`}
              style={{
                width: '100%',
                minHeight: '200px',
                padding: '15px',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '0.9em',
                fontFamily: 'monospace',
                marginBottom: '20px',
                resize: 'vertical'
              }}
            />
          )}

          <button
            onClick={uploadReport}
            disabled={(!file && !reportText.trim()) || uploading}
            style={{
              padding: '15px 30px',
              fontSize: '1.1em',
              fontWeight: 'bold',
              background: uploading ? '#666' : 'linear-gradient(135deg, #00ff64 0%, #00b894 100%)',
              border: 'none',
              borderRadius: '10px',
              color: '#fff',
              cursor: uploading || (!file && !reportText.trim()) ? 'not-allowed' : 'pointer',
              opacity: uploading || (!file && !reportText.trim()) ? 0.6 : 1
            }}
          >
            {uploading ? '⏳ Uploading...' : '🚀 Upload & Parse Report'}
          </button>

          <button
            onClick={fetchReports}
            style={{
              marginLeft: '15px',
              padding: '15px 30px',
              fontSize: '1.1em',
              fontWeight: 'bold',
              background: 'rgba(255, 255, 255, 0.2)',
              border: '2px solid rgba(255, 255, 255, 0.4)',
              borderRadius: '10px',
              color: '#fff',
              cursor: 'pointer'
            }}
          >
            🔄 Fetch All Reports
          </button>

          <div style={{ 
            marginTop: '15px',
            padding: '12px',
            background: 'rgba(255, 200, 0, 0.1)',
            border: '1px solid rgba(255, 200, 0, 0.3)',
            borderRadius: '8px',
            fontSize: '0.85em'
          }}>
            💡 <strong>Tip:</strong> For best results with complex PDFs, use "✏️ Paste Text" mode.
            Copy text from your PDF viewer and paste it here for 100% accurate extraction.
          </div>
          
          <button
            onClick={async () => {
              const check = await fetch('/api/reports/debug')
              const data = await check.json()
              alert(JSON.stringify(data, null, 2))
            }}
            style={{
              marginTop: '10px',
              padding: '8px 15px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '6px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '0.85em'
            }}
          >
            🔍 Check AI Status
          </button>

          {error && (
            <div style={{
              background: 'rgba(255, 0, 100, 0.2)',
              border: '2px solid rgba(255, 0, 100, 0.5)',
              borderRadius: '10px',
              padding: '20px',
              marginTop: '20px'
            }}>
              <strong>❌ Error:</strong> {error}
            </div>
          )}

          {/* Server Logs Viewer */}
          {serverLogs.length > 0 && (
            <div style={{
              background: 'rgba(0, 0, 0, 0.3)',
              border: '2px solid rgba(100, 200, 255, 0.5)',
              borderRadius: '10px',
              padding: '20px',
              marginTop: '20px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 style={{ margin: 0 }}>📋 Server Logs</h3>
                <button
                  onClick={() => {
                    setAutoRefreshLogs(!autoRefreshLogs)
                    if (!autoRefreshLogs) fetchServerLogs()
                  }}
                  style={{
                    padding: '5px 10px',
                    background: autoRefreshLogs ? 'rgba(0, 255, 100, 0.3)' : 'rgba(255, 255, 255, 0.2)',
                    border: `1px solid ${autoRefreshLogs ? 'rgba(0, 255, 100, 0.5)' : 'rgba(255, 255, 255, 0.3)'}`,
                    borderRadius: '5px',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '0.8em'
                  }}
                >
                  {autoRefreshLogs ? '⏸️ Pause' : '▶️ Auto-refresh'}
                </button>
              </div>
              <div style={{
                background: 'rgba(0, 0, 0, 0.5)',
                padding: '15px',
                borderRadius: '8px',
                fontSize: '0.85em',
                maxHeight: '400px',
                overflow: 'auto',
                fontFamily: 'monospace'
              }}>
                {serverLogs.map((log, i) => (
                  <div key={i} style={{ marginBottom: '5px', lineHeight: '1.5' }}>
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload Result */}
          {result && (
            <div style={{
              background: 'rgba(0, 255, 100, 0.1)',
              border: '2px solid rgba(0, 255, 100, 0.5)',
              borderRadius: '10px',
              padding: '20px',
              marginTop: '20px'
            }}>
              <h3 style={{ marginBottom: '15px' }}>✅ Upload Successful!</h3>
              <div style={{
                background: 'rgba(0, 0, 0, 0.2)',
                padding: '15px',
                borderRadius: '8px',
                fontSize: '0.9em',
                maxHeight: '300px',
                overflow: 'auto'
              }}>
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
                  {JSON.stringify(result.report, null, 2)}
                </pre>
              </div>
              {result.report?.pdfPath && (
                <a 
                  href={result.report.pdfPath}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-block',
                    marginTop: '15px',
                    padding: '10px 20px',
                    background: 'rgba(0, 255, 100, 0.2)',
                    border: '1px solid rgba(0, 255, 100, 0.5)',
                    borderRadius: '8px',
                    color: '#00ff64',
                    textDecoration: 'none',
                    fontWeight: 'bold'
                  }}
                >
                  📄 View PDF
                </a>
              )}
            </div>
          )}
        </div>

        {/* Existing Reports Section */}
        {reports.length > 0 && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(10px)',
            borderRadius: '15px',
            padding: '30px'
          }}>
            <h2 style={{ marginBottom: '20px', fontSize: '1.5em' }}>
              📊 All Reports ({reports.length})
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {reports.map((report, i) => (
                <div key={report.id} style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                  padding: '20px',
                  border: '2px solid rgba(255, 255, 255, 0.2)'
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '10px'
                  }}>
                    <div>
                      <div style={{ fontSize: '1.2em', fontWeight: 'bold', marginBottom: '5px' }}>
                        {report.symbol || 'N/A'} - {report.title}
                      </div>
                      <div style={{ fontSize: '0.9em', opacity: 0.8 }}>
                        {report.source} • {new Date(report.reportDate).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{
                      padding: '5px 10px',
                      background: report.sentiment === 'BULLISH' 
                        ? 'rgba(0, 255, 100, 0.3)' 
                        : report.sentiment === 'BEARISH' 
                          ? 'rgba(255, 0, 100, 0.3)'
                          : 'rgba(255, 255, 255, 0.2)',
                      borderRadius: '6px',
                      fontSize: '0.9em',
                      fontWeight: 'bold'
                    }}>
                      {report.sentiment || 'NEUTRAL'}
                    </div>
                  </div>

                  {report.summary && (
                    <div style={{
                      padding: '10px',
                      background: 'rgba(0, 0, 0, 0.2)',
                      borderRadius: '6px',
                      fontSize: '0.9em',
                      marginBottom: '10px'
                    }}>
                      {report.summary}
                    </div>
                  )}

                  {report.structuredData && (
                    <div style={{ fontSize: '0.85em', opacity: 0.9 }}>
                      {report.structuredData.rating && (
                        <span style={{ marginRight: '15px' }}>
                          ⭐ <strong>{report.structuredData.rating}</strong>
                        </span>
                      )}
                      {report.structuredData.targetPrice && (
                        <span style={{ marginRight: '15px' }}>
                          🎯 Target: <strong>₹{report.structuredData.targetPrice}</strong>
                        </span>
                      )}
                      {report.structuredData.upside && (
                        <span>
                          📈 Upside: <strong>{report.structuredData.upside.toFixed(1)}%</strong>
                        </span>
                      )}
                    </div>
                  )}

                  <div style={{
                    marginTop: '10px',
                    fontSize: '0.8em',
                    opacity: 0.6
                  }}>
                    📄 <a href={report.pdfPath} target="_blank" style={{ color: '#00ff64' }}>
                      View PDF
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div style={{
          marginTop: '30px',
          padding: '20px',
          background: 'rgba(255, 255, 255, 0.1)',
          borderRadius: '10px',
          fontSize: '0.9em',
          lineHeight: '1.6'
        }}>
          <h3 style={{ marginBottom: '10px' }}>📝 Testing Instructions:</h3>
          <ol>
            <li>Select a PDF file (analyst report from HDFC Securities or any broker)</li>
            <li>Click "Upload & Parse Report"</li>
            <li>Check if symbol, rating, target price are extracted correctly</li>
            <li>Check browser console for detailed logs</li>
            <li>Verify PDF is saved in <code>/public/uploads/reports/</code></li>
            <li>Check database: <code>SELECT * FROM analyst_reports;</code></li>
          </ol>
        </div>
      </div>
    </div>
  )
}

