/**
 * Regenerate lib/portfolio/index-members.ts from NSE's member lists for
 * NIFTY 100 and NIFTY 500.
 *   node scripts/update-index-members.mjs
 * Run it when NSE rebalances the indices (March and September).
 */
import { writeFileSync } from 'fs'

const base = 'https://nsearchives.nseindia.com/content/indices/'
const lists = { NIFTY100: 'ind_nifty100list.csv', NIFTY500: 'ind_nifty500list.csv' }
const out = {}
for (const [key, file] of Object.entries(lists)) {
  const res = await fetch(base + file, { headers: { 'User-Agent': 'indian-stock-tracker/1.0 (personal research; daily archive files)' } })
  if (!res.ok) throw new Error(`NSE returned ${res.status} for ${file}`)
  // Company Name,Industry,Symbol,Series,ISIN Code. Read from the right: names can contain commas
  out[key] = (await res.text()).trim().split(/\r?\n/).slice(1)
    .map(line => line.split(',')).filter(f => f.length >= 5 && !f[f.length - 3].startsWith('DUMMY'))
    .map(f => f[f.length - 3].trim()).sort()
  const expected = key === 'NIFTY100' ? 100 : 500
  if (Math.abs(out[key].length - expected) > 5) throw new Error(`${file}: ${out[key].length} rows, expected about ${expected}`)
}

const today = new Date().toISOString().slice(0, 10)
writeFileSync('lib/portfolio/index-members.ts', [
  '/**',
  ' * Members of NIFTY 100 and NIFTY 500.',
  ` * Source: ${base} (${today}).`,
  ' * Regenerate with scripts/update-index-members.mjs.',
  ' */',
  'export const INDEX_MEMBERS = {',
  ...Object.entries(out).map(([key, symbols]) => `  ${key}: ${JSON.stringify(symbols)},`),
  '} as const',
  '',
  'export type IndexId = keyof typeof INDEX_MEMBERS',
  '',
].join('\n'))
console.log(Object.entries(out).map(([k, v]) => `${k}: ${v.length}`).join(', '))
