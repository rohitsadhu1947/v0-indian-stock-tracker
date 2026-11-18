'use client'

/**
 * Morning brief: the last session's market, sectors and movers, the user's
 * paper book, and material company filings since the close. Written from
 * our own data. It reports what happened; it does not say what to do.
 */

import React, { useEffect, useState } from 'react'
import type { Brief, Mover } from '@/lib/brief/core'
import { CATEGORY_LABEL, type FilingCategory } from '@/lib/filings/categories'

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 20, marginBottom: 16,
}
const muted: React.CSSProperties = { opacity: 0.7, fontSize: '0.9em' }
const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.15)', fontWeight: 600, fontSize: '0.85em', opacity: 0.8 }
const td: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.9em' }
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }
const gain = (n: number | null): React.CSSProperties => ({ color: n == null ? undefined : n > 0 ? '#34d399' : n < 0 ? '#f87171' : undefined })
const signed = (n: number | null, d = 1) => (n == null ? '' : `${n >= 0 ? '+' : ''}${n.toFixed(d)}%`)
const num = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 })
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })

function Movers({ title, rows, extra }: { title: string; rows: Mover[]; extra?: (m: Mover) => React.ReactNode }) {
  return (
    <div style={card}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {rows.length === 0 ? <p style={muted}>None.</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Stock</th><th style={th}>Close</th><th style={th}>Day</th><th style={th}>Week</th>{extra && <th style={th}>Volume</th>}</tr></thead>
          <tbody>
            {rows.map(m => (
              <tr key={m.symbol}>
                <td style={td}><span style={{ fontWeight: 600 }}>{m.symbol}</span><div style={{ ...muted, fontSize: '0.8em' }}>{m.sector}</div></td>
                <td style={td}>{num(m.close)}</td>
                <td style={{ ...td, ...gain(m.dayPct) }}>{signed(m.dayPct, 2)}</td>
                <td style={{ ...td, ...gain(m.weekPct) }}>{signed(m.weekPct)}</td>
                {extra && <td style={td}>{extra(m)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default function MorningBriefTab() {
  const [brief, setBrief] = useState<Brief | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/brief')
      .then(async res => {
        if (res.status === 401) { window.location.href = '/login'; return }
        const json = await res.json()
        if (!json.success) throw new Error(json.error || 'Could not load the brief')
        setBrief(json.brief)
      })
      .catch(e => setError(e.message))
  }, [])

  if (error) return <div style={{ ...card, borderColor: '#ef4444', color: '#fca5a5' }}>⚠️ {error}</div>
  if (!brief) return <div style={card}>Writing the brief…</div>

  const b = brief.breadth
  return (
    <div>
      <div style={card}>
        <h2 style={{ margin: '0 0 6px' }}>🌅 Morning brief</h2>
        <p style={{ ...muted, margin: '0 0 12px' }}>
          The market on {brief.asOf} and company filings since that close, from NSE data. It reports what happened. It does not say what to buy or sell.
        </p>
        {brief.summary.map(line => <p key={line} style={{ margin: '6px 0', fontSize: '1.05em' }}>{line}</p>)}
        <p style={{ ...muted, marginBottom: 0 }}>
          Not covered yet: overnight US and Asian markets, crude, the rupee, FII and DII flows, and broker ratings.
        </p>
      </div>

      <div style={grid}>
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Indices</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Index</th><th style={th}>Close</th><th style={th}>Day</th><th style={th}>Week</th></tr></thead>
            <tbody>
              {brief.indices.map(i => (
                <tr key={i.name}>
                  <td style={{ ...td, fontWeight: 600 }}>{i.name}</td>
                  <td style={td}>{num(i.close)}</td>
                  <td style={{ ...td, ...gain(i.dayPct) }}>{signed(i.dayPct, 2)}</td>
                  <td style={{ ...td, ...gain(i.weekPct) }}>{signed(i.weekPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Breadth of NIFTY 500</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr><td style={td}>Rose</td><td style={{ ...td, color: '#34d399' }}>{b.rose}</td></tr>
              <tr><td style={td}>Fell</td><td style={{ ...td, color: '#f87171' }}>{b.fell}</td></tr>
              <tr><td style={td}>Above both the 50-day and 200-day averages</td><td style={td}>{b.uptrend}</td></tr>
              <tr><td style={td}>Below both</td><td style={td}>{b.downtrend}</td></tr>
              <tr><td style={td}>Closed at a 52-week high</td><td style={td}>{b.atHigh}</td></tr>
              <tr><td style={td}>Traded three times the usual or more</td><td style={td}>{b.heavyVolume}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {brief.book.length > 0 && <Movers title="Your paper book (its NIFTY 500 stocks), biggest moves first" rows={brief.book} />}

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Company filings since the close</h3>
        {!brief.filingsAvailable ? (
          <p style={{ ...muted, marginBottom: 0 }}>Filings are not reaching the app yet. The filings table has to be added to the database and the collector has to be running.</p>
        ) : brief.filings.length === 0 ? (
          <p style={{ ...muted, marginBottom: 0 }}>No material filing from the 500 most traded stocks since the close. This list only fills while the collector is running.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Time</th><th style={th}>Stock</th><th style={th}>Kind</th><th style={th}>What was filed</th></tr></thead>
              <tbody>
                {brief.filings.map(f => (
                  <tr key={f.url + f.publishedAt} style={{ background: f.held ? 'rgba(96,165,250,0.12)' : undefined }}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{when(f.publishedAt)}</td>
                    <td style={{ ...td, fontWeight: 600, whiteSpace: 'nowrap' }}>{f.symbol}{f.held && <span style={{ ...muted, fontWeight: 400 }}> (held)</span>}</td>
                    <td style={td}>{CATEGORY_LABEL[f.category as FilingCategory] ?? f.category}</td>
                    <td style={td}>{f.text.slice(0, 260)} <a href={f.url} target="_blank" rel="noreferrer" style={{ color: '#60a5fa' }}>Open</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Sectors</h3>
        <p style={muted}>Average move of each sector&apos;s NIFTY 500 stocks, strongest first.</p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Sector</th><th style={th}>Day</th><th style={th}>Week</th><th style={th}>Stocks that rose</th></tr></thead>
            <tbody>
              {brief.sectors.map(s => (
                <tr key={s.sector}>
                  <td style={{ ...td, fontWeight: 600 }}>{s.sector}</td>
                  <td style={{ ...td, ...gain(s.dayPct) }}>{signed(s.dayPct, 2)}</td>
                  <td style={{ ...td, ...gain(s.weekPct) }}>{signed(s.weekPct)}</td>
                  <td style={td}>{s.rising} of {s.stocks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={grid}>
        <Movers title="Biggest gains" rows={brief.gainers} />
        <Movers title="Biggest falls" rows={brief.losers} />
      </div>

      <Movers
        title="Unusually heavy trading"
        rows={brief.heavyVolume}
        extra={m => `${(m as Mover & { volumeRatio: number }).volumeRatio.toFixed(1)}x usual`}
      />

      {brief.atHigh.length > 0 && (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Closed at a 52-week high ({brief.atHigh.length})</h3>
          <p style={{ marginBottom: 0 }}>{brief.atHigh.join(', ')}</p>
        </div>
      )}
    </div>
  )
}
