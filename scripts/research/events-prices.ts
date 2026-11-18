/**
 * Pilot: download Zerodha minute prices around each order-win announcement
 * in data/events/orders.json, and for NIFTY 50 over the same days.
 *
 *   npx tsx --env-file=.env.local scripts/research/events-prices.ts <app user id>
 *
 * Needs that user's Zerodha connection to be live today. Files are cached in
 * data/events/minute, so a second run only fetches what is missing.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { getBrokerManager } from '@/lib/broker'

const userId = Number(process.argv[2])
const DIR = 'data/events/minute'
const NIFTY = { symbol: 'NIFTY 50', token: 256265 }
const DAY = 86400000
const ist = (d: Date) => new Date(d.getTime() + 5.5 * 3600000).toISOString()
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function main() {
  if (!userId) throw new Error('Give the app user id whose Zerodha connection to use')
  const manager = await getBrokerManager(userId)
  if (!manager.hasConnection()) throw new Error('Zerodha is not connected for this user today')
  const client = manager.getClient()
  const tokens = new Map((await client.getInstruments('NSE')).map(i => [i.tradingsymbol, i.instrumentToken]))

  const events = Object.values(JSON.parse(readFileSync('data/events/orders.json', 'utf8')).batches).flat() as Array<{ symbol: string; date: string }>
  mkdirSync(DIR, { recursive: true })

  // One file per stock and announcement day: that day and the following week of minute bars
  const wanted = new Map<string, { symbol: string; token: number | string; day: string }>()
  for (const e of events) {
    const day = ist(new Date(e.date)).slice(0, 10)
    const token = tokens.get(e.symbol)
    if (token) wanted.set(`${e.symbol}_${day}`, { symbol: e.symbol, token, day })
    wanted.set(`NIFTY50_${day}`, { symbol: NIFTY.symbol, token: NIFTY.token, day })
  }
  const missing = [...new Set(events.map(e => e.symbol))].filter(s => !tokens.has(s))
  if (missing.length) console.log(`No Zerodha instrument for: ${missing.join(', ')}`)

  let fetched = 0, failed = 0
  for (const [name, w] of wanted) {
    const file = `${DIR}/${name.replace(/[^A-Za-z0-9_-]/g, '-')}.json`
    if (existsSync(file)) continue
    const from = new Date(`${w.day}T09:00:00+05:30`), to = new Date(from.getTime() + 7 * DAY)
    try {
      const candles = await client.getHistoricalData({ instrumentToken: w.token, exchange: 'NSE', symbol: w.symbol, interval: 'minute', from, to } as any)
      writeFileSync(file, JSON.stringify(candles.map(c => [new Date(c.date).getTime(), c.open, c.high, c.low, c.close, c.volume])))
      fetched++
    } catch (error: any) {
      failed++
      console.log(`${name}: ${String(error.message).slice(0, 120)}`)
      if (failed > 20) throw new Error('Too many failures, stopping')
    }
    if (fetched % 100 === 0 && fetched) console.log(`${fetched} files fetched`)
    await sleep(380)   // Zerodha allows about three history requests a second
  }
  console.log(`Done: ${fetched} fetched, ${failed} failed, ${wanted.size} files wanted`)
}

main().then(() => process.exit(0)).catch(error => { console.error(error.message); process.exit(1) })
