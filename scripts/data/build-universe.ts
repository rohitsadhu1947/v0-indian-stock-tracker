/**
 * Build the point-in-time universe in the local store: for every month-end
 * since mid-2010, the 1,000 most traded stocks as known on that day.
 *
 *   npx tsx scripts/data/build-universe.ts
 */
import { buildSegments, loadRawSeries, loadSymbolMap } from '../../lib/market-data/series'
import { openStore } from '../../lib/market-data/store'
import { DEFAULT_UNIVERSE, monthEnds, universeAsOf, type LiquidityInput } from '../../lib/market-data/universe'

const db = openStore()
db.exec(`
  pragma synchronous = off;
  drop table if exists universe_monthly;
  create table universe_monthly (
    date integer not null, symbol text not null, rank integer not null, median_turnover real not null,
    primary key (date, symbol)
  ) without rowid;
`)

const calendar = (db.prepare('select distinct date from raw_bars order by date').all() as Array<{ date: number }>).map(r => r.date)
const stocks: LiquidityInput[] = []
for (const [symbol, segs] of buildSegments(db, loadSymbolMap(db))) {
  const bars = loadRawSeries(db, segs)
  if (bars.length >= DEFAULT_UNIVERSE.minBars) {
    stocks.push({ symbol, dates: bars.map(b => b.date), turnover: bars.map(b => b.value) })
  }
}

const ins = db.prepare('insert into universe_monthly (date, symbol, rank, median_turnover) values (?, ?, ?, ?)')
// The first usable month-end is the one with a full look-back window behind it
const dates = monthEnds(calendar).filter(d => calendar.indexOf(d) >= DEFAULT_UNIVERSE.windowSessions - 1)
db.exec('begin')
for (const date of dates) {
  for (const m of universeAsOf(stocks, calendar, date)) ins.run(date, m.symbol, m.rank, m.medianTurnover)
}
db.exec('commit')

const ever = (db.prepare('select count(distinct symbol) n from universe_monthly where rank <= 500').get() as { n: number }).n
const gone = (db.prepare(`select count(distinct u.symbol) n from universe_monthly u join securities s using (symbol)
  where u.rank <= 500 and s.last_date < ?`).get(calendar.at(-6)!) as { n: number }).n
console.log(`${dates.length} month-ends from ${dates[0]} to ${dates.at(-1)}. ` +
  `${ever} companies were ever in the top 500; ${gone} of them no longer trade.`)
db.close()
