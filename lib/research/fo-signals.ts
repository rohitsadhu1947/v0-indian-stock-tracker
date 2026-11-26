/**
 * F&O signals tested on cash stocks. Each rule reads one stock's F&O facts
 * at a close and says whether it fires. Pure functions.
 *
 * `expect` is the direction the usual market reading gives the signal. The
 * test measures what actually happened, in either direction.
 */

/** One stock's F&O facts at one close. NaN where a figure is not available. */
export interface FoFacts {
  /** The stock's close-to-close return on the day, as a fraction. */
  ret: number
  /** Change in futures open interest across all expiries, as a fraction of the day before. */
  oiChg: number
  /** Nearest future's close against the cash close, as a fraction. */
  basis: number
  /** Where that basis sits among all F&O stocks that day, 0 (lowest) to 1 (highest). */
  basisRank: number
  /** Calendar days to the nearest futures expiry. */
  daysToExpiry: number
  /** Futures contracts traded against the 20-day average. */
  futVolume: number
  /** Put open interest over call open interest, and how unusual that is for the stock (z-score on 60 days). */
  pcr: number
  pcrZ: number
  /** Call and put contracts traded against their own 20-day averages. */
  callVolume: number
  putVolume: number
  /** At-the-money call plus put, as a share of the strike, scaled to one day; and against its 10-day average. */
  impliedMove: number
  impliedMoveChg: number
  /** Cash close against the max pain strike of the nearest option expiry, as a fraction. */
  maxPainGap: number
  /** In the ban list today, and for the next session (the list comes out in the evening). */
  banToday: boolean
  banNext: boolean
}

export interface FoSignal {
  key: string
  label: string
  basis: string
  expect: 'up' | 'down'
  fires: (f: FoFacts) => boolean
}

const far = (f: FoFacts) => f.daysToExpiry >= 5

export const FO_SIGNALS: FoSignal[] = [
  // Controls: the price move alone, to show what open interest adds
  { key: 'price-up-only', expect: 'up', label: 'Control: price up, any open interest', basis: 'Price up 1.5% or more. No F&O condition.', fires: f => f.ret >= 0.015 },
  { key: 'price-down-only', expect: 'down', label: 'Control: price down, any open interest', basis: 'Price down 1.5% or more. No F&O condition.', fires: f => f.ret <= -0.015 },
  { key: 'long-buildup', expect: 'up', label: 'New longs', basis: 'Price up 1.5% or more with futures open interest up 5% or more.', fires: f => f.ret >= 0.015 && f.oiChg >= 0.05 },
  { key: 'short-buildup', expect: 'down', label: 'New shorts', basis: 'Price down 1.5% or more with open interest up 5% or more.', fires: f => f.ret <= -0.015 && f.oiChg >= 0.05 },
  { key: 'short-covering', expect: 'up', label: 'Short covering', basis: 'Price up 1.5% or more with open interest down 5% or more.', fires: f => f.ret >= 0.015 && f.oiChg <= -0.05 },
  { key: 'long-unwinding', expect: 'down', label: 'Long unwinding', basis: 'Price down 1.5% or more with open interest down 5% or more.', fires: f => f.ret <= -0.015 && f.oiChg <= -0.05 },
  { key: 'long-buildup-strong', expect: 'up', label: 'Strong new longs', basis: 'Price up 3% or more with open interest up 10% or more.', fires: f => f.ret >= 0.03 && f.oiChg >= 0.10 },
  { key: 'short-buildup-strong', expect: 'down', label: 'Strong new shorts', basis: 'Price down 3% or more with open interest up 10% or more.', fires: f => f.ret <= -0.03 && f.oiChg >= 0.10 },
  { key: 'oi-jump-flat', expect: 'up', label: 'Open interest jump, price flat', basis: 'Open interest up 10% or more while the price moved under 0.5%.', fires: f => Math.abs(f.ret) < 0.005 && f.oiChg >= 0.10 },
  { key: 'premium-high', expect: 'up', label: 'Futures at a high premium', basis: 'Futures premium in the top tenth of F&O stocks, five or more days before expiry.', fires: f => far(f) && f.basisRank >= 0.9 },
  { key: 'discount', expect: 'down', label: 'Futures at a discount', basis: 'Futures premium in the bottom tenth of F&O stocks, five or more days before expiry.', fires: f => far(f) && f.basisRank <= 0.1 },
  { key: 'futures-volume-up', expect: 'up', label: 'Heavy futures volume, price up', basis: 'Futures volume three times the usual with the price up 1% or more.', fires: f => f.futVolume >= 3 && f.ret >= 0.01 },
  { key: 'futures-volume-down', expect: 'down', label: 'Heavy futures volume, price down', basis: 'Futures volume three times the usual with the price down 1% or more.', fires: f => f.futVolume >= 3 && f.ret <= -0.01 },
  { key: 'pcr-high', expect: 'up', label: 'Put-call ratio unusually high', basis: 'Put-call ratio two standard deviations above the stock\'s own 60-day average.', fires: f => f.pcrZ >= 2 },
  { key: 'pcr-low', expect: 'down', label: 'Put-call ratio unusually low', basis: 'Put-call ratio two standard deviations below the stock\'s own 60-day average.', fires: f => f.pcrZ <= -2 },
  { key: 'call-volume-spike', expect: 'up', label: 'Call volume spike', basis: 'Call volume five times the usual and at least twice the day\'s put spike.', fires: f => f.callVolume >= 5 && f.callVolume >= 2 * f.putVolume },
  { key: 'put-volume-spike', expect: 'down', label: 'Put volume spike', basis: 'Put volume five times the usual and at least twice the day\'s call spike.', fires: f => f.putVolume >= 5 && f.putVolume >= 2 * f.callVolume },
  { key: 'options-dearer-flat', expect: 'up', label: 'Options dearer, price flat', basis: 'Option prices imply a move 25% bigger than their 10-day average while the price moved under 1%.', fires: f => f.impliedMoveChg >= 1.25 && Math.abs(f.ret) < 0.01 && far(f) },
  { key: 'above-max-pain', expect: 'down', label: 'Well above max pain near expiry', basis: 'Within four days of expiry, price 4% or more above the max pain strike.', fires: f => f.daysToExpiry >= 1 && f.daysToExpiry <= 4 && f.maxPainGap >= 0.04 },
  { key: 'below-max-pain', expect: 'up', label: 'Well below max pain near expiry', basis: 'Within four days of expiry, price 4% or more below the max pain strike.', fires: f => f.daysToExpiry >= 1 && f.daysToExpiry <= 4 && f.maxPainGap <= -0.04 },
  { key: 'ban-entry', expect: 'down', label: 'Enters the ban list', basis: 'Not in the ban list today, in it for the next session.', fires: f => !f.banToday && f.banNext },
  { key: 'ban-inside', expect: 'down', label: 'Stays in the ban list', basis: 'In the ban list today and for the next session.', fires: f => f.banToday && f.banNext },
  { key: 'ban-exit', expect: 'up', label: 'Leaves the ban list', basis: 'In the ban list today, out of it for the next session.', fires: f => f.banToday && !f.banNext },
]

/** Mean of the `window` values before index i (not including i). NaN until there are enough. */
export function trailingMean(xs: ArrayLike<number>, i: number, window: number): number {
  if (i < window) return NaN
  let sum = 0
  for (let j = i - window; j < i; j++) { if (!Number.isFinite(xs[j])) return NaN; sum += xs[j] }
  return sum / window
}

/** How many standard deviations xs[i] is from the mean of the `window` values before it. */
export function trailingZ(xs: ArrayLike<number>, i: number, window: number): number {
  const mean = trailingMean(xs, i, window)
  if (!Number.isFinite(mean) || !Number.isFinite(xs[i])) return NaN
  let sq = 0
  for (let j = i - window; j < i; j++) sq += (xs[j] - mean) ** 2
  const sd = Math.sqrt(sq / (window - 1))
  return sd > 0 ? (xs[i] - mean) / sd : NaN
}

/** Where xs[i] sits among the `window` values before it, 0 to 1. NaN until there are enough. */
export function trailingPercentile(xs: ArrayLike<number>, i: number, window: number): number {
  if (i < window || !Number.isFinite(xs[i])) return NaN
  let below = 0, counted = 0
  for (let j = i - window; j < i; j++) {
    if (!Number.isFinite(xs[j])) continue
    counted++
    if (xs[j] < xs[i]) below++
  }
  return counted >= window / 2 ? below / counted : NaN
}

/** Rank of each value within the list, 0 (lowest) to 1 (highest). NaN values keep NaN. */
export function crossRanks(values: number[]): number[] {
  const order = values.map((v, i) => ({ v, i })).filter(x => Number.isFinite(x.v)).sort((a, b) => a.v - b.v)
  const out = values.map(() => NaN)
  order.forEach((x, rank) => { out[x.i] = order.length > 1 ? rank / (order.length - 1) : 0.5 })
  return out
}
