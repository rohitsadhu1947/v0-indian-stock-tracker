/**
 * Freeze each mode's month-end picks, and read the live track record built
 * from them.
 *
 * Recording is idempotent and needs no user: the nightly market-data job
 * calls it, and it writes a row per mode the first time it runs after a
 * month-end. A row is never updated, so the record cannot be improved by
 * later price corrections or by rerunning the ranking with hindsight.
 */
import { db } from '@/db'
import { dailyBars, monthlySignals } from '@/db/schema'
import { and, asc, desc, eq, gte, inArray, lt } from 'drizzle-orm'
import { MODES, PORTFOLIO_RULES, INDEX_INSTRUMENTS, type RiskMode } from './config'
import { loadBars, liveUniverse, signalDate } from './data'
import { rankByFactors, selectWithBuffer, type FactorRanked } from './factors'
import type { DailyBar } from './momentum'
import { trendRegime, type TrendRegime } from './regime'
import { sectorOf } from './sectors'
import { marketFromBars, modeRecord, type FrozenSignal, type ModeRecord } from './track-record-core'

const BENCHMARKS = ['IDX:NIFTY 500', 'IDX:NIFTY500 EW']
const toInt = (iso: string) => Number(iso.replaceAll('-', ''))

function daysBefore(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

export interface RankingInputs {
  universe: string[]
  bars: Record<string, DailyBar[]>
  regime: TrendRegime | null
}

/** Everything a mode's ranking needs as of a signal date: the universe, its bars and the market trend. */
export async function rankingInputs(asOf: string): Promise<RankingInputs> {
  const since = daysBefore(asOf, 420)
  const [indexBars, universe] = await Promise.all([
    loadBars([INDEX_INSTRUMENTS.NIFTY_200.barSymbol], since, asOf),
    liveUniverse(asOf, PORTFOLIO_RULES.universeSize),
  ])
  return {
    universe,
    bars: await loadBars(universe, since, asOf),
    regime: trendRegime(indexBars[INDEX_INSTRUMENTS.NIFTY_200.barSymbol] ?? []),
  }
}

/** The model's picks for a mode: the top names within the sector limit, keeping previous picks still inside the exit rank. */
export function modelPicks(ranked: FactorRanked[], previousPicks: string[]): string[] {
  return selectWithBuffer(ranked, previousPicks, PORTFOLIO_RULES.topN, PORTFOLIO_RULES.exitRank, undefined, SECTOR_CAP)
}

/** The sector limit every mode applies, as backtested. */
export const SECTOR_CAP = { groupOf: sectorOf, max: PORTFOLIO_RULES.maxPerSector }

/**
 * Record this month's picks for every mode that has none yet. Returns the
 * modes written (empty when already recorded or there is no price history).
 */
export async function recordMonthlySignals(): Promise<{ signalDate: string | null; recorded: RiskMode[] }> {
  const asOf = await signalDate()
  if (!asOf) return { signalDate: null, recorded: [] }

  const existing = await db.select({ mode: monthlySignals.mode }).from(monthlySignals).where(eq(monthlySignals.signalDate, asOf))
  const missing = (Object.keys(MODES) as RiskMode[]).filter(m => !existing.some(e => e.mode === m))
  if (!missing.length) return { signalDate: asOf, recorded: [] }

  const inputs = await rankingInputs(asOf)
  if (!inputs.universe.length) return { signalDate: asOf, recorded: [] }

  const recorded: RiskMode[] = []
  for (const mode of missing) {
    const [previous] = await db.select({ picks: monthlySignals.picks }).from(monthlySignals)
      .where(and(eq(monthlySignals.mode, mode), lt(monthlySignals.signalDate, asOf)))
      .orderBy(desc(monthlySignals.signalDate)).limit(1)
    const ranked = rankByFactors(inputs.bars, MODES[mode].factors)
    if (ranked.length < PORTFOLIO_RULES.topN) continue // not enough clean data to stand behind a pick list
    const rankOf = new Map(ranked.map((r, i) => [r.symbol, { rank: i + 1, scorePct: r.score * 100, close: r.lastClose }]))
    const picks = modelPicks(ranked, previous?.picks.map(p => p.symbol) ?? [])
      .map(symbol => ({ symbol, ...rankOf.get(symbol)! }))
      .sort((a, b) => a.rank - b.rank)

    const inserted = await db.insert(monthlySignals).values({
      mode, signalDate: asOf, picks,
      trendInvested: inputs.regime?.invested ?? false,
      universeSize: inputs.universe.length, rankedCount: ranked.length,
    }).onConflictDoNothing().returning({ id: monthlySignals.id })
    if (inserted.length) recorded.push(mode)
  }
  return { signalDate: asOf, recorded }
}

export interface TrackRecord {
  modes: Partial<Record<RiskMode, ModeRecord & {
    /** Date each signal was written, to show any that were recorded after the fact. */
    recorded: Array<{ signalDate: string; recordedAt: string }>
  }>>
  benchmarks: string[]
}

/** The live record of every mode, replayed from the frozen signals on current prices. */
export async function loadTrackRecord(): Promise<TrackRecord> {
  const rows = await db.select().from(monthlySignals).orderBy(asc(monthlySignals.signalDate))
  if (!rows.length) return { modes: {}, benchmarks: BENCHMARKS }

  const first = String(rows[0].signalDate)
  const symbols = [...new Set(rows.flatMap(r => r.picks.map(p => p.symbol)))]
  const since = daysBefore(first, 10)
  const select = { symbol: dailyBars.symbol, date: dailyBars.date, low: dailyBars.low, high: dailyBars.high, close: dailyBars.close, volume: dailyBars.volume, turnover: dailyBars.turnover }
  const [stockRows, indexRows] = await Promise.all([
    db.select(select).from(dailyBars).where(and(inArray(dailyBars.symbol, symbols), gte(dailyBars.date, since))),
    db.select(select).from(dailyBars).where(and(inArray(dailyBars.symbol, [INDEX_INSTRUMENTS.NIFTY_50.barSymbol, ...BENCHMARKS]), gte(dailyBars.date, since))),
  ])
  const market = marketFromBars(
    stockRows.map(r => ({ ...r, date: toInt(String(r.date)) })),
    indexRows.map(r => ({ symbol: r.symbol, date: toInt(String(r.date)), close: r.close })),
    INDEX_INSTRUMENTS.NIFTY_50.barSymbol,
  )

  const modes: TrackRecord['modes'] = {}
  for (const mode of Object.keys(MODES) as RiskMode[]) {
    const mine = rows.filter(r => r.mode === mode)
    const signals: FrozenSignal[] = mine.map(r => ({
      signalDate: toInt(String(r.signalDate)), picks: r.picks.map(p => p.symbol), trendInvested: r.trendInvested,
    }))
    const record = modeRecord(market, signals, BENCHMARKS)
    if (record) {
      modes[mode] = {
        ...record,
        recorded: mine.map(r => ({ signalDate: String(r.signalDate), recordedAt: r.recordedAt.toISOString().slice(0, 10) })),
      }
    }
  }
  return { modes, benchmarks: BENCHMARKS }
}
