/** Reads the split and bonus cautions for a list of stocks from the corporate actions table. */
import { db } from '@/db'
import { corporateActions } from '@/db/schema'
import { and, gte, inArray, lte, notInArray } from 'drizzle-orm'
import logger from '@/lib/logger'
import { CAUTION_DAYS_AHEAD, cautionFor, type Caution } from './caution'

const istToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10)

/** The caution on each stock that has one today. Never throws: a failure is logged and gives no cautions. */
export async function loadCautions(symbols: readonly string[], today: string = istToday()): Promise<Record<string, Caution>> {
  const out: Record<string, Caution> = {}
  const wanted = [...new Set(symbols)]
  if (!wanted.length) return out
  try {
    const rows = await db.select({ symbol: corporateActions.symbol, exDate: corporateActions.exDate, purposes: corporateActions.purposes })
      .from(corporateActions)
      .where(and(inArray(corporateActions.symbol, wanted), gte(corporateActions.exDate, addDays(today, -35)), lte(corporateActions.exDate, addDays(today, CAUTION_DAYS_AHEAD)), notInArray(corporateActions.status, ['expired', 'superseded'])))
    // When a stock has more than one, the one already past its ex-date matters most
    for (const r of rows.sort((a, b) => String(a.exDate).localeCompare(String(b.exDate)))) {
      const c = cautionFor(r.purposes ?? [], String(r.exDate), today)
      if (c && (!out[r.symbol] || out[r.symbol].phase === 'before')) out[r.symbol] ??= c
    }
  } catch (error: any) {
    logger.warn('Cautions could not be read', { error: String(error?.message ?? error).split('\n')[0] })
  }
  return out
}
