/**
 * Regenerate lib/portfolio/sectors.ts from NSE's NIFTY Total Market list
 * (the 750 largest listed companies, with NSE's industry for each).
 *   node scripts/update-sectors.mjs
 * Run it when NSE rebalances the index (March and September).
 */
import { writeFileSync } from 'fs'

const url = 'https://nsearchives.nseindia.com/content/indices/ind_niftytotalmarket_list.csv'
const res = await fetch(url, { headers: { 'User-Agent': 'indian-stock-tracker/1.0 (personal research; daily archive files)' } })
if (!res.ok) throw new Error(`NSE returned ${res.status}`)
// Company Name,Industry,Symbol,Series,ISIN Code. Read from the right: names can contain commas
const rows = (await res.text()).trim().split(/\r?\n/).slice(1)
  .map(line => line.split(','))
  .filter(f => f.length >= 5 && !f[f.length - 3].startsWith('DUMMY'))
  .map(f => [f[f.length - 3].trim(), f[f.length - 4].trim()])
  .sort((a, b) => a[0].localeCompare(b[0]))
if (rows.length < 600) throw new Error(`Only ${rows.length} rows: the file layout may have changed`)

const today = new Date().toISOString().slice(0, 10)
writeFileSync('lib/portfolio/sectors.ts', [
  '/**',
  ' * NSE industry of each company in the NIFTY Total Market index.',
  ` * Source: ${url} (${today}).`,
  ' * Regenerate with scripts/update-sectors.mjs. The backtests and the live',
  ' * Monthly Plan both read this file, so they cap sectors the same way.',
  ' */',
  'export const SECTOR_BY_SYMBOL: Record<string, string> = {',
  ...rows.map(([symbol, industry]) => `  ${JSON.stringify(symbol)}: ${JSON.stringify(industry)},`),
  '}',
  '',
  '/** The sector of a stock, or undefined when NSE\'s list does not include it. */',
  'export const sectorOf = (symbol: string): string | undefined => SECTOR_BY_SYMBOL[symbol]',
  '',
].join('\n'))
console.log(`Wrote ${rows.length} symbols in ${new Set(rows.map(r => r[1])).size} industries`)
