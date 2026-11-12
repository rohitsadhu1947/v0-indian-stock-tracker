/**
 * Freeze this month's picks for the live track record, as the nightly job does.
 *
 *   npx tsx --env-file=.env.local scripts/record-signals.ts
 *
 * Does nothing if the month is already recorded.
 */
import { recordMonthlySignals } from '@/lib/portfolio/signals'

recordMonthlySignals().then(result => {
  console.log(result.recorded.length
    ? `Recorded ${result.recorded.join(', ')} for ${result.signalDate}`
    : `Nothing to record (signal date ${result.signalDate ?? 'unknown'} is already saved, or there is no price history)`)
  process.exit(0)
}).catch(err => {
  console.error(err.message)
  process.exit(1)
})
