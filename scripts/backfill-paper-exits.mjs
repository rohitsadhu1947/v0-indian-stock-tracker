/**
 * Reconstruct exits for paper positions left open because nothing was
 * checking stops/targets.
 *
 * Walks Kite daily bars forward from the entry date and closes the position on
 * the first bar that touched a level:
 *   - stop before target when a single bar touched both (conservative)
 *   - fill at the bar open when the day gapped through the level
 *
 * Usage:
 *   node --env-file=.env.local scripts/backfill-paper-exits.mjs          # dry run
 *   node --env-file=.env.local scripts/backfill-paper-exits.mjs --apply  # write
 */

import postgres from 'postgres'
import { KiteConnect } from 'kiteconnect'

const APPLY = process.argv.includes('--apply')
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 })

const isShort = (t) => ['SHORT', 'SELL'].includes((t || '').toUpperCase())

/** First bar that touched a level; null if still running. */
function findExit(bars, position) {
  const short = isShort(position.position_type)
  const { stop_loss: stop, target1: t1, target2: t2 } = position

  for (const bar of bars) {
    // Stop first: we cannot see intrabar order, so assume the worst.
    if (stop != null) {
      const touched = short ? bar.high >= stop : bar.low <= stop
      if (touched) {
        const gapped = short ? bar.open >= stop : bar.open <= stop
        return { reason: 'STOP_LOSS', price: gapped ? bar.open : stop, date: bar.date }
      }
    }
    for (const [level, reason] of [[t2, 'TARGET_2'], [t1, 'TARGET_1']]) {
      if (level == null) continue
      const touched = short ? bar.low <= level : bar.high >= level
      if (touched) {
        const gapped = short ? bar.open <= level : bar.open >= level
        return { reason, price: gapped ? bar.open : level, date: bar.date }
      }
    }
  }
  return null
}

const [admin] = await sql`
  select master_kite_token from users
  where role='admin' and master_kite_token is not null
  order by last_login desc limit 1`

if (!admin?.master_kite_token) {
  console.error('No Kite token available — log in with Kite first.')
  process.exit(1)
}

const kc = new KiteConnect({ api_key: process.env.KITE_API_KEY })
kc.setAccessToken(admin.master_kite_token)

const instruments = await kc.getInstruments(['NSE'])
const tokenFor = new Map(
  instruments.filter(i => i.instrument_type === 'EQ').map(i => [i.tradingsymbol, i.instrument_token])
)

const open = await sql`
  select id, user_id, symbol, exchange, position_type, entry_price, quantity,
         stop_loss, target1, target2, entry_time, strategy, created_at
  from paper_positions where status='open' order by entry_time`

console.log(`${open.length} open positions\n`)

const plans = []
for (const p of open) {
  const token = tokenFor.get(p.symbol)
  if (!token) {
    console.log(`${p.symbol.padEnd(12)} SKIP — no NSE instrument token`)
    continue
  }

  const from = new Date(p.entry_time)
  from.setDate(from.getDate() + 1) // exits can only happen after entry day
  const bars = (await kc.getHistoricalData(token, 'day', from, new Date()))
    .map(b => ({ ...b, date: new Date(b.date) }))

  const exit = findExit(bars, p)
  const dir = isShort(p.position_type) ? -1 : 1

  if (!exit) {
    const last = bars.at(-1)
    console.log(`${p.symbol.padEnd(12)} STILL OPEN after ${bars.length} bars (last ₹${last?.close})`)
    continue
  }

  const pnlPercent = ((exit.price - p.entry_price) / p.entry_price) * 100 * dir
  const pnl = (exit.price - p.entry_price) * p.quantity * dir
  const days = Math.round((exit.date - new Date(p.entry_time)) / 86400000)

  console.log(
    `${p.symbol.padEnd(12)} ${exit.reason.padEnd(9)} @ ₹${exit.price.toFixed(2)} on ${exit.date.toISOString().slice(0, 10)}` +
    ` (${days}d) → ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%  ₹${pnl.toFixed(0)}`
  )
  plans.push({ p, exit, pnl, pnlPercent, days })
}

if (!APPLY) {
  console.log(`\nDry run. ${plans.length} would be closed. Re-run with --apply to write.`)
  await sql.end()
  process.exit(0)
}

for (const { p, exit, pnl, pnlPercent } of plans) {
  const entryTime = new Date(p.entry_time)
  await sql.begin(async (tx) => {
    await tx`
      update paper_positions set
        status='closed', exit_price=${exit.price}, current_price=${exit.price},
        exit_time=${exit.date}, exit_reason=${exit.reason.toLowerCase().replace('_', ' ')},
        pnl=${pnl}, pnl_percent=${pnlPercent},
        notes=${'Backfilled from historical bars (exit was never checked)'},
        updated_at=now()
      where id=${p.id}`
    await tx`
      insert into trade_history
        (user_id, position_id, source, symbol, exchange, entry_price, exit_price,
         quantity, pnl, pnl_percent, strategy, exit_reason, entry_time, exit_time, duration)
      values
        (${p.user_id}, ${p.id}, 'paper', ${p.symbol}, ${p.exchange}, ${p.entry_price}, ${exit.price},
         ${p.quantity}, ${pnl}, ${pnlPercent}, ${p.strategy}, ${exit.reason.toLowerCase()},
         ${entryTime}, ${exit.date}, ${Math.floor((exit.date - entryTime) / 60000)})`
  })
  console.log(`✅ closed #${p.id} ${p.symbol}`)
}

await sql.end()
