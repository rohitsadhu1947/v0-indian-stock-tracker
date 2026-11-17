/**
 * Current prices for the Monthly Plan: live from the broker when it is
 * connected, otherwise the last stored close. Callers always get told which.
 */
import { db } from '@/db'
import { sql } from 'drizzle-orm'
import type { BrokerClient, BrokerHolding } from '@/lib/broker'
import logger from '@/lib/logger'

export interface LiveQuote {
  price: number
  /** The close before `price`: yesterday's close when live, the close before last otherwise. */
  previousClose: number | null
}

export interface LiveQuotes {
  quotes: Record<string, LiveQuote>
  source: 'live' | 'last close'
  /** When the prices were read (ISO), or the date of the stored close. */
  at: string
  /** With a live source: the symbols the broker had no price for, shown at their last stored close. */
  lastCloseFor: string[]
}

/** Quotes for NSE symbols. Falls back to stored closes for any the broker did not return. */
export async function liveQuotes(symbols: string[], client: BrokerClient | null): Promise<LiveQuotes> {
  const quotes: Record<string, LiveQuote> = {}
  if (!symbols.length) return { quotes, source: client ? 'live' : 'last close', at: new Date().toISOString(), lastCloseFor: [] }

  if (client) {
    try {
      const raw = await client.getQuote(symbols.map(s => `NSE:${s}`))
      for (const [key, q] of Object.entries(raw)) {
        if (q.lastPrice > 0) quotes[key.split(':')[1]] = { price: q.lastPrice, previousClose: q.close > 0 ? q.close : null }
      }
    } catch (error: any) {
      // fall through to stored closes
      logger.warn('Broker quotes failed, using stored closes', { error: error?.message ?? String(error) })
    }
  }
  // The broker has no NSE quote for a few symbols (other series); the rest are still live
  const live = Object.keys(quotes).length >= symbols.length / 2
  const missing = symbols.filter(s => !quotes[s])
  let closeDate: string | null = null

  if (missing.length) {
    const rows = await db.execute(sql`
      select symbol, date::text as date, close, rn from (
        select symbol, date, close, row_number() over (partition by symbol order by date desc) as rn
        from daily_bars
        where symbol in (${sql.join(missing.map(s => sql`${s}`), sql`, `)}) and date >= current_date - 20
      ) recent where rn <= 2 order by symbol, rn`)
    for (const r of rows as unknown as Array<{ symbol: string; date: string; close: number; rn: number }>) {
      if (Number(r.rn) === 1) {
        quotes[r.symbol] = { price: Number(r.close), previousClose: null }
        if (!closeDate || r.date > closeDate) closeDate = r.date
      } else if (quotes[r.symbol]) {
        quotes[r.symbol].previousClose = Number(r.close)
      }
    }
  }
  return live
    ? { quotes, source: 'live', at: new Date().toISOString(), lastCloseFor: missing }
    : { quotes, source: 'last close', at: closeDate ?? new Date().toISOString(), lastCloseFor: [] }
}

/** The user's real holdings at the broker, or null when it is not connected or the call fails. */
export async function brokerHoldings(client: BrokerClient | null): Promise<BrokerHolding[] | null> {
  if (!client) return null
  try {
    return (await client.getHoldings()).sort((a, b) => b.quantity * b.lastPrice - a.quantity * a.lastPrice)
  } catch {
    return null
  }
}
