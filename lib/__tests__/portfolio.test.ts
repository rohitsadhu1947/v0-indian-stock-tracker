import { describe, it, expect } from 'vitest'
import { scoreMomentum, rankMomentum, selectAffordable, type DailyBar } from '../portfolio/momentum'
import { trendRegime } from '../portfolio/regime'
import { allocateSleeves, rebalanceStatus } from '../portfolio/allocation'
import { planRebalance, applyOrders, bookValue } from '../portfolio/rebalance'

function series(n: number, f: (i: number) => number, volume = 1_000_000): DailyBar[] {
  return Array.from({ length: n }, (_, i) => ({
    date: new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10),
    close: f(i),
    volume,
  }))
}

// Deterministic wiggle so volatility is never zero
const wiggle = (i: number) => 1 + 0.01 * Math.sin(i * 1.7)

describe('momentum scoring', () => {
  it('computes 12-1 momentum over the right window and skips the last month', () => {
    // Flat 100 until the last 21 bars, which jump to 200: the jump is in the
    // skipped month, so momentum must be ~0, not +100%
    const bars = series(300, i => (i >= 279 ? 200 : 100) * wiggle(i))
    const r = scoreMomentum(bars)
    expect('stock' in r).toBe(true)
    if ('stock' in r) expect(Math.abs(r.stock.momentumPct)).toBeLessThan(3)
  })

  it('rewards steady trends over noisy ones with the same return', () => {
    const steady = series(300, i => 100 * Math.pow(1.002, i) * (1 + 0.002 * Math.sin(i)))
    const noisy = series(300, i => 100 * Math.pow(1.002, i) * (1 + 0.05 * Math.sin(i * 2.3)))
    const { ranked } = rankMomentum({ STEADY: steady, NOISY: noisy })
    expect(ranked[0].symbol).toBe('STEADY')
  })

  it('excludes short histories and illiquid stocks', () => {
    const r = rankMomentum({
      NEW: series(200, i => 100 * wiggle(i)),
      THIN: series(300, i => 100 * wiggle(i), 100), // 100 x Rs100 = Rs 0.0001 Cr/day
      OK: series(300, i => 100 * wiggle(i), 2_000_000), // ~Rs 20 Cr/day
    })
    expect(r.ranked.map(s => s.symbol)).toEqual(['OK'])
    expect(r.excluded.shortHistory).toBe(1)
    expect(r.excluded.illiquid).toBe(1)
  })

  it('flags zero or missing prices as bad data instead of scoring them', () => {
    const bars = series(300, i => 100 * wiggle(i))
    bars[150].close = 0
    expect('reason' in scoreMomentum(bars) && scoreMomentum(bars)).toEqual({ reason: 'badData' })
  })

  it('skips stocks priced above the per-position budget', () => {
    const ranked = [
      { symbol: 'MRF', score: 3, momentumPct: 30, volatilityPct: 20, tradedValueCr: 50, lastClose: 140000, lastDate: '2026-09-25' },
      { symbol: 'A', score: 2, momentumPct: 20, volatilityPct: 20, tradedValueCr: 50, lastClose: 500, lastDate: '2026-09-25' },
      { symbol: 'B', score: 1, momentumPct: 10, volatilityPct: 20, tradedValueCr: 50, lastClose: 800, lastDate: '2026-09-25' },
    ]
    const { picks, skippedUnaffordable } = selectAffordable(ranked, 2, 200000) // Rs 1L per position
    expect(picks.map(p => p.symbol)).toEqual(['A', 'B'])
    expect(skippedUnaffordable).toEqual(['MRF'])
  })
})

describe('trend regime', () => {
  it('is invested above the 200-day average and not below it', () => {
    const up = trendRegime(series(250, i => 100 + i).map(b => ({ date: b.date, close: b.close })))
    const down = trendRegime(series(250, i => 400 - i).map(b => ({ date: b.date, close: b.close })))
    expect(up?.invested).toBe(true)
    expect(down?.invested).toBe(false)
    expect(down!.distancePct).toBeLessThan(0)
  })

  it('returns null without 200 bars', () => {
    expect(trendRegime(series(150, () => 100))).toBeNull()
  })
})

describe('sleeve allocation', () => {
  const up = { invested: true, close: 110, sma200: 100, distancePct: 10, asOf: '2026-09-25' }
  const down = { invested: false, close: 90, sma200: 100, distancePct: -10, asOf: '2026-09-25' }

  it('maps each mode to its sleeves when the trend filter is off', () => {
    expect(allocateSleeves('growth', down, false)).toMatchObject({ momentum: 1, lowvol: 0, value: 0, cash: 0 })
    expect(allocateSleeves('defensive', down, false)).toMatchObject({ momentum: 0, lowvol: 1, value: 0, cash: 0 })
    const mf = allocateSleeves('multifactor', down, false)
    expect(mf.momentum + mf.lowvol + mf.value).toBeCloseTo(1)
    expect(mf.momentum).toBeCloseTo(1 / 3)
  })

  it('goes to cash in a downtrend only when the trend filter is on', () => {
    expect(allocateSleeves('multifactor', up, true)).toMatchObject({ cash: 0 })
    expect(allocateSleeves('multifactor', down, true)).toMatchObject({ momentum: 0, lowvol: 0, value: 0, cash: 1 })
    expect(allocateSleeves('growth', down, false).cash).toBe(0)
  })

  it('holds cash with the filter on when trend data is missing', () => {
    expect(allocateSleeves('defensive', null, true).cash).toBe(1)
    expect(allocateSleeves('defensive', null, false).cash).toBe(0)
  })
})

describe('rebalance calendar', () => {
  it('is due on a new month and not twice in the same month', () => {
    expect(rebalanceStatus(null, '2026-10-01').due).toBe(true)
    expect(rebalanceStatus('2026-09-01', '2026-10-01').due).toBe(true)
    expect(rebalanceStatus('2026-10-01', '2026-10-15').due).toBe(false)
  })
})

describe('rebalance orders', () => {
  it('builds an equal-weight book from cash in whole shares without overspending', () => {
    const plan = planRebalance({
      state: { cash: 300000, holdings: {} },
      targets: { A: 0.5, B: 0.5 },
      prices: { A: 1000, B: 333 },
    })
    const qty = Object.fromEntries(plan.orders.map(o => [o.symbol, o.qty]))
    expect(qty.A).toBeLessThanOrEqual(150)
    expect(qty.A).toBeGreaterThanOrEqual(148)
    expect(qty.B).toBeGreaterThanOrEqual(445)
    expect(plan.cashAfter).toBeGreaterThanOrEqual(0)
    expect(plan.orders.every(o => o.side === 'BUY' && o.reason === 'entry')).toBe(true)
  })

  it('sells names that dropped out and buys new ones', () => {
    const plan = planRebalance({
      state: { cash: 0, holdings: { OLD: { qty: 100, avgPrice: 1000 } } },
      targets: { NEW: 1 },
      prices: { OLD: 1000, NEW: 500 },
    })
    expect(plan.orders[0]).toMatchObject({ symbol: 'OLD', side: 'SELL', qty: 100, reason: 'exit' })
    expect(plan.orders[1]).toMatchObject({ symbol: 'NEW', side: 'BUY', reason: 'entry' })
    expect(plan.orders[1].qty).toBeGreaterThan(190)
  })

  it('leaves small drifts alone inside the resize band', () => {
    const plan = planRebalance({
      state: { cash: 0, holdings: { A: { qty: 105, avgPrice: 100 }, B: { qty: 95, avgPrice: 100 } } },
      targets: { A: 0.5, B: 0.5 },
      prices: { A: 100, B: 100 },
    })
    expect(plan.orders).toHaveLength(0)
  })

  it('skips orders below the minimum trade value', () => {
    const plan = planRebalance({
      state: { cash: 1500, holdings: {} },
      targets: { A: 1 },
      prices: { A: 100 },
    })
    expect(plan.orders).toHaveLength(0)
  })

  it('tops up underweight positions so rounding does not leave cash idle', () => {
    // Rs 15,000 per position; a Rs 9,600 share gets 1 share (64%) before top-up
    const plan = planRebalance({
      state: { cash: 30000, holdings: {} },
      targets: { PRICEY: 0.5, CHEAP: 0.5 },
      prices: { PRICEY: 9600, CHEAP: 100 },
    })
    const qty = Object.fromEntries(plan.orders.map(o => [o.symbol, o.qty]))
    expect(qty.PRICEY).toBe(1)                 // a second share would be 128% of target
    expect(qty.CHEAP).toBeGreaterThan(150)     // cheap name absorbs the leftover, capped at 125%
    expect(qty.CHEAP * 100).toBeLessThanOrEqual(15000 * 1.25)
    expect(plan.cashAfter).toBeGreaterThanOrEqual(0)
  })

  it('never tops up a name beyond 125% of its target', () => {
    const plan = planRebalance({ state: { cash: 100000, holdings: {} }, targets: { A: 0.2 }, prices: { A: 100 } })
    const a = plan.orders.find(o => o.symbol === 'A')!
    expect(a.qty * 100).toBeLessThanOrEqual(20000 * 1.25)
  })

  it('reports symbols without prices instead of trading them', () => {
    const plan = planRebalance({ state: { cash: 100000, holdings: {} }, targets: { A: 0.5, X: 0.5 }, prices: { A: 100 } })
    expect(plan.missingPrices).toEqual(['X'])
    expect(plan.orders.map(o => o.symbol)).toEqual(['A'])
  })
})

describe('paper execution', () => {
  it('charges slippage and costs, and keeps value roughly conserved', () => {
    const state = { cash: 300000, holdings: {} }
    const prices = { A: 1000, B: 500 }
    const plan = planRebalance({ state, targets: { A: 0.5, B: 0.5 }, prices })
    const { state: after, fills } = applyOrders(state, plan.orders, prices)

    expect(fills).toHaveLength(2)
    expect(fills.every(f => f.fillPrice > f.price && f.charges > 0)).toBe(true)
    expect(after.cash).toBeGreaterThanOrEqual(0)
    const value = bookValue(after, prices)
    expect(value).toBeLessThan(300000)          // costs are real
    expect(value).toBeGreaterThan(300000 * 0.995) // but small (~0.2% on entry)
  })

  it('updates average price on add-ons and removes fully sold holdings', () => {
    const start = { cash: 200000, holdings: { A: { qty: 10, avgPrice: 100 }, B: { qty: 5, avgPrice: 200 } } }
    const { state } = applyOrders(start, [
      { symbol: 'B', side: 'SELL', qty: 5, price: 210, value: 1050, reason: 'exit' },
      { symbol: 'A', side: 'BUY', qty: 10, price: 120, value: 1200, reason: 'resize' },
    ], { A: 120, B: 210 })
    expect(state.holdings.B).toBeUndefined()
    expect(state.holdings.A.qty).toBe(20)
    expect(state.holdings.A.avgPrice).toBeGreaterThan(110)
    expect(state.holdings.A.avgPrice).toBeLessThan(111)
  })
})
