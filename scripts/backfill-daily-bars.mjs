/**
 * Fill the daily_bars table used by the portfolio engine.
 *
 *   node --env-file=.env.local scripts/backfill-daily-bars.mjs [--days=420] [--bars-dir=DIR] [--idx-dir=DIR] [--indices-only]
 *
 * For every NIFTY 500 stock and the engine's indices it keeps the most recent
 * `--days` trading days. Data comes from JSON files if a directory is given
 * (stocks as [date,o,h,l,c,v], indices as [date,close]; dates must be India
 * dates: the early research downloads were one day early),
 * otherwise from Kite historical data (needs today's Kite login).
 * Safe to re-run: rows are upserted.
 */

import postgres from 'postgres'
import { KiteConnect } from 'kiteconnect'
import { readFileSync, existsSync } from 'fs'

const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback
const DAYS = Number(arg('days', '420'))
const BARS_DIR = arg('bars-dir')
const IDX_DIR = arg('idx-dir')
const INDICES_ONLY = process.argv.includes('--indices-only')

// Keep in sync with lib/portfolio/config.ts INDEX_INSTRUMENTS
const INDICES = [
  { barSymbol: 'IDX:NIFTY 50', token: 256265, file: 'NIFTY_50' },
  { barSymbol: 'IDX:NIFTY 200', token: 264457, file: 'NIFTY_200' },
  { barSymbol: 'IDX:NIFTY500MOMENTM50', token: 409609, file: 'NIFTY500MOMENTM50' },
  { barSymbol: 'IDX:NIFTY500 LOWVOL50', token: 417801, file: 'NIFTY500_LOWVOL50' },
  { barSymbol: 'IDX:NIFTY500 VALUE 50', token: 409353, file: 'NIFTY500_VALUE_50' },
]

const universeSrc = readFileSync('lib/portfolio/universe.ts', 'utf8')
const STOCKS = [...universeSrc.matchAll(/symbol: "([^"]+)"/g)].map(m => m[1])

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 2 })
let kc = null
async function kite() {
  if (kc) return kc
  const [a] = await sql`select master_kite_token from users where role='admin' and master_kite_token is not null order by last_login desc limit 1`
  kc = new KiteConnect({ api_key: process.env.KITE_API_KEY })
  kc.setAccessToken(a.master_kite_token)
  await kc.getProfile() // throws if the token expired: log in with Kite first
  return kc
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

// Kite stamps daily bars at 00:00 IST. toISOString() converts that to 18:30 UTC
// on the PREVIOUS day, which labelled every bar one day early. Label bars by
// their India date.
const istDate = d => new Date(new Date(d).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)

async function fromKite(token) {
  const k = await kite()
  const from = new Date(Date.now() - Math.ceil(DAYS * 1.5) * 86400000)
  const rows = []
  for (let start = from; start < new Date();) {
    const end = new Date(Math.min(+start + 365 * 86400000, Date.now()))
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const raw = await k.getHistoricalData(token, 'day', start, end)
        for (const b of raw) rows.push([istDate(b.date), b.open, b.high, b.low, b.close, b.volume ?? 0])
        break
      } catch (e) {
        if (/Token|api_key/.test(e.message)) throw e
        await sleep(2000 * (attempt + 1))
      }
    }
    start = new Date(+end + 86400000)
    await sleep(340) // Kite historical: 3 requests/second
  }
  return rows
}

async function upsert(symbol, rows) {
  const seen = new Set()
  const recent = rows
    .filter(r => r[4] > 0 && !seen.has(r[0]) && seen.add(r[0]))
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-DAYS)
  for (let i = 0; i < recent.length; i += 500) {
    const chunk = recent.slice(i, i + 500).map(r => ({
      symbol, date: r[0], open: r[1], high: r[2], low: r[3], close: r[4], volume: r[5] ?? 0, provisional: false,
    }))
    await sql`
      insert into daily_bars ${sql(chunk)}
      on conflict (symbol, date) do update set
        open = excluded.open, high = excluded.high, low = excluded.low,
        close = excluded.close, volume = excluded.volume, provisional = false`
  }
  return recent.length
}

let tokens = null
async function tokenFor(symbol) {
  if (!tokens) {
    const inst = await (await kite()).getInstruments(['NSE'])
    tokens = new Map(inst.filter(i => i.instrument_type === 'EQ').map(i => [i.tradingsymbol, i.instrument_token]))
  }
  return tokens.get(symbol)
}

let loaded = 0, missing = []
for (const idx of INDICES) {
  let rows
  const f = IDX_DIR && `${IDX_DIR}/${idx.file}.json`
  if (f && existsSync(f)) rows = JSON.parse(readFileSync(f, 'utf8')).map(([d, c]) => [d, c, c, c, c, 0])
  else rows = await fromKite(idx.token)
  console.log(`${idx.barSymbol.padEnd(26)} ${await upsert(idx.barSymbol, rows)} bars`)
}

for (const [i, symbol] of (INDICES_ONLY ? [] : STOCKS).entries()) {
  const f = BARS_DIR && `${BARS_DIR}/${symbol}.json`
  let rows
  if (f && existsSync(f)) rows = JSON.parse(readFileSync(f, 'utf8'))
  else {
    const token = await tokenFor(symbol)
    if (!token) { missing.push(symbol); continue }
    rows = await fromKite(token)
  }
  if ((await upsert(symbol, rows)) > 0) loaded++
  else missing.push(symbol)
  if ((i + 1) % 100 === 0) console.log(`  stocks ${i + 1}/${STOCKS.length}`)
}

const [{ count }] = await sql`select count(*) from daily_bars`
console.log(`Done: ${loaded} stocks loaded, ${missing.length} missing ${JSON.stringify(missing)}. daily_bars rows: ${count}`)
await sql.end()
