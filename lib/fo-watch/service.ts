/**
 * The nightly paper tracker: loads the day's option volumes from NSE, lists
 * the stocks that fire a signal for the next session, and records what the
 * paper short made once that session's minute prices can be read from the
 * broker. No orders are placed.
 */
import { db } from '@/db'
import { foStockDays, paperDayTrades, userPreferences, users } from '@/db/schema'
import { and, asc, desc, eq, gte, isNotNull, lt, lte, sql } from 'drizzle-orm'
import { getBrokerManager } from '@/lib/broker'
import logger from '@/lib/logger'
import { liveQuotes } from '@/lib/portfolio/live'
import { extractSingleCsv, fetchArchiveFile, foBanListUrl, foBhavcopyUrl } from '@/lib/market-data/nse-archive'
import { parseBanList, parseFoFile, summariseOptions } from '@/lib/research/fo-parse'
import type { MinuteBar } from '@/lib/research/day-trade'
import { sendTelegramMessage } from '@/lib/telegram-alerts'
import { BACKTEST, banListDate, findSignals, paperOutcome, SIGNAL_LABEL, STOP_PCT, tally, type OptionVolume, type SignalTally, type WatchSignal } from './core'

const CURRENT_BAN_LIST = 'https://nsearchives.nseindia.com/content/fo/fo_secban.csv'
const IST_MS = 5.5 * 3600 * 1000
const istNow = () => new Date(Date.now() + IST_MS)
const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10)
const asInt = (iso: string) => Number(iso.replaceAll('-', ''))
const text = (bytes: Uint8Array | null) => (bytes ? new TextDecoder().decode(bytes) : null)

async function fetchText(url: string): Promise<string | null> {
  try { return text(await fetchArchiveFile(url)) } catch { return null }
}

/** Store the day's option volume for every F&O stock. False when NSE has no F&O file for the day. */
async function loadDay(date: string): Promise<boolean> {
  const [have] = await db.select({ n: sql<number>`count(*)::int` }).from(foStockDays).where(eq(foStockDays.date, date))
  if (have.n > 0) return true
  const zip = await fetchArchiveFile(foBhavcopyUrl(date), 45000)
  const csv = zip && extractSingleCsv(zip)
  if (!csv) return false
  const rows = summariseOptions(parseFoFile(csv), asInt(date), () => undefined).filter(o => !o.index)
  for (let i = 0; i < rows.length; i += 200) {
    await db.insert(foStockDays)
      .values(rows.slice(i, i + 200).map(o => ({ symbol: o.symbol, date, callContracts: o.callContracts, putContracts: o.putContracts })))
      .onConflictDoNothing()
  }
  return rows.length > 0
}

/** The ban list for a trade date. Null when it cannot be found. */
async function banListFor(date: string): Promise<Set<string> | null> {
  for (const url of [foBanListUrl(date), CURRENT_BAN_LIST]) {
    const csv = await fetchText(url)
    if (csv && banListDate(csv) === date) return new Set(parseBanList(csv))
  }
  return null
}

/** The first ban list for a trade date after `date`: the next session. */
async function nextBanList(date: string): Promise<{ tradeDate: string; symbols: Set<string> } | null> {
  const current = await fetchText(CURRENT_BAN_LIST)
  const currentDate = current && banListDate(current)
  for (let n = 1; n <= 6; n++) {
    const day = addDays(date, n)
    if (currentDate === day) return { tradeDate: day, symbols: new Set(parseBanList(current!)) }
    if (currentDate && currentDate < day) break   // the next session's list is not out yet
    const csv = await fetchText(foBanListUrl(day))
    if (csv && banListDate(csv) === day) return { tradeDate: day, symbols: new Set(parseBanList(csv)) }
  }
  return null
}

export interface NewPaperTrade { signal: WatchSignal; symbol: string; detail: Record<string, number> }

/** Find and store the signals at `date`'s close. Returns the trades that were not already stored. */
async function recordSignals(date: string): Promise<{ tradeDate: string | null; added: NewPaperTrade[] }> {
  const next = await nextBanList(date)
  if (!next) return { tradeDate: null, added: [] }
  const banToday = await banListFor(date)

  const rows = await db.select().from(foStockDays).where(and(gte(foStockDays.date, addDays(date, -45)), lte(foStockDays.date, date))).orderBy(asc(foStockDays.date))
  const today = new Map<string, OptionVolume>(), history = new Map<string, OptionVolume[]>(), sessions = new Set<string>()
  for (const r of rows) {
    const volume = { calls: r.callContracts, puts: r.putContracts }
    if (r.date === date) { today.set(r.symbol, volume); continue }
    sessions.add(r.date)
    history.set(r.symbol, [...(history.get(r.symbol) ?? []), volume])
  }
  // A stock with a gap in its history has fewer rows than there were sessions, and is skipped by findSignals only
  // if it has under 20. Hold it to the same 20 sessions as everyone else.
  const recent = [...sessions].sort().slice(-20)
  const complete = new Map<string, OptionVolume[]>()
  if (recent.length === 20) {
    const from = recent[0]
    const counts = new Map<string, number>()
    for (const r of rows) if (r.date >= from && r.date < date) counts.set(r.symbol, (counts.get(r.symbol) ?? 0) + 1)
    for (const [symbol, list] of history) if (counts.get(symbol) === 20) complete.set(symbol, list)
  }

  const found = findSignals({ banToday, banNext: next.symbols, today, history: complete, sessions: recent.length })
  if (!found.length) return { tradeDate: next.tradeDate, added: [] }
  const inserted = await db.insert(paperDayTrades)
    .values(found.map(f => ({ signal: f.signal, symbol: f.symbol, signalDate: date, tradeDate: next.tradeDate, detail: f.detail })))
    .onConflictDoNothing()
    .returning({ signal: paperDayTrades.signal, symbol: paperDayTrades.symbol, detail: paperDayTrades.detail })
  return { tradeDate: next.tradeDate, added: inserted as NewPaperTrade[] }
}

/** Read the minute prices for trades whose session is over and record what each made. Needs a live broker connection. */
async function resolvePending(): Promise<{ resolved: number; waiting: number }> {
  const now = istNow()
  const today = now.toISOString().slice(0, 10)
  const closed = now.getUTCHours() * 60 + now.getUTCMinutes() >= 15 * 60 + 35
  const pending = (await db.select().from(paperDayTrades).where(and(eq(paperDayTrades.status, 'pending'), lte(paperDayTrades.tradeDate, today))))
    .filter(t => t.tradeDate < today || closed)
  if (!pending.length) return { resolved: 0, waiting: 0 }

  const manager = await getBrokerManager()
  if (!manager.hasConnection()) return { resolved: 0, waiting: pending.length }
  const client = manager.getClient()
  const tokens = new Map((await client.getInstruments('NSE')).map(i => [i.tradingsymbol, i.instrumentToken]))

  let resolved = 0
  for (const t of pending) {
    const token = tokens.get(t.symbol)
    let bars: MinuteBar[] = []
    if (token) {
      try {
        const candles = await client.getHistoricalData({
          instrumentToken: token, exchange: 'NSE', symbol: t.symbol, interval: 'minute',
          from: new Date(`${t.tradeDate}T09:00:00+05:30`), to: new Date(`${t.tradeDate}T15:35:00+05:30`),
        } as any)
        bars = candles.map(c => {
          const ist = new Date(new Date(c.date).getTime() + IST_MS)
          return [ist.getUTCHours() * 60 + ist.getUTCMinutes(), c.open, c.high, c.low, c.close, c.volume]
        })
      } catch (error: any) {
        logger.warn('Paper trade prices could not be read', { symbol: t.symbol, date: t.tradeDate, error: error.message })
        continue
      }
    }
    const outcome = bars.length ? paperOutcome(bars) : null
    // No bars a week later means the stock did not trade or has no instrument: stop waiting
    if (!outcome && t.tradeDate > addDays(today, -7) && token) continue
    await db.update(paperDayTrades).set(outcome
      ? { status: 'done', entryPrice: outcome.entryPrice, exitPrice: outcome.exitPrice, stopped: outcome.stopped, grossPct: outcome.grossPct, netPct: outcome.netPct, detail: { ...(t.detail as object), noStopGrossPct: outcome.noStopGrossPct }, resolvedAt: new Date() }
      : { status: 'no-data', resolvedAt: new Date() }).where(eq(paperDayTrades.id, t.id))
    resolved++
    await new Promise(r => setTimeout(r, 350))
  }
  return { resolved, waiting: pending.length - resolved }
}

async function notifyAdmins(tradeDate: string, added: NewPaperTrade[]): Promise<void> {
  const admins = await db
    .select({ token: userPreferences.telegramBotToken, chat: userPreferences.telegramChatId })
    .from(userPreferences).innerJoin(users, eq(users.id, userPreferences.userId))
    .where(and(eq(users.role, 'admin'), eq(userPreferences.telegramEnabled, true), isNotNull(userPreferences.telegramBotToken), isNotNull(userPreferences.telegramChatId)))
  const closes = (await liveQuotes(added.map(a => a.symbol), null).catch(() => null))?.quotes ?? {}
  const rupees = (n: number) => `Rs ${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
  const lines = [`<b>Day-trade signals for ${tradeDate}</b>`, '']
  for (const a of added) {
    const close = closes[a.symbol]?.price
    lines.push(
      `<b>SELL SHORT ${a.symbol.replace(/[<>&]/g, ' ')}</b> (${SIGNAL_LABEL[a.signal].toLowerCase()})`,
      `Entry: 09:20, at the market price.${close ? ` Last close ${rupees(close)}.` : ''}`,
      `Stop: ${STOP_PCT}% above your sell price${close ? `, about ${rupees(close * (1 + STOP_PCT / 100))} at the last close` : ''}.`,
      'Exit: buy back at 15:15.', '')
  }
  lines.push('Evidence is modest and has been weak since 2025. The app places no orders.')
  for (const a of admins) await sendTelegramMessage(a.token!, a.chat!, lines.join('\n'))
}

export interface FoWatchRun { date: string | null; tradeDate: string | null; added: number; resolved: number; waiting: number; problem?: string }

/**
 * One run of the tracker. With no date it takes the latest session NSE has
 * an F&O file for, looking back up to five days. Safe to run more than once.
 */
export async function runFoWatch(opts: { date?: string; notify?: boolean; signals?: boolean } = {}): Promise<FoWatchRun> {
  const run: FoWatchRun = { date: null, tradeDate: null, added: 0, resolved: 0, waiting: 0 }
  try {
    const start = opts.date ?? istNow().toISOString().slice(0, 10)
    for (let n = 0; n <= (opts.date ? 0 : 5) && !run.date; n++) {
      const day = addDays(start, -n)
      if (await loadDay(day)) run.date = day
    }
    if (run.date && opts.signals !== false) {
      const signals = await recordSignals(run.date)
      run.tradeDate = signals.tradeDate
      run.added = signals.added.length
      if (signals.added.length && signals.tradeDate && opts.notify !== false) {
        await notifyAdmins(signals.tradeDate, signals.added).catch(error => logger.error('Paper trade message failed', { error: error.message }))
      }
    }
    Object.assign(run, await resolvePending())
  } catch (error: any) {
    run.problem = String(error.cause?.message ?? error.message).split('\n')[0]
    logger.error('F&O watch failed', { error: run.problem })
  }
  logger.info("F&O watch", { ...run })
  return run
}

export interface PaperTradeRow {
  id: number; signal: WatchSignal; symbol: string; signalDate: string; tradeDate: string; status: string
  entryPrice: number | null; exitPrice: number | null; stopped: boolean | null; grossPct: number | null; netPct: number | null
  detail: Record<string, number>
}

export interface FoWatchView {
  trades: PaperTradeRow[]
  tallies: Record<WatchSignal, SignalTally & { label: string; backtestNetPct: number; backtestNote: string }>
  since: string | null
}

/** Everything the page shows. Null when the tables are not there yet. */
export async function foWatchView(): Promise<FoWatchView | null> {
  try {
    const rows = await db.select().from(paperDayTrades).orderBy(desc(paperDayTrades.tradeDate), asc(paperDayTrades.signal), asc(paperDayTrades.symbol)).limit(1000)
    const trades = rows.map(r => ({
      id: r.id, signal: r.signal as WatchSignal, symbol: r.symbol, signalDate: r.signalDate, tradeDate: r.tradeDate, status: r.status,
      entryPrice: r.entryPrice, exitPrice: r.exitPrice, stopped: r.stopped, grossPct: r.grossPct, netPct: r.netPct, detail: (r.detail ?? {}) as Record<string, number>,
    }))
    const tallies = Object.fromEntries((Object.keys(SIGNAL_LABEL) as WatchSignal[]).map(signal => [signal, {
      ...tally(trades.filter(t => t.signal === signal && t.status === 'done' && t.netPct != null).map(t => t.netPct!)),
      label: SIGNAL_LABEL[signal], backtestNetPct: BACKTEST[signal].netPct, backtestNote: BACKTEST[signal].note,
    }])) as FoWatchView['tallies']
    return { trades, tallies, since: trades.length ? trades[trades.length - 1].tradeDate : null }
  } catch (error: any) {
    logger.warn('Paper trades could not be read', { error: String(error.cause?.message ?? error.message).split('\n')[0] })
    return null
  }
}
