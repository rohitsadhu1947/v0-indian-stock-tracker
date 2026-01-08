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
  const [dataType, setDataType] = useState<'quarterly' | 'annual'>('quarterly')
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<any>(null)
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
        <summary style={{ cursor: 'pointer' }}>📋 CSV Format Instructions</summary>
        <div style={{ marginTop: '12px', paddingLeft: '12px' }}>
          <p><strong>Quarterly CSV columns:</strong></p>
          <code style={{ 
            display: 'block', 
            background: 'rgba(0,0,0,0.3)', 
            padding: '8px', 
            borderRadius: '4px',
            fontSize: '0.85em',
            overflow: 'auto'
          }}>
            symbol,quarter,fiscal_year,end_date,revenue,op_expenses,op_profit,depreciation,interest,tax,net_profit,eps
          </code>
          
          <p style={{ marginTop: '12px' }}><strong>Example row:</strong></p>
          <code style={{ 
            display: 'block', 
            background: 'rgba(0,0,0,0.3)', 
            padding: '8px', 
            borderRadius: '4px',
            fontSize: '0.85em',
            overflow: 'auto'
          }}>
            TCS,Q2,FY26,2025-09-30,64259,46334,17925,1234,156,4521,12380,33.8
          </code>
          
          <p style={{ marginTop: '12px' }}><strong>Notes:</strong></p>
          <ul>
            <li>All monetary values in Crores (₹)</li>
            <li>quarter: Q1/Q2/Q3/Q4 (Indian FY)</li>
            <li>fiscal_year: FY26 = Apr 2025 - Mar 2026</li>
          </ul>
        </div>
      </details>
    </div>
  )
}
