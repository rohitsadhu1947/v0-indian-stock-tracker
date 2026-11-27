/**
 * Build the research market from the local store (data/market.db): adjusted
 * series for every stock that was ever in the point-in-time universe, the
 * monthly universe lists, and the tracked indices.
 */
import type { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { deserialize, serialize } from 'v8'
import { applyAdjustments } from '@/lib/market-data/adjust'
import { INDEX_SERIES } from '@/lib/market-data/indices'
import { buildSegments, loadEvents, loadRawSeries, loadSymbolMap } from '@/lib/market-data/series'
import { openStore, STORE_PATH } from '@/lib/market-data/store'
import type { IndexSeries, Market, StockSeries } from './market'

export function loadMarket(db: DatabaseSync, universeSize = 1000): Market {
  const sessions = Int32Array.from(
    (db.prepare('select distinct date from raw_bars order by date').all() as Array<{ date: number }>).map(r => r.date))

  const universe = new Map<number, string[]>()
  const rows = db.prepare('select date, symbol from universe_monthly where rank <= ? order by date, rank')
    .all(universeSize) as Array<{ date: number; symbol: string }>
  for (const r of rows) {
    const list = universe.get(r.date) ?? []
    list.push(r.symbol)
    universe.set(r.date, list)
  }

  const symbolMap = loadSymbolMap(db)
  const segments = buildSegments(db, symbolMap)

  // Results dates are announced under the symbol in use at the time
  const resultsBySymbol = new Map<string, Set<number>>()
  for (const r of db.prepare('select symbol, date, first_seen from results_dates').all() as Array<{ symbol: string; date: number; first_seen: number }>) {
    const canonical = symbolMap.canonical(r.symbol, r.first_seen)
    if (!resultsBySymbol.has(canonical)) resultsBySymbol.set(canonical, new Set())
    resultsBySymbol.get(canonical)!.add(r.date)
  }
  const stocks = new Map<string, StockSeries>()
  for (const symbol of new Set(rows.map(r => r.symbol))) {
    const segs = segments.get(symbol)
    if (!segs) continue
    stocks.set(symbol, seriesFrom(symbol, applyAdjustments(loadRawSeries(db, segs), loadEvents(db, symbol)), resultsBySymbol.get(symbol)))
  }

  const indices = new Map<string, IndexSeries>()
  const indexQuery = db.prepare('select date, close from index_bars where lower(name) = lower(?)')
  for (const idx of INDEX_SERIES) {
    const byDate = new Map<number, number>()
    for (const name of idx.names) {
      for (const r of indexQuery.all(name) as Array<{ date: number; close: number }>) byDate.set(r.date, r.close)
    }
    const dates = [...byDate.keys()].sort((a, b) => a - b)
    indices.set(idx.barSymbol, { dates: Int32Array.from(dates), close: Float64Array.from(dates.map(d => byDate.get(d)!)) })
  }

  return { sessions, stocks, indices, universe, universeDates: Int32Array.from([...universe.keys()].sort((a, b) => a - b)) }
}

type Bars = ReturnType<typeof applyAdjustments<ReturnType<typeof loadRawSeries>[number]>>

function seriesFrom(symbol: string, bars: Bars, results?: Set<number>): StockSeries {
  return {
      symbol,
      dates: Int32Array.from(bars.map(b => b.date)),
      close: Float64Array.from(bars.map(b => b.close)),
      // Rupees traded / shares traded, on the adjusted basis, kept inside the day's range
      fill: Float64Array.from(bars.map(b => {
        const shares = b.volume * b.shareFactor
        const vwap = shares > 0 ? (b.value / shares) * b.priceFactor : b.close
        return Math.min(b.high, Math.max(b.low, vwap))
      })),
      open: Float64Array.from(bars.map(b => b.open)),
      high: Float64Array.from(bars.map(b => b.high)),
      low: Float64Array.from(bars.map(b => b.low)),
      turnover: Float64Array.from(bars.map(b => b.value)),
      // Delivered and traded quantities are on the same share basis, so the ratio needs no adjustment
      deliveryShare: Float64Array.from(bars.map(b => (b.delivQty != null && b.volume > 0 ? Math.min(1, (b.delivQty / b.shareFactor) / b.volume) : NaN))),
      dividendFactor: Float64Array.from(bars.map(b => b.totalReturnFactor / b.priceFactor)),
      resultsDates: Int32Array.from([...(results ?? [])].sort((a, b) => a - b)),
  }
}

/**
 * Adjusted series for exchange-traded funds, which the universe leaves out.
 * `symbols` are the names the funds trade under today.
 */
export function loadFunds(symbols: string[], storePath = STORE_PATH): Map<string, StockSeries> {
  const db = openStore(storePath)
  const segments = buildSegments(db, loadSymbolMap(db))
  const out = new Map<string, StockSeries>()
  for (const symbol of symbols) {
    const segs = segments.get(symbol)
    if (segs) out.set(symbol, seriesFrom(symbol, applyAdjustments(loadRawSeries(db, segs), loadEvents(db, symbol))))
  }
  db.close()
  return out
}

/** Bump when the shape of Market changes, so an old cache is not read. */
const CACHE_VERSION = 4

/**
 * loadMarket with a disk cache (data/cache), rebuilt whenever the store file
 * changes. Loading from the store takes a few minutes; the cache a few seconds.
 */
export function loadMarketCached(storePath = STORE_PATH, universeSize = 1000): Market {
  const stamp = statSync(storePath)
  const file = `data/cache/market-v${CACHE_VERSION}-${universeSize}-${Math.floor(stamp.mtimeMs)}-${stamp.size}.v8`
  if (existsSync(file)) return deserialize(readFileSync(file)) as Market
  const db = openStore(storePath)
  const market = loadMarket(db, universeSize)
  db.close()
  mkdirSync('data/cache', { recursive: true })
  for (const old of readdirSync('data/cache')) if (old.startsWith('market-')) rmSync(`data/cache/${old}`)
  writeFileSync(file, serialize(market))
  return market
}
