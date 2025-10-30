/**
 * In-Memory Data Cache for Watchlists and Positions
 * 
 * This cache dramatically reduces database queries to Neon (which is slow from India)
 * by storing frequently accessed data in memory.
 */

interface WatchlistCache {
  data: Array<{ symbol: string; exchange: string }>;
  timestamp: number;
}

interface PositionsCache {
  data: Array<any>;
  timestamp: number;
}

// Cache storage
const watchlistCache = new Map<number, WatchlistCache>();
const positionsCache = new Map<number, PositionsCache>();

// Cache TTL (Time To Live)
const WATCHLIST_TTL_MS = 60 * 1000; // 1 minute (watchlist changes are rare)
const POSITIONS_TTL_MS = 10 * 1000; // 10 seconds (positions update more frequently)

/**
 * Get cached watchlist for a user
 * @param userId User ID
 * @returns Cached watchlist or null if expired/not found
 */
export function getCachedWatchlist(userId: number): Array<{ symbol: string; exchange: string }> | null {
  const cached = watchlistCache.get(userId);
  if (!cached) {
    return null;
  }

  const now = Date.now();
  if (now - cached.timestamp > WATCHLIST_TTL_MS) {
    // Cache expired
    watchlistCache.delete(userId);
    return null;
  }

  return cached.data;
}

/**
 * Cache watchlist for a user
 * @param userId User ID
 * @param data Watchlist data
 */
export function setCachedWatchlist(userId: number, data: Array<{ symbol: string; exchange: string }>) {
  watchlistCache.set(userId, {
    data,
    timestamp: Date.now(),
  });
}

/**
 * Invalidate watchlist cache for a user (call after add/remove)
 * @param userId User ID
 */
export function invalidateWatchlistCache(userId: number) {
  watchlistCache.delete(userId);
}

/**
 * Get cached positions for a user
 * @param userId User ID
 * @returns Cached positions or null if expired/not found
 */
export function getCachedPositions(userId: number): Array<any> | null {
  const cached = positionsCache.get(userId);
  if (!cached) {
    return null;
  }

  const now = Date.now();
  if (now - cached.timestamp > POSITIONS_TTL_MS) {
    // Cache expired
    positionsCache.delete(userId);
    return null;
  }

  return cached.data;
}

/**
 * Cache positions for a user
 * @param userId User ID
 * @param data Positions data
 */
export function setCachedPositions(userId: number, data: Array<any>) {
  positionsCache.set(userId, {
    data,
    timestamp: Date.now(),
  });
}

/**
 * Invalidate positions cache for a user (call after add/update/close)
 * @param userId User ID
 */
export function invalidatePositionsCache(userId: number) {
  positionsCache.delete(userId);
}

/**
 * Clear all caches (for testing/debugging)
 */
export function clearAllCaches() {
  watchlistCache.clear();
  positionsCache.clear();
}

