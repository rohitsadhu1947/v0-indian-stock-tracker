/**
 * Download NSE's daily F&O files again and keep NIFTY's options contract by
 * contract in data/fo.db (table nifty_options).
 *
 *   npx tsx scripts/data/fo-nifty-options.ts [--from=2011-01-01] [--to=YYYY-MM-DD]
 *
 * fo-ingest.ts sums options to one row a day, which cannot price an option
 * trade. This keeps every NIFTY option that traded or had open interest and
 * expires within 100 days. Safe to re-run: days already loaded are skipped.
 */
import { extractSingleCsv, fetchArchiveFile, foBhavcopyUrl } from '../../lib/market-data/nse-archive'
import { toDateInt, toIsoDate } from '../../lib/market-data/store'
import { openFoStore } from '../../lib/research/fo-store'
import { parseFoFile } from '../../lib/research/fo-parse'

const arg = (name: string, fallback: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback
const FROM = toDateInt(arg('from', '2011-01-01'))
const TO = toDateInt(arg('to', new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)))
const CONCURRENCY = 3
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const daysBetween = (a: number, b: number) => (Date.parse(toIsoDate(b)) - Date.parse(toIsoDate(a))) / 86400000

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await fn() } catch (err) {
      if (attempt >= 4) throw err
      await sleep(2000 * (attempt + 1))
    }
  }
}

async function main() {
  const db = openFoStore()
  const days = (db.prepare('select date from fo_days where contracts > 0 and date between ? and ? order by date').all(FROM, TO) as Array<{ date: number }>).map(r => r.date)
  const done = new Set((db.prepare('select date from nifty_options_days').all() as Array<{ date: number }>).map(r => r.date))
  const todo = days.filter(d => !done.has(d))
  console.log(`${days.length} F&O days in range, ${todo.length} to fetch`)
  const put = db.prepare('insert or replace into nifty_options values (?,?,?,?,?,?,?,?,?,?,?)')
  const putDay = db.prepare('insert or replace into nifty_options_days values (?,?)')

  let finished = 0, failed = 0, next = 0
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < todo.length) {
      const date = todo[next++]
      try {
        const zip = await withRetry(() => fetchArchiveFile(foBhavcopyUrl(toIsoDate(date)), 60000))
        const csv = zip && extractSingleCsv(zip)
        const rows = (csv ? parseFoFile(csv) : []).filter(r => !r.future && r.symbol === 'NIFTY' && r.expiry >= date && daysBetween(date, r.expiry) <= 100 && (r.contracts > 0 || r.oi > 0) && r.close > 0)
        db.exec('begin')
        for (const r of rows) put.run(date, r.expiry, r.strike, r.type, r.open, r.high, r.low, r.close, r.settle, r.contracts, r.oi)
        putDay.run(date, rows.length)
        db.exec('commit')
      } catch (err: any) {
        failed++
        try { db.exec('rollback') } catch {}
        console.log(`${toIsoDate(date)} failed: ${String(err.message).slice(0, 160)}`)
      }
      if (++finished % 200 === 0) console.log(`${finished} of ${todo.length} days (${toIsoDate(date)})`)
      await sleep(200)
    }
  }))
  const n = (db.prepare('select count(*) n from nifty_options').get() as { n: number }).n
  console.log(`Done. ${failed} days failed. ${n} NIFTY option rows over ${(db.prepare('select count(*) n from nifty_options_days where rows > 0').get() as { n: number }).n} days.`)
  db.close()
}

main().catch(err => { console.error(err); process.exit(1) })
