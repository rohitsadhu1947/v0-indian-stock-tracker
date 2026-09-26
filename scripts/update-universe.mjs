/**
 * Regenerate lib/portfolio/universe.ts from NSE's published NIFTY 500 list.
 *   node scripts/update-universe.mjs
 * NSE blocks many datacenter IPs; run this from a home/office connection.
 */
import { writeFileSync } from 'fs'

const url = 'https://archives.nseindia.com/content/indices/ind_nifty500list.csv'
const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36' } })
if (!res.ok) throw new Error(`NSE returned ${res.status}`)
const lines = (await res.text()).trim().split('\n').slice(1)
const rows = lines.map(l => l.split(',')).filter(c => c[3]?.trim() === 'EQ' && !c[2].startsWith('DUMMY'))
const today = new Date().toISOString().slice(0, 10)
const body = [
  '/**',
  ' * NIFTY 500 constituents: universe for the stock-momentum sleeve.',
  ` * Source: ${url} (${today}).`,
  ' * Regenerate with scripts/update-universe.mjs when NSE rebalances (semi-annually).',
  ' */',
  'export interface UniverseStock { symbol: string; industry: string }',
  '',
  'export const NIFTY_500: UniverseStock[] = [',
  ...rows.map(c => `  { symbol: ${JSON.stringify(c[2].trim())}, industry: ${JSON.stringify(c[1].trim())} },`),
  ']',
  '',
  'export const UNIVERSE_SYMBOLS = NIFTY_500.map(s => s.symbol)',
  '',
  'export const INDUSTRY_BY_SYMBOL: Record<string, string> = Object.fromEntries(',
  '  NIFTY_500.map(s => [s.symbol, s.industry])',
  ')',
  '',
].join('\n')
writeFileSync('lib/portfolio/universe.ts', body)
console.log(`Wrote ${rows.length} symbols`)
