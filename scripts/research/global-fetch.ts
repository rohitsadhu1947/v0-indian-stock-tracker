/**
 * Download daily history for the overnight cues: US indices, VIX, crude,
 * gold, the rupee and the US-listed shares (ADRs) of five Indian companies.
 *
 *   npx tsx scripts/research/global-fetch.ts
 *
 * Source: Yahoo Finance's public chart data. Written to data/global, one
 * file per series: { dates: YYYYMMDD[], open: [], close: [] } in the
 * exchange's own calendar dates.
 */
import { mkdirSync, writeFileSync } from 'fs'

export const GLOBAL_SERIES: Record<string, string> = {
  sp500: '^GSPC', nasdaq: '^IXIC', vix: '^VIX', wti: 'CL=F', brent: 'BZ=F', gold: 'GC=F', usdinr: 'INR=X',
  'adr-INFY': 'INFY', 'adr-HDFCBANK': 'HDB', 'adr-ICICIBANK': 'IBN', 'adr-WIPRO': 'WIT', 'adr-DRREDDY': 'RDY',
}
const FROM = Math.floor(Date.parse('2009-12-01T00:00:00Z') / 1000)

async function main() {
  mkdirSync('data/global', { recursive: true })
  for (const [key, ticker] of Object.entries(GLOBAL_SERIES)) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${FROM}&period2=${Math.floor(Date.now() / 1000)}&interval=1d`
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (research script)' } })
    if (!res.ok) { console.log(`${key}: HTTP ${res.status}`); continue }
    const result = (await res.json()).chart?.result?.[0]
    const quote = result?.indicators?.quote?.[0]
    if (!result?.timestamp || !quote) { console.log(`${key}: no data`); continue }
    const offset = result.meta.gmtoffset ?? 0
    const out = { dates: [] as number[], open: [] as number[], close: [] as number[] }
    result.timestamp.forEach((t: number, i: number) => {
      if (!(quote.close[i] > 0) || !(quote.open[i] > 0)) return
      out.dates.push(Number(new Date((t + offset) * 1000).toISOString().slice(0, 10).replaceAll('-', '')))
      out.open.push(quote.open[i]); out.close.push(quote.close[i])
    })
    writeFileSync(`data/global/${key}.json`, JSON.stringify(out))
    console.log(`${key} (${ticker}): ${out.dates.length} days, ${out.dates[0]} to ${out.dates[out.dates.length - 1]}`)
    await new Promise(r => setTimeout(r, 800))
  }
}

main().catch(error => { console.error(error); process.exit(1) })
