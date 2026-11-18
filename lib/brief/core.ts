/**
 * The morning brief: what happened in the market on the last session and
 * what companies have filed since, put together from our own data. Pure
 * functions. It reports; it does not recommend.
 */
import type { ScreenRow } from '@/lib/screener/service'

export interface IndexMove { name: string; close: number; dayPct: number | null; weekPct: number | null }
export interface BriefFiling { symbol: string; category: string; text: string; url: string; publishedAt: string; rank: number | null }
export interface Mover { symbol: string; sector: string; dayPct: number; weekPct: number | null; close: number }
export interface SectorMove { sector: string; stocks: number; dayPct: number; weekPct: number; rising: number }

export interface Brief {
  /** The session the market figures are for. */
  asOf: string
  summary: string[]
  indices: IndexMove[]
  breadth: { stocks: number; rose: number; fell: number; uptrend: number; downtrend: number; atHigh: number; heavyVolume: number }
  sectors: SectorMove[]
  gainers: Mover[]
  losers: Mover[]
  atHigh: string[]
  heavyVolume: Array<Mover & { volumeRatio: number }>
  /** Holdings in the user's paper book, biggest move first. */
  book: Mover[]
  /** Material filings since the session closed, newest first. `held` marks the user's holdings. */
  filings: Array<BriefFiling & { held: boolean }>
  /** False when filings are not being collected into the app's database yet. */
  filingsAvailable: boolean
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const signed = (n: number, d = 1) => `${n >= 0 ? '+' : ''}${n.toFixed(d)}%`
const mover = (r: ScreenRow): Mover => ({ symbol: r.symbol, sector: r.sector, dayPct: r.dayPct ?? 0, weekPct: r.weekPct, close: r.close })

/** Index moves from each index's recent closes (oldest first). */
export function indexMove(name: string, closes: number[]): IndexMove | null {
  const n = closes.length
  if (!n) return null
  const pct = (back: number) => (n > back && closes[n - 1 - back] > 0 ? (closes[n - 1] / closes[n - 1 - back] - 1) * 100 : null)
  return { name, close: closes[n - 1], dayPct: pct(1), weekPct: pct(5) }
}

export function buildBrief(input: {
  asOf: string
  rows: ScreenRow[]
  indices: IndexMove[]
  held: string[]
  filings: BriefFiling[] | null
}): Brief {
  const rows = input.rows.filter(r => r.dayPct != null)
  const held = new Set(input.held)
  const byDay = rows.slice().sort((a, b) => b.dayPct! - a.dayPct!)

  const bySector = new Map<string, ScreenRow[]>()
  for (const r of rows) if (r.sector) bySector.set(r.sector, [...(bySector.get(r.sector) ?? []), r])
  const sectors: SectorMove[] = [...bySector.entries()]
    .filter(([, list]) => list.length >= 5)
    .map(([sector, list]) => ({
      sector, stocks: list.length,
      dayPct: mean(list.map(r => r.dayPct!)), weekPct: mean(list.map(r => r.weekPct ?? 0)),
      rising: list.filter(r => r.dayPct! > 0).length,
    }))
    .sort((a, b) => b.dayPct - a.dayPct)

  const breadth = {
    stocks: rows.length,
    rose: rows.filter(r => r.dayPct! > 0).length,
    fell: rows.filter(r => r.dayPct! < 0).length,
    uptrend: rows.filter(r => r.trend === 'up').length,
    downtrend: rows.filter(r => r.trend === 'down').length,
    atHigh: rows.filter(r => r.belowHighPct != null && r.belowHighPct < 0.05).length,
    heavyVolume: rows.filter(r => (r.volumeRatio ?? 0) >= 3).length,
  }

  const summary: string[] = []
  const main = input.indices.find(i => i.name === 'NIFTY 500') ?? input.indices[0]
  if (main?.dayPct != null) {
    summary.push(`${main.name} ${main.dayPct >= 0 ? 'rose' : 'fell'} ${Math.abs(main.dayPct).toFixed(1)}% on ${input.asOf}${main.weekPct != null ? ` and is ${signed(main.weekPct)} over five sessions` : ''}.`)
  }
  if (breadth.stocks) {
    summary.push(`${breadth.rose} of ${breadth.stocks} NIFTY 500 stocks rose and ${breadth.fell} fell. ${Math.round(breadth.uptrend / breadth.stocks * 100)}% are above both their 50-day and 200-day averages.`)
  }
  if (sectors.length >= 2) {
    const best = sectors[0], worst = sectors[sectors.length - 1]
    summary.push(`Strongest sector: ${best.sector} (${signed(best.dayPct)} on average). Weakest: ${worst.sector} (${signed(worst.dayPct)}).`)
  }
  const filings = (input.filings ?? []).map(f => ({ ...f, held: held.has(f.symbol) }))
  const heldFilings = filings.filter(f => f.held)
  if (heldFilings.length) summary.push(`${[...new Set(heldFilings.map(f => f.symbol))].join(', ')} in your paper book ${heldFilings.length === 1 ? 'has a new filing' : 'have new filings'}.`)

  return {
    asOf: input.asOf,
    summary,
    indices: input.indices,
    breadth,
    sectors,
    gainers: byDay.slice(0, 8).map(mover),
    losers: byDay.slice(-8).reverse().map(mover),
    atHigh: rows.filter(r => r.belowHighPct != null && r.belowHighPct < 0.05).map(r => r.symbol).sort(),
    heavyVolume: rows.filter(r => (r.volumeRatio ?? 0) >= 3).sort((a, b) => b.volumeRatio! - a.volumeRatio!).slice(0, 12)
      .map(r => ({ ...mover(r), volumeRatio: r.volumeRatio! })),
    book: rows.filter(r => held.has(r.symbol)).sort((a, b) => Math.abs(b.dayPct!) - Math.abs(a.dayPct!)).map(mover),
    filings,
    filingsAvailable: input.filings !== null,
  }
}
