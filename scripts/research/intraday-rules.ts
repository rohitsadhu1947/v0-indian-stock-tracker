/**
 * Test plain day-trading rules on 5-minute prices and write the results.
 *
 *   npm run research:intraday
 *
 * Reads data/intraday (scripts/research/intraday-fetch.ts): the 100 most
 * traded stocks of each month since 2015. Every rule is checked on every
 * stock and session. Entries are at the open of the bar after the signal.
 * Figures are shown before costs and after intraday costs of 0.21% (tight)
 * and 0.31% (cautious) a round trip.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { intradayCharges, minuteOf, type MinuteBar } from '@/lib/research/day-trade'
import { daysBetween } from '@/lib/research/dates'
import { carryOut, INTRADAY_RULES, type Session } from '@/lib/research/intraday-rules'
import { meanAndT } from '@/lib/research/swing'

const DIR = 'data/intraday'
const COSTS = { tight: intradayCharges() + 0.001, cautious: intradayCharges() + 0.002 }
const pct = (x: number) => Math.round(x * 10000) / 100
const round2 = (x: number) => Math.round(x * 100) / 100

interface Row { date: number; ret: number; stopped: boolean }
const rows = new Map<string, Row[]>()
const add = (key: string, row: Row) => { const list = rows.get(key); if (list) list.push(row); else rows.set(key, [row]) }
// For the cross-section rule: each stock's move to 10:00 and what holding from 10:00 to 15:15 made
const morning = new Map<number, Array<{ move: number; ret: number }>>()

const files = readdirSync(DIR).filter(f => f.endsWith('.json') && f !== 'NIFTY-50.json')
let stockDays = 0
for (const file of files) {
  const days = JSON.parse(readFileSync(`${DIR}/${file}`, 'utf8')).days as Record<string, MinuteBar[]>
  const dates = Object.keys(days).map(Number).sort((a, b) => a - b)
  for (let k = 1; k < dates.length; k++) {
    const date = dates[k], bars = days[date], prev = days[dates[k - 1]]
    // Needs the session before it, and a full day of bars on both
    if (daysBetween(dates[k - 1], date) > 5 || bars.length < 60 || prev.length < 60 || bars[0][0] !== minuteOf('09:15')) continue
    const session: Session = {
      bars, prevClose: prev[prev.length - 1][4],
      prevHigh: Math.max(...prev.map(b => b[2])), prevLow: Math.min(...prev.map(b => b[3])),
    }
    // A move of more than 25% between sessions is a split or bonus the price history has not adjusted
    if (Math.abs(bars[0][1] / session.prevClose - 1) > 0.25) continue
    stockDays++
    for (const rule of INTRADAY_RULES) {
      const plan = rule.plan(session)
      const result = plan && carryOut(bars, plan)
      if (result) add(rule.key, { date, ret: result.ret, stopped: result.stopped })
    }
    const hold = carryOut(bars, { side: 'long', entryIndex: 1, exit: minuteOf('15:15') })
    if (hold) add('baseline', { date, ret: hold.ret, stopped: false })
    const ten = bars.findIndex(b => b[0] >= minuteOf('10:00'))
    const late = ten > 0 && bars[ten][0] <= minuteOf('10:10') ? carryOut(bars, { side: 'long', entryIndex: ten, exit: minuteOf('15:15') }) : null
    if (late) {
      const list = morning.get(date) ?? []
      list.push({ move: bars[ten][1] / session.prevClose - 1, ret: late.ret })
      morning.set(date, list)
    }
  }
}
// Each day's strongest and weakest tenth of stocks by 10:00, held to 15:15
for (const [date, list] of morning) {
  if (list.length < 20) continue
  list.sort((a, b) => a.move - b.move)
  const n = Math.max(1, Math.floor(list.length / 10))
  for (const x of list.slice(-n)) { add('strongest-long', { date, ret: x.ret, stopped: false }); add('strongest-short', { date, ret: -x.ret, stopped: false }) }
  for (const x of list.slice(0, n)) { add('weakest-long', { date, ret: x.ret, stopped: false }); add('weakest-short', { date, ret: -x.ret, stopped: false }) }
}
const EXTRA = [
  { key: 'strongest-long', label: 'Strongest tenth at 10:00: buy', basis: 'The tenth of stocks up most from the previous close at 10:00, bought to 15:15.' },
  { key: 'strongest-short', label: 'Strongest tenth at 10:00: sell short', basis: 'The same stocks sold short.' },
  { key: 'weakest-long', label: 'Weakest tenth at 10:00: buy', basis: 'The tenth of stocks down most at 10:00, bought to 15:15.' },
  { key: 'weakest-short', label: 'Weakest tenth at 10:00: sell short', basis: 'The same stocks sold short.' },
  { key: 'baseline', label: 'Any stock, any day: buy 09:20, sell 15:15', basis: 'Every stock and session, for comparison.' },
]

function summarise(list: Row[]) {
  const byDay = new Map<number, { sum: number; n: number }>()
  for (const r of list) { const d = byDay.get(r.date) ?? { sum: 0, n: 0 }; d.sum += r.ret; d.n++; byDay.set(r.date, d) }
  const edge = meanAndT([...byDay.values()].map(d => d.sum / d.n))
  const mean = list.reduce((a, r) => a + r.ret, 0) / list.length
  const years = [...new Set(list.map(r => Math.floor(r.date / 10000)))].sort()
  return {
    trades: list.length, days: byDay.size, grossPct: pct(mean), t: round2(edge.t),
    netTightPct: pct(mean - COSTS.tight), netCautiousPct: pct(mean - COSTS.cautious),
    winPct: pct(list.filter(r => r.ret > COSTS.tight).length / list.length), stoppedPct: pct(list.filter(r => r.stopped).length / list.length),
    byYear: Object.fromEntries(years.map(y => { const part = list.filter(r => Math.floor(r.date / 10000) === y); return [y, pct(part.reduce((a, r) => a + r.ret, 0) / part.length)] })),
  }
}

const results = [...INTRADAY_RULES, ...EXTRA].map(r => ({ key: r.key, label: r.label, basis: r.basis, ...(rows.get(r.key)?.length ? summarise(rows.get(r.key)!) : { trades: 0 }) }))
mkdirSync('research/results', { recursive: true })
writeFileSync('research/results/intraday-rules.json', JSON.stringify({
  generatedAt: new Date().toISOString(), stocks: files.length, stockDays,
  costsPct: { tight: pct(COSTS.tight), cautious: pct(COSTS.cautious) },
  note: 'Returns are a fraction of the entry value, positive for a gain on either side. The t-statistic is on each day\'s average trade.',
  results,
}, null, 1))

console.log(`${files.length} stocks, ${stockDays} stock-days. Costs ${pct(COSTS.tight)}% tight, ${pct(COSTS.cautious)}% cautious.`)
console.log(`${'Rule'.padEnd(42)}${'trades'.padStart(8)}${'gross %'.padStart(9)}${'t'.padStart(7)}${'net tight'.padStart(11)}${'net caut.'.padStart(11)}${'win %'.padStart(7)}${'stop %'.padStart(8)}   gross by year`)
for (const r of results as any[]) {
  if (!r.trades) { console.log(`${r.label.padEnd(42)}       0`); continue }
  console.log(`${r.label.slice(0, 41).padEnd(42)}${String(r.trades).padStart(8)}${r.grossPct.toFixed(2).padStart(9)}${r.t.toFixed(1).padStart(7)}${r.netTightPct.toFixed(2).padStart(11)}${r.netCautiousPct.toFixed(2).padStart(11)}${r.winPct.toFixed(0).padStart(7)}${r.stoppedPct.toFixed(0).padStart(8)}   ${Object.entries(r.byYear).map(([y, v]: any) => `${String(y).slice(2)}:${v.toFixed(2)}`).join(' ')}`)
}
