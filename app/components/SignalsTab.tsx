'use client'

/**
 * Signals: what to buy or sell today, at what price, where the stop is and
 * when to get out. Only rules that passed testing appear here. The app
 * places no orders.
 */

import React, { useCallback, useEffect, useState } from 'react'
import type { DayTradeView, MonthlyView } from '@/lib/signals/service'
import { sharesFor, type DayTradeSignal, type DayTradeState } from '@/lib/signals/core'
import { useUIStore } from '@/lib/stores/ui-store'

const AMOUNT_KEY = 'signals.dayTradeAmount'
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 20, marginBottom: 16,
}
const muted: React.CSSProperties = { opacity: 0.7, fontSize: '0.9em' }
const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.15)', fontWeight: 600, fontSize: '0.85em', opacity: 0.85, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '8px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.92em', whiteSpace: 'nowrap' }
const rupees = (n: number | null | undefined, digits = 2) => (n == null ? 'n/a' : `₹${n.toLocaleString('en-IN', { maximumFractionDigits: digits })}`)
const day = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const badge = (color: string): React.CSSProperties => ({
  display: 'inline-block', padding: '3px 10px', borderRadius: 6, fontWeight: 700, fontSize: '0.8em', letterSpacing: 0.3, color: '#fff', background: color,
})
const BUY = '#059669', SELL = '#dc2626'

const STATE: Record<DayTradeState, { text: string; color: string }> = {
  waiting: { text: 'Sell at 09:20', color: '#d97706' },
  open: { text: 'Open', color: '#2563eb' },
  stopped: { text: 'Stop hit: trade over', color: '#dc2626' },
  closed: { text: 'Closed at 15:15', color: '#4b5563' },
  missed: { text: 'No prices for the day', color: '#4b5563' },
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ ...muted, width: 70, flexShrink: 0 }}>{label}</div>
      <div>{children}</div>
    </div>
  )
}

function DayTradeCard({ s, amount, today }: { s: DayTradeSignal; amount: number; today: string }) {
  const planPrice = s.entryPrice ?? s.referencePrice
  const shares = sharesFor(amount, planPrice)
  const state = STATE[s.state]
  const pnl = s.movePct != null && s.entryPrice ? (s.movePct / 100) * s.entryPrice * shares : null
  const moveColor = s.movePct == null ? undefined : s.movePct > 0 ? '#34d399' : s.movePct < 0 ? '#f87171' : undefined
  return (
    <div style={{ ...card, marginBottom: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={badge(SELL)}>SELL SHORT</span>
        <span style={{ fontWeight: 700, fontSize: '1.2em' }}>{s.symbol}</span>
        <span style={badge(state.color)}>{state.text}</span>
      </div>
      <div style={{ ...muted, marginBottom: 8 }}>{s.tradeDate === today ? 'Today' : day(s.tradeDate)}, intraday. {s.reason}.</div>
      <Line label="Entry">
        {s.entryPrice
          ? <>Sold at <b>{rupees(s.entryPrice)}</b>, the 09:20 price</>
          : <>Sell at <b>09:20</b>, at the market price. Last price {rupees(s.referencePrice)}</>}
      </Line>
      <Line label="Stop">
        {s.entryPrice
          ? <>Buy back if it reaches <b>{rupees(s.stopPrice)}</b> (3% above the entry)</>
          : <>3% above your sell price. About <b>{rupees(s.stopPrice)}</b> at the last price</>}
      </Line>
      <Line label="Exit">Buy back at <b>15:15</b> if the stop has not been hit</Line>
      <Line label="Shares">{shares > 0 ? <><b>{shares}</b> for {rupees(amount, 0)}</> : 'Set an amount above'}</Line>
      {s.state !== 'waiting' && s.state !== 'missed' && (
        <Line label={s.state === 'open' ? 'Now' : 'Result'}>
          {rupees(s.lastPrice)}{' '}
          <b style={{ color: moveColor }}>
            {s.movePct != null && `${s.movePct >= 0 ? '+' : ''}${s.movePct.toFixed(2)}%`}
            {pnl != null && ` (${pnl >= 0 ? '+' : '-'}${rupees(Math.abs(pnl), 0)})`}
          </b>
          <span style={muted}> before costs of about 0.3%</span>
        </Line>
      )}
    </div>
  )
}

export default function SignalsTab() {
  const setActiveTab = useUIStore(s => s.setActiveTab)
  const [dayView, setDayView] = useState<DayTradeView | null>(null)
  const [monthly, setMonthly] = useState<MonthlyView | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [amount, setAmount] = useState(50000)

  useEffect(() => {
    try { const saved = Number(localStorage.getItem(AMOUNT_KEY)); if (saved >= 1000) setAmount(saved) } catch { /* no storage */ }
  }, [])
  const changeAmount = (value: number) => {
    setAmount(value)
    try { localStorage.setItem(AMOUNT_KEY, String(value)) } catch { /* no storage */ }
  }

  const load = useCallback(async (part?: 'day') => {
    try {
      const res = await fetch(`/api/signals${part ? '?part=day' : ''}`)
      if (res.status === 401) { window.location.href = '/login'; return }
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Could not load the signals')
      setDayView(json.day)
      if (!part) setMonthly(json.monthly)
      setError(null)
    } catch (e: any) { setError(e.message) }
  }, [])

  useEffect(() => { load() }, [load])
  // While a day trade is waiting or open on the trade date, refresh its prices every 30 seconds
  const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
  const active = (dayView?.signals ?? []).some(s => s.tradeDate === today && (s.state === 'open' || s.state === 'waiting'))
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => load('day'), 30000)
    return () => clearInterval(timer)
  }, [active, load])

  const buys = monthly?.orders.filter(o => o.side === 'BUY') ?? [], sells = monthly?.orders.filter(o => o.side === 'SELL') ?? []
  return (
    <div>
      <div style={card}>
        <h2 style={{ margin: '0 0 6px' }}>🎯 Signals</h2>
        <p style={{ ...muted, margin: 0 }}>
          What to buy or sell, at what price, where the stop is and when to get out. Only rules that passed testing show here. The app
          places no orders: you place them with your broker.
        </p>
      </div>

      {error && <div style={{ ...card, borderColor: '#ef4444', color: '#fca5a5' }}>⚠️ {error}</div>}
      {!dayView && !error && <div style={card}>Loading the signals…</div>}

      {dayView && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>Day trades</h3>
            <label style={muted}>
              Amount per trade ₹{' '}
              <input
                type="number" min={1000} step={5000} value={amount} onChange={e => changeAmount(Number(e.target.value))} aria-label="Amount per day trade in rupees"
                style={{ width: 110, padding: '5px 8px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.25)', color: '#fff' }}
              />
            </label>
          </div>
          <p style={{ ...muted, margin: '6px 0 12px' }}>
            Evidence: modest. These shorts made about 0.2% to 0.3% a trade after costs over 2015 to 2026, and have been weak since 2025.
            Keep the amount small. Short selling within the day needs an intraday (MIS) order, and your broker may not allow it on every
            stock. {dayView.prices === 'live' ? `Prices are live as of ${dayView.at.slice(11)}.` : 'Zerodha is not connected, so prices are the last close and trades in progress cannot be followed.'}
          </p>
          {dayView.signals.length === 0
            ? <p style={{ margin: 0 }}>No day-trade signal for today or the next session. Most days have none. New ones are worked out after 8:30 pm.</p>
            : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
                {dayView.signals.map(s => <DayTradeCard key={`${s.signal}-${s.symbol}-${s.tradeDate}`} s={s} amount={amount} today={today} />)}
              </div>
            )}
        </div>
      )}

      {dayView && monthly === undefined && !error && <div style={card}>Loading the Monthly Plan orders…</div>}
      {monthly === null && <div style={{ ...card, borderColor: '#f59e0b' }}>The Monthly Plan orders could not be loaded. Open the Monthly Plan tab to see them.</div>}
      {monthly && (
        <div style={card}>
          <h3 style={{ margin: 0 }}>Monthly Plan orders</h3>
          <p style={{ ...muted, margin: '6px 0 12px' }}>
            Evidence: the strongest we have. The {monthly.modeLabel} ranking was backtested over 15 years, for holding a month or longer.
            Ranked on prices to {monthly.asOf}. {monthly.prices === 'live' ? 'Prices below are live.' : 'Prices below are the last close.'}
          </p>
          {monthly.blocked && <p style={{ color: '#fbbf24', marginTop: 0 }}>{monthly.blocked}</p>}
          {monthly.orders.length === 0
            ? <p style={{ margin: 0 }}>No orders now. The book already matches this month&apos;s plan. The next review is after the month&apos;s last trading day.</p>
            : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>{['Action', 'Stock', 'Shares', 'Price', 'Value', 'Why'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {[...sells, ...buys].map(o => (
                        <tr key={`${o.side}-${o.symbol}`}>
                          <td style={td}><span style={badge(o.side === 'BUY' ? BUY : SELL)}>{o.side}</span></td>
                          <td style={{ ...td, fontWeight: 600 }}>{o.symbol}</td>
                          <td style={td}>{o.qty}</td>
                          <td style={td}>{rupees(o.price)}</td>
                          <td style={td}>{rupees(o.value, 0)}</td>
                          <td style={{ ...td, whiteSpace: 'normal' }}>{o.why}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p style={{ ...muted, marginBottom: 0 }}>
                  <b>Entry:</b> any time in market hours, near the price shown. Sells first, then buys.{' '}
                  <b>Stop:</b> none. The plan was tested without one, holding through falls.{' '}
                  <b>Exit:</b> at a month-end review, when a stock&apos;s rank falls below {monthly.exitRank}.
                </p>
              </>
            )}
          <button
            onClick={() => setActiveTab('plan')}
            style={{ marginTop: 12, padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#fff', cursor: 'pointer' }}
          >
            Open the Monthly Plan to record these in the paper book
          </button>
        </div>
      )}

      <div style={{ ...card, ...muted }}>
        Swing trades, breakouts, gap trades and filing-based trades are not here because they lost money after costs when tested.
        A signal appears on this page only when its rule has made money in testing.
      </div>
    </div>
  )
}
