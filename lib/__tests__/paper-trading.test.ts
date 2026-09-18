import { describe, it, expect } from 'vitest'
import { sideOf, calculatePnl, checkExit, validateLevels } from '../paper-trading'

describe('sideOf', () => {
  it('maps the stored position types used by the app', () => {
    expect(sideOf('BUY')).toBe('LONG')      // MomentumTab posts BUY
    expect(sideOf('LONG')).toBe('LONG')     // IntradayTab posts LONG
    expect(sideOf('SELL')).toBe('SHORT')
    expect(sideOf('SHORT')).toBe('SHORT')
    expect(sideOf('short')).toBe('SHORT')
    expect(sideOf(null)).toBe('LONG')
  })
})

describe('calculatePnl', () => {
  it('long: profits when price rises', () => {
    const r = calculatePnl({ positionType: 'BUY', entryPrice: 100, currentPrice: 110, quantity: 10 })
    expect(r.pnl).toBe(100)
    expect(r.pnlPercent).toBeCloseTo(10)
  })

  it('short: profits when price FALLS (was recorded as a loss)', () => {
    const r = calculatePnl({ positionType: 'SHORT', entryPrice: 100, currentPrice: 90, quantity: 10 })
    expect(r.pnl).toBe(100)
    expect(r.pnlPercent).toBeCloseTo(10)
  })

  it('short: loses when price rises', () => {
    const r = calculatePnl({ positionType: 'SELL', entryPrice: 100, currentPrice: 108, quantity: 5 })
    expect(r.pnl).toBe(-40)
    expect(r.pnlPercent).toBeCloseTo(-8)
  })
})

describe('checkExit', () => {
  const long = { positionType: 'BUY', entryPrice: 100, stopLoss: 95, target1: 110, target2: 115 }
  const short = { positionType: 'SHORT', entryPrice: 100, stopLoss: 105, target1: 90, target2: 85 }

  it('long: stop below, targets above', () => {
    expect(checkExit(long, 99)).toBeNull()
    expect(checkExit(long, 95)).toBe('STOP_LOSS')
    expect(checkExit(long, 94)).toBe('STOP_LOSS')
    expect(checkExit(long, 110)).toBe('TARGET_1')
    expect(checkExit(long, 116)).toBe('TARGET_2')
  })

  it('short: stop ABOVE entry, targets BELOW (previously inverted)', () => {
    expect(checkExit(short, 101)).toBeNull()
    expect(checkExit(short, 106)).toBe('STOP_LOSS')
    expect(checkExit(short, 90)).toBe('TARGET_1')
    expect(checkExit(short, 84)).toBe('TARGET_2')
  })

  it('does not exit a short at a price that would exit a long', () => {
    // 90 is below entry: profit for a short, and must not read as a stop
    expect(checkExit(short, 90)).toBe('TARGET_1')
  })

  it('prefers the stop when both stop and target are touched', () => {
    expect(checkExit({ ...long, stopLoss: 95, target1: 96 }, 95)).toBe('STOP_LOSS')
  })

  it('ignores missing levels', () => {
    expect(checkExit({ positionType: 'BUY', entryPrice: 100 }, 1)).toBeNull()
  })
})

describe('validateLevels', () => {
  it('accepts a sane long and short', () => {
    expect(validateLevels({ positionType: 'BUY', entryPrice: 100, stopLoss: 95, target1: 110 }).valid).toBe(true)
    expect(validateLevels({ positionType: 'SHORT', entryPrice: 100, stopLoss: 105, target1: 90 }).valid).toBe(true)
  })

  it('rejects a long whose stop is above entry (would exit instantly)', () => {
    const r = validateLevels({ positionType: 'BUY', entryPrice: 100, stopLoss: 105 })
    expect(r.valid).toBe(false)
    expect(r.error).toMatch(/Stop loss/)
  })

  it('rejects a short with a long-side stop — the IntradayTab SELL signal bug', () => {
    const r = validateLevels({ positionType: 'SHORT', entryPrice: 100, stopLoss: 95, target1: 110 })
    expect(r.valid).toBe(false)
  })
})
