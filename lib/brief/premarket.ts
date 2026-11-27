/**
 * Fetches the overnight picture for the Brief tab: US indices, the VIX,
 * crude, gold, the rupee and five ADRs, from Yahoo Finance's public chart
 * data, set against the last Indian session in our own price table.
 */
import logger from '@/lib/logger'
import { dataFreshness, loadBars } from '@/lib/portfolio/data'
import { ADR_GAP_SHARE, adrRow, CRUDE_NOTE_PCT, impliedNiftyGap, moveSince, type AdrRow, type DailySeries, type Move } from './premarket-core'

const MARKETS: Array<{ key: string; label: string; ticker: string }> = [
  { key: 'sp500', label: 'S&P 500', ticker: '^GSPC' }, { key: 'nasdaq', label: 'Nasdaq', ticker: '^IXIC' },
  { key: 'vix', label: 'VIX (US fear index)', ticker: '^VIX' }, { key: 'brent', label: 'Brent crude', ticker: 'BZ=F' },
  { key: 'wti', label: 'WTI crude', ticker: 'CL=F' }, { key: 'gold', label: 'Gold', ticker: 'GC=F' }, { key: 'usdinr', label: 'US dollar in rupees', ticker: 'INR=X' },
]
const ADRS: Record<string, string> = { INFY: 'INFY', HDFCBANK: 'HDB', ICICIBANK: 'IBN', WIPRO: 'WIT', DRREDDY: 'RDY' }

export interface Premarket {
  /** The last Indian session the moves are measured from. */
  since: string
  fetchedAt: string
  markets: Array<{ key: string; label: string } & Move>
  /** NIFTY's usual opening gap for this S&P 500 move, in percent. Null when the US figure is missing. */
  impliedNiftyGapPct: number | null
  adrs: AdrRow[]
  /** Set when crude has moved 3% or more. */
  crudeNote: string | null
  /** Markets with no session since the Indian close, usually a holiday there. */
  closed: string[]
  /** Items the source did not return. */
  missing: string[]
}

async function series(ticker: string): Promise<DailySeries | null> {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1mo&interval=1d`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (market brief)' }, signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return null
  const result = (await res.json()).chart?.result?.[0]
  const closes = result?.indicators?.quote?.[0]?.close as Array<number | null> | undefined
  if (!result?.timestamp || !closes) return null
  const offset = result.meta?.gmtoffset ?? 0
  const out: DailySeries = { dates: [], closes: [] }
  result.timestamp.forEach((t: number, i: number) => {
    if (!(closes[i]! > 0)) return
    out.dates.push(new Date((t + offset) * 1000).toISOString().slice(0, 10))
    out.closes.push(closes[i]!)
  })
  return out
}

let cached: { at: number; value: Premarket } | null = null
const TEN_MINUTES = 10 * 60 * 1000

/** Null when there is no Indian session to measure from. Items Yahoo does not return are listed in `missing`. */
export async function premarket(): Promise<Premarket | null> {
  if (cached && Date.now() - cached.at < TEN_MINUTES) return cached.value
  const { latestDate } = await dataFreshness()
  if (!latestDate) return null

  const tickers = [...MARKETS.map(m => m.ticker), ...Object.values(ADRS)]
  const fetched = await Promise.all(tickers.map(t => series(t).catch(error => { logger.warn('Pre-market fetch failed', { ticker: t, error: error.message }); return null })))
  const byTicker = new Map(tickers.map((t, i) => [t, fetched[i]]))
  const missing: string[] = [], closed: string[] = []

  const markets: Premarket['markets'] = []
  for (const m of MARKETS) {
    const s = byTicker.get(m.ticker)
    const move = s && moveSince(s, latestDate)
    if (move) markets.push({ key: m.key, label: m.label, ...move }); else (s ? closed : missing).push(m.label)
  }

  const since = new Date(new Date(latestDate + 'T00:00:00Z').getTime() - 12 * 86400000).toISOString().slice(0, 10)
  const local = await loadBars(Object.keys(ADRS), since, latestDate)
  const adrs: AdrRow[] = []
  for (const [symbol, ticker] of Object.entries(ADRS)) {
    const s = byTicker.get(ticker), bars = local[symbol] ?? []
    const move = s && moveSince(s, latestDate)
    const last = bars[bars.length - 1], before = bars[bars.length - 2]
    if (!move || !last || !before || last.date !== latestDate || !(symbol in ADR_GAP_SHARE)) { (s && !move ? closed : missing).push(`${symbol} ADR`); continue }
    adrs.push(adrRow(symbol, move, (last.close / before.close - 1) * 100))
  }

  const us = markets.find(m => m.key === 'sp500'), brent = markets.find(m => m.key === 'brent')
  const value: Premarket = {
    since: latestDate, fetchedAt: new Date().toISOString(), markets,
    impliedNiftyGapPct: us ? impliedNiftyGap(us.pct) : null, adrs,
    crudeNote: brent && Math.abs(brent.pct) >= CRUDE_NOTE_PCT
      ? `Brent has moved ${brent.pct >= 0 ? '+' : ''}${brent.pct.toFixed(1)}%. In testing, oil-linked stocks did not move enough after the open on such days to cover the cost of a trade.`
      : null,
    closed, missing,
  }
  if (markets.length) cached = { at: Date.now(), value }
  return value
}
