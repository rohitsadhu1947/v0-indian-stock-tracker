'use client'

/**
 * Monthly Plan: the portfolio engine's landing screen.
 *
 * Three modes, each a strategy that went through the research harness. The
 * page keeps three things apart: the paper book as it stands at current
 * prices, the picks of the mode being looked at, and the trades that would
 * take the book there. Real Zerodha holdings are shown read only.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { MonthlyPlan, BrokerHoldingRow } from '@/lib/portfolio/service'
import { holdingValue, isPlanFund } from '@/lib/portfolio/plan-core'
import CautionNote from './CautionNote'
import { planGuide } from '@/lib/signals/price-guide'
import type { TrackRecord } from '@/lib/portfolio/signals'
import { FUND_SHARES, MODES, DEFAULT_MODE, PLAN_FUNDS, PORTFOLIO_RULES, type RiskMode } from '@/lib/portfolio/config'
import research from '@/research/results/summary.json'
import fundResearch from '@/research/results/funds.json'

type Mode = RiskMode
const MODE_IDS = Object.keys(MODES) as Mode[]

const MODE_KEY = 'monthlyPlan.mode'
const TREND_KEY = 'monthlyPlan.trendFilter'
const VIEW_KEY = 'monthlyPlan.view'
const VIEWS = [
  { id: 'book', label: 'My book' },
  { id: 'plan', label: "This month's plan" },
  { id: 'record', label: 'Track record' },
  { id: 'zerodha', label: 'Zerodha holdings' },
] as const
type View = (typeof VIEWS)[number]['id']
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

/** The backtest of a mode with a share of the book in the three funds. */
function fundBacktest(mode: Mode, share: number): { cagrPct: number; maxDrawdownPct: number } | undefined {
  const byShare = (fundResearch.byModeAndFundSharePct as Record<string, Record<string, { cagrPct: number; maxDrawdownPct: number }>>)[mode]
  return byShare?.[String(Math.round(share * 100))]
}

/** Prices from /api/model-portfolio/live, polled while the market is open. */
interface LiveView {
  brokerConnected: boolean
  marketOpen: boolean
  source: 'live' | 'last close'
  at: string
  lastCloseFor: string[]
  quotes: Record<string, { price: number; previousClose: number | null }>
  cash: number
  brokerHoldings: BrokerHoldingRow[] | null
  cautions?: MonthlyPlan['cautions']
}

const LIVE_POLL_MS = 15000
const KITE_LOGIN = '/api/auth/kite/login'
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })
const price = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const gain = (n: number): React.CSSProperties => ({ color: n > 0 ? '#34d399' : n < 0 ? '#f87171' : undefined })
const smallButton: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.25)', background: 'transparent',
  color: '#fff', cursor: 'pointer', fontSize: '0.85em', marginRight: 6, whiteSpace: 'nowrap',
}

export default function MonthlyPlanTab() {
  const [mode, setMode] = useState<Mode>(DEFAULT_MODE)
  const [trendFilter, setTrendFilter] = useState(false)
  // Null: use the share the book already keeps in funds
  const [fundShare, setFundShare] = useState<number | null>(null)
  const [view, setView] = useState<View>('book')
  const [plan, setPlan] = useState<MonthlyPlan | null>(null)
  const [live, setLive] = useState<LiveView | null>(null)
  const [perf, setPerf] = useState<Performance | null>(null)
  const [record, setRecord] = useState<TrackRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(MODE_KEY)
      if (saved && (MODE_IDS as string[]).includes(saved)) setMode(saved as Mode)
      setTrendFilter(localStorage.getItem(TREND_KEY) === '1')
      const savedView = localStorage.getItem(VIEW_KEY)
      if (VIEWS.some(v => v.id === savedView)) setView(savedView as View)
    } catch { /* storage unavailable */ }
  }, [])

  // Only the latest request may update the page: an earlier mode's answer can arrive later
  const latestLoad = useRef(0)
  const load = useCallback(async (m: Mode, trend: boolean, funds: number | null, quiet = false) => {
    const request = ++latestLoad.current
    if (!quiet) setLoading(true)
    setError(null)
    try {
      const [planRes, perfRes, recordRes] = await Promise.all([
        fetch(`/api/model-portfolio/plan?mode=${m}&trend=${trend ? 1 : 0}${funds == null ? '' : `&funds=${Math.round(funds * 100)}`}`),
        fetch('/api/model-portfolio/performance'),
        fetch('/api/model-portfolio/track-record'),
      ])
      if (planRes.status === 401) { window.location.href = '/login'; return }
      const planJson = await planRes.json()
      if (request !== latestLoad.current) return
      if (!planJson.success) throw new Error(planJson.details || planJson.error || 'Failed to build plan')
      setPlan(planJson.plan)
      const perfJson = await perfRes.json()
      if (perfJson.success) setPerf(perfJson)
      const recordJson = await recordRes.json().catch(() => null)
      if (recordJson?.success) setRecord(recordJson)
    } catch (e: any) {
      // Never leave another mode's plan on screen under this mode's heading
      if (request !== latestLoad.current) return
      setPlan(null)
      setError(e.message.split('\n')[0].slice(0, 200))
    } finally {
      if (request === latestLoad.current) setLoading(false)
    }
  }, [])

  useEffect(() => { load(mode, trendFilter, fundShare) }, [mode, trendFilter, fundShare, load])

  const loadLive = useCallback(async () => {
    try {
      const json = await fetch('/api/model-portfolio/live').then(r => r.json())
      if (json.success) setLive(json)
    } catch { /* keep the last prices on screen */ }
  }, [])

  // Real holdings once, then fresh prices every few seconds while the market is open
  const connected = plan?.brokerConnected ?? false
  const polling = connected && (plan?.marketOpen ?? false)
  useEffect(() => {
    if (!connected) { setLive(null); return }
    loadLive()
    if (!polling) return
    const timer = setInterval(() => { if (!document.hidden) loadLive() }, LIVE_POLL_MS)
    return () => clearInterval(timer)
  }, [connected, polling, loadLive])

  const chooseMode = (m: Mode) => {
    setMode(m)
    setMessage(null)
    try { localStorage.setItem(MODE_KEY, m) } catch { /* ignore */ }
  }

  const chooseView = (v: View) => {
    setView(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* ignore */ }
    window.scrollTo({ top: 0 })
  }

  const toggleTrend = (on: boolean) => {
    setTrendFilter(on)
    try { localStorage.setItem(TREND_KEY, on ? '1' : '0') } catch { /* ignore */ }
  }

  const post = async (url: string, body: object, done: (json: any) => string) => {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Failed')
      setMessage(done(json))
      await Promise.all([load(mode, trendFilter, fundShare, true), loadLive()])
    } catch (e: any) {
      setMessage(`Not done: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  const runAction = () => {
    if (!plan) return
    const { kind, orders } = plan.action
    const what =
      kind === 'start' ? `Start the paper book in ${MODES[mode].label} mode?`
      : kind === 'switch' ? `Switch the paper book from ${MODES[plan.book.mode!].label} to ${MODES[mode].label}?`
      : `Record this month's paper rebalance in ${MODES[mode].label} mode?`
    const ok = window.confirm(
      `${what}\n\n${orders.length} orders at ${plan.prices.source === 'live' ? 'current' : 'last close'} prices, with slippage and charges.\n` +
      `No real orders are placed.`
    )
    if (!ok) return
    post('/api/model-portfolio/rebalance', { mode, trendFilter, fundShare: plan.fundShare * 100 },
      json => `Recorded: ${json.fills.length} fills, book value ${inr(json.value)}.`)
  }

  const trade = (symbol: string, side: 'BUY' | 'SELL', held: number) => {
    const answer = window.prompt(
      side === 'SELL'
        ? `Sell how many ${symbol}? The book holds ${held}. This is a paper trade at the current price.`
        : `Buy how many more ${symbol}? This is a paper trade at the current price.`,
      side === 'SELL' ? String(held) : ''
    )
    if (answer === null) return
    const qty = Number(answer.trim())
    if (!Number.isInteger(qty) || qty <= 0) { setMessage('Not done: enter a whole number of shares.'); return }
    post('/api/model-portfolio/trade', { symbol, side, qty },
      json => `${side === 'SELL' ? 'Sold' : 'Bought'} ${json.fill.qty} ${symbol} at ${price(json.fill.fillPrice)} after slippage, charges ${inr(json.fill.charges)}. Cash is now ${inr(json.cash)}.`)
  }

  const plain = backtestFor(mode, false)
  const filtered = backtestFor(mode, true)
  const shownFundShare = fundShare ?? plan?.fundShare ?? 0
  const noFunds = fundBacktest(mode, 0), withFunds = fundBacktest(mode, shownFundShare)

  const modePicker = (
    <div style={card}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {MODE_IDS.map(m => (
          <button
            key={m}
            onClick={() => chooseMode(m)}
            aria-pressed={mode === m}
            style={{
              flex: '1 1 200px', padding: 12, borderRadius: 10, cursor: 'pointer', textAlign: 'left', color: '#fff',
              border: mode === m ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.15)',
              background: mode === m ? 'rgba(96,165,250,0.15)' : 'rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ fontWeight: 700 }}>
              {MODES[m].label}{m === DEFAULT_MODE ? ' (default)' : ''}
              {plan?.book.mode === m && <span style={{ marginLeft: 8, fontSize: '0.75em', padding: '2px 8px', borderRadius: 10, background: '#2563eb' }}>your book</span>}
            </div>
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
      <label style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginTop: 12, flexWrap: 'wrap' }}>
        <span>Share kept in funds:</span>
        <select
          value={Math.round(shownFundShare * 100)} onChange={e => setFundShare(Number(e.target.value) / 100)} aria-label="Share of the book kept in funds"
          style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(0,0,0,0.25)', color: '#fff' }}
        >
          {FUND_SHARES.map(s => <option key={s} value={Math.round(s * 100)}>{s === 0 ? 'None' : `${Math.round(s * 100)}%`}</option>)}
        </select>
        <span style={{ ...muted, flex: '1 1 320px' }}>
          Split equally between {PLAN_FUNDS.map(f => `${f.label.toLowerCase()} (${f.symbol})`).join(', ')}. They moved differently from shares in
          testing, so they soften the falls.
          {noFunds && withFunds && shownFundShare > 0 && (
            <> In the backtest {Math.round(shownFundShare * 100)}% in funds took this mode from {noFunds.cagrPct.toFixed(1)}% to {withFunds.cagrPct.toFixed(1)}% a
              year, and its worst fall from {noFunds.maxDrawdownPct.toFixed(0)}% to {withFunds.maxDrawdownPct.toFixed(0)}%.</>
          )}
          {' '}Gold and the US fund had unusually good years in the test period.
          {trendFilter && shownFundShare > 0 && ' Funds and the trend filter have not been tested together.'}
          {plan && plan.book.exists && shownFundShare !== plan.book.fundShare && ` Your book keeps ${Math.round(plan.book.fundShare * 100)}% in funds now. The orders below would change that.`}
        </span>
      </label>
    </div>
  )

  const ready = plan && !loading
  return (
    <div>
      <div style={card}>
        <h2 style={{ margin: '0 0 6px' }}>🧭 Monthly Plan</h2>
        <p style={{ ...muted, margin: 0 }}>
          Once a month, hold the {PORTFOLIO_RULES.topN} best-ranked of the {PORTFOLIO_RULES.universeSize} most traded NSE stocks in equal amounts.
          The book is paper: no real orders are placed.
        </p>
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: 'pointer', ...muted }}>How it works</summary>
          <p style={{ ...muted, marginBottom: 0 }}>
            At most {PORTFOLIO_RULES.maxPerSector} stocks come from any one sector. A stock you hold stays until it falls below
            rank {PORTFOLIO_RULES.exitRank}, which roughly halves the trading. The three modes rank stocks differently, so each has its
            own list. Choosing a mode only shows you that mode. Your book changes only when you confirm an action.
          </p>
        </details>

        <div role="tablist" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          {VIEWS.map(v => (
            <button
              key={v.id}
              role="tab"
              aria-selected={view === v.id}
              onClick={() => chooseView(v.id)}
              style={{
                padding: '8px 16px', borderRadius: 20, cursor: 'pointer', color: '#fff', fontWeight: 600,
                border: view === v.id ? '1px solid #60a5fa' : '1px solid rgba(255,255,255,0.15)',
                background: view === v.id ? '#2563eb' : 'transparent',
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div style={card}>Building this month&apos;s plan…</div>}
      {error && <div style={{ ...card, borderColor: '#ef4444', color: '#fca5a5' }}>⚠️ {error}</div>}
      {message && <div style={{ ...card, borderColor: '#60a5fa' }}>{message}</div>}

      {ready && view === 'book' && (
        <>
          <PriceStatus plan={plan} live={live} />
          <HoldingsCard plan={plan} live={live} busy={busy} onTrade={trade} />
          <NextStep plan={plan} onOpenPlan={() => chooseView('plan')} />
        </>
      )}

      {view === 'plan' && modePicker}
      {ready && view === 'plan' && (
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
              <div style={muted}>This month in {MODES[plan.mode].label}</div>
              <div style={{ fontSize: '1.1em', fontWeight: 700, marginTop: 6 }}>
                {plan.exposure.invested ? 'Invested' : 'In cash'}
              </div>
              <div style={muted}>{plan.exposure.reason} Decided on prices at {plan.asOf}, the last session of last month.</div>
            </div>

            <div style={{ ...card, borderColor: plan.freshness.ok ? 'rgba(255,255,255,0.1)' : '#f59e0b' }}>
              <div style={muted}>Nightly NSE data (used for the ranking)</div>
              <div style={{ fontWeight: 700, marginTop: 6, color: plan.freshness.ok ? '#34d399' : '#fbbf24' }}>
                {plan.freshness.ok ? 'Current' : 'Stale'}
              </div>
              <div style={muted}>{plan.freshness.message}</div>
            </div>
          </div>

          <ActionCard plan={plan} busy={busy} onRun={runAction} />
          <PicksCard plan={plan} />
        </>
      )}

      {view === 'record' && (
        <>
          {modePicker}
          <div style={card}>
            <h3 style={{ margin: 0 }}>How {MODES[mode].label} did in the backtest</h3>
            <BacktestTable mode={mode} trendFilter={trendFilter} />
          </div>
          {ready && <LiveRecordCard record={record} mode={mode} />}
          {ready && <PerformanceCard perf={perf} />}
        </>
      )}

      {ready && view === 'zerodha' && (
        <>
          <PriceStatus plan={plan} live={live} />
          <BrokerHoldingsCard plan={plan} live={live} />
        </>
      )}
    </div>
  )
}

/** One line on the book page about the monthly rebalance, with a way to the plan. */
function NextStep({ plan, onOpenPlan }: { plan: MonthlyPlan; onOpenPlan: () => void }) {
  const { book, action } = plan
  if (!book.exists) return null
  const sells = book.holdings.filter(h => !h.keep).length
  const text = action.kind !== 'rebalance'
    ? `You are looking at ${MODES[plan.mode].label} in the plan, and your book follows ${MODES[book.mode!].label}.`
    : action.canExecute
      ? `This month's rebalance is ready: ${action.orders.length} orders.`
      : `${action.blocked} ${sells > 0 ? `As things stand, the next rebalance would sell ${sells} of your holdings.` : 'As things stand, the next rebalance would keep every holding.'}`
  return (
    <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div><strong>Monthly rebalance</strong><div style={muted}>{text}</div></div>
      <button onClick={onOpenPlan} style={{ ...smallButton, padding: '8px 16px', marginRight: 0 }}>Open this month&apos;s plan</button>
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

/** Where the prices on the page come from, and a warning when they are old during trading hours. */
function PriceStatus({ plan, live }: { plan: MonthlyPlan; live: LiveView | null }) {
  const source = live?.source ?? plan.prices.source
  const at = live?.at ?? plan.prices.at
  const isLive = source === 'live'
  const onClose = (live?.lastCloseFor ?? plan.prices.lastCloseFor).filter(s => plan.book.holdings.some(h => h.symbol === s))
  const warn = plan.marketOpen && !isLive
  return (
    <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderColor: warn ? '#f59e0b' : 'rgba(255,255,255,0.1)' }}>
      <div>
        <strong style={{ color: isLive ? '#34d399' : warn ? '#fbbf24' : undefined }}>
          {isLive ? `Live prices from Zerodha, updated ${timeOf(at)}` : 'Prices are the last close'}
        </strong>
        <div style={muted}>
          {isLive
            ? plan.marketOpen ? `Refreshes every ${LIVE_POLL_MS / 1000} seconds while the market is open.` : 'The market is closed, so this is the final price of the last session.'
            : warn ? 'The market is open and Zerodha is not connected. Prices and profit figures below are from the last close and can be far from the current price.'
            : plan.brokerConnected ? 'Zerodha did not return prices, so the last close is shown.'
            : 'Zerodha is not connected. Connect it to see current prices during market hours and your real holdings.'}
          {isLive && onClose.length > 0 && ` Zerodha had no price for ${onClose.join(', ')}, so ${onClose.length === 1 ? 'it is' : 'they are'} shown at the last close.`}
        </div>
      </div>
      {!plan.brokerConnected && (
        <a href={KITE_LOGIN} style={{ padding: '8px 16px', borderRadius: 8, background: '#eab308', color: '#000', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
          Connect Zerodha
        </a>
      )}
    </div>
  )
}

/** The paper book as it stands: what was bought, at what price, and what it is worth now. */
function HoldingsCard({ plan, live, busy, onTrade }: {
  plan: MonthlyPlan; live: LiveView | null; busy: boolean; onTrade: (symbol: string, side: 'BUY' | 'SELL', held: number) => void
}) {
  const cautions = plan.cautions ?? {}
  const { book } = plan
  if (!book.exists) {
    return (
      <div style={card}>
        <h3 style={{ margin: 0 }}>Your paper book</h3>
        <p style={{ ...muted, marginBottom: 0 }}>
          Not started yet. Pick a mode above, look at its picks, then use the start button further down. It begins with {inr(book.startingCapital)} of paper money.
        </p>
      </div>
    )
  }

  // Latest prices from the poll, when there are any
  const rows = book.holdings.map(h => {
    const quote = live?.quotes[h.symbol]
    return quote ? { ...h, price: quote.price, previousClose: quote.previousClose, ...holdingValue(h.qty, h.avgPrice, quote.price, quote.previousClose) } : h
  })
  const cash = live?.cash ?? book.cash
  const invested = rows.reduce((sum, h) => sum + h.value, 0)
  const cost = rows.reduce((sum, h) => sum + h.cost, 0)
  const value = cash + invested
  const total = value - book.startingCapital
  const before = rows.reduce((sum, h) => sum + h.qty * (h.previousClose ?? h.price), 0)
  const today = invested - before
  const bookLabel = MODES[book.mode!].label

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ margin: 0 }}>Your paper book</h3>
          <p style={{ ...muted, margin: '4px 0 0' }}>
            Follows {bookLabel} mode. {rows.length} holdings{book.lastRebalance ? `, last rebalanced on ${book.lastRebalance}` : ''}. Started with {inr(book.startingCapital)}.
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '1.4em', fontWeight: 700 }}>{inr(value)}</div>
          <div style={{ ...gain(total), fontWeight: 600 }}>{total >= 0 ? '+' : '-'}{inr(Math.abs(total))} ({pct(total / book.startingCapital * 100)}) since start</div>
          {before > 0 && <div style={{ ...muted, ...gain(today) }}>Today {today >= 0 ? '+' : '-'}{inr(Math.abs(today))} ({pct(today / before * 100, 2)})</div>}
        </div>
      </div>

      {rows.length === 0 ? (
        <p style={muted}>The book holds no shares. Cash {inr(cash)}.</p>
      ) : (
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Stock</th><th style={th}>Qty</th><th style={th}>Bought at</th><th style={th}>Now</th>
                <th style={th}>Today</th><th style={th}>Value</th><th style={th}>Profit / loss</th>
                <th style={th}>Rank in {bookLabel}</th><th style={th}>At next rebalance</th><th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(h => (
                <tr key={h.symbol}>
                  <td style={td}><span style={{ fontWeight: 600 }}>{h.symbol}</span><div style={{ ...muted, fontSize: '0.8em' }}>{h.sector}</div><CautionNote caution={cautions[h.symbol]} /></td>
                  <td style={td}>{h.qty}</td>
                  <td style={td}>{price(h.avgPrice)}</td>
                  <td style={td}>{price(h.price)}</td>
                  <td style={{ ...td, ...gain(h.dayChangePct ?? 0) }}>{h.dayChangePct == null ? '' : pct(h.dayChangePct, 2)}</td>
                  <td style={td}>{inr(h.value)}</td>
                  <td style={{ ...td, ...gain(h.pnl), whiteSpace: 'nowrap' }}>{h.pnl >= 0 ? '+' : '-'}{inr(Math.abs(h.pnl))} ({pct(h.pnlPct)})</td>
                  <td style={td}>{isPlanFund(h.symbol) ? 'Fund' : h.rank ?? 'Not ranked'}</td>
                  <td style={td}>{h.keep ? 'Keep' : <span style={{ color: '#fbbf24' }}>Sell. {h.note}</span>}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button style={smallButton} disabled={busy} onClick={() => onTrade(h.symbol, 'SELL', h.qty)}>Exit</button>
                    <button style={smallButton} disabled={busy} onClick={() => onTrade(h.symbol, 'BUY', h.qty)}>Buy more</button>
                  </td>
                </tr>
              ))}
              <tr>
                <td style={{ ...td, fontWeight: 700 }} colSpan={5}>Shares and funds</td>
                <td style={{ ...td, fontWeight: 700 }}>{inr(invested)}</td>
                <td style={{ ...td, fontWeight: 700, ...gain(invested - cost) }} colSpan={4}>
                  {invested - cost >= 0 ? '+' : '-'}{inr(Math.abs(invested - cost))}{cost > 0 ? ` (${pct((invested / cost - 1) * 100)})` : ''}
                </td>
              </tr>
              <tr>
                <td style={td} colSpan={5}>Cash</td>
                <td style={td} colSpan={5}>{inr(cash)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p style={{ ...muted, marginBottom: 0 }}>
        Exit and Buy more are paper trades at the price shown, with slippage and charges. They step outside the monthly rule, so the
        next rebalance will bring the book back to the plan.
      </p>
    </div>
  )
}

/** What the mode being looked at would hold this month. */
function PicksCard({ plan }: { plan: MonthlyPlan }) {
  const label = MODES[plan.mode].label
  const mine = new Set(plan.picks.map(p => p.symbol))
  const others = MODE_IDS.filter(m => m !== plan.mode)
    .map(m => { const n = plan.modePicks[m].filter(s => mine.has(s)).length; return `${n} ${n === 1 ? 'is' : 'are'} also in ${MODES[m].label}` })
  const heldCount = plan.picks.filter(p => p.held).length

  return (
    <div style={card}>
      <h3 style={{ marginTop: 0 }}>What {label} would hold this month</h3>
      <p style={muted}>
        Ranked on prices at {plan.asOf}. {plan.universe.ranked} of the {plan.universe.size} most traded stocks have a year of history and
        trade at least ₹10 Cr a day. {label} ranks them on {MODES[plan.mode].factors.length > 1 ? 'the average of ' : ''}
        {MODES[plan.mode].factors.map(f => FACTOR_WORDS[f] ?? f).join(' and ')}. Of these {plan.picks.length} picks, {others.join(' and ')}.
        {plan.book.exists && ` Your book holds ${heldCount} of them.`}
        {plan.action.kind === 'rebalance' && ' A stock you already hold stays on this list while it ranks ' + PORTFOLIO_RULES.exitRank + ' or better.'}
        {plan.action.skippedUnaffordable.length > 0 &&
          ` Skipped because one share costs more than a position's budget: ${plan.action.skippedUnaffordable.join(', ')}.`}
      </p>
      <RankingTable rows={plan.picks} mode={plan.mode} />
      <p style={{ ...muted, marginBottom: 0 }}>
        The price guide shows where past {label} picks stood 6 and 12 months after they were first bought: the middle pick, with the
        best quarter and the worst quarter in brackets. The prices are worked from the close shown in the table. It is not a target to sell at. The plan sells a stock only when it falls below
        rank {PORTFOLIO_RULES.exitRank} at a month end.
      </p>
      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: 'pointer' }}>Full ranking, top {plan.ranking.length}</summary>
        <RankingTable rows={plan.ranking} dim />
      </details>
    </div>
  )
}

function RankingTable({ rows, dim, mode }: { rows: MonthlyPlan['ranking']; dim?: boolean; mode?: Mode }) {
  const guide = (close: number, horizon: 'sixMonths' | 'twelveMonths') => {
    const g = mode ? planGuide(close, mode, horizon) : null
    return g ? <><b>{price(g.typical)}</b> <span style={{ ...muted, fontSize: '0.85em' }}>({price(g.good)} / {price(g.bad)})</span></> : ''
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Rank</th><th style={th}>Stock</th><th style={th}>Industry</th>
            <th style={th}>12-1m return</th><th style={th}>Volatility</th><th style={th}>Score</th>
            <th style={th}>Traded/day</th><th style={th}>Close</th>
            {mode && <><th style={th}>Guide in 6 months (good / bad)</th><th style={th}>Guide in 12 months (good / bad)</th></>}
            <th style={th}>Pick</th><th style={th}>In your book</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.symbol} style={{ opacity: !dim || r.selected || r.held ? 1 : 0.55 }}>
              <td style={td}>{r.rank}</td>
              <td style={{ ...td, fontWeight: 600 }}>{r.symbol}</td>
              <td style={td}>{r.industry}</td>
              <td style={{ ...td, ...gain(r.momentumPct ?? 0) }}>{r.momentumPct == null ? '' : pct(r.momentumPct)}</td>
              <td style={td}>{r.volatilityPct == null ? '' : `${r.volatilityPct.toFixed(0)}%`}</td>
              <td style={td}>{r.scorePct.toFixed(0)}</td>
              <td style={td}>₹{r.tradedValueCr.toFixed(0)} Cr</td>
              <td style={td}>{price(r.lastClose)}</td>
              {mode && <><td style={td}>{guide(r.lastClose, 'sixMonths')}</td><td style={td}>{guide(r.lastClose, 'twelveMonths')}</td></>}
              <td style={td}>{r.selected ? 'Yes' : ''}</td>
              <td style={td}>{r.held ? 'Held' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The trades that would take the book to the mode being looked at. Nothing happens until the button is pressed. */
function ActionCard({ plan, busy, onRun }: { plan: MonthlyPlan; busy: boolean; onRun: () => void }) {
  const cautions = plan.cautions ?? {}
  const { action, book } = plan
  const label = MODES[plan.mode].label
  const title =
    action.kind === 'start' ? `Start your paper book in ${label}`
    : action.kind === 'switch' ? `Switch your book from ${MODES[book.mode!].label} to ${label}`
    : `This month's rebalance (${label})`
  const intro =
    action.kind === 'start' ? `Buys ${label}'s picks in equal amounts with ${inr(book.startingCapital)} of paper money.`
    : action.kind === 'switch' ? `Your book follows ${MODES[book.mode!].label}. These orders would sell what ${label} does not pick and buy what it does. Leave this alone if you only wanted to look.`
    : 'The monthly update of your book: sell what the rule drops, buy the replacements.'
  const button = action.kind === 'start' ? 'Start paper book' : action.kind === 'switch' ? `Switch book to ${label}` : 'Record paper rebalance'
  const sells = action.orders.filter(o => o.side === 'SELL').length

  return (
    <div style={{ ...card, borderColor: action.kind === 'switch' ? '#f59e0b' : 'rgba(255,255,255,0.1)' }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <p style={muted}>{intro}</p>
      {action.notes.map(n => <p key={n} style={{ ...muted, color: '#fbbf24' }}>{n}</p>)}
      {action.blocked && (
        <p style={{ fontWeight: 600 }}>
          Not available now: {action.blocked}
          {action.orders.length > 0 && ' The orders below only show what it would do at today\'s prices.'}
        </p>
      )}

      {action.orders.length > 0 && (
        <>
          <p style={muted}>
            {sells} to sell and {action.orders.length - sells} to buy, at {plan.prices.source === 'live' ? 'current' : 'last close'} prices.
            Estimated costs {inr(action.estimatedCosts)}. Cash left after: {inr(action.cashAfter)}.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr><th style={th}>Action</th><th style={th}>Stock</th><th style={th}>Qty</th><th style={th}>Price</th><th style={th}>Value</th><th style={th}>Why</th></tr>
              </thead>
              <tbody>
                {action.orders.map(o => (
                  <tr key={o.side + o.symbol}>
                    <td style={{ ...td, color: o.side === 'BUY' ? '#34d399' : '#f87171', fontWeight: 700 }}>{o.side === 'BUY' ? 'Buy' : 'Sell'}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{o.symbol}<CautionNote caution={cautions[o.symbol]} /></td>
                    <td style={td}>{o.qty}</td>
                    <td style={td}>{price(o.price)}</td>
                    <td style={td}>{inr(o.value)}</td>
                    <td style={td}>{o.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {action.canExecute && (
        <button
          onClick={onRun}
          disabled={busy}
          style={{
            marginTop: 14, padding: '10px 18px', borderRadius: 8, border: 'none', fontWeight: 700,
            cursor: busy ? 'not-allowed' : 'pointer', background: '#2563eb', color: '#fff',
          }}
        >
          {busy ? 'Recording…' : button}
        </button>
      )}
    </div>
  )
}

/** The user's real Zerodha holdings, read only, placed against each mode's ranking. */
function BrokerHoldingsCard({ plan, live }: { plan: MonthlyPlan; live: LiveView | null }) {
  const cautions = live?.cautions ?? {}
  const rows = live?.brokerHoldings
  const value = rows?.reduce((sum, h) => sum + h.value, 0) ?? 0
  const cost = rows?.reduce((sum, h) => sum + h.cost, 0) ?? 0

  return (
    <div style={card}>
      <h3 style={{ marginTop: 0 }}>Your Zerodha holdings against the plan</h3>
      {!plan.brokerConnected ? (
        <p style={{ ...muted, marginBottom: 0 }}>
          Connect Zerodha to see the shares you really own here, with current price, profit and where each one ranks in the three
          modes. This only reads your holdings. <a href={KITE_LOGIN} style={{ color: '#60a5fa' }}>Connect Zerodha</a>
        </p>
      ) : !live ? (
        <p style={{ ...muted, marginBottom: 0 }}>Loading your holdings…</p>
      ) : !rows ? (
        <p style={{ ...muted, marginBottom: 0 }}>Zerodha did not return your holdings. Try reconnecting.</p>
      ) : rows.length === 0 ? (
        <p style={{ ...muted, marginBottom: 0 }}>Your Zerodha account has no delivery holdings.</p>
      ) : (
        <>
          <p style={muted}>
            Read only: nothing here places an order. The last three columns show each share&apos;s rank at {plan.asOf} out of {plan.universe.ranked} ranked
            stocks. &quot;Pick&quot; means that mode would hold it this month. &quot;Not ranked&quot; means it is outside the {plan.universe.size} most
            traded stocks, or has too little history.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Stock</th><th style={th}>Qty</th><th style={th}>Bought at</th><th style={th}>Now</th>
                  <th style={th}>Today</th><th style={th}>Value</th><th style={th}>Profit / loss</th>
                  {MODE_IDS.map(m => <th key={m} style={th}>{MODES[m].label}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.slice().sort((a, b) => b.value - a.value).map(h => (
                  <tr key={h.exchange + h.symbol}>
                    <td style={{ ...td, fontWeight: 600 }}>{h.symbol}<CautionNote caution={cautions[h.symbol]} /></td>
                    <td style={td}>{h.quantity}</td>
                    <td style={td}>{price(h.averagePrice)}</td>
                    <td style={td}>{price(h.lastPrice)}</td>
                    <td style={{ ...td, ...gain(h.dayChangePct ?? 0) }}>{h.dayChangePct == null ? '' : pct(h.dayChangePct, 2)}</td>
                    <td style={td}>{inr(h.value)}</td>
                    <td style={{ ...td, ...gain(h.pnl), whiteSpace: 'nowrap' }}>{h.pnl >= 0 ? '+' : '-'}{inr(Math.abs(h.pnl))} ({pct(h.pnlPct)})</td>
                    {MODE_IDS.map(m => {
                      const rank = plan.modeRanks[h.symbol]?.[m]
                      const pick = plan.modePicks[m].includes(h.symbol)
                      return (
                        <td key={m} style={{ ...td, color: pick ? '#34d399' : undefined, fontWeight: pick ? 700 : undefined, opacity: rank ? 1 : 0.6 }}>
                          {rank ? `${rank}${pick ? ' · Pick' : ''}` : 'Not ranked'}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                <tr>
                  <td style={{ ...td, fontWeight: 700 }} colSpan={5}>Total</td>
                  <td style={{ ...td, fontWeight: 700 }}>{inr(value)}</td>
                  <td style={{ ...td, fontWeight: 700, ...gain(value - cost) }} colSpan={4}>
                    {value - cost >= 0 ? '+' : '-'}{inr(Math.abs(value - cost))}{cost > 0 ? ` (${pct((value / cost - 1) * 100)})` : ''}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

const INDEX_NAMES: Record<string, string> = {
  'IDX:NIFTY 500': 'NIFTY 500 index',
  'IDX:NIFTY500 EW': 'NIFTY 500 equal-weight index',
}
const dayOf = (d: number) => `${String(d).slice(0, 4)}-${String(d).slice(4, 6)}-${String(d).slice(6, 8)}`

/**
 * How the mode's own picks have done since they started being recorded. The
 * picks are frozen each month-end and replayed with the backtest's simulator.
 */
function LiveRecordCard({ record, mode }: { record: TrackRecord | null; mode: Mode }) {
  const live = record?.modes[mode]
  if (!record || !live) {
    return (
      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Live record of {MODES[mode].label} picks</h3>
        <p style={{ ...muted, marginBottom: 0 }}>
          Nothing recorded yet. After each month-end the app saves this mode&apos;s 20 picks and then measures them against
          the NIFTY 500, whether or not you rebalance the paper book. A backtest can be flattered by hindsight; this cannot.
        </p>
      </div>
    )
  }

  const rows: Array<[string, number | null, number | null]> = [
    [`${MODES[mode].label} picks, after costs`, live.afterTax.returnPct, live.afterTax.maxDrawdownPct],
    ['Same, with the trend filter', live.withTrendFilterAfterTax.returnPct, live.withTrendFilterAfterTax.maxDrawdownPct],
    ...record.benchmarks.map(b => [`${INDEX_NAMES[b] ?? b}, price only`, live.benchmarks[b] ?? null, null] as [string, number | null, number | null]),
  ]
  const scored = live.picks.filter(p => p.benchmarkPct != null)
  const ahead = scored.filter(p => p.returnPct > p.benchmarkPct!).length
  const late = live.recorded.filter(r => (Date.parse(r.recordedAt) - Date.parse(r.signalDate)) / 86400000 > 5)

  return (
    <div style={card}>
      <h3 style={{ marginTop: 0 }}>Live record of {MODES[mode].label} picks</h3>
      <p style={muted}>
        From {dayOf(live.started)} to {dayOf(live.asOf)}: {live.signals} month{live.signals === 1 ? '' : 's'} of picks, saved at each
        month-end and never changed afterwards. Too short to judge yet; it needs a year or more.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Since {dayOf(live.started)}</th><th style={th}>Return</th><th style={th}>Worst fall</th></tr></thead>
          <tbody>
            {rows.map(([name, ret, fall], i) => (
              <tr key={name} style={{ fontWeight: i === 0 ? 700 : 400 }}>
                <td style={td}>{name}</td>
                <td style={{ ...td, color: ret == null ? undefined : ret >= 0 ? '#34d399' : '#f87171' }}>{ret == null ? 'no data' : pct(ret, 2)}</td>
                <td style={td}>{fall == null ? '' : `${(Math.abs(fall) < 0.05 ? 0 : fall).toFixed(1)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={muted}>
        Measured like the backtest: bought the session after the month-end at that day&apos;s average price, with charges and
        slippage. Capital gains tax is deducted each April, so it is not in these figures yet. Dividends are not counted on
        either side.
        {late.length > 0 && ` The picks for ${late.map(r => r.signalDate).join(', ')} were saved on ${late[0].recordedAt}, after that month had started.`}
      </p>

      <details>
        <summary style={{ cursor: 'pointer' }}>
          Every pick ({live.picks.length}){scored.length > 0 && `: ${ahead} of ${scored.length} ahead of the NIFTY 500 so far`}
        </summary>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
            <thead>
              <tr>
                <th style={th}>Stock</th><th style={th}>Picked</th><th style={th}>Rank</th><th style={th}>Bought at</th>
                <th style={th}>Now / sold at</th><th style={th}>Return</th><th style={th}>NIFTY 500, same days</th><th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {live.picks.map(p => (
                <tr key={`${p.symbol}-${p.signalDate}`}>
                  <td style={{ ...td, fontWeight: 600 }}>{p.symbol}</td>
                  <td style={td}>{dayOf(p.signalDate)}</td>
                  <td style={td}>{p.rank}</td>
                  <td style={td}>{p.entryPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                  <td style={td}>{p.lastPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                  <td style={{ ...td, color: p.returnPct >= 0 ? '#34d399' : '#f87171' }}>{pct(p.returnPct)}</td>
                  <td style={td}>{p.benchmarkPct == null ? '' : pct(p.benchmarkPct)}</td>
                  <td style={td}>{p.exitDate ? `sold ${dayOf(p.exitDate)}` : 'held'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
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
        <h3 style={{ marginTop: 0 }}>Your paper book against NIFTY 500</h3>
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
      <h3 style={{ marginTop: 0 }}>Your paper book against NIFTY 500</h3>
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
