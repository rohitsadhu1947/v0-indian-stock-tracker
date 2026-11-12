/**
 * Parsers for NSE's daily archive files. Pure functions: text in, rows out.
 * File layouts were checked against real files from 2010, 2021 and 2026.
 */

/** Series that are ordinary listed shares. EQ = normal, BE = trade-to-trade, BZ = non-compliant. */
export const EQUITY_SERIES = new Set(['EQ', 'BE', 'BZ'])

export interface RawBar {
  symbol: string
  /** Security name as printed in the price file; absent in the older-format file. */
  name?: string
  series: string
  prevClose: number
  open: number
  high: number
  low: number
  close: number
  volume: number      // shares
  value: number       // rupees
  trades: number
}

export interface IndexBar {
  name: string
  open: number
  high: number
  low: number
  close: number
}

const num = (s: string | undefined): number => {
  const n = Number((s ?? '').trim())
  return Number.isFinite(n) ? n : NaN
}

/**
 * Split a row. Files from some years (2010, 2015-16) end every line with a
 * stray comma, which would shift fields read from the right.
 */
function splitRow(line: string, columns: number): string[] {
  const f = line.split(',')
  if (f.length > columns && f[f.length - 1].trim() === '') f.pop()
  return f
}

/**
 * Pd file: MKT,SERIES,SYMBOL,SECURITY,PREV_CL_PR,OPEN,HIGH,LOW,CLOSE,
 * NET_TRDVAL,NET_TRDQTY,IND_SEC,CORP_IND,TRADES,HI_52_WK,LO_52_WK.
 * Security names are unquoted and can contain commas, so the 12 trailing
 * fields are read from the right. Index rows have a blank series and symbol.
 */
export function parsePriceFile(text: string): { equities: RawBar[]; indices: IndexBar[] } {
  const bySymbol = new Map<string, RawBar>()
  const indices: IndexBar[] = []

  for (const line of text.split(/\r?\n/)) {
    const f = splitRow(line, 16)
    if (f.length < 16) continue
    const series = f[1].trim()
    const symbol = f[2].trim()
    const t = f.slice(f.length - 12)
    const [prevClose, open, high, low, close, value, volume] = t.slice(0, 7).map(num)
    if (!(close > 0)) continue

    if (!series && !symbol) {
      const name = f.slice(3, f.length - 12).join(',').trim()
      if (name && f[0].trim() === 'Y') indices.push({ name, open, high, low, close })
      continue
    }
    if (!EQUITY_SERIES.has(series) || !symbol) continue

    const bar: RawBar = {
      symbol, name: f.slice(3, f.length - 12).join(',').trim(), series, prevClose,
      // NSE leaves open/high/low blank on days a security did not trade
      open: open > 0 ? open : close,
      high: high > 0 ? high : close,
      low: low > 0 ? low : close,
      close,
      volume: volume > 0 ? volume : 0,
      value: value > 0 ? value : 0,
      trades: num(t[9]) > 0 ? num(t[9]) : 0,
    }
    // A symbol can appear in two series on one day; keep the one that traded more
    const seen = bySymbol.get(symbol)
    if (!seen || bar.value > seen.value) bySymbol.set(symbol, bar)
  }
  return { equities: [...bySymbol.values()], indices }
}

/**
 * Older price file: SYMBOL,SERIES,OPEN,HIGH,LOW,CLOSE,LAST,PREVCLOSE,
 * TOTTRDQTY,TOTTRDVAL,TIMESTAMP,TOTALTRADES,ISIN. Each row carries its date,
 * so `date` (YYYY-MM-DD) is checked and rows for another day are dropped.
 */
export function parseLegacyBhavcopy(text: string, date: string): RawBar[] {
  const [y, m, d] = date.split('-')
  const stamp = `${d}-${Object.keys(MONTHS)[Number(m) - 1]}-${y}`
  const bySymbol = new Map<string, RawBar>()
  for (const line of text.split(/\r?\n/)) {
    const f = line.split(',')
    if (f.length < 12 || !EQUITY_SERIES.has(f[1].trim()) || f[10].trim().toUpperCase() !== stamp) continue
    const [open, high, low, close, , prevClose, volume, value] = f.slice(2, 10).map(num)
    if (!(close > 0)) continue
    const bar: RawBar = {
      symbol: f[0].trim(), series: f[1].trim(), prevClose,
      open: open > 0 ? open : close, high: high > 0 ? high : close, low: low > 0 ? low : close, close,
      volume: volume > 0 ? volume : 0, value: value > 0 ? value : 0, trades: num(f[11]) > 0 ? num(f[11]) : 0,
    }
    const seen = bySymbol.get(bar.symbol)
    if (!seen || bar.value > seen.value) bySymbol.set(bar.symbol, bar)
  }
  return [...bySymbol.values()]
}

/** ind_close_all file: Index Name,Index Date,Open,High,Low,Close,... */
export function parseIndexCloseFile(text: string): IndexBar[] {
  const out: IndexBar[] = []
  for (const line of text.split(/\r?\n/)) {
    const f = line.split(',')
    const [open, high, low, close] = f.slice(2, 6).map(num)
    if (f.length < 6 || !(close > 0)) continue
    out.push({ name: f[0].trim(), open, high, low, close })
  }
  return out
}

/**
 * Share of today's securities whose stated previous close equals the close
 * we hold for the previous session. Real consecutive sessions score ~100%;
 * a mock-trading session or a file holding another day's data scores ~0%.
 */
export function continuity(today: RawBar[], previousCloses: Map<string, number>): number {
  let compared = 0, matched = 0
  for (const b of today) {
    const prev = previousCloses.get(b.symbol)
    if (prev == null || !Number.isFinite(b.prevClose)) continue
    compared++
    if (Math.abs(b.prevClose - prev) <= 0.011) matched++
  }
  return compared ? matched / compared : 1
}

export interface CorporateActionRow {
  symbol: string
  exDate: string     // YYYY-MM-DD
  purpose: string
}

/** Accepts DD/MM/YYYY (to 2025) and YYYY-MM-DD (2026 files). */
export function parseArchiveDate(s: string): string | null {
  const v = s.trim()
  let m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? v : null
}

/**
 * Bc file: SERIES,SYMBOL,SECURITY,RECORD_DT,BC_STRT_DT,BC_END_DT,EX_DT,
 * ND_STRT_DT,ND_END_DT,PURPOSE. The same action is listed on several days and
 * once per series, so callers de-duplicate on (symbol, exDate, purpose).
 */
export function parseCorporateActionsFile(text: string): CorporateActionRow[] {
  const out: CorporateActionRow[] = []
  const seen = new Set<string>()
  for (const line of text.split(/\r?\n/)) {
    const f = splitRow(line, 10)
    if (f.length < 10) continue
    const series = f[0].trim()
    const symbol = f[1].trim()
    if (!EQUITY_SERIES.has(series) || !symbol) continue
    // Read from the right: the security name can contain commas
    const purpose = f[f.length - 1].trim().replace(/\s+/g, ' ')
    const exDate = parseArchiveDate(f[f.length - 4])
    if (!exDate || !purpose) continue
    const key = `${symbol}|${exDate}|${purpose}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ symbol, exDate, purpose })
  }
  return out
}

export interface DeliveryRow {
  symbol: string
  series: string
  tradedQty: number
  deliveredQty: number
}

/** MTO file: data rows are `20,<sr>,<symbol>,<series>,<traded>,<delivered>,<pct>`. */
export function parseDeliveryFile(text: string): DeliveryRow[] {
  const out: DeliveryRow[] = []
  for (const line of text.split(/\r?\n/)) {
    const f = line.split(',')
    if (f.length < 7 || f[0].trim() !== '20') continue
    const series = f[3].trim()
    if (!EQUITY_SERIES.has(series)) continue
    const tradedQty = num(f[4])
    const deliveredQty = num(f[5])
    if (!(tradedQty >= 0) || !(deliveredQty >= 0)) continue
    out.push({ symbol: f[2].trim(), series, tradedQty, deliveredQty })
  }
  return out
}

export interface MarketCapRow {
  symbol: string
  faceValue: number
  shares: number
  marketCap: number   // rupees
}

/**
 * mcap file: Trade Date,Symbol,Series,Security Name,Category,Last Trade Date,
 * Face Value,Issue Size,Close Price,Market Cap.
 */
export function parseMarketCapFile(text: string): MarketCapRow[] {
  const out: MarketCapRow[] = []
  for (const line of text.split(/\r?\n/)) {
    const f = splitRow(line, 10)
    if (f.length < 10) continue
    const series = f[2].trim()
    if (!EQUITY_SERIES.has(series)) continue
    const t = f.slice(f.length - 4).map(num)
    if (!(t[1] > 0) || !(t[3] > 0)) continue
    out.push({ symbol: f[1].trim(), faceValue: t[0], shares: t[1], marketCap: t[3] })
  }
  return out
}

export interface SymbolChange {
  oldSymbol: string
  newSymbol: string
  effectiveDate: string   // YYYY-MM-DD, first day traded under the new symbol
}

const MONTHS: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
}

/** symbolchange.csv: NAME OF THE COMPANY,OLD SYMBOL,NEW SYMBOL,EFFECTIVE DATE (DD-MON-YYYY). */
export function parseSymbolChanges(text: string): SymbolChange[] {
  const out: SymbolChange[] = []
  for (const line of text.split(/\r?\n/)) {
    const f = line.split(',')
    if (f.length < 4) continue
    const m = f[f.length - 1].trim().toUpperCase().match(/^(\d{2})-([A-Z]{3})-(\d{4})$/)
    const oldSymbol = f[f.length - 3].trim()
    const newSymbol = f[f.length - 2].trim()
    if (!m || !MONTHS[m[2]] || !oldSymbol || !newSymbol || oldSymbol === newSymbol) continue
    out.push({ oldSymbol, newSymbol, effectiveDate: `${m[3]}-${MONTHS[m[2]]}-${m[1]}` })
  }
  return out
}

export interface BoardMeeting {
  symbol: string
  date: string        // YYYY-MM-DD, the day the board meets
  /** The meeting is to approve financial results. */
  results: boolean
}

/**
 * Bm file: "Company Name    SYMBOL : DD-MON-YYYY : purpose text". Meetings
 * are listed ahead of time. The purpose text is free-form and sometimes
 * garbled ("To consResults/Otherssider Audited Financial Results").
 */
export function parseBoardMeetings(text: string): BoardMeeting[] {
  const out = new Map<string, BoardMeeting>()
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^.*?(\S+)\s*:\s*(\d{2})-([A-Za-z]{3})-(\d{4})\s*:(.*)$/)
    const month = m && MONTHS[m[3].toUpperCase()]
    if (!m || !month) continue
    const meeting = { symbol: m[1], date: `${m[4]}-${month}-${m[2]}`, results: /result/i.test(m[5]) }
    const key = `${meeting.symbol}|${meeting.date}`
    const seen = out.get(key)
    if (!seen || (meeting.results && !seen.results)) out.set(key, meeting)
  }
  return [...out.values()]
}
