/**
 * Test overnight cues on the Indian session that follows them.
 *
 *   npm run research:global
 *
 * For each Indian session the cue is what happened abroad after the previous
 * Indian close: the US session or sessions in between, crude oil, the VIX,
 * and the US-listed shares of five Indian companies. Two things are
 * measured: the opening gap (which nobody can trade after the fact) and the
 * move from the open to the close (which can be traded).
 *
 * Data: data/global (scripts/research/global-fetch.ts), the local price
 * store, and NIFTY 5-minute bars for a 09:20 entry. Figures are before costs.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { openStore } from '@/lib/market-data/store'
import type { MinuteBar } from '@/lib/research/day-trade'
import { minuteOf } from '@/lib/research/day-trade'
import { loadMarketCached } from '@/lib/research/load'
import { meanAndT } from '@/lib/research/swing'

const START = 20110101
const pct = (x: number) => Math.round(x * 10000) / 100
const round2 = (x: number) => Math.round(x * 100) / 100
interface Series { dates: number[]; open: number[]; close: number[] }
const load = (key: string): Series => JSON.parse(readFileSync(`data/global/${key}.json`, 'utf8'))

/** Return of a foreign series over its sessions dated from `from` to the day before `to`: what India had not yet traded on. */
function cue(series: Series, from: number, to: number): number {
  let r = 1, any = false
  for (let i = 1; i < series.dates.length; i++) {
    const d = series.dates[i]
    if (d >= to) break
    if (d >= from) { r *= series.close[i] / series.close[i - 1]; any = true }
  }
  return any ? r - 1 : NaN
}

// ---- NIFTY sessions: gap, open to close, and 09:20 to 15:15 where 5-minute bars exist ----
const store = openStore()
const niftyRows = store.prepare(`select date, open, close from index_bars where lower(name) in ('nifty 50', 'cnx nifty', 's&p cnx nifty') and open > 0 order by date`).all() as Array<{ date: number; open: number; close: number }>
store.close()
const fiveMinute: Record<string, MinuteBar[]> = existsSync('data/intraday/NIFTY-50.json') ? JSON.parse(readFileSync('data/intraday/NIFTY-50.json', 'utf8')).days : {}
function session0920(date: number): number | null {
  const bars = fiveMinute[date]
  if (!bars) return null
  const a = bars.find(b => b[0] >= minuteOf('09:20')), b = bars.find(x => x[0] >= minuteOf('15:15'))
  return a && b ? b[1] / a[1] - 1 : null
}
interface Day { date: number; prev: number; gap: number; day: number; late: number | null; cues: Record<string, number> }
const SERIES = { us: load('sp500'), nasdaq: load('nasdaq'), vix: load('vix'), brent: load('brent'), wti: load('wti'), gold: load('gold') }
const days: Day[] = []
for (let i = 1; i < niftyRows.length; i++) {
  const r = niftyRows[i], p = niftyRows[i - 1]
  if (r.date < START) continue
  days.push({
    date: r.date, prev: p.date, gap: r.open / p.close - 1, day: r.close / r.open - 1, late: session0920(r.date),
    cues: Object.fromEntries(Object.entries(SERIES).map(([k, s]) => [k, cue(s, p.date, r.date)])),
  })
}

const stat = (xs: number[]) => { const m = meanAndT(xs); return { n: xs.length, meanPct: pct(m.mean), t: round2(m.t) } }
function buckets(label: string, value: (d: Day) => number, cuts: Array<{ name: string; test: (v: number) => boolean }>) {
  return {
    label,
    rows: cuts.map(c => {
      const list = days.filter(d => { const v = value(d); return Number.isFinite(v) && c.test(v) })
      const late = list.filter(d => d.late != null)
      return {
        bucket: c.name, gap: stat(list.map(d => d.gap)), openToClose: stat(list.map(d => d.day)), from0920: stat(late.map(d => d.late!)),
        recent: stat(late.filter(d => d.date >= 20220101).map(d => d.late!)),
      }
    }),
  }
}
const FIVE = (lo: number, hi: number) => [
  { name: `down ${hi}% or more`, test: (v: number) => v <= -hi / 100 },
  { name: `down ${lo}% to ${hi}%`, test: (v: number) => v > -hi / 100 && v <= -lo / 100 },
  { name: `within ${lo}%`, test: (v: number) => Math.abs(v) < lo / 100 },
  { name: `up ${lo}% to ${hi}%`, test: (v: number) => v >= lo / 100 && v < hi / 100 },
  { name: `up ${hi}% or more`, test: (v: number) => v >= hi / 100 },
]

// How much of the US move the opening gap already holds
const paired = days.filter(d => Number.isFinite(d.cues.us))
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const mu = mean(paired.map(d => d.cues.us)), mg = mean(paired.map(d => d.gap)), md = mean(paired.map(d => d.day))
const varU = mean(paired.map(d => (d.cues.us - mu) ** 2))
const beta = mean(paired.map(d => (d.cues.us - mu) * (d.gap - mg))) / varU
const corr = (ys: number[], my: number) => mean(paired.map((d, i) => (d.cues.us - mu) * (ys[i] - my))) / Math.sqrt(varU * mean(ys.map(y => (y - my) ** 2)))
const surprise = (d: Day) => d.gap - (mg + beta * (d.cues.us - mu))

const nifty = {
  overnightVsDay: Object.fromEntries([['2011-2019', 20110101, 20191231], ['2020-2022', 20200101, 20221231], ['2023-now', 20230101, 99999999]].map(([k, a, b]) => {
    const list = days.filter(d => d.date >= (a as number) && d.date <= (b as number))
    return [k, { overnight: stat(list.map(d => d.gap)), openToClose: stat(list.map(d => d.day)) }]
  })),
  usToGap: { gapPerUsPercent: round2(beta), correlationWithGap: round2(corr(paired.map(d => d.gap), mg)), correlationWithOpenToClose: round2(corr(paired.map(d => d.day), md)) },
  tables: [
    buckets('S&P 500 overnight', d => d.cues.us, FIVE(0.5, 1.5)),
    buckets('Nasdaq overnight', d => d.cues.nasdaq, FIVE(0.75, 2)),
    buckets('NIFTY opening gap', d => d.gap, FIVE(0.3, 0.75)),
    buckets('Gap against what the US move implies', surprise, FIVE(0.25, 0.6)),
    buckets('Brent crude overnight', d => d.cues.brent, FIVE(1, 3)),
    buckets('VIX overnight', d => d.cues.vix, [
      { name: 'down 8% or more', test: v => v <= -0.08 }, { name: 'between', test: v => v > -0.08 && v < 0.12 }, { name: 'up 12% or more', test: v => v >= 0.12 },
    ]),
  ],
}

// ---- Stocks: ADRs, and stocks tied to crude ----
const market = loadMarketCached()
function stockDays(symbol: string) {
  const s = market.stocks.get(symbol)
  if (!s) return []
  const out: Array<{ date: number; prev: number; gap: number; day: number; prevRet: number }> = []
  for (let i = 2; i < s.dates.length; i++) {
    if (s.dates[i] < START || !(s.open[i] > 0)) continue
    out.push({ date: s.dates[i], prev: s.dates[i - 1], gap: s.open[i] / s.close[i - 1] - 1, day: s.close[i] / s.open[i] - 1, prevRet: s.close[i - 1] / s.close[i - 2] - 1 })
  }
  return out
}
const adrs = ['INFY', 'HDFCBANK', 'ICICIBANK', 'WIPRO', 'DRREDDY'].map(symbol => {
  const series = load(`adr-${symbol}`)
  // The ADR's first session in the window also covers the Indian session before it, so take that day's local move off
  const rows = stockDays(symbol).map(d => ({ ...d, lead: cue(series, d.prev, d.date) - d.prevRet })).filter(d => Number.isFinite(d.lead))
  const pick = (test: (v: number) => boolean) => rows.filter(d => test(d.lead))
  const row = (list: typeof rows) => ({ gap: stat(list.map(d => d.gap)), openToClose: stat(list.map(d => d.day)) })
  return { symbol, adrUp2: row(pick(v => v >= 0.02)), adrUp1to2: row(pick(v => v >= 0.01 && v < 0.02)), adrDown1to2: row(pick(v => v <= -0.01 && v > -0.02)), adrDown2: row(pick(v => v <= -0.02)) }
})
const crude = ['BPCL', 'HINDPETRO', 'IOC', 'ONGC', 'OIL', 'INDIGO', 'ASIANPAINT'].map(symbol => {
  const rows = stockDays(symbol).map(d => ({ ...d, oil: cue(SERIES.brent, d.prev, d.date) })).filter(d => Number.isFinite(d.oil))
  const row = (list: typeof rows) => ({ gap: stat(list.map(d => d.gap)), openToClose: stat(list.map(d => d.day)) })
  return { symbol, crudeUp3: row(rows.filter(d => d.oil >= 0.03)), crudeDown3: row(rows.filter(d => d.oil <= -0.03)) }
})

// How much of an ADR's extra move shows in the local opening gap, for the pre-market panel
const adrSlopes = Object.fromEntries(['INFY', 'HDFCBANK', 'ICICIBANK', 'WIPRO', 'DRREDDY'].map(symbol => {
  const series = load(`adr-${symbol}`)
  const rows = stockDays(symbol).map(d => ({ gap: d.gap, lead: cue(series, d.prev, d.date) - d.prevRet })).filter(d => Number.isFinite(d.lead))
  const ml = mean(rows.map(r => r.lead)), mgap = mean(rows.map(r => r.gap))
  return [symbol, round2(mean(rows.map(r => (r.lead - ml) * (r.gap - mgap))) / mean(rows.map(r => (r.lead - ml) ** 2)))]
}))

// Days for the minute-price test of the crude rule (scripts/research/crude-daytrade.ts): every session after Brent
// moved 3% or more, and every eighth other session for comparison. Zerodha has minute prices from 2015.
const CRUDE_STOCKS = ['BPCL', 'HINDPETRO', 'IOC', 'ONGC', 'OIL', 'INDIGO', 'ASIANPAINT']
const crudeTrades: Array<{ signal: string; symbol: string; date: number; oil: number }> = []
for (const symbol of CRUDE_STOCKS) {
  stockDays(symbol).forEach((d, i) => {
    if (d.date < 20150201) return
    const oil = cue(SERIES.brent, d.prev, d.date)
    if (!Number.isFinite(oil)) return
    if (Math.abs(oil) >= 0.03) crudeTrades.push({ signal: oil > 0 ? 'crude-up' : 'crude-down', symbol, date: d.date, oil })
    else if (i % 8 === 0) crudeTrades.push({ signal: 'control', symbol, date: d.date, oil })
  })
}
mkdirSync('data/global', { recursive: true })
writeFileSync('data/global/crude-trades.json', JSON.stringify(crudeTrades))

mkdirSync('research/results', { recursive: true })
writeFileSync('research/results/global-cues.json', JSON.stringify({
  generatedAt: new Date().toISOString(), from: START, to: days[days.length - 1].date,
  note: 'Before costs. A round trip in NIFTY futures costs about 0.05%; an intraday trade in a stock about 0.2% to 0.3%. The cue is the foreign move after the previous Indian close and before this open.',
  nifty, adrs, adrGapPerPercentOfLead: adrSlopes, crude,
}, null, 1))

const cell = (s: { n: number; meanPct: number; t: number }) => `${s.meanPct >= 0 ? '+' : ''}${s.meanPct.toFixed(2)} (${s.t.toFixed(1)})`.padStart(14)
console.log('NIFTY overnight (close to open) against the session (open to close), mean % (t):')
for (const [k, v] of Object.entries(nifty.overnightVsDay) as any) console.log(`  ${k}: overnight ${cell(v.overnight)}  session ${cell(v.openToClose)}  (${v.overnight.n} days)`)
console.log(`\nA 1% move in the S&P 500 goes with a ${nifty.usToGap.gapPerUsPercent}% NIFTY gap. Correlation with the gap ${nifty.usToGap.correlationWithGap}, with the session after the open ${nifty.usToGap.correlationWithOpenToClose}.`)
for (const t of nifty.tables) {
  console.log(`\n${t.label.padEnd(40)}${'days'.padStart(6)}${'gap'.padStart(14)}${'open to close'.padStart(15)}${'09:20 to 15:15'.padStart(16)}${'same, 2022 on'.padStart(15)}`)
  for (const r of t.rows) console.log(`  ${r.bucket.padEnd(38)}${String(r.gap.n).padStart(6)}${cell(r.gap)} ${cell(r.openToClose)}  ${cell(r.from0920)} ${cell(r.recent)}`)
}
console.log('\nStocks with US-listed shares: the ADR move India had not seen, then the local gap and the session (open to close)')
for (const a of adrs) for (const [k, label] of [['adrUp2', 'ADR up 2%+'], ['adrUp1to2', 'up 1 to 2%'], ['adrDown1to2', 'down 1 to 2%'], ['adrDown2', 'down 2%+']] as const) {
  const r = (a as any)[k]; console.log(`  ${a.symbol.padEnd(10)} ${label.padEnd(13)} ${String(r.gap.n).padStart(5)} days  gap ${cell(r.gap)}  session ${cell(r.openToClose)}`)
}
console.log('\nBrent up or down 3% overnight: the local gap and the session')
for (const c of crude) console.log(`  ${c.symbol.padEnd(10)} crude up: ${String(c.crudeUp3.gap.n).padStart(4)} days gap ${cell(c.crudeUp3.gap)} session ${cell(c.crudeUp3.openToClose)}   crude down: ${String(c.crudeDown3.gap.n).padStart(4)} days gap ${cell(c.crudeDown3.gap)} session ${cell(c.crudeDown3.openToClose)}`)
console.log(`\nADR lead to local gap, per 1%: ${JSON.stringify(adrSlopes)}. ${crudeTrades.length} stock-days written for the crude minute test.`)
