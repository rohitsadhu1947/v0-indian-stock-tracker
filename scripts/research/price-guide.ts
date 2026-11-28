/**
 * The price guide: how past signals of each rule turned out, as a spread.
 *
 *   npm run research:price-guide
 *
 * For every past signal it takes the gain from the buy price to the exit, and
 * writes the bad case (the worst quarter of trades ended below this), the
 * typical case (the middle trade) and the good case (the best quarter ended
 * above this). The page turns these into rupee prices beside each buy.
 *
 * These describe the past. They are not targets to sell at: every sell
 * target tested cut the return (research/results/stops-targets.json).
 */
import { mkdirSync, writeFileSync } from 'fs'
import { DatabaseSync } from 'node:sqlite'
import { lastAtOrBefore } from '@/lib/research/dates'
import { loadMarketCached } from '@/lib/research/load'
import { indicators } from '@/lib/research/swing'
import { simulate, type Strategy } from '@/lib/research/simulate'
import { factorPortfolio } from '@/lib/research/strategies'
import { parseCorporateAction } from '@/lib/market-data/corporate-actions'
import { MODES, PORTFOLIO_RULES, type RiskMode } from '@/lib/portfolio/config'
import { SECTOR_BY_SYMBOL } from '@/lib/portfolio/sectors'

const START = 20110131
const round1 = (x: number) => Math.round(x * 10) / 10
const market = loadMarketCached()
const END = market.sessions[market.sessions.length - 1]
const sessionIndex = new Map<number, number>()
market.sessions.forEach((d, i) => sessionIndex.set(d, i))
const rankOf = new Map<number, Map<string, number>>()
for (const d of market.universeDates) rankOf.set(d, new Map(market.universe.get(d)!.map((s, i) => [s, i + 1])))
const rank = (symbol: string, date: number): number => {
  const i = lastAtOrBefore(market.universeDates, date)
  return i < 0 ? Infinity : rankOf.get(market.universeDates[i])!.get(symbol) ?? Infinity
}

interface Spread { trades: number; badPct: number; typicalPct: number; goodPct: number; wonPct: number; avgPct: number; typicalLowPct?: number }
function spread(returns: number[], lows?: number[]): Spread {
  const sorted = [...returns].sort((a, b) => a - b)
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
  const out: Spread = {
    trades: sorted.length, badPct: round1(at(0.25) * 100), typicalPct: round1(at(0.5) * 100), goodPct: round1(at(0.75) * 100),
    wonPct: round1(sorted.filter(x => x > 0).length / sorted.length * 100), avgPct: round1(sorted.reduce((a, b) => a + b, 0) / sorted.length * 100),
  }
  if (lows) { const l = [...lows].sort((a, b) => a - b); out.typicalLowPct = round1(l[l.length >> 1] * 100) }
  return out
}
/** Gain from the close of index `e` to the close of index `x`, and the lowest close on the way. Null when the stock missed sessions. */
function outcome(s: { dates: Int32Array; close: Float64Array }, e: number, x: number): { ret: number; low: number } | null {
  if (e < 1 || x >= s.dates.length || x <= e || !(s.close[e] > 0)) return null
  if (sessionIndex.get(s.dates[x])! - sessionIndex.get(s.dates[e])! !== x - e) return null
  let low = 0
  for (let j = e + 1; j <= x; j++) low = Math.min(low, s.close[j] / s.close[e] - 1)
  return { ret: s.close[x] / s.close[e] - 1, low }
}
const show = (label: string, s: Spread) => console.log(`${label.padEnd(46)}${String(s.trades).padStart(6)}  bad ${String(s.badPct).padStart(6)}%  typical ${String(s.typicalPct).padStart(6)}%  good ${String(s.goodPct).padStart(6)}%  won ${s.wonPct}%  avg ${s.avgPct}%${s.typicalLowPct == null ? '' : `  typical low on the way ${s.typicalLowPct}%`}`)
const out: Record<string, unknown> = {
  note: 'Gain from the buy price to the exit, before costs. Bad: a quarter of past trades ended below this. Typical: the middle trade. Good: a quarter ended above this. Typical low: the middle trade fell this far at some close on the way.',
  from: START, to: END,
}

// ---- Results buys: the live rule, bought at the next close, held 60 sessions ----
{
  const prepared = [...market.stocks.values()].map(s => ({ s, ind: indicators(s) }))
  const momentumBy = new Map<number, number[]>()
  for (const { s, ind } of prepared) for (let i = 253; i < s.dates.length; i++) if (s.dates[i] >= START && !Number.isNaN(ind.momentum[i]) && rank(s.symbol, s.dates[i]) <= 750) momentumBy.set(s.dates[i], [...(momentumBy.get(s.dates[i]) ?? []), ind.momentum[i]])
  const all: number[] = [], lows: number[] = []
  const byStrength: Record<string, number[]> = { 'top fifth': [], 'second fifth': [], 'middle fifth': [], 'fourth fifth': [] }
  for (const { s, ind } of prepared) {
    let pointer = 0, busy = -1
    for (let i = 253; i + 61 < s.dates.length; i++) {
      if (s.dates[i] < START) continue
      while (pointer < s.resultsDates.length && s.resultsDates[pointer] < s.dates[i - 1]) pointer++
      if (!(pointer < s.resultsDates.length && s.resultsDates[pointer] <= s.dates[i])) continue
      if (!(s.close[i] / s.close[i - 2] - 1 >= 0.08) || !(s.turnover[i] / ind.avgTurnover20[i] >= 3) || i + 1 <= busy) continue
      const sorted = momentumBy.get(s.dates[i])
      if (rank(s.symbol, s.dates[i]) > 750 || !sorted || Number.isNaN(ind.momentum[i])) continue
      const strength = sorted.filter(x => x < ind.momentum[i]).length / Math.max(1, sorted.length - 1)
      if (strength < 0.2) continue
      const o = outcome(s, i + 1, i + 60)
      if (!o) continue
      busy = i + 60
      all.push(o.ret); lows.push(o.low)
      byStrength[strength >= 0.8 ? 'top fifth' : strength >= 0.6 ? 'second fifth' : strength >= 0.4 ? 'middle fifth' : 'fourth fifth'].push(o.ret)
    }
  }
  const results = { all: spread(all, lows), byStrength: Object.fromEntries(Object.entries(byStrength).map(([k, v]) => [k, spread(v)])) }
  out.resultsBuy = { note: 'Bought at the close of the session after the signal, sold at the close of session 60.', ...results }
  console.log('Results buys, 60 sessions')
  show('  all', results.all)
  for (const [k, v] of Object.entries(results.byStrength)) show(`  12-month strength: ${k}`, v)
}

// ---- Monthly Plan picks: bought the session after a month end ----
{
  const plan: Record<string, unknown> = {}
  console.log('\nMonthly Plan picks, from the close of the session after the month end')
  for (const mode of Object.keys(MODES) as RiskMode[]) {
    const base = factorPortfolio({ factors: MODES[mode].factors, exitRank: PORTFOLIO_RULES.exitRank, maxPerSector: PORTFOLIO_RULES.maxPerSector, sectorOf: s => SECTOR_BY_SYMBOL[s] })
    const held: Array<{ date: number; symbols: string[]; fresh: string[] }> = []
    const recording: Strategy = { name: base.name, targets(ctx) { const t = base.targets(ctx); held.push({ date: ctx.date, symbols: Object.keys(t), fresh: Object.keys(t).filter(s => !ctx.holdings.has(s)) }); return t } }
    simulate(market, recording, { start: START, end: END })
    const horizons: Array<[string, number]> = [['oneMonth', 21], ['threeMonths', 63], ['sixMonths', 126], ['twelveMonths', 252]]
    const modeOut: Record<string, Spread> = {}
    for (const [key, sessions] of horizons) {
      const rets: number[] = [], lows: number[] = []
      // Only stocks newly bought that month, so one long holding is not counted every month
      for (const h of held) for (const symbol of h.fresh) {
        const s = market.stocks.get(symbol)
        const i = s ? lastAtOrBefore(s.dates, h.date) : -1
        const o = s && i >= 0 ? outcome(s, i + 1, i + 1 + sessions) : null
        if (o) { rets.push(o.ret); lows.push(o.low) }
      }
      modeOut[key] = spread(rets, lows)
      show(`  ${mode}: ${key}`, modeOut[key])
    }
    plan[mode] = modeOut
  }
  out.monthlyPlan = { note: 'New picks only. The plan keeps a stock until it falls below the exit rank at a month end, so these fixed periods are a guide, not the rule\'s own exit.', ...plan }
}

// ---- Split buys and dividend buys: bought at the close after the listing, sold at the last close before the ex-date ----
{
  const store = new DatabaseSync('data/market.db', { readOnly: true })
  const rawClose = store.prepare('select close from raw_bars where symbol = ? and date = ?')
  const splits = new Map<string, number>(), dividends = new Map<string, { firstSeen: number; amount: number }>()
  for (const a of store.prepare('select symbol, ex_date, purpose, first_seen from corporate_actions_raw where ex_date >= ?').all(START) as Array<{ symbol: string; ex_date: number; purpose: string; first_seen: number }>) {
    const parsed = parseCorporateAction(a.purpose), key = `${a.symbol}|${a.ex_date}`
    if (parsed.split && parsed.split.to < parsed.split.from) splits.set(key, Math.min(a.first_seen, splits.get(key) ?? Infinity))
    else if (parsed.dividend?.amount && !parsed.split && !parsed.bonus && !parsed.rights && !parsed.restructure) {
      const old = dividends.get(key)
      dividends.set(key, { firstSeen: Math.min(a.first_seen, old?.firstSeen ?? Infinity), amount: (old?.amount ?? 0) + parsed.dividend.amount })
    }
  }
  const runUp = (key: string, firstSeen: number, minYield?: { amount: number }): number | null => {
    const [symbol, ex] = key.split('|'), s = market.stocks.get(symbol)
    if (!s) return null
    const x = lastAtOrBefore(s.dates, Number(ex) - 1), seenAt = lastAtOrBefore(s.dates, firstSeen)
    if (x < 30 || seenAt < 0 || x - seenAt < 3 || rank(symbol, s.dates[seenAt]) > 750) return null
    if (minYield) { const raw = (rawClose.get(symbol, s.dates[seenAt]) as { close: number } | undefined)?.close; if (!raw || minYield.amount / raw < 0.02) return null }
    return outcome(s, seenAt + 1, x)?.ret ?? null
  }
  const splitReturns = [...splits].map(([k, seen]) => runUp(k, seen)).filter((x): x is number => x != null)
  const dividendReturns = [...dividends].map(([k, d]) => runUp(k, d.firstSeen, { amount: d.amount })).filter((x): x is number => x != null)
  out.splitBuy = { note: 'Bought at the close after the split date is listed, sold at the last close before the split.', all: spread(splitReturns) }
  out.dividendBuy = { note: 'Dividends of 2% or more with 3 sessions of notice or more. Bought at the close after the listing, sold at the last close before the dividend date.', all: spread(dividendReturns) }
  console.log('\nSplit buys and dividend buys, to the last close before the date')
  show('  split buys', (out.splitBuy as any).all)
  show('  dividend buys', (out.dividendBuy as any).all)
}

mkdirSync('research/results', { recursive: true })
writeFileSync('research/results/price-guide.json', JSON.stringify(out, null, 2))
console.log('\nSaved research/results/price-guide.json')
