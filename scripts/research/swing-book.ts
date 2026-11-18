/**
 * Run the swing rules that beat the baseline as a book with limited money.
 *
 *   npm run research:swing-book
 *
 * Rs 5 lakh, a fixed number of positions, whole shares, Zerodha delivery
 * charges, 0.1% slippage each way, and capital gains tax paid each March.
 * Idle cash earns nothing. Writes research/results/swing-book.json.
 */
import { mkdirSync, writeFileSync } from 'fs'
import { loadMarketCached } from '@/lib/research/load'
import { periodStats, slice, calendarYearReturns, type Curve } from '@/lib/research/metrics'
import { SWING_SIGNALS } from '@/lib/research/swing'
import { scanSignal, simulateSwingBook, type BookOptions, type Candidate } from '@/lib/research/swing-book'

const START = 20110101
const CAPITAL = 500000
const deepestFirst = (a: Candidate, b: Candidate) => a.ret5 - b.ret5 || a.symbol.localeCompare(b.symbol)
const mostTradedFirst = (a: Candidate, b: Candidate) => b.turnover - a.turnover || a.symbol.localeCompare(b.symbol)

const BASE: Omit<BookOptions, 'payTax'> = { start: START, capital: CAPITAL, slots: 10, maxSessions: 5, stopPct: null, entry: 'open', priority: deepestFirst }
const VARIANTS: Array<{ key: string; signal: string; note: string; options: Omit<BookOptions, 'payTax'> }> = [
  { key: 'deep-dip', signal: 'deep-dip', note: '10 positions, buy at open, sell after 5 sessions, deepest fall first', options: BASE },
  { key: 'deep-dip-vwap', signal: 'deep-dip', note: 'same, bought at the day\'s average price', options: { ...BASE, entry: 'vwap' } },
  { key: 'deep-dip-liquid-first', signal: 'deep-dip', note: 'same, most traded stock first', options: { ...BASE, priority: mostTradedFirst } },
  { key: 'deep-dip-5-slots', signal: 'deep-dip', note: '5 positions', options: { ...BASE, slots: 5 } },
  { key: 'deep-dip-20-slots', signal: 'deep-dip', note: '20 positions', options: { ...BASE, slots: 20 } },
  { key: 'deep-dip-stop8', signal: 'deep-dip', note: 'with an 8% stop', options: { ...BASE, stopPct: 8 } },
  { key: 'deep-dip-10d', signal: 'deep-dip', note: 'sell after 10 sessions', options: { ...BASE, maxSessions: 10 } },
  { key: 'quiet-dip', signal: 'quiet-dip', note: 'three falling days on low volume, 10 positions, 5 sessions', options: BASE },
  { key: 'pullback-rsi2', signal: 'pullback-rsi2', note: 'sharp dip in an uptrend, 10 positions, 5 sessions', options: BASE },
]

const PERIODS = [
  { key: 'full', from: START, to: Infinity },
  { key: '2011-2019', from: START, to: 20191231 },
  { key: '2020-2022', from: 20200101, to: 20221231 },
  { key: '2023-now', from: 20230101, to: Infinity },
]
const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d
const stats = (curve: Curve) => Object.fromEntries(PERIODS.map(p => {
  const s = periodStats(slice(curve, p.from, p.to))
  return [p.key, { cagrPct: round(s.cagrPct), maxDrawdownPct: round(s.maxDrawdownPct), worstYearPct: round(s.worstYearPct) }]
}))

const market = loadMarketCached()
const scans = new Map<string, ReturnType<typeof scanSignal>>()
const scan = (key: string) => {
  if (!scans.has(key)) scans.set(key, scanSignal(market, SWING_SIGNALS.find(s => s.key === key)!, START))
  return scans.get(key)!
}

const results = VARIANTS.map(v => {
  const candidates = scan(v.signal)
  const before = simulateSwingBook(market, candidates, { ...v.options, payTax: false })
  const after = simulateSwingBook(market, candidates, { ...v.options, payTax: true })
  const years = before.curve.dates.length / 250
  return {
    key: v.key, signal: v.signal, note: v.note,
    beforeTax: stats(before.curve), afterTax: stats(after.curve),
    yearsAfterTax: Object.fromEntries(Object.entries(calendarYearReturns(after.curve)).map(([y, r]) => [y, round(r)])),
    tradesPerYear: Math.round(after.trades / years),
    winRatePct: round(after.wins / after.trades * 100),
    signalsSkippedPct: round(after.skipped / (after.skipped + after.trades) * 100),
    avgInvestedPct: round(after.avgInvested * 100),
    chargesPctPerYear: round(after.charges / CAPITAL / years * 100),
  }
})

// NIFTY 500 over the same dates, price only
const index = market.indices.get('IDX:NIFTY 500')!
const indexCurve: Curve = { dates: [], equity: [] }
index.dates.forEach((d, i) => { if (d >= START) { indexCurve.dates.push(d); indexCurve.equity.push(index.close[i]) } })
const benchmark = stats(indexCurve)

mkdirSync('research/results', { recursive: true })
writeFileSync('research/results/swing-book.json', JSON.stringify({
  generatedFrom: { start: START, end: market.sessions[market.sessions.length - 1], capital: CAPITAL },
  note: 'A swing rule run as a book with limited positions, charges, slippage and tax. Idle cash earns nothing. The NIFTY 500 row is the price index, without dividends, costs or tax.',
  nifty500: benchmark, variants: results,
}, null, 1))

const pad = (v: unknown, n: number) => String(v).padStart(n)
const line = (s: any) => PERIODS.map(p => `${pad(s[p.key].cagrPct, 6)}% (${pad(s[p.key].maxDrawdownPct, 5)})`).join('  ')
console.log(`${'after tax: growth a year (worst fall)'.padEnd(24)}  ${PERIODS.map(p => p.key.padEnd(15)).join('  ')}  trades/yr  win%  skipped%  invested%  charges%/yr`)
console.log(`${'NIFTY 500 index'.padEnd(24)}  ${line(benchmark)}`)
for (const r of results) {
  console.log(`${r.key.padEnd(24)}  ${line(r.afterTax)}  ${pad(r.tradesPerYear, 9)}  ${pad(r.winRatePct, 4)}  ${pad(r.signalsSkippedPct, 8)}  ${pad(r.avgInvestedPct, 9)}  ${pad(r.chargesPctPerYear, 10)}`)
}
console.log('\nbefore tax')
for (const r of results) console.log(`${r.key.padEnd(24)}  ${line(r.beforeTax)}`)
console.log('\ndeep-dip by calendar year, after tax:', JSON.stringify(results[0].yearsAfterTax))
