/**
 * Run the same NSE update the nightly cron runs, from this machine.
 *
 *   npx tsx --env-file=.env.local scripts/data/run-update.ts
 */
import { updateFromNseArchive } from '@/lib/market-data/daily-update'

updateFromNseArchive().then(summary => {
  for (const d of summary.days) {
    console.log(`${d.date}: ${d.bars} bars, ${d.newSymbols.length} new symbols, coverage ${d.checks.coveragePct}%` +
      (d.adjusted.length ? `, adjusted ${d.adjusted.map(a => `${a.symbol} x${a.factor.toFixed(4)}`).join(', ')}` : '') +
      (d.checks.bigMoves.length ? `\n   large moves: ${d.checks.bigMoves.join(', ')}` : ''))
  }
  for (const s of summary.skipped) console.log(`${s.date} skipped: ${s.reason}`)
  for (const r of summary.renamed) console.log(`renamed ${r.from} -> ${r.to}`)
  for (const p of summary.problems) console.log(`PROBLEM: ${p}`)
  console.log(`${summary.ok ? 'OK' : 'FAILED'}: prices current to ${summary.latestAfter} (was ${summary.latestBefore})`)
  process.exit(summary.ok ? 0 : 1)
})
