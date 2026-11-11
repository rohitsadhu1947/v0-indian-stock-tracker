/**
 * Performance statistics for an equity curve, and comparison with a
 * benchmark. Returns are in percent; nothing here is a forecast.
 */
import { lastAtOrBefore, yearsBetween } from './dates'

export interface Curve {
  dates: number[]
  equity: number[]
}

export interface PeriodStats {
  from: number
  to: number
  cagrPct: number
  volatilityPct: number        // annualised, from daily returns
  sharpe: number               // excess over cash, per unit of volatility
  maxDrawdownPct: number       // negative
  drawdownFrom: number
  drawdownTo: number
  worstYearPct: number
  bestYearPct: number
}

/** The part of a curve from `from` (inclusive) to `to` (inclusive), starting at the last point on or before `from`. */
export function slice(curve: Curve, from: number, to = Infinity): Curve {
  const start = Math.max(0, lastAtOrBefore(curve.dates, from))
  const end = to === Infinity ? curve.dates.length - 1 : lastAtOrBefore(curve.dates, to)
  return { dates: curve.dates.slice(start, end + 1), equity: curve.equity.slice(start, end + 1) }
}

export function calendarYearReturns(curve: Curve): Record<number, number> {
  const out: Record<number, number> = {}
  let yearStart = curve.equity[0]
  for (let i = 1; i <= curve.dates.length; i++) {
    const year = Math.floor(curve.dates[i - 1] / 10000)
    if (i === curve.dates.length || Math.floor(curve.dates[i] / 10000) !== year) {
      out[year] = (curve.equity[i - 1] / yearStart - 1) * 100
      yearStart = curve.equity[i - 1]
    }
  }
  return out
}

export function periodStats(curve: Curve, cashYield = 0.06): PeriodStats {
  const { dates, equity } = curve
  const n = dates.length
  const years = yearsBetween(dates[0], dates[n - 1])
  const cagr = (equity[n - 1] / equity[0]) ** (1 / years) - 1

  let sum = 0, sumSq = 0
  for (let i = 1; i < n; i++) {
    const r = equity[i] / equity[i - 1] - 1
    sum += r
    sumSq += r * r
  }
  const mean = sum / (n - 1)
  const perYear = (n - 1) / years
  const vol = Math.sqrt(Math.max(0, sumSq / (n - 1) - mean * mean) * perYear)

  let peak = equity[0], peakDate = dates[0], maxDd = 0, ddFrom = dates[0], ddTo = dates[0]
  for (let i = 1; i < n; i++) {
    if (equity[i] > peak) { peak = equity[i]; peakDate = dates[i] }
    const dd = equity[i] / peak - 1
    if (dd < maxDd) { maxDd = dd; ddFrom = peakDate; ddTo = dates[i] }
  }

  // Partial first and last years are included: a bad stretch should not be hidden by a year boundary
  const yearly = Object.values(calendarYearReturns(curve))
  return {
    from: dates[0], to: dates[n - 1],
    cagrPct: cagr * 100,
    volatilityPct: vol * 100,
    sharpe: vol > 0 ? (mean * perYear - cashYield) / vol : 0,
    maxDrawdownPct: maxDd * 100,
    drawdownFrom: ddFrom, drawdownTo: ddTo,
    worstYearPct: Math.min(...yearly),
    bestYearPct: Math.max(...yearly),
  }
}

/** Month-end values of a curve (the last point of each calendar month). */
export function monthly(curve: Curve): Curve {
  const dates: number[] = [], equity: number[] = []
  for (let i = 0; i < curve.dates.length; i++) {
    const month = Math.floor(curve.dates[i] / 100)
    if (i === curve.dates.length - 1 || Math.floor(curve.dates[i + 1] / 100) !== month) {
      dates.push(curve.dates[i])
      equity.push(curve.equity[i])
    }
  }
  return { dates, equity }
}

export interface Comparison {
  /** Strategy CAGR minus benchmark CAGR, percentage points a year. */
  excessCagrPct: number
  /**
   * t-statistic of the monthly return difference. Below about 2, the
   * difference is not distinguishable from luck.
   */
  tStat: number
  months: number
  /** Share of calendar years the strategy beat the benchmark. */
  yearsAheadPct: number
  /** Share of rolling three-year windows (stepped monthly) it beat the benchmark. */
  rolling3yAheadPct: number
}

/** Both curves must cover the same dates (use `align`). */
export function compare(strategy: Curve, benchmark: Curve): Comparison {
  const s = monthly(strategy), b = monthly(benchmark)
  const diffs: number[] = []
  for (let i = 1; i < s.dates.length; i++) {
    diffs.push(s.equity[i] / s.equity[i - 1] - b.equity[i] / b.equity[i - 1])
  }
  const mean = diffs.reduce((a, x) => a + x, 0) / diffs.length
  const variance = diffs.reduce((a, x) => a + (x - mean) ** 2, 0) / (diffs.length - 1)
  const tStat = variance > 0 ? mean / Math.sqrt(variance / diffs.length) : 0

  const sy = calendarYearReturns(strategy), by = calendarYearReturns(benchmark)
  const years = Object.keys(sy).map(Number)
  const yearsAhead = years.filter(y => sy[y] > by[y]).length

  let windows = 0, ahead = 0
  for (let i = 36; i < s.dates.length; i++) {
    windows++
    if (s.equity[i] / s.equity[i - 36] > b.equity[i] / b.equity[i - 36]) ahead++
  }

  const years0 = yearsBetween(strategy.dates[0], strategy.dates.at(-1)!)
  const cagr = (c: Curve) => (c.equity.at(-1)! / c.equity[0]) ** (1 / years0) - 1
  return {
    excessCagrPct: (cagr(strategy) - cagr(benchmark)) * 100,
    tStat,
    months: diffs.length,
    yearsAheadPct: (yearsAhead / years.length) * 100,
    rolling3yAheadPct: windows ? (ahead / windows) * 100 : NaN,
  }
}

/** Sample `curve` on the given dates (last value on or before each). */
export function align(curve: Curve, dates: number[]): Curve {
  return { dates, equity: dates.map(d => curve.equity[Math.max(0, lastAtOrBefore(curve.dates, d))]) }
}
