/**
 * Download NSE's daily archive files into data/nse/raw (gitignored).
 *
 *   npx tsx scripts/data/download-nse.ts [--from=2010-01-01] [--to=YYYY-MM-DD]
 *   npx tsx scripts/data/download-nse.ts --legacy=YYYY-MM-DD   (replacement for a bad day)
 *   npx tsx scripts/data/download-nse.ts --board-meetings      (add results dates to days already fetched)
 *
 * Keeps, per trading day, the price file (pd), corporate actions (bc), market
 * cap (mcap, when NSE includes it) and delivery quantities (mto), gzipped.
 * Safe to re-run: days already fetched, and days NSE has no file for, are
 * recorded in data/nse/manifest.json and skipped.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { gzipSync } from 'zlib'
import {
  deliveryUrl, ETF_LIST_URL, extractPrBundle, extractSingleCsv, fetchArchiveFile, indexCloseUrl, legacyBhavcopyUrl,
  prBundleUrl, SYMBOL_CHANGES_URL,
} from '../../lib/market-data/nse-archive'

const arg = (name: string, fallback: string) =>
  process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback

const istToday = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
const FROM = arg('from', '2010-01-01')
const TO = arg('to', istToday)
const ROOT = 'data/nse'
const MANIFEST = `${ROOT}/manifest.json`
const CONCURRENCY = 3
const PAUSE_MS = 200

type Status = 'ok' | 'none'
const manifest: Record<string, Status> = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function daysBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = new Date(from + 'T00:00:00Z'); d <= new Date(to + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt >= 4) throw err
      await sleep(2000 * (attempt + 1))
    }
  }
}

async function fetchDay(date: string): Promise<Status> {
  const zip = await withRetry(() => fetchArchiveFile(prBundleUrl(date)))
  if (!zip) return 'none'
  const { pd, bc, mcap, bm } = extractPrBundle(zip)
  if (!pd) throw new Error(`${date}: bundle has no price file`)

  const dir = `${ROOT}/raw/${date.slice(0, 4)}`
  mkdirSync(dir, { recursive: true })
  const stem = `${dir}/${date.replaceAll('-', '')}`
  writeFileSync(`${stem}.pd.csv.gz`, gzipSync(pd))
  if (bc) writeFileSync(`${stem}.bc.csv.gz`, gzipSync(bc))
  if (mcap) writeFileSync(`${stem}.mcap.csv.gz`, gzipSync(mcap))
  if (bm) writeFileSync(`${stem}.bm.txt.gz`, gzipSync(bm))

  await sleep(PAUSE_MS)
  const mto = await withRetry(() => fetchArchiveFile(deliveryUrl(date)))
  if (mto) writeFileSync(`${stem}.mto.dat.gz`, gzipSync(mto))
  return 'ok'
}

/** Fetch NSE's older-format price file and index closes for one day (see ingest-nse.ts). */
async function fetchLegacy(date: string) {
  const zip = await fetchArchiveFile(legacyBhavcopyUrl(date))
  const csv = zip && extractSingleCsv(zip)
  if (!csv) throw new Error(`NSE has no older-format price file for ${date}`)
  const dir = `${ROOT}/raw/${date.slice(0, 4)}`
  mkdirSync(dir, { recursive: true })
  const stem = `${dir}/${date.replaceAll('-', '')}`
  writeFileSync(`${stem}.legacy.csv.gz`, gzipSync(csv))
  const indices = await fetchArchiveFile(indexCloseUrl(date))
  if (indices) writeFileSync(`${stem}.indices.csv.gz`, gzipSync(indices))
  console.log(`Saved older-format files for ${date}`)
}

/** For days fetched before board-meeting files were kept: fetch the bundle again for that file only. */
async function backfillBoardMeetings() {
  const stemOf = (d: string) => `${ROOT}/raw/${d.slice(0, 4)}/${d.replaceAll('-', '')}`
  const queue = Object.keys(manifest).filter(d => manifest[d] === 'ok' && !existsSync(`${stemOf(d)}.bm.txt.gz`)).sort()
  console.log(`${queue.length} days need a board-meeting file`)
  let done = 0, saved = 0, failed = 0
  async function worker() {
    for (let date = queue.shift(); date; date = queue.shift()) {
      try {
        const zip = await withRetry(() => fetchArchiveFile(prBundleUrl(date!)))
        // An empty marker stops a bundle without the file being fetched again
        writeFileSync(`${stemOf(date)}.bm.txt.gz`, gzipSync((zip && extractPrBundle(zip).bm) || ''))
        saved++
      } catch (err: any) {
        failed++
        console.error(`${date}: ${err.message}`)
      }
      if (++done % 200 === 0) console.log(`  ${done} done, ${failed} failed (at ${date})`)
      await sleep(PAUSE_MS)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  console.log(`Done: ${saved} board-meeting files saved, ${failed} failed`)
  if (failed) process.exitCode = 1
}

async function main() {
  mkdirSync(ROOT, { recursive: true })
  const legacy = process.argv.find(a => a.startsWith('--legacy='))?.split('=')[1]
  if (legacy) return fetchLegacy(legacy)
  if (process.argv.includes('--board-meetings')) return backfillBoardMeetings()
  // A missing file within the last few days may simply not be published yet
  const settledBefore = new Date(Date.now() - 4 * 86400000).toISOString().slice(0, 10)
  const todo = daysBetween(FROM, TO).filter(d => !manifest[d])
  console.log(`${todo.length} days to check (${FROM} to ${TO})`)

  let done = 0, ok = 0, failed = 0
  const queue = [...todo]
  async function worker() {
    for (let date = queue.shift(); date; date = queue.shift()) {
      try {
        const status = await fetchDay(date)
        if (status === 'ok') { manifest[date] = 'ok'; ok++ }
        else if (date < settledBefore) manifest[date] = 'none'
      } catch (err: any) {
        failed++
        console.error(`${date}: ${err.message}`)
      }
      if (++done % 100 === 0) {
        writeFileSync(MANIFEST, JSON.stringify(manifest))
        console.log(`  ${done}/${todo.length} checked, ${ok} trading days saved, ${failed} failed (at ${date})`)
      }
      await sleep(PAUSE_MS)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  writeFileSync(MANIFEST, JSON.stringify(manifest))

  // Reference lists NSE keeps current: symbol renames and exchange-traded funds
  for (const [url, name] of [[SYMBOL_CHANGES_URL, 'symbolchange.csv'], [ETF_LIST_URL, 'eq_etfseclist.csv']]) {
    const file = await withRetry(() => fetchArchiveFile(url)).catch(() => null)
    if (file) writeFileSync(`${ROOT}/${name}`, file)
    else console.error(`Could not refresh ${name}; keeping the previous copy`)
  }
  const total = Object.values(manifest).filter(s => s === 'ok').length
  console.log(`Done: ${ok} new trading days, ${failed} failed. ${total} trading days on disk.`)
  if (failed) process.exitCode = 1
}

main()
