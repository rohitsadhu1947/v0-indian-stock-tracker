/**
 * Keep daily_bars current from NSE's official archive. Needs no broker login.
 *
 * Each run loads every trading day published since the latest official bar
 * (so missed days are filled in), applies splits and bonuses that went ex on
 * those days by rescaling earlier bars, and records what it did in
 * market_data_runs.
 */
import { db } from '@/db'
import { corporateActions, dailyBars, marketDataRuns, securities } from '@/db/schema'
import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { factorFromGap, resolveEvents, type RawPriceBar } from './adjust'
import { securityKind } from './classify'
import { parseCorporateAction } from './corporate-actions'
import { indexBarSymbol } from './indices'
import { storeResultsDates } from '@/lib/positional/service'
import { deliveryUrl, extractPrBundle, fetchArchiveFile, prBundleUrl, SYMBOL_CHANGES_URL } from './nse-archive'
import { continuity, parseCorporateActionsFile, parseDeliveryFile, parsePriceFile, parseSymbolChanges } from './nse-parse'

const REFERENCE_INDEX = 'IDX:NIFTY 50'
/** A stock not yet in daily_bars (a new listing) is added once it trades this much in a day. */
const NEW_SYMBOL_MIN_TURNOVER = 5e7
const MAX_DAYS_PER_RUN = 12
const NO_FUND_LIST: ReadonlySet<string> = new Set()
const MIN_CONTINUITY = 0.8
/** A stated ratio the price has not confirmed is retried for this many days, in case the ex-date is off. */
const RESOLVE_RETRY_DAYS = 6
const PENDING_EXPIRY_DAYS = 45

const toInt = (iso: string) => Number(iso.replaceAll('-', ''))
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
export const istToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)

export interface DaySummary {
  date: string
  bars: number
  newSymbols: string[]
  adjusted: Array<{ symbol: string; exDate: string; factor: number; purposes: string[] }>
  rejected: Array<{ symbol: string; exDate: string; note: string }>
  checks: { coveragePct: number; badOhlc: number; bigMoves: string[] }
}

export interface UpdateSummary {
  ok: boolean
  latestBefore: string | null
  latestAfter: string | null
  days: DaySummary[]
  renamed: Array<{ from: string; to: string }>
  /** Files NSE published that are not real sessions (mock trading) or failed the continuity check. */
  skipped: Array<{ date: string; reason: string }>
  problems: string[]
}

async function latestOfficialDate(): Promise<string | null> {
  const [row] = await db
    .select({ date: sql<string | null>`max(${dailyBars.date})::text` })
    .from(dailyBars)
    .where(and(eq(dailyBars.symbol, REFERENCE_INDEX), eq(dailyBars.provisional, false)))
  return row?.date ?? null
}

/** Carry history over to the new symbol when NSE renames a company. */
async function applyRenames(tracked: Set<string>, after: string, problems: string[]): Promise<UpdateSummary['renamed']> {
  const renamed: UpdateSummary['renamed'] = []
  try {
    const file = await fetchArchiveFile(SYMBOL_CHANGES_URL)
    if (!file) return renamed
    const changes = parseSymbolChanges(new TextDecoder('latin1').decode(file))
      .filter(c => c.effectiveDate > after && tracked.has(c.oldSymbol) && !tracked.has(c.newSymbol))
      .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
    for (const c of changes) {
      await db.transaction(async tx => {
        await tx.execute(sql`update daily_bars set symbol = ${c.newSymbol} where symbol = ${c.oldSymbol}`)
        await tx.execute(sql`update corporate_actions set symbol = ${c.newSymbol} where symbol = ${c.oldSymbol}`)
        await tx.execute(sql`update securities set symbol = ${c.newSymbol} where symbol = ${c.oldSymbol}`)
      })
      tracked.delete(c.oldSymbol)
      tracked.add(c.newSymbol)
      renamed.push({ from: c.oldSymbol, to: c.newSymbol })
    }
  } catch (err: any) {
    problems.push(`symbol renames not checked: ${err.message}`)
  }
  return renamed
}

async function loadDay(
  date: string, tracked: Set<string>, problems: string[], skipped: UpdateSummary['skipped']
): Promise<DaySummary | null> {
  const zip = await fetchArchiveFile(prBundleUrl(date))
  if (!zip) return null
  const bundle = extractPrBundle(zip)
  if (!bundle.pd) throw new Error(`${date}: NSE bundle has no price file`)
  const { equities, indices } = parsePriceFile(bundle.pd)
  // Results dates announced in the same bundle; used by the positional signals. Never fails the price update
  await storeResultsDates(bundle.bm)
  if (equities.length < 500) {
    skipped.push({ date, reason: `only ${equities.length} securities (test session)` })
    return null
  }

  // A mock-trading session, or a file holding another day's data, does not
  // chain to the session we already hold
  const previous = await db.execute(sql`
    select symbol, close from daily_bars
    where date = (select max(date) from daily_bars where symbol = ${REFERENCE_INDEX} and date < ${date}::date)`)
  const previousCloses = new Map((previous as any[]).map(r => [r.symbol as string, Number(r.close)]))
  const match = continuity(equities, previousCloses)
  if (match < MIN_CONTINUITY) {
    skipped.push({ date, reason: `prices do not follow the previous session (${Math.round(match * 100)}% match)` })
    return null
  }

  const delivered = new Map<string, number>()
  try {
    const mto = await fetchArchiveFile(deliveryUrl(date))
    for (const r of mto ? parseDeliveryFile(new TextDecoder('latin1').decode(mto)) : []) {
      delivered.set(r.symbol, Math.max(delivered.get(r.symbol) ?? 0, r.deliveredQty))
    }
  } catch (err: any) {
    problems.push(`${date}: delivery file not loaded: ${err.message}`)
  }

  const newSymbols: string[] = []
  const newSecurities: Array<typeof securities.$inferInsert> = []
  const rows: Array<typeof dailyBars.$inferInsert> = []
  for (const b of equities) {
    if (!tracked.has(b.symbol)) {
      if (b.value < NEW_SYMBOL_MIN_TURNOVER) continue
      newSymbols.push(b.symbol)
      tracked.add(b.symbol)
      // No ETF list here, so a new fund is recognised by its name or symbol
      newSecurities.push({ symbol: b.symbol, name: b.name ?? null, kind: securityKind(b.symbol, b.name, NO_FUND_LIST) })
    }
    rows.push({
      symbol: b.symbol, date, open: b.open, high: b.high, low: b.low, close: b.close,
      volume: b.volume, provisional: false, turnover: b.value, deliveryQty: delivered.get(b.symbol) ?? null,
    })
  }
  for (const x of indices) {
    const symbol = indexBarSymbol(x.name)
    if (!symbol) continue
    rows.push({
      symbol, date, open: x.open || x.close, high: x.high || x.close, low: x.low || x.close, close: x.close,
      volume: 0, provisional: false,
    })
  }

  const announced = bundle.bc ? groupActions(parseCorporateActionsFile(bundle.bc), tracked, date) : []
  const summary: DaySummary = {
    date, bars: rows.length, newSymbols, adjusted: [], rejected: [],
    checks: { coveragePct: 0, badOhlc: 0, bigMoves: [] },
  }

  await db.transaction(async tx => {
    if (newSecurities.length) await tx.insert(securities).values(newSecurities).onConflictDoNothing()
    for (let i = 0; i < rows.length; i += 500) {
      await tx.insert(dailyBars).values(rows.slice(i, i + 500)).onConflictDoUpdate({
        target: [dailyBars.symbol, dailyBars.date],
        set: {
          open: sql`excluded.open`, high: sql`excluded.high`, low: sql`excluded.low`, close: sql`excluded.close`,
          volume: sql`excluded.volume`, provisional: sql`excluded.provisional`,
          turnover: sql`excluded.turnover`, deliveryQty: sql`excluded.delivery_qty`,
        },
      })
    }

    // Announcements: keep as pending until the ex-date bar is in
    for (const a of announced) {
      await tx.execute(sql`
        insert into corporate_actions (symbol, ex_date, purposes, status)
        values (${a.symbol}, ${a.exDate}::date, ${JSON.stringify(a.purposes)}::jsonb, 'pending')
        on conflict (symbol, ex_date) do update set
          purposes = (select jsonb_agg(distinct p) from jsonb_array_elements(corporate_actions.purposes || excluded.purposes) p),
          updated_at = now()
        where corporate_actions.status = 'pending'`)
    }

    const pending = await tx.select().from(corporateActions)
      .where(and(eq(corporateActions.status, 'pending'), lte(corporateActions.exDate, date)))
    for (const action of pending) {
      const exDate = String(action.exDate)
      const bars = await tx
        .select({ date: dailyBars.date, open: dailyBars.open, high: dailyBars.high, low: dailyBars.low, close: dailyBars.close, volume: dailyBars.volume })
        .from(dailyBars)
        .where(and(eq(dailyBars.symbol, action.symbol), gte(dailyBars.date, addDays(exDate, -20)), lte(dailyBars.date, date)))
        .orderBy(dailyBars.date)
      const key = and(eq(corporateActions.symbol, action.symbol), eq(corporateActions.exDate, exDate))
      const age = (Date.parse(date) - Date.parse(exDate)) / 86400000

      if (!bars.some(b => String(b.date) >= exDate) || bars.length < 2) {
        // Not traded since the ex-date (suspended, or not a stock we hold bars for)
        if (age > PENDING_EXPIRY_DAYS) await tx.update(corporateActions).set({ status: 'expired', updatedAt: new Date() }).where(key)
        continue
      }

      const series: RawPriceBar[] = bars.map(b => ({ ...b, date: toInt(String(b.date)), value: 0 }))
      const [event] = resolveEvents(series, new Map([[toInt(exDate), action.purposes]]))
      if (event?.status === 'rejected' && age < RESOLVE_RETRY_DAYS) continue

      if (event && event.status !== 'rejected' && event.priceFactor !== 1) {
        const effective = isoFromInt(event.exDate)
        // The price move on that date may already have been adjusted (inferred before the
        // announcement was matched to it); applying the ratio again would double it
        const done = await tx.execute(sql`
          select 1 from corporate_actions
          where symbol = ${action.symbol} and ex_date = ${effective}::date and price_factor <> 1 and ex_date <> ${exDate}::date`)
        if ((done as any[]).length) {
          await tx.update(corporateActions).set({ status: 'superseded', note: `already adjusted on ${effective}`, updatedAt: new Date() }).where(key)
          continue
        }
        // Bars from the ex-date on are already on the new basis; rescale the earlier ones
        await tx.execute(sql`
          update daily_bars set
            open = open * ${event.priceFactor}, high = high * ${event.priceFactor},
            low = low * ${event.priceFactor}, close = close * ${event.priceFactor},
            volume = volume / ${event.shareFactor}
          where symbol = ${action.symbol} and date < ${effective}::date`)
        summary.adjusted.push({ symbol: action.symbol, exDate: effective, factor: event.priceFactor, purposes: action.purposes })
      }
      if (event?.status === 'rejected') summary.rejected.push({ symbol: action.symbol, exDate, note: event.note ?? '' })

      await tx.update(corporateActions).set({
        status: event?.status ?? 'no-effect',
        priceFactor: event?.priceFactor ?? 1,
        shareFactor: event?.shareFactor ?? 1,
        dividend: event?.dividend ?? 0,
        note: event?.note ?? null,
        updatedAt: new Date(),
      }).where(key)
    }

    // Splits NSE's file did not announce: an overnight move beyond the price
    // bands in a stock that traded the previous session (see factorFromGap)
    const recent = await tx.execute(sql`
      select symbol from corporate_actions
      where price_factor <> 1 and ex_date between ${addDays(date, -7)}::date and ${date}::date`)
    const alreadyAdjusted = new Set((recent as any[]).map(r => r.symbol as string))
    for (const b of equities) {
      const prev = previousCloses.get(b.symbol)
      if (prev == null || prev < 5 || alreadyAdjusted.has(b.symbol) || !tracked.has(b.symbol)) continue
      const gap = b.open / prev
      const factor = factorFromGap(gap)
      // A freak opening print reverses within the session; a corporate action does not
      if (!factor || Math.abs(Math.log(b.close / prev / gap)) > 0.25) continue
      const note = `not in NSE's corporate-action file; open was ${gap.toFixed(3)}x the previous close`
      await tx.execute(sql`
        update daily_bars set
          open = open * ${factor.priceFactor}, high = high * ${factor.priceFactor},
          low = low * ${factor.priceFactor}, close = close * ${factor.priceFactor},
          volume = volume / ${factor.shareFactor}
        where symbol = ${b.symbol} and date < ${date}::date`)
      await tx.execute(sql`
        insert into corporate_actions (symbol, ex_date, purposes, status, price_factor, share_factor, note)
        values (${b.symbol}, ${date}::date, '[]'::jsonb, 'inferred', ${factor.priceFactor}, ${factor.shareFactor}, ${note})
        on conflict (symbol, ex_date) do update set
          status = 'inferred', price_factor = excluded.price_factor, share_factor = excluded.share_factor,
          note = excluded.note, updated_at = now()`)
      summary.adjusted.push({ symbol: b.symbol, exDate: date, factor: factor.priceFactor, purposes: ['(inferred from price)'] })
    }
  })

  summary.checks = await qualityChecks(date)
  return summary
}

const isoFromInt = (d: number) => {
  const s = String(d)
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

/** One entry per company and ex-date, for actions that can change prices or pay cash. */
function groupActions(
  rows: Array<{ symbol: string; exDate: string; purpose: string }>, tracked: Set<string>, onOrAfter: string
): Array<{ symbol: string; exDate: string; purposes: string[] }> {
  const groups = new Map<string, { symbol: string; exDate: string; purposes: string[] }>()
  for (const r of rows) {
    if (!tracked.has(r.symbol) || r.exDate < onOrAfter) continue
    const a = parseCorporateAction(r.purpose)
    if (!a.split && !a.bonus && !a.rights && !a.dividend && !a.restructure) continue
    const key = `${r.symbol}|${r.exDate}`
    const g = groups.get(key) ?? { symbol: r.symbol, exDate: r.exDate, purposes: [] }
    if (!g.purposes.includes(r.purpose)) g.purposes.push(r.purpose)
    groups.set(key, g)
  }
  return [...groups.values()]
}

/**
 * Sanity checks on one day's bars: how many of the previous session's stocks
 * have a bar, impossible OHLC rows, and one-day moves beyond NSE's widest
 * price band (20%) that no corporate action explains.
 */
async function qualityChecks(date: string): Promise<DaySummary['checks']> {
  const rows = await db.execute(sql`
    with today as (select * from daily_bars where date = ${date}::date and symbol not like 'IDX:%'),
    prev_date as (select max(date) d from daily_bars where symbol = ${REFERENCE_INDEX} and date < ${date}::date),
    prev as (select b.symbol, b.close from daily_bars b, prev_date p where b.date = p.d and b.symbol not like 'IDX:%')
    select
      (select count(*) from prev)::int as prev_count,
      (select count(*) from prev p join today t using (symbol))::int as carried,
      (select count(*) from today where high < greatest(open, close) - 0.011 or low > least(open, close) + 0.011 or low <= 0)::int as bad_ohlc,
      (select coalesce(json_agg(x.label), '[]'::json) from (
         select t.symbol || ' ' || round(((t.close / p.close - 1) * 100)::numeric, 1) || '%' as label
         from today t join prev p using (symbol)
         where abs(t.close / p.close - 1) > 0.25
           and not exists (select 1 from corporate_actions c where c.symbol = t.symbol and c.ex_date between ${date}::date - 4 and ${date}::date + 4)
         order by abs(t.close / p.close - 1) desc limit 15) x) as big_moves`)
  const r: any = (rows as any)[0] ?? {}
  return {
    coveragePct: r.prev_count ? Math.round((r.carried / r.prev_count) * 1000) / 10 : 100,
    badOhlc: r.bad_ohlc ?? 0,
    bigMoves: r.big_moves ?? [],
  }
}

/**
 * Load every trading day NSE has published since the latest official bar.
 * Safe to call repeatedly: a day already loaded is simply not requested again.
 */
export async function updateFromNseArchive(): Promise<UpdateSummary> {
  const problems: string[] = []
  const latestBefore = await latestOfficialDate()
  const out: UpdateSummary = { ok: false, latestBefore, latestAfter: latestBefore, days: [], renamed: [], skipped: [], problems }

  try {
    if (!latestBefore) throw new Error('daily_bars has no history: run scripts/data/publish-bars.ts first')

    const symbols = await db.execute(sql`select distinct symbol from daily_bars where date >= ${addDays(latestBefore, -30)}::date`)
    const tracked = new Set<string>((symbols as any[]).map(r => r.symbol))
    out.renamed = await applyRenames(tracked, latestBefore, problems)

    const today = istToday()
    let loaded = 0
    for (let date = addDays(latestBefore, 1); date <= today && loaded < MAX_DAYS_PER_RUN; date = addDays(date, 1)) {
      const day = await loadDay(date, tracked, problems, out.skipped)
      if (!day) continue
      loaded++
      out.days.push(day)
      out.latestAfter = date
      if (day.checks.coveragePct < 90) problems.push(`${date}: only ${day.checks.coveragePct}% of the previous session's stocks have a bar`)
      if (day.checks.badOhlc > 0) problems.push(`${date}: ${day.checks.badOhlc} bars with impossible high/low`)
      for (const r of day.rejected) problems.push(`${r.symbol} ${r.exDate}: corporate action not applied (${r.note})`)
    }

    // NSE publishes in the evening; having nothing new for several days means the feed is broken
    const behind = (Date.parse(today) - Date.parse(out.latestAfter!)) / 86400000
    if (behind > 5) {
      problems.push(`no usable NSE file since ${out.latestAfter} (${Math.floor(behind)} days)`)
      for (const s of out.skipped) problems.push(`${s.date} skipped: ${s.reason}`)
    }
    out.ok = behind <= 5
  } catch (err: any) {
    problems.push(err.message)
  }

  await db.insert(marketDataRuns).values({ ok: out.ok, latestDate: out.latestAfter, summary: out }).catch(() => {})
  return out
}
