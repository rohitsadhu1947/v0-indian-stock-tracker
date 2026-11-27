/**
 * Download Zerodha minute prices for the stock-days in data/fo/day-trades.json
 * (written by `npm run research:fo`), and for NIFTY 50 on the same days.
 *
 *   npx tsx --env-file=.env.local scripts/research/fo-minute-fetch.ts <app user id> [list file] [folder]
 *
 * Needs that user's Zerodha connection to be live today. One file per stock
 * in data/fo/minute. Safe to re-run: days already fetched are skipped.
 * A bar is [minutes since midnight IST, open, high, low, close, volume].
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { getBrokerManager } from '@/lib/broker'
import { isoDate, daysBetween } from '@/lib/research/dates'

const userId = Number(process.argv[2])
// Optional: another list of { symbol, date } and another folder to save into
const LIST = process.argv[3] ?? 'data/fo/day-trades.json'
const DIR = process.argv[4] ?? 'data/fo/minute'
const WINDOW_DAYS = 55   // Zerodha gives at most 60 days of minute bars in one request
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const fileFor = (symbol: string) => `${DIR}/${symbol.replace(/[^A-Za-z0-9_-]/g, '-')}.json`

interface Saved { days: Record<string, number[][]>; empty: number[] }

async function main() {
  if (!userId) throw new Error('Give the app user id whose Zerodha connection to use')
  const manager = await getBrokerManager(userId)
  if (!manager.hasConnection()) throw new Error('Zerodha is not connected for this user today')
  const client = manager.getClient()
  const tokens = new Map<string, number | string>((await client.getInstruments('NSE')).map(i => [i.tradingsymbol, i.instrumentToken]))
  tokens.set('NIFTY 50', 256265)

  const trades = JSON.parse(readFileSync(LIST, 'utf8')) as Array<{ symbol: string; date: number }>
  const wanted = new Map<string, Set<number>>()
  for (const t of trades) {
    if (!wanted.has(t.symbol)) wanted.set(t.symbol, new Set())
    wanted.get(t.symbol)!.add(t.date)
  }
  wanted.set('NIFTY 50', new Set(trades.map(t => t.date)))
  mkdirSync(DIR, { recursive: true })

  const noInstrument: string[] = []
  let requests = 0, failed = 0, daysSaved = 0
  for (const [symbol, dates] of wanted) {
    const token = tokens.get(symbol)
    if (!token) { noInstrument.push(symbol); continue }
    const file = fileFor(symbol)
    const saved: Saved = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { days: {}, empty: [] }
    const empty = new Set(saved.empty)
    const todo = [...dates].filter(d => !saved.days[d] && !empty.has(d)).sort((a, b) => a - b)
    for (let i = 0; i < todo.length;) {
      // Every wanted day within the window after the first one goes in the same request
      let j = i
      while (j + 1 < todo.length && daysBetween(todo[i], todo[j + 1]) <= WINDOW_DAYS) j++
      const batch = todo.slice(i, j + 1)
      i = j + 1
      try {
        const candles = await client.getHistoricalData({
          instrumentToken: token, exchange: 'NSE', symbol, interval: 'minute',
          from: new Date(`${isoDate(batch[0])}T09:00:00+05:30`), to: new Date(`${isoDate(batch[batch.length - 1])}T15:35:00+05:30`),
        } as any)
        const need = new Set(batch)
        for (const c of candles) {
          const ist = new Date(new Date(c.date).getTime() + 5.5 * 3600000)
          const day = Number(ist.toISOString().slice(0, 10).replaceAll('-', ''))
          if (!need.has(day)) continue
          ;(saved.days[day] ??= []).push([ist.getUTCHours() * 60 + ist.getUTCMinutes(), c.open, c.high, c.low, c.close, c.volume])
        }
        for (const d of batch) { if (saved.days[d]) daysSaved++; else saved.empty.push(d) }
        requests++
      } catch (error: any) {
        failed++
        console.log(`${symbol} ${batch[0]}: ${String(error.message).slice(0, 120)}`)
        if (failed > 30) throw new Error('Too many failures, stopping')
      }
      await sleep(360)   // Zerodha allows about three history requests a second
    }
    writeFileSync(file, JSON.stringify(saved))
    if (requests && requests % 200 < 3) console.log(`${requests} requests, ${daysSaved} days saved (${symbol})`)
  }
  console.log(`Done: ${requests} requests, ${daysSaved} stock-days saved, ${failed} failed. No Zerodha instrument for ${noInstrument.length} symbols: ${noInstrument.join(', ')}`)
}

main().then(() => process.exit(0)).catch(error => { console.error(error.message); process.exit(1) })
