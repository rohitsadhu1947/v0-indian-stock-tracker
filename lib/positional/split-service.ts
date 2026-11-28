/**
 * The split run-up paper tracker. Each evening it reads the splits NSE lists,
 * opens a paper trade near the next session's close and closes it near the
 * close of the last session before the ex-date. No orders are placed.
 */
import { db } from '@/db'
import { dailyBars, positionalTrades } from '@/db/schema'
import { and, asc, desc, eq, gt, gte, inArray, lte } from 'drizzle-orm'
import type { BrokerClient } from '@/lib/broker'
import logger from '@/lib/logger'
import { parseCorporateActionsFile } from '@/lib/market-data/nse-parse'
import { dataFreshness, liveUniverse } from '@/lib/portfolio/data'
import { liveQuotes } from '@/lib/portfolio/live'
import { sendTelegramMessage } from '@/lib/telegram-alerts'
import { netPct } from './core'
import { addDays, adminTelegram, firstLine, sessionsSince } from './service'
import { enoughTime, isSellDay, nextWeekday, SPLIT_SIGNAL, SPLIT_UNIVERSE, splitListings, splitText, weekdayBefore } from './splits'

interface SplitDetail { exDate: string; purpose: string; from: number; to: number; reason?: string; signalClose?: number | null }
const detailOf = (row: { detail: unknown }) => (row.detail ?? {}) as SplitDetail

/**
 * Store the splits listed in a day's corporate-action file. A split is stored
 * once, on the day it is first seen: as a signal when the stock is in the
 * universe and the ex-date leaves time to trade, otherwise as skipped with the
 * reason. `seed` stores everything as skipped: used on the first file read,
 * where a listing may be days old. Errors are logged, never thrown.
 */
export async function storeSplitListings(bc: string | null, date: string, opts: { seed?: boolean } = {}): Promise<{ signals: string[]; skipped: string[] }> {
  const out = { signals: [] as string[], skipped: [] as string[] }
  if (!bc) return out
  try {
    const listed = splitListings(parseCorporateActionsFile(bc)).filter(l => l.exDate > date)
    if (!listed.length) return out
    const known = await db.select({ symbol: positionalTrades.symbol, detail: positionalTrades.detail }).from(positionalTrades)
      .where(and(eq(positionalTrades.signal, SPLIT_SIGNAL), inArray(positionalTrades.symbol, listed.map(l => l.symbol))))
    const seen = new Set(known.map(k => `${k.symbol}|${detailOf(k).exDate}`))
    const fresh = listed.filter(l => !seen.has(`${l.symbol}|${l.exDate}`))
    if (!fresh.length) return out
    const universe = new Set(await liveUniverse(date, SPLIT_UNIVERSE))
    const closes = new Map((await db.select({ symbol: dailyBars.symbol, close: dailyBars.close }).from(dailyBars)
      .where(and(inArray(dailyBars.symbol, fresh.map(l => l.symbol)), eq(dailyBars.date, date)))).map(r => [r.symbol, r.close]))
    const rows = fresh.map(l => {
      const reason = opts.seed ? 'listed before tracking began'
        : !universe.has(l.symbol) ? `not among the ${SPLIT_UNIVERSE} most traded stocks`
        : !enoughTime(date, l.exDate) ? 'ex-date too close to trade' : undefined
      const detail: SplitDetail = { exDate: l.exDate, purpose: l.purpose, from: l.from, to: l.to, signalClose: closes.get(l.symbol) ?? null, ...(reason ? { reason } : {}) }
      return { signal: SPLIT_SIGNAL, symbol: l.symbol, signalDate: date, status: reason ? 'skipped' : 'new', detail }
    })
    const inserted = await db.insert(positionalTrades).values(rows).onConflictDoNothing().returning({ symbol: positionalTrades.symbol, status: positionalTrades.status })
    out.signals = inserted.filter(r => r.status === 'new').map(r => r.symbol)
    out.skipped = inserted.filter(r => r.status === 'skipped').map(r => r.symbol)
  } catch (error) {
    logger.warn('Split listings not stored', { error: firstLine(error) })
  }
  return out
}

export interface SplitRun { asOf: string | null; signals: string[]; opened: number; closed: string[]; sellTomorrow: string[]; problem?: string }

/**
 * One run, on the latest session in the price table (or `asOf`). Safe to run
 * more than once: trades move on only when there is a new session.
 */
export async function runSplitWatch(opts: { asOf?: string; notify?: boolean } = {}): Promise<SplitRun> {
  const run: SplitRun = { asOf: null, signals: [], opened: 0, closed: [], sellTomorrow: [] }
  try {
    const asOf = opts.asOf ?? (await dataFreshness()).latestDate
    if (!asOf) return run
    run.asOf = asOf
    const live = await db.select().from(positionalTrades).where(and(eq(positionalTrades.signal, SPLIT_SIGNAL), inArray(positionalTrades.status, ['new', 'open'])))
    if (!live.length) return run
    const earliest = live.map(t => t.signalDate).sort()[0]
    const sessions = await sessionsSince(earliest, asOf)
    const prices = await db.select({ symbol: dailyBars.symbol, date: dailyBars.date, close: dailyBars.close }).from(dailyBars)
      .where(and(inArray(dailyBars.symbol, [...new Set(live.map(t => t.symbol))]), gte(dailyBars.date, earliest), lte(dailyBars.date, asOf)))
    const closeOn = new Map(prices.map(p => [`${p.symbol}|${p.date}`, p.close]))
    const fresh: typeof live = []
    for (const t of live) {
      const { exDate } = detailOf(t)
      if (t.status === 'new') {
        if (t.signalDate === asOf) { fresh.push(t); run.signals.push(t.symbol); continue }
        const entryDate = sessions.find(d => d > t.signalDate)
        if (!entryDate) continue
        const close = closeOn.get(`${t.symbol}|${entryDate}`)
        // A holiday can leave no session to sell on after the buy
        const noTime = nextWeekday(entryDate) >= exDate
        await db.update(positionalTrades)
          .set(close && !noTime ? { status: 'open', entryDate, entryPrice: close } : { status: 'skipped', entryDate, detail: { ...detailOf(t), reason: noTime ? 'ex-date too close to trade' : 'no price on the entry day' } })
          .where(eq(positionalTrades.id, t.id))
        if (close && !noTime) run.opened++
        if (!close || noTime || entryDate !== asOf) continue
        t.status = 'open'; t.entryDate = entryDate
      }
      if (asOf >= exDate || isSellDay(asOf, exDate)) {
        // Sold at the close of the last session before the ex-date. Both closes are read now, so a price
        // adjustment made on the ex-date cannot distort the gain.
        const exitDate = sessions.filter(d => d < exDate && d >= t.entryDate!).pop()
        const entryClose = closeOn.get(`${t.symbol}|${t.entryDate}`), exitClose = exitDate ? closeOn.get(`${t.symbol}|${exitDate}`) : undefined
        if (!exitDate || !entryClose || !exitClose || exitDate === t.entryDate) {
          if (asOf >= exDate) await db.update(positionalTrades).set({ status: 'skipped', detail: { ...detailOf(t), reason: 'no price to sell at before the ex-date' } }).where(eq(positionalTrades.id, t.id))
          continue
        }
        const entryPrice = t.entryPrice ?? entryClose, exitPrice = entryPrice * exitClose / entryClose
        await db.update(positionalTrades).set({ status: 'closed', exitDate, exitPrice, netPct: netPct(entryPrice, exitPrice) }).where(eq(positionalTrades.id, t.id))
        run.closed.push(t.symbol)
      } else if (isSellDay(nextWeekday(asOf), exDate)) {
        run.sellTomorrow.push(t.symbol)
      }
    }
    if (opts.notify !== false && (fresh.length || run.sellTomorrow.length)) {
      await notify(run, fresh.map(t => ({ symbol: t.symbol, ...detailOf(t) }))).catch(error => logger.error('Split message failed', { error: firstLine(error) }))
    }
  } catch (error) {
    run.problem = firstLine(error)
    logger.error('Split watch failed', { error: run.problem })
  }
  logger.info('Split watch', { ...run })
  return run
}

async function notify(run: SplitRun, fresh: Array<{ symbol: string } & SplitDetail>): Promise<void> {
  const rupees = (n: number) => `Rs ${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
  const safe = (s: string) => s.replace(/[<>&]/g, ' ')
  const lines: string[] = []
  for (const f of fresh) {
    lines.push(
      `<b>PAPER BUY ${safe(f.symbol)}</b> (share split coming)`,
      `Why: its split date was listed today. ${splitText(f.from, f.to)} on ${f.exDate}.`,
      `Entry: next session, in the last half hour (after 3 pm).${f.signalClose ? ` Last close ${rupees(f.signalClose)}.` : ''}`,
      `Exit: sell in the last half hour of ${weekdayBefore(f.exDate)}, the last session before the split.`,
      'Stop: none in the tested rule.', '')
  }
  for (const symbol of run.sellTomorrow) lines.push(`<b>SELL ${safe(symbol)} next session, in the last half hour</b>: its split is the day after.`, '')
  lines.push('This rule is new and on paper only. In testing it beat the average stock by about 2% a trade over 231 trades. The app places no orders.')
  for (const a of await adminTelegram()) await sendTelegramMessage(a.token, a.chat, lines.join('\n'))
}

export interface SplitRow {
  symbol: string; status: string; signalDate: string
  exDate: string; split: string; signalClose: number | null
  /** The day to sell: the last weekday before the ex-date. */
  sellOn: string
  entryDate: string | null; entryPrice: number | null
  lastPrice: number | null; movePct: number | null
  exitDate: string | null; exitPrice: number | null; netPct: number | null
}

export interface SplitView {
  asOf: string | null
  /** Listed at the last close: buy next session. */
  fresh: SplitRow[]
  open: SplitRow[]
  closed: SplitRow[]
  tally: { trades: number; wins: number; avgNetPct: number }
}

/** Everything the Signals tab shows for split trades. Null when they cannot be read. */
export async function splitView(client: BrokerClient | null): Promise<SplitView | null> {
  try {
    const { latestDate } = await dataFreshness()
    const rows = await db.select().from(positionalTrades)
      .where(and(eq(positionalTrades.signal, SPLIT_SIGNAL), inArray(positionalTrades.status, ['new', 'open', 'closed']), gt(positionalTrades.signalDate, addDays(latestDate ?? '2026-01-01', -400))))
      .orderBy(desc(positionalTrades.signalDate), asc(positionalTrades.symbol))
    const live = rows.filter(r => r.status !== 'closed')
    const quotes = live.length ? await liveQuotes([...new Set(live.map(r => r.symbol))], client) : null
    const row = (r: typeof rows[number]): SplitRow => {
      const d = detailOf(r), lastPrice = quotes?.quotes[r.symbol]?.price ?? null
      return {
        symbol: r.symbol, status: r.status, signalDate: r.signalDate, exDate: d.exDate, split: splitText(d.from, d.to), signalClose: d.signalClose ?? null,
        sellOn: weekdayBefore(d.exDate), entryDate: r.entryDate, entryPrice: r.entryPrice, lastPrice,
        movePct: r.status === 'open' && r.entryPrice && lastPrice ? (lastPrice / r.entryPrice - 1) * 100 : null,
        exitDate: r.exitDate, exitPrice: r.exitPrice, netPct: r.netPct,
      }
    }
    const closed = rows.filter(r => r.status === 'closed'), nets = closed.map(r => r.netPct ?? 0)
    return {
      asOf: latestDate, fresh: rows.filter(r => r.status === 'new').map(row), open: rows.filter(r => r.status === 'open').map(row), closed: closed.slice(0, 50).map(row),
      tally: { trades: nets.length, wins: nets.filter(n => n > 0).length, avgNetPct: nets.length ? nets.reduce((a, b) => a + b, 0) / nets.length : 0 },
    }
  } catch (error) {
    logger.warn('Split trades could not be read', { error: firstLine(error) })
    return null
  }
}
