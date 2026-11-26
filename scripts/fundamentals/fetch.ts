/**
 * Fetch the latest quarterly results for the screener from the Drishti API
 * and store them in the app database.
 *
 *   npm run fundamentals:fetch -- [maxCredits] [--quarter q2_27]
 *
 * NIFTY 100 stocks come first, then the rest of NIFTY 500, each group in
 * order of how much it trades. A result costs two credits, so the run stops
 * at the budget (default 0, which only loads what is already downloaded).
 * Downloaded results are kept in data/fundamentals, so a second run only
 * pays for stocks that are missing.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { sql } from 'drizzle-orm'
import { openStore } from '@/lib/market-data/store'
import { INDEX_MEMBERS } from '@/lib/portfolio/index-members'
import { parseEarnings, recentQuarters, type QuarterResult } from '@/lib/fundamentals/core'

const API = 'https://developers.manasija.in/v1'
const CREDITS_EACH = 2
const BATCH = 20
const args = process.argv.slice(2)
const quarterArg = args.indexOf('--quarter')
// The quarter today falls in has no results yet: default to the one before it
const QUARTER = quarterArg >= 0 ? args[quarterArg + 1] : recentQuarters(new Date(), 2)[1]
const BUDGET = Number(args.find((a, i) => /^\d+$/.test(a) && (quarterArg < 0 || i !== quarterArg + 1)) ?? 0)
const OUT = `data/fundamentals/${QUARTER}.json`
const key = (process.env.DRISHTI_API_KEY ?? '').trim().replace(/^["']|["']$/g, '')

interface Saved { rows: Record<string, any>; asked: string[] }

async function get(path: string): Promise<any> {
  const res = await fetch(API + path, { headers: { 'X-API-Key': key } })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

/** NIFTY 100 first, then the rest of NIFTY 500, each by trading rank. */
function symbolsInOrder(): string[] {
  const store = openStore()
  const ranks = new Map((store.prepare(
    'select symbol, rank from universe_monthly where date = (select max(date) from universe_monthly)'
  ).all() as Array<{ symbol: string; rank: number }>).map(r => [r.symbol, r.rank]))
  store.close()
  const byRank = (a: string, b: string) => (ranks.get(a) ?? 9999) - (ranks.get(b) ?? 9999) || a.localeCompare(b)
  const top = new Set<string>(INDEX_MEMBERS.NIFTY100)
  return [...[...top].sort(byRank), ...(INDEX_MEMBERS.NIFTY500 as readonly string[]).filter(s => !top.has(s)).sort(byRank)]
}

async function download(saved: Saved) {
  if (!key) throw new Error('DRISHTI_API_KEY is not set')
  const balance = Number((await get('/account/usage')).data?.balance ?? 0)
  const budget = Math.min(BUDGET, balance)
  console.log(`Quarter ${QUARTER}. Credits in the account: ${balance}. Spending up to ${budget}.`)
  const asked = new Set(saved.asked)
  const todo = symbolsInOrder().filter(s => !asked.has(s))
  let spent = 0
  while (todo.length) {
    const size = Math.min(BATCH, Math.floor((budget - spent) / CREDITS_EACH))
    if (size < 1) { console.log(`Stopping at ${spent} credits. ${todo.length} stocks still to fetch.`); break }
    const batch = todo.splice(0, size)
    const body = await get(`/earnings?symbols=${encodeURIComponent(batch.join(','))}&quarter=${QUARTER}&detailed=true&limit=50`)
    const rows = (body.data ?? []) as any[]
    for (const row of rows) saved.rows[String(row.symbol).toUpperCase()] = row
    saved.asked.push(...batch)
    spent += rows.length * CREDITS_EACH
    writeFileSync(OUT, JSON.stringify(saved))
    console.log(`${batch[0]} to ${batch[batch.length - 1]}: ${rows.length} of ${batch.length} have results, ${spent} credits used in this run`)
    if (todo.length) await new Promise(resolve => setTimeout(resolve, 7000))   // the free plan allows 10 requests a minute
  }
}

async function store(results: QuarterResult[]) {
  if (!process.env.DATABASE_URL) { console.log('No DATABASE_URL: nothing stored in the app.'); return }
  const { db } = await import('@/db')
  const { quarterlyResults } = await import('@/db/schema')
  if (!results.length) return
  const column = (name: string) => sql.raw(`excluded.${name}`)
  try {
    for (let i = 0; i < results.length; i += 200) {
      await db.insert(quarterlyResults)
        .values(results.slice(i, i + 200).map(r => ({ ...r, filedAt: new Date(r.filedAt) })))
        .onConflictDoUpdate({
          target: [quarterlyResults.symbol, quarterlyResults.quarter],
          set: {
            periodLabel: column('period_label'), filedAt: column('filed_at'), basis: column('basis'),
            revenueCr: column('revenue_cr'), revenueYoyPct: column('revenue_yoy_pct'), operatingProfitCr: column('operating_profit_cr'),
            patCr: column('pat_cr'), patYoyPct: column('pat_yoy_pct'), eps: column('eps'), epsTtm: column('eps_ttm'),
            summary: column('summary'), fetchedAt: sql`now()`,
          },
        })
    }
    console.log(`Stored ${results.length} results in the app database.`)
  } catch (error: any) {
    const text = String(error.cause?.message ?? error.message)
    if (/quarterly_results.*does not exist/.test(text)) {
      console.log('The app database has no quarterly_results table yet. Run:\n  npx tsx --env-file=.env.local scripts/apply-migration.ts 0009_quarterly_results.sql\nthen run this script again. It will not spend credits twice.')
    } else throw error
  }
}

async function main() {
  mkdirSync('data/fundamentals', { recursive: true })
  const saved: Saved = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { rows: {}, asked: [] }
  if (BUDGET > 0) await download(saved)
  const results = Object.values(saved.rows).map(parseEarnings).filter((r): r is QuarterResult => r != null)
  const unread = Object.keys(saved.rows).length - results.length
  console.log(`${results.length} results downloaded for ${QUARTER}${unread ? `, ${unread} more had no figures table` : ''}.`)
  await store(results)
}

main().then(() => process.exit(0)).catch(error => { console.error(error.message ?? error); process.exit(1) })
