'use client'

/**
 * Screener: every NIFTY 100 or NIFTY 500 stock with its price facts and its
 * rank today in each Monthly Plan mode. A way to look through the market,
 * not a list of calls: the page says which columns passed testing.
 */

import React, { useEffect, useMemo, useState } from 'react'
import type { Screen, ScreenRow } from '@/lib/screener/service'
import { MODES, type RiskMode } from '@/lib/portfolio/config'

const MODE_IDS = Object.keys(MODES) as RiskMode[]
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 20, marginBottom: 16,
}
const muted: React.CSSProperties = { opacity: 0.7, fontSize: '0.9em' }
const th: React.CSSProperties = {
  textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.15)', fontWeight: 600, fontSize: '0.85em',
  opacity: 0.85, cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none',
}
const td: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.9em', whiteSpace: 'nowrap' }
const chip = (on: boolean): React.CSSProperties => ({
  padding: '6px 14px', borderRadius: 20, cursor: 'pointer', color: '#fff', fontSize: '0.9em',
  border: on ? '1px solid #60a5fa' : '1px solid rgba(255,255,255,0.15)', background: on ? '#2563eb' : 'transparent',
})
const input: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.25)', color: '#fff',
}
const gain = (n: number | null): React.CSSProperties => ({ color: n == null ? undefined : n > 0 ? '#34d399' : n < 0 ? '#f87171' : undefined })
const signed = (n: number | null, d = 1) => (n == null ? '' : `${n >= 0 ? '+' : ''}${n.toFixed(d)}%`)

const FILTERS: Array<{ id: string; label: string; test: (r: ScreenRow) => boolean }> = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'up', label: 'In an uptrend', test: r => r.trend === 'up' },
  { id: 'down', label: 'In a downtrend', test: r => r.trend === 'down' },
  { id: 'high', label: 'Within 5% of 52-week high', test: r => r.belowHighPct != null && r.belowHighPct <= 5 },
  { id: 'weekUp', label: 'Up 5% or more this week', test: r => (r.weekPct ?? 0) >= 5 },
  { id: 'weekDown', label: 'Down 5% or more this week', test: r => (r.weekPct ?? 0) <= -5 },
  { id: 'busy', label: 'Trading at twice the usual', test: r => (r.volumeRatio ?? 0) >= 2 },
  ...MODE_IDS.map(m => ({ id: `top-${m}`, label: `Top 50 in ${MODES[m].label}`, test: (r: ScreenRow) => (r.ranks[m] ?? Infinity) <= 50 })),
]

const TREND_WORDS = { up: 'Up', mixed: 'Mixed', down: 'Down' } as const
const TREND_COLOR = { up: '#34d399', mixed: '#fbbf24', down: '#f87171' } as const

type SortKey = 'symbol' | 'close' | 'dayPct' | 'weekPct' | 'monthPct' | 'momentumPct' | 'volatilityPct' | 'belowHighPct' | 'vs200Pct' | 'volumeRatio' | 'deliveryPct' | RiskMode
const COLUMNS: Array<{ key: SortKey; label: string; hint: string }> = [
  { key: 'symbol', label: 'Stock', hint: 'NSE symbol and sector' },
  { key: 'close', label: 'Close', hint: 'Last closing price' },
  { key: 'dayPct', label: 'Day', hint: 'Change on the last session' },
  { key: 'weekPct', label: 'Week', hint: 'Change over 5 sessions' },
  { key: 'monthPct', label: 'Month', hint: 'Change over 21 sessions' },
  { key: 'momentumPct', label: '12-1m', hint: '12-month return, skipping the latest month' },
  { key: 'volatilityPct', label: 'Volatility', hint: 'How much the price swings in a year' },
  { key: 'belowHighPct', label: 'Below high', hint: 'How far below the highest close of the last year' },
  { key: 'vs200Pct', label: 'Trend', hint: 'Up: above the 50-day and 200-day averages. Down: below both. The number is the distance from the 200-day average' },
  { key: 'volumeRatio', label: 'Volume', hint: 'Rupees traded today against the 20-day average' },
  { key: 'deliveryPct', label: 'Delivery', hint: 'Share of today\'s volume taken into delivery' },
  ...MODE_IDS.map(m => ({ key: m as SortKey, label: MODES[m].label, hint: `Rank today in ${MODES[m].label} mode, 1 is best` })),
]

const valueOf = (r: ScreenRow, key: SortKey): number | string | null =>
  key === 'symbol' ? r.symbol : (MODE_IDS as string[]).includes(key) ? r.ranks[key as RiskMode] ?? null : (r[key as keyof ScreenRow] as number | null)

const PAGE = 100

export default function ScreenerTab() {
  const [screen, setScreen] = useState<Screen | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [index, setIndex] = useState<'NIFTY100' | 'NIFTY500'>('NIFTY100')
  const [filter, setFilter] = useState('all')
  const [sector, setSector] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; down: boolean }>({ key: 'weekPct', down: true })
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    fetch('/api/screener')
      .then(async res => {
        if (res.status === 401) { window.location.href = '/login'; return }
        const json = await res.json()
        if (!json.success) throw new Error(json.error || 'Could not load the screen')
        setScreen(json.screen)
      })
      .catch(e => setError(e.message))
  }, [])

  const inIndex = useMemo(() => (screen?.rows ?? []).filter(r => index === 'NIFTY500' || r.nifty100), [screen, index])
  const sectors = useMemo(() => [...new Set(inIndex.map(r => r.sector).filter(Boolean))].sort(), [inIndex])
  const rows = useMemo(() => {
    const test = FILTERS.find(f => f.id === filter)!.test
    const q = search.trim().toUpperCase()
    const list = inIndex.filter(r => test(r) && (!sector || r.sector === sector) && (!q || r.symbol.includes(q)))
    return list.sort((a, b) => {
      const x = valueOf(a, sort.key), y = valueOf(b, sort.key)
      // Stocks with no value always go last
      if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1
      const order = typeof x === 'string' ? x.localeCompare(y as string) : x - (y as number)
      return sort.down ? -order : order
    })
  }, [inIndex, filter, sector, search, sort])

  // Names sort A to Z and ranks best first; everything else starts with the largest
  const sortBy = (key: SortKey) =>
    setSort(s => (s.key === key ? { key, down: !s.down } : { key, down: key !== 'symbol' && !(MODE_IDS as string[]).includes(key) }))

  const shown = showAll ? rows : rows.slice(0, PAGE)
  return (
    <div>
      <div style={card}>
        <h2 style={{ margin: '0 0 6px' }}>🔎 Screener</h2>
        <p style={{ ...muted, margin: 0 }}>
          Every stock in the index, from last night&apos;s NSE data{screen ? ` (${screen.asOf})` : ''}. Use it to look through the market.
          It does not tell you what to buy.
        </p>
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: 'pointer', ...muted }}>What has been tested and what has not</summary>
          <p style={{ ...muted, marginBottom: 0 }}>
            The last three columns are each stock&apos;s rank today in the Monthly Plan&apos;s modes{screen ? `, out of ${screen.ranked}` : ''}. Those
            rankings were backtested over 15 years, for holding a month or longer. The other columns are plain facts about the price.
            We tested trading on them over 3 to 7 days (dips, breakouts, new highs, heavy volume) and none of them made money after
            costs, so treat them as information. Company financials are not here yet.
          </p>
        </details>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14, alignItems: 'center' }}>
          {(['NIFTY100', 'NIFTY500'] as const).map(i => (
            <button key={i} aria-pressed={index === i} style={{ ...chip(index === i), fontWeight: 700 }} onClick={() => { setIndex(i); setSector(''); setShowAll(false) }}>
              {i === 'NIFTY100' ? 'NIFTY 100' : 'NIFTY 500'}
            </button>
          ))}
          <input style={{ ...input, width: 150 }} placeholder="Find a symbol" value={search} onChange={e => setSearch(e.target.value)} aria-label="Find a symbol" />
          <select style={input} value={sector} onChange={e => setSector(e.target.value)} aria-label="Sector">
            <option value="">All sectors</option>
            {sectors.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {FILTERS.map(f => (
            <button key={f.id} aria-pressed={filter === f.id} style={chip(filter === f.id)} onClick={() => { setFilter(f.id); setShowAll(false) }}>{f.label}</button>
          ))}
        </div>
      </div>

      {error && <div style={{ ...card, borderColor: '#ef4444', color: '#fca5a5' }}>⚠️ {error}</div>}
      {!screen && !error && <div style={card}>Loading the screen…</div>}

      {screen && (
        <div style={card}>
          <div style={muted}>
            {rows.length} of {inIndex.length} stocks. Click a column heading to sort.
          </div>
          <div style={{ overflowX: 'auto', marginTop: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {COLUMNS.map(c => (
                    <th key={c.key} style={th} title={c.hint} onClick={() => sortBy(c.key)} aria-sort={sort.key === c.key ? (sort.down ? 'descending' : 'ascending') : undefined}>
                      {c.label}{sort.key === c.key ? (sort.down ? ' ▼' : ' ▲') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map(r => (
                  <tr key={r.symbol}>
                    <td style={td}><span style={{ fontWeight: 600 }}>{r.symbol}</span><div style={{ ...muted, fontSize: '0.8em' }}>{r.sector}</div></td>
                    <td style={td}>{r.close.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                    <td style={{ ...td, ...gain(r.dayPct) }}>{signed(r.dayPct, 2)}</td>
                    <td style={{ ...td, ...gain(r.weekPct) }}>{signed(r.weekPct)}</td>
                    <td style={{ ...td, ...gain(r.monthPct) }}>{signed(r.monthPct)}</td>
                    <td style={{ ...td, ...gain(r.momentumPct) }}>{signed(r.momentumPct, 0)}</td>
                    <td style={td}>{r.volatilityPct == null ? '' : `${r.volatilityPct.toFixed(0)}%`}</td>
                    <td style={td}>{r.belowHighPct == null ? '' : r.belowHighPct < 0.05 ? 'At high' : `${r.belowHighPct.toFixed(1)}%`}</td>
                    <td style={td}>
                      {r.trend && <span style={{ color: TREND_COLOR[r.trend], fontWeight: 600 }}>{TREND_WORDS[r.trend]}</span>}
                      {r.vs200Pct != null && <span style={muted}> {signed(r.vs200Pct, 0)}</span>}
                    </td>
                    <td style={{ ...td, fontWeight: (r.volumeRatio ?? 0) >= 2 ? 700 : undefined }}>{r.volumeRatio == null ? '' : `${r.volumeRatio.toFixed(1)}x`}</td>
                    <td style={td}>{r.deliveryPct == null ? '' : `${r.deliveryPct.toFixed(0)}%`}</td>
                    {MODE_IDS.map(m => {
                      const rank = r.ranks[m]
                      return <td key={m} style={{ ...td, fontWeight: rank && rank <= 20 ? 700 : undefined, color: rank && rank <= 20 ? '#34d399' : undefined, opacity: rank ? 1 : 0.5 }}>{rank ?? 'n/a'}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && <p style={muted}>No stock matches.</p>}
          {rows.length > PAGE && !showAll && (
            <button style={{ ...chip(false), marginTop: 12 }} onClick={() => setShowAll(true)}>Show all {rows.length}</button>
          )}
        </div>
      )}
    </div>
  )
}
