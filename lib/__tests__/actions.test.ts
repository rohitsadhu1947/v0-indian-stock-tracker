import { describe, expect, it } from 'vitest'
import { LOSS_LIMIT_PCT, nextActions } from '@/lib/signals/actions'

const row = (over: object) => ({
  symbol: 'AAA', status: 'open', signalDate: '2026-11-02', jumpPct: 10, turnoverRatio: 4, signalClose: 100, strengthRank: 0.9,
  entryDate: '2026-11-03', entryPrice: 100, lastPrice: 100, movePct: 0, sessionsHeld: 10, exitAbout: '2027-01-29', exitDate: null, exitPrice: null, netPct: null, ...over,
})
const positional = (fresh: object[], open: object[]) => ({ asOf: '2026-11-27', holdSessions: 60, prices: 'last close', fresh, skippedWeak: [], open, closed: [], tally: { trades: 0, wins: 0, avgNetPct: 0 } }) as any
const base = { today: '2026-11-28', dayTrades: [], splits: null, monthly: null, perStock: 125000, perDayTrade: 50000 }

describe('nextActions', () => {
  it('turns a fresh results signal into a buy with shares, an optional loss limit and an exit', () => {
    const [a] = nextActions({ ...base, positional: positional([row({ status: 'new', lastPrice: 250, signalClose: 240 })], []) })
    expect(a).toMatchObject({ side: 'BUY', symbol: 'AAA', shares: 500, price: 250, optional: false, paper: false })
    expect(a.stop).toBe(250 * (1 - LOSS_LIMIT_PCT / 100))
    expect(a.exit).toContain('session 60')
  })

  it('lists a position whose sessions are up as a sell, ahead of any buy', () => {
    const actions = nextActions({ ...base, positional: positional([row({ status: 'new', symbol: 'NEW' })], [row({ symbol: 'OLD', sessionsHeld: 59 })]) })
    expect(actions.map(a => `${a.side} ${a.symbol}`)).toEqual(['SELL OLD', 'BUY NEW'])
  })

  it('marks a position past the loss limit as an optional sell, listed last', () => {
    const actions = nextActions({ ...base, positional: positional([row({ status: 'new', symbol: 'NEW' })], [row({ symbol: 'DOWN', movePct: -18, lastPrice: 82 })]) })
    expect(actions.map(a => a.symbol)).toEqual(['NEW', 'DOWN'])
    expect(actions[1]).toMatchObject({ side: 'SELL', optional: true, stop: 85 })
  })

  it('leaves a position alone when it is neither due nor past the limit', () => {
    expect(nextActions({ ...base, positional: positional([], [row({ movePct: -9 })]) })).toEqual([])
  })

  it('adds Monthly Plan orders unless they are blocked', () => {
    const monthly = { modeLabel: 'Growth', asOf: '2026-10-30', bookExists: true, kind: 'rebalance', prices: 'last close', blocked: null, exitRank: 40, cautions: {}, orders: [{ symbol: 'PLAN', side: 'BUY', qty: 12, price: 900, value: 10800, why: 'Rank 3' }] } as any
    expect(nextActions({ ...base, positional: null, monthly })[0]).toMatchObject({ side: 'BUY', symbol: 'PLAN', shares: 12, rule: 'Monthly Plan (Growth)' })
    expect(nextActions({ ...base, positional: null, monthly: { ...monthly, blocked: 'Already rebalanced this month' } })).toEqual([])
  })

  it('lists a paper split sell only from the evening before the sell day', () => {
    const split = (sellOn: string) => ({ asOf: '2026-11-27', fresh: [], closed: [], tally: { trades: 0, wins: 0, avgNetPct: 0 }, open: [{ symbol: 'SPL', status: 'open', signalDate: '2026-11-20', exDate: '2026-12-10', split: '1 share becomes 5', signalClose: 100, sellOn, entryDate: '2026-11-23', entryPrice: 100, lastPrice: 104, movePct: 4, exitDate: null, exitPrice: null, netPct: null }] }) as any
    expect(nextActions({ ...base, positional: null, splits: split('2026-12-09') })).toEqual([])
    expect(nextActions({ ...base, today: '2026-12-08', positional: null, splits: split('2026-12-09') })[0]).toMatchObject({ side: 'SELL', symbol: 'SPL', paper: true })
    // A Monday sell day is listed from the Friday before
    expect(nextActions({ ...base, today: '2026-12-04', positional: null, splits: split('2026-12-07') })).toHaveLength(1)
  })
})
