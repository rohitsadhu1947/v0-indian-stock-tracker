/**
 * Test the crude oil rule on minute prices.
 *
 *   npm run research:crude
 *
 * The idea from the daily data: after Brent moves 3% or more overnight,
 * stocks hurt by the move keep falling through the session. Users of oil
 * (refiners, an airline, a paint maker) are sold short after crude rises;
 * producers are sold short after crude falls. Entry 09:20, exit 15:15.
 * The other two combinations, and ordinary days, are measured for comparison.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dayTrade, intradayCharges, minuteOf, windowReturn, type MinuteBar } from '@/lib/research/day-trade'
import { meanAndT } from '@/lib/research/swing'

const DIR = 'data/global/minute'
const USERS = ['BPCL', 'HINDPETRO', 'IOC', 'INDIGO', 'ASIANPAINT'], PRODUCERS = ['ONGC', 'OIL']
const COSTS = { tight: intradayCharges() + 0.001, cautious: intradayCharges() + 0.002 }
const PERIODS = [['2015-2019', 20150101, 20191231], ['2020-2022', 20200101, 20221231], ['2023-now', 20230101, 99999999]] as const
const pct = (x: number) => Math.round(x * 10000) / 100
const file = (symbol: string) => JSON.parse(readFileSync(`${DIR}/${symbol.replace(/[^A-Za-z0-9_-]/g, '-')}.json`, 'utf8')).days as Record<string, MinuteBar[]>
const bars = new Map<string, Record<string, MinuteBar[]>>()
const get = (symbol: string) => { if (!bars.has(symbol)) bars.set(symbol, file(symbol)); return bars.get(symbol)! }

interface Row { symbol: string; date: number; signal: string; short: number; shortStop: number; hedged: number }
const rows: Row[] = []
for (const t of JSON.parse(readFileSync('data/global/crude-trades.json', 'utf8')) as Array<{ signal: string; symbol: string; date: number }>) {
  const stock = get(t.symbol)[t.date], index = get('NIFTY 50')[t.date]
  if (!stock || !index) continue
  const plain = dayTrade(stock, { side: 'short', entry: minuteOf('09:20'), exit: minuteOf('15:15') })
  const stopped = dayTrade(stock, { side: 'short', entry: minuteOf('09:20'), exit: minuteOf('15:15'), stopPct: 3 })
  if (!plain || !stopped) continue
  const marketMove = windowReturn(index, plain.entryMinute, plain.exitMinute) ?? 0
  rows.push({ symbol: t.symbol, date: t.date, signal: t.signal, short: plain.ret, shortStop: stopped.ret, hedged: plain.ret + marketMove })
}

function summarise(list: Row[]) {
  if (list.length < 10) return null
  const byDay = new Map<number, number[]>()
  for (const r of list) byDay.set(r.date, [...(byDay.get(r.date) ?? []), r.short])
  const edge = meanAndT([...byDay.values()].map(xs => xs.reduce((a, b) => a + b, 0) / xs.length))
  const avg = (f: (r: Row) => number) => list.reduce((a, r) => a + f(r), 0) / list.length
  return {
    trades: list.length, days: byDay.size, shortPct: pct(avg(r => r.short)), t: Math.round(edge.t * 100) / 100, againstNiftyPct: pct(avg(r => r.hedged)),
    withStopPct: pct(avg(r => r.shortStop)), netTightPct: pct(avg(r => r.short) - COSTS.tight), netCautiousPct: pct(avg(r => r.short) - COSTS.cautious),
    winPct: pct(list.filter(r => r.short > COSTS.tight).length / list.length),
  }
}
const groups: Array<{ key: string; label: string; test: (r: Row) => boolean }> = [
  { key: 'users-crude-up', label: 'Oil users after crude rose 3% (the rule)', test: r => r.signal === 'crude-up' && USERS.includes(r.symbol) },
  { key: 'producers-crude-down', label: 'Oil producers after crude fell 3% (the rule)', test: r => r.signal === 'crude-down' && PRODUCERS.includes(r.symbol) },
  { key: 'users-crude-down', label: 'Oil users after crude fell 3%', test: r => r.signal === 'crude-down' && USERS.includes(r.symbol) },
  { key: 'producers-crude-up', label: 'Oil producers after crude rose 3%', test: r => r.signal === 'crude-up' && PRODUCERS.includes(r.symbol) },
  { key: 'users-control', label: 'Oil users, ordinary days', test: r => r.signal === 'control' && USERS.includes(r.symbol) },
  { key: 'producers-control', label: 'Oil producers, ordinary days', test: r => r.signal === 'control' && PRODUCERS.includes(r.symbol) },
]
const results = groups.map(g => {
  const list = rows.filter(g.test)
  return {
    key: g.key, label: g.label, all: summarise(list),
    periods: Object.fromEntries(PERIODS.map(([k, a, b]) => [k, summarise(list.filter(r => r.date >= a && r.date <= b))])),
    stocks: Object.fromEntries([...new Set(list.map(r => r.symbol))].map(s => [s, summarise(list.filter(r => r.symbol === s))])),
  }
})
mkdirSync('research/results', { recursive: true })
writeFileSync('research/results/crude-daytrade.json', JSON.stringify({
  generatedAt: new Date().toISOString(), costsPct: { tight: pct(COSTS.tight), cautious: pct(COSTS.cautious) },
  note: 'Every figure is the gain from selling short at 09:20 and buying back at 15:15, as a percentage of the entry value, before costs unless it says net. Against NIFTY takes off the index move over the same minutes.',
  results,
}, null, 1))

const line = (s: any) => (s ? `n ${String(s.trades).padStart(4)} (${String(s.days).padStart(3)} days)  short ${s.shortPct.toFixed(2).padStart(6)}% (t ${s.t.toFixed(1)})  vs NIFTY ${s.againstNiftyPct.toFixed(2).padStart(6)}%  3% stop ${s.withStopPct.toFixed(2).padStart(6)}%  net ${s.netTightPct.toFixed(2)} / ${s.netCautiousPct.toFixed(2)}  win ${s.winPct.toFixed(0)}%` : 'too few')
for (const r of results) {
  console.log(`\n${r.label}\n  all        ${line(r.all)}`)
  for (const [k, v] of Object.entries(r.periods)) console.log(`  ${k.padEnd(10)} ${line(v)}`)
  if (r.key.includes('crude')) for (const [k, v] of Object.entries(r.stocks)) console.log(`  ${k.padEnd(10)} ${line(v)}`)
}
