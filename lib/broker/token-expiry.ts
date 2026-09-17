/**
 * Kite Connect access tokens are invalidated daily at 06:00 IST
 * (00:30 UTC), regardless of when they were issued.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
const FLUSH_HOUR_IST = 6

/** Most recent 06:00 IST at or before `now`. Tokens issued before this are dead. */
export function lastKiteTokenFlush(now: Date = new Date()): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS)
  const flushIst = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), FLUSH_HOUR_IST)
  let flush = flushIst - IST_OFFSET_MS
  if (flush > now.getTime()) flush -= 24 * 60 * 60 * 1000
  return new Date(flush)
}

/** When a Kite token issued at `issuedAt` stops working: the next 06:00 IST. */
export function nextKiteTokenExpiry(issuedAt: Date = new Date()): Date {
  return new Date(lastKiteTokenFlush(issuedAt).getTime() + 24 * 60 * 60 * 1000)
}

/**
 * Whether a stored broker token can still be used.
 * - Any broker: an explicit tokenExpiry in the past means dead.
 * - Kite: also dead if it was issued before the latest 06:00 IST flush
 *   (older rows stored a naive now+24h expiry that overshoots the flush).
 */
export function isBrokerTokenUsable(
  conn: { brokerId: string; tokenExpiry?: Date | null; lastConnected?: Date | null },
  now: Date = new Date()
): boolean {
  if (conn.tokenExpiry && conn.tokenExpiry.getTime() <= now.getTime()) return false
  if (conn.brokerId === 'kite' && conn.lastConnected) {
    return conn.lastConnected.getTime() >= lastKiteTokenFlush(now).getTime()
  }
  return true
}
