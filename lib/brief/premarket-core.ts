/**
 * What happened abroad since the last Indian close, and the opening gap it
 * usually goes with. Pure functions.
 *
 * The gap figures are averages from 2011 to 2026
 * (research/results/global-cues.json). They are context for the open. The
 * same research found these moves say nothing about the session after the
 * open, so nothing here is a signal.
 */

/** NIFTY's opening gap in percent: a base of +0.09 plus 0.30 for each 1% in the S&P 500. */
export const NIFTY_GAP = { base: 0.09, perUsPercent: 0.3 }
/** Share of an ADR's extra move that shows in the local stock's opening gap. */
export const ADR_GAP_SHARE: Record<string, number> = { INFY: 0.32, HDFCBANK: 0.24, ICICIBANK: 0.34, WIPRO: 0.21, DRREDDY: 0.26 }
/** A crude move this large is worth pointing out. */
export const CRUDE_NOTE_PCT = 3

export interface DailySeries { dates: string[]; closes: number[] }

export interface Move {
  /** Percent change from the last close before the Indian session to the latest price. */
  pct: number
  last: number
  /** The foreign session the latest price is from. */
  asOf: string
}

/**
 * Move of a foreign series since the last close India had seen: from its
 * last close dated before `indianSession` to its latest close. A US session
 * dated the same day as the Indian one ends hours after India closed, so it
 * is news for the next open.
 */
export function moveSince(series: DailySeries, indianSession: string): Move | null {
  const n = series.dates.length
  let base = -1
  for (let i = 0; i < n; i++) if (series.dates[i] < indianSession) base = i
  if (base < 0 || base === n - 1 || !(series.closes[base] > 0)) return null
  return { pct: (series.closes[n - 1] / series.closes[base] - 1) * 100, last: series.closes[n - 1], asOf: series.dates[n - 1] }
}

export const impliedNiftyGap = (usPct: number): number => NIFTY_GAP.base + NIFTY_GAP.perUsPercent * usPct

export interface AdrRow { symbol: string; adrPct: number; localPct: number; leadPct: number; impliedGapPct: number; asOf: string }

/** An ADR's move beyond what the local stock already did on its last session, and the gap that usually goes with it. */
export function adrRow(symbol: string, adr: Move, localLastDayPct: number): AdrRow {
  const lead = adr.pct - localLastDayPct
  return { symbol, adrPct: adr.pct, localPct: localLastDayPct, leadPct: lead, impliedGapPct: lead * (ADR_GAP_SHARE[symbol] ?? 0.25), asOf: adr.asOf }
}
