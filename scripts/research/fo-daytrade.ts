/**
 * Test the F&O day-trade candidates on minute prices and write the results.
 *
 *   npm run research:fo-daytrade
 *
 * Reads the trades listed by `npm run research:fo` and the minute bars
 * fetched by scripts/research/fo-minute-fetch.ts. Each trade enters at a set
 * time on the morning after the signal and leaves the same day. A random
 * sample of ordinary F&O stock-days and NIFTY over the same minutes are
 * measured the same way for comparison.
 *
 * Then the main rule of each signal is run as a book: at most a fifth of the
 * capital in one stock, costs taken off every trade.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dayTrade, intradayCharges, minuteOf, windowReturn, type DayTradeRule, type MinuteBar } from '@/lib/research/day-trade'
import { meanAndT } from '@/lib/research/swing'

const DIR = 'data/fo/minute'
const SIDE: Record<string, 'long' | 'short'> = {
  'ban-entry': 'short', 'long-buildup-strong': 'short', 'call-volume-spike': 'short', 'short-buildup-strong': 'short',
  'ban-exit': 'long', control: 'short',
}
const LABEL: Record<string, string> = {
  'ban-entry': 'Enters the ban list (short)', 'long-buildup-strong': 'Strong new longs (short)', 'call-volume-spike': 'Call volume spike (short)',
  'short-buildup-strong': 'Strong new shorts (short)', 'ban-exit': 'Leaves the ban list (buy)', control: 'Any F&O stock, random days (short)',
}
const EXIT = minuteOf('15:15')
const VARIANTS: Array<{ key: string; label: string; entry: number; exit: number; stopPct?: number }> = [
  { key: 'open', label: 'First bar (09:15) to 15:15', entry: minuteOf('09:15'), exit: EXIT },
  { key: 'main', label: '09:20 to 15:15', entry: minuteOf('09:20'), exit: EXIT },
  { key: 'e0930', label: '09:30 to 15:15', entry: minuteOf('09:30'), exit: EXIT },
  { key: 'e1000', label: '10:00 to 15:15', entry: minuteOf('10:00'), exit: EXIT },
  { key: 'x1030', label: '09:20 to 10:30', entry: minuteOf('09:20'), exit: minuteOf('10:30') },
  { key: 'x1200', label: '09:20 to 12:00', entry: minuteOf('09:20'), exit: minuteOf('12:00') },
  { key: 'stop15', label: '09:20 to 15:15, 1.5% stop', entry: minuteOf('09:20'), exit: EXIT, stopPct: 1.5 },
  { key: 'stop3', label: '09:20 to 15:15, 3% stop', entry: minuteOf('09:20'), exit: EXIT, stopPct: 3 },
]
// Charges plus slippage of 0.05% a side (tight) and 0.10% a side (cautious)
const COSTS = { tight: intradayCharges() + 0.001, cautious: intradayCharges() + 0.002 }
const MAX_WEIGHT = 0.2
const pct = (x: number) => Math.round(x * 10000) / 100
const round2 = (x: number) => Math.round(x * 100) / 100

const files = new Map<string, Record<string, MinuteBar[]> | null>()
function bars(symbol: string, date: number): MinuteBar[] | null {
  if (!files.has(symbol)) {
    const file = `${DIR}/${symbol.replace(/[^A-Za-z0-9_-]/g, '-')}.json`
    files.set(symbol, existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).days : null)
  }
  return files.get(symbol)?.[date] ?? null
}

const trades = JSON.parse(readFileSync('data/fo/day-trades.json', 'utf8')) as Array<{ signal: string; symbol: string; date: number }>
interface Row { date: number; symbol: string; ret: number; hedged: number; stopped: boolean }
const rows = new Map<string, Row[]>()   // `${signal}|${variant}`
const coverage: Record<string, { listed: number; priced: number }> = {}

for (const t of trades) {
  const c = (coverage[t.signal] ??= { listed: 0, priced: 0 })
  c.listed++
  const stock = bars(t.symbol, t.date), index = bars('NIFTY 50', t.date)
  if (!stock || !index) continue
  c.priced++
  for (const v of VARIANTS) {
    const rule: DayTradeRule = { side: SIDE[t.signal], entry: v.entry, exit: v.exit, stopPct: v.stopPct }
    const result = dayTrade(stock, rule)
    if (!result) continue
    const market = windowReturn(index, result.entryMinute, result.exitMinute) ?? 0
    const sign = rule.side === 'long' ? 1 : -1
    const key = `${t.signal}|${v.key}`
    if (!rows.has(key)) rows.set(key, [])
    rows.get(key)!.push({ date: t.date, symbol: t.symbol, ret: result.ret, hedged: result.ret - sign * market, stopped: result.stopped })
  }
}

function summarise(list: Row[]) {
  if (!list.length) return null
  const byDay = new Map<number, { ret: number; hedged: number; n: number }>()
  for (const r of list) {
    const d = byDay.get(r.date) ?? { ret: 0, hedged: 0, n: 0 }
    d.ret += r.ret; d.hedged += r.hedged; d.n++
    byDay.set(r.date, d)
  }
  const days = [...byDay.values()]
  const gross = meanAndT(days.map(d => d.ret / d.n)), hedged = meanAndT(days.map(d => d.hedged / d.n))
  const mean = list.reduce((a, r) => a + r.ret, 0) / list.length
  return {
    trades: list.length, days: days.length,
    grossPct: pct(mean), t: round2(gross.t), hedgedPct: pct(list.reduce((a, r) => a + r.hedged, 0) / list.length), hedgedT: round2(hedged.t),
    netTightPct: pct(mean - COSTS.tight), netCautiousPct: pct(mean - COSTS.cautious),
    winPct: pct(list.filter(r => r.ret > COSTS.tight).length / list.length),
    stoppedPct: pct(list.filter(r => r.stopped).length / list.length),
    worstPct: pct(Math.min(...list.map(r => r.ret))),
  }
}

/** Every signal day traded: equal money in each stock, never more than a fifth of the capital in one. */
function book(list: Row[], cost: number, sessions: number[]) {
  const byDay = new Map<number, number[]>()
  for (const r of list) byDay.set(r.date, [...(byDay.get(r.date) ?? []), r.ret - cost])
  const daily = sessions.map(d => {
    const xs = byDay.get(d)
    return xs ? xs.reduce((a, b) => a + b, 0) * Math.min(MAX_WEIGHT, 1 / xs.length) : 0
  })
  let equity = 1, peak = 1, drawdown = 0
  const years = new Map<number, number>()
  daily.forEach((r, i) => {
    equity *= 1 + r
    peak = Math.max(peak, equity)
    drawdown = Math.min(drawdown, equity / peak - 1)
    const y = Math.floor(sessions[i] / 10000)
    years.set(y, (years.get(y) ?? 1) * (1 + r))
  })
  const m = meanAndT(daily)
  const sd = Math.sqrt(daily.reduce((a, r) => a + (r - m.mean) ** 2, 0) / (daily.length - 1))
  return {
    annualReturnPct: pct(Math.pow(equity, 250 / daily.length) - 1), sharpe: round2(sd > 0 ? (m.mean / sd) * Math.sqrt(250) : 0),
    maxDrawdownPct: pct(drawdown), worstDayPct: pct(Math.min(...daily)), daysTraded: byDay.size,
    byYear: Object.fromEntries([...years.entries()].map(([y, v]) => [y, pct(v - 1)])),
  }
}

const sessions = Object.keys(JSON.parse(readFileSync(`${DIR}/NIFTY-50.json`, 'utf8')).days).map(Number).sort((a, b) => a - b)
const results = Object.keys(SIDE).map(signal => ({
  signal, label: LABEL[signal], side: SIDE[signal], coverage: coverage[signal],
  variants: Object.fromEntries(VARIANTS.map(v => [v.key, { label: v.label, ...summarise(rows.get(`${signal}|${v.key}`) ?? []) }])),
  byYear: (() => {
    const list = rows.get(`${signal}|main`) ?? []
    const years = [...new Set(list.map(r => Math.floor(r.date / 10000)))].sort()
    return Object.fromEntries(years.map(y => { const s = summarise(list.filter(r => Math.floor(r.date / 10000) === y))!; return [y, { trades: s.trades, grossPct: s.grossPct, netCautiousPct: s.netCautiousPct }] }))
  })(),
  book: signal === 'control' ? null : {
    tight: book(rows.get(`${signal}|main`) ?? [], COSTS.tight, sessions),
    cautious: book(rows.get(`${signal}|main`) ?? [], COSTS.cautious, sessions),
    'cautious with a 3% stop': book(rows.get(`${signal}|stop3`) ?? [], COSTS.cautious, sessions),
  },
  // The biggest moves either way, to check for bad prices
  extremes: (() => {
    const list = (rows.get(`${signal}|main`) ?? []).slice().sort((x, y) => x.ret - y.ret)
    const show = (r: Row) => `${r.symbol} ${r.date} ${pct(r.ret)}%`
    return { worst: list.slice(0, 4).map(show), best: list.slice(-4).map(show) }
  })(),
}))

mkdirSync('research/results', { recursive: true })
writeFileSync('research/results/fo-daytrade.json', JSON.stringify({
  generatedAt: new Date().toISOString(), from: sessions[0], to: sessions[sessions.length - 1],
  costsPct: { tight: pct(COSTS.tight), cautious: pct(COSTS.cautious) },
  note: 'Returns are a fraction of the entry value, positive for a gain on either side. Hedged takes off NIFTY over the same minutes. The book puts equal money in each signal of the day, at most a fifth of capital in one stock.',
  results,
}, null, 1))

console.log(`Costs: ${pct(COSTS.tight)}% tight, ${pct(COSTS.cautious)}% cautious`)
for (const r of results) {
  console.log(`\n${r.label}: ${r.coverage?.priced} of ${r.coverage?.listed} trades have minute prices`)
  for (const v of VARIANTS) {
    const s: any = r.variants[v.key]
    if (!s.trades) continue
    console.log(`  ${v.label.padEnd(28)} n ${String(s.trades).padStart(5)}  gross ${s.grossPct.toFixed(2).padStart(6)}% (t ${s.t.toFixed(1)})  vs NIFTY ${s.hedgedPct.toFixed(2).padStart(6)}% (t ${s.hedgedT.toFixed(1)})  net ${s.netTightPct.toFixed(2)} / ${s.netCautiousPct.toFixed(2)}  win ${s.winPct.toFixed(0)}%  stopped ${s.stoppedPct.toFixed(0)}%  worst ${s.worstPct.toFixed(1)}%`)
  }
  console.log(`  by year (09:20 to 15:15, gross / net cautious): ${Object.entries(r.byYear).map(([y, s]: any) => `${y}: ${s.grossPct.toFixed(2)}/${s.netCautiousPct.toFixed(2)} (${s.trades})`).join('  ')}`)
  console.log(`  extremes: worst ${r.extremes.worst.join(', ')} | best ${r.extremes.best.join(', ')}`)
  if (r.book) for (const [name, b] of Object.entries(r.book) as any) {
    console.log(`  book, ${name} costs: ${b.annualReturnPct}% a year, Sharpe ${b.sharpe}, worst fall ${b.maxDrawdownPct}%, worst day ${b.worstDayPct}%, ${b.daysTraded} days traded. ${Object.entries(b.byYear).map(([y, v]) => `${y}: ${v}`).join(' ')}`)
  }
}
