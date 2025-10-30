/**
 * Authentication Helper Functions
 * 
 * These functions provide efficient user authentication checks
 * with caching to avoid repeated database queries.
 */

import { cookies } from 'next/headers';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

// In-memory cache for user IDs (cleared on server restart)
// This prevents repeated DB queries for the same user session
const userIdCache = new Map<string, { userId: number; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get the authenticated user's ID from their cookie
 * Uses an in-memory cache to avoid repeated database queries
 * 
 * @returns User ID if authenticated, null otherwise
 */
export async function getAuthenticatedUserId(): Promise<number | null> {
  try {
    const cookieStore = cookies();
    const kiteUserId = cookieStore.get('kite_user_id')?.value;
    
    if (!kiteUserId) {
      return null;
    }

    // Check cache first
    const cached = userIdCache.get(kiteUserId);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
      // Cache hit! No database query needed
      return cached.userId;
    }

    // Cache miss or expired - query database
    const user = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.kiteUserId, kiteUserId))
      .limit(1);

    if (user.length === 0) {
      return null;
    }

    const userId = user[0].id;

    // Store in cache for future requests
    userIdCache.set(kiteUserId, { userId, timestamp: now });

    return userId;
  } catch (error) {
    console.error('Error getting authenticated user ID:', error);
    return null;
  }
}

/**
 * Clear the user ID cache for a specific user
 * Call this when the user logs out
 */
export function clearUserIdCache(kiteUserId: string) {
  userIdCache.delete(kiteUserId);
}

/**
 * Clear all cached user IDs
 * Call this periodically or on server maintenance
 */
export function clearAllUserIdCaches() {
  userIdCache.clear();
}

