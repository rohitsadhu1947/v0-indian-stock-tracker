import { describe, it, expect } from 'vitest'
import { lastKiteTokenFlush, nextKiteTokenExpiry, isBrokerTokenUsable } from '../broker/token-expiry'

// 06:00 IST == 00:30 UTC
describe('Kite token expiry', () => {
  it('a token issued at 09:15 IST expires at 06:00 IST the next day', () => {
    const issued = new Date('2026-09-17T03:45:00Z') // 09:15 IST
    expect(nextKiteTokenExpiry(issued).toISOString()).toBe('2026-09-18T00:30:00.000Z')
  })

  it('a token issued at 02:00 IST expires at 06:00 IST the same day', () => {
    const issued = new Date('2026-09-16T20:30:00Z') // 02:00 IST on 17 Sep
    expect(nextKiteTokenExpiry(issued).toISOString()).toBe('2026-09-17T00:30:00.000Z')
  })

  it('last flush before 06:00 IST is the previous morning', () => {
    const now = new Date('2026-09-17T00:00:00Z') // 05:30 IST
    expect(lastKiteTokenFlush(now).toISOString()).toBe('2026-09-16T00:30:00.000Z')
  })

  it('rejects yesterday\'s Kite token even if its stored expiry is in the future', () => {
    const now = new Date('2026-09-17T04:00:00Z') // 09:30 IST
    const conn = {
      brokerId: 'kite',
      lastConnected: new Date('2026-09-16T10:00:00Z'), // 15:30 IST yesterday
      tokenExpiry: new Date('2026-09-17T10:00:00Z'),   // naive now+24h
    }
    expect(isBrokerTokenUsable(conn, now)).toBe(false)
  })

  it('accepts a Kite token issued after this morning\'s flush', () => {
    const now = new Date('2026-09-17T08:00:00Z')
    const conn = { brokerId: 'kite', lastConnected: new Date('2026-09-17T03:00:00Z'), tokenExpiry: null }
    expect(isBrokerTokenUsable(conn, now)).toBe(true)
  })

  it('rejects any broker token past its explicit expiry', () => {
    const now = new Date('2026-09-17T08:00:00Z')
    expect(isBrokerTokenUsable({ brokerId: 'angel', tokenExpiry: new Date('2026-09-17T07:00:00Z') }, now)).toBe(false)
    expect(isBrokerTokenUsable({ brokerId: 'angel', tokenExpiry: new Date('2026-09-17T09:00:00Z') }, now)).toBe(true)
  })
})
