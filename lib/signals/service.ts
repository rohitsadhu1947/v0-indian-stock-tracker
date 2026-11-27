/**
 * Gathers the signals the Signals tab shows: the Monthly Plan's orders and
 * the day-trade shorts for today or the next session, with live prices when
 * the broker is connected.
 */
import { db } from '@/db'
import { paperDayTrades } from '@/db/schema'
import { asc, gte } from 'drizzle-orm'
import type { BrokerClient } from '@/lib/broker'
import type { WatchSignal } from '@/lib/fo-watch/core'
import logger from '@/lib/logger'
import { DEFAULT_MODE, MODES, PORTFOLIO_RULES } from '@/lib/portfolio/config'
import { liveQuotes } from '@/lib/portfolio/live'
import { buildMonthlyPlan } from '@/lib/portfolio/service'
import type { MinuteBar } from '@/lib/research/day-trade'
import { dayTradeSignal, type DayTradeSignal } from './core'

const IST_MS = 5.5 * 3600 * 1000

export interface DayTradeView {
  /** IST date and time the prices were read. */
  at: string
  brokerConnected: boolean
  /** live: from the broker now. last close: the broker is not connected. */
  prices: 'live' | 'last close'
  signals: DayTradeSignal[]
}

export interface MonthlyOrderView { symbol: string; side: 'BUY' | 'SELL'; qty: number; price: number; value: number; why: string }

export interface MonthlyView {
  modeLabel: string
  asOf: string
  bookExists: boolean
  /** start: no book yet. rebalance: the monthly update. switch: the book follows another mode. */
  kind: string
  prices: 'live' | 'last close'
  /** Why the orders cannot be acted on now, when they cannot. */
  blocked: string | null
  orders: MonthlyOrderView[]
  exitRank: number
}

// The broker's instrument list is large and changes once a day
let instruments: { day: string; tokens: Map<string, number | string> } | null = null
async function tokensFor(client: BrokerClient, day: string) {
  if (instruments?.day !== day) instruments = { day, tokens: new Map((await client.getInstruments('NSE')).map(i => [i.tradingsymbol, i.instrumentToken])) }
  return instruments.tokens
}

/** A session's minute bars so far for one NSE stock. Empty when the broker has no such instrument. */
export async function minuteBars(client: BrokerClient, symbol: string, day: string): Promise<MinuteBar[]> {
  const token = (await tokensFor(client, day)).get(symbol)
  if (!token) return []
  const candles = await client.getHistoricalData({
    instrumentToken: token, exchange: 'NSE', symbol, interval: 'minute',
    from: new Date(`${day}T09:00:00+05:30`), to: new Date(`${day}T15:35:00+05:30`),
  } as any)
  return candles.map(c => {
    const ist = new Date(new Date(c.date).getTime() + IST_MS)
    return [ist.getUTCHours() * 60 + ist.getUTCMinutes(), c.open, c.high, c.low, c.close, c.volume]
  })
}

/** Day-trade shorts for today and the next session. Empty when the tracker's table is not there. */
export async function dayTradeView(client: BrokerClient | null): Promise<DayTradeView> {
  const now = new Date(Date.now() + IST_MS)
  const today = now.toISOString().slice(0, 10), nowMinute = now.getUTCHours() * 60 + now.getUTCMinutes()
  const view: DayTradeView = { at: now.toISOString().slice(0, 16).replace('T', ' '), brokerConnected: !!client, prices: client ? 'live' : 'last close', signals: [] }
  let rows: Array<typeof paperDayTrades.$inferSelect> = []
  try {
    rows = await db.select().from(paperDayTrades).where(gte(paperDayTrades.tradeDate, today)).orderBy(asc(paperDayTrades.tradeDate), asc(paperDayTrades.symbol))
  } catch (error: any) {
    logger.warn('Day-trade signals could not be read', { error: String(error.cause?.message ?? error.message).split('\n')[0] })
    return view
  }
  if (!rows.length) return view

  const quotes = await liveQuotes([...new Set(rows.map(r => r.symbol))], client)
  view.prices = quotes.source
  for (const r of rows) {
    const isToday = r.tradeDate === today
    let bars: MinuteBar[] = []
    if (client && isToday && nowMinute >= 9 * 60 + 15) {
      try { bars = await minuteBars(client, r.symbol, today) } catch (error: any) {
        logger.warn('Minute prices failed for a day-trade signal', { symbol: r.symbol, error: error.message })
      }
    }
    view.signals.push(dayTradeSignal({
      symbol: r.symbol, signal: r.signal as WatchSignal, tradeDate: r.tradeDate, detail: (r.detail ?? {}) as Record<string, number>,
      bars, referencePrice: quotes.quotes[r.symbol]?.price ?? null,
      nowMinute: isToday ? nowMinute : null, dayOver: isToday && nowMinute > 15 * 60 + 30,
    }))
  }
  return view
}

/** The Monthly Plan's orders for the mode the book follows, or the default mode when there is no book. */
export async function monthlyView(userId: number, client: BrokerClient | null): Promise<MonthlyView> {
  let plan = await buildMonthlyPlan({ userId, mode: DEFAULT_MODE, client })
  if (plan.book.mode && plan.book.mode !== plan.mode) plan = await buildMonthlyPlan({ userId, mode: plan.book.mode, client })
  return {
    modeLabel: MODES[plan.mode].label, asOf: plan.asOf, bookExists: plan.book.exists, kind: plan.action.kind, prices: plan.prices.source,
    blocked: plan.action.blocked,
    orders: plan.action.orders.map(o => ({ symbol: o.symbol, side: o.side, qty: o.qty, price: o.price, value: o.value, why: o.why })),
    exitRank: PORTFOLIO_RULES.exitRank,
  }
}
