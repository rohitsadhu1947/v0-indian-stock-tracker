/**
 * Swing trades: buy at the next session's open after a signal, sell at a
 * target, a stop, or after a few sessions, whichever comes first.
 *
 * Everything here is a pure function of a stock's own series, so the same
 * code can test a rule on history and run it on today's data.
 *
 * A signal is judged against the plainest alternative: buying every stock in
 * the universe on the same morning with the same exits. A rule only counts
 * if its trades beat that.
 */
import { calculateTradeCosts, DEFAULT_COSTS, type CostConfig } from '@/lib/backtest/costs'
import type { StockSeries } from './market'

export interface ExitRule {
  key: string
  /** Sell when the price reaches this far above the entry. Null: no target. */
  targetPct: number | null
  /** Sell when the price falls this far below the entry. Null: no stop. */
  stopPct: number | null
  /** Sell at the close of this session, counting the entry session as 1. */
  maxSessions: number
}

export type ExitReason = 'target' | 'stop' | 'time'

export interface Outcome {
  /** Return after slippage and charges, as a fraction. */
  ret: number
  exitIndex: number
  reason: ExitReason
}

/** Rupees per trade assumed when working out charges (the demat charge is a flat fee). */
export const POSITION_SIZE = 50000

/**
 * What a trade entered at the open of bar `entry` would have made.
 *
 * Inside a session the order of the high and the low is unknown, so when
 * both the stop and the target were touched on one day the stop is taken.
 * A session that opens beyond the stop or the target exits at that open.
 */
export function tradeOutcome(
  s: Pick<StockSeries, 'open' | 'high' | 'low' | 'close'>, entry: number, rule: ExitRule, costs: CostConfig = DEFAULT_COSTS,
  /** Entry price when it is not the open, for example the session's average price. */
  entryAt?: number
): Outcome | null {
  const n = s.close.length
  if (entry >= n) return null
  const entryPrice = entryAt ?? s.open[entry]
  if (!(entryPrice > 0)) return null
  const target = rule.targetPct == null ? Infinity : entryPrice * (1 + rule.targetPct / 100)
  const stop = rule.stopPct == null ? 0 : entryPrice * (1 - rule.stopPct / 100)
  const last = Math.min(n - 1, entry + rule.maxSessions - 1)

  let exitPrice = s.close[last], exitIndex = last, reason: ExitReason = 'time'
  for (let i = entry; i <= last; i++) {
    if (i > entry && s.open[i] <= stop) { exitPrice = s.open[i]; exitIndex = i; reason = 'stop'; break }
    if (i > entry && s.open[i] >= target) { exitPrice = s.open[i]; exitIndex = i; reason = 'target'; break }
    if (s.low[i] <= stop) { exitPrice = stop; exitIndex = i; reason = 'stop'; break }
    if (s.high[i] >= target) { exitPrice = target; exitIndex = i; reason = 'target'; break }
  }

  const buy = entryPrice * (1 + costs.slippagePercent), sell = exitPrice * (1 - costs.slippagePercent)
  const charges = calculateTradeCosts(buy, sell, POSITION_SIZE / buy, costs).costPercent / 100
  return { ret: sell / buy - 1 - charges, exitIndex, reason }
}

/** Indicators over one stock's history. Each value at i uses bars up to and including i. */
export interface Indicators {
  sma20: Float64Array
  sma50: Float64Array
  sma200: Float64Array
  rsi2: Float64Array
  rsi14: Float64Array
  /** Average rupees traded over the 20 sessions before this one. */
  avgTurnover20: Float64Array
  /** Highest close of the 20 and 252 sessions before this one. */
  priorHigh20: Float64Array
  priorHigh252: Float64Array
  /** Return over the last 5 sessions. */
  ret5: Float64Array
  /** Average delivery share over the 20 sessions before this one. */
  avgDelivery20: Float64Array
  /** 12-month return skipping the latest month. */
  momentum: Float64Array
}

function sma(xs: Float64Array, window: number): Float64Array {
  const out = new Float64Array(xs.length).fill(NaN)
  let sum = 0
  for (let i = 0; i < xs.length; i++) {
    sum += xs[i]
    if (i >= window) sum -= xs[i - window]
    if (i >= window - 1) out[i] = sum / window
  }
  return out
}

/** Average of the `window` values before i, skipping missing ones; NaN with fewer than half present. */
function priorMean(xs: Float64Array, window: number): Float64Array {
  const out = new Float64Array(xs.length).fill(NaN)
  for (let i = window; i < xs.length; i++) {
    let sum = 0, count = 0
    for (let j = i - window; j < i; j++) if (!Number.isNaN(xs[j])) { sum += xs[j]; count++ }
    if (count >= window / 2) out[i] = sum / count
  }
  return out
}

function priorMax(xs: Float64Array, window: number): Float64Array {
  const out = new Float64Array(xs.length).fill(NaN)
  for (let i = window; i < xs.length; i++) {
    let max = 0
    for (let j = i - window; j < i; j++) if (xs[j] > max) max = xs[j]
    out[i] = max
  }
  return out
}

/** Wilder's relative strength index. */
export function rsi(close: Float64Array, period: number): Float64Array {
  const out = new Float64Array(close.length).fill(NaN)
  let gain = 0, loss = 0
  for (let i = 1; i < close.length; i++) {
    const change = close[i] - close[i - 1]
    const up = Math.max(change, 0), down = Math.max(-change, 0)
    if (i <= period) {
      gain += up / period
      loss += down / period
    } else {
      gain = (gain * (period - 1) + up) / period
      loss = (loss * (period - 1) + down) / period
    }
    if (i >= period) out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  }
  return out
}

export function indicators(s: StockSeries): Indicators {
  const n = s.close.length
  const ret5 = new Float64Array(n).fill(NaN)
  for (let i = 5; i < n; i++) ret5[i] = s.close[i] / s.close[i - 5] - 1
  const momentum = new Float64Array(n).fill(NaN)
  for (let i = 252; i < n; i++) momentum[i] = s.close[i - 21] / s.close[i - 252] - 1
  return {
    momentum,
    sma20: sma(s.close, 20), sma50: sma(s.close, 50), sma200: sma(s.close, 200),
    rsi2: rsi(s.close, 2), rsi14: rsi(s.close, 14),
    avgTurnover20: priorMean(s.turnover, 20),
    priorHigh20: priorMax(s.close, 20), priorHigh252: priorMax(s.close, 252),
    ret5,
    avgDelivery20: priorMean(s.deliveryShare, 20),
  }
}

/** What a signal can see at the close of bar i. */
export interface SignalContext {
  s: StockSeries
  ind: Indicators
  i: number
  /** The 5-session return that marks the weakest and strongest 5% of the universe today. */
  ret5Low: number
  ret5High: number
  /** Whether results were due on this session or the one before. */
  resultsJustOut: boolean
}

export interface SwingSignal {
  key: string
  label: string
  /** Where the idea comes from. */
  basis: string
  fires(c: SignalContext): boolean
  /** 2: added after the first run's results were seen, so more likely to look good by luck. */
  round?: 2
}

const dayReturn = (c: SignalContext) => c.s.close[c.i] / c.s.close[c.i - 1] - 1
const volumeRatio = (c: SignalContext) => c.s.turnover[c.i] / c.ind.avgTurnover20[c.i]
const uptrend = (c: SignalContext) => c.s.close[c.i] > c.ind.sma200[c.i]

/**
 * The entry rules under test. All settings are the usual published ones and
 * were fixed before the first run.
 */
export const SWING_SIGNALS: SwingSignal[] = [
  {
    key: 'pullback-rsi2',
    label: 'Sharp dip in an uptrend',
    basis: 'Above the 200-day average with a 2-day RSI under 10 (Connors and Alvarez, 2009).',
    fires: c => uptrend(c) && c.ind.rsi2[c.i] < 10,
  },
  {
    key: 'three-down-days',
    label: 'Three falling days in an uptrend',
    basis: 'Above the 200-day average with three lower closes in a row.',
    fires: c => c.i >= 3 && uptrend(c) &&
      c.s.close[c.i] < c.s.close[c.i - 1] && c.s.close[c.i - 1] < c.s.close[c.i - 2] && c.s.close[c.i - 2] < c.s.close[c.i - 3],
  },
  {
    key: 'weakest-week',
    label: 'Among the weakest 5% this week',
    basis: 'Short-term reversal: the worst 5-day returns in the universe tend to bounce (Lehmann, 1990; Jegadeesh, 1990).',
    fires: c => c.ind.ret5[c.i] <= c.ret5Low,
  },
  {
    key: 'strongest-week',
    label: 'Among the strongest 5% this week',
    basis: 'The opposite of the reversal rule: chase the best 5-day returns. Included as a check.',
    fires: c => c.ind.ret5[c.i] >= c.ret5High,
  },
  {
    key: 'breakout-20d',
    label: '20-day high on heavy volume',
    basis: 'Close above the highest close of the last 20 sessions on at least twice the usual turnover, in an uptrend.',
    fires: c => uptrend(c) && c.s.close[c.i] > c.ind.priorHigh20[c.i] && volumeRatio(c) >= 2,
  },
  {
    key: 'new-52w-high',
    label: 'New 52-week high',
    basis: 'Close above the highest close of the last year on at least 1.5 times the usual turnover (George and Hwang, 2004).',
    fires: c => c.s.close[c.i] > c.ind.priorHigh252[c.i] && c.s.close[c.i - 1] <= c.ind.priorHigh252[c.i - 1] && volumeRatio(c) >= 1.5,
  },
  {
    key: 'results-jump',
    label: 'Jump on results',
    basis: 'Up 4% or more on twice the usual turnover as results come out: post-earnings drift (Bernard and Thomas, 1989).',
    fires: c => c.resultsJustOut && dayReturn(c) >= 0.04 && volumeRatio(c) >= 2,
  },
  {
    key: 'results-drop',
    label: 'Drop on results (bounce)',
    basis: 'Down 4% or more on twice the usual turnover as results come out. Tests whether the fall overshoots.',
    fires: c => c.resultsJustOut && dayReturn(c) <= -0.04 && volumeRatio(c) >= 2,
  },
  {
    key: 'delivery-buying',
    label: 'Up day with heavy delivery',
    basis: 'Up 2% or more with delivery share and turnover both at least 1.5 times their 20-day average. An India-specific idea without a published record.',
    fires: c => dayReturn(c) >= 0.02 && volumeRatio(c) >= 1.5 && c.s.deliveryShare[c.i] >= 1.5 * c.ind.avgDelivery20[c.i],
  },
  {
    key: 'gap-up-holds',
    label: 'Gap up that holds',
    basis: 'Opens 3% or more above the previous close and closes above its open, in an uptrend.',
    fires: c => uptrend(c) && c.s.open[c.i] / c.s.close[c.i - 1] - 1 >= 0.03 && c.s.close[c.i] > c.s.open[c.i],
  },
  {
    key: 'old-screener',
    label: 'Clean uptrend with momentum (the old screener)',
    basis: 'Close above the 20-day, above the 50-day, above the 200-day average, with a 14-day RSI between 55 and 70. The shape of the removed screener\'s buy signal.',
    fires: c => c.s.close[c.i] > c.ind.sma20[c.i] && c.ind.sma20[c.i] > c.ind.sma50[c.i] && c.ind.sma50[c.i] > c.ind.sma200[c.i] &&
      c.ind.rsi14[c.i] >= 55 && c.ind.rsi14[c.i] <= 70,
  },
  // Second round: stricter versions of the only rules that beat the baseline in the first run
  {
    key: 'deep-dip', round: 2,
    label: 'Deep dip in an uptrend',
    basis: 'Above the 200-day average, 2-day RSI under 5, and down 7% or more in five sessions.',
    fires: c => uptrend(c) && c.ind.rsi2[c.i] < 5 && c.ind.ret5[c.i] <= -0.07,
  },
  {
    key: 'dip-in-leader', round: 2,
    label: 'Dip in a strong stock',
    basis: 'Up 40% or more over the last year (skipping the latest month), above the 200-day average, 2-day RSI under 10.',
    fires: c => uptrend(c) && c.ind.momentum[c.i] >= 0.4 && c.ind.rsi2[c.i] < 10,
  },
  {
    key: 'quiet-dip', round: 2,
    label: 'Three falling days on low volume',
    basis: 'Above the 200-day average, three lower closes in a row, each on less than the usual turnover: a fall without news.',
    fires: c => c.i >= 3 && uptrend(c) &&
      c.s.close[c.i] < c.s.close[c.i - 1] && c.s.close[c.i - 1] < c.s.close[c.i - 2] && c.s.close[c.i - 2] < c.s.close[c.i - 3] &&
      c.s.turnover[c.i] < c.ind.avgTurnover20[c.i] && c.s.turnover[c.i - 1] < c.ind.avgTurnover20[c.i] && c.s.turnover[c.i - 2] < c.ind.avgTurnover20[c.i],
  },
  {
    key: 'big-results-jump', round: 2,
    label: 'Big jump on results',
    basis: 'Up 7% or more on three times the usual turnover as results come out, closing in the top quarter of the day\'s range.',
    fires: c => c.resultsJustOut && dayReturn(c) >= 0.07 && volumeRatio(c) >= 3 &&
      c.s.close[c.i] >= c.s.low[c.i] + 0.75 * (c.s.high[c.i] - c.s.low[c.i]),
  },
]

/** Mean, and the t-statistic of the mean against zero. */
export function meanAndT(xs: number[]): { mean: number; t: number } {
  const n = xs.length
  if (n < 2) return { mean: n ? xs[0] : 0, t: 0 }
  const mean = xs.reduce((a, b) => a + b, 0) / n
  const variance = xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1)
  return { mean, t: variance > 0 ? mean / Math.sqrt(variance / n) : 0 }
}
