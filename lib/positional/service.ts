/**
 * The nightly positional job: stores results dates, finds stocks that jumped
 * on results, opens a paper trade at the next session's average price and
 * closes it 60 sessions later. No orders are placed.
 */
import { db } from '@/db'
import { dailyBars, positionalTrades, resultsDates, userPreferences, users } from '@/db/schema'
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, lte } from 'drizzle-orm'
import type { BrokerClient } from '@/lib/broker'
import logger from '@/lib/logger'
import { parseBoardMeetings } from '@/lib/market-data/nse-parse'
import { INDEX_INSTRUMENTS, PORTFOLIO_RULES } from '@/lib/portfolio/config'
import { dataFreshness, liveUniverse } from '@/lib/portfolio/data'
import { liveQuotes } from '@/lib/portfolio/live'
import { sendTelegramMessage } from '@/lib/telegram-alerts'
import { averagePrice, HOLD_SESSIONS, isWeak, netPct, resultsJump, roughDateAfter, sessionsHeld, SIGNAL, strengthLabel, strengthRank, yearReturn, type Bar } from './core'

const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10)
const firstLine = (error: any) => String(error?.cause?.message ?? error?.message ?? error).split('\n')[0]

/** Store the results dates listed in a day's board-meeting file. A missing table is logged, never thrown. */
export async function storeResultsDates(bm: string | null): Promise<number> {
  if (!bm) return 0
  const rows = parseBoardMeetings(bm).filter(m => m.results).map(m => ({ symbol: m.symbol, date: m.date }))
  try {
    for (let i = 0; i < rows.length; i += 500) await db.insert(resultsDates).values(rows.slice(i, i + 500)).onConflictDoNothing()
    return rows.length
  } catch (error) {
    logger.warn('Results dates not stored', { error: firstLine(error) })
    return 0
  }
}

async function sessionsSince(from: string, to: string): Promise<string[]> {
  const rows = await db.select({ date: dailyBars.date }).from(dailyBars)
    .where(and(eq(dailyBars.symbol, INDEX_INSTRUMENTS.NIFTY_50.barSymbol), gte(dailyBars.date, from), lte(dailyBars.date, to)))
    .orderBy(asc(dailyBars.date))
  return rows.map(r => String(r.date))
}

async function adminTelegram(): Promise<Array<{ token: string; chat: string }>> {
  const rows = await db
    .select({ token: userPreferences.telegramBotToken, chat: userPreferences.telegramChatId })
    .from(userPreferences).innerJoin(users, eq(users.id, userPreferences.userId))
    .where(and(eq(users.role, 'admin'), eq(userPreferences.telegramEnabled, true), isNotNull(userPreferences.telegramBotToken), isNotNull(userPreferences.telegramChatId)))
  return rows.map(r => ({ token: r.token!, chat: r.chat! }))
}

/**
 * Each stock's 12-month strength at a close: its return from 252 sessions ago
 * to 21 sessions ago, ranked among the universe (0 weakest, 1 strongest). A
 * stock without a price on both days gets no rank.
 */
export async function strengthRanks(asOf: string, universe: string[]): Promise<Map<string, number>> {
  const sessions = await sessionsSince(addDays(asOf, -420), asOf)
  const out = new Map<string, number>()
  if (sessions.length < 253 || !universe.length) return out
  const monthAgo = sessions[sessions.length - 22], yearAgo = sessions[sessions.length - 253]
  const rows = await db.select({ symbol: dailyBars.symbol, date: dailyBars.date, close: dailyBars.close })
    .from(dailyBars).where(and(inArray(dailyBars.symbol, universe), inArray(dailyBars.date, [monthAgo, yearAgo])))
  const near = new Map<string, number>(), far = new Map<string, number>()
  for (const r of rows) (String(r.date) === monthAgo ? near : far).set(r.symbol, r.close)
  const returns = new Map<string, number>()
  for (const symbol of universe) { const r = yearReturn(far.get(symbol), near.get(symbol)); if (r != null) returns.set(symbol, r) }
  const all = [...returns.values()]
  for (const [symbol, r] of returns) out.set(symbol, Math.round(strengthRank(r, all) * 1000) / 1000)
  return out
}

/** Work out the strength of trades stored before the rule used it. Changes nothing else about them. */
export async function backfillStrength(): Promise<Array<{ symbol: string; signalDate: string; status: string; rank: number | null }>> {
  const rows = (await db.select().from(positionalTrades)).filter(r => (r.detail as Record<string, unknown>)?.strengthRank === undefined)
  const done: Array<{ symbol: string; signalDate: string; status: string; rank: number | null }> = []
  for (const date of [...new Set(rows.map(r => r.signalDate))].sort()) {
    const ranks = await strengthRanks(date, await liveUniverse(date, PORTFOLIO_RULES.universeSize))
    for (const r of rows.filter(x => x.signalDate === date)) {
      const rank = ranks.get(r.symbol) ?? null
      await db.update(positionalTrades).set({ detail: { ...(r.detail as Record<string, unknown>), strengthRank: rank } }).where(eq(positionalTrades.id, r.id))
      done.push({ symbol: r.symbol, signalDate: r.signalDate, status: r.status, rank })
    }
  }
  return done
}

export interface PositionalRun { asOf: string | null; signals: string[]; /** Jumped on results but too weak over 12 months to buy. */ skippedWeak: string[]; opened: number; closed: string[]; dueTomorrow: string[]; problem?: string }

/**
 * One run, on the latest session in the price table (or `asOf`). Safe to run
 * more than once: a signal is stored once, and trades move on only when
 * there is a new session.
 */
export async function runPositionalWatch(opts: { asOf?: string; notify?: boolean } = {}): Promise<PositionalRun> {
  const run: PositionalRun = { asOf: null, signals: [], skippedWeak: [], opened: 0, closed: [], dueTomorrow: [] }
  try {
    const asOf = opts.asOf ?? (await dataFreshness()).latestDate
    if (!asOf) return run
    run.asOf = asOf

    // 1. New signals at this close
    const universe = await liveUniverse(asOf, PORTFOLIO_RULES.universeSize)
    const [barRows, resultRows] = await Promise.all([
      db.select({ symbol: dailyBars.symbol, date: dailyBars.date, close: dailyBars.close, turnover: dailyBars.turnover })
        .from(dailyBars).where(and(inArray(dailyBars.symbol, universe), gte(dailyBars.date, addDays(asOf, -50)), lte(dailyBars.date, asOf)))
        .orderBy(dailyBars.symbol, dailyBars.date),
      db.select().from(resultsDates).where(and(inArray(resultsDates.symbol, universe), gte(resultsDates.date, addDays(asOf, -7)), lte(resultsDates.date, asOf))),
    ])
    const results = new Map<string, string[]>()
    for (const r of resultRows) results.set(r.symbol, [...(results.get(r.symbol) ?? []), String(r.date)])
    const bars = new Map<string, Bar[]>()
    for (const r of barRows) {
      if (!results.has(r.symbol)) continue
      bars.set(r.symbol, [...(bars.get(r.symbol) ?? []), { date: String(r.date), close: r.close, turnover: r.turnover }])
    }
    // One trade per stock at a time: a second strong day in the same results week is not a second signal
    const held = new Set((await db.select({ symbol: positionalTrades.symbol }).from(positionalTrades).where(inArray(positionalTrades.status, ['new', 'open']))).map(r => r.symbol))
    const found: Array<{ symbol: string; detail: Record<string, unknown> }> = []
    for (const [symbol, list] of bars) {
      if (list[list.length - 1].date !== asOf || held.has(symbol)) continue
      const signal = resultsJump(list, results.get(symbol)!)
      if (signal) found.push({ symbol, detail: { ...signal, signalClose: list[list.length - 1].close } })
    }
    if (found.length) {
      // A jump on a stock that has been weak for a year is stored but not bought
      const ranks = await strengthRanks(asOf, universe)
      for (const f of found) f.detail.strengthRank = ranks.get(f.symbol) ?? null
      const weak = (f: typeof found[number]) => isWeak(f.detail.strengthRank as number | null)
      const inserted = await db.insert(positionalTrades)
        .values(found.map(f => ({ signal: SIGNAL, symbol: f.symbol, signalDate: asOf, status: weak(f) ? 'skipped' : 'new', detail: weak(f) ? { ...f.detail, weak: true } : f.detail })))
        .onConflictDoNothing().returning({ symbol: positionalTrades.symbol, status: positionalTrades.status })
      const strength = (symbol: string) => (found.find(f => f.symbol === symbol)!.detail.strengthRank as number | null) ?? -1
      run.signals = inserted.filter(r => r.status === 'new').map(r => r.symbol).sort((a, b) => strength(b) - strength(a))
      run.skippedWeak = inserted.filter(r => r.status === 'skipped').map(r => r.symbol)
    }

    // 2. Open yesterday's signals at the entry session's average price; close trades that have run 60 sessions
    const live = await db.select().from(positionalTrades).where(inArray(positionalTrades.status, ['new', 'open']))
    if (live.length) {
      const earliest = live.map(t => t.entryDate ?? t.signalDate).sort()[0]
      const sessions = await sessionsSince(earliest, asOf)
      const prices = await db.select().from(dailyBars)
        .where(and(inArray(dailyBars.symbol, [...new Set(live.map(t => t.symbol))]), gte(dailyBars.date, earliest), lte(dailyBars.date, asOf)))
      const priceOn = new Map(prices.map(p => [`${p.symbol}|${p.date}`, p]))
      for (const t of live) {
        if (t.status === 'new') {
          const entryDate = sessions.find(d => d > t.signalDate)
          if (!entryDate) continue
          const bar = priceOn.get(`${t.symbol}|${entryDate}`)
          await db.update(positionalTrades)
            .set(bar ? { status: 'open', entryDate, entryPrice: averagePrice(bar) } : { status: 'skipped', entryDate })
            .where(eq(positionalTrades.id, t.id))
          if (bar) run.opened++
          continue
        }
        const held = sessionsHeld(sessions, t.entryDate!, asOf)
        if (held >= HOLD_SESSIONS) {
          // The exit is the close of the 60th session; a stock with no bar that day leaves at its last close
          const exitDate = sessions.filter(d => d >= t.entryDate!)[HOLD_SESSIONS - 1]
          const bar = priceOn.get(`${t.symbol}|${exitDate}`) ?? prices.filter(p => p.symbol === t.symbol && String(p.date) <= exitDate).sort((a, b) => String(a.date).localeCompare(String(b.date))).pop()
          if (!bar) continue
          await db.update(positionalTrades)
            .set({ status: 'closed', exitDate, exitPrice: bar.close, netPct: netPct(t.entryPrice!, bar.close) })
            .where(eq(positionalTrades.id, t.id))
          run.closed.push(t.symbol)
        } else if (held === HOLD_SESSIONS - 1) {
          run.dueTomorrow.push(t.symbol)
        }
      }
    }

    if (opts.notify !== false && (run.signals.length || run.skippedWeak.length || run.dueTomorrow.length)) {
      await notify(run, found).catch(error => logger.error('Positional message failed', { error: firstLine(error) }))
    }
  } catch (error) {
    run.problem = firstLine(error)
    logger.error('Positional watch failed', { error: run.problem })
  }
  logger.info('Positional watch', { ...run })
  return run
}

async function notify(run: PositionalRun, found: Array<{ symbol: string; detail: Record<string, unknown> }>): Promise<void> {
  const rupees = (n: number) => `Rs ${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
  const safe = (s: string) => s.replace(/[<>&]/g, ' ')
  const lines: string[] = []
  for (const symbol of run.signals) {
    const d = found.find(f => f.symbol === symbol)!.detail as { jumpPct: number; turnoverRatio: number; signalClose: number; strengthRank: number | null }
    lines.push(
      `<b>BUY ${safe(symbol)}</b> (jumped on results)`,
      `Why: up ${d.jumpPct}% over two sessions around results, on ${d.turnoverRatio} times its usual turnover.`,
      `12-month strength: ${strengthLabel(d.strengthRank)} of the 500.`,
      `Entry: next session, spread through the day. Last close ${rupees(d.signalClose)}.`,
      `Exit: sell after ${HOLD_SESSIONS} trading sessions, about ${roughDateAfter(run.asOf!, HOLD_SESSIONS)}.`,
      'Stop: none in the tested rule. It can fall a long way before the exit date.', '')
  }
  if (run.skippedWeak.length) lines.push(`Not bought: ${run.skippedWeak.map(safe).join(', ')}. They jumped on results but are in the bottom fifth on 12-month strength, where the rule earned nothing in testing.`, '')
  for (const symbol of run.dueTomorrow) lines.push(`<b>SELL ${safe(symbol)} at the next session's close</b>: its ${HOLD_SESSIONS} sessions are up.`, '')
  lines.push('Evidence is moderate: the rule beat the index in backtests, with deep falls. The app places no orders.')
  for (const a of await adminTelegram()) await sendTelegramMessage(a.token, a.chat, lines.join('\n'))
}

export interface PositionalRow {
  symbol: string; status: string; signalDate: string
  jumpPct: number | null; turnoverRatio: number | null; signalClose: number | null
  /** 12-month strength among the 500 at the signal: 0 weakest, 1 strongest. Null when not known. */
  strengthRank: number | null
  entryDate: string | null; entryPrice: number | null
  /** While open: the latest price, the move so far before costs, sessions held and the estimated exit date. */
  lastPrice: number | null; movePct: number | null; sessionsHeld: number | null; exitAbout: string | null
  exitDate: string | null; exitPrice: number | null; netPct: number | null
}

export interface PositionalView {
  asOf: string | null
  holdSessions: number
  prices: 'live' | 'last close'
  /** Signalled at the last close: buy next session. */
  fresh: PositionalRow[]
  /** Jumped on results at the last close but too weak to buy. */
  skippedWeak: PositionalRow[]
  open: PositionalRow[]
  closed: PositionalRow[]
  tally: { trades: number; wins: number; avgNetPct: number }
}

/** Everything the Signals tab shows for positional trades. Null when the table is not there yet. */
export async function positionalView(client: BrokerClient | null): Promise<PositionalView | null> {
  try {
    const { latestDate } = await dataFreshness()
    const rows = await db.select().from(positionalTrades).where(gt(positionalTrades.signalDate, addDays(latestDate ?? '2026-01-01', -400))).orderBy(desc(positionalTrades.signalDate), asc(positionalTrades.symbol))
    const live = rows.filter(r => r.status === 'new' || r.status === 'open')
    const quotes = live.length ? await liveQuotes([...new Set(live.map(r => r.symbol))], client) : null
    const earliest = live.filter(r => r.entryDate).map(r => r.entryDate!).sort()[0]
    const sessions = earliest && latestDate ? await sessionsSince(earliest, latestDate) : []
    const row = (r: typeof rows[number]): PositionalRow => {
      const d = (r.detail ?? {}) as Record<string, number>
      const lastPrice = quotes?.quotes[r.symbol]?.price ?? null
      const held = r.status === 'open' && latestDate ? sessionsHeld(sessions, r.entryDate!, latestDate) : null
      return {
        symbol: r.symbol, status: r.status, signalDate: r.signalDate, jumpPct: d.jumpPct ?? null, turnoverRatio: d.turnoverRatio ?? null, signalClose: d.signalClose ?? null, strengthRank: d.strengthRank ?? null,
        entryDate: r.entryDate, entryPrice: r.entryPrice, lastPrice,
        movePct: r.status === 'open' && r.entryPrice && lastPrice ? (lastPrice / r.entryPrice - 1) * 100 : null,
        sessionsHeld: held,
        exitAbout: r.status === 'open' && held != null && latestDate ? roughDateAfter(latestDate, Math.max(0, HOLD_SESSIONS - held)) : r.status === 'new' ? roughDateAfter(r.signalDate, HOLD_SESSIONS) : null,
        exitDate: r.exitDate, exitPrice: r.exitPrice, netPct: r.netPct,
      }
    }
    const closed = rows.filter(r => r.status === 'closed')
    const nets = closed.map(r => r.netPct ?? 0)
    return {
      asOf: latestDate, holdSessions: HOLD_SESSIONS, prices: quotes?.source ?? (client ? 'live' : 'last close'),
      fresh: rows.filter(r => r.status === 'new').map(row).sort((a, b) => (b.strengthRank ?? -1) - (a.strengthRank ?? -1)),
      skippedWeak: rows.filter(r => r.status === 'skipped' && r.signalDate === latestDate && (r.detail as Record<string, unknown>)?.weak === true).map(row),
      open: rows.filter(r => r.status === 'open').map(row), closed: closed.slice(0, 50).map(row),
      tally: { trades: nets.length, wins: nets.filter(n => n > 0).length, avgNetPct: nets.length ? nets.reduce((a, b) => a + b, 0) / nets.length : 0 },
    }
  } catch (error) {
    logger.warn('Positional trades could not be read', { error: firstLine(error) })
    return null
  }
}
