/**
 * Pilot: fetch order-win announcements for the 500 most traded stocks from
 * the Drishti API into data/events/orders.json.
 *
 *   npx tsx --env-file=.env.local scripts/research/events-fetch.ts [maxCredits]
 *
 * Each announcement returned costs one credit, so the run stops at the
 * budget given (default 900). Batches already fetched are kept, so a second
 * run only pays for what is missing.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { openStore } from '@/lib/market-data/store'

const BUDGET = Number(process.argv[2] ?? 900)
const PER_BATCH = 36
const CATEGORY = 'Award/Receipt of Order'
const OUT = 'data/events/orders.json'
const key = (process.env.DRISHTI_API_KEY ?? '').trim().replace(/^["']|["']$/g, '')
if (!key) throw new Error('DRISHTI_API_KEY is not set')

interface Saved { batches: Record<string, Array<{ id: string; symbol: string; date: string; summary: string; category: string }>> }

const store = openStore()
const symbols = (store.prepare(
  'select symbol from universe_monthly where date = (select max(date) from universe_monthly) and rank <= 500 order by rank'
).all() as Array<{ symbol: string }>).map(r => r.symbol)
store.close()

async function main() {
mkdirSync('data/events', { recursive: true })
const saved: Saved = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { batches: {} }
let spent = 0

for (let i = 0; i < symbols.length; i += 20) {
  const batch = symbols.slice(i, i + 20)
  const id = batch.join(',')
  if (saved.batches[id]) continue
  if (spent + PER_BATCH > BUDGET) { console.log(`Stopping at ${spent} credits: the next batch could pass the budget of ${BUDGET}.`); break }
  const url = `https://developers.manasija.in/v1/announcements?symbols=${encodeURIComponent(id)}&categories=${encodeURIComponent(CATEGORY)}&limit=${PER_BATCH}`
  const res = await fetch(url, { headers: { 'X-API-Key': key } })
  if (!res.ok) { console.log(`Batch ${i / 20 + 1}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`); break }
  const rows = (await res.json()).data as Saved['batches'][string]
  saved.batches[id] = rows.map(r => ({ id: r.id, symbol: r.symbol, date: r.date, summary: r.summary, category: r.category }))
  spent += rows.length
  writeFileSync(OUT, JSON.stringify(saved))
  console.log(`Batch ${i / 20 + 1}: ${rows.length} announcements, ${spent} credits used in this run`)
  await new Promise(resolve => setTimeout(resolve, 7000))   // the free plan allows 10 requests a minute
}

const all = Object.values(saved.batches).flat()
const dates = all.map(r => r.date).sort()
console.log(`${all.length} announcements for ${new Set(all.map(r => r.symbol)).size} stocks, ${dates[0]?.slice(0, 10)} to ${dates[dates.length - 1]?.slice(0, 10)}`)
}

main().catch(error => { console.error(error); process.exit(1) })
