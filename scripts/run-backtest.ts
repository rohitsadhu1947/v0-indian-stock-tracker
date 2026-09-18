/**
 * Run the walk-forward backtest on real Kite data.
 *
 *   npx tsx --env-file=.env.local scripts/run-backtest.ts [options]
 *
 * Options:
 *   --years=2            history to test (default 2)
 *   --profile=swing      swing | intraday | both (default both)
 *   --capital=300000
 *   --symbols=A,B,C      override the universe
 *   --limit=60           cap universe size (default 60)
 *   --minScore=0
 *   --json=path.json     write full results
 *
 * Bars are cached under .cache/bars so repeat runs do not re-hit Kite.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import postgres from 'postgres'
import { KiteConnect } from 'kiteconnect'
import { runWalkForwardBacktest, type Bar } from '../lib/backtest/walk-forward'
import { NIFTY_500_SYMBOLS } from '../lib/momentum-scanner'
import { TRADE_PROFILES, type TradeProfileId } from '../lib/trade-profiles'

const arg = (name: string, fallback?: string) =>
  process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback

const years = Number(arg('years', '2'))
const capital = Number(arg('capital', '300000'))
const minScore = Number(arg('minScore', '0'))
const limit = Number(arg('limit', '60'))
const profileArg = arg('profile', 'both')!
const jsonOut = arg('json')
const CACHE_DIR = '.cache/bars'

async function kiteClient() {
  const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require', max: 1 })
  const [admin] = await sql`
    select master_kite_token from users
    where role='admin' and master_kite_token is not null
    order by last_login desc limit 1`
  await sql.end()

  if (!admin?.master_kite_token) throw new Error('No Kite token in DB — log in with Kite first')
  const kc = new KiteConnect({ api_key: process.env.KITE_API_KEY! })
  kc.setAccessToken(admin.master_kite_token)
  await kc.getProfile() // fail fast if the token expired (Kite resets at 06:00 IST)
  return kc
}

async function loadBars(kc: any, symbols: string[], from: Date, to: Date) {
  mkdirSync(CACHE_DIR, { recursive: true })
  const instruments = await kc.getInstruments(['NSE'])
  const tokenFor = new Map<string, number>(
    instruments.filter((i: any) => i.instrument_type === 'EQ').map((i: any) => [i.tradingsymbol, i.instrument_token])
  )

  const barsBySymbol: Record<string, Bar[]> = {}
  let fetched = 0, cached = 0, missing = 0

  for (const symbol of symbols) {
    const cacheFile = `${CACHE_DIR}/${symbol}_${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.json`
    if (existsSync(cacheFile)) {
      barsBySymbol[symbol] = JSON.parse(readFileSync(cacheFile, 'utf8')).map((b: any) => ({ ...b, date: new Date(b.date) }))
      cached++
      continue
    }

    const token = tokenFor.get(symbol)
    if (!token) { missing++; continue }

    try {
      // Kite caps a daily-interval request at ~2000 days; chunk by year to be safe
      const all: Bar[] = []
      let chunkStart = new Date(from)
      while (chunkStart < to) {
        const chunkEnd = new Date(Math.min(+new Date(chunkStart).setFullYear(chunkStart.getFullYear() + 1), +to))
        const raw = await kc.getHistoricalData(token, 'day', chunkStart, chunkEnd)
        all.push(...raw.map((b: any) => ({
          date: new Date(b.date), open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
        })))
        chunkStart = new Date(+chunkEnd + 86400000)
        await new Promise(r => setTimeout(r, 350)) // Kite historical: 3 req/s
      }

      // De-duplicate overlapping chunk edges
      const seen = new Set<string>()
      barsBySymbol[symbol] = all.filter(b => {
        const k = b.date.toISOString().slice(0, 10)
        if (seen.has(k)) return false
        seen.add(k); return true
      })
      writeFileSync(cacheFile, JSON.stringify(barsBySymbol[symbol]))
      fetched++
      if (fetched % 10 === 0) process.stdout.write(`  fetched ${fetched}...\n`)
    } catch (err: any) {
      console.log(`  ${symbol}: ${err.message}`)
      missing++
    }
  }

  console.log(`Bars ready: ${Object.keys(barsBySymbol).length} symbols (${fetched} fetched, ${cached} cached, ${missing} missing)\n`)
  return barsBySymbol
}

function report(r: Awaited<ReturnType<typeof runWalkForwardBacktest>>) {
  const p = TRADE_PROFILES[r.profile as TradeProfileId]
  const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`

  console.log(`\n${'='.repeat(64)}`)
  console.log(`${p.label}  —  ${r.from.toISOString().slice(0, 10)} to ${r.to.toISOString().slice(0, 10)}`)
  console.log('='.repeat(64))
  console.log(`Return          ${pct(r.totalReturnPercent)}   (₹${Math.round(r.startingCapital).toLocaleString('en-IN')} → ₹${Math.round(r.endingCapital).toLocaleString('en-IN')})`)
  console.log(`Trades          ${r.totalTrades}  (${r.wins}W / ${r.losses}L)`)
  console.log(`Win rate        ${r.winRate.toFixed(1)}%`)
  console.log(`Avg win         ${pct(r.avgWinPercent)}     Avg loss ${pct(r.avgLossPercent)}`)
  console.log(`Expectancy      ${pct(r.expectancyPercent)} per trade`)
  console.log(`Profit factor   ${r.profitFactor === Infinity ? '∞' : r.profitFactor.toFixed(2)}`)
  console.log(`Max drawdown    -${r.maxDrawdownPercent.toFixed(1)}%`)
  console.log(`Avg hold        ${r.avgHoldingDays.toFixed(0)} days`)
  console.log(`Costs paid      ₹${Math.round(r.totalCosts).toLocaleString('en-IN')}  (${((r.totalCosts / r.startingCapital) * 100).toFixed(2)}% of capital)`)
  console.log(`Exits           ${Object.entries(r.exitBreakdown).map(([k, v]) => `${k}:${v}`).join('  ')}`)

  const winners = r.trades.filter(t => t.netPnl > 0).sort((a, b) => b.netPnlPercent - a.netPnlPercent)
  if (winners.length) {
    console.log(`Best trades     ${winners.slice(0, 3).map(t => `${t.symbol} ${pct(t.netPnlPercent)}`).join(', ')}`)
  }
}

async function main() {
  const to = new Date()
  const from = new Date(); from.setFullYear(from.getFullYear() - years)

  const symbols = (arg('symbols')?.split(',') ?? NIFTY_500_SYMBOLS).slice(0, limit)
  console.log(`Backtest: ${symbols.length} symbols, ${years}y, capital ₹${capital.toLocaleString('en-IN')}, minScore ${minScore}\n`)

  const kc = await kiteClient()
  const barsBySymbol = await loadBars(kc, symbols, from, to)

  if (Object.keys(barsBySymbol).length === 0) {
    console.error('No bars loaded.')
    process.exit(1)
  }

  const profiles: TradeProfileId[] = profileArg === 'both' ? ['intraday', 'swing'] : [profileArg as TradeProfileId]
  const results = []
  for (const profile of profiles) {
    const r = await runWalkForwardBacktest({ barsBySymbol, capital, profile, minScore, warmupBars: 60 })
    report(r)
    results.push(r)
  }

  if (jsonOut) {
    writeFileSync(jsonOut, JSON.stringify(results, null, 2))
    console.log(`\nWrote ${jsonOut}`)
  }
}

main().catch(err => { console.error(err.message || err); process.exit(1) })
