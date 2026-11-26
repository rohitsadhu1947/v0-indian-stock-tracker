/**
 * Reads the latest quarterly result of each stock from the app database.
 */
import { db } from '@/db'
import { quarterlyResults } from '@/db/schema'
import { desc, inArray } from 'drizzle-orm'
import logger from '@/lib/logger'
import type { Basis, QuarterResult } from './core'

/** Latest result for each symbol that has one. Empty when the table is missing or cannot be read. */
export async function latestResults(symbols: string[]): Promise<Map<string, QuarterResult>> {
  const out = new Map<string, QuarterResult>()
  if (!symbols.length) return out
  try {
    const rows = await db
      .selectDistinctOn([quarterlyResults.symbol])
      .from(quarterlyResults)
      .where(inArray(quarterlyResults.symbol, symbols))
      .orderBy(quarterlyResults.symbol, desc(quarterlyResults.filedAt))
    for (const r of rows) {
      out.set(r.symbol, {
        symbol: r.symbol, quarter: r.quarter, periodLabel: r.periodLabel, filedAt: r.filedAt.toISOString(), basis: r.basis as Basis,
        revenueCr: r.revenueCr, revenueYoyPct: r.revenueYoyPct, operatingProfitCr: r.operatingProfitCr,
        patCr: r.patCr, patYoyPct: r.patYoyPct, eps: r.eps, epsTtm: r.epsTtm, summary: r.summary,
      })
    }
  } catch (error: any) {
    logger.warn('Quarterly results could not be read', { error: String(error.cause?.message ?? error.message).split('\n')[0] })
  }
  return out
}
