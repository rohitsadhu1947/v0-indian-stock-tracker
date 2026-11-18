/**
 * NSE's public feed of company announcements: fetch, parse and sort into
 * kinds. The feed holds the current day's filings, each stamped to the
 * second, so it has to be read through the day to build a history.
 *
 * Parsing and sorting are pure functions. Nothing here says a filing is a
 * reason to trade: that has to be measured first.
 */
import { createHash } from 'crypto'

export const FEED_URL = 'https://nsearchives.nseindia.com/content/RSS/Online_announcements.xml'
const USER_AGENT = 'indian-stock-tracker/1.0 (personal research; public RSS feed)'

export interface Filing {
  /** Stable across polls: a hash of the link and the publication time. */
  id: string
  company: string
  subject: string
  text: string
  url: string
  /** When NSE published it, ISO with the +05:30 offset. */
  publishedAt: string
}

export type FilingCategory =
  | 'orders' | 'results' | 'deal' | 'capital' | 'rating' | 'regulatory' | 'management' | 'update' | 'routine'

export const CATEGORY_LABEL: Record<FilingCategory, string> = {
  orders: 'Order or contract',
  results: 'Results or board meeting outcome',
  deal: 'Acquisition, merger or sale',
  capital: 'Dividend, bonus, buyback or fund raising',
  rating: 'Credit rating',
  regulatory: 'Penalty, litigation or default',
  management: 'Senior resignation or auditor change',
  update: 'Press release or business update',
  routine: 'Routine',
}

/** Kinds worth a message: the ones that can change what a company is worth. */
export const MATERIAL: ReadonlySet<FilingCategory> = new Set(['orders', 'results', 'deal', 'capital', 'rating', 'regulatory', 'management'])

const decode = (s: string) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/\s+/g, ' ').trim()

const MONTHS: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' }

/** "18-Nov-2026 10:17:43" (India time) to ISO. Null when it is not in that shape. */
export function parseFeedDate(value: string): string | null {
  const m = /^(\d{2})-([A-Za-z]{3})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(value.trim())
  if (!m || !MONTHS[m[2]]) return null
  return `${m[3]}-${MONTHS[m[2]]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}+05:30`
}

export function parseFeed(xml: string): Filing[] {
  const out: Filing[] = []
  for (const [, item] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const tag = (name: string) => decode(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(item)?.[1] ?? '')
    const publishedAt = parseFeedDate(tag('pubDate'))
    const url = tag('link')
    if (!publishedAt || !url) continue
    const [text, subject = ''] = tag('description').split('|SUBJECT:').map(s => s.trim())
    out.push({
      id: createHash('sha1').update(`${url}|${publishedAt}`).digest('hex').slice(0, 20),
      company: tag('title'), subject, text, url, publishedAt,
    })
  }
  return out
}

export async function fetchFeed(timeoutMs = 15000): Promise<Filing[]> {
  const res = await fetch(FEED_URL, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' })
  if (!res.ok) throw new Error(`NSE feed returned ${res.status}`)
  return parseFeed(await res.text())
}

// Checked in order: the first rule that matches decides the kind
const RULES: Array<[FilingCategory, RegExp]> = [
  ['routine', /\bNAV\b|newspaper|trading window|share certificate|duplicate|postal ballot|esop|esos|analyst|investor meet|con\. call|shareholders? meeting|agm|egm|book closure|record date|certificate under|compliance|scrutinizer|voting result|address|registrar|transcript|presentation/i],
  ['orders', /order|contract|letter of (award|intent)|\bLOA\b|\bLOI\b/i],
  ['results', /financial result|outcome of board meeting|results? for the (quarter|year|period)/i],
  ['deal', /acquisition|merger|amalgamation|scheme of arrangement|demerger|slump sale|joint venture|disinvestment|sale or disposal|open offer|takeover/i],
  ['capital', /dividend|bonus|buy.?back|stock split|sub-?division|rights issue|preferential|qualified institution|\bQIP\b|raising of funds|fund raising|allotment/i],
  ['rating', /credit rating/i],
  ['regulatory', /penalt|litigation|dispute|search|seizure|fraud|default|insolvency|show cause|regulatory action|strike|lock.?out|fire|disruption/i],
  ['management', /resignation|cessation|change in auditor|appointment of (statutory )?auditor/i],
  ['update', /press release|update|clarification|spurt/i],
]

/** The kind of a filing, from its subject line first and its text second. */
export function categorize(subject: string, text = ''): FilingCategory {
  for (const [category, pattern] of RULES) if (pattern.test(subject)) return category
  for (const [category, pattern] of RULES) if (category !== 'routine' && category !== 'update' && pattern.test(text)) return category
  return 'routine'
}

/** A company name reduced to the words that identify it. */
export function normalizeName(name: string): string {
  return name.toUpperCase().replace(/&/g, ' AND ').replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\b(THE|LIMITED|LTD|INDIA|CORPORATION|CORP|COMPANY|CO)\b/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Match feed company names to NSE symbols using NSE's own list of names.
 * Exact match on the reduced name first; otherwise the only listed name
 * that starts with the same two words. No match returns null, so a wrong
 * stock is never guessed.
 */
export function symbolMatcher(names: Array<{ symbol: string; name: string }>): (company: string) => string | null {
  const exact = new Map<string, string | null>()
  const prefix = new Map<string, string | null>()
  const put = (map: Map<string, string | null>, key: string, symbol: string) => {
    if (!key) return
    map.set(key, map.has(key) && map.get(key) !== symbol ? null : symbol)   // null: ambiguous
  }
  for (const { symbol, name } of names) {
    const n = normalizeName(name)
    put(exact, n, symbol)
    put(prefix, n.split(' ').slice(0, 2).join(' '), symbol)
  }
  return company => {
    const n = normalizeName(company)
    return exact.get(n) ?? (n.includes(' ') ? prefix.get(n.split(' ').slice(0, 2).join(' ')) ?? null : null)
  }
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** The Telegram message for one filing. States what was filed and when; it is not a call to buy or sell. */
export function filingMessage(f: Filing, symbol: string, rank: number, category: FilingCategory, seenAt: Date): string {
  const time = (iso: string | Date) => new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })
  const delay = Math.max(0, Math.round((seenAt.getTime() - new Date(f.publishedAt).getTime()) / 1000))
  return [
    `<b>${escapeHtml(symbol)}</b>: ${CATEGORY_LABEL[category]}`,
    escapeHtml(f.text.slice(0, 400)),
    `Filed ${time(f.publishedAt)}, seen ${delay} seconds later. Rank ${rank} by trading.`,
    `<a href="${encodeURI(f.url)}">Open the filing</a>`,
  ].join('\n')
}
