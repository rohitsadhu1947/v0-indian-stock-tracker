/**
 * Download NSE's daily F&O files and load them into data/fo.db.
 *
 *   npx tsx scripts/data/fo-ingest.ts [--from=2011-01-01] [--to=YYYY-MM-DD]
 *
 * For each trading day in the research store it fetches the F&O price file,
 * open interest by participant, and the ban list. Futures are kept contract
 * by contract. Options are summed to one row per underlying, because the
 * raw files are about 3 GB and are not kept. Safe to re-run: days already
 * loaded are skipped.
 */
import { extractSingleCsv, fetchArchiveFile, foBanListUrl, foBhavcopyUrl, participantOiUrl } from '../../lib/market-data/nse-archive'
import { openStore, toDateInt, toIsoDate } from '../../lib/market-data/store'
import { openFoStore } from '../../lib/research/fo-store'
import { parseBanList, parseFoFile, parseParticipantOi, summariseOptions, expiryInt } from '../../lib/research/fo-parse'

const arg = (name: string, fallback: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback
const FROM = toDateInt(arg('from', '2011-01-01'))
const TO = toDateInt(arg('to', new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)))
const CONCURRENCY = 3
const PAUSE_MS = 200
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await fn() } catch (err) {
      if (attempt >= 4) throw err
      await sleep(2000 * (attempt + 1))
    }
  }
}

/** A side file that is missing or fails is not worth losing the day for. */
async function optional(url: string): Promise<string | null> {
  try {
    const bytes = await withRetry(() => fetchArchiveFile(url))
    return bytes ? text(bytes) : null
  } catch { return null }
}

async function main() {
  const market = openStore()
  const days = (market.prepare('select date from ingested_days where date between ? and ? order by date').all(FROM, TO) as Array<{ date: number }>).map(r => r.date)
  market.close()

  const db = openFoStore()
  const done = new Set((db.prepare('select date from fo_days').all() as Array<{ date: number }>).map(r => r.date))
  const todo = days.filter(d => !done.has(d))
  console.log(`${days.length} trading days in range, ${todo.length} to fetch`)

  const putFuture = db.prepare('insert or replace into fo_futures values (?,?,?,?,?,?,?,?,?,?,?,?,?)')
  const putOptions = db.prepare('insert or replace into fo_options values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
  const putParticipant = db.prepare('insert or replace into fo_participants values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
  const putBan = db.prepare('insert or ignore into fo_ban values (?,?)')
  const putDay = db.prepare('insert or replace into fo_days values (?,?,?,?)')

  let finished = 0, failed = 0
  async function fetchDay(date: number) {
    const iso = toIsoDate(date)
    const zip = await withRetry(() => fetchArchiveFile(foBhavcopyUrl(iso), 60000))
    const csv = zip && extractSingleCsv(zip)
    const rows = csv ? parseFoFile(csv) : []
    await sleep(PAUSE_MS)
    const participants = parseParticipantOi((await optional(participantOiUrl(iso))) ?? '')
    await sleep(PAUSE_MS)
    const banText = (await optional(foBanListUrl(iso))) ?? ''
    // The file names the trade date the ban applies to, which can be the next session
    const banDate = expiryInt((/Trade Date\s+(\d{1,2}-[A-Za-z]{3}-\d{4})/.exec(banText)?.[1] ?? '')) ?? date
    const banned = parseBanList(banText)

    const futures = rows.filter(r => r.future && r.expiry >= date)
    const nearClose = new Map<string, { expiry: number; close: number }>()
    for (const f of futures) {
      const seen = nearClose.get(f.symbol)
      if (f.close > 0 && (!seen || f.expiry < seen.expiry)) nearClose.set(f.symbol, { expiry: f.expiry, close: f.close })
    }
    const options = summariseOptions(rows, date, symbol => nearClose.get(symbol)?.close)

    db.exec('begin')
    for (const f of futures) putFuture.run(f.symbol, date, f.expiry, f.index ? 1 : 0, f.open, f.high, f.low, f.close, f.settle, f.contracts, f.value, f.oi, f.chgOi)
    for (const o of options) {
      putOptions.run(o.symbol, date, o.index ? 1 : 0, o.callOi, o.putOi, o.callChgOi, o.putChgOi, o.callContracts, o.putContracts,
        o.nearExpiry, o.nearCallOi, o.nearPutOi, o.nearCallContracts, o.nearPutContracts, o.maxPain, o.topCallStrike, o.topPutStrike, o.atmStrike, o.atmCall, o.atmPut)
    }
    for (const p of participants) {
      putParticipant.run(date, p.client, p.futIndexLong, p.futIndexShort, p.futStockLong, p.futStockShort, p.optIndexCallLong, p.optIndexPutLong,
        p.optIndexCallShort, p.optIndexPutShort, p.optStockCallLong, p.optStockPutLong, p.optStockCallShort, p.optStockPutShort)
    }
    for (const symbol of banned) putBan.run(banDate, symbol)
    putDay.run(date, rows.length, participants.length, banText ? 1 : 0)
    db.exec('commit')
  }

  let next = 0
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < todo.length) {
      const date = todo[next++]
      try { await fetchDay(date) } catch (err: any) {
        failed++
        try { db.exec('rollback') } catch {}
        console.log(`${toIsoDate(date)} failed: ${String(err.message).slice(0, 160)}`)
      }
      if (++finished % 100 === 0) console.log(`${finished} of ${todo.length} days (${toIsoDate(date)})`)
      await sleep(PAUSE_MS)
    }
  }))

  const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n
  console.log(`Done. ${failed} days failed. Store has ${count('select count(*) n from fo_days where contracts > 0')} days with F&O data, ` +
    `${count('select count(*) n from fo_days where participants > 0')} with participant data, ${count('select count(*) n from fo_futures')} futures rows, ` +
    `${count('select count(*) n from fo_options')} option rows.`)
  db.close()
}

main().catch(err => { console.error(err); process.exit(1) })
