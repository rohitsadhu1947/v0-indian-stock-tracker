/**
 * Test swing-trade entry rules on the local store and write the results.
 *
 *   npm run research:swing
 *
 * Each rule is checked at every close for every stock in the 500 most traded
 * (as the list stood that month). A trade buys at the next open and sells at
 * a target, a stop, or after a few sessions. Results are after slippage and
 * charges, before tax.
 *
 * The comparison is with buying every stock in the universe on the same
 * morning with the same exits, so a rule gets no credit for a rising market
 * or for the exit rule itself.
 */
import { mkdirSync, writeFileSync } from 'fs'
import { loadMarketCached } from '@/lib/research/load'
import { lastAtOrBefore } from '@/lib/research/dates'
import { indicators, meanAndT, SWING_SIGNALS, tradeOutcome, type ExitRule, type SignalContext } from '@/lib/research/swing'

const START = 20110101
const UNIVERSE = 500

const EXITS: Array<ExitRule & { entry: 'open' | 'vwap' }> = [
  { key: 'target3-stop3-7d', targetPct: 3, stopPct: 3, maxSessions: 7, entry: 'open' },
  { key: 'target3-stop2-7d', targetPct: 3, stopPct: 2, maxSessions: 7, entry: 'open' },
  { key: 'target2-stop2-5d', targetPct: 2, stopPct: 2, maxSessions: 5, entry: 'open' },
  // Wider than asked for, to see whether letting a winner run changes the answer
  { key: 'target6-stop3-7d', targetPct: 6, stopPct: 3, maxSessions: 7, entry: 'open' },
  { key: 'hold-5d', targetPct: null, stopPct: null, maxSessions: 5, entry: 'open' },
  { key: 'hold-5d-stop8', targetPct: null, stopPct: 8, maxSessions: 5, entry: 'open' },
  { key: 'hold-5d-vwap', targetPct: null, stopPct: null, maxSessions: 5, entry: 'vwap' },
  // The same main rule bought at the day's average price instead of the open
  { key: 'target3-stop3-7d-vwap', targetPct: 3, stopPct: 3, maxSessions: 7, entry: 'vwap' },
]

const PERIODS = [
  { key: '2011-2019', from: 20110101, to: 20191231 },
  { key: '2020-2022', from: 20200101, to: 20221231 },
  { key: '2023-now', from: 20230101, to: 99999999 },
]

interface TradeRow { date: number; ret: number; excess: number; marketUp: boolean; reason: string; sessions: number }

const market = loadMarketCached()
const sessionIndex = new Map<number, number>()
market.sessions.forEach((d, i) => sessionIndex.set(d, i))
const members = new Map<number, Set<string>>()
for (const d of market.universeDates) members.set(d, new Set(market.universe.get(d)!.slice(0, UNIVERSE)))
const memberOn = (symbol: string, date: number): boolean => {
  const i = lastAtOrBefore(market.universeDates, date)
  return i >= 0 && members.get(market.universeDates[i])!.has(symbol)
}

// Market trend: NIFTY 200 above its 50-day average at the signal's close
const nifty = market.indices.get('IDX:NIFTY 200')!
const marketUp = new Map<number, boolean>()
for (let i = 49, sum = 0; i < nifty.close.length; i++) {
  sum = 0
  for (let j = i - 49; j <= i; j++) sum += nifty.close[j]
  marketUp.set(nifty.dates[i], nifty.close[i] > sum / 50)
}

// Pass 1: indicators, and the day's spread of 5-session returns across the universe
const prepared: Array<{ symbol: string; ind: ReturnType<typeof indicators>; member: Uint8Array }> = []
const ret5ByDate = new Map<number, number[]>()
for (const s of market.stocks.values()) {
  const ind = indicators(s)
  const member = new Uint8Array(s.dates.length)
  for (let i = 252; i < s.dates.length; i++) {
    if (s.dates[i] < START || !memberOn(s.symbol, s.dates[i])) continue
    member[i] = 1
    if (!Number.isNaN(ind.ret5[i])) {
      const list = ret5ByDate.get(s.dates[i]) ?? []
      list.push(ind.ret5[i])
      ret5ByDate.set(s.dates[i], list)
    }
  }
  prepared.push({ symbol: s.symbol, ind, member })
}
const ret5Cut = new Map<number, { low: number; high: number }>()
for (const [date, list] of ret5ByDate) {
  list.sort((a, b) => a - b)
  ret5Cut.set(date, { low: list[Math.floor(list.length * 0.05)], high: list[Math.ceil(list.length * 0.95) - 1] })
}

// Pass 2: every possible entry (the baseline) and the entries each rule picks
const baseline = EXITS.map(() => new Map<number, { sum: number; count: number }>())
const trades: TradeRow[][][] = SWING_SIGNALS.map(() => EXITS.map(() => []))
const pending: Array<{ signal: number; exit: number; row: TradeRow }> = []

for (const { symbol, ind, member } of prepared) {
  const s = market.stocks.get(symbol)!
  const busyUntil = SWING_SIGNALS.map(() => EXITS.map(() => -1))
  let resultsPointer = 0
  for (let i = 252; i < s.dates.length - 1; i++) {
    if (!member[i]) continue
    // Buy only if the stock trades on the very next session
    if (sessionIndex.get(s.dates[i + 1]) !== sessionIndex.get(s.dates[i])! + 1) continue
    const cut = ret5Cut.get(s.dates[i])
    if (!cut) continue
    while (resultsPointer < s.resultsDates.length && s.resultsDates[resultsPointer] < s.dates[i - 1]) resultsPointer++
    const context: SignalContext = {
      s, ind, i, ret5Low: cut.low, ret5High: cut.high,
      resultsJustOut: resultsPointer < s.resultsDates.length && s.resultsDates[resultsPointer] <= s.dates[i],
    }
    const fired = SWING_SIGNALS.map(signal => signal.fires(context))
    const entryDate = s.dates[i + 1]
    EXITS.forEach((exit, e) => {
      const outcome = tradeOutcome(s, i + 1, exit, undefined, exit.entry === 'vwap' ? s.fill[i + 1] : undefined)
      if (!outcome) return
      const day = baseline[e].get(entryDate) ?? { sum: 0, count: 0 }
      day.sum += outcome.ret
      day.count++
      baseline[e].set(entryDate, day)
      fired.forEach((on, g) => {
        // One open trade per stock per rule
        if (!on || i + 1 <= busyUntil[g][e]) return
        busyUntil[g][e] = outcome.exitIndex
        pending.push({
          signal: g, exit: e,
          row: { date: entryDate, ret: outcome.ret, excess: 0, marketUp: marketUp.get(s.dates[i]) ?? false, reason: outcome.reason, sessions: outcome.exitIndex - i },
        })
      })
    })
  }
}
for (const p of pending) {
  const day = baseline[p.exit].get(p.row.date)!
  p.row.excess = p.row.ret - day.sum / day.count
  trades[p.signal][p.exit].push(p.row)
}

const pctOf = (x: number) => Math.round(x * 10000) / 100
function summarise(rows: TradeRow[]) {
  if (!rows.length) return null
  // Trades entered on one morning move together, so the test is on daily averages
  const byDay = new Map<number, number[]>()
  for (const r of rows) byDay.set(r.date, [...(byDay.get(r.date) ?? []), r.excess])
  const daily = [...byDay.values()].map(xs => xs.reduce((a, b) => a + b, 0) / xs.length)
  const edge = meanAndT(daily)
  return {
    trades: rows.length,
    days: byDay.size,
    winRatePct: pctOf(rows.filter(r => r.ret > 0).length / rows.length),
    avgReturnPct: pctOf(rows.reduce((a, r) => a + r.ret, 0) / rows.length),
    avgExcessPct: pctOf(rows.reduce((a, r) => a + r.excess, 0) / rows.length),
    dailyExcessPct: pctOf(edge.mean),
    tStat: Math.round(edge.t * 100) / 100,
  }
}

const years = (market.sessions.filter(d => d >= START).length) / 250
const results = SWING_SIGNALS.map((signal, g) => ({
  key: signal.key, label: signal.label, basis: signal.basis, round: signal.round ?? 1,
  exits: Object.fromEntries(EXITS.map((exit, e) => {
    const rows = trades[g][e]
    return [exit.key, {
      ...summarise(rows),
      tradesPerMonth: Math.round(rows.length / years / 12 * 10) / 10,
      avgSessions: rows.length ? Math.round(rows.reduce((a, r) => a + r.sessions, 0) / rows.length * 10) / 10 : 0,
      exitsPct: Object.fromEntries(['target', 'stop', 'time'].map(reason => [reason, rows.length ? pctOf(rows.filter(r => r.reason === reason).length / rows.length) : 0])),
      periods: Object.fromEntries(PERIODS.map(p => [p.key, summarise(rows.filter(r => r.date >= p.from && r.date <= p.to))])),
      marketUp: summarise(rows.filter(r => r.marketUp)),
      marketDown: summarise(rows.filter(r => !r.marketUp)),
    }]
  })),
}))

const baselineSummary = Object.fromEntries(EXITS.map((exit, e) => {
  const days = [...baseline[e].values()].map(d => d.sum / d.count)
  return [exit.key, { avgReturnPct: pctOf(days.reduce((a, b) => a + b, 0) / days.length), days: days.length }]
}))

mkdirSync('research/results', { recursive: true })
writeFileSync('research/results/swing.json', JSON.stringify({
  generatedFrom: { start: START, end: market.sessions[market.sessions.length - 1], universe: UNIVERSE },
  note: 'Returns are per trade, after slippage and charges, before tax. Excess is against buying every stock in the universe on the same morning with the same exits.',
  exits: EXITS, baseline: baselineSummary, signals: results,
}, null, 1))

const pad = (v: unknown, n: number) => String(v ?? '').padStart(n)
for (const exit of EXITS) {
  console.log(`\n${exit.key}   (every stock, every day: ${baselineSummary[exit.key].avgReturnPct}% a trade)`)
  console.log(`${'rule'.padEnd(20)}${pad('trades', 8)}${pad('/month', 8)}${pad('win%', 7)}${pad('avg%', 7)}${pad('excess%', 9)}${pad('t', 7)}   2011-19 / 2020-22 / 2023+ excess%   up / down market avg%`)
  for (const r of results) {
    const x = r.exits[exit.key] as any
    if (!x.trades) { console.log(r.key.padEnd(20) + '   no trades'); continue }
    const periods = PERIODS.map(p => x.periods[p.key] ? `${x.periods[p.key].dailyExcessPct} (t ${x.periods[p.key].tStat})` : 'none').join(' / ')
    console.log(`${r.key.padEnd(20)}${pad(x.trades, 8)}${pad(x.tradesPerMonth, 8)}${pad(x.winRatePct, 7)}${pad(x.avgReturnPct, 7)}${pad(x.dailyExcessPct, 9)}${pad(x.tStat, 7)}   ${periods}   ${x.marketUp?.avgReturnPct ?? ''} / ${x.marketDown?.avgReturnPct ?? ''}`)
  }
}
