/**
 * Kite Token Helper
 * 
 * Provides unified access to Kite API tokens for both:
 * - Kite users (use their own token from cookie)
 * - Email/password users (use master token from database)
 */

import { cookies } from 'next/headers'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq, and, isNotNull, desc } from 'drizzle-orm'

/**
 * Get Kite access token for API calls
 * 
 * Priority:
 * 1. Check kite_access_token cookie (Kite OAuth users)
 * 2. Check auth_user_id cookie → lookup master_kite_token in DB (email users)
 * 3. Return null if neither found
 * 
 * @returns Kite access token or null
 */
export async function getKiteAccessToken(): Promise<string | null> {
  try {
    const cookieStore = await cookies()
    
    // METHOD 1: Direct Kite cookie (for Kite OAuth users)
    const kiteToken = cookieStore.get('kite_access_token')?.value
    if (kiteToken) {
      console.log('✅ Using Kite token from cookie (Kite OAuth user)')
      return kiteToken
    }
    
    // METHOD 2: Lookup master token for email/password users
    const authUserId = cookieStore.get('auth_user_id')?.value
    if (!authUserId) {
      console.log('❌ No auth found (neither kite_access_token nor auth_user_id)')
      return null
    }
    
    console.log(`🔍 Looking up master Kite token for email user (auth_user_id: ${authUserId})`)
    
    // Find admin user with master Kite token
    // Try to find the most recently updated token (in case multiple admins)
    const [adminUser] = await db
      .select({
        masterKiteToken: users.masterKiteToken,
        kiteUserId: users.kiteUserId,
        lastLogin: users.lastLogin,
      })
      .from(users)
      .where(
        and(
          eq(users.role, 'admin'),
          isNotNull(users.masterKiteToken)
        )
      )
      .orderBy(desc(users.lastLogin)) // Get most recently logged in admin
      .limit(1)
    
    if (!adminUser?.masterKiteToken) {
      console.log('❌ No master Kite token found in database')
      console.log('💡 Tip: Admin user must login via Kite to set master token')
      return null
    }
    
    console.log(`✅ Using master Kite token from admin user (${adminUser.kiteUserId}, last login: ${adminUser.lastLogin})`)
    return adminUser.masterKiteToken
    
  } catch (error) {
    console.error('❌ Error getting Kite access token:', error)
    return null
  }
}

/**
 * Get Kite API key from environment
 */
export function getKiteApiKey(): string | null {
  return process.env.KITE_API_KEY || null
}

