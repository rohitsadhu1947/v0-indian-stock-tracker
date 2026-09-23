/**
 * Does the scanner's entry signal (clean uptrend + momentum + score filter)
 * predict anything, independent of how targets/stops are set?
 *
 * For every symbol/day where scanForMomentumSignals would have fired,
 * compute the forward return N days later (ignoring stops/targets), and
 * compare it against the forward return from a RANDOM day in the same
 * symbol over the same window. If the signal has edge, its forward returns
 * should beat the random baseline; if not, the entry filter is picking
 * days that are statistically no different from any other day.
 *
 * Uses the same cached bars as run-backtest.ts — run that first.
 */
import { readFileSync, readdirSync } from 'fs'
import { scanForMomentumSignals } from '../lib/momentum-scanner'
import type { Bar } from '../lib/backtest/walk-forward'

const CACHE_DIR = '.cache/bars'
const HORIZONS = [5, 10, 20]
const WARMUP = 60

function loadCachedBars(): Record<string, Bar[]> {
  const out: Record<string, Bar[]> = {}
  for (const file of readdirSync(CACHE_DIR)) {
    const symbol = file.split('_')[0]
    const bars = JSON.parse(readFileSync(`${CACHE_DIR}/${file}`, 'utf8')).map((b: any) => ({ ...b, date: new Date(b.date) }))
    if (!out[symbol] || bars.length > out[symbol].length) out[symbol] = bars
  }
  return out
}

function averageVolume(bars: Bar[], period = 20): number {
  const slice = bars.slice(-period)
  return slice.length ? slice.reduce((s, b) => s + b.volume, 0) / slice.length : 0
}

function forwardReturn(bars: Bar[], fromIdx: number, days: number): number | null {
  const to = fromIdx + days
  if (to >= bars.length) return null
  return ((bars[to].close - bars[fromIdx].close) / bars[fromIdx].close) * 100
}

function mean(xs: number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN }
function stddev(xs: number[]): number {
  if (xs.length < 2) return NaN
  const m = mean(xs)
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1))
}
// Welch's t-test, two-sided, approximate p-value via normal fallback for large n
function tTest(a: number[], b: number[]): { t: number; approxP: string } {
  const ma = mean(a), mb = mean(b), sa = stddev(a), sb = stddev(b)
  const se = Math.sqrt((sa * sa) / a.length + (sb * sb) / b.length)
  const t = (ma - mb) / se
  const approxP = Math.abs(t) > 2.58 ? '<0.01' : Math.abs(t) > 1.96 ? '<0.05' : Math.abs(t) > 1.64 ? '<0.10' : 'n.s.'
  return { t, approxP }
}

async function main() {
  const barsBySymbol = loadCachedBars()
  const symbols = Object.keys(barsBySymbol)
  console.log(`Loaded ${symbols.length} symbols from cache\n`)

  const signalReturns: Record<number, number[]> = { 5: [], 10: [], 20: [] }
  const randomReturns: Record<number, number[]> = { 5: [], 10: [], 20: [] }
  let signalDays = 0

  for (const symbol of symbols) {
    const bars = barsBySymbol[symbol]
    if (bars.length < WARMUP + 25) continue

    // Random baseline: sample every 7th day so it's independent of signal days
    for (let i = WARMUP; i < bars.length - 25; i += 7) {
      for (const h of HORIZONS) {
        const r = forwardReturn(bars, i, h)
        if (r !== null) randomReturns[h].push(r)
      }
    }

    for (let i = WARMUP; i < bars.length - 25; i++) {
      const history = bars.slice(i - WARMUP, i + 1)
      const today = history[history.length - 1]
      const prev = history[history.length - 2]

      const scan = await scanForMomentumSignals(
        [{
          symbol, exchange: 'NSE', instrumentToken: '0',
          current: today.close, change: today.close - prev.close,
          changePercent: ((today.close - prev.close) / prev.close) * 100,
          volume: today.volume, avgVolume: averageVolume(history.slice(0, -1)),
          candles: history,
        }],
        300000,
        { profile: 'swing', maxPositions: 1, minVolume: 0 }
      )

      const fired = scan.signals.find(s => s.symbol === symbol && s.signal !== 'SKIP')
      if (!fired) continue

      signalDays++
      for (const h of HORIZONS) {
        const r = forwardReturn(bars, i, h)
        if (r !== null) signalReturns[h].push(r)
      }
    }
  }

  console.log(`Signal fired on ${signalDays} symbol-days\n`)
  console.log('Horizon   Signal avg fwd return   Random-day avg fwd return   Edge      t-stat   p')
  for (const h of HORIZONS) {
    const s = signalReturns[h], r = randomReturns[h]
    const { t, approxP } = tTest(s, r)
    console.log(
      `${String(h).padStart(3)}d       ${mean(s).toFixed(2).padStart(6)}% (n=${s.length})       ` +
      `${mean(r).toFixed(2).padStart(6)}% (n=${r.length})        ` +
      `${(mean(s) - mean(r) >= 0 ? '+' : '')}${(mean(s) - mean(r)).toFixed(2)}%    ${t.toFixed(2).padStart(6)}   ${approxP}`
    )
  }
}

main().catch(err => { console.error(err.message || err); process.exit(1) })
