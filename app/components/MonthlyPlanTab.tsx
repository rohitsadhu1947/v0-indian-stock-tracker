'use client'

/**
 * Monthly Plan: the portfolio engine's landing screen.
 *
 * Three modes, each a strategy that went through the research harness. The
 * page shows that mode's backtest, the ranking at the last month-end, the
 * exact buy/sell orders for the paper book, and the book's value against
 * NIFTY 500.
 */

import React, { useCallback, useEffect, useState } from 'react'
import type { MonthlyPlan } from '@/lib/portfolio/service'
import { MODES, DEFAULT_MODE, PORTFOLIO_RULES, type RiskMode } from '@/lib/portfolio/config'
import research from '@/research/results/summary.json'

type Mode = RiskMode
const MODE_IDS = Object.keys(MODES) as Mode[]

const MODE_KEY = 'monthlyPlan.mode'
const TREND_KEY = 'monthlyPlan.trendFilter'
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
  book: { mode: Mode; startingCapital: number; points: Array<{ date: string; value: number; type: string }> } | null
  benchmark: Array<{ date: string; value: number }>
}

type PeriodKey = 'full' | 'to2019' | 'since2020' | 'since2022'
interface PeriodStats { cagrPct: number; maxDrawdownPct: number }
interface Edge { excessCagrPct: number; tStat: number }
interface Backtest {
  key: string
  afterTax: Record<PeriodKey, PeriodStats>
  versusBenchmark: { afterTax: Record<PeriodKey, Edge> } | null
  turnoverPctPerYear: number
  taxPctPerYear: number
  chargesPctPerYear: number
  slippagePctPerYear: number
}

/** The backtest of a mode exactly as the plan runs it. */
function backtestFor(mode: Mode, trendFilter: boolean): Backtest | undefined {
  const key = trendFilter ? MODES[mode].researchKeyWithTrendFilter : MODES[mode].researchKey
  return (research.strategies as unknown as Backtest[]).find(s => s.key === key)
}

export default function MonthlyPlanTab() {
  const [mode, setMode] = useState<Mode>(DEFAULT_MODE)
  const [trendFilter, setTrendFilter] = useState(false)
  const [plan, setPlan] = useState<MonthlyPlan | null>(null)
  const [perf, setPerf] = useState<Performance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(MODE_KEY)
      if (saved && (MODE_IDS as string[]).includes(saved)) setMode(saved as Mode)
      setTrendFilter(localStorage.getItem(TREND_KEY) === '1')
    } catch { /* storage unavailable */ }
  }, [])

  const load = useCallback(async (m: Mode, trend: boolean) => {
    setLoading(true)
    setError(null)
    try {
      const [planRes, perfRes] = await Promise.all([
        fetch(`/api/model-portfolio/plan?mode=${m}&trend=${trend ? 1 : 0}`),
        fetch('/api/model-portfolio/performance'),
      ])
      if (planRes.status === 401) { window.location.href = '/login'; return }
      const planJson = await planRes.json()
      if (!planJson.success) throw new Error(planJson.details || planJson.error || 'Failed to build plan')
      setPlan(planJson.plan)
      const perfJson = await perfRes.json()
      if (perfJson.success) setPerf(perfJson)
    } catch (e: any) {
      // Never leave another mode's plan on screen under this mode's heading
      setPlan(null)
      setError(e.message.split('\n')[0].slice(0, 200))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(mode, trendFilter) }, [mode, trendFilter, load])

  const chooseMode = (m: Mode) => {
    setMode(m)
    try { localStorage.setItem(MODE_KEY, m) } catch { /* ignore */ }
  }

  const toggleTrend = (on: boolean) => {
    setTrendFilter(on)
    try { localStorage.setItem(TREND_KEY, on ? '1' : '0') } catch { /* ignore */ }
  }

  const rebalance = async () => {
    if (!plan) return
    const ok = window.confirm(
      `Record a paper rebalance in ${MODES[mode].label} mode?\n\n` +
      `${plan.book.plan.orders.length} orders at ${plan.book.priceSource} prices, with slippage and charges.\n` +
      `No real orders are placed.`
    )
    if (!ok) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/model-portfolio/rebalance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, trendFilter }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Rebalance failed')
      setMessage(`Paper rebalance recorded: ${json.fills.length} fills, book value ${inr(json.value)}.`)
      await load(mode, trendFilter)
    } catch (e: any) {
      setMessage(`Not rebalanced: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  const plain = backtestFor(mode, false)
  const filtered = backtestFor(mode, true)

  return (
    <div>
      <div style={card}>
        <h2 style={{ margin: '0 0 6px' }}>🧭 Monthly Plan</h2>
        <p style={{ ...muted, margin: 0 }}>
          Once a month, hold the {PORTFOLIO_RULES.topN} best-ranked of the {PORTFOLIO_RULES.universeSize} most traded NSE stocks
          at equal weight. A stock you hold stays until it falls below rank {PORTFOLIO_RULES.exitRank}, which roughly halves
          the trading. Each mode ranks stocks differently and was backtested exactly as it runs here. The book is paper; no
          real orders are placed.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
          {MODE_IDS.map(m => (
            <button
              key={m}
              onClick={() => chooseMode(m)}
              aria-pressed={mode === m}
              style={{
                flex: '1 1 200px',
                padding: 12,
                borderRadius: 10,
                cursor: 'pointer',
                textAlign: 'left',
                color: '#fff',
                border: mode === m ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.15)',
                background: mode === m ? 'rgba(96,165,250,0.15)' : 'rgba(0,0,0,0.2)',
              }}
            >
              <div style={{ fontWeight: 700 }}>{MODES[m].label}{m === DEFAULT_MODE ? ' (default)' : ''}</div>
              <div style={{ fontSize: '0.8em', marginTop: 4, opacity: 0.85 }}>{MODES[m].description}</div>
            </button>
          ))}
        </div>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={trendFilter} onChange={e => toggleTrend(e.target.checked)} />
          <span>
            Trend filter: hold cash while NIFTY 200 is below its 200-day average.
            {plain && filtered && (
              <span style={muted}>
                {' '}In the backtest it took this mode from {plain.afterTax.full.cagrPct.toFixed(1)}% to {filtered.afterTax.full.cagrPct.toFixed(1)}% a
                year, and its worst fall from {plain.afterTax.full.maxDrawdownPct.toFixed(0)}% to {filtered.afterTax.full.maxDrawdownPct.toFixed(0)}%.
              </span>
            )}
          </span>
        </label>

        <BacktestTable mode={mode} trendFilter={trendFilter} />
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
              <div style={muted}>This month</div>
              <div style={{ fontSize: '1.1em', fontWeight: 700, marginTop: 6 }}>
                {plan.exposure.invested ? `Invested: ${MODES[plan.mode].label}` : 'In cash'}
              </div>
              <div style={muted}>{plan.exposure.reason} Decided on prices at {plan.asOf}, the last session of last month.</div>
            </div>

            <div style={{ ...card, borderColor: plan.freshness.ok ? 'rgba(255,255,255,0.1)' : '#f59e0b' }}>
              <div style={muted}>Price data</div>
              <div style={{ fontWeight: 700, marginTop: 6, color: plan.freshness.ok ? '#34d399' : '#fbbf24' }}>
                {plan.freshness.ok ? 'Current' : 'Stale'}
              </div>
              <div style={muted}>{plan.freshness.message}</div>
            </div>
          </div>

          <BookSection plan={plan} busy={busy} onRebalance={rebalance} />

          <div style={card}>
            <h3 style={{ marginTop: 0 }}>Ranking at {plan.asOf}</h3>
            <p style={muted}>
              {plan.universe.ranked} of the {plan.universe.size} most traded stocks have a year of history and trade at least ₹10 Cr a day.
              Score is the stock&apos;s standing among them on {MODES[plan.mode].factors.length > 1 ? 'the average of ' : ''}
              {MODES[plan.mode].factors.map(f => FACTOR_WORDS[f] ?? f).join(' and ')}: 100 is best.
              {plan.book.skippedUnaffordable.length > 0 &&
                ` Skipped because one share costs more than a position's budget: ${plan.book.skippedUnaffordable.join(', ')}.`}
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>#</th><th style={th}>Stock</th><th style={th}>Industry</th>
                    <th style={th}>12-1m return</th><th style={th}>Volatility</th><th style={th}>Score</th>
                    <th style={th}>Traded/day</th><th style={th}>Close</th><th style={th}>Book</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.book.ranking.map(r => (
                    <tr key={r.symbol} style={{ opacity: r.selected || r.held ? 1 : 0.55 }}>
                      <td style={td}>{r.rank}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{r.symbol}</td>
                      <td style={td}>{r.industry}</td>
                      <td style={{ ...td, color: (r.momentumPct ?? 0) >= 0 ? '#34d399' : '#f87171' }}>{r.momentumPct == null ? '' : pct(r.momentumPct)}</td>
                      <td style={td}>{r.volatilityPct == null ? '' : `${r.volatilityPct.toFixed(0)}%`}</td>
                      <td style={td}>{r.scorePct.toFixed(0)}</td>
                      <td style={td}>₹{r.tradedValueCr.toFixed(0)} Cr</td>
                      <td style={td}>{r.lastClose.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                      <td style={td}>{r.selected ? (r.held ? 'Keep' : 'Buy') : r.held ? 'Sell' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <PerformanceCard perf={perf} />
        </>
      )}
    </div>
  )
}

const FACTOR_WORDS: Record<string, string> = {
  momentum: '12-month trend relative to volatility',
  lowVolatility: 'steadiness (low volatility)',
}

const monthYear = (d: number) =>
  new Date(Date.UTC(Math.floor(d / 10000), Math.floor(d / 100) % 100 - 1, 1)).toLocaleString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })

/** The chosen mode's backtest from the research harness (scripts/research/run.ts). */
function BacktestTable({ mode, trendFilter }: { mode: Mode; trendFilter: boolean }) {
  const strategy = backtestFor(mode, trendFilter)
  const nifty500 = research.indices.find(i => i.key === 'nifty-500')
  if (!strategy || !strategy.versusBenchmark) {
    return <p style={{ ...muted, marginTop: 14 }}>No backtest for this mode yet: run <code>npm run research</code>.</p>
  }
  const rows: Array<[string, Record<PeriodKey, PeriodStats>]> = [
    [`${MODES[mode].label}${trendFilter ? ' with the trend filter' : ''}, after costs and tax`, strategy.afterTax],
    ['All 500 stocks at equal weight, after costs and tax', research.benchmark.afterTax as Record<PeriodKey, PeriodStats>],
    ...(nifty500 ? [['NIFTY 500 index, price only', nifty500.priceReturn as Record<PeriodKey, PeriodStats>] as [string, Record<PeriodKey, PeriodStats>]] : []),
  ]
  const cell = (p: PeriodStats) => (
    <>{p.cagrPct.toFixed(1)}%/yr <span style={{ opacity: 0.6 }}>(worst {p.maxDrawdownPct.toFixed(0)}%)</span></>
  )
  const edge = strategy.versusBenchmark.afterTax
  // With many strategies tested, some look good by chance: 2 is weak evidence, 3 is the bar
  const verdict = (t: number) => (Math.abs(t) >= 3 ? 'unlikely to be luck' : Math.abs(t) >= 2 ? 'probably not luck, but not proven' : 'could be luck')
  const signed = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(1)}`
  const columns: Array<[PeriodKey, string]> = [
    ['full', `${monthYear(research.dataFrom)} to ${monthYear(research.dataThrough)}`],
    ['to2019', '2011 to 2019'],
    ['since2020', 'Since Jan 2020'],
    ['since2022', 'Since Jan 2022'],
  ]
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Backtest on NSE data</th>
              {columns.map(([key, label]) => <th key={key} style={th}>{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, r], i) => (
              <tr key={name} style={{ fontWeight: i === 0 ? 700 : 400 }}>
                <td style={td}>{name}</td>
                {columns.map(([key]) => <td key={key} style={td}>{cell(r[key])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={muted}>
        Against the equal-weight portfolio: {signed(edge.full.excessCagrPct)}% a year over the whole period ({verdict(edge.full.tStat)}),
        {' '}{signed(edge.since2022.excessCagrPct)}% a year since 2022 ({verdict(edge.since2022.tStat)}).
        It replaces about {(strategy.turnoverPctPerYear / 100).toFixed(1)} times its value in trades each year;
        tax takes about {strategy.taxPctPerYear.toFixed(1)}% of the portfolio a year and charges and slippage
        {' '}{(strategy.chargesPctPerYear + strategy.slippagePctPerYear).toFixed(1)}%.
      </p>
      <p style={{ ...muted, marginBottom: 0 }}>
        How it was tested: each month it ranks the 500 most traded stocks as they were on that day, including companies
        later delisted; trades at the next day&apos;s average price; pays Zerodha delivery charges, 0.1% slippage, and capital gains
        tax under today&apos;s rules; dividends are reinvested. The index row has no dividends, costs or tax.
        {' '}{research.strategies.length} strategies were tested in all, so the best of them partly reflects luck.
        Past results do not guarantee future ones.
      </p>
    </div>
  )
}

function BookSection({ plan, busy, onRebalance }: { plan: MonthlyPlan; busy: boolean; onRebalance: () => void }) {
  const { book } = plan
  const holdings = Object.entries(book.state.holdings)
  const ret = ((book.value - book.startingCapital) / book.startingCapital) * 100
  const canRebalance = book.rebalance.due && book.plan.orders.length > 0 && book.plan.missingPrices.length === 0
  const why = { exit: `fell below rank ${PORTFOLIO_RULES.exitRank}`, entry: 'new pick', resize: 'resize to target' }

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ margin: 0 }}>Paper book</h3>
          <p style={{ ...muted, margin: '4px 0 0' }}>
            {book.exists && book.mode !== plan.mode
              ? `Last rebalanced in ${MODES[book.mode]?.label ?? book.mode} mode. These orders would move it to ${MODES[plan.mode].label}.`
              : `${MODES[plan.mode].label} mode, ${PORTFOLIO_RULES.topN} stocks at equal weight.`}
          </p>
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
                  <td style={td}>{why[o.reason]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        onClick={onRebalance}
        disabled={!canRebalance || busy}
        style={{
          marginTop: 14, padding: '10px 18px', borderRadius: 8, border: 'none', fontWeight: 700,
          cursor: canRebalance && !busy ? 'pointer' : 'not-allowed',
          background: canRebalance ? '#2563eb' : 'rgba(255,255,255,0.1)', color: '#fff',
        }}
      >
        {busy ? 'Recording…' : 'Record paper rebalance'}
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
  const book = perf?.book
  const first = book?.points[0]
  const last = book?.points[book.points.length - 1]
  if (!perf || !book || !first || !last) {
    return (
      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Paper track record</h3>
        <p style={muted}>Starts with the first paper rebalance. Values are recorded every trading day at 15:25 IST.</p>
      </div>
    )
  }

  const bench = perf.benchmark
  const benchStart = bench.find(x => x.date >= first.date)
  const benchEnd = bench[bench.length - 1]
  const benchRet = benchStart && benchEnd && benchEnd.date > benchStart.date
    ? ((benchEnd.value - benchStart.value) / benchStart.value) * 100 : null
  return (
    <div style={card}>
      <h3 style={{ marginTop: 0 }}>Paper track record</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={th}>Mode</th><th style={th}>Started</th><th style={th}>Value</th><th style={th}>Return</th><th style={th}>NIFTY 500 same period</th></tr></thead>
        <tbody>
          <tr>
            <td style={td}>{MODES[book.mode]?.label ?? book.mode}</td>
            <td style={td}>{first.date}</td>
            <td style={td}>{inr(last.value)}</td>
            <td style={td}>{pct(((last.value - book.startingCapital) / book.startingCapital) * 100, 2)}</td>
            <td style={td}>{benchRet === null ? 'not enough data yet' : pct(benchRet, 2)}</td>
          </tr>
        </tbody>
      </table>
      <p style={muted}>Judge the strategy over a year or more, not weeks: every mode had losing years in the backtest.</p>
    </div>
  )
}
