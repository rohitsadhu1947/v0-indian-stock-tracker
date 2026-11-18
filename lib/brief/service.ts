/** Gathers what the morning brief needs: the screen, index closes, the paper book and filings since the close. */
import { db } from '@/db'
import { filings, modelPortfolios } from '@/db/schema'
import { and, desc, eq, gt, inArray, isNotNull, lte } from 'drizzle-orm'
import { MATERIAL } from '@/lib/filings/categories'
import { loadBars } from '@/lib/portfolio/data'
import { buildScreen } from '@/lib/screener/service'
import { buildBrief, indexMove, type Brief, type BriefFiling, type IndexMove } from './core'

const INDICES = [
  ['NIFTY 50', 'IDX:NIFTY 50'], ['NIFTY NEXT 50', 'IDX:NIFTY NEXT 50'], ['NIFTY 500', 'IDX:NIFTY 500'],
  ['NIFTY MIDCAP 150', 'IDX:NIFTY MIDCAP 150'], ['NIFTY SMALLCAP 250', 'IDX:NIFTY SMLCAP 250'], ['INDIA VIX', 'IDX:INDIA VIX'],
] as const

const daysBefore = (iso: string, days: number) => new Date(new Date(iso + 'T00:00:00Z').getTime() - days * 86400000).toISOString().slice(0, 10)

/** Material filings in the 500 most traded stocks since the session closed. Null when the table is not there. */
async function filingsSince(asOf: string): Promise<BriefFiling[] | null> {
  try {
    const rows = await db.select().from(filings)
      .where(and(gt(filings.publishedAt, new Date(`${asOf}T15:30:00+05:30`)), isNotNull(filings.symbol), lte(filings.rank, 500),
        inArray(filings.category, [...MATERIAL])))
      .orderBy(desc(filings.publishedAt)).limit(80)
    return rows.map(r => ({ symbol: r.symbol!, category: r.category, text: r.text, url: r.url, publishedAt: r.publishedAt.toISOString(), rank: r.rank }))
  } catch {
    return null
  }
}

export async function morningBrief(userId: number): Promise<Brief | null> {
  const screen = await buildScreen()
  if (!screen) return null
  const [indexBars, [book], recent] = await Promise.all([
    loadBars(INDICES.map(i => i[1]), daysBefore(screen.asOf, 20), screen.asOf),
    db.select({ holdings: modelPortfolios.holdings }).from(modelPortfolios).where(eq(modelPortfolios.userId, userId)).limit(1),
    filingsSince(screen.asOf),
  ])
  const indices = INDICES
    .map(([name, symbol]) => indexMove(name, (indexBars[symbol] ?? []).map(b => b.close)))
    .filter((i): i is IndexMove => i !== null)
  return buildBrief({ asOf: screen.asOf, rows: screen.rows, indices, held: Object.keys((book?.holdings as object) ?? {}), filings: recent })
}
