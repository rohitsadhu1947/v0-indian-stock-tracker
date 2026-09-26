/**
 * Portfolio engine data access: daily bars in, freshness checks, and the
 * daily update from a batched quote call.
 */

import { db } from '@/db'
import { dailyBars } from '@/db/schema'
import { and, eq, gte, inArray, sql } from 'drizzle-orm'
import type { BrokerClient } from '@/lib/broker'
import { INDEX_INSTRUMENTS, SLEEVE_FUNDS } from './config'
import { UNIVERSE_SYMBOLS } from './universe'
import type { DailyBar } from './momentum'

const IST_OFFSET_MS = 5.5 * 3600 * 1000

export function istDate(d: Date = new Date()): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
}

/** Bars for the given symbols from `sinceDate` onward, oldest first. */
export async function loadBars(symbols: string[], sinceDate: string): Promise<Record<string, DailyBar[]>> {
  const rows = await db
    .select({ symbol: dailyBars.symbol, date: dailyBars.date, close: dailyBars.close, volume: dailyBars.volume })
    .from(dailyBars)
    .where(and(inArray(dailyBars.symbol, symbols), gte(dailyBars.date, sinceDate)))
    .orderBy(dailyBars.symbol, dailyBars.date)

  const out: Record<string, DailyBar[]> = {}
  for (const r of rows) {
    ;(out[r.symbol] ??= []).push({ date: String(r.date), close: r.close, volume: r.volume })
  }
  return out
}

export interface DataFreshness {
  latestDate: string | null
  coveragePct: number          // share of the universe with a bar on latestDate
  staleTradingDays: number     // weekdays between latestDate and today (IST)
  ok: boolean
  message: string
}

function weekdaysBetween(from: string, to: string): number {
  let n = 0
  const d = new Date(from + 'T00:00:00Z')
  const end = new Date(to + 'T00:00:00Z')
  while (d < end) {
    d.setUTCDate(d.getUTCDate() + 1)
    const day = d.getUTCDay()
    if (day !== 0 && day !== 6) n++
  }
  return n
}

export async function dataFreshness(): Promise<DataFreshness> {
  const [latest] = await db
    .select({ date: sql<string>`max(${dailyBars.date})::text` })
    .from(dailyBars)
    .where(eq(dailyBars.symbol, INDEX_INSTRUMENTS.NIFTY_200.barSymbol))

  if (!latest?.date) {
    return { latestDate: null, coveragePct: 0, staleTradingDays: Infinity, ok: false, message: 'No price history loaded yet.' }
  }

  const [cov] = await db
    .select({ n: sql<number>`count(distinct ${dailyBars.symbol})::int` })
    .from(dailyBars)
    .where(and(eq(dailyBars.date, latest.date), inArray(dailyBars.symbol, UNIVERSE_SYMBOLS)))

  const coveragePct = (cov.n / UNIVERSE_SYMBOLS.length) * 100
  const today = istDate()
  // The latest bar should be the previous session (or today after the close)
  const stale = Math.max(0, weekdaysBetween(latest.date, today) - 1)
  const ok = stale <= 2 && coveragePct >= 90

  return {
    latestDate: latest.date,
    coveragePct,
    staleTradingDays: stale,
    ok,
    message: ok
      ? `Prices current to ${latest.date} (${coveragePct.toFixed(0)}% of stocks).`
      : `Prices only current to ${latest.date}${stale ? `, ${stale} trading day(s) behind` : ''} (${coveragePct.toFixed(0)}% coverage). Log in with Kite so the daily update can run, or run scripts/backfill-daily-bars.mjs.`,
  }
}

/**
 * Record today's bar for the whole universe from batched quotes (Kite allows
 * 500 instruments per call). Called by the end-of-day cron before the close,
 * so today's bar is provisional; the quote's `ohlc.close` is the previous
 * session's official close, which finalises yesterday's provisional bar.
 *
 * Skips instruments whose last trade is not from today (holidays, suspended).
 */
export async function updateDailyBarsFromQuotes(client: BrokerClient): Promise<{
  written: number; finalised: number; skipped: number; date: string
}> {
  const today = istDate()
  const instruments: Array<{ quoteKey: string; barSymbol: string }> = [
    ...Object.values(INDEX_INSTRUMENTS).map(i => ({ quoteKey: i.quoteKey, barSymbol: i.barSymbol })),
    ...UNIVERSE_SYMBOLS.map(s => ({ quoteKey: `NSE:${s}`, barSymbol: s })),
    ...Object.values(SLEEVE_FUNDS).filter((f): f is string => !!f).map(f => ({ quoteKey: `NSE:${f}`, barSymbol: f })),
  ]

  const quotes: Record<string, any> = {}
  for (let i = 0; i < instruments.length; i += 450) {
    Object.assign(quotes, await client.getQuote(instruments.slice(i, i + 450).map(x => x.quoteKey)))
  }

  const rows: Array<typeof dailyBars.$inferInsert> = []
  const previousCloses: Array<{ symbol: string; close: number }> = []
  let skipped = 0

  for (const { quoteKey, barSymbol } of instruments) {
    const q = quotes[quoteKey]
    const raw = q?.raw ?? q
    const ltp = q?.lastPrice ?? raw?.last_price
    const ohlc = raw?.ohlc ?? q?.ohlc
    const traded = raw?.last_trade_time ?? raw?.timestamp
    if (!(ltp > 0) || !ohlc) { skipped++; continue }
    if (traded && istDate(new Date(traded)) !== today) { skipped++; continue }

    rows.push({
      symbol: barSymbol,
      date: today,
      open: ohlc.open || ltp,
      high: Math.max(ohlc.high || ltp, ltp),
      low: Math.min(ohlc.low || ltp, ltp),
      close: ltp,
      volume: raw?.volume ?? q?.volume ?? 0,
      provisional: true,
    })
    if (ohlc.close > 0) previousCloses.push({ symbol: barSymbol, close: ohlc.close })
  }

  for (let i = 0; i < rows.length; i += 500) {
    await db.insert(dailyBars).values(rows.slice(i, i + 500)).onConflictDoUpdate({
      target: [dailyBars.symbol, dailyBars.date],
      set: {
        open: sql`excluded.open`, high: sql`excluded.high`, low: sql`excluded.low`,
        close: sql`excluded.close`, volume: sql`excluded.volume`, provisional: sql`excluded.provisional`,
      },
    })
  }

  // Finalise each symbol's latest earlier provisional bar with the official
  // previous close, in one statement
  let finalised = 0
  if (previousCloses.length) {
    const values = sql.join(previousCloses.map(p => sql`(${p.symbol}, ${p.close}::double precision)`), sql`, `)
    const res = await db.execute(sql`
      update daily_bars d set close = v.close, provisional = false
      from (values ${values}) as v(symbol, close)
      where d.symbol = v.symbol and d.provisional = true and d.date < ${today}::date
        and d.date = (select max(x.date) from daily_bars x where x.symbol = v.symbol and x.date < ${today}::date)`)
    finalised = (res as any).count ?? 0
  }

  return { written: rows.length, finalised, skipped, date: today }
}

/** Latest known price per symbol: live quote when available, else last close. */
export async function latestPrices(
  symbols: string[],
  client: BrokerClient | null
): Promise<{ prices: Record<string, number>; source: 'live' | 'last close' }> {
  if (client && symbols.length) {
    try {
      const quotes = await client.getQuote(symbols.map(s => `NSE:${s}`))
      const prices: Record<string, number> = {}
      for (const [key, q] of Object.entries<any>(quotes)) {
        const ltp = q?.lastPrice ?? q?.last_price
        if (ltp > 0) prices[key.split(':')[1]] = ltp
      }
      if (Object.keys(prices).length >= symbols.length * 0.9) return { prices, source: 'live' }
    } catch {
      // fall through to stored closes
    }
  }

  const rows = await db
    .selectDistinctOn([dailyBars.symbol], { symbol: dailyBars.symbol, close: dailyBars.close })
    .from(dailyBars)
    .where(inArray(dailyBars.symbol, symbols))
    .orderBy(dailyBars.symbol, sql`${dailyBars.date} desc`)
  const prices: Record<string, number> = {}
  for (const r of rows) prices[r.symbol] = r.close
  return { prices, source: 'last close' }
}
