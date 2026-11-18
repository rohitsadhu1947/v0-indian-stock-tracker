/**
 * Collect NSE company filings as they are published, and send a Telegram
 * message for the material ones in the 500 most traded stocks.
 *
 *   npm run filings:watch                 keep reading the feed (leave it running)
 *   npm run filings:watch -- --once       read the feed once and stop
 *   npm run filings:watch -- --dry-run    print the messages instead of sending them
 *
 * Every filing is stored in data/filings.db with the time NSE published it
 * and the time this machine first saw it, and copied to the app's database
 * when the filings table exists there. That history is what lets us
 * measure, later, what prices did in the minutes after each kind of filing.
 *
 * Telegram details come from TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID, or
 * from the admin's settings in the app when those are not set.
 */
import { mkdirSync } from 'fs'
import { DatabaseSync } from 'node:sqlite'
import { categorize, fetchFeed, filingMessage, MATERIAL, symbolMatcher, type Filing } from '@/lib/filings/nse-feed'
import { openStore } from '@/lib/market-data/store'
import { sendTelegramMessage } from '@/lib/telegram-alerts'

const args = new Set(process.argv.slice(2))
const ONCE = args.has('--once')
const DRY_RUN = args.has('--dry-run')
const POLL_MS = 10000
const UNIVERSE = 500
/** A filing first seen later than this after publication is stored but not sent: it is old news. */
const MAX_ALERT_DELAY_MS = 10 * 60 * 1000

function openFilings(): DatabaseSync {
  mkdirSync('data', { recursive: true })
  const db = new DatabaseSync('data/filings.db')
  db.exec(`
    create table if not exists filings (
      id text primary key, published_at text not null, first_seen_at text not null,
      company text not null, symbol text, rank integer, subject text not null, category text not null,
      text text not null, url text not null, alerted integer not null default 0
    ) without rowid;
    create index if not exists filings_symbol on filings (symbol, published_at);
    create index if not exists filings_published on filings (published_at);`)
  return db
}

/** Company names and this month's trading rank, from the research store. */
function loadReference() {
  const store = openStore()
  // A relisted company keeps its name under a new symbol: take the one seen most recently
  const names = store.prepare(
    'select symbol, name from security_names s where last_seen = (select max(last_seen) from security_names where name = s.name)'
  ).all() as Array<{ symbol: string; name: string }>
  const ranks = new Map((store.prepare(
    'select symbol, rank from universe_monthly where date = (select max(date) from universe_monthly)'
  ).all() as Array<{ symbol: string; rank: number }>).map(r => [r.symbol, r.rank]))
  store.close()
  return { match: symbolMatcher(names), ranks }
}

async function telegramTargets(): Promise<Array<{ token: string; chat: string }>> {
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    return [{ token: process.env.TELEGRAM_BOT_TOKEN, chat: process.env.TELEGRAM_CHAT_ID }]
  }
  if (!process.env.DATABASE_URL) return []
  const { db } = await import('@/db')
  const { users, userPreferences } = await import('@/db/schema')
  const { and, eq, isNotNull } = await import('drizzle-orm')
  const rows = await db
    .select({ token: userPreferences.telegramBotToken, chat: userPreferences.telegramChatId })
    .from(userPreferences).innerJoin(users, eq(users.id, userPreferences.userId))
    .where(and(eq(users.role, 'admin'), eq(userPreferences.telegramEnabled, true),
      isNotNull(userPreferences.telegramBotToken), isNotNull(userPreferences.telegramChatId)))
  return rows.map(r => ({ token: r.token!, chat: r.chat! }))
}

/**
 * Copies filings to the app's database, so the deployed app can show them.
 * Returns a no-op when there is no database or the filings table is missing.
 */
async function appDatabaseWriter(): Promise<(rows: Array<Record<string, unknown>>) => Promise<void>> {
  if (!process.env.DATABASE_URL) return async () => {}
  const { db } = await import('@/db')
  const { filings } = await import('@/db/schema')
  let working = true
  return async rows => {
    if (!working || !rows.length) return
    try {
      await db.insert(filings).values(rows as any).onConflictDoNothing()
    } catch (error: any) {
      working = false
      console.error(`Not copying filings to the app database: ${String(error.message).split('\n')[0]}`)
    }
  }
}

const istHour = () => (new Date().getUTCHours() + 5.5 + new Date().getUTCMinutes() / 60) % 24
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function main() {
  const db = openFilings()
  const { match, ranks } = loadReference()
  const targets = DRY_RUN ? [] : await telegramTargets()
  if (!DRY_RUN && !targets.length) console.log('No Telegram details found: filings will be stored but no messages sent.')
  const copyToApp = await appDatabaseWriter()
  // Filings stored here before the app had its table: copy them across once (already-copied rows are skipped)
  const earlier = db.prepare('select id, published_at, first_seen_at, company, symbol, rank, subject, category, text, url from filings').all() as Array<Record<string, any>>
  for (let i = 0; i < earlier.length; i += 500) {
    await copyToApp(earlier.slice(i, i + 500).map(r => ({
      id: r.id, publishedAt: new Date(r.published_at), firstSeenAt: new Date(r.first_seen_at), company: r.company,
      symbol: r.symbol, rank: r.rank, subject: r.subject, category: r.category, text: r.text, url: r.url,
    })))
  }
  const known = db.prepare('select 1 from filings where id = ?')
  const insert = db.prepare('insert into filings (id, published_at, first_seen_at, company, symbol, rank, subject, category, text, url, alerted) values (?,?,?,?,?,?,?,?,?,?,?)')

  const poll = async () => {
    const seenAt = new Date()
    const fresh: Filing[] = (await fetchFeed()).filter(f => !known.get(f.id))
    let alerted = 0
    const stored: Array<Record<string, unknown>> = []
    // Oldest first, so messages arrive in the order the filings were made
    for (const f of fresh.sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))) {
      const symbol = match(f.company)
      const rank = symbol ? ranks.get(symbol) ?? null : null
      const category = categorize(f.subject, f.text)
      const recent = seenAt.getTime() - new Date(f.publishedAt).getTime() <= MAX_ALERT_DELAY_MS
      const send = !!symbol && rank != null && rank <= UNIVERSE && MATERIAL.has(category) && recent
      if (send) {
        const message = filingMessage(f, symbol!, rank!, category, seenAt)
        if (DRY_RUN) console.log(`\n${message}\n`)
        for (const t of targets) await sendTelegramMessage(t.token, t.chat, message)
        alerted++
      }
      insert.run(f.id, f.publishedAt, seenAt.toISOString(), f.company, symbol, rank, f.subject, category, f.text, f.url, send && !DRY_RUN && targets.length ? 1 : 0)
      stored.push({ id: f.id, publishedAt: new Date(f.publishedAt), firstSeenAt: seenAt, company: f.company, symbol, rank, subject: f.subject, category, text: f.text, url: f.url })
    }
    await copyToApp(stored)
    if (fresh.length) console.log(`${seenAt.toISOString()}  ${fresh.length} new filings, ${alerted} worth a message`)
  }

  if (ONCE) return poll()
  console.log(`Watching NSE filings every ${POLL_MS / 1000} seconds. Stop with Ctrl+C.`)
  for (;;) {
    // NSE publishes from early morning to late evening; rest overnight
    if (istHour() >= 7 && istHour() < 23.5) {
      try { await poll() } catch (error: any) { console.error(`${new Date().toISOString()}  ${error.message}`) }
    }
    await sleep(POLL_MS)
  }
}

main().catch(error => { console.error(error); process.exit(1) })
