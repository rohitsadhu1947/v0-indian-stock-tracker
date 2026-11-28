/**
 * Selling NIFTY options for monthly income, tested on NSE's daily prices.
 *
 *   npm run research:nifty-options
 *
 * Each month, on the session after the monthly expiry, sell options that
 * expire next month and hold them to expiry. Tested shapes:
 *   strangle  sell a call above the index and a put below it
 *   condor    the same, plus buying a call and a put further out to cap the loss
 *   put       sell only the put
 * at 3%, 5% and 7% away from the index, with and without a stop that buys
 * everything back when the options cost twice what was received.
 * A weekly strangle is tested from 2019, when weekly expiries began.
 *
 * Prices are daily closes, so entries, stops and exits are at the close.
 * Costs: 1.5% of the premium in slippage each time a leg trades (at least
 * Rs 0.50 a share), 0.15% of premium in tax and charges, Rs 0.5 a share in
 * brokerage. Results are a share of capital: 20% of the index value for
 * uncovered selling, the gap between strikes for a condor. The same capital
 * is used every time, so results add up and do not compound.
 */
import { mkdirSync, writeFileSync } from 'fs'
import { DatabaseSync } from 'node:sqlite'

const START = 20110101
const PERIODS = [{ key: '2011-2019', from: 20110101, to: 20191231 }, { key: '2020-2022', from: 20200101, to: 20221231 }, { key: '2023-now', from: 20230101, to: 99999999 }]
const round2 = (x: number) => Math.round(x * 100) / 100
const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
const TAX = 0.312               // business income at the 30% slab with cess
const NAKED_CAPITAL = 0.20      // capital kept for uncovered selling, as a share of the index value
const CONDOR_WING = 0.03        // how much further out the bought options are

const market = new DatabaseSync('data/market.db', { readOnly: true })
const fo = new DatabaseSync('data/fo.db', { readOnly: true })
const spot = new Map<number, number>()
for (const r of market.prepare("select date, close from index_bars where name in ('S&P CNX Nifty', 'CNX Nifty', 'Nifty 50') order by date").all() as Array<{ date: number; close: number }>) spot.set(r.date, r.close)
const vix = new Map<number, number>()
for (const r of market.prepare("select date, close from index_bars where name = 'India VIX'").all() as Array<{ date: number; close: number }>) vix.set(r.date, r.close)
const sessions = (fo.prepare('select date from nifty_options_days where rows > 0 and date >= ? order by date').all(START) as Array<{ date: number }>).map(r => r.date).filter(d => spot.has(d))
const monthlyExpiries = new Set((fo.prepare("select distinct expiry from fo_futures where symbol = 'NIFTY'").all() as Array<{ expiry: number }>).map(r => r.expiry))
const allExpiries = (fo.prepare('select distinct expiry from nifty_options order by expiry').all() as Array<{ expiry: number }>).map(r => r.expiry)

interface Quote { close: number; settle: number; contracts: number }
const chainStmt = fo.prepare('select strike, type, close, settle, contracts from nifty_options where date = ? and expiry = ?')
const chainCache = new Map<string, Map<string, Quote>>()
function chain(date: number, expiry: number): Map<string, Quote> {
  const key = `${date}|${expiry}`
  let c = chainCache.get(key)
  if (!c) {
    c = new Map()
    for (const r of chainStmt.all(date, expiry) as Array<{ strike: number; type: string; close: number; settle: number; contracts: number }>) c.set(`${r.strike}|${r.type}`, { close: r.close, settle: r.settle, contracts: r.contracts })
    chainCache.set(key, c)
  }
  return c
}
/** The traded strike nearest a target price, among those with real volume that day. */
function pick(date: number, expiry: number, type: 'CE' | 'PE', target: number): { strike: number; price: number } | null {
  let best: { strike: number; price: number } | null = null
  for (const [key, q] of chain(date, expiry)) {
    const [strike, t] = key.split('|')
    if (t !== type || q.contracts < 100 || !(q.close > 0)) continue
    if (!best || Math.abs(Number(strike) - target) < Math.abs(best.strike - target)) best = { strike: Number(strike), price: q.close }
  }
  // A strike far from the target means the chain was too thin that day
  return best && Math.abs(best.strike - target) / target < 0.015 ? best : null
}
const cost = (premium: number) => Math.max(0.5, premium * 0.015) + premium * 0.0015 + 0.5
const intrinsic = (type: 'CE' | 'PE', strike: number, at: number) => Math.max(0, type === 'CE' ? at - strike : strike - at)

interface Leg { type: 'CE' | 'PE'; strike: number; price: number; side: -1 | 1 }   // side -1 sold, +1 bought
interface Trade { entry: number; exit: number; expiry: number; pnlPct: number; worstPct: number; stopped: boolean; creditPct: number; vix: number | null }
interface Shape { key: string; legs: Array<{ type: 'CE' | 'PE'; away: number; side: -1 | 1 }>; capital: number; stop: number | null }

function runTrade(shape: Shape, entry: number, expiry: number): Trade | null {
  const s0 = spot.get(entry)!
  const legs: Leg[] = []
  for (const l of shape.legs) {
    const p = pick(entry, expiry, l.type, s0 * (1 + (l.type === 'CE' ? l.away : -l.away)))
    if (!p) return null
    legs.push({ type: l.type, strike: p.strike, price: p.price, side: l.side })
  }
  // Money in at the start: premium received on sold legs, less premium paid on bought legs, less costs on each
  const credit = legs.reduce((a, l) => a - l.side * l.price - cost(l.price), 0)
  const soldCredit = legs.filter(l => l.side === -1).reduce((a, l) => a + l.price, 0)
  // A condor cannot lose more than the widest gap between its strikes, so that gap is its capital
  const gap = (type: 'CE' | 'PE') => { const own = legs.filter(l => l.type === type); return own.length === 2 ? Math.abs(own[0].strike - own[1].strike) : 0 }
  const capital = legs.length === 4 ? Math.max(gap('CE'), gap('PE')) : shape.capital * s0
  let worst = 0
  const days = sessions.filter(d => d > entry && d <= expiry)
  // The prices must run to the expiry: a trade still open at the end of the data is not counted
  if (!days.length || sessions[sessions.length - 1] < expiry) return null
  for (const d of days) {
    const last = d === days[days.length - 1]
    if (last) {
      const at = spot.get(d)!
      const pnl = credit + legs.reduce((a, l) => a + l.side * intrinsic(l.type, l.strike, at), 0)
      return { entry, exit: d, expiry, pnlPct: pnl / capital * 100, worstPct: Math.min(worst, pnl / capital * 100), stopped: false, creditPct: credit / capital * 100, vix: vix.get(entry) ?? null }
    }
    const c = chain(d, expiry)
    let value = 0, soldValue = 0, known = true
    for (const l of legs) {
      const q = c.get(`${l.strike}|${l.type}`)
      const price = q ? (q.contracts > 0 ? q.close : q.settle || q.close) : NaN
      if (!(price >= 0)) { known = false; break }
      value += l.side * price
      if (l.side === -1) soldValue += price
    }
    if (!known) continue
    const mtm = credit + value
    worst = Math.min(worst, mtm / capital * 100)
    if (shape.stop != null && soldValue >= shape.stop * soldCredit) {
      const exitCost = legs.reduce((a, l) => a + cost(c.get(`${l.strike}|${l.type}`)!.close), 0)
      const pnl = mtm - exitCost
      return { entry, exit: d, expiry, pnlPct: pnl / capital * 100, worstPct: Math.min(worst, pnl / capital * 100), stopped: true, creditPct: credit / capital * 100, vix: vix.get(entry) ?? null }
    }
  }
  return null
}

/** Trades one after another: enter the session after an expiry, in options of the next expiry in `expiries`. */
function run(shape: Shape, expiries: number[], from: number): Trade[] {
  const out: Trade[] = []
  for (let i = 0; i + 1 < expiries.length; i++) {
    const entry = sessions.find(d => d > expiries[i])
    if (entry == null || entry < from || entry >= expiries[i + 1]) continue
    const t = runTrade(shape, entry, expiries[i + 1])
    if (t) out.push(t)
  }
  return out
}

function describe(trades: Trade[], perYear: number) {
  if (trades.length < 12) return { trades: trades.length }
  const r = trades.map(t => t.pnlPct)
  // The same capital every time, profits taken out: results add up and do not compound.
  // Tax is taken on each financial year's profit, after setting off losses carried from earlier years.
  let total = 0, peak = 0, fall = 0, yearProfit = 0, carried = 0, tax = 0, year = -1
  const settleTax = () => {
    const taxable = yearProfit + carried
    if (taxable > 0) { tax += taxable * TAX; carried = 0 } else carried = taxable
    yearProfit = 0
  }
  for (const t of trades) {
    const fy = Math.floor((t.exit - 331) / 10000)
    if (year !== -1 && fy !== year) settleTax()
    year = fy
    total += t.pnlPct; peak = Math.max(peak, total); fall = Math.min(fall, total - peak)
    yearProfit += t.pnlPct
  }
  settleTax()
  const years = trades.length / perYear
  const sd = Math.sqrt(mean(r.map(x => (x - mean(r)) ** 2)))
  const sorted = [...r].sort((a, b) => a - b)
  return {
    trades: trades.length, wonPct: round2(r.filter(x => x > 0).length / r.length * 100), avgPct: round2(mean(r)), medianPct: round2(sorted[sorted.length >> 1]),
    worstPct: round2(sorted[0]), worstDuringPct: round2(Math.min(...trades.map(t => t.worstPct))), stoppedPct: round2(trades.filter(t => t.stopped).length / trades.length * 100),
    tStat: round2(mean(r) / (sd / Math.sqrt(r.length))), aYearPct: round2(total / years), aYearAfterTaxPct: round2((total - tax) / years), worstFallPct: round2(fall),
  }
}
const withPeriods = (trades: Trade[], perYear: number) => ({ ...describe(trades, perYear), periods: Object.fromEntries(PERIODS.map(p => [p.key, describe(trades.filter(t => t.entry >= p.from && t.entry <= p.to), perYear)])) })

const months = [...monthlyExpiries].filter(e => e >= START).sort((a, b) => a - b)
const weeks = allExpiries.filter(e => e >= 20190301)
const shapes: Shape[] = []
for (const away of [0.03, 0.05, 0.07]) for (const stop of [null, 2]) {
  const tag = `${Math.round(away * 100)}% away${stop ? ', stop at 2x' : ''}`
  shapes.push({ key: `strangle ${tag}`, legs: [{ type: 'CE', away, side: -1 }, { type: 'PE', away, side: -1 }], capital: NAKED_CAPITAL, stop })
  shapes.push({ key: `condor ${tag}`, legs: [{ type: 'CE', away, side: -1 }, { type: 'PE', away, side: -1 }, { type: 'CE', away: away + CONDOR_WING, side: 1 }, { type: 'PE', away: away + CONDOR_WING, side: 1 }], capital: CONDOR_WING, stop })
  shapes.push({ key: `put only ${tag}`, legs: [{ type: 'PE', away, side: -1 }], capital: NAKED_CAPITAL, stop })
}

const out: Record<string, unknown> = {
  note: 'Sold the session after the monthly expiry, held to the next expiry, at daily closing prices. Results are a share of capital: 20% of the index value for strangles and puts, the gap between strikes (about 3% of the index) for condors. After costs. The same capital is used every time and results add up without compounding. After-tax figures take 31.2% of each financial year\'s profit after setting off earlier losses. The worst fall is the largest drop in the running total. No interest is added on the capital.',
  sessions: sessions.length, from: sessions[0], to: sessions[sessions.length - 1], tested: shapes.length + 4,
}
const line = (label: string, r: any) => console.log(`${label.padEnd(36)}${String(r.trades).padStart(5)}${String(r.wonPct ?? '').padStart(7)}${String(r.avgPct ?? '').padStart(7)}${String(r.medianPct ?? '').padStart(8)}${String(r.worstPct ?? '').padStart(8)}${String(r.worstDuringPct ?? '').padStart(8)}${String(r.stoppedPct ?? '').padStart(7)}${String(r.tStat ?? '').padStart(6)}${String(r.aYearPct ?? '').padStart(8)}${String(r.aYearAfterTaxPct ?? '').padStart(8)}${String(r.worstFallPct ?? '').padStart(8)}   ${PERIODS.map(p => { const x = r.periods?.[p.key]; return !x || x.aYearPct == null ? `n/a (${x?.trades ?? 0})` : `${x.aYearPct} (${x.trades})` }).join(' | ')}`)
const head = (title: string) => console.log(`\n${title}\n${''.padEnd(36)}${'n'.padStart(5)}${'won%'.padStart(7)}${'avg%'.padStart(7)}${'median%'.padStart(8)}${'worst%'.padStart(8)}${'during%'.padStart(8)}${'stop%'.padStart(7)}${'t'.padStart(6)}${'a year'.padStart(8)}${'aft tax'.padStart(8)}${'fall%'.padStart(8)}   a year by period (trades)`)

console.log(`${sessions.length} sessions, ${sessions[0]} to ${sessions[sessions.length - 1]}. ${months.length} monthly expiries.`)
head('Monthly, as a share of capital')
const monthly: Record<string, unknown> = {}
const kept = new Map<string, Trade[]>()
for (const s of shapes) { const t = run(s, months, START); kept.set(s.key, t); monthly[s.key] = withPeriods(t, 12); line(s.key, monthly[s.key]) }
out.monthly = monthly

head('Weekly strangle from 2019, as a share of capital')
const weekly: Record<string, unknown> = {}
for (const [away, stop] of [[0.02, null], [0.02, 2], [0.03, null], [0.03, 2]] as Array<[number, number | null]>) {
  const key = `weekly strangle ${Math.round(away * 100)}% away${stop ? ', stop at 2x' : ''}`
  const t = run({ key, legs: [{ type: 'CE', away, side: -1 }, { type: 'PE', away, side: -1 }], capital: NAKED_CAPITAL, stop }, weeks, 20190301)
  kept.set(key, t); weekly[key] = withPeriods(t, 52); line(key, weekly[key])
}
out.weekly = weekly

// The worst months of the plain 5% strangle, and what calm and nervous markets did to it
const base = kept.get('strangle 5% away')!
out.worstMonths = [...base].sort((a, b) => a.pnlPct - b.pnlPct).slice(0, 8).map(t => ({ entry: t.entry, expiry: t.expiry, pnlPct: round2(t.pnlPct), worstDuringPct: round2(t.worstPct), vixAtEntry: t.vix }))
console.log('\nWorst months of the 5% strangle (share of capital):')
for (const w of out.worstMonths as any[]) console.log(`  entered ${w.entry}, expiry ${w.expiry}: ${w.pnlPct}%  (worst during ${w.worstDuringPct}%, VIX ${w.vixAtEntry})`)
const byVix = [['VIX under 14', (v: number) => v < 14], ['VIX 14 to 20', (v: number) => v >= 14 && v < 20], ['VIX 20 or more', (v: number) => v >= 20]] as Array<[string, (v: number) => boolean]>
out.byVix = Object.fromEntries(byVix.map(([k, f]) => { const t = base.filter(x => x.vix != null && f(x.vix)); return [k, { trades: t.length, avgPct: round2(mean(t.map(x => x.pnlPct))), wonPct: round2(t.filter(x => x.pnlPct > 0).length / Math.max(1, t.length) * 100), avgCreditPct: round2(mean(t.map(x => x.creditPct))) }] }))
console.log('\n5% strangle by VIX at entry:', JSON.stringify(out.byVix))
out.yearly = Object.fromEntries([...new Set(base.map(t => Math.floor(t.exit / 10000)))].map(y => [y, round2(base.filter(t => Math.floor(t.exit / 10000) === y).reduce((a, t) => a + t.pnlPct, 0))]))
console.log('5% strangle, sum of monthly results by year (share of capital):', JSON.stringify(out.yearly))

mkdirSync('research/results', { recursive: true })
writeFileSync('research/results/nifty-options.json', JSON.stringify(out, null, 2))
console.log('\nSaved research/results/nifty-options.json')
