/**
 * Two more ideas, tested on data already in the local store.
 *
 *   npm run research:dividend-and-dip
 *
 * 1. Dividend run-up: when NSE first lists the ex-date of a dividend, buy at
 *    the next close and sell at the close before the ex-date. Split by how
 *    big the dividend is against the share price. Also: hold through the
 *    ex-date for 5 more sessions and keep the dividend.
 * 2. Waiting for a dip on results buys: after a results jump, wait for the
 *    price to come back before buying, and sell on the same day as the
 *    tested rule (session 60 after the usual buy day).
 *
 * Top 750 stocks. Costs 0.45% a round trip (0.85% past rank 500). "Excess"
 * is against the average top-500 stock over the same days.
 */
import { mkdirSync, writeFileSync } from 'fs'
import { DatabaseSync } from 'node:sqlite'
import { lastAtOrBefore } from '@/lib/research/dates'
import { loadMarketCached } from '@/lib/research/load'
import { indicators, meanAndT } from '@/lib/research/swing'
import { parseCorporateAction } from '@/lib/market-data/corporate-actions'
import { DEFAULT_COSTS } from '@/lib/backtest/costs'
import { periodStats, slice } from '@/lib/research/metrics'
import { simulateSwingBook, type BookOptions, type Candidate } from '@/lib/research/swing-book'

const START = 20110131
const PERIODS = [{ key: '2011-2019', from: 20110101, to: 20191231 }, { key: '2020-2022', from: 20200101, to: 20221231 }, { key: '2023-now', from: 20230101, to: 99999999 }]
const round2 = (x: number) => Math.round(x * 100) / 100
const pct = (x: number) => Math.round(x * 10000) / 100
const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0

const market = loadMarketCached()
const sessionIndex = new Map<number, number>()
market.sessions.forEach((d, i) => sessionIndex.set(d, i))
const rankOf = new Map<number, Map<string, number>>()
for (const d of market.universeDates) rankOf.set(d, new Map(market.universe.get(d)!.map((s, i) => [s, i + 1])))
const rank = (symbol: string, date: number): number => {
  const i = lastAtOrBefore(market.universeDates, date)
  return i < 0 ? Infinity : rankOf.get(market.universeDates[i])!.get(symbol) ?? Infinity
}
const dayRet = new Float64Array(market.sessions.length), dayN = new Float64Array(market.sessions.length)
for (const s of market.stocks.values()) for (let i = 1; i < s.dates.length; i++) {
  if (s.dates[i] < 20100101 || rank(s.symbol, s.dates[i]) > 500) continue
  const k = sessionIndex.get(s.dates[i])!
  if (sessionIndex.get(s.dates[i - 1]) !== k - 1) continue
  dayRet[k] += s.close[i] / s.close[i - 1] - 1; dayN[k]++
}
for (let k = 0; k < dayRet.length; k++) if (dayN[k]) dayRet[k] /= dayN[k]

interface Trade { date: number; ret: number; excess: number; sessions: number }
/** Bought at the close of index `e`, sold at the close of index `x`. `extra` is cash received on the way, as a share of the buy price. */
function trade(s: { dates: Int32Array; close: Float64Array }, e: number, x: number, cost: number, extra = 0): Trade | null {
  if (e < 1 || x >= s.dates.length || x <= e || !(s.close[e] > 0)) return null
  const ke = sessionIndex.get(s.dates[e])!, kx = sessionIndex.get(s.dates[x])!
  if (kx - ke !== x - e) return null
  let v = 1
  for (let k = ke + 1; k <= kx; k++) v *= 1 + dayRet[k]
  const ret = s.close[x] / s.close[e] - 1 + extra - cost
  return { date: s.dates[e], ret, excess: ret - (v - 1 - 0.0045), sessions: x - e }
}
function summarise(rows: Trade[]) {
  if (rows.length < 30) return { trades: rows.length }
  const byDay = new Map<number, number[]>()
  for (const r of rows) byDay.set(r.date, [...(byDay.get(r.date) ?? []), r.excess])
  const sorted = rows.map(r => r.ret).sort((a, b) => a - b)
  return {
    trades: rows.length, winRatePct: round2(rows.filter(r => r.ret > 0).length / rows.length * 100), avgReturnPct: pct(mean(rows.map(r => r.ret))), medianReturnPct: pct(sorted[sorted.length >> 1]),
    avgExcessPct: pct(mean(rows.map(r => r.excess))), tStat: round2(meanAndT([...byDay.values()].map(mean)).t), avgSessions: round2(mean(rows.map(r => r.sessions))),
  }
}
const withPeriods = (rows: Trade[]) => ({ ...summarise(rows), periods: Object.fromEntries(PERIODS.map(p => [p.key, summarise(rows.filter(r => r.date >= p.from && r.date <= p.to))])) })
const head = (title: string) => console.log(`\n${title}\n${''.padEnd(50)}${'trades'.padStart(6)}${'win%'.padStart(7)}${'avg%'.padStart(8)}${'median%'.padStart(9)}${'excess%'.padStart(9)}${'t'.padStart(7)}${'days'.padStart(6)}   excess by period (trades)`)
const show = (label: string, r: any) => console.log(`${label.padEnd(50)}${String(r.trades).padStart(6)}${String(r.winRatePct ?? '').padStart(7)}${String(r.avgReturnPct ?? '').padStart(8)}${String(r.medianReturnPct ?? '').padStart(9)}${String(r.avgExcessPct ?? '').padStart(9)}${String(r.tStat ?? '').padStart(7)}${String(r.avgSessions ?? '').padStart(6)}   ${PERIODS.map(p => { const x = r.periods[p.key]; return x.avgExcessPct == null ? `n/a (${x.trades})` : `${x.avgExcessPct >= 0 ? '+' : ''}${x.avgExcessPct} (${x.trades})` }).join(' | ')}`)
const out: Record<string, unknown> = {}

// ---- 1. Dividend run-up ----
const store = new DatabaseSync('data/market.db', { readOnly: true })
// One listing per company and ex-date: the rupees a share, and the day NSE first listed it
const dividends = new Map<string, { symbol: string; exDate: number; firstSeen: number; amount: number }>()
for (const a of store.prepare('select symbol, ex_date, purpose, first_seen from corporate_actions_raw where ex_date >= ?').all(START) as Array<{ symbol: string; ex_date: number; purpose: string; first_seen: number }>) {
  const parsed = parseCorporateAction(a.purpose)
  if (!parsed.dividend?.amount || parsed.split || parsed.bonus || parsed.rights || parsed.restructure) continue
  const key = `${a.symbol}|${a.ex_date}`, old = dividends.get(key)
  dividends.set(key, { symbol: a.symbol, exDate: a.ex_date, firstSeen: Math.min(a.first_seen, old?.firstSeen ?? Infinity), amount: (old?.amount ?? 0) + parsed.dividend.amount })
}
const rawClose = store.prepare('select close from raw_bars where symbol = ? and date = ?')
// A dividend of 2% or more of the price is already taken out of the earlier prices in this history, the way
// exchanges adjust for it. For those, a holder's gain is already in the price change and only the tax is left
// to take off. Smaller dividends are not in the prices and are added after tax.
const TAX = 0.312
const inPrices = new Set((store.prepare("select symbol, ex_date from adjustment_events where price_factor < 1").all() as Array<{ symbol: string; ex_date: number }>).map(r => `${r.symbol}|${r.ex_date}`))
const dividendCash = (symbol: string, exDate: number, y: number): number => (inPrices.has(`${symbol}|${exDate}`) ? -TAX * y : (1 - TAX) * y)
const YIELD: Array<[string, number, number]> = [['under 0.5% of the price', 0, 0.005], ['0.5% to 1%', 0.005, 0.01], ['1% to 2%', 0.01, 0.02], ['2% to 4%', 0.02, 0.04], ['4% or more', 0.04, 1]]
const runUp: Record<string, Trade[]> = Object.fromEntries(YIELD.map(y => [y[0], []]))
const through: Record<string, Trade[]> = Object.fromEntries(YIELD.map(y => [y[0], []]))
const allRunUp: Trade[] = []
// For the book test: every dividend of 2% or more, keyed by the session to buy on
interface DividendCandidate extends Candidate { yieldPct: number; before: number; through: number; cash: number }
const bigDividends: DividendCandidate[] = []
for (const d of dividends.values()) {
  const s = market.stocks.get(d.symbol)
  if (!s) continue
  const x = lastAtOrBefore(s.dates, d.exDate - 1), seenAt = lastAtOrBefore(s.dates, d.firstSeen)
  if (x < 30 || seenAt < 0 || x - seenAt < 3) continue
  const r = rank(d.symbol, s.dates[seenAt])
  if (r > 750) continue
  // The series is adjusted for later splits; the dividend is in rupees of the day, so compare it with the raw price
  const raw = (rawClose.get(d.symbol, s.dates[seenAt]) as { close: number } | undefined)?.close
  if (!raw) continue
  const y = d.amount / raw
  const bucket = YIELD.find(b => y >= b[1] && y < b[2])
  if (!bucket) continue
  const cost = r > 500 ? 0.0085 : 0.0045
  const t = trade(s, seenAt + 1, x, cost)
  if (t) { runUp[bucket[0]].push(t); allRunUp.push(t) }
  // Held through the ex-date and 5 sessions on, keeping the dividend after 31.2% tax
  const t2 = trade(s, seenAt + 1, x + 6, cost, dividendCash(d.symbol, d.exDate, y))
  if (t2) through[bucket[0]].push(t2)
  if (y >= 0.02 && x + 6 < s.dates.length) bigDividends.push({ symbol: d.symbol, entryIndex: seenAt + 1, ret5: 0, turnover: s.turnover[seenAt], yieldPct: y * 100, before: x - seenAt, through: x + 6 - seenAt, cash: dividendCash(d.symbol, d.exDate, y) * s.close[seenAt] })
}
const dividendOut: Record<string, unknown> = { 'all dividends: listed to the day before': withPeriods(allRunUp) }
head(`1. Dividends, top 750: bought the session after the ex-date is listed (${dividends.size} listings)`)
show('all: sold the day before the ex-date', dividendOut['all dividends: listed to the day before'])
for (const [k, rows] of Object.entries(runUp)) { const r = withPeriods(rows); dividendOut[`${k}: sold the day before`] = r; show(`${k}: sold the day before`, r) }
for (const [k, rows] of Object.entries(through)) { const r = withPeriods(rows); dividendOut[`${k}: held 5 sessions past, dividend kept`] = r; show(`${k}: held 5 past, dividend kept`, r) }
out.dividends = { note: 'Dividend size is rupees a share against the price on the day it was listed. Held-through trades keep the dividend after 31.2% tax. Dividends of 2% or more are already in the adjusted prices, so for those only the tax is taken off.', ...dividendOut }

// ---- 1a. How much notice the listing gives ----
// Sessions from the listing to the last session before the ex-date. The tests above need 3 or more.
const NOTICE: Array<[string, number, number]> = [['1 session', 1, 1], ['2 sessions', 2, 2], ['3 to 5 sessions', 3, 5], ['6 to 10 sessions', 6, 10], ['more than 10 sessions', 11, 999]]
const byNotice: Record<string, Trade[]> = Object.fromEntries(NOTICE.flatMap(n => [[`${n[0]}: sold the day before`, []], [`${n[0]}: held 5 past, dividend kept`, []]]))
const noticeByPeriod: Record<string, number[]> = Object.fromEntries(PERIODS.map(p => [p.key, []]))
for (const d of dividends.values()) {
  const s = market.stocks.get(d.symbol)
  if (!s) continue
  const x = lastAtOrBefore(s.dates, d.exDate - 1), seenAt = lastAtOrBefore(s.dates, d.firstSeen)
  if (x < 30 || seenAt < 0 || x - seenAt < 1) continue
  const r = rank(d.symbol, s.dates[seenAt])
  const raw = (rawClose.get(d.symbol, s.dates[seenAt]) as { close: number } | undefined)?.close
  if (r > 750 || !raw || d.amount / raw < 0.02) continue
  const gap = x - seenAt
  // With one session of notice the buy is at the last close before the ex-date
  const t = trade(s, seenAt + 1, x + 6, r > 500 ? 0.0085 : 0.0045, dividendCash(d.symbol, d.exDate, d.amount / raw))
  if (!t) continue
  const label = NOTICE.find(n => gap >= n[1] && gap <= n[2])![0]
  byNotice[`${label}: held 5 past, dividend kept`].push(t)
  const before = trade(s, seenAt + 1, x, r > 500 ? 0.0085 : 0.0045)
  if (before) byNotice[`${label}: sold the day before`].push(before)
  noticeByPeriod[PERIODS.find(p => t.date >= p.from && t.date <= p.to)!.key].push(gap)
}
const noticeOut = Object.fromEntries(Object.entries(byNotice).map(([k, rows]) => [k, withPeriods(rows)]))
head('1a. Dividends of 2% or more, by the notice the listing gave')
for (const [k, r] of Object.entries(noticeOut)) show(k, r)
const median = (xs: number[]) => xs.length ? [...xs].sort((a, b) => a - b)[xs.length >> 1] : null
console.log('Median notice in sessions by period:', PERIODS.map(p => `${p.key}: ${median(noticeByPeriod[p.key])} (${noticeByPeriod[p.key].length})`).join(', '))
out.dividendsByNotice = { note: 'Notice is the sessions from the listing to the last session before the ex-date. Dividends of 2% or more, top 750. With one session of notice the buy is at the last close before the ex-date, so there is no sold-the-day-before trade.', ...noticeOut, medianNoticeByPeriod: Object.fromEntries(PERIODS.map(p => [p.key, median(noticeByPeriod[p.key])])) }

// ---- 1b. Big dividends as a real book ----
const bookOf = (test: (c: DividendCandidate) => boolean, keep: boolean) => {
  const out = new Map<number, Candidate[]>()
  for (const c of bigDividends) {
    if (!test(c)) continue
    const date = market.stocks.get(c.symbol)!.dates[c.entryIndex]
    out.set(date, [...(out.get(date) ?? []), { ...c, holdSessions: keep ? c.through : c.before, cashPerShare: keep ? c.cash : 0 }])
  }
  return out
}
const biggestFirst = (a: Candidate, b: Candidate) => (b as DividendCandidate).yieldPct - (a as DividendCandidate).yieldPct || a.symbol.localeCompare(b.symbol)
const BOOK: BookOptions = { start: START, capital: 2_500_000, slots: 10, maxSessions: 30, stopPct: null, entry: 'close', priority: biggestFirst, payTax: true, cashYield: 0.06 }
const books: Record<string, unknown> = {}
console.log(`\n1b. Dividends of 2% or more as a book of Rs 25 lakh, after charges and tax (${bigDividends.length} signals)\n${''.padEnd(56)}${'a year'.padStart(7)}${'fall'.padStart(8)}${'trades'.padStart(7)}${'win%'.padStart(7)}${'avg%'.padStart(7)}${'inv%'.padStart(6)}${'skipped'.padStart(8)}   a year by period`)
for (const [key, test, keep, extra, slippage] of [
  ['2% or more, held 5 past the ex-date, 10 positions', (c: DividendCandidate) => true, true, {}, 1],
  ['2% or more, sold the day before, 10 positions', (c: DividendCandidate) => true, false, {}, 1],
  ['2% or more, held 5 past, 5 positions', (c: DividendCandidate) => true, true, { slots: 5 }, 1],
  ['2% or more, held 5 past, 20 positions', (c: DividendCandidate) => true, true, { slots: 20 }, 1],
  ['3% or more, held 5 past, 10 positions', (c: DividendCandidate) => c.yieldPct >= 3, true, {}, 1],
  ['2% or more, held 5 past, 10 positions, 3x slippage', (c: DividendCandidate) => true, true, {}, 3],
  ['2% or more, held 5 past, 10 positions, idle cash earns 0', (c: DividendCandidate) => true, true, { cashYield: 0 }, 1],
] as Array<[string, (c: DividendCandidate) => boolean, boolean, Partial<BookOptions>, number]>) {
  const rets: number[] = []
  const r = simulateSwingBook(market, bookOf(test, keep), { ...BOOK, ...extra, costs: { ...DEFAULT_COSTS, slippagePercent: DEFAULT_COSTS.slippagePercent * slippage }, onTrade: t => rets.push(t.retPct) })
  const all = periodStats(slice(r.curve, START))
  const periods = PERIODS.map(p => round2(periodStats(slice(r.curve, Math.max(p.from, START), p.to)).cagrPct))
  books[key] = { cagrPct: round2(all.cagrPct), maxDrawdownPct: round2(all.maxDrawdownPct), trades: rets.length, winRatePct: round2(rets.filter(x => x > 0).length / Math.max(1, rets.length) * 100), avgTradePct: round2(mean(rets)), avgInvestedPct: round2(r.avgInvested * 100), skipped: r.skipped, periods: Object.fromEntries(PERIODS.map((p, i) => [p.key, periods[i]])) }
  console.log(`${key.padEnd(56)}${String(round2(all.cagrPct)).padStart(7)}${String(round2(all.maxDrawdownPct)).padStart(8)}${String(rets.length).padStart(7)}${String(round2(rets.filter(x => x > 0).length / Math.max(1, rets.length) * 100)).padStart(7)}${String(round2(mean(rets))).padStart(7)}${String(round2(r.avgInvested * 100)).padStart(6)}${String(r.skipped).padStart(8)}   ${periods.join(' | ')}`)
}
out.dividendBook = { note: 'Dividends of 2% or more of the price. Bought at the close after the ex-date is listed. Idle cash earns 6% unless stated. The dividend is kept after 31.2% tax.', ...books }

// ---- 2. Waiting for a dip on results buys ----
const HOLD = 60
const prepared = [...market.stocks.values()].map(s => ({ s, ind: indicators(s) }))
const momentumBy = new Map<number, number[]>()
for (const { s, ind } of prepared) for (let i = 253; i < s.dates.length; i++) if (s.dates[i] >= START && !Number.isNaN(ind.momentum[i]) && rank(s.symbol, s.dates[i]) <= 750) momentumBy.set(s.dates[i], [...(momentumBy.get(s.dates[i]) ?? []), ind.momentum[i]])
const dip: Record<string, Trade[]> = {
  'as now: buy the next close': [],
  'wait for a 3% dip within 10 sessions, else skip': [], 'wait for a 5% dip within 10 sessions, else skip': [], 'wait for a 5% dip within 20 sessions, else skip': [],
  'wait for a 5% dip within 10 sessions, else buy then': [],
  'the ones that never dipped 5% in 10 sessions': [], 'the ones that did dip 5% in 10 sessions, bought as now': [],
}
for (const { s, ind } of prepared) {
  let pointer = 0, busy = -1
  for (let i = 253; i + HOLD + 1 < s.dates.length; i++) {
    if (s.dates[i] < START) continue
    while (pointer < s.resultsDates.length && s.resultsDates[pointer] < s.dates[i - 1]) pointer++
    if (!(pointer < s.resultsDates.length && s.resultsDates[pointer] <= s.dates[i])) continue
    if (!(s.close[i] / s.close[i - 2] - 1 >= 0.08) || !(s.turnover[i] / ind.avgTurnover20[i] >= 3) || i + 1 <= busy) continue
    const r = rank(s.symbol, s.dates[i])
    const sorted = momentumBy.get(s.dates[i])
    if (r > 750 || !sorted || Number.isNaN(ind.momentum[i])) continue
    if (sorted.filter(x => x < ind.momentum[i]).length / Math.max(1, sorted.length - 1) < 0.2) continue
    const cost = r > 500 ? 0.0085 : 0.0045, x = i + HOLD
    const now = trade(s, i + 1, x, cost)
    if (!now) continue
    busy = x
    dip['as now: buy the next close'].push(now)
    // The first close at or below the signal close less the dip, from the second session after the signal
    const firstDip = (depth: number, within: number): number => { for (let j = i + 2; j <= i + 1 + within; j++) if (s.close[j] <= s.close[i] * (1 - depth)) return j; return -1 }
    for (const [key, depth, within] of [['wait for a 3% dip within 10 sessions, else skip', 0.03, 10], ['wait for a 5% dip within 10 sessions, else skip', 0.05, 10], ['wait for a 5% dip within 20 sessions, else skip', 0.05, 20]] as Array<[string, number, number]>) {
      const j = firstDip(depth, within)
      const t = j > 0 ? trade(s, j, x, cost) : null
      if (t) dip[key].push(t)
    }
    const j = firstDip(0.05, 10)
    const late = trade(s, j > 0 ? j : i + 11, x, cost)
    if (late) dip['wait for a 5% dip within 10 sessions, else buy then'].push(late)
    dip[j > 0 ? 'the ones that did dip 5% in 10 sessions, bought as now' : 'the ones that never dipped 5% in 10 sessions'].push(now)
  }
}
const dipOut = Object.fromEntries(Object.entries(dip).map(([k, rows]) => [k, withPeriods(rows)]))
head('2. Results buys, top 750, sold on session 60 after the usual buy day')
for (const [k, r] of Object.entries(dipOut)) show(k, r)
out.resultsBuyDip = { note: 'A dip is a close at or below the signal-day close less the depth. Every version sells on the same day, so a later buy is held for fewer sessions.', ...dipOut }

mkdirSync('research/results', { recursive: true })
writeFileSync('research/results/dividend-and-dip.json', JSON.stringify(out, null, 2))
console.log('\nSaved research/results/dividend-and-dip.json')
