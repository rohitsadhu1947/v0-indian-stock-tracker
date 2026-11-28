/**
 * The big dividend paper tracker. Each evening it reads the dividends NSE
 * lists, opens a paper trade near the next session's close when the dividend
 * is 2% or more of the price, and closes it five sessions after the ex-date.
 * No orders are placed.
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
import { roughDateAfter } from './core'
import { DIVIDEND_SIGNAL, DIVIDEND_UNIVERSE, MIN_DIVIDEND_YIELD, SESSIONS_FROM_EX, enoughNotice, dividendExitDate, dividendListings, dividendNetPct, dividendYield, isBigDividend, sessionsFromEx } from './dividends'
import { addDays, adminTelegram, firstLine, sessionsSince } from './service'

interface DividendDetail { exDate: string; amount: number; yieldPct: number | null; purposes: string[]; signalClose: number | null; reason?: string }
const detailOf = (row: { detail: unknown }) => (row.detail ?? {}) as DividendDetail
const round2 = (x: number) => Math.round(x * 100) / 100

/**
 * Store the dividends listed in a day's corporate-action file, for stocks in
 * the universe. A dividend is stored once, on the day it is first seen: as a
 * signal when it is big enough and the ex-date leaves time to trade,
 * otherwise as skipped with the reason. `seed` stores everything as skipped:
 * used on the first file read, where a listing may be days old. Errors are
 * logged, never thrown.
 */
export async function storeDividendListings(bc: string | null, date: string, opts: { seed?: boolean } = {}): Promise<{ signals: string[]; skipped: number }> {
  const out = { signals: [] as string[], skipped: 0 }
  if (!bc) return out
  try {
    const universe = new Set(await liveUniverse(date, DIVIDEND_UNIVERSE))
    const listed = dividendListings(parseCorporateActionsFile(bc)).filter(l => l.exDate > date && universe.has(l.symbol))
    if (!listed.length) return out
    const known = await db.select({ symbol: positionalTrades.symbol, detail: positionalTrades.detail }).from(positionalTrades)
      .where(and(eq(positionalTrades.signal, DIVIDEND_SIGNAL), inArray(positionalTrades.symbol, listed.map(l => l.symbol))))
    const seen = new Set(known.map(k => `${k.symbol}|${detailOf(k).exDate}`))
    const fresh = listed.filter(l => !seen.has(`${l.symbol}|${l.exDate}`))
    if (!fresh.length) return out
    const closes = new Map((await db.select({ symbol: dailyBars.symbol, close: dailyBars.close }).from(dailyBars)
      .where(and(inArray(dailyBars.symbol, fresh.map(l => l.symbol)), eq(dailyBars.date, date)))).map(r => [r.symbol, r.close]))
    const rows = fresh.map(l => {
      const close = closes.get(l.symbol) ?? null, y = dividendYield(l.amount, close)
      const reason = opts.seed ? 'listed before tracking began'
        : y == null ? 'no price on the day it was listed'
        : !isBigDividend(y) ? `dividend under ${MIN_DIVIDEND_YIELD * 100}% of the price`
        : !enoughNotice(date, l.exDate) ? 'ex-date too close to trade' : undefined
      const detail: DividendDetail = { exDate: l.exDate, amount: l.amount, yieldPct: y == null ? null : round2(y * 100), purposes: l.purposes, signalClose: close, ...(reason ? { reason } : {}) }
      return { signal: DIVIDEND_SIGNAL, symbol: l.symbol, signalDate: date, status: reason ? 'skipped' : 'new', detail }
    })
    const inserted = await db.insert(positionalTrades).values(rows).onConflictDoNothing().returning({ symbol: positionalTrades.symbol, status: positionalTrades.status })
    out.signals = inserted.filter(r => r.status === 'new').map(r => r.symbol)
    out.skipped = inserted.filter(r => r.status === 'skipped').length
  } catch (error) {
    logger.warn('Dividend listings not stored', { error: firstLine(error) })
  }
  return out
}

export interface DividendRun { asOf: string | null; signals: string[]; opened: number; closed: string[]; sellTomorrow: string[]; problem?: string }

/**
 * One run, on the latest session in the price table (or `asOf`). Safe to run
 * more than once: trades move on only when there is a new session.
 */
export async function runDividendWatch(opts: { asOf?: string; notify?: boolean } = {}): Promise<DividendRun> {
  const run: DividendRun = { asOf: null, signals: [], opened: 0, closed: [], sellTomorrow: [] }
  try {
    const asOf = opts.asOf ?? (await dataFreshness()).latestDate
    if (!asOf) return run
    run.asOf = asOf
    const live = await db.select().from(positionalTrades).where(and(eq(positionalTrades.signal, DIVIDEND_SIGNAL), inArray(positionalTrades.status, ['new', 'open'])))
    if (!live.length) return run
    const earliest = live.map(t => t.signalDate).sort()[0]
    const sessions = await sessionsSince(earliest, asOf)
    const prices = await db.select({ symbol: dailyBars.symbol, date: dailyBars.date, close: dailyBars.close }).from(dailyBars)
      .where(and(inArray(dailyBars.symbol, [...new Set(live.map(t => t.symbol))]), gte(dailyBars.date, earliest), lte(dailyBars.date, asOf)))
    const closeOn = new Map(prices.map(p => [`${p.symbol}|${p.date}`, p.close]))
    const fresh: typeof live = []
    for (const t of live) {
      const d = detailOf(t)
      if (t.status === 'new') {
        if (t.signalDate === asOf) { fresh.push(t); run.signals.push(t.symbol); continue }
        const entryDate = sessions.find(s => s > t.signalDate)
        if (!entryDate) continue
        const close = closeOn.get(`${t.symbol}|${entryDate}`)
        // The buy must come before the ex-date, or there is no dividend to collect
        const tooLate = entryDate >= d.exDate
        await db.update(positionalTrades)
          .set(close && !tooLate ? { status: 'open', entryDate, entryPrice: close } : { status: 'skipped', entryDate, detail: { ...d, reason: tooLate ? 'ex-date too close to trade' : 'no price on the entry day' } })
          .where(eq(positionalTrades.id, t.id))
        if (close && !tooLate) run.opened++
        continue
      }
      const exitDate = dividendExitDate(sessions, d.exDate)
      if (exitDate) {
        // Both closes are read now, so a later price adjustment cannot distort the gain
        const entryClose = closeOn.get(`${t.symbol}|${t.entryDate}`)
        const exitClose = closeOn.get(`${t.symbol}|${exitDate}`) ?? prices.filter(p => p.symbol === t.symbol && String(p.date) <= exitDate).sort((a, b) => String(a.date).localeCompare(String(b.date))).pop()?.close
        if (!entryClose || !exitClose || !t.entryPrice) continue
        const exitPrice = t.entryPrice * exitClose / entryClose
        await db.update(positionalTrades).set({ status: 'closed', exitDate, exitPrice, netPct: dividendNetPct(t.entryPrice, exitPrice, d.amount) }).where(eq(positionalTrades.id, t.id))
        run.closed.push(t.symbol)
      } else if (sessionsFromEx(sessions, d.exDate, asOf) === SESSIONS_FROM_EX - 1) {
        run.sellTomorrow.push(t.symbol)
      }
    }
    if (opts.notify !== false && (fresh.length || run.sellTomorrow.length)) {
      await notify(run, fresh.map(t => ({ symbol: t.symbol, ...detailOf(t) }))).catch(error => logger.error('Dividend message failed', { error: firstLine(error) }))
    }
  } catch (error) {
    run.problem = firstLine(error)
    logger.error('Dividend watch failed', { error: run.problem })
  }
  logger.info('Dividend watch', { ...run })
  return run
}

async function notify(run: DividendRun, fresh: Array<{ symbol: string } & DividendDetail>): Promise<void> {
  const rupees = (n: number) => `Rs ${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
  const safe = (s: string) => s.replace(/[<>&]/g, ' ')
  const lines: string[] = []
  for (const f of fresh) {
    lines.push(
      `<b>PAPER BUY ${safe(f.symbol)}</b> (big dividend coming)`,
      `Why: a dividend of ${rupees(f.amount)} a share was listed today, ${f.yieldPct}% of the price. Ex-date ${f.exDate}.`,
      `Entry: next session, in the last half hour (after 3 pm).${f.signalClose ? ` Last close ${rupees(f.signalClose)}.` : ''}`,
      `Exit: hold through the ex-date to get the dividend. Sell in the last half hour about ${roughDateAfter(f.exDate, SESSIONS_FROM_EX - 1)}, five sessions after it.`,
      'Stop: none in the tested rule.', '')
  }
  for (const symbol of run.sellTomorrow) lines.push(`<b>SELL ${safe(symbol)} next session, in the last half hour</b>: five sessions have passed since its dividend date.`, '')
  lines.push('This rule is new and on paper only. In testing, dividends of 2% or more beat the average stock by about 4% a trade after costs and tax. The app places no orders.')
  for (const a of await adminTelegram()) await sendTelegramMessage(a.token, a.chat, lines.join('\n'))
}

export interface DividendRow {
  symbol: string; status: string; signalDate: string
  exDate: string
  /** Rupees a share, and that as a percent of the price when it was listed. */
  amount: number; yieldPct: number | null; signalClose: number | null
  /** About when to sell: five sessions after the ex-date. */
  sellAbout: string
  /** True when the next session is the one to sell on. */
  sellNext: boolean
  entryDate: string | null; entryPrice: number | null
  lastPrice: number | null; movePct: number | null
  exitDate: string | null; exitPrice: number | null; netPct: number | null
}

export interface DividendView {
  asOf: string | null
  /** Listed at the last close: buy next session. */
  fresh: DividendRow[]
  open: DividendRow[]
  closed: DividendRow[]
  tally: { trades: number; wins: number; avgNetPct: number }
}

/** Everything the Signals tab shows for dividend trades. Null when they cannot be read. */
export async function dividendView(client: BrokerClient | null): Promise<DividendView | null> {
  try {
    const { latestDate } = await dataFreshness()
    const rows = await db.select().from(positionalTrades)
      .where(and(eq(positionalTrades.signal, DIVIDEND_SIGNAL), inArray(positionalTrades.status, ['new', 'open', 'closed']), gt(positionalTrades.signalDate, addDays(latestDate ?? '2026-01-01', -400))))
      .orderBy(desc(positionalTrades.signalDate), asc(positionalTrades.symbol))
    const live = rows.filter(r => r.status !== 'closed')
    const quotes = live.length ? await liveQuotes([...new Set(live.map(r => r.symbol))], client) : null
    const earliest = live.map(r => r.signalDate).sort()[0]
    const sessions = earliest && latestDate ? await sessionsSince(earliest, latestDate) : []
    const row = (r: typeof rows[number]): DividendRow => {
      const d = detailOf(r), lastPrice = quotes?.quotes[r.symbol]?.price ?? null
      return {
        symbol: r.symbol, status: r.status, signalDate: r.signalDate, exDate: d.exDate, amount: d.amount, yieldPct: d.yieldPct, signalClose: d.signalClose ?? null,
        sellAbout: roughDateAfter(d.exDate, SESSIONS_FROM_EX - 1),
        sellNext: r.status === 'open' && !!latestDate && sessionsFromEx(sessions, d.exDate, latestDate) >= SESSIONS_FROM_EX - 1,
        entryDate: r.entryDate, entryPrice: r.entryPrice, lastPrice,
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
    logger.warn('Dividend trades could not be read', { error: firstLine(error) })
    return null
  }
}
