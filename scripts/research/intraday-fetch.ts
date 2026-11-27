/**
 * Download Zerodha 5-minute prices for the 100 most traded stocks of each
 * month since 2015, and for NIFTY 50, into data/intraday.
 *
 *   npx tsx --env-file=.env.local scripts/research/intraday-fetch.ts <app user id>
 *
 * A stock is fetched only for the months it was in the top 100, as the list
 * stood at the end of the month before. Needs that user's Zerodha connection
 * to be live today. Safe to re-run: ranges already fetched are skipped.
 * A bar is [minutes since midnight IST, open, high, low, close, volume].
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { getBrokerManager } from '@/lib/broker'
import { openStore } from '@/lib/market-data/store'
import { daysBetween, isoDate } from '@/lib/research/dates'

const userId = Number(process.argv[2])
const DIR = 'data/intraday'
const START = 20150201
const TOP = 100
const WINDOW_DAYS = 90   // Zerodha gives at most 100 days of 5-minute bars in one request
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
export const intradayFile = (symbol: string) => `${DIR}/${symbol.replace(/[^A-Za-z0-9_-]/g, '-')}.json`

/** A dropped connection is retried after a pause, five times, before the request counts as failed. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await fn() } catch (error) {
      if (attempt >= 5) throw error
      await sleep(15000 * (attempt + 1))
    }
  }
}

interface Saved { days: Record<string, number[][]>; fetched: string[] }
const addDays = (d: number, n: number) => Number(new Date(Date.parse(isoDate(d)) + n * 86400000).toISOString().slice(0, 10).replaceAll('-', ''))

async function main() {
  if (!userId) throw new Error('Give the app user id whose Zerodha connection to use')
  const manager = await getBrokerManager(userId)
  if (!manager.hasConnection()) throw new Error('Zerodha is not connected for this user today')
  const client = manager.getClient()
  const tokens = new Map<string, number | string>((await client.getInstruments('NSE')).map(i => [i.tradingsymbol, i.instrumentToken]))
  tokens.set('NIFTY 50', 256265)

  const store = openStore()
  const lastSession = (store.prepare('select max(date) d from raw_bars').get() as { d: number }).d
  const lists = store.prepare('select date, symbol from universe_monthly where rank <= ? order by date').all(TOP) as Array<{ date: number; symbol: string }>
  const listDates = [...new Set(lists.map(r => r.date))]
  store.close()

  // Each month-end list applies from the next day to the next month-end
  const ranges = new Map<string, Array<[number, number]>>()
  for (const r of lists) {
    const next = listDates[listDates.indexOf(r.date) + 1] ?? lastSession
    const from = Math.max(START, addDays(r.date, 1))
    if (next < from) continue
    const list = ranges.get(r.symbol) ?? []
    const last = list[list.length - 1]
    if (last && daysBetween(last[1], from) <= 1) last[1] = next; else list.push([from, next])
    ranges.set(r.symbol, list)
  }
  ranges.set('NIFTY 50', [[START, lastSession]])
  mkdirSync(DIR, { recursive: true })

  const noInstrument: string[] = []
  let requests = 0, failed = 0, done = 0
  for (const [symbol, spans] of ranges) {
    done++
    const token = tokens.get(symbol)
    if (!token) { noInstrument.push(symbol); continue }
    const file = intradayFile(symbol)
    const saved: Saved = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { days: {}, fetched: [] }
    const fetched = new Set(saved.fetched)
    let changed = false
    for (const [from, to] of spans) {
      for (let a = from; a <= to; a = addDays(a, WINDOW_DAYS + 1)) {
        const b = Math.min(to, addDays(a, WINDOW_DAYS)), key = `${a}-${b}`
        if (fetched.has(key)) continue
        try {
          const candles = await withRetry(() => client.getHistoricalData({
            instrumentToken: token, exchange: 'NSE', symbol, interval: '5minute',
            from: new Date(`${isoDate(a)}T09:00:00+05:30`), to: new Date(`${isoDate(b)}T15:35:00+05:30`),
          } as any))
          for (const c of candles) {
            const ist = new Date(new Date(c.date).getTime() + 5.5 * 3600000)
            const day = ist.toISOString().slice(0, 10).replaceAll('-', '')
            ;(saved.days[day] ??= []).push([ist.getUTCHours() * 60 + ist.getUTCMinutes(), c.open, c.high, c.low, c.close, c.volume])
          }
          saved.fetched.push(key)
          changed = true
          requests++
        } catch (error: any) {
          failed++
          console.log(`${symbol} ${key}: ${String(error.message).slice(0, 120)}`)
          if (failed > 30) throw new Error('Too many failures, stopping')
        }
        await sleep(360)   // Zerodha allows about three history requests a second
      }
    }
    if (changed) writeFileSync(file, JSON.stringify(saved))
    if (done % 20 === 0) console.log(`${done} of ${ranges.size} stocks, ${requests} requests`)
  }
  console.log(`Done: ${requests} requests, ${failed} failed. No Zerodha instrument for ${noInstrument.length} symbols: ${noInstrument.join(', ')}`)
}

main().then(() => process.exit(0)).catch(error => { console.error(error.message); process.exit(1) })
