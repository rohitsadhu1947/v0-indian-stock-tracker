'use client'

/**
 * Stock Check: a risk report card for any NSE stock before you trade it.
 * States facts with an evidence rating and turns volatility into a
 * position-size limit. It never says buy or sell.
 */

import React, { useState } from 'react'
import type { StockCheckResult, Severity, Evidence } from '@/lib/stock-check'
import { UNIVERSE_SYMBOLS } from '@/lib/portfolio/universe'

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12, padding: 20, marginBottom: 16,
}
const muted: React.CSSProperties = { opacity: 0.7, fontSize: '0.9em' }
const input: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '1em',
}

const SEVERITY: Record<Severity, { color: string; label: string; icon: string }> = {
  warning: { color: '#f87171', label: 'Warning', icon: '⛔' },
  caution: { color: '#fbbf24', label: 'Caution', icon: '⚠️' },
  info: { color: '#93c5fd', label: 'Info', icon: 'ℹ️' },
  positive: { color: '#34d399', label: 'Positive', icon: '✅' },
}
const EVIDENCE: Record<Evidence, string> = {
  strong: 'Strong evidence',
  moderate: 'Moderate evidence',
  weak: 'Weak evidence',
}

export default function StockCheckTab() {
  const [symbol, setSymbol] = useState('')
  const [capital, setCapital] = useState(300000)
  const [maxLossPct, setMaxLossPct] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<StockCheckResult | null>(null)
  const [source, setSource] = useState<string>('')
  const [exchange, setExchange] = useState<string>('NSE')

  const run = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const s = symbol.trim().toUpperCase()
    if (!s) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/stock-check?symbol=${encodeURIComponent(s)}&capital=${capital}&maxLossPct=${maxLossPct}`)
      if (res.status === 401) { window.location.href = '/login'; return }
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Check failed')
      setResult(json.result)
      setSource(json.source)
      setExchange(json.exchange || 'NSE')
    } catch (err: any) {
      setResult(null)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const counts = result
    ? (['warning', 'caution', 'positive'] as Severity[]).map(s => [s, result.checks.filter(c => c.severity === s).length] as const)
    : []

  return (
    <div>
      <div style={card}>
        <h2 style={{ margin: '0 0 6px' }}>🔍 Stock Check</h2>
        <p style={{ ...muted, margin: 0 }}>
          A risk report card for any NSE or BSE stock before you trade it. It states facts, rates how much evidence backs each one,
          and tells you how big a position fits your risk limit. It does not say buy or sell.
        </p>

        <form onSubmit={run} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16, alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 180px' }}>
            <span style={muted}>Symbol (NSE or BSE)</span>
            <input
              style={input}
              value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              placeholder="e.g. RELIANCE or SPICEJET"
              list="stock-check-symbols"
              autoCapitalize="characters"
              aria-label="NSE symbol"
            />
            <datalist id="stock-check-symbols">
              {UNIVERSE_SYMBOLS.map(s => <option key={s} value={s} />)}
            </datalist>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 140px' }}>
            <span style={muted}>Your capital (₹)</span>
            <input
              style={input}
              type="number"
              min={10000}
              step={10000}
              value={capital}
              onChange={e => setCapital(Math.max(10000, Number(e.target.value) || 10000))}
              aria-label="Capital in rupees"
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 160px' }}>
            <span style={muted}>Most you&apos;ll lose on this trade</span>
            <select style={input} value={maxLossPct} onChange={e => setMaxLossPct(Number(e.target.value))} aria-label="Maximum loss per trade">
              <option value={0.5}>0.5% of capital</option>
              <option value={1}>1% of capital</option>
              <option value={2}>2% of capital</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={loading || !symbol.trim()}
            style={{ padding: '10px 20px', borderRadius: 8, border: 'none', fontWeight: 700, background: '#2563eb', color: '#fff', cursor: 'pointer' }}
          >
            {loading ? 'Checking…' : 'Check'}
          </button>
        </form>
      </div>

      {error && <div style={{ ...card, borderColor: '#ef4444', color: '#fca5a5' }}>⚠️ {error}</div>}

      {result && (
        <>
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 style={{ margin: 0 }}>{result.symbol} <span style={{ ...muted, fontWeight: 400 }}>{exchange}</span></h3>
                <div style={muted}>
                  {result.context.industry ?? (result.context.inNifty500 ? '' : 'Outside the NIFTY 500')}
                  {' · '}₹{result.lastClose.toLocaleString('en-IN')} on {result.asOf}
                  {' · '}{source === 'broker' ? 'live from Kite' : 'stored prices'}
                </div>
                {result.context.inMomentumBook && (
                  <div style={{ marginTop: 6, color: '#34d399', fontSize: '0.9em' }}>In this month&apos;s top 20 momentum ranking (Monthly Plan).</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 14 }}>
                {counts.map(([s, n]) => (
                  <div key={s} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5em', fontWeight: 700, color: SEVERITY[s].color }}>{n}</div>
                    <div style={muted}>{SEVERITY[s].label}{n === 1 ? '' : 's'}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={card}>
            <h3 style={{ marginTop: 0 }}>The facts</h3>
            {result.checks.map(c => (
              <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 12 }}>
                <div aria-hidden style={{ fontSize: '1.2em' }}>{SEVERITY[c.severity].icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: SEVERITY[c.severity].color }}>
                    <span className="sr-only">{SEVERITY[c.severity].label}: </span>{c.title}
                  </div>
                  <div style={{ fontSize: '0.9em', marginTop: 2 }}>{c.detail}</div>
                </div>
                <div style={{ ...muted, whiteSpace: 'nowrap', fontSize: '0.75em', alignSelf: 'center' }}>{EVIDENCE[c.evidence]}</div>
              </div>
            ))}
            <p style={{ ...muted, marginBottom: 0 }}>
              Strong: volatility and trading volume persist, so they reliably describe risk. Moderate: documented effects that
              have been weak in India recently. Weak: popular rules our own tests could not confirm.
            </p>
          </div>

          <div style={card}>
            <h3 style={{ marginTop: 0 }}>How big a position fits your risk limit</h3>
            {result.sizing.maxPositionValue !== null ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  <Stat label="You accept losing" value={inr(result.sizing.maxLossAmount)} note={`${result.sizing.maxLossPct}% of ${inr(result.sizing.capital)}`} />
                  <Stat label="Stop-loss distance" value={`${result.sizing.suggestedStopPct!.toFixed(1)}% below entry`} note="about 2x this stock's normal 2-week swing" />
                  <Stat label="Largest position with that stop" value={inr(result.sizing.maxPositionValue)} note={`${result.sizing.maxPositionPctOfCapital!.toFixed(0)}% of your capital`} />
                  <Stat label="If you won't use a stop" value={inr(result.sizing.noStopPositionValue!)} note={`a normal month moves it about ${result.sizing.typicalMonthMovePct!.toFixed(0)}%`} />
                </div>
                <p style={muted}>
                  Buying more than this means a normal adverse move costs more than you chose to risk.
                  {result.sizing.suggestedStopPct! >= 15 && ' The stop is wide because this stock swings a lot; that is why the position is small.'}
                </p>
              </>
            ) : (
              <p style={muted}>Not enough history to estimate volatility, so no size can be suggested. Treat it as high risk.</p>
            )}
          </div>

          <p style={{ ...muted, textAlign: 'center' }}>
            Not a buy or sell recommendation. Check the company&apos;s news and results yourself; this card only covers price behaviour.
          </p>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 12 }}>
      <div style={muted}>{label}</div>
      <div style={{ fontSize: '1.2em', fontWeight: 700, marginTop: 4 }}>{value}</div>
      <div style={{ ...muted, fontSize: '0.8em', marginTop: 2 }}>{note}</div>
    </div>
  )
}
