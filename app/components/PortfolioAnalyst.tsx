'use client'

import React, { useState, useCallback } from 'react'

interface StockAnalysis {
  symbol: string
  exchange: string
  sector: string
  industry: string
  entryPrice: number
  currentPrice: number
  hasLivePrice?: boolean
  quantity: number
  positionType: 'BUY' | 'SELL'
  unrealizedPnl: number
  unrealizedPnlPercent: number
  holdingDays: number
  verdict: string
  verdictConfidence: number
  verdictReasoning: string
  timeline: string
  scores: {
    technical: number
    macro: number
    geopolitical: number
    sector: number
    institutional: number
    overall: number
  }
  technicalAnalysis: {
    trend: string
    rsi: number | null
    volumeSignal: string
    smaAlignment: string
    priceVsSma20: number | null
    keyLevels: { support: number; resistance: number } | null
    summary: string
  }
  macroAnalysis: {
    score: number
    factors: string[]
    tailwinds: string[]
    headwinds: string[]
    summary: string
  }
  geopoliticalAnalysis: {
    impactScore: number
    relevantEvents: string[]
    warnings: string[]
    summary: string
  }
  sectorAnalysis: {
    sectorTrend: string
    peerComparison: string
    rotationSignal: string
    macroFactors: string[]
    summary: string
  }
  institutionalAnalysis: {
    fiiStance: string
    diiStance: string
    flowImpact: string
    summary: string
  }
  defensiveActions: Array<{
    action: string
    urgency: string
    detail: string
  }>
  riskScore: number
  maxDrawdownEstimate: number
  suggestedStopLoss: number
  suggestedTarget: number
  bullCase: string[]
  bearCase: string[]
  catalysts: string[]
  derivativesAnalysis?: {
    available: boolean
    reason?: string
    expiry: string
    putCallRatio: number
    volumePCR: number
    totalCallOI: number
    totalPutOI: number
    maxPainStrike: number | null
    highestCallOIStrike: number | null
    highestPutOIStrike: number | null
    sentiment: string
    sentimentScore: number
    interpretation: string
    signals: string[]
    topCalls: { strike: number; oi: number }[]
    topPuts: { strike: number; oi: number }[]
  } | null
  insiderAnalysis?: {
    available: boolean
    score: number
    sentiment: string
    signals: string[]
    netBuyValue: number
    uniqueBuyers: number
    uniqueSellers: number
    promoterActivity: string
    recentTrades: { name: string; tradeType: string; value: number; date: string; category: string }[]
  } | null
  deliveryAnalysis?: {
    available: boolean
    currentDeliveryPct: number
    avgDeliveryPct5d: number
    avgDeliveryPct20d: number
    deliveryTrend: string
    pattern: string
    score: number
    signals: string[]
  } | null
  intelligence?: {
    recommendation: string | null
    recommendationConviction: number
    thesis: string
    macroTailwinds: string[]
    macroHeadwinds: string[]
    secondOrderEffects: string[]
    geoContext: string[]
    newsHeadlines: string[]
    newsSentiment: number | null
    newsSentimentFactors: string[]
    newsRisks: string[]
    newsOpportunities: string[]
    tradePlan: string
  }
}

interface PortfolioReport {
  generatedAt: string
  totalPositions: number
  totalInvested: number
  totalCurrentValue: number
  totalPnl: number
  totalPnlPercent: number
  portfolioRiskScore: number
  concentrationRisk: string
  sectorExposure: Record<string, { count: number; weight: number; verdict: string }>
  overallVerdict: string
  positions: StockAnalysis[]
  immediateActions: Array<{ action: string; urgency: string; detail: string }>
  weeklyActions: Array<{ action: string; urgency: string; detail: string }>
  marketContext: {
    regime: string
    vix: number
    vixRisk: string
    fiiStance: string
    geoRisk: string
    overallSentiment: string
  }
}

// Manual position input
interface ManualPosition {
  symbol: string
  entryPrice: string
  quantity: string
  positionType: 'BUY' | 'SELL'
  stopLoss: string
  target: string
  entryTime: string
}

const emptyPosition: ManualPosition = {
  symbol: '',
  entryPrice: '',
  quantity: '',
  positionType: 'BUY',
  stopLoss: '',
  target: '',
  entryTime: new Date().toISOString().split('T')[0],
}

export default function PortfolioAnalyst() {
  const [report, setReport] = useState<PortfolioReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedStock, setExpandedStock] = useState<string | null>(null)
  const [mode, setMode] = useState<'db' | 'manual' | 'paste'>('db')
  const [manualPositions, setManualPositions] = useState<ManualPosition[]>([{ ...emptyPosition }])
  const [pasteText, setPasteText] = useState('')
  const [parsedFromPaste, setParsedFromPaste] = useState<ManualPosition[]>([])
  const [parseError, setParseError] = useState<string | null>(null)

  const analyzeFromDB = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/portfolio/analyze')
      const data = await res.json()
      if (data.success) {
        setReport(data.report)
      } else {
        setError(data.error || 'Analysis failed')
      }
    } catch (err) {
      setError('Network error — check if server is running')
    } finally {
      setLoading(false)
    }
  }, [])

  const analyzeManual = useCallback(async () => {
    const valid = manualPositions.filter(p => p.symbol && p.entryPrice && p.quantity)
    if (valid.length === 0) {
      setError('Add at least one position with symbol, entry price, and quantity')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/portfolio/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positions: valid.map(p => ({
            symbol: p.symbol.toUpperCase(),
            entryPrice: parseFloat(p.entryPrice),
            quantity: parseInt(p.quantity),
            positionType: p.positionType,
            stopLoss: p.stopLoss ? parseFloat(p.stopLoss) : null,
            target: p.target ? parseFloat(p.target) : null,
            entryTime: p.entryTime || new Date().toISOString(),
            exchange: 'NSE',
          })),
        }),
      })
      const data = await res.json()
      if (data.success) {
        setReport(data.report)
      } else {
        setError(data.error || 'Analysis failed')
      }
    } catch (err) {
      setError('Network error — check if server is running')
    } finally {
      setLoading(false)
    }
  }, [manualPositions])

  const parsePortfolioText = useCallback((text: string) => {
    setParseError(null)
    if (!text.trim()) {
      setParsedFromPaste([])
      return
    }

    const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean)
    const positions: ManualPosition[] = []

    for (const line of lines) {
      // Skip header-like lines
      if (/^(symbol|stock|instrument|name|sr|#|scrip)/i.test(line)) continue
      if (/^[-=]+$/.test(line)) continue

      // Try tab-separated first, then multi-space, then comma
      let parts: string[]
      if (line.includes('\t')) {
        parts = line.split('\t').map(p => p.trim()).filter(Boolean)
      } else if (line.includes(',')) {
        parts = line.split(',').map(p => p.trim()).filter(Boolean)
      } else {
        parts = line.split(/\s{2,}/).map(p => p.trim()).filter(Boolean)
      }

      if (parts.length < 3) continue

      // Extract symbol — first part that looks like a stock symbol (uppercase letters, no numbers only)
      let symbol = ''
      let remaining = [...parts]
      for (let i = 0; i < parts.length; i++) {
        const cleaned = parts[i].replace(/^(NSE:|BSE:)/, '').replace(/[^A-Za-z&\-]/g, '').toUpperCase()
        if (cleaned.length >= 2 && /^[A-Z&\-]+$/.test(cleaned)) {
          symbol = cleaned
          remaining.splice(i, 1)
          break
        }
      }
      if (!symbol) continue

      // Extract numbers from remaining parts
      const nums: number[] = []
      const dates: string[] = []
      for (const p of remaining) {
        // Check if it's a date
        if (/\d{4}-\d{2}-\d{2}/.test(p) || /\d{2}[\/\-]\d{2}[\/\-]\d{2,4}/.test(p)) {
          dates.push(p)
          continue
        }
        const n = parseFloat(p.replace(/[,₹$%]/g, ''))
        if (!isNaN(n) && n > 0) nums.push(n)
      }

      if (nums.length < 2) continue

      // Heuristic: quantity is the integer, price is the decimal/larger value
      // Common formats:
      //   SYMBOL  QTY  AVG_PRICE  [LTP]  [P&L]
      //   SYMBOL  AVG_PRICE  QTY
      //   SYMBOL  QTY  AVG_PRICE  SL  TARGET
      let qty: number
      let price: number

      // If first number < 10000 and is integer-like, likely quantity
      if (nums[0] === Math.floor(nums[0]) && nums[0] < 10000 && nums.length >= 2) {
        qty = nums[0]
        price = nums[1]
      } else if (nums[1] === Math.floor(nums[1]) && nums[1] < 10000 && nums[0] > nums[1]) {
        // Price then quantity
        price = nums[0]
        qty = nums[1]
      } else {
        // Default: first = qty, second = price
        qty = Math.round(nums[0])
        price = nums[1]
      }

      const pos: ManualPosition = {
        symbol,
        entryPrice: price.toString(),
        quantity: Math.round(qty).toString(),
        positionType: 'BUY',
        stopLoss: nums.length >= 4 ? nums[3].toString() : '',
        target: nums.length >= 5 ? nums[4].toString() : '',
        entryTime: dates[0] || new Date().toISOString().split('T')[0],
      }

      // Check for SELL/SHORT indicators in the line
      if (/\b(SELL|SHORT|S)\b/i.test(line)) {
        pos.positionType = 'SELL'
      }

      positions.push(pos)
    }

    if (positions.length === 0) {
      setParseError('Could not parse any positions. Use format: SYMBOL  QTY  AVG_PRICE (tab/comma/space separated)')
    }
    setParsedFromPaste(positions)
  }, [])

  const analyzePasted = useCallback(async () => {
    if (parsedFromPaste.length === 0) {
      setError('No positions parsed. Paste your holdings first.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/portfolio/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positions: parsedFromPaste.map(p => ({
            symbol: p.symbol.toUpperCase(),
            entryPrice: parseFloat(p.entryPrice),
            quantity: parseInt(p.quantity),
            positionType: p.positionType,
            stopLoss: p.stopLoss ? parseFloat(p.stopLoss) : null,
            target: p.target ? parseFloat(p.target) : null,
            entryTime: p.entryTime || new Date().toISOString(),
            exchange: 'NSE',
          })),
        }),
      })
      const data = await res.json()
      if (data.success) {
        setReport(data.report)
      } else {
        setError(data.error || 'Analysis failed')
      }
    } catch (err) {
      setError('Network error — check if server is running')
    } finally {
      setLoading(false)
    }
  }, [parsedFromPaste])

  const addPosition = () => setManualPositions(prev => [...prev, { ...emptyPosition }])

  const removePosition = (idx: number) => {
    setManualPositions(prev => prev.filter((_, i) => i !== idx))
  }

  const updatePosition = (idx: number, field: keyof ManualPosition, value: string) => {
    setManualPositions(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p))
  }

  const verdictColor = (v: string) => {
    if (v === 'STRONG_HOLD' || v === 'BUY_MORE') return '#10b981'
    if (v === 'HOLD') return '#f59e0b'
    if (v === 'PARTIAL_EXIT' || v === 'HEDGE') return '#f97316'
    if (v === 'EXIT') return '#ef4444'
    return '#6b7280'
  }

  const scoreColor = (s: number) => s > 20 ? '#10b981' : s < -20 ? '#ef4444' : '#f59e0b'

  return (
    <div style={{ padding: '0 4px' }}>
      {/* Mode Selector */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          className={`tab-btn ${mode === 'db' ? 'active' : ''}`}
          onClick={() => setMode('db')}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: mode === 'db' ? '2px solid #667eea' : '1px solid #374151',
            background: mode === 'db' ? '#1e1b4b' : 'transparent',
            color: mode === 'db' ? '#a5b4fc' : '#9ca3af',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: mode === 'db' ? 600 : 400,
          }}
        >
          Analyze My Positions
        </button>
        <button
          className={`tab-btn ${mode === 'paste' ? 'active' : ''}`}
          onClick={() => setMode('paste')}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: mode === 'paste' ? '2px solid #667eea' : '1px solid #374151',
            background: mode === 'paste' ? '#1e1b4b' : 'transparent',
            color: mode === 'paste' ? '#a5b4fc' : '#9ca3af',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: mode === 'paste' ? 600 : 400,
          }}
        >
          Paste Portfolio
        </button>
        <button
          className={`tab-btn ${mode === 'manual' ? 'active' : ''}`}
          onClick={() => setMode('manual')}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: mode === 'manual' ? '2px solid #667eea' : '1px solid #374151',
            background: mode === 'manual' ? '#1e1b4b' : 'transparent',
            color: mode === 'manual' ? '#a5b4fc' : '#9ca3af',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: mode === 'manual' ? 600 : 400,
          }}
        >
          Enter Manually
        </button>
      </div>

      {/* Paste Portfolio */}
      {mode === 'paste' && (
        <div className="card" style={{ marginBottom: '16px', padding: '12px' }}>
          <div style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '8px' }}>
            Copy-paste your holdings from Kite, Groww, or any broker. Supports tab-separated, comma-separated, or space-separated formats.
          </div>
          <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '10px', lineHeight: 1.6 }}>
            Example formats:<br />
            <code style={{ color: '#a5b4fc', background: '#1e1b4b', padding: '2px 4px', borderRadius: '3px' }}>ITC&nbsp;&nbsp;500&nbsp;&nbsp;349&nbsp;&nbsp;2025-01-15</code><br />
            <code style={{ color: '#a5b4fc', background: '#1e1b4b', padding: '2px 4px', borderRadius: '3px' }}>RELIANCE, 10, 1250.50</code><br />
            <code style={{ color: '#a5b4fc', background: '#1e1b4b', padding: '2px 4px', borderRadius: '3px' }}>HDFCBANK&#9;50&#9;1620&#9;1550&#9;1750</code> (with SL & target)
          </div>
          <textarea
            value={pasteText}
            onChange={e => {
              setPasteText(e.target.value)
              parsePortfolioText(e.target.value)
            }}
            placeholder={`Paste your holdings here...\n\nSymbol  Qty  Avg Price  [Entry Date]\nITC     500  349        2025-01-15\nRELIANCE  10  1250.50\nHDFCBANK  50  1620`}
            style={{
              width: '100%',
              minHeight: '140px',
              background: '#111827',
              border: '1px solid #374151',
              borderRadius: '6px',
              color: '#e5e7eb',
              padding: '10px',
              fontSize: '12px',
              fontFamily: 'monospace',
              resize: 'vertical',
            }}
          />
          {parseError && (
            <div style={{ fontSize: '12px', color: '#fca5a5', marginTop: '6px' }}>{parseError}</div>
          )}
          {parsedFromPaste.length > 0 && (
            <div style={{ marginTop: '10px' }}>
              <div style={{ fontSize: '12px', color: '#10b981', marginBottom: '6px' }}>
                Parsed {parsedFromPaste.length} position{parsedFromPaste.length > 1 ? 's' : ''}:
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #374151' }}>
                    <th style={{ padding: '4px 6px', textAlign: 'left', color: '#9ca3af' }}>Symbol</th>
                    <th style={{ padding: '4px 6px', textAlign: 'right', color: '#9ca3af' }}>Qty</th>
                    <th style={{ padding: '4px 6px', textAlign: 'right', color: '#9ca3af' }}>Avg Price</th>
                    <th style={{ padding: '4px 6px', textAlign: 'left', color: '#9ca3af' }}>Type</th>
                    <th style={{ padding: '4px 6px', textAlign: 'left', color: '#9ca3af' }}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedFromPaste.map((p, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #1f2937' }}>
                      <td style={{ padding: '4px 6px', color: '#e5e7eb' }}>{p.symbol}</td>
                      <td style={{ padding: '4px 6px', color: '#e5e7eb', textAlign: 'right' }}>{p.quantity}</td>
                      <td style={{ padding: '4px 6px', color: '#e5e7eb', textAlign: 'right' }}>₹{parseFloat(p.entryPrice).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                      <td style={{ padding: '4px 6px', color: p.positionType === 'SELL' ? '#ef4444' : '#10b981' }}>{p.positionType === 'SELL' ? 'SHORT' : 'LONG'}</td>
                      <td style={{ padding: '4px 6px', color: '#6b7280' }}>{p.entryTime}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Manual Input Form */}
      {mode === 'manual' && (
        <div className="card" style={{ marginBottom: '16px', padding: '12px' }}>
          <div style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '10px' }}>
            Enter your positions below. Use NSE symbols (e.g., RELIANCE, TCS, HDFCBANK).
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #374151' }}>
                  <th style={{ padding: '6px', textAlign: 'left', color: '#9ca3af' }}>Symbol</th>
                  <th style={{ padding: '6px', textAlign: 'left', color: '#9ca3af' }}>Entry Price</th>
                  <th style={{ padding: '6px', textAlign: 'left', color: '#9ca3af' }}>Qty</th>
                  <th style={{ padding: '6px', textAlign: 'left', color: '#9ca3af' }}>Type</th>
                  <th style={{ padding: '6px', textAlign: 'left', color: '#9ca3af' }}>Stop Loss</th>
                  <th style={{ padding: '6px', textAlign: 'left', color: '#9ca3af' }}>Target</th>
                  <th style={{ padding: '6px', textAlign: 'left', color: '#9ca3af' }}>Entry Date</th>
                  <th style={{ padding: '6px' }}></th>
                </tr>
              </thead>
              <tbody>
                {manualPositions.map((pos, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #1f2937' }}>
                    <td style={{ padding: '4px' }}>
                      <input
                        type="text"
                        value={pos.symbol}
                        onChange={e => updatePosition(idx, 'symbol', e.target.value)}
                        placeholder="RELIANCE"
                        style={inputStyle}
                      />
                    </td>
                    <td style={{ padding: '4px' }}>
                      <input
                        type="number"
                        value={pos.entryPrice}
                        onChange={e => updatePosition(idx, 'entryPrice', e.target.value)}
                        placeholder="1200"
                        style={{ ...inputStyle, width: '80px' }}
                      />
                    </td>
                    <td style={{ padding: '4px' }}>
                      <input
                        type="number"
                        value={pos.quantity}
                        onChange={e => updatePosition(idx, 'quantity', e.target.value)}
                        placeholder="10"
                        style={{ ...inputStyle, width: '60px' }}
                      />
                    </td>
                    <td style={{ padding: '4px' }}>
                      <select
                        value={pos.positionType}
                        onChange={e => updatePosition(idx, 'positionType', e.target.value)}
                        style={{ ...inputStyle, width: '70px' }}
                      >
                        <option value="BUY">LONG</option>
                        <option value="SELL">SHORT</option>
                      </select>
                    </td>
                    <td style={{ padding: '4px' }}>
                      <input
                        type="number"
                        value={pos.stopLoss}
                        onChange={e => updatePosition(idx, 'stopLoss', e.target.value)}
                        placeholder="—"
                        style={{ ...inputStyle, width: '80px' }}
                      />
                    </td>
                    <td style={{ padding: '4px' }}>
                      <input
                        type="number"
                        value={pos.target}
                        onChange={e => updatePosition(idx, 'target', e.target.value)}
                        placeholder="—"
                        style={{ ...inputStyle, width: '80px' }}
                      />
                    </td>
                    <td style={{ padding: '4px' }}>
                      <input
                        type="date"
                        value={pos.entryTime}
                        onChange={e => updatePosition(idx, 'entryTime', e.target.value)}
                        style={{ ...inputStyle, width: '120px' }}
                      />
                    </td>
                    <td style={{ padding: '4px' }}>
                      {manualPositions.length > 1 && (
                        <button
                          onClick={() => removePosition(idx)}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px' }}
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={addPosition}
            style={{
              marginTop: '8px',
              padding: '6px 12px',
              background: 'transparent',
              border: '1px dashed #374151',
              color: '#9ca3af',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            + Add Position
          </button>
        </div>
      )}

      {/* Analyze Button */}
      <button
        onClick={mode === 'db' ? analyzeFromDB : mode === 'paste' ? analyzePasted : analyzeManual}
        disabled={loading}
        style={{
          padding: '10px 24px',
          background: loading ? '#374151' : 'linear-gradient(135deg, #667eea, #764ba2)',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: '14px',
          fontWeight: 600,
          marginBottom: '16px',
        }}
      >
        {loading ? 'Analyzing... (this takes 15-30s)' : 'Run Deep Portfolio Analysis'}
      </button>

      {error && (
        <div style={{ padding: '12px', background: '#7f1d1d33', border: '1px solid #7f1d1d', borderRadius: '8px', color: '#fca5a5', marginBottom: '16px', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* Report */}
      {report && (
        <div>
          {/* Portfolio Summary Card */}
          <div className="card" style={{ marginBottom: '16px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px' }}>Portfolio Summary</div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: report.totalPnl >= 0 ? '#10b981' : '#ef4444', marginTop: '4px' }}>
                  {report.totalPnl >= 0 ? '+' : ''}₹{report.totalPnl.toLocaleString('en-IN')}
                  <span style={{ fontSize: '14px', marginLeft: '8px' }}>({report.totalPnlPercent >= 0 ? '+' : ''}{report.totalPnlPercent.toFixed(2)}%)</span>
                </div>
                <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>
                  Invested: ₹{report.totalInvested.toLocaleString('en-IN')} | Current: ₹{report.totalCurrentValue.toLocaleString('en-IN')} | {report.totalPositions} positions
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <MetricBadge label="Portfolio Risk" value={`${report.portfolioRiskScore}/100`} color={report.portfolioRiskScore > 60 ? '#ef4444' : report.portfolioRiskScore > 40 ? '#f59e0b' : '#10b981'} />
                <MetricBadge label="VIX" value={report.marketContext.vix.toFixed(1)} color={report.marketContext.vixRisk === 'EXTREME' || report.marketContext.vixRisk === 'HIGH' ? '#ef4444' : '#f59e0b'} />
                <MetricBadge label="FII" value={report.marketContext.fiiStance} color={report.marketContext.fiiStance === 'BUYING' ? '#10b981' : report.marketContext.fiiStance === 'SELLING' ? '#ef4444' : '#9ca3af'} />
                <MetricBadge label="Geo Risk" value={report.marketContext.geoRisk} color={report.marketContext.geoRisk === 'EXTREME' || report.marketContext.geoRisk === 'HIGH' ? '#ef4444' : '#10b981'} />
              </div>
            </div>
            <div style={{ marginTop: '12px', padding: '10px', background: '#1e1b4b', borderRadius: '6px', fontSize: '13px', color: '#c4b5fd', lineHeight: 1.5 }}>
              {report.overallVerdict}
            </div>
          </div>

          {/* Immediate Actions */}
          {report.immediateActions.length > 0 && (
            <div className="card" style={{ marginBottom: '16px', padding: '16px', borderLeft: '4px solid #ef4444' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#ef4444', marginBottom: '8px' }}>
                IMMEDIATE ACTIONS REQUIRED
              </div>
              {report.immediateActions.map((a, i) => (
                <div key={i} style={{ padding: '8px', background: '#7f1d1d22', borderRadius: '6px', marginBottom: '6px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#fca5a5' }}>{a.action}</div>
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{a.detail}</div>
                </div>
              ))}
            </div>
          )}

          {/* Sector Exposure */}
          {Object.keys(report.sectorExposure).length > 0 && (
            <div className="card" style={{ marginBottom: '16px', padding: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#9ca3af', marginBottom: '8px' }}>
                SECTOR EXPOSURE — {report.concentrationRisk}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {Object.entries(report.sectorExposure).map(([sector, data]) => (
                  <div key={sector} style={{
                    padding: '6px 10px',
                    background: '#1f2937',
                    borderRadius: '6px',
                    fontSize: '11px',
                  }}>
                    <span style={{ color: '#e5e7eb', fontWeight: 600 }}>{sector}</span>
                    <span style={{ color: '#9ca3af', marginLeft: '6px' }}>{data.weight.toFixed(1)}%</span>
                    <span style={{ color: '#6b7280', marginLeft: '4px' }}>({data.count})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per-Stock Analysis Cards */}
          {report.positions.map(stock => (
            <div key={stock.symbol} className="card" style={{ marginBottom: '12px', padding: '0', overflow: 'hidden' }}>
              {/* Header */}
              <div
                onClick={() => setExpandedStock(expandedStock === stock.symbol ? null : stock.symbol)}
                style={{
                  padding: '14px 16px',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '8px',
                  borderBottom: expandedStock === stock.symbol ? '1px solid #1f2937' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: '#e5e7eb' }}>{stock.symbol}</span>
                    <span style={{ fontSize: '11px', color: '#6b7280', marginLeft: '8px' }}>{stock.sector} • {stock.holdingDays}d</span>
                  </div>
                  <span style={{
                    padding: '3px 10px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: 700,
                    background: verdictColor(stock.verdict) + '22',
                    color: verdictColor(stock.verdict),
                    border: `1px solid ${verdictColor(stock.verdict)}44`,
                  }}>
                    {stock.verdict.replace('_', ' ')}
                  </span>
                  <span style={{ fontSize: '11px', color: '#6b7280' }}>
                    {stock.verdictConfidence}% confidence
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '13px', color: stock.hasLivePrice === false ? '#f59e0b' : '#e5e7eb' }}>
                      ₹{stock.currentPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      {stock.hasLivePrice === false && <span style={{ fontSize: '10px', color: '#f59e0b' }}> (stale)</span>}
                    </div>
                    <div style={{ fontSize: '11px', color: stock.unrealizedPnlPercent >= 0 ? '#10b981' : '#ef4444' }}>
                      {stock.unrealizedPnlPercent >= 0 ? '+' : ''}{stock.unrealizedPnlPercent.toFixed(2)}%
                      ({stock.unrealizedPnl >= 0 ? '+' : ''}₹{stock.unrealizedPnl.toLocaleString('en-IN')})
                    </div>
                  </div>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>{expandedStock === stock.symbol ? '▲' : '▼'}</div>
                </div>
              </div>

              {/* Expanded Details */}
              {expandedStock === stock.symbol && (
                <div style={{ padding: '16px' }}>
                  {/* Verdict + Intelligence Thesis */}
                  <div style={{ padding: '12px', background: verdictColor(stock.verdict) + '11', borderRadius: '6px', marginBottom: '14px', borderLeft: `3px solid ${verdictColor(stock.verdict)}` }}>
                    <div style={{ fontSize: '13px', color: '#e5e7eb', lineHeight: 1.7, fontWeight: 500 }}>{stock.verdictReasoning}</div>
                    {stock.intelligence?.recommendation && (
                      <div style={{ marginTop: '6px', fontSize: '11px', color: '#a5b4fc' }}>
                        Engine recommendation: <strong>{stock.intelligence.recommendation}</strong> ({stock.intelligence.recommendationConviction}% conviction)
                      </div>
                    )}
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>Timeline: {stock.timeline.replace(/_/g, ' ')} | Risk: {stock.riskScore}/100 | Max Drawdown Est: -{stock.maxDrawdownEstimate}%</div>
                  </div>

                  {/* Intelligence Thesis — the WHY */}
                  {stock.intelligence?.thesis && (
                    <div style={{ padding: '10px', background: '#1e1b4b33', borderRadius: '6px', marginBottom: '14px', border: '1px solid #312e81' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#a5b4fc', marginBottom: '4px' }}>WHY IS THIS HAPPENING</div>
                      <div style={{ fontSize: '12px', color: '#e5e7eb', lineHeight: 1.6 }}>{stock.intelligence.thesis}</div>
                    </div>
                  )}

                  {/* Trade Plan */}
                  {stock.intelligence?.tradePlan && (
                    <div style={{ padding: '10px', background: '#064e3b22', borderRadius: '6px', marginBottom: '14px', border: '1px solid #064e3b' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#10b981', marginBottom: '4px' }}>TRADE PLAN</div>
                      <div style={{ fontSize: '12px', color: '#a7f3d0', lineHeight: 1.6 }}>{stock.intelligence.tradePlan}</div>
                    </div>
                  )}

                  {/* News & Sentiment */}
                  {stock.intelligence && stock.intelligence.newsHeadlines.length > 0 && (
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af' }}>RECENT NEWS</span>
                        {stock.intelligence.newsSentiment !== null && (
                          <span style={{
                            padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600,
                            background: stock.intelligence.newsSentiment > 20 ? '#064e3b' : stock.intelligence.newsSentiment < -20 ? '#7f1d1d' : '#374151',
                            color: stock.intelligence.newsSentiment > 20 ? '#10b981' : stock.intelligence.newsSentiment < -20 ? '#ef4444' : '#9ca3af',
                          }}>
                            Sentiment: {stock.intelligence.newsSentiment > 20 ? 'Positive' : stock.intelligence.newsSentiment < -20 ? 'Negative' : 'Neutral'} ({stock.intelligence.newsSentiment > 0 ? '+' : ''}{stock.intelligence.newsSentiment})
                          </span>
                        )}
                      </div>
                      {stock.intelligence.newsHeadlines.slice(0, 5).map((h, i) => (
                        <div key={i} style={{ fontSize: '11px', color: '#d1d5db', marginBottom: '3px', paddingLeft: '8px', borderLeft: '2px solid #374151' }}>
                          {h}
                        </div>
                      ))}
                      {stock.intelligence.newsSentimentFactors.length > 0 && (
                        <div style={{ marginTop: '6px', fontSize: '11px', color: '#a5b4fc' }}>
                          Key factors: {stock.intelligence.newsSentimentFactors.join(' | ')}
                        </div>
                      )}
                      {stock.intelligence.newsRisks.length > 0 && (
                        <div style={{ marginTop: '3px', fontSize: '11px', color: '#fca5a5' }}>
                          Risks: {stock.intelligence.newsRisks.join(' | ')}
                        </div>
                      )}
                      {stock.intelligence.newsOpportunities.length > 0 && (
                        <div style={{ marginTop: '3px', fontSize: '11px', color: '#a7f3d0' }}>
                          Opportunities: {stock.intelligence.newsOpportunities.join(' | ')}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Second-Order Effects */}
                  {stock.intelligence && stock.intelligence.secondOrderEffects.length > 0 && (
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', marginBottom: '4px' }}>NON-OBVIOUS EFFECTS</div>
                      {stock.intelligence.secondOrderEffects.map((e, i) => (
                        <div key={i} style={{ fontSize: '11px', color: '#d1d5db', marginBottom: '3px' }}>• {e}</div>
                      ))}
                    </div>
                  )}

                  {/* Derivatives / F&O Analysis */}
                  {stock.derivativesAnalysis?.available && (
                    <div style={{ marginBottom: '14px', padding: '12px', background: '#0f172a', borderRadius: '6px', border: '1px solid #1e293b' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af' }}>F&O / DERIVATIVES</span>
                        <span style={{
                          padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600,
                          background: stock.derivativesAnalysis.sentimentScore > 10 ? '#064e3b' : stock.derivativesAnalysis.sentimentScore < -10 ? '#7f1d1d' : '#374151',
                          color: stock.derivativesAnalysis.sentimentScore > 10 ? '#10b981' : stock.derivativesAnalysis.sentimentScore < -10 ? '#ef4444' : '#9ca3af',
                        }}>
                          {stock.derivativesAnalysis.sentiment.replace('_', ' ')} ({stock.derivativesAnalysis.sentimentScore > 0 ? '+' : ''}{stock.derivativesAnalysis.sentimentScore})
                        </span>
                      </div>
                      {/* Key metrics row */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '8px', marginBottom: '10px' }}>
                        <div style={{ padding: '6px', background: '#111827', borderRadius: '4px', textAlign: 'center' }}>
                          <div style={{ fontSize: '9px', color: '#6b7280' }}>PCR (OI)</div>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: stock.derivativesAnalysis.putCallRatio > 1.2 ? '#10b981' : stock.derivativesAnalysis.putCallRatio < 0.7 ? '#ef4444' : '#f59e0b' }}>
                            {stock.derivativesAnalysis.putCallRatio.toFixed(2)}
                          </div>
                        </div>
                        <div style={{ padding: '6px', background: '#111827', borderRadius: '4px', textAlign: 'center' }}>
                          <div style={{ fontSize: '9px', color: '#6b7280' }}>PCR (Vol)</div>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: '#e5e7eb' }}>{stock.derivativesAnalysis.volumePCR.toFixed(2)}</div>
                        </div>
                        {stock.derivativesAnalysis.maxPainStrike && (
                          <div style={{ padding: '6px', background: '#111827', borderRadius: '4px', textAlign: 'center' }}>
                            <div style={{ fontSize: '9px', color: '#6b7280' }}>Max Pain</div>
                            <div style={{ fontSize: '15px', fontWeight: 700, color: '#a5b4fc' }}>₹{stock.derivativesAnalysis.maxPainStrike.toLocaleString('en-IN')}</div>
                          </div>
                        )}
                        {stock.derivativesAnalysis.highestPutOIStrike && (
                          <div style={{ padding: '6px', background: '#111827', borderRadius: '4px', textAlign: 'center' }}>
                            <div style={{ fontSize: '9px', color: '#6b7280' }}>Put Support</div>
                            <div style={{ fontSize: '15px', fontWeight: 700, color: '#10b981' }}>₹{stock.derivativesAnalysis.highestPutOIStrike.toLocaleString('en-IN')}</div>
                          </div>
                        )}
                        {stock.derivativesAnalysis.highestCallOIStrike && (
                          <div style={{ padding: '6px', background: '#111827', borderRadius: '4px', textAlign: 'center' }}>
                            <div style={{ fontSize: '9px', color: '#6b7280' }}>Call Resistance</div>
                            <div style={{ fontSize: '15px', fontWeight: 700, color: '#ef4444' }}>₹{stock.derivativesAnalysis.highestCallOIStrike.toLocaleString('en-IN')}</div>
                          </div>
                        )}
                      </div>
                      {/* Interpretation */}
                      <div style={{ fontSize: '11px', color: '#d1d5db', marginBottom: '6px', lineHeight: 1.5 }}>
                        {stock.derivativesAnalysis.interpretation}
                      </div>
                      {/* Signals */}
                      {stock.derivativesAnalysis.signals.map((s, i) => (
                        <div key={i} style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '3px', paddingLeft: '8px', borderLeft: '2px solid #374151' }}>
                          {s}
                        </div>
                      ))}
                      <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '6px' }}>Expiry: {stock.derivativesAnalysis.expiry} | Call OI: {stock.derivativesAnalysis.totalCallOI.toLocaleString('en-IN')} | Put OI: {stock.derivativesAnalysis.totalPutOI.toLocaleString('en-IN')}</div>
                    </div>
                  )}

                  {/* Insider / Promoter Tracking */}
                  {stock.insiderAnalysis?.available && (
                    <div style={{ marginBottom: '14px', padding: '10px', background: '#1a1a2e', borderRadius: '8px', border: '1px solid #2d2d44' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af' }}>INSIDER / PROMOTER ACTIVITY</span>
                        <span style={{
                          fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px',
                          background: stock.insiderAnalysis.score > 10 ? '#064e3b' : stock.insiderAnalysis.score < -10 ? '#7f1d1d' : '#374151',
                          color: stock.insiderAnalysis.score > 10 ? '#10b981' : stock.insiderAnalysis.score < -10 ? '#ef4444' : '#9ca3af',
                        }}>
                          {stock.insiderAnalysis.sentiment} ({stock.insiderAnalysis.score > 0 ? '+' : ''}{stock.insiderAnalysis.score})
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '16px', marginBottom: '8px', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: '10px', color: '#6b7280' }}>Net Buy (Cr)</div>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: stock.insiderAnalysis.netBuyValue > 0 ? '#10b981' : stock.insiderAnalysis.netBuyValue < 0 ? '#ef4444' : '#e5e7eb' }}>
                            ₹{stock.insiderAnalysis.netBuyValue.toFixed(1)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', color: '#6b7280' }}>Buyers</div>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: '#10b981' }}>{stock.insiderAnalysis.uniqueBuyers}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', color: '#6b7280' }}>Sellers</div>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: '#ef4444' }}>{stock.insiderAnalysis.uniqueSellers}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', color: '#6b7280' }}>Promoter</div>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: stock.insiderAnalysis.promoterActivity === 'BUYING' ? '#10b981' : stock.insiderAnalysis.promoterActivity === 'SELLING' ? '#ef4444' : '#6b7280' }}>
                            {stock.insiderAnalysis.promoterActivity}
                          </div>
                        </div>
                      </div>
                      {stock.insiderAnalysis.signals.map((s, i) => (
                        <div key={i} style={{ fontSize: '12px', color: '#d1d5db', marginBottom: '3px', paddingLeft: '8px', borderLeft: '2px solid #4b5563' }}>{s}</div>
                      ))}
                      {stock.insiderAnalysis.recentTrades.length > 0 && (
                        <div style={{ marginTop: '8px', fontSize: '10px', color: '#6b7280' }}>
                          Recent: {stock.insiderAnalysis.recentTrades.slice(0, 3).map(t =>
                            `${t.category} ${t.tradeType} ₹${(t.value / 1e7).toFixed(1)}Cr (${t.date.split('T')[0]})`
                          ).join(' | ')}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Delivery Volume Analysis */}
                  {stock.deliveryAnalysis?.available && (
                    <div style={{ marginBottom: '14px', padding: '10px', background: '#1a1a2e', borderRadius: '8px', border: '1px solid #2d2d44' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af' }}>DELIVERY VOLUME</span>
                        <span style={{
                          fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px',
                          background: stock.deliveryAnalysis.pattern === 'ACCUMULATION' || stock.deliveryAnalysis.pattern === 'GENUINE' ? '#064e3b' :
                                     stock.deliveryAnalysis.pattern === 'DISTRIBUTION' || stock.deliveryAnalysis.pattern === 'SPECULATIVE' ? '#7f1d1d' : '#374151',
                          color: stock.deliveryAnalysis.pattern === 'ACCUMULATION' || stock.deliveryAnalysis.pattern === 'GENUINE' ? '#10b981' :
                                stock.deliveryAnalysis.pattern === 'DISTRIBUTION' || stock.deliveryAnalysis.pattern === 'SPECULATIVE' ? '#ef4444' : '#9ca3af',
                        }}>
                          {stock.deliveryAnalysis.pattern} ({stock.deliveryAnalysis.score > 0 ? '+' : ''}{stock.deliveryAnalysis.score})
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '16px', marginBottom: '8px', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: '10px', color: '#6b7280' }}>Today</div>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: stock.deliveryAnalysis.currentDeliveryPct > 65 ? '#10b981' : stock.deliveryAnalysis.currentDeliveryPct < 35 ? '#ef4444' : '#f59e0b' }}>
                            {stock.deliveryAnalysis.currentDeliveryPct}%
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', color: '#6b7280' }}>5D Avg</div>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: '#e5e7eb' }}>{stock.deliveryAnalysis.avgDeliveryPct5d}%</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', color: '#6b7280' }}>20D Avg</div>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: '#e5e7eb' }}>{stock.deliveryAnalysis.avgDeliveryPct20d}%</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', color: '#6b7280' }}>Trend</div>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: stock.deliveryAnalysis.deliveryTrend === 'RISING' ? '#10b981' : stock.deliveryAnalysis.deliveryTrend === 'FALLING' ? '#ef4444' : '#f59e0b' }}>
                            {stock.deliveryAnalysis.deliveryTrend}
                          </div>
                        </div>
                      </div>
                      {stock.deliveryAnalysis.signals.map((s, i) => (
                        <div key={i} style={{ fontSize: '12px', color: '#d1d5db', marginBottom: '3px', paddingLeft: '8px', borderLeft: '2px solid #4b5563' }}>{s}</div>
                      ))}
                    </div>
                  )}

                  {/* Score Breakdown */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: '8px', marginBottom: '14px' }}>
                    {Object.entries(stock.scores).map(([key, val]) => (
                      <div key={key} style={{ padding: '8px', background: '#111827', borderRadius: '6px', textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase' }}>{key}</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: scoreColor(val as number) }}>{val > 0 ? '+' : ''}{val}</div>
                      </div>
                    ))}
                  </div>

                  {/* Macro & Geo Detail (collapsible) */}
                  <AnalysisSection title="Macro & Geopolitical Impact" content={stock.macroAnalysis.summary + ' ' + stock.geopoliticalAnalysis.summary} details={[
                    ...stock.intelligence?.macroTailwinds?.map(t => `Tailwind: ${t}`) ?? stock.macroAnalysis.tailwinds.map(t => `Tailwind: ${t}`),
                    ...stock.intelligence?.macroHeadwinds?.map(h => `Headwind: ${h}`) ?? stock.macroAnalysis.headwinds.map(h => `Headwind: ${h}`),
                    ...stock.intelligence?.geoContext ?? stock.geopoliticalAnalysis.warnings,
                  ]} />

                  <AnalysisSection title="Technical Analysis" content={stock.technicalAnalysis.summary} details={[
                    `Trend: ${stock.technicalAnalysis.trend.replace('_', ' ')}`,
                    stock.technicalAnalysis.rsi ? `RSI: ${stock.technicalAnalysis.rsi.toFixed(0)}` : null,
                    stock.technicalAnalysis.keyLevels ? `Support: ₹${stock.technicalAnalysis.keyLevels.support} | Resistance: ₹${stock.technicalAnalysis.keyLevels.resistance}` : null,
                    `SMAs: ${stock.technicalAnalysis.smaAlignment}`,
                  ].filter(Boolean) as string[]} />

                  <AnalysisSection title="Institutional Flows" content={stock.institutionalAnalysis.summary} details={[
                    `FII: ${stock.institutionalAnalysis.fiiStance} | DII: ${stock.institutionalAnalysis.diiStance}`,
                    stock.institutionalAnalysis.flowImpact,
                  ]} />

                  {/* Bull vs Bear Case */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                    <div style={{ padding: '10px', background: '#064e3b22', borderRadius: '6px', border: '1px solid #064e3b' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#10b981', marginBottom: '6px' }}>BULL CASE</div>
                      {stock.bullCase.map((b, i) => (
                        <div key={i} style={{ fontSize: '11px', color: '#a7f3d0', marginBottom: '3px' }}>• {b}</div>
                      ))}
                    </div>
                    <div style={{ padding: '10px', background: '#7f1d1d22', borderRadius: '6px', border: '1px solid #7f1d1d' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#ef4444', marginBottom: '6px' }}>BEAR CASE</div>
                      {stock.bearCase.map((b, i) => (
                        <div key={i} style={{ fontSize: '11px', color: '#fecaca', marginBottom: '3px' }}>• {b}</div>
                      ))}
                    </div>
                  </div>

                  {/* Catalysts */}
                  {stock.catalysts.length > 0 && (
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', marginBottom: '4px' }}>UPCOMING CATALYSTS</div>
                      {stock.catalysts.map((c, i) => (
                        <span key={i} style={{ display: 'inline-block', padding: '3px 8px', background: '#1e1b4b', borderRadius: '4px', fontSize: '10px', color: '#a5b4fc', marginRight: '6px', marginBottom: '4px' }}>
                          {c}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Defensive Actions */}
                  {stock.defensiveActions.length > 0 && (
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', marginBottom: '6px' }}>DEFENSIVE ACTIONS</div>
                      {stock.defensiveActions.map((a, i) => (
                        <div key={i} style={{
                          padding: '8px',
                          background: a.urgency === 'IMMEDIATE' ? '#7f1d1d22' : '#1f2937',
                          borderRadius: '6px',
                          marginBottom: '4px',
                          borderLeft: `3px solid ${a.urgency === 'IMMEDIATE' ? '#ef4444' : a.urgency === 'THIS_WEEK' ? '#f59e0b' : '#6b7280'}`,
                        }}>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: a.urgency === 'IMMEDIATE' ? '#fca5a5' : '#e5e7eb' }}>
                            {a.action}
                            <span style={{ fontSize: '10px', color: '#6b7280', marginLeft: '8px' }}>[{a.urgency}]</span>
                          </div>
                          <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>{a.detail}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Suggested Levels */}
                  <div style={{ display: 'flex', gap: '12px', fontSize: '11px' }}>
                    <div style={{ padding: '6px 10px', background: '#111827', borderRadius: '4px' }}>
                      <span style={{ color: '#6b7280' }}>Entry: </span>
                      <span style={{ color: '#e5e7eb' }}>₹{stock.entryPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                    </div>
                    <div style={{ padding: '6px 10px', background: '#111827', borderRadius: '4px' }}>
                      <span style={{ color: '#6b7280' }}>Suggested SL: </span>
                      <span style={{ color: '#ef4444' }}>
                        {stock.suggestedStopLoss > 0
                          ? `₹${stock.suggestedStopLoss.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
                          : 'N/A — no live price'}
                      </span>
                    </div>
                    <div style={{ padding: '6px 10px', background: '#111827', borderRadius: '4px' }}>
                      <span style={{ color: '#6b7280' }}>Target: </span>
                      <span style={{ color: '#10b981' }}>
                        {stock.suggestedTarget > 0
                          ? `₹${stock.suggestedTarget.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
                          : 'N/A — no live price'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Weekly Actions */}
          {report.weeklyActions.length > 0 && (
            <div className="card" style={{ marginTop: '16px', padding: '16px', borderLeft: '4px solid #f59e0b' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#f59e0b', marginBottom: '8px' }}>
                WEEKLY REVIEW ACTIONS
              </div>
              {report.weeklyActions.map((a, i) => (
                <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid #1f2937' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#e5e7eb' }}>{a.action}</div>
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{a.detail}</div>
                </div>
              ))}
            </div>
          )}

          {/* Timestamp */}
          <div style={{ fontSize: '10px', color: '#4b5563', textAlign: 'center', marginTop: '16px' }}>
            Analysis generated: {new Date(report.generatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function MetricBadge({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ padding: '6px 10px', background: '#111827', borderRadius: '6px', textAlign: 'center', minWidth: '60px' }}>
      <div style={{ fontSize: '9px', color: '#6b7280', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '13px', fontWeight: 700, color }}>{value}</div>
    </div>
  )
}

function AnalysisSection({ title, content, details }: { title: string; content: string; details: string[] }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#667eea', marginBottom: '4px', textTransform: 'uppercase' }}>{title}</div>
      <div style={{ fontSize: '12px', color: '#d1d5db', lineHeight: 1.5, marginBottom: '4px' }}>{content}</div>
      {details.length > 0 && (
        <div style={{ paddingLeft: '8px' }}>
          {details.map((d, i) => (
            <div key={i} style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '2px' }}>• {d}</div>
          ))}
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '5px 8px',
  background: '#111827',
  border: '1px solid #374151',
  borderRadius: '4px',
  color: '#e5e7eb',
  fontSize: '12px',
  width: '100px',
}
