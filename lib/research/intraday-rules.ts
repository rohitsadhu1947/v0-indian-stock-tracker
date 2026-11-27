/**
 * Plain day-trading rules on 5-minute bars: opening range, gaps, the
 * previous day's range and VWAP. Each rule looks at one stock's session up
 * to a decision time and says whether to buy or sell short. Pure functions.
 *
 * A bar is [minutes since midnight IST, open, high, low, close, volume].
 */
import { minuteOf, type MinuteBar } from './day-trade'

export interface Session {
  bars: MinuteBar[]
  /** The previous session's close, high and low. */
  prevClose: number
  prevHigh: number
  prevLow: number
}

export interface Plan {
  side: 'long' | 'short'
  /** Enter at the open of this bar. */
  entryIndex: number
  /** Leave at the open of the first bar at or after this minute. */
  exit: number
  /** Leave earlier if the price reaches this level against the trade. */
  stop?: number
}

export interface IntradayRule {
  key: string
  label: string
  basis: string
  plan: (s: Session) => Plan | null
}

const CLOSE_OUT = minuteOf('15:15')
const LAST_ENTRY = minuteOf('13:00')
const indexAt = (bars: MinuteBar[], minute: number) => bars.findIndex(b => b[0] >= minute)

/** Volume-weighted average price of the bars before index `end`, using each bar's typical price. */
export function vwapBefore(bars: MinuteBar[], end: number): number | null {
  let value = 0, volume = 0
  for (let i = 0; i < end; i++) { value += ((bars[i][2] + bars[i][3] + bars[i][4]) / 3) * bars[i][5]; volume += bars[i][5] }
  return volume > 0 ? value / volume : null
}

/** First close outside the opening range, traded at the next bar's open, with the stop at the far side of the range. */
function openingRange(rangeMinutes: number, want: 'long' | 'short' | 'either', needVolume = false) {
  return (s: Session): Plan | null => {
    const end = indexAt(s.bars, minuteOf('09:15') + rangeMinutes)
    if (end < 2) return null
    let high = -Infinity, low = Infinity, volume = 0
    for (let i = 0; i < end; i++) { high = Math.max(high, s.bars[i][2]); low = Math.min(low, s.bars[i][3]); volume += s.bars[i][5] }
    for (let i = end; i < s.bars.length - 1 && s.bars[i][0] < LAST_ENTRY; i++) {
      const close = s.bars[i][4]
      const side = close > high ? 'long' : close < low ? 'short' : null
      if (!side) continue
      // Only the first break of the day counts, whichever way it goes
      if (want !== 'either' && side !== want) return null
      if (needVolume && s.bars[i][5] < 2 * (volume / end)) return null
      return { side, entryIndex: i + 1, exit: CLOSE_OUT, stop: side === 'long' ? low : high }
    }
    return null
  }
}

/** A gap at the open against the previous close, traded from the second bar. */
function gap(direction: 'up' | 'down', side: 'long' | 'short', minPct: number) {
  return (s: Session): Plan | null => {
    if (s.bars.length < 3 || !(s.prevClose > 0)) return null
    const move = (s.bars[0][1] / s.prevClose - 1) * 100
    if (direction === 'up' ? move < minPct : move > -minPct) return null
    return { side, entryIndex: 1, exit: CLOSE_OUT }
  }
}

/** First close beyond the previous day's high (buy) or low (sell short), when the day did not open beyond it. */
function previousRange(side: 'long' | 'short', stopPct: number) {
  return (s: Session): Plan | null => {
    const level = side === 'long' ? s.prevHigh : s.prevLow
    if (!(level > 0) || !s.bars.length) return null
    const open = s.bars[0][1]
    if (side === 'long' ? open >= level : open <= level) return null
    for (let i = 1; i < s.bars.length - 1 && s.bars[i][0] < LAST_ENTRY; i++) {
      const close = s.bars[i][4]
      if (side === 'long' ? close > level : close < level) {
        const entry = s.bars[i + 1][1]
        return { side, entryIndex: i + 1, exit: CLOSE_OUT, stop: entry * (1 + (side === 'long' ? -1 : 1) * stopPct / 100) }
      }
    }
    return null
  }
}

/** At 10:00: with the trend when the price is clear of VWAP and of the open on the same side. */
function vwapTrend(side: 'long' | 'short') {
  return (s: Session): Plan | null => {
    const i = indexAt(s.bars, minuteOf('10:00'))
    if (i < 3 || s.bars[i][0] > minuteOf('10:10')) return null
    const vwap = vwapBefore(s.bars, i), price = s.bars[i - 1][4], open = s.bars[0][1]
    if (!vwap) return null
    const ok = side === 'long' ? price > vwap * 1.005 && price > open : price < vwap * 0.995 && price < open
    return ok ? { side, entryIndex: i, exit: CLOSE_OUT, stop: vwap } : null
  }
}

/** At 11:00: against a price stretched 2% from VWAP. */
function vwapFade(side: 'long' | 'short') {
  return (s: Session): Plan | null => {
    const i = indexAt(s.bars, minuteOf('11:00'))
    if (i < 6 || s.bars[i][0] > minuteOf('11:10')) return null
    const vwap = vwapBefore(s.bars, i), price = s.bars[i - 1][4]
    if (!vwap) return null
    const ok = side === 'short' ? price >= vwap * 1.02 : price <= vwap * 0.98
    return ok ? { side, entryIndex: i, exit: CLOSE_OUT } : null
  }
}

/** The last half hour in the direction of the first: prices from the previous close to 09:45 set the side. */
function lastHalfHour(follow: 'up' | 'down') {
  return (s: Session): Plan | null => {
    const early = indexAt(s.bars, minuteOf('09:45')), late = indexAt(s.bars, minuteOf('15:00'))
    if (early < 1 || late < 0 || s.bars[late][0] > minuteOf('15:05') || !(s.prevClose > 0)) return null
    const move = s.bars[early][1] / s.prevClose - 1
    if (follow === 'up' ? move < 0.005 : move > -0.005) return null
    return { side: follow === 'up' ? 'long' : 'short', entryIndex: late, exit: minuteOf('15:25') }
  }
}

export const INTRADAY_RULES: IntradayRule[] = [
  { key: 'orb15', label: 'Opening range, 15 minutes', basis: 'First 5-minute close outside the 09:15 to 09:30 range, traded that way. Stop at the far side of the range.', plan: openingRange(15, 'either') },
  { key: 'orb30', label: 'Opening range, 30 minutes', basis: 'The same with the 09:15 to 09:45 range.', plan: openingRange(30, 'either') },
  { key: 'orb30-long', label: 'Opening range, 30 minutes, buys only', basis: 'Only when the first break is upward.', plan: openingRange(30, 'long') },
  { key: 'orb30-short', label: 'Opening range, 30 minutes, shorts only', basis: 'Only when the first break is downward.', plan: openingRange(30, 'short') },
  { key: 'orb30-volume', label: 'Opening range, 30 minutes, heavy volume', basis: 'The break bar trades at least twice the average bar of the range.', plan: openingRange(30, 'either', true) },
  { key: 'gap-up-follow', label: 'Gap up 1.5%: buy', basis: 'Opens 1.5% or more above the previous close. Buy at 09:20, sell at 15:15.', plan: gap('up', 'long', 1.5) },
  { key: 'gap-up-fade', label: 'Gap up 1.5%: sell short', basis: 'The same gap, sold short at 09:20.', plan: gap('up', 'short', 1.5) },
  { key: 'gap-down-follow', label: 'Gap down 1.5%: sell short', basis: 'Opens 1.5% or more below the previous close. Sell short at 09:20.', plan: gap('down', 'short', 1.5) },
  { key: 'gap-down-fade', label: 'Gap down 1.5%: buy', basis: 'The same gap, bought at 09:20.', plan: gap('down', 'long', 1.5) },
  { key: 'prev-high', label: 'Breaks the previous day\'s high', basis: 'First 5-minute close above the previous high, when the day opened below it. 1.5% stop.', plan: previousRange('long', 1.5) },
  { key: 'prev-low', label: 'Breaks the previous day\'s low', basis: 'First 5-minute close below the previous low, when the day opened above it. 1.5% stop.', plan: previousRange('short', 1.5) },
  { key: 'vwap-trend-long', label: 'Above VWAP at 10:00: buy', basis: 'Price 0.5% above VWAP and above the open at 10:00. Stop at VWAP.', plan: vwapTrend('long') },
  { key: 'vwap-trend-short', label: 'Below VWAP at 10:00: sell short', basis: 'Price 0.5% below VWAP and below the open at 10:00. Stop at VWAP.', plan: vwapTrend('short') },
  { key: 'vwap-fade-short', label: '2% above VWAP at 11:00: sell short', basis: 'Price 2% or more above VWAP at 11:00, sold short to 15:15.', plan: vwapFade('short') },
  { key: 'vwap-fade-long', label: '2% below VWAP at 11:00: buy', basis: 'Price 2% or more below VWAP at 11:00, bought to 15:15.', plan: vwapFade('long') },
  { key: 'last-half-hour-up', label: 'Strong morning: buy the last half hour', basis: 'Up 0.5% or more from the previous close by 09:45. Buy at 15:00, sell at 15:25.', plan: lastHalfHour('up') },
  { key: 'last-half-hour-down', label: 'Weak morning: short the last half hour', basis: 'Down 0.5% or more by 09:45. Sell short at 15:00, buy back at 15:25.', plan: lastHalfHour('down') },
]

export interface PlanResult { ret: number; stopped: boolean; entryMinute: number; exitMinute: number }

/** Carry a plan out on the session's bars. When one bar could have hit the stop, the stop is taken. */
export function carryOut(bars: MinuteBar[], plan: Plan): PlanResult | null {
  const start = plan.entryIndex
  if (start < 0 || start >= bars.length || bars[start][0] >= plan.exit) return null
  const entry = bars[start][1]
  if (!(entry > 0)) return null
  const sign = plan.side === 'long' ? 1 : -1
  // A stop already behind the entry price is hit at once
  let exit = bars[bars.length - 1][4], exitMinute = bars[bars.length - 1][0], stopped = false
  for (let i = start; i < bars.length; i++) {
    const [minute, open, high, low] = bars[i]
    if (i > start && minute >= plan.exit) { exit = open; exitMinute = minute; break }
    if (plan.stop == null) continue
    const gapped = sign > 0 ? open <= plan.stop : open >= plan.stop
    if (gapped || (sign > 0 ? low <= plan.stop : high >= plan.stop)) { exit = gapped ? open : plan.stop; exitMinute = minute; stopped = true; break }
  }
  return { ret: sign * (exit / entry - 1), stopped, entryMinute: bars[start][0], exitMinute }
}
