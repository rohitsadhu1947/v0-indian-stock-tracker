/**
 * The facts the screener shows for one stock, worked out from its daily
 * bars. Pure functions.
 *
 * These are descriptions, not buy or sell calls. The swing tests
 * (research/results/swing.json) found that none of the price patterns here
 * predicts the next few days well enough to trade on. Only the monthly
 * ranks (momentum, low volatility) passed testing, and they are shown
 * separately.
 */
import { annualVolatility } from '@/lib/portfolio/factors'
import type { DailyBar } from '@/lib/portfolio/momentum'

export type Trend = 'up' | 'mixed' | 'down'

export interface ScreenFacts {
  close: number
  date: string
  dayPct: number | null
  weekPct: number | null
  monthPct: number | null
  /** 12-month return skipping the latest month. */
  momentumPct: number | null
  volatilityPct: number | null
  /** How far the close is below the highest close of the last year (0 = at the high). */
  belowHighPct: number | null
  /** Close against its 50-day and 200-day averages, in percent. */
  vs50Pct: number | null
  vs200Pct: number | null
  /** up: above both averages. down: below both. mixed: between them. */
  trend: Trend | null
  /** Today's rupees traded against the 20-day average (1 = usual). */
  volumeRatio: number | null
  /** Share of today's volume taken into delivery, in percent. */
  deliveryPct: number | null
  /** Median rupees traded a day over 60 sessions, in crore. */
  tradedCr: number
}

const pct = (now: number, then: number | undefined) => (then && then > 0 ? (now / then - 1) * 100 : null)

function average(bars: DailyBar[], window: number): number | null {
  if (bars.length < window) return null
  let sum = 0
  for (let i = bars.length - window; i < bars.length; i++) sum += bars[i].close
  return sum / window
}

export function screenFacts(bars: DailyBar[]): ScreenFacts | null {
  const n = bars.length
  if (n < 2) return null
  const last = bars[n - 1]
  const back = (sessions: number) => bars[n - 1 - sessions]?.close

  const sma50 = average(bars, 50), sma200 = average(bars, 200)
  const vs50 = sma50 ? (last.close / sma50 - 1) * 100 : null
  const vs200 = sma200 ? (last.close / sma200 - 1) * 100 : null
  const trend: Trend | null = vs50 == null || vs200 == null ? null : vs50 > 0 && vs200 > 0 ? 'up' : vs50 < 0 && vs200 < 0 ? 'down' : 'mixed'

  let high = 0
  for (let i = Math.max(0, n - 252); i < n; i++) high = Math.max(high, bars[i].close)

  const traded = (b: DailyBar) => b.close * b.volume
  const prior = bars.slice(Math.max(0, n - 21), n - 1)
  const usual = prior.length >= 10 ? prior.reduce((sum, b) => sum + traded(b), 0) / prior.length : null
  const recent = bars.slice(-60).map(b => traded(b) / 1e7).sort((a, b) => a - b)
  const vol = annualVolatility(bars)

  return {
    close: last.close,
    date: last.date,
    dayPct: pct(last.close, back(1)),
    weekPct: pct(last.close, back(5)),
    monthPct: pct(last.close, back(21)),
    momentumPct: n >= 253 ? pct(bars[n - 22].close, bars[n - 253].close) : null,
    volatilityPct: vol == null ? null : vol * 100,
    belowHighPct: n >= 200 && high > 0 ? (1 - last.close / high) * 100 : null,
    vs50Pct: vs50,
    vs200Pct: vs200,
    trend,
    volumeRatio: usual && usual > 0 ? traded(last) / usual : null,
    deliveryPct: last.deliveryQty != null && last.volume > 0 ? Math.min(100, (last.deliveryQty / last.volume) * 100) : null,
    tradedCr: recent.length ? recent[recent.length >> 1] : 0,
  }
}
