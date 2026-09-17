import { describe, it, expect, beforeAll, vi } from 'vitest'

// Mock the dependencies that multi-user-auth imports at top level
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  })),
}))
vi.mock('@/db', () => ({ db: {} }))
vi.mock('@/db/schema', () => ({ users: {}, userPermissions: {} }))
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn() }))
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}))

import { signSessionToken, verifySessionToken } from '../multi-user-auth'

beforeAll(() => {
  process.env.SESSION_SECRET = 'test-secret-key-for-unit-tests-only-do-not-use-in-production'
})

// ---------------------------------------------------------------------------
// signSessionToken + verifySessionToken round-trip
// ---------------------------------------------------------------------------
describe('signSessionToken / verifySessionToken round-trip', () => {
  it('sign then verify returns the correct userId', () => {
    const token = signSessionToken(42)
    const result = verifySessionToken(token)
    expect(result).toBe(42)
  })

  it('works for userId = 1', () => {
    const token = signSessionToken(1)
    expect(verifySessionToken(token)).toBe(1)
  })

  it('works for large userId', () => {
    const token = signSessionToken(999999)
    expect(verifySessionToken(token)).toBe(999999)
  })
})

// ---------------------------------------------------------------------------
// verifySessionToken rejects plain integer tokens (Phase 1 fix)
// ---------------------------------------------------------------------------
describe('verifySessionToken rejects legacy plain-integer tokens', () => {
  it('rejects "3"', () => {
    expect(verifySessionToken('3')).toBeNull()
  })

  it('rejects "42"', () => {
    expect(verifySessionToken('42')).toBeNull()
  })

  it('rejects "0"', () => {
    expect(verifySessionToken('0')).toBeNull()
  })

  it('rejects "999999"', () => {
    expect(verifySessionToken('999999')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// verifySessionToken rejects invalid HMAC
// ---------------------------------------------------------------------------
describe('verifySessionToken rejects tampered HMAC', () => {
  it('rejects a token with a modified HMAC', () => {
    const token = signSessionToken(42)
    const parts = token.split(':')
    // Flip a character in the HMAC
    const tamperedHmac = parts[2].startsWith('a')
      ? 'b' + parts[2].slice(1)
      : 'a' + parts[2].slice(1)
    const tamperedToken = `${parts[0]}:${parts[1]}:${tamperedHmac}`
    expect(verifySessionToken(tamperedToken)).toBeNull()
  })

  it('rejects a token with a modified userId', () => {
    const token = signSessionToken(42)
    const parts = token.split(':')
    const tamperedToken = `99:${parts[1]}:${parts[2]}`
    expect(verifySessionToken(tamperedToken)).toBeNull()
  })

  it('rejects a token with a modified timestamp', () => {
    const token = signSessionToken(42)
    const parts = token.split(':')
    const tamperedToken = `${parts[0]}:12345:${parts[2]}`
    expect(verifySessionToken(tamperedToken)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// verifySessionToken rejects malformed tokens
// ---------------------------------------------------------------------------
describe('verifySessionToken rejects malformed tokens', () => {
  it('rejects empty string', () => {
    expect(verifySessionToken('')).toBeNull()
  })

  it('rejects single part', () => {
    expect(verifySessionToken('onlyonepart')).toBeNull()
  })

  it('rejects two parts', () => {
    expect(verifySessionToken('42:12345')).toBeNull()
  })

  it('rejects four parts', () => {
    expect(verifySessionToken('42:12345:abc:extra')).toBeNull()
  })

  it('rejects non-numeric userId', () => {
    expect(verifySessionToken('abc:12345:deadbeef')).toBeNull()
  })

  it('rejects non-numeric timestamp', () => {
    expect(verifySessionToken('42:notanumber:deadbeef')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// verifySessionToken rejects expired tokens
// ---------------------------------------------------------------------------
describe('verifySessionToken rejects expired tokens', () => {
  it('rejects a token older than SESSION_MAX_AGE (24h)', () => {
    // Sign a token, then advance Date.now past the 24h expiry window
    const realDateNow = Date.now
    const signTime = realDateNow.call(Date)

    // Sign token at current time
    const token = signSessionToken(42)

    // Mock Date.now to return 25 hours later
    const twentyFiveHoursMs = 25 * 60 * 60 * 1000
    vi.spyOn(Date, 'now').mockReturnValue(signTime + twentyFiveHoursMs)

    expect(verifySessionToken(token)).toBeNull()

    vi.restoreAllMocks()
  })

  it('accepts a token within the 24h window', () => {
    const realDateNow = Date.now
    const signTime = realDateNow.call(Date)

    const token = signSessionToken(42)

    // Mock Date.now to return 23 hours later (still valid)
    const twentyThreeHoursMs = 23 * 60 * 60 * 1000
    vi.spyOn(Date, 'now').mockReturnValue(signTime + twentyThreeHoursMs)

    expect(verifySessionToken(token)).toBe(42)

    vi.restoreAllMocks()
  })
})
