/**
 * Market trend regime: is NIFTY 200 above its 200-day average?
 * Used by the defensive mode to move the book to cash in downtrends.
 */

export interface TrendRegime {
  invested: boolean
  close: number
  sma200: number
  /** % distance of the close from the 200-day average. */
  distancePct: number
  asOf: string
}

/**
 * @param bars oldest first; needs at least 200 closes
 * @returns null when there is not enough history
 */
export function trendRegime(bars: Array<{ date: string; close: number }>): TrendRegime | null {
  if (bars.length < 200) return null
  const last200 = bars.slice(-200)
  const sma200 = last200.reduce((sum, b) => sum + b.close, 0) / 200
  const latest = bars[bars.length - 1]
  return {
    invested: latest.close > sma200,
    close: latest.close,
    sma200,
    distancePct: ((latest.close - sma200) / sma200) * 100,
    asOf: latest.date,
  }
}
