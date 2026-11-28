/**
 * One list of what to do next, built from every signal the app has. Pure
 * functions: the page passes in what it already loaded.
 *
 * Prices and stops come from the tested rules. Where a rule was tested
 * without a stop or a target, the list says so and does not invent one.
 */
import type { PositionalView } from '@/lib/positional/service'
import type { SplitView } from '@/lib/positional/split-service'
import type { DividendView } from '@/lib/positional/dividend-service'
import { sharesFor, type DayTradeSignal } from './core'
import type { MonthlyView } from './service'

/** Positions the results-buy book holds at once in testing. */
export const RESULTS_SLOTS = 20
/** Capital the amounts start from until the reader changes it. */
export const DEFAULT_CAPITAL = 2_500_000
/**
 * The optional loss limit on a results buy, in percent below the buy price.
 * In testing (research/results/stops-targets.json) the rule did best with no
 * stop: 30% a year with a 52% fall. A 15% stop made 24% a year with a 38% fall.
 */
export const LOSS_LIMIT_PCT = 15

export interface Action {
  key: string
  side: 'BUY' | 'SELL' | 'SHORT'
  symbol: string
  /** Which rule it comes from, in the page's words. */
  rule: string
  /** Tracked on paper only: too new to act on with money. */
  paper: boolean
  /** Not part of the tested rule: for a reader who wants a loss limit. */
  optional: boolean
  when: string
  shares: number | null
  /** A price to plan with: the last price or close. */
  price: number | null
  priceNote: string
  /** Stop or loss limit as a price. Null when the rule has none. */
  stop: number | null
  stopNote: string
  target: string
  exit: string
  why: string
}

const round2 = (x: number) => Math.round(x * 100) / 100
/** The weekday before a date. */
const eveOf = (iso: string): string => {
  const eve = new Date(iso + 'T00:00:00Z')
  eve.setUTCDate(eve.getUTCDate() - (eve.getUTCDay() === 1 ? 3 : 1))
  return eve.toISOString().slice(0, 10)
}
const shortDay = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

export function nextActions(input: {
  today: string
  dayTrades: readonly DayTradeSignal[]
  positional: PositionalView | null | undefined
  splits: SplitView | null | undefined
  dividends?: DividendView | null
  monthly: MonthlyView | null | undefined
  /** Rupees for one results buy or split buy. */
  perStock: number
  /** Rupees for one day trade. */
  perDayTrade: number
}): Action[] {
  const { today, positional, splits, monthly, perStock } = input
  const out: Action[] = []

  for (const s of input.dayTrades) {
    if (s.state !== 'waiting' || s.tradeDate < today) continue
    out.push({
      key: `day-${s.symbol}-${s.tradeDate}`, side: 'SHORT', symbol: s.symbol, rule: 'Day trade', paper: true, optional: false,
      when: `${s.tradeDate === today ? 'Today' : shortDay(s.tradeDate)}, 09:20`, shares: sharesFor(input.perDayTrade, s.referencePrice), price: s.referencePrice,
      priceNote: 'Sell at the market price at 09:20', stop: s.stopPrice, stopNote: '3% above your sell price', target: 'None',
      exit: 'Buy back at 15:15 the same day', why: s.reason,
    })
  }

  if (positional) {
    for (const r of positional.open) {
      if (r.sessionsHeld != null && r.sessionsHeld >= positional.holdSessions - 1) {
        out.push({
          key: `results-sell-${r.symbol}`, side: 'SELL', symbol: r.symbol, rule: 'Results buy', paper: false, optional: false,
          when: 'Next session, spread through the day', shares: null, price: r.lastPrice, priceNote: 'Any price', stop: null, stopNote: '', target: '',
          exit: '', why: `Its ${positional.holdSessions} sessions are up`,
        })
      } else if (r.movePct != null && r.movePct <= -LOSS_LIMIT_PCT) {
        out.push({
          key: `results-limit-${r.symbol}`, side: 'SELL', symbol: r.symbol, rule: 'Results buy', paper: false, optional: true,
          when: 'Next session', shares: null, price: r.lastPrice, priceNote: 'Any price', stop: r.entryPrice ? round2(r.entryPrice * (1 - LOSS_LIMIT_PCT / 100)) : null,
          stopNote: `${LOSS_LIMIT_PCT}% below the buy price`, target: '', exit: '', why: `Down ${Math.abs(r.movePct).toFixed(1)}% from the buy price, past the optional loss limit`,
        })
      }
    }
    for (const r of positional.fresh) {
      const price = r.lastPrice ?? r.signalClose
      out.push({
        key: `results-buy-${r.symbol}`, side: 'BUY', symbol: r.symbol, rule: 'Results buy', paper: false, optional: false,
        when: 'Next session, after 3 pm', shares: sharesFor(perStock, price), price, priceNote: 'Any price. In testing it did not matter how far the stock had moved that day',
        stop: price ? round2(price * (1 - LOSS_LIMIT_PCT / 100)) : null, stopNote: `Optional: ${LOSS_LIMIT_PCT}% below your buy price`,
        target: 'None. Targets cut the return in testing', exit: r.exitAbout ? `Sell on session ${positional.holdSessions}, about ${shortDay(r.exitAbout)}` : `Sell on session ${positional.holdSessions}`,
        why: `Up ${r.jumpPct}% around results on ${r.turnoverRatio} times its usual turnover`,
      })
    }
  }

  if (splits) {
    for (const r of splits.open) {
      // Listed from the weekday before the sell day, not earlier
      if (eveOf(r.sellOn) > today) continue
      out.push({
        key: `split-sell-${r.symbol}`, side: 'SELL', symbol: r.symbol, rule: 'Split buy', paper: true, optional: false,
        when: `${shortDay(r.sellOn)}, after 3 pm`, shares: null, price: r.lastPrice, priceNote: 'Any price', stop: null, stopNote: '', target: '', exit: '',
        why: `The split is on ${shortDay(r.exDate)}. Stocks lagged after a split in testing`,
      })
    }
    for (const r of splits.fresh) {
      const price = r.lastPrice ?? r.signalClose
      out.push({
        key: `split-buy-${r.symbol}`, side: 'BUY', symbol: r.symbol, rule: 'Split buy', paper: true, optional: false,
        when: 'Next session, after 3 pm', shares: sharesFor(perStock, price), price, priceNote: 'Any price', stop: null, stopNote: 'None in the tested rule',
        target: 'None', exit: `Sell ${shortDay(r.sellOn)}, after 3 pm`, why: `Share split on ${shortDay(r.exDate)}: ${r.split}`,
      })
    }
  }

  if (input.dividends) {
    for (const r of input.dividends.open) {
      if (eveOf(r.sellOn) > today) continue
      out.push({
        key: `dividend-sell-${r.symbol}`, side: 'SELL', symbol: r.symbol, rule: 'Dividend buy', paper: true, optional: false,
        when: `${shortDay(r.sellOn)}, after 3 pm`, shares: null, price: r.lastPrice, priceNote: 'Any price', stop: null, stopNote: '', target: '', exit: '',
        why: `The dividend date is ${shortDay(r.exDate)}. Holding past it lost money after tax in testing`,
      })
    }
    for (const r of input.dividends.fresh) {
      const price = r.lastPrice ?? r.signalClose
      out.push({
        key: `dividend-buy-${r.symbol}`, side: 'BUY', symbol: r.symbol, rule: 'Dividend buy', paper: true, optional: false,
        when: 'Next session, after 3 pm', shares: sharesFor(perStock, price), price, priceNote: 'Any price', stop: null, stopNote: 'None in the tested rule',
        target: 'None', exit: `Sell ${shortDay(r.sellOn)}, after 3 pm, before the dividend date`,
        why: `Dividend of Rs ${r.amount} a share, ${r.yieldPct}% of the price`,
      })
    }
  }

  if (monthly && !monthly.blocked) {
    for (const o of monthly.orders) {
      out.push({
        key: `plan-${o.side}-${o.symbol}`, side: o.side, symbol: o.symbol, rule: `Monthly Plan (${monthly.modeLabel})`, paper: false, optional: false,
        when: 'Next session, any time', shares: o.qty, price: o.price, priceNote: 'Any price', stop: null, stopNote: 'None. The plan sells at the monthly review',
        target: 'None', exit: o.side === 'BUY' ? `Held until it falls below rank ${monthly.exitRank} at a month end` : '', why: o.why,
      })
    }
  }

  const order = { SELL: 0, SHORT: 1, BUY: 2 }
  return out.sort((a, b) => Number(a.optional) - Number(b.optional) || order[a.side] - order[b.side] || a.rule.localeCompare(b.rule) || a.symbol.localeCompare(b.symbol))
}
