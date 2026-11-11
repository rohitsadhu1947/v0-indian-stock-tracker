/**
 * NSE static archive (nsearchives.nseindia.com): the exchange's own daily
 * files, available without a broker login.
 *
 *   PR bundle (4 Jan 2010 onward): Pd = prices for every security and index,
 *   Bc = corporate actions with ex-dates, mcap = market cap (recent years).
 *   MTO file: delivery quantity per security.
 *
 * Prices here are RAW (not adjusted for splits or bonuses); adjustment is
 * done from the Bc file in corporate-actions.ts / adjust.ts.
 */
import { unzipSync, strFromU8 } from 'fflate'

const BASE = 'https://nsearchives.nseindia.com'
const USER_AGENT = 'indian-stock-tracker/1.0 (personal research; daily archive files)'

/** `date` is an India date, YYYY-MM-DD. */
export function prBundleUrl(date: string): string {
  const [y, m, d] = date.split('-')
  return `${BASE}/archives/equities/bhavcopy/pr/PR${d}${m}${y.slice(2)}.zip`
}

export function deliveryUrl(date: string): string {
  const [y, m, d] = date.split('-')
  return `${BASE}/archives/equities/mto/MTO_${d}${m}${y}.DAT`
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** NSE's older daily price file (to July 2024). Used when a PR bundle holds the wrong day's data. */
export function legacyBhavcopyUrl(date: string): string {
  const [y, m, d] = date.split('-')
  const mon = MONTHS[Number(m) - 1]
  return `${BASE}/content/historical/EQUITIES/${y}/${mon}/cm${d}${mon}${y}bhav.csv.zip`
}

export function indexCloseUrl(date: string): string {
  const [y, m, d] = date.split('-')
  return `${BASE}/content/indices/ind_close_all_${d}${m}${y}.csv`
}

/** The single CSV inside a zip. */
export function extractSingleCsv(zip: Uint8Array): string | null {
  const files = unzipSync(zip, { filter: f => /\.csv$/i.test(f.name) })
  const first = Object.values(files)[0]
  return first ? strFromU8(first, true) : null
}

export const SYMBOL_CHANGES_URL = `${BASE}/content/equities/symbolchange.csv`
export const ETF_LIST_URL = `${BASE}/content/equities/eq_etfseclist.csv`

/** Fetch an archive file. Returns null when NSE has no file for that day (holiday). */
export async function fetchArchiveFile(url: string, timeoutMs = 30000): Promise<Uint8Array | null> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(timeoutMs) })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`NSE archive ${res.status} for ${url}`)
  const body = new Uint8Array(await res.arrayBuffer())
  // NSE serves an HTML error page with status 200 for some missing files
  if (body.length < 2000 && strFromU8(body.slice(0, 200)).toLowerCase().includes('<html')) return null
  return body
}

export interface PrBundle {
  pd: string | null    // prices
  bc: string | null    // corporate actions
  mcap: string | null  // market cap (absent in older bundles)
}

/** File names changed over the years (Pd040110.csv, pd25092026.csv), so match by prefix. */
export function extractPrBundle(zip: Uint8Array): PrBundle {
  const wanted = /^(pd|bc|mcap)\d{6,8}\.csv$/i
  const files = unzipSync(zip, { filter: f => wanted.test(f.name.split('/').pop() || '') })
  const out: PrBundle = { pd: null, bc: null, mcap: null }
  for (const [name, data] of Object.entries(files)) {
    const kind = (name.split('/').pop() || '').match(wanted)![1].toLowerCase() as keyof PrBundle
    out[kind] = strFromU8(data, true)
  }
  return out
}
