'use client'

/**
 * Screener: every NIFTY 100 or NIFTY 500 stock with its price facts, its
 * rank today in each Monthly Plan mode, and its latest quarterly results.
 * A way to look through the market, not a list of calls: the page says
 * which columns passed testing.
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

type View = 'prices' | 'results'

const FILTERS: Array<{ id: string; view?: View; label: string; test: (r: ScreenRow) => boolean }> = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'up', view: 'prices', label: 'In an uptrend', test: r => r.trend === 'up' },
  { id: 'down', view: 'prices', label: 'In a downtrend', test: r => r.trend === 'down' },
  { id: 'high', view: 'prices', label: 'Within 5% of 52-week high', test: r => r.belowHighPct != null && r.belowHighPct <= 5 },
  { id: 'weekUp', view: 'prices', label: 'Up 5% or more this week', test: r => (r.weekPct ?? 0) >= 5 },
  { id: 'weekDown', view: 'prices', label: 'Down 5% or more this week', test: r => (r.weekPct ?? 0) <= -5 },
  { id: 'busy', view: 'prices', label: 'Trading at twice the usual', test: r => (r.volumeRatio ?? 0) >= 2 },
  ...MODE_IDS.map(m => ({ id: `top-${m}`, view: 'prices' as View, label: `Top 50 in ${MODES[m].label}`, test: (r: ScreenRow) => (r.ranks[m] ?? Infinity) <= 50 })),
  { id: 'grew', view: 'results', label: 'Sales and profit up 15% or more', test: r => (r.results?.salesYoyPct ?? 0) >= 15 && (r.results?.profitYoyPct ?? 0) >= 15 },
  { id: 'fell', view: 'results', label: 'Profit fell', test: r => (r.results?.profitYoyPct ?? 0) < 0 },
  { id: 'loss', view: 'results', label: 'Made a loss', test: r => (r.results?.profitCr ?? 0) < 0 },
  { id: 'cheap', view: 'results', label: 'P/E under 20', test: r => r.results?.pe != null && r.results.pe < 20 },
  { id: 'none', view: 'results', label: 'No results loaded', test: r => !r.results },
]

const TREND_WORDS = { up: 'Up', mixed: 'Mixed', down: 'Down' } as const
const TREND_COLOR = { up: '#34d399', mixed: '#fbbf24', down: '#f87171' } as const

const crore = (n: number | null | undefined) => (n == null ? '' : n.toLocaleString('en-IN', { maximumFractionDigits: 0 }))
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })

interface Column {
  key: string
  label: string
  hint: string
  /** What the column sorts on. Stocks with no value go last. */
  value: (r: ScreenRow) => number | string | null
  cell: (r: ScreenRow) => React.ReactNode
  style?: (r: ScreenRow) => React.CSSProperties
  /** Sorts smallest first on the first click: names and ranks. */
  ascending?: boolean
}

const STOCK: Column = {
  key: 'symbol', label: 'Stock', hint: 'NSE symbol and sector', ascending: true, value: r => r.symbol,
  cell: r => <><span style={{ fontWeight: 600 }}>{r.symbol}</span><div style={{ ...muted, fontSize: '0.8em' }}>{r.sector}</div></>,
}
const CLOSE: Column = {
  key: 'close', label: 'Close', hint: 'Last closing price', value: r => r.close,
  cell: r => r.close.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
}

const COLUMNS: Record<View, Column[]> = {
  prices: [
    STOCK, CLOSE,
    { key: 'dayPct', label: 'Day', hint: 'Change on the last session', value: r => r.dayPct, cell: r => signed(r.dayPct, 2), style: r => gain(r.dayPct) },
    { key: 'weekPct', label: 'Week', hint: 'Change over 5 sessions', value: r => r.weekPct, cell: r => signed(r.weekPct), style: r => gain(r.weekPct) },
    { key: 'monthPct', label: 'Month', hint: 'Change over 21 sessions', value: r => r.monthPct, cell: r => signed(r.monthPct), style: r => gain(r.monthPct) },
    { key: 'momentumPct', label: '12-1m', hint: '12-month return, skipping the latest month', value: r => r.momentumPct, cell: r => signed(r.momentumPct, 0), style: r => gain(r.momentumPct) },
    { key: 'volatilityPct', label: 'Volatility', hint: 'How much the price swings in a year', value: r => r.volatilityPct, cell: r => (r.volatilityPct == null ? '' : `${r.volatilityPct.toFixed(0)}%`) },
    {
      key: 'belowHighPct', label: 'Below high', hint: 'How far below the highest close of the last year', value: r => r.belowHighPct,
      cell: r => (r.belowHighPct == null ? '' : r.belowHighPct < 0.05 ? 'At high' : `${r.belowHighPct.toFixed(1)}%`),
    },
    {
      key: 'vs200Pct', label: 'Trend', value: r => r.vs200Pct,
      hint: 'Up: above the 50-day and 200-day averages. Down: below both. The number is the distance from the 200-day average',
      cell: r => (
        <>
          {r.trend && <span style={{ color: TREND_COLOR[r.trend], fontWeight: 600 }}>{TREND_WORDS[r.trend]}</span>}
          {r.vs200Pct != null && <span style={muted}> {signed(r.vs200Pct, 0)}</span>}
        </>
      ),
    },
    {
      key: 'volumeRatio', label: 'Volume', hint: 'Rupees traded today against the 20-day average', value: r => r.volumeRatio,
      cell: r => (r.volumeRatio == null ? '' : `${r.volumeRatio.toFixed(1)}x`), style: r => ({ fontWeight: (r.volumeRatio ?? 0) >= 2 ? 700 : undefined }),
    },
    { key: 'deliveryPct', label: 'Delivery', hint: 'Share of today\'s volume taken into delivery', value: r => r.deliveryPct, cell: r => (r.deliveryPct == null ? '' : `${r.deliveryPct.toFixed(0)}%`) },
    ...MODE_IDS.map((m): Column => ({
      key: m, label: MODES[m].label, hint: `Rank today in ${MODES[m].label} mode, 1 is best`, ascending: true, value: r => r.ranks[m] ?? null,
      cell: r => r.ranks[m] ?? 'n/a',
      style: r => {
        const rank = r.ranks[m]
        return { fontWeight: rank && rank <= 20 ? 700 : undefined, color: rank && rank <= 20 ? '#34d399' : undefined, opacity: rank ? 1 : 0.5 }
      },
    })),
  ],
  results: [
    STOCK, CLOSE,
    { key: 'salesCr', label: 'Sales', hint: 'Sales in the quarter, rupees crore', value: r => r.results?.salesCr ?? null, cell: r => crore(r.results?.salesCr) },
    {
      key: 'salesYoyPct', label: 'Sales growth', hint: 'Sales against the same quarter a year ago', value: r => r.results?.salesYoyPct ?? null,
      cell: r => signed(r.results?.salesYoyPct ?? null), style: r => gain(r.results?.salesYoyPct ?? null),
    },
    {
      key: 'profitCr', label: 'Profit', hint: 'Profit after tax in the quarter, rupees crore', value: r => r.results?.profitCr ?? null,
      cell: r => crore(r.results?.profitCr), style: r => ({ color: (r.results?.profitCr ?? 0) < 0 ? '#f87171' : undefined }),
    },
    {
      key: 'profitYoyPct', label: 'Profit growth', value: r => r.results?.profitYoyPct ?? null,
      hint: 'Profit after tax against the same quarter a year ago. Blank when either quarter was a loss',
      cell: r => signed(r.results?.profitYoyPct ?? null), style: r => gain(r.results?.profitYoyPct ?? null),
    },
    {
      key: 'marginPct', label: 'Margin', hint: 'Operating profit as a share of sales. Blank for banks and lenders', value: r => r.results?.marginPct ?? null,
      cell: r => (r.results?.marginPct == null ? '' : `${r.results.marginPct.toFixed(0)}%`),
    },
    {
      key: 'pe', label: 'P/E', hint: 'Last close against earnings a share over the last four quarters. Blank when the company made a loss', ascending: true,
      value: r => r.results?.pe ?? null, cell: r => (r.results?.pe == null ? '' : r.results.pe.toFixed(1)),
    },
    {
      key: 'filedAt', label: 'Quarter', hint: 'The quarter these figures are for and the day they were filed', value: r => r.results?.filedAt ?? null,
      cell: r => (r.results
        ? <>{r.results.quarter}<span style={muted}> {day(r.results.filedAt)}{r.results.basis === 'standalone' ? ', standalone' : ''}</span></>
        : <span style={{ opacity: 0.5 }}>Not loaded</span>),
    },
  ],
}

const PAGE = 100

export default function ScreenerTab() {
  const [screen, setScreen] = useState<Screen | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [index, setIndex] = useState<'NIFTY100' | 'NIFTY500'>('NIFTY100')
  const [filter, setFilter] = useState('all')
  const [sector, setSector] = useState('')
  const [search, setSearch] = useState('')
  const [view, setView] = useState<View>('prices')
  const [sort, setSort] = useState<{ key: string; down: boolean }>({ key: 'weekPct', down: true })
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
    const value = (COLUMNS[view].find(c => c.key === sort.key) ?? STOCK).value
    return list.sort((a, b) => {
      const x = value(a), y = value(b)
      // Stocks with no value always go last
      if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1
      const order = typeof x === 'string' ? x.localeCompare(y as string) : x - (y as number)
      return sort.down ? -order : order
    })
  }, [inIndex, filter, sector, search, sort, view])

  // Names sort A to Z and ranks best first; everything else starts with the largest
  const sortBy = (c: Column) => setSort(s => (s.key === c.key ? { key: c.key, down: !s.down } : { key: c.key, down: !c.ascending }))
  const show = (next: View) => {
    setView(next); setFilter('all'); setShowAll(false)
    setSort({ key: next === 'prices' ? 'weekPct' : 'profitYoyPct', down: true })
  }
  const covered = screen ? (index === 'NIFTY100' ? screen.withResults.nifty100 : screen.withResults.nifty500) : 0

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
            costs, so treat them as information.
          </p>
          <p style={{ ...muted, marginBottom: 0 }}>
            Quarterly results show each company&apos;s latest reported quarter. The figures come from Drishti, which reads them from the
            filings by machine, so an odd number can be wrong: check the filing before you rely on one. They describe the company. We have
            not tested them as a way to pick stocks.
          </p>
        </details>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14, alignItems: 'center' }}>
          {(['prices', 'results'] as const).map(v => (
            <button key={v} aria-pressed={view === v} style={{ ...chip(view === v), fontWeight: 700 }} onClick={() => show(v)}>
              {v === 'prices' ? 'Prices and ranks' : 'Quarterly results'}
            </button>
          ))}
          <span style={{ opacity: 0.3 }}>|</span>
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
          {FILTERS.filter(f => !f.view || f.view === view).map(f => (
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
            {view === 'results' && ` Results are loaded for ${covered} of the ${inIndex.length}.`}
          </div>
          <div style={{ overflowX: 'auto', marginTop: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {COLUMNS[view].map(c => (
                    <th key={c.key} style={th} title={c.hint} onClick={() => sortBy(c)} aria-sort={sort.key === c.key ? (sort.down ? 'descending' : 'ascending') : undefined}>
                      {c.label}{sort.key === c.key ? (sort.down ? ' ▼' : ' ▲') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map(r => (
                  <tr key={r.symbol} title={view === 'results' ? r.results?.summary ?? undefined : undefined}>
                    {COLUMNS[view].map(c => <td key={c.key} style={{ ...td, ...c.style?.(r) }}>{c.cell(r)}</td>)}
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
