/**
 * Multi-User Authentication & Authorization Library
 * 
 * Features:
 * - Email/password authentication
 * - Role-based access control (RBAC)
 * - Session management via cookies
 * - Password hashing with bcrypt
 * - Permission checks
 * - Data isolation helpers
 */

import bcrypt from 'bcrypt'
import { cookies } from 'next/headers'
import { db } from '@/db'
import { users, userPermissions } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

export type UserRole = 'admin' | 'viewer' | 'trader' | 'custom'
export type UserStatus = 'active' | 'suspended' | 'pending'

export interface AuthUser {
  id: number
  email: string
  name: string | null
  role: UserRole
  status: UserStatus
  kiteUserId: string | null
  masterKiteToken: string | null
  masterKiteUserId: string | null
  createdAt: Date
  lastLogin: Date | null
}

export interface UserPermissionsData {
  canViewSignals: boolean
  canViewPositions: boolean
  canPaperTrade: boolean
  canViewResearch: boolean
  canRunBacktests: boolean
  canAddCustomStocks: boolean
  canViewMarketDashboard: boolean
  canManageUsers: boolean
  visibleTabs: string[]
  subscriptionTier: string
  subscriptionExpiresAt: Date | null
  maxPaperPositions: number
  maxBacktestsPerDay: number
  maxCustomStocks: number
}

const BCRYPT_ROUNDS = 10
const SESSION_COOKIE_NAME = 'auth_session'
const USER_ID_COOKIE_NAME = 'auth_user_id'

// ============================================================================
// PASSWORD HASHING
// ============================================================================

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Create a session for a user (set cookies)
 */
export async function createSession(userId: number): Promise<void> {
  const cookieStore = await cookies()
  
  console.log(`🍪 Creating session for user ID: ${userId}`)
  
  // Simple session: store user ID
  // In production, use a session token stored in DB
  cookieStore.set(USER_ID_COOKIE_NAME, userId.toString(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  })
  
  console.log(`✅ Session cookie set: ${USER_ID_COOKIE_NAME}=${userId}`)
  
  // Update last login
  await db
    .update(users)
    .set({ lastLogin: new Date() })
    .where(eq(users.id, userId))
  
  console.log(`✅ Last login updated for user ${userId}`)
}

/**
 * Get current user from session
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies()
  const userIdCookie = cookieStore.get(USER_ID_COOKIE_NAME)
  
  if (!userIdCookie) {
    return null
  }
  
  const userId = parseInt(userIdCookie.value)
  if (isNaN(userId)) {
    return null
  }
  
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      status: users.status,
      kiteUserId: users.kiteUserId,
      masterKiteToken: users.masterKiteToken,
      masterKiteUserId: users.masterKiteUserId,
      createdAt: users.createdAt,
      lastLogin: users.lastLogin,
    })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.status, 'active')))
    .limit(1)
  
  if (!user) {
    return null
  }
  
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as UserRole,
    status: user.status as UserStatus,
    kiteUserId: user.kiteUserId,
    masterKiteToken: user.masterKiteToken,
    masterKiteUserId: user.masterKiteUserId,
    createdAt: user.createdAt,
    lastLogin: user.lastLogin,
  }
}

/**
 * Destroy session (logout)
 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(USER_ID_COOKIE_NAME)
}

/**
 * Require authentication - throws if not logged in
 */
export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error('Authentication required')
  }
  return user
}

/**
 * Require specific role - throws if user doesn't have role
 */
export async function requireRole(role: UserRole | UserRole[]): Promise<AuthUser> {
  const user = await requireAuth()
  const roles = Array.isArray(role) ? role : [role]
  
  if (!roles.includes(user.role)) {
    throw new Error(`Access denied. Required role: ${roles.join(' or ')}`)
  }
  
  return user
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

export interface LoginResult {
  success: boolean
  user?: AuthUser
  error?: string
}

/**
 * Login with email and password
 */
export async function loginWithEmail(
  email: string,
  password: string
): Promise<LoginResult> {
  // Find user by email
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
  
  if (!user) {
    return {
      success: false,
      error: 'Invalid email or password',
    }
  }
  
  // Check if user is active
  if (user.status !== 'active') {
    return {
      success: false,
      error: 'Account is suspended or pending activation',
    }
  }
  
  // Verify password
  const isValid = await verifyPassword(password, user.passwordHash)
  if (!isValid) {
    return {
      success: false,
      error: 'Invalid email or password',
    }
  }
  
  // Create session
  await createSession(user.id)
  
  return {
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as UserRole,
      status: user.status as UserStatus,
      kiteUserId: user.kiteUserId,
      masterKiteToken: user.masterKiteToken,
      masterKiteUserId: user.masterKiteUserId,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
    },
  }
}

/**
 * Legacy Kite login support (for backward compatibility)
 */
export async function loginWithKite(kiteUserId: string): Promise<LoginResult> {
  // Find user by Kite user ID
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.kiteUserId, kiteUserId))
    .limit(1)
  
  if (!user) {
    return {
      success: false,
      error: 'Kite user not found. Please use email/password login.',
    }
  }
  
  if (user.status !== 'active') {
    return {
      success: false,
      error: 'Account is suspended or pending activation',
    }
  }
  
  await createSession(user.id)
  
  return {
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as UserRole,
      status: user.status as UserStatus,
      kiteUserId: user.kiteUserId,
      masterKiteToken: user.masterKiteToken,
      masterKiteUserId: user.masterKiteUserId,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
    },
  }
}

// ============================================================================
// USER PERMISSIONS
// ============================================================================

/**
 * Get user permissions
 */
export async function getUserPermissions(
  userId: number
): Promise<UserPermissionsData | null> {
  const [perms] = await db
    .select()
    .from(userPermissions)
    .where(eq(userPermissions.userId, userId))
    .limit(1)
  
  if (!perms) {
    return null
  }
  
  return {
    canViewSignals: perms.canViewSignals,
    canViewPositions: perms.canViewPositions,
    canPaperTrade: perms.canPaperTrade,
    canViewResearch: perms.canViewResearch,
    canRunBacktests: perms.canRunBacktests,
    canAddCustomStocks: perms.canAddCustomStocks,
    canViewMarketDashboard: perms.canViewMarketDashboard,
    canManageUsers: perms.canManageUsers,
    visibleTabs: (perms.visibleTabs as string[]) || [],
    subscriptionTier: perms.subscriptionTier,
    subscriptionExpiresAt: perms.subscriptionExpiresAt,
    maxPaperPositions: perms.maxPaperPositions,
    maxBacktestsPerDay: perms.maxBacktestsPerDay,
    maxCustomStocks: perms.maxCustomStocks,
  }
}

/**
 * Check if user has a specific permission
 */
export async function hasPermission(
  userId: number,
  permission: keyof UserPermissionsData
): Promise<boolean> {
  const perms = await getUserPermissions(userId)
  if (!perms) {
    return false
  }
  
  const value = perms[permission]
  return typeof value === 'boolean' ? value : false
}

/**
 * Require specific permission - throws if user doesn't have it
 */
export async function requirePermission(
  permission: keyof UserPermissionsData
): Promise<AuthUser> {
  const user = await requireAuth()
  
  // Admins have all permissions
  if (user.role === 'admin') {
    return user
  }
  
  const hasIt = await hasPermission(user.id, permission)
  if (!hasIt) {
    throw new Error(`Access denied. Missing permission: ${permission}`)
  }
  
  return user
}

// ============================================================================
// DATA ISOLATION
// ============================================================================

/**
 * Get the appropriate user ID for data queries
 * - Regular users: their own ID
 * - Admins: can optionally view another user's data via query param
 */
export async function getDataUserId(
  requestUrl?: string
): Promise<{ userId: number; isAdmin: boolean }> {
  const user = await requireAuth()
  
  // If admin and viewing another user
  if (user.role === 'admin' && requestUrl) {
    const url = new URL(requestUrl)
    const viewUserId = url.searchParams.get('view_user_id')
    if (viewUserId) {
      return {
        userId: parseInt(viewUserId),
        isAdmin: true,
      }
    }
  }
  
  return {
    userId: user.id,
    isAdmin: user.role === 'admin',
  }
}

/**
 * Get master Kite credentials (for fetching market data)
 */
export async function getMasterKiteCredentials(): Promise<{
  accessToken: string | null
  userId: string | null
} | null> {
  // Find the admin user with master Kite token
  const [admin] = await db
    .select({
      masterKiteToken: users.masterKiteToken,
      masterKiteUserId: users.masterKiteUserId,
    })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.status, 'active')))
    .limit(1)
  
  if (!admin || !admin.masterKiteToken) {
    return null
  }
  
  return {
    accessToken: admin.masterKiteToken,
    userId: admin.masterKiteUserId,
  }
}

/**
 * Get authenticated user ID (supports both old and new auth systems)
 * This is a compatibility helper for API routes during the transition
 */
export async function getAuthenticatedUserIdCompat(): Promise<number | null> {
  try {
    // Try new multi-user auth first
    const user = await getCurrentUser()
    if (user) {
      console.log(`✅ Auth compat: Found new auth user ID: ${user.id}`)
      return user.id
    }
  } catch (err) {
    console.log(`⚠️  Auth compat: New auth failed, trying old auth...`)
    // Ignore error, try fallback
  }
  
  try {
    // Fallback to old auth system
    const { getAuthenticatedUserId } = await import('@/lib/auth-helpers')
    const userId = await getAuthenticatedUserId()
    if (userId) {
      console.log(`✅ Auth compat: Found old auth user ID: ${userId}`)
    } else {
      console.log(`❌ Auth compat: No auth found in either system`)
    }
    return userId
  } catch (err) {
    console.log(`❌ Auth compat: Old auth also failed:`, err)
    return null
  }
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export function isValidPassword(password: string): {
  valid: boolean
  error?: string
} {
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' }
  }
  
  if (!/[A-Z]/.test(password)) {
    return {
      valid: false,
      error: 'Password must contain at least one uppercase letter',
    }
  }
  
  if (!/[a-z]/.test(password)) {
    return {
      valid: false,
      error: 'Password must contain at least one lowercase letter',
    }
  }
  
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' }
  }
  
  return { valid: true }
}

// ============================================================================
// USER CREATION (Admin only)
// ============================================================================

export interface CreateUserInput {
  email: string
  password: string
  name?: string
  role: UserRole
  kiteUserId?: string
  createdBy: number
}

export async function createUser(
  input: CreateUserInput
): Promise<{ success: boolean; userId?: number; error?: string }> {
  // Validate email
  if (!isValidEmail(input.email)) {
    return { success: false, error: 'Invalid email address' }
  }
  
  // Validate password
  const passwordCheck = isValidPassword(input.password)
  if (!passwordCheck.valid) {
    return { success: false, error: passwordCheck.error }
  }
  
  // Check if email already exists
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1)
  
  if (existing) {
    return { success: false, error: 'Email already registered' }
  }
  
  // Hash password
  const passwordHash = await hashPassword(input.password)
  
  try {
    // Create user
    const [newUser] = await db
      .insert(users)
      .values({
        email: input.email,
        passwordHash,
        name: input.name || null,
        role: input.role,
        status: 'active',
        kiteUserId: input.kiteUserId || null,
        createdBy: input.createdBy,
      })
      .returning({ id: users.id })
    
    // Create default permissions based on role
    const defaultPermissions = getDefaultPermissionsForRole(input.role)
    await db.insert(userPermissions).values({
      userId: newUser.id,
      ...defaultPermissions,
    })
    
    return { success: true, userId: newUser.id }
  } catch (error: any) {
    console.error('Error creating user:', error)
    return { success: false, error: 'Failed to create user' }
  }
}

function getDefaultPermissionsForRole(role: UserRole) {
  switch (role) {
    case 'admin':
      return {
        canViewSignals: true,
        canViewPositions: true,
        canPaperTrade: true,
        canViewResearch: true,
        canRunBacktests: true,
        canAddCustomStocks: true,
        canViewMarketDashboard: true,
        canManageUsers: true,
        visibleTabs: [
          'tradenow',
          'research',
          'positions',
          'backtest',
          'market',
          'settings',
          'admin',
        ],
        maxPaperPositions: 50,
        maxBacktestsPerDay: 20,
        maxCustomStocks: 50,
      }
    
    case 'trader':
      return {
        canViewSignals: true,
        canViewPositions: true,
        canPaperTrade: true,
        canViewResearch: true,
        canRunBacktests: true,
        canAddCustomStocks: true,
        canViewMarketDashboard: true,
        canManageUsers: false,
        visibleTabs: [
          'tradenow',
          'research',
          'positions',
          'backtest',
          'market',
          'settings',
        ],
        maxPaperPositions: 20,
        maxBacktestsPerDay: 10,
        maxCustomStocks: 20,
      }
    
    case 'viewer':
      return {
        canViewSignals: true,
        canViewPositions: false,
        canPaperTrade: false,
        canViewResearch: true,
        canRunBacktests: false,
        canAddCustomStocks: false,
        canViewMarketDashboard: true,
        canManageUsers: false,
        visibleTabs: ['tradenow', 'research', 'market'],
        maxPaperPositions: 0,
        maxBacktestsPerDay: 0,
        maxCustomStocks: 0,
      }
    
    default:
      return {
        canViewSignals: true,
        canViewPositions: false,
        canPaperTrade: true,
        canViewResearch: true,
        canRunBacktests: false,
        canAddCustomStocks: false,
        canViewMarketDashboard: true,
        canManageUsers: false,
        visibleTabs: ['tradenow', 'research', 'positions', 'market'],
        maxPaperPositions: 10,
        maxBacktestsPerDay: 3,
        maxCustomStocks: 5,
      }
  }
}

