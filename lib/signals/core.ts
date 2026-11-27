/**
 * Signals as instructions: what to buy or sell, at what price, where the
 * stop is and when to get out. Pure functions.
 *
 * Only rules that passed testing become signals: the Monthly Plan's orders
 * and the two F&O day-trade shorts. The app places no orders.
 */
import { dayTrade, minuteOf, type MinuteBar } from '@/lib/research/day-trade'
import { SIGNAL_LABEL, STOP_PCT, type WatchSignal } from '@/lib/fo-watch/core'

export const ENTRY_MINUTE = minuteOf('09:20')
export const EXIT_MINUTE = minuteOf('15:15')

/**
 * waiting   before 09:20 on the trade date: sell at the 09:20 price
 * open      sold, stop not hit, before 15:15
 * stopped   the stop was hit: the trade is over
 * closed    bought back at 15:15
 * missed    the day is over and there are no prices to say what happened
 */
export type DayTradeState = 'waiting' | 'open' | 'stopped' | 'closed' | 'missed'

export interface DayTradeSignal {
  symbol: string
  signal: WatchSignal
  reason: string
  tradeDate: string
  state: DayTradeState
  /** The 09:20 price once it has printed. Before that, null. */
  entryPrice: number | null
  /** A price to plan with before 09:20: the last traded price or close. */
  referencePrice: number | null
  /** 3% above the entry, or above the reference price before 09:20. */
  stopPrice: number | null
  /** The latest price while the trade is open; the exit price once it is over. */
  lastPrice: number | null
  /** Gain on the short so far or at the exit, in percent, before costs. */
  movePct: number | null
}

const round2 = (x: number) => Math.round(x * 100) / 100

/**
 * Where one day-trade short stands. `bars` are the trade date's minute bars
 * so far (empty when they cannot be read); `nowMinute` is minutes since
 * midnight IST on the trade date, or null when today is not the trade date.
 */
export function dayTradeSignal(input: {
  symbol: string; signal: WatchSignal; tradeDate: string; detail: Record<string, number>
  bars: MinuteBar[]; referencePrice: number | null; nowMinute: number | null; dayOver: boolean
}): DayTradeSignal {
  const { symbol, signal, tradeDate, detail, bars, referencePrice } = input
  const reason = signal === 'ban-entry'
    ? 'New on the F&O ban list'
    : detail.callRatio ? `Call volume ${detail.callRatio} times the usual` : SIGNAL_LABEL[signal]
  const base = { symbol, signal, reason, tradeDate, referencePrice }
  const stopFor = (price: number | null) => (price ? round2(price * (1 + STOP_PCT / 100)) : null)

  const result = bars.length ? dayTrade(bars, { side: 'short', entry: ENTRY_MINUTE, exit: EXIT_MINUTE, stopPct: STOP_PCT }) : null
  if (!result) {
    const state: DayTradeState = input.dayOver ? 'missed' : 'waiting'
    return { ...base, state, entryPrice: null, stopPrice: stopFor(referencePrice), lastPrice: referencePrice, movePct: null }
  }
  const finished = result.stopped || input.dayOver || (input.nowMinute != null && input.nowMinute >= EXIT_MINUTE && result.exitMinute >= EXIT_MINUTE)
  const state: DayTradeState = result.stopped ? 'stopped' : finished ? 'closed' : 'open'
  // While the trade is open, dayTrade's "exit" is simply the latest bar's close
  return {
    ...base, state, entryPrice: result.entryPrice, stopPrice: stopFor(result.entryPrice),
    lastPrice: round2(result.exitPrice), movePct: round2(result.ret * 100),
  }
}

/** Whole shares a rupee amount buys or sells at a price. */
export function sharesFor(amount: number, price: number | null): number {
  return price && price > 0 && amount > 0 ? Math.floor(amount / price) : 0
}
