'use client'

import React, { useState, useRef } from 'react'

interface UploadResult {
  total: number
  inserted: number
  updated: number
  errors: string[]
}

export default function FinancialsUpload() {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadMode, setUploadMode] = useState<'paste' | 'csv'>('paste')
  const [dataType, setDataType] = useState<'quarterly' | 'annual'>('quarterly')
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<any>(null)
  const [pasteSymbol, setPasteSymbol] = useState('')
  const [pasteData, setPasteData] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    setError(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', dataType)

      const response = await fetch('/api/financials/upload', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (data.success) {
        setResult(data.results)
        // Refresh status
        fetchStatus()
      } else {
        setError(data.error || 'Upload failed')
      }
    } catch (err: any) {
      setError(err.message || 'Upload failed')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Handle paste table upload (easier format)
  const handlePasteUpload = async () => {
    if (!pasteSymbol.trim()) {
      setError('Please enter a stock symbol')
      return
    }
    if (!pasteData.trim()) {
      setError('Please paste the table data')
      return
    }

    setIsUploading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/financials/upload-table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: pasteSymbol.trim(),
          data: pasteData.trim()
        })
      })

      const data = await response.json()

      if (data.success) {
        setResult(data.results)
        setPasteData('') // Clear after success
        fetchStatus()
      } else {
        setError(data.error || 'Upload failed')
      }
    } catch (err: any) {
      setError(err.message || 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/financials/upload')
      const data = await response.json()
      if (data.success) {
        setStatus(data.status)
      }
    } catch (err) {
      console.error('Failed to fetch status:', err)
    }
  }

  const downloadTemplate = async (type: 'quarterly' | 'annual') => {
    try {
      const response = await fetch('/api/financials/upload?action=template')
      const data = await response.json()
      
      if (data.success) {
        const template = data.templates[type]
        const blob = new Blob([template], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${type}_financials_template.csv`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error('Failed to download template:', err)
    }
  }

  React.useEffect(() => {
    fetchStatus()
  }, [])

  return (
    <div style={{
      background: 'rgba(0, 0, 0, 0.3)',
      borderRadius: '16px',
      padding: '24px',
      border: '1px solid rgba(255, 255, 255, 0.1)'
    }}>
      <h3 style={{ margin: '0 0 20px 0', fontSize: '1.3em' }}>
        📊 Upload Financial Data
      </h3>

      {/* Status */}
      {status && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '20px',
          fontSize: '0.9em'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>📈 Data Status:</div>
          <div>Quarterly Records: <strong>{status.quarterlyRecords}</strong></div>
          <div>Annual Records: <strong>{status.annualRecords}</strong></div>
          <div>Companies with Data: <strong>{status.companiesWithData}</strong></div>
          {status.companies?.length > 0 && (
            <div style={{ marginTop: '8px', opacity: 0.8 }}>
              Latest: {status.companies.slice(0, 5).map((c: any) => `${c.symbol} (${c.lastQuarter})`).join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Upload Mode Selection */}
      <div style={{ marginBottom: '16px', display: 'flex', gap: '8px' }}>
        <button
          onClick={() => setUploadMode('paste')}
          style={{
            padding: '10px 20px',
            background: uploadMode === 'paste' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(0, 0, 0, 0.2)',
            border: uploadMode === 'paste' ? '2px solid rgba(16, 185, 129, 0.5)' : '2px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.95em',
            fontWeight: uploadMode === 'paste' ? 'bold' : 'normal'
          }}
        >
          📋 Paste Table (Easy)
        </button>
        <button
          onClick={() => setUploadMode('csv')}
          style={{
            padding: '10px 20px',
            background: uploadMode === 'csv' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(0, 0, 0, 0.2)',
            border: uploadMode === 'csv' ? '2px solid rgba(59, 130, 246, 0.5)' : '2px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.95em',
            fontWeight: uploadMode === 'csv' ? 'bold' : 'normal'
          }}
        >
          📁 CSV Upload
        </button>
      </div>

      {/* PASTE MODE - Easier! */}
      {uploadMode === 'paste' && (
        <div>
          <div style={{
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '16px',
            fontSize: '0.9em'
          }}>
            💡 <strong>Easiest method:</strong> Copy the quarterly table from Screener/Trendlyne and paste it directly!
          </div>

          {/* Symbol Input */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>
              Stock Symbol:
            </label>
            <input
              type="text"
              value={pasteSymbol}
              onChange={(e) => setPasteSymbol(e.target.value.toUpperCase())}
              placeholder="e.g., TCS, RELIANCE, INFY"
              style={{
                width: '200px',
                padding: '10px',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                fontSize: '1em'
              }}
            />
          </div>

          {/* Paste Area */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>
              Paste Quarterly Data Table:
            </label>
            <textarea
              value={pasteData}
              onChange={(e) => setPasteData(e.target.value)}
              placeholder={`Paste the table here. Format:
Indicator    Sep '25    Jun '25    Mar '25    ...
Total Rev.   18,919     20,412     18,043     ...
Operating Profit  6,252  6,261     5,986      ...
Net Profit   5,179      4,912     19,561     ...
...`}
              style={{
                width: '100%',
                minHeight: '200px',
                padding: '12px',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                fontSize: '0.9em',
                fontFamily: 'monospace',
                resize: 'vertical'
              }}
            />
          </div>

          {/* Upload Button */}
          <button
            onClick={handlePasteUpload}
            disabled={isUploading || !pasteSymbol || !pasteData}
            style={{
              padding: '12px 24px',
              background: isUploading ? 'rgba(107, 114, 128, 0.3)' : 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              border: 'none',
              borderRadius: '8px',
              cursor: isUploading ? 'wait' : 'pointer',
              fontSize: '1em',
              fontWeight: 'bold',
              opacity: (!pasteSymbol || !pasteData) ? 0.5 : 1
            }}
          >
            {isUploading ? '⏳ Processing...' : '📤 Upload Data'}
          </button>
        </div>
      )}

      {/* CSV MODE */}
      {uploadMode === 'csv' && (
        <div>
          {/* Data Type Selection */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ marginRight: '16px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="dataType"
                value="quarterly"
                checked={dataType === 'quarterly'}
                onChange={() => setDataType('quarterly')}
                style={{ marginRight: '6px' }}
              />
              Quarterly Data
            </label>
            <label style={{ cursor: 'pointer' }}>
              <input
                type="radio"
                name="dataType"
                value="annual"
                checked={dataType === 'annual'}
                onChange={() => setDataType('annual')}
                style={{ marginRight: '6px' }}
              />
              Annual Data
            </label>
          </div>

          {/* Download Template */}
          <div style={{ marginBottom: '16px' }}>
            <button
              onClick={() => downloadTemplate(dataType)}
              style={{
                padding: '8px 16px',
                background: 'rgba(59, 130, 246, 0.2)',
                border: '1px solid rgba(59, 130, 246, 0.5)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.9em'
              }}
            >
              📥 Download {dataType} template
            </button>
          </div>

          {/* Upload */}
          <div style={{
            border: '2px dashed rgba(255, 255, 255, 0.2)',
            borderRadius: '12px',
            padding: '24px',
            textAlign: 'center',
            marginBottom: '16px'
          }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleUpload}
              disabled={isUploading}
              style={{ display: 'none' }}
              id="csv-upload"
            />
            <label
              htmlFor="csv-upload"
              style={{
                cursor: isUploading ? 'wait' : 'pointer',
                display: 'block'
              }}
            >
              {isUploading ? (
                <span>⏳ Uploading...</span>
              ) : (
                <>
                  <div style={{ fontSize: '2em', marginBottom: '8px' }}>📁</div>
                  <div>Click to upload {dataType} CSV</div>
                  <div style={{ fontSize: '0.8em', opacity: 0.6, marginTop: '4px' }}>
                    or drag and drop
                  </div>
                </>
              )}
            </label>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{
          background: result.errors.length === 0 
            ? 'rgba(16, 185, 129, 0.1)' 
            : 'rgba(251, 191, 36, 0.1)',
          border: `1px solid ${result.errors.length === 0 
            ? 'rgba(16, 185, 129, 0.3)' 
            : 'rgba(251, 191, 36, 0.3)'}`,
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '16px'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
            ✅ Upload Complete
          </div>
          <div>Total Rows: {result.total}</div>
          <div>Inserted/Updated: {result.inserted}</div>
          {result.errors.length > 0 && (
            <div style={{ marginTop: '8px', color: '#F59E0B' }}>
              <div>⚠️ Errors ({result.errors.length}):</div>
              <ul style={{ margin: '4px 0', paddingLeft: '20px', fontSize: '0.85em' }}>
                {result.errors.slice(0, 5).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
                {result.errors.length > 5 && (
                  <li>...and {result.errors.length - 5} more</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          padding: '12px',
          color: '#EF4444'
        }}>
          ❌ {error}
        </div>
      )}

      {/* Instructions */}
      <details style={{ marginTop: '16px', fontSize: '0.9em', opacity: 0.8 }}>
        <summary style={{ cursor: 'pointer' }}>📋 Format Instructions</summary>
        <div style={{ marginTop: '12px', paddingLeft: '12px' }}>
          <p><strong>📋 Paste Table Format (Recommended):</strong></p>
          <p style={{ opacity: 0.8, fontSize: '0.9em' }}>
            Copy the quarterly P&L table directly from Screener.in or Trendlyne. The format should be:
          </p>
          <code style={{ 
            display: 'block', 
            background: 'rgba(0,0,0,0.3)', 
            padding: '8px', 
            borderRadius: '4px',
            fontSize: '0.85em',
            overflow: 'auto',
            whiteSpace: 'pre'
          }}>
{`Indicator     Sep '25    Jun '25    Mar '25
Total Rev.    18,919     20,412     18,043
Operating Profit  6,252  6,261      5,986
Net Profit    5,179      4,912      19,561
EPS Adj.      4.1        3.9        15.6`}
          </code>
          
          <p style={{ marginTop: '16px' }}><strong>📁 CSV Format (Alternative):</strong></p>
          <code style={{ 
            display: 'block', 
            background: 'rgba(0,0,0,0.3)', 
            padding: '8px', 
            borderRadius: '4px',
            fontSize: '0.85em',
            overflow: 'auto'
          }}>
            symbol,quarter,fiscal_year,revenue,op_profit,net_profit,eps
          </code>
          
          <p style={{ marginTop: '12px' }}><strong>Notes:</strong></p>
          <ul>
            <li>All monetary values in Crores (₹)</li>
            <li>The system auto-detects quarters from column headers (Sep '25, Jun '25, etc.)</li>
            <li>Supports commas in numbers (18,919.20)</li>
          </ul>
        </div>
      </details>
    </div>
  )
}
