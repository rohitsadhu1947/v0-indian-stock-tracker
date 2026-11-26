/**
 * The daily screen: every NIFTY 500 stock with its price facts and its rank
 * today in each Monthly Plan mode. Built from the nightly NSE data, so it
 * changes once a day.
 */
import { MODES, PORTFOLIO_RULES, type RiskMode } from '@/lib/portfolio/config'
import { dataFreshness, liveUniverse, loadBars } from '@/lib/portfolio/data'
import { rankByFactors } from '@/lib/portfolio/factors'
import { INDEX_MEMBERS } from '@/lib/portfolio/index-members'
import { SECTOR_BY_SYMBOL } from '@/lib/portfolio/sectors'
import { fundamentalFacts, type FundamentalFacts } from '@/lib/fundamentals/core'
import { latestResults } from '@/lib/fundamentals/service'
import { screenFacts, type ScreenFacts } from './core'

export interface ScreenRow extends ScreenFacts {
  symbol: string
  sector: string
  nifty100: boolean
  /** Rank today among the most traded stocks, by each mode's ranking. Missing when the stock cannot be ranked. */
  ranks: Partial<Record<RiskMode, number>>
  /** Latest quarterly result, when we have one for the stock. */
  results?: FundamentalFacts
}

export interface Screen {
  asOf: string
  /** How many stocks the ranks are out of. */
  ranked: number
  /** How many NIFTY 100 and NIFTY 500 stocks have quarterly results. */
  withResults: { nifty100: number; nifty500: number }
  rows: ScreenRow[]
}

const MODE_IDS = Object.keys(MODES) as RiskMode[]
let cached: Omit<Screen, 'withResults'> | null = null

const daysBefore = (iso: string, days: number) => new Date(new Date(iso + 'T00:00:00Z').getTime() - days * 86400000).toISOString().slice(0, 10)

/** The price screen is built once a day. Quarterly results are read on every call, so newly loaded ones show at once. */
export async function buildScreen(): Promise<Screen | null> {
  const prices = await buildPriceScreen()
  if (!prices) return null
  const results = await latestResults(prices.rows.map(r => r.symbol))
  const rows = prices.rows.map(r => {
    const result = results.get(r.symbol)
    return result ? { ...r, results: fundamentalFacts(result, r.close) } : r
  })
  const have = rows.filter(r => r.results)
  return { ...prices, rows, withResults: { nifty100: have.filter(r => r.nifty100).length, nifty500: have.length } }
}

async function buildPriceScreen(): Promise<Omit<Screen, 'withResults'> | null> {
  const { latestDate } = await dataFreshness()
  if (!latestDate) return null
  if (cached?.asOf === latestDate) return cached

  const members = INDEX_MEMBERS.NIFTY500 as readonly string[]
  const top100 = new Set<string>(INDEX_MEMBERS.NIFTY100)
  const universe = await liveUniverse(latestDate, PORTFOLIO_RULES.universeSize)
  const bars = await loadBars([...new Set([...members, ...universe])], daysBefore(latestDate, 420), latestDate)

  // Ranked the way the Monthly Plan ranks, but on today's data instead of the last month-end
  const universeBars = Object.fromEntries(universe.filter(s => bars[s]).map(s => [s, bars[s]]))
  const ranks: Record<string, Partial<Record<RiskMode, number>>> = {}
  let ranked = 0
  for (const mode of MODE_IDS) {
    const list = rankByFactors(universeBars, MODES[mode].factors)
    ranked = Math.max(ranked, list.length)
    list.forEach((r, i) => { (ranks[r.symbol] ??= {})[mode] = i + 1 })
  }

  const rows: ScreenRow[] = []
  for (const symbol of members) {
    const facts = bars[symbol] && screenFacts(bars[symbol])
    // A member with no bar on the latest session is suspended or renamed: leave it out
    if (!facts || facts.date !== latestDate) continue
    rows.push({ symbol, sector: SECTOR_BY_SYMBOL[symbol] ?? '', nifty100: top100.has(symbol), ranks: ranks[symbol] ?? {}, ...facts })
  }
  cached = { asOf: latestDate, ranked, rows }
  return cached
}
