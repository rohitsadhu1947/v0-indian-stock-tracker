'use client'

/**
 * Monthly Plan: the portfolio engine's landing screen.
 *
 * Shows the market regime, the allocation for the chosen risk mode, this
 * month's stock-momentum ranking and the exact buy/sell orders for the paper
 * books, and tracks their value against NIFTY 50.
 */

import React, { useCallback, useEffect, useState } from 'react'
import type { MonthlyPlan } from '@/lib/portfolio/service'

type Mode = 'aggressive' | 'balanced' | 'defensive'

const MODE_KEY = 'monthlyPlan.mode'
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
const pct = (n: number, d = 1) => `${n >= 0 ? '+' : ''}${n.toFixed(d)}%`

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  padding: 20,
  marginBottom: 16,
}
const muted: React.CSSProperties = { opacity: 0.7, fontSize: '0.9em' }
const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.15)', fontWeight: 600, fontSize: '0.85em', opacity: 0.8 }
const td: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.9em' }

interface Performance {
  books: Record<string, { startingCapital: number; points: Array<{ date: string; value: number; type: string }> }>
  benchmark: Array<{ date: string; value: number }>
}

export default function MonthlyPlanTab() {
  const [mode, setMode] = useState<Mode>('balanced')
  const [plan, setPlan] = useState<MonthlyPlan | null>(null)
  const [perf, setPerf] = useState<Performance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(MODE_KEY)
      if (saved === 'aggressive' || saved === 'balanced' || saved === 'defensive') setMode(saved)
    } catch { /* storage unavailable */ }
  }, [])

  const load = useCallback(async (m: Mode) => {
    setLoading(true)
    setError(null)
    try {
      const [planRes, perfRes] = await Promise.all([
        fetch(`/api/model-portfolio/plan?mode=${m}`),
        fetch('/api/model-portfolio/performance'),
      ])
      if (planRes.status === 401) { window.location.href = '/login'; return }
      const planJson = await planRes.json()
      if (!planJson.success) throw new Error(planJson.details || planJson.error || 'Failed to build plan')
      setPlan(planJson.plan)
      const perfJson = await perfRes.json()
      if (perfJson.success) setPerf(perfJson)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(mode) }, [mode, load])

  const chooseMode = (m: Mode) => {
    setMode(m)
    try { localStorage.setItem(MODE_KEY, m) } catch { /* ignore */ }
  }

  const rebalance = async (kind: 'core' | 'satellite') => {
    if (!plan) return
    const book = plan[kind]
    const ok = window.confirm(
      `Record a paper rebalance of the ${kind === 'satellite' ? 'stock momentum' : 'core'} book?\n\n` +
      `${book.plan.orders.length} orders at ${book.priceSource} prices, with slippage and charges.\n` +
      `No real orders are placed.`
    )
    if (!ok) return
    setBusy(kind)
    setMessage(null)
    try {
      const res = await fetch('/api/model-portfolio/rebalance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, mode }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Rebalance failed')
      setMessage(`Paper rebalance recorded: ${json.fills.length} fills, book value ${inr(json.value)}.`)
      await load(mode)
    } catch (e: any) {
      setMessage(`Not rebalanced: ${e.message}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <div style={card}>
        <h2 style={{ margin: '0 0 6px' }}>🧭 Monthly Plan</h2>
        <p style={{ ...muted, margin: 0 }}>
          A monthly-rebalanced factor portfolio: momentum and low volatility, with an optional market trend filter.
          Tested on NSE factor index history (Jun 2013 to Sep 2026). Books here are paper; no real orders are placed.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
          {(['aggressive', 'balanced', 'defensive'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => chooseMode(m)}
              aria-pressed={mode === m}
              style={{
                flex: '1 1 180px',
                padding: 12,
                borderRadius: 10,
                cursor: 'pointer',
                textAlign: 'left',
                color: '#fff',
                border: mode === m ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.15)',
                background: mode === m ? 'rgba(96,165,250,0.15)' : 'rgba(0,0,0,0.2)',
              }}
            >
              <div style={{ fontWeight: 700, textTransform: 'capitalize' }}>{m}</div>
              {plan && plan.mode === m && (
                <div style={{ fontSize: '0.8em', marginTop: 4, opacity: 0.85 }}>
                  {plan.modeInfo.description}
                </div>
              )}
            </button>
          ))}
        </div>

        {plan && (
          <p style={{ ...muted, marginBottom: 0, marginTop: 12 }}>
            Historical reference for {plan.modeInfo.label}: {plan.modeInfo.reference.cagrPct}% a year,
            worst fall {plan.modeInfo.reference.maxDrawdownPct}% (price return, before tax). Past results do not guarantee future ones.
          </p>
        )}
      </div>

      {loading && <div style={card}>Building this month&apos;s plan…</div>}
      {error && <div style={{ ...card, borderColor: '#ef4444', color: '#fca5a5' }}>⚠️ {error}</div>}
      {message && <div style={{ ...card, borderColor: '#60a5fa' }}>{message}</div>}

      {plan && !loading && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            <div style={card}>
              <div style={muted}>Market trend (NIFTY 200 vs 200-day average)</div>
              {plan.regime ? (
                <>
                  <div style={{ fontSize: '1.4em', fontWeight: 700, marginTop: 6, color: plan.regime.invested ? '#34d399' : '#f87171' }}>
                    {plan.regime.invested ? 'Uptrend' : 'Downtrend'} ({pct(plan.regime.distancePct)})
                  </div>
                  <div style={muted}>
                    {Math.round(plan.regime.close).toLocaleString('en-IN')} vs {Math.round(plan.regime.sma200).toLocaleString('en-IN')} on {plan.regime.asOf}
                  </div>
                </>
              ) : <div>Not enough index history.</div>}
            </div>

            <div style={card}>
              <div style={muted}>Allocation this month</div>
              <div style={{ fontSize: '1.1em', fontWeight: 700, marginTop: 6 }}>
                Momentum {Math.round(plan.allocation.momentum * 100)}% · Low-vol {Math.round(plan.allocation.lowvol * 100)}% · Cash {Math.round(plan.allocation.cash * 100)}%
              </div>
              <div style={muted}>{plan.allocation.reason}</div>
            </div>

            <div style={{ ...card, borderColor: plan.freshness.ok ? 'rgba(255,255,255,0.1)' : '#f59e0b' }}>
              <div style={muted}>Price data</div>
              <div style={{ fontWeight: 700, marginTop: 6, color: plan.freshness.ok ? '#34d399' : '#fbbf24' }}>
                {plan.freshness.ok ? 'Current' : 'Stale'}
              </div>
              <div style={muted}>{plan.freshness.message}</div>
            </div>
          </div>

          <BookSection
            title="Stock momentum book (paper)"
            subtitle={`Top ${plan.satellite.ranking.filter(r => r.selected).length} NIFTY 500 stocks by risk-adjusted 12-month momentum, equal weight, rebalanced monthly.`}
            book={plan.satellite}
            busy={busy === 'satellite'}
            onRebalance={() => rebalance('satellite')}
          />

          <div style={card}>
            <h3 style={{ marginTop: 0 }}>This month&apos;s ranking</h3>
            <p style={muted}>
              Score = 12-month return (skipping the latest month) divided by volatility. Stocks trading under ₹10 Cr a day are excluded
              ({plan.satellite.excluded.illiquid} this month; {plan.satellite.excluded.shortHistory} have under a year of history).
              {plan.satellite.skippedUnaffordable.length > 0 &&
                ` Skipped because one share exceeds the per-position budget: ${plan.satellite.skippedUnaffordable.join(', ')}.`}
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>#</th><th style={th}>Stock</th><th style={th}>Industry</th>
                    <th style={th}>12-1m return</th><th style={th}>Volatility</th><th style={th}>Score</th>
                    <th style={th}>Traded/day</th><th style={th}>Last close</th><th style={th}>In book</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.satellite.ranking.map(r => (
                    <tr key={r.symbol} style={{ opacity: r.selected ? 1 : 0.55 }}>
                      <td style={td}>{r.rank}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{r.symbol}</td>
                      <td style={td}>{r.industry}</td>
                      <td style={{ ...td, color: r.momentumPct >= 0 ? '#34d399' : '#f87171' }}>{pct(r.momentumPct)}</td>
                      <td style={td}>{r.volatilityPct.toFixed(0)}%</td>
                      <td style={td}>{r.score.toFixed(2)}</td>
                      <td style={td}>₹{r.tradedValueCr.toFixed(0)} Cr</td>
                      <td style={td}>{r.lastClose.toLocaleString('en-IN')}</td>
                      <td style={td}>{r.selected ? '✓' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <BookSection
            title="Core book: factor index funds (paper)"
            subtitle="Momentum and low-volatility index funds in the proportions above."
            book={plan.core}
            busy={busy === 'core'}
            onRebalance={() => rebalance('core')}
          />

          <PerformanceCard perf={perf} />
        </>
      )}
    </div>
  )
}

function BookSection(props: {
  title: string
  subtitle: string
  book: MonthlyPlan['core']
  busy: boolean
  onRebalance: () => void
}) {
  const { book } = props
  const holdings = Object.entries(book.state.holdings)
  const ret = ((book.value - book.startingCapital) / book.startingCapital) * 100
  const canRebalance = book.rebalance.due && book.plan.orders.length > 0 && book.plan.missingPrices.length === 0

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ margin: 0 }}>{props.title}</h3>
          <p style={{ ...muted, margin: '4px 0 0' }}>{props.subtitle}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '1.3em', fontWeight: 700 }}>{inr(book.value)}</div>
          <div style={muted}>
            {book.exists ? <>since start {pct(ret)} · {holdings.length} holdings</> : 'not started: first rebalance creates it'}
          </div>
        </div>
      </div>

      {book.notes.map(n => <p key={n} style={{ ...muted, color: '#fbbf24' }}>{n}</p>)}

      <p style={muted}>
        {book.rebalance.reason}
        {book.plan.orders.length > 0 && <> {book.plan.orders.length} orders at {book.priceSource} prices, estimated costs {inr(book.plan.estimatedCosts)}.</>}
      </p>

      {book.plan.orders.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr><th style={th}>Action</th><th style={th}>Stock</th><th style={th}>Qty</th><th style={th}>Price</th><th style={th}>Value</th><th style={th}>Why</th></tr>
            </thead>
            <tbody>
              {book.plan.orders.map(o => (
                <tr key={o.side + o.symbol}>
                  <td style={{ ...td, color: o.side === 'BUY' ? '#34d399' : '#f87171', fontWeight: 700 }}>{o.side}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{o.symbol}</td>
                  <td style={td}>{o.qty}</td>
                  <td style={td}>{o.price.toLocaleString('en-IN')}</td>
                  <td style={td}>{inr(o.value)}</td>
                  <td style={td}>{o.reason === 'exit' ? 'dropped out of top list' : o.reason === 'entry' ? 'new in top list' : 'resize to target'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        onClick={props.onRebalance}
        disabled={!canRebalance || props.busy}
        style={{
          marginTop: 14, padding: '10px 18px', borderRadius: 8, border: 'none', fontWeight: 700,
          cursor: canRebalance && !props.busy ? 'pointer' : 'not-allowed',
          background: canRebalance ? '#2563eb' : 'rgba(255,255,255,0.1)', color: '#fff',
        }}
      >
        {props.busy ? 'Recording…' : 'Record paper rebalance'}
      </button>

      {holdings.length > 0 && (
        <details style={{ marginTop: 14 }}>
          <summary style={{ cursor: 'pointer' }}>Current holdings ({holdings.length})</summary>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
              <thead><tr><th style={th}>Stock</th><th style={th}>Qty</th><th style={th}>Avg price</th></tr></thead>
              <tbody>
                {holdings.map(([s, h]) => (
                  <tr key={s}><td style={td}>{s}</td><td style={td}>{h.qty}</td><td style={td}>{h.avgPrice.toFixed(2)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={muted}>Cash {inr(book.state.cash)}</div>
        </details>
      )}
    </div>
  )
}

function PerformanceCard({ perf }: { perf: Performance | null }) {
  const entries = perf ? Object.entries(perf.books) : []
  if (!perf || entries.length === 0) {
    return (
      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Paper track record</h3>
        <p style={muted}>Starts with the first paper rebalance. Values are recorded every trading day at 15:25 IST.</p>
      </div>
    )
  }

  const bench = perf.benchmark
  return (
    <div style={card}>
      <h3 style={{ marginTop: 0 }}>Paper track record</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={th}>Book</th><th style={th}>Started</th><th style={th}>Value</th><th style={th}>Return</th><th style={th}>NIFTY 50 same period</th></tr></thead>
        <tbody>
          {entries.map(([kind, b]) => {
            const first = b.points[0]
            const last = b.points[b.points.length - 1]
            if (!first || !last) return null
            const benchStart = bench.find(x => x.date >= first.date)
            const benchEnd = bench[bench.length - 1]
            const benchRet = benchStart && benchEnd && benchEnd.date > benchStart.date
              ? ((benchEnd.value - benchStart.value) / benchStart.value) * 100 : null
            return (
              <tr key={kind}>
                <td style={td}>{kind === 'satellite' ? 'Stock momentum' : 'Core funds'}</td>
                <td style={td}>{first.date}</td>
                <td style={td}>{inr(last.value)}</td>
                <td style={td}>{pct(((last.value - b.startingCapital) / b.startingCapital) * 100, 2)}</td>
                <td style={td}>{benchRet === null ? 'not enough data yet' : pct(benchRet, 2)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p style={muted}>Judge the strategy over 6-12 months, not weeks: the historical reference includes losing years.</p>
    </div>
  )
}
