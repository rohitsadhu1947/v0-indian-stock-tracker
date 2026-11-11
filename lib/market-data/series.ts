/**
 * One continuous series per company from the local store.
 *
 * NSE renames symbols (INFOSYSTCH became INFY, ZOMATO became ETERNAL). A
 * company's history is the bars under each of its symbols, keyed by the
 * latest one (the "canonical" symbol).
 */
import type { DatabaseSync } from 'node:sqlite'
import { applyAdjustments, type AdjustedBar, type AdjustmentEvent, type RawPriceBar } from './adjust'

export interface SymbolChangeRow { old_symbol: string; new_symbol: string; effective_date: number }

export interface Segment { symbol: string; from: number; to: number } // dates inclusive

export class SymbolMap {
  private byOld = new Map<string, SymbolChangeRow[]>()

  constructor(changes: SymbolChangeRow[]) {
    for (const c of changes) {
      const list = this.byOld.get(c.old_symbol) ?? []
      list.push(c)
      this.byOld.set(c.old_symbol, list)
    }
    for (const list of this.byOld.values()) list.sort((a, b) => a.effective_date - b.effective_date)
  }

  /** The symbol this company trades under today, for a bar traded as `symbol` on `date`. */
  canonical(symbol: string, date: number): string {
    let s = symbol, d = date
    for (let hops = 0; hops < 10; hops++) {
      // A symbol can be reused by another company later, so only follow a
      // rename that happened after this bar
      const next = this.byOld.get(s)?.find(c => c.effective_date > d)
      if (!next) break
      s = next.new_symbol
      d = next.effective_date
    }
    return s
  }

  /** Dates on which a symbol stopped being used, oldest first. */
  renameDates(symbol: string): number[] {
    return (this.byOld.get(symbol) ?? []).map(c => c.effective_date)
  }
}

export function loadSymbolMap(db: DatabaseSync): SymbolMap {
  return new SymbolMap(db.prepare('select old_symbol, new_symbol, effective_date from symbol_changes').all() as unknown as SymbolChangeRow[])
}

/**
 * Every company in the store as canonical symbol -> the (symbol, date range)
 * pieces that make up its history.
 */
export function buildSegments(db: DatabaseSync, map: SymbolMap): Map<string, Segment[]> {
  const spans = db.prepare('select symbol, min(date) first, max(date) last from raw_bars group by symbol')
    .all() as Array<{ symbol: string; first: number; last: number }>
  const out = new Map<string, Segment[]>()
  for (const { symbol, first, last } of spans) {
    // Split the symbol's life at each rename so every piece maps to one company
    const cuts = map.renameDates(symbol).filter(d => d > first && d <= last)
    const edges = [first, ...cuts]
    for (let i = 0; i < edges.length; i++) {
      const from = edges[i]
      const to = i + 1 < edges.length ? edges[i + 1] - 1 : last
      const canon = map.canonical(symbol, from)
      out.set(canon, [...(out.get(canon) ?? []), { symbol, from, to }])
    }
  }
  for (const segs of out.values()) segs.sort((a, b) => a.from - b.from)
  return out
}

export interface StoredBar extends RawPriceBar { delivQty: number | null }

export function loadRawSeries(db: DatabaseSync, segments: Segment[]): StoredBar[] {
  const q = db.prepare(`select date, open, high, low, close, volume, value, deliv_qty as delivQty
    from raw_bars where symbol = ? and date between ? and ? order by date`)
  const byDate = new Map<number, StoredBar>()
  // Later segments win if two symbols overlap on a date
  for (const s of segments) for (const b of q.all(s.symbol, s.from, s.to) as unknown as StoredBar[]) byDate.set(b.date, b)
  return [...byDate.values()].sort((a, b) => a.date - b.date)
}

export function loadActions(db: DatabaseSync, segments: Segment[]): Map<number, string[]> {
  const q = db.prepare('select ex_date, purpose from corporate_actions_raw where symbol = ? and ex_date between ? and ?')
  const out = new Map<number, string[]>()
  for (const s of segments) {
    // An action is announced under the symbol in use at the time; allow the
    // ex-date to fall just after a rename
    for (const r of q.all(s.symbol, s.from, s.to + 15) as Array<{ ex_date: number; purpose: string }>) {
      const list = out.get(r.ex_date) ?? []
      if (!list.includes(r.purpose)) list.push(r.purpose)
      out.set(r.ex_date, list)
    }
  }
  return out
}

export function loadEvents(db: DatabaseSync, canonical: string): AdjustmentEvent[] {
  const rows = db.prepare(`select ex_date, status, price_factor, share_factor, dividend, purposes, note
    from adjustment_events where symbol = ? order by ex_date`).all(canonical) as any[]
  return rows.map(r => ({
    exDate: r.ex_date, status: r.status, priceFactor: r.price_factor, shareFactor: r.share_factor,
    dividend: r.dividend, purposes: JSON.parse(r.purposes), note: r.note ?? undefined,
  }))
}

/** Adjusted bars for one company, using the events resolved by build-adjustments. */
export function loadAdjustedSeries(db: DatabaseSync, canonical: string, segments: Segment[]): AdjustedBar[] {
  return applyAdjustments(loadRawSeries(db, segments), loadEvents(db, canonical))
}
