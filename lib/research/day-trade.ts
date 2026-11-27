/**
 * A day trade measured on minute bars: enter at a set time, leave at a set
 * time or at a stop, all inside one session. Pure functions.
 */

/** [minutes since midnight IST, open, high, low, close, volume] */
export type MinuteBar = number[]

export const minuteOf = (hhmm: string): number => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }

export interface DayTradeRule {
  side: 'long' | 'short'
  /** Enter at the open of the first bar at or after this minute. */
  entry: number
  /** Leave at the open of the first bar at or after this minute, or at the last bar's close. */
  exit: number
  /** Leave when the price moves this far against the trade, in percent. */
  stopPct?: number
}

export interface DayTradeResult {
  entryPrice: number
  exitPrice: number
  entryMinute: number
  exitMinute: number
  /** Profit as a fraction of the entry value, before costs. Positive is a gain for either side. */
  ret: number
  stopped: boolean
}

/** Null when the stock has no bar within ten minutes of the entry time: too thin to trade. */
export function dayTrade(bars: MinuteBar[], rule: DayTradeRule): DayTradeResult | null {
  const start = bars.findIndex(b => b[0] >= rule.entry)
  if (start < 0 || bars[start][0] > rule.entry + 10 || bars[start][0] >= rule.exit) return null
  const entryPrice = bars[start][1]
  if (!(entryPrice > 0)) return null
  const sign = rule.side === 'long' ? 1 : -1
  const stop = rule.stopPct == null ? null : entryPrice * (1 - sign * rule.stopPct / 100)

  let exitPrice = bars[bars.length - 1][4], exitMinute = bars[bars.length - 1][0], stopped = false
  for (let i = start; i < bars.length; i++) {
    const [minute, open, high, low] = bars[i]
    if (i > start && minute >= rule.exit) { exitPrice = open; exitMinute = minute; break }
    if (stop == null) continue
    // A bar that opens beyond the stop fills at its open, not at the stop
    const gapped = i > start && (sign > 0 ? open <= stop : open >= stop)
    if (gapped || (sign > 0 ? low <= stop : high >= stop)) {
      exitPrice = gapped ? open : stop; exitMinute = minute; stopped = true
      break
    }
  }
  return { entryPrice, exitPrice, entryMinute: bars[start][0], exitMinute, ret: sign * (exitPrice / entryPrice - 1), stopped }
}

/** Change from the open of the first bar at or after `from` to the open of the first bar at or after `to` (or the last close). */
export function windowReturn(bars: MinuteBar[], from: number, to: number): number | null {
  const a = bars.find(b => b[0] >= from)
  if (!a || !(a[1] > 0)) return null
  const b = bars.find(x => x[0] >= to && x[0] > a[0])
  return (b ? b[1] : bars[bars.length - 1][4]) / a[1] - 1
}

/**
 * Charges for an intraday round trip in cash shares at Zerodha, as a
 * fraction of the position: brokerage (0.03% or Rs 20 an order, whichever is
 * lower), STT on the sell side, exchange and SEBI fees, stamp duty on the
 * buy side, and GST. Slippage is separate.
 */
export function intradayCharges(positionRupees = 50000): number {
  const brokerage = 2 * Math.min(20, positionRupees * 0.0003)
  const exchange = 2 * positionRupees * 0.0000297
  const sebi = 2 * positionRupees * 0.000001
  const stt = positionRupees * 0.00025
  const stamp = positionRupees * 0.00003
  const gst = 0.18 * (brokerage + exchange + sebi)
  return (brokerage + exchange + sebi + stt + stamp + gst) / positionRupees
}
