'use client'

/**
 * Day-trade watch: two F&O day-trade signals tracked every evening without
 * placing orders, so their live results can be compared with the backtest.
 */

import React, { useEffect, useMemo, useState } from 'react'
import type { FoWatchView, PaperTradeRow } from '@/lib/fo-watch/service'
import type { WatchSignal } from '@/lib/fo-watch/core'

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 20, marginBottom: 16,
}
const muted: React.CSSProperties = { opacity: 0.7, fontSize: '0.9em' }
const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.15)', fontWeight: 600, fontSize: '0.85em', opacity: 0.85, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.9em', whiteSpace: 'nowrap' }
const gain = (n: number | null | undefined): React.CSSProperties => ({ color: n == null ? undefined : n > 0 ? '#34d399' : n < 0 ? '#f87171' : undefined })
const signed = (n: number | null | undefined, d = 2) => (n == null ? '' : `${n >= 0 ? '+' : ''}${n.toFixed(d)}%`)
const day = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const price = (n: number | null) => (n == null ? '' : n.toLocaleString('en-IN', { maximumFractionDigits: 2 }))

const STATUS: Record<string, string> = { pending: 'Waiting for prices', 'no-data': 'No prices' }

function reason(t: PaperTradeRow): string {
  if (t.signal === 'ban-entry') return 'New on the ban list'
  return t.detail.callRatio ? `Calls ${t.detail.callRatio}x usual, puts ${t.detail.putRatio}x` : 'Call volume spike'
}

export default function FoWatchTab() {
  const [view, setView] = useState<FoWatchView | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/fo-watch')
      .then(async res => {
        if (res.status === 401) { window.location.href = '/login'; return }
        const json = await res.json()
        if (!json.success) throw new Error(json.error || 'Could not load the paper trades')
        setView(json.view)
      })
      .catch(e => setError(e.message))
  }, [])

  const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
  const upcoming = useMemo(() => (view?.trades ?? []).filter(t => t.status === 'pending' && t.tradeDate >= today), [view, today])
  const past = useMemo(() => (view?.trades ?? []).filter(t => !(t.status === 'pending' && t.tradeDate >= today)), [view, today])
  const waiting = past.filter(t => t.status === 'pending').length

  return (
    <div>
      <div style={card}>
        <h2 style={{ margin: '0 0 6px' }}>📝 Day-trade watch</h2>
        <p style={{ ...muted, margin: 0 }}>
          Two day-trade signals from F&amp;O data, tracked on paper. The app places no orders. Each evening it lists the stocks that fire a
          signal. The paper trade sells short at 09:20 the next session and buys back at 15:15, or earlier at a 3% stop. Results are after
          costs of 0.31% a trade.
        </p>
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: 'pointer', ...muted }}>Why this is on paper only</summary>
          <p style={{ ...muted, marginBottom: 0 }}>
            Over 2015 to 2026 both signals made money after costs in a backtest. Both have been weak lately: the ban list signal lost money
            in 2025 and 2026, and the call volume signal has been flat since 2023. This page records what they do from here, so the
            decision to trade them or drop them rests on live results. A result needs your Zerodha login on or after the trade date, because
            the minute prices come from there.
          </p>
        </details>
      </div>

      {error && <div style={{ ...card, borderColor: '#ef4444', color: '#fca5a5' }}>⚠️ {error}</div>}
      {!view && !error && <div style={card}>Loading the paper trades…</div>}

      {view && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            {(Object.keys(view.tallies) as WatchSignal[]).map(signal => {
              const t = view.tallies[signal]
              return (
                <div key={signal} style={card}>
                  <div style={{ fontWeight: 700 }}>{t.label}</div>
                  <div style={{ fontSize: '1.6em', fontWeight: 700, margin: '6px 0', ...gain(t.trades ? t.avgNetPct : null) }}>
                    {t.trades ? signed(t.avgNetPct) : 'No trades yet'}
                  </div>
                  <div style={muted}>
                    {t.trades ? `Average of ${t.trades} paper ${t.trades === 1 ? 'trade' : 'trades'}, ${t.wins} made money. Sum of all: ${signed(t.totalNetPct)}.` : 'The average shows once a trade is priced.'}
                  </div>
                  <div style={{ ...muted, marginTop: 6 }}>Backtest average: {signed(t.backtestNetPct)} a trade. {t.backtestNote}</div>
                </div>
              )
            })}
          </div>

          <div style={card}>
            <h3 style={{ margin: '0 0 8px' }}>Next session</h3>
            {upcoming.length === 0
              ? <p style={{ ...muted, margin: 0 }}>No signals for the next session. Most days have none.</p>
              : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>Trade date</th><th style={th}>Stock</th><th style={th}>Why</th></tr></thead>
                  <tbody>
                    {upcoming.map(t => <tr key={t.id}><td style={td}>{day(t.tradeDate)}</td><td style={{ ...td, fontWeight: 600 }}>{t.symbol}</td><td style={td}>{reason(t)}</td></tr>)}
                  </tbody>
                </table>
              )}
          </div>

          <div style={card}>
            <h3 style={{ margin: '0 0 4px' }}>Past paper trades</h3>
            <div style={muted}>
              {past.length ? `${past.length} since ${day(view.since!)}.` : 'None yet.'}
              {waiting > 0 && ` ${waiting} waiting for prices: connect Zerodha and they fill in at the next evening update.`}
            </div>
            {past.length > 0 && (
              <div style={{ overflowX: 'auto', marginTop: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>{['Trade date', 'Stock', 'Why', 'Sold at 09:20', 'Bought back', 'Before costs', 'After costs'].map(h => <th key={h} style={th}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {past.map(t => (
                      <tr key={t.id}>
                        <td style={td}>{day(t.tradeDate)}</td>
                        <td style={{ ...td, fontWeight: 600 }}>{t.symbol}</td>
                        <td style={td}>{reason(t)}</td>
                        {t.status === 'done' ? (
                          <>
                            <td style={td}>{price(t.entryPrice)}</td>
                            <td style={td}>{price(t.exitPrice)}{t.stopped && <span style={muted}> at the stop</span>}</td>
                            <td style={{ ...td, ...gain(t.grossPct) }}>{signed(t.grossPct)}</td>
                            <td style={{ ...td, fontWeight: 600, ...gain(t.netPct) }}>{signed(t.netPct)}</td>
                          </>
                        ) : <td style={{ ...td, opacity: 0.6 }} colSpan={4}>{STATUS[t.status] ?? t.status}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
