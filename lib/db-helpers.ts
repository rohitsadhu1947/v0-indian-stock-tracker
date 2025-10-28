/**
 * Database Helper Functions
 * Common database operations for Indian Stock Tracker
 */

import { db, schema } from '@/db'
import { eq, and, desc, gte, lte } from 'drizzle-orm'

// ============================================
// USER OPERATIONS
// ============================================

export async function getOrCreateUser(kiteUserId: string, email?: string, name?: string) {
  // Try to find existing user
  const existingUser = await db.query.users.findFirst({
    where: eq(schema.users.kiteUserId, kiteUserId),
  })

  if (existingUser) {
    // Update last login
    await db
      .update(schema.users)
      .set({ lastLogin: new Date() })
      .where(eq(schema.users.id, existingUser.id))
    
    return existingUser
  }

  // Create new user
  const [newUser] = await db
    .insert(schema.users)
    .values({
      kiteUserId,
      email,
      name,
      lastLogin: new Date(),
    })
    .returning()

  // Create default preferences
  await db.insert(schema.userPreferences).values({
    userId: newUser.id,
  })

  return newUser
}

export async function getUserPreferences(userId: number) {
  return await db.query.userPreferences.findFirst({
    where: eq(schema.userPreferences.userId, userId),
  })
}

export async function updateUserPreferences(userId: number, preferences: Partial<typeof schema.userPreferences.$inferInsert>) {
  return await db
    .update(schema.userPreferences)
    .set({ ...preferences, updatedAt: new Date() })
    .where(eq(schema.userPreferences.userId, userId))
    .returning()
}

// ============================================
// SESSION OPERATIONS
// ============================================

export async function saveSession(userId: number, accessToken: string, refreshToken: string | null, expiresAt: Date) {
  // Delete old sessions for this user
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId))

  // Create new session
  const [session] = await db
    .insert(schema.sessions)
    .values({
      userId,
      accessToken,
      refreshToken,
      expiresAt,
    })
    .returning()

  return session
}

export async function getValidSession(userId: number) {
  return await db.query.sessions.findFirst({
    where: and(
      eq(schema.sessions.userId, userId),
      gte(schema.sessions.expiresAt, new Date())
    ),
  })
}

export async function deleteSession(userId: number) {
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId))
}

// ============================================
// WATCHLIST OPERATIONS
// ============================================

export async function getWatchlist(userId: number) {
  return await db.query.watchlists.findMany({
    where: eq(schema.watchlists.userId, userId),
    orderBy: desc(schema.watchlists.addedAt),
  })
}

export async function addToWatchlist(
  userId: number,
  symbol: string,
  exchange: string,
  instrumentToken?: number
) {
  // Check if already exists
  const existing = await db.query.watchlists.findFirst({
    where: and(
      eq(schema.watchlists.userId, userId),
      eq(schema.watchlists.symbol, symbol),
      eq(schema.watchlists.exchange, exchange)
    ),
  })

  if (existing) {
    return existing
  }

  const [watchlistItem] = await db
    .insert(schema.watchlists)
    .values({
      userId,
      symbol,
      exchange,
      instrumentToken,
    })
    .returning()

  return watchlistItem
}

export async function removeFromWatchlist(userId: number, symbol: string, exchange: string) {
  await db
    .delete(schema.watchlists)
    .where(
      and(
        eq(schema.watchlists.userId, userId),
        eq(schema.watchlists.symbol, symbol),
        eq(schema.watchlists.exchange, exchange)
      )
    )
}

// ============================================
// POSITION OPERATIONS
// ============================================

export async function getOpenPositions(userId: number) {
  return await db.query.positions.findMany({
    where: and(
      eq(schema.positions.userId, userId),
      eq(schema.positions.status, 'open')
    ),
    orderBy: desc(schema.positions.entryTime),
  })
}

export async function getAllPositions(userId: number) {
  return await db.query.positions.findMany({
    where: eq(schema.positions.userId, userId),
    orderBy: desc(schema.positions.entryTime),
  })
}

export async function createPosition(
  userId: number,
  data: {
    symbol: string
    exchange: string
    entryPrice: number
    quantity: number
    stopLoss?: number
    target?: number
    strategy?: string
    notes?: string
  }
) {
  const [position] = await db
    .insert(schema.positions)
    .values({
      userId,
      ...data,
      entryTime: new Date(),
    })
    .returning()

  return position
}

export async function updatePosition(positionId: number, data: Partial<typeof schema.positions.$inferInsert>) {
  const [position] = await db
    .update(schema.positions)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.positions.id, positionId))
    .returning()

  return position
}

export async function closePosition(
  positionId: number,
  exitPrice: number,
  exitReason?: string
) {
  // Get position details
  const position = await db.query.positions.findFirst({
    where: eq(schema.positions.id, positionId),
  })

  if (!position) {
    throw new Error('Position not found')
  }

  // Calculate P&L
  const pnl = (exitPrice - position.entryPrice) * position.quantity
  const pnlPercent = ((exitPrice - position.entryPrice) / position.entryPrice) * 100

  // Update position
  const [closedPosition] = await db
    .update(schema.positions)
    .set({
      status: 'closed',
      exitPrice,
      exitTime: new Date(),
      pnl,
      pnlPercent,
      currentPrice: exitPrice,
      updatedAt: new Date(),
    })
    .where(eq(schema.positions.id, positionId))
    .returning()

  // Create trade history entry
  const duration = Math.floor((new Date().getTime() - position.entryTime.getTime()) / (1000 * 60))
  await db.insert(schema.tradeHistory).values({
    userId: position.userId,
    positionId: position.id,
    symbol: position.symbol,
    exchange: position.exchange,
    entryPrice: position.entryPrice,
    exitPrice,
    quantity: position.quantity,
    pnl,
    pnlPercent,
    strategy: position.strategy,
    exitReason,
    entryTime: position.entryTime,
    exitTime: new Date(),
    duration,
  })

  return closedPosition
}

// ============================================
// CACHE OPERATIONS
// ============================================

export async function getCachedQuote(symbol: string, exchange: string, maxAgeMinutes = 5) {
  const minFetchedAt = new Date(Date.now() - maxAgeMinutes * 60 * 1000)
  
  return await db.query.stockQuotes.findFirst({
    where: and(
      eq(schema.stockQuotes.symbol, symbol),
      eq(schema.stockQuotes.exchange, exchange),
      gte(schema.stockQuotes.fetchedAt, minFetchedAt)
    ),
  })
}

export async function cacheQuote(
  symbol: string,
  exchange: string,
  data: {
    instrumentToken?: number
    lastPrice?: number
    open?: number
    high?: number
    low?: number
    close?: number
    volume?: number
    change?: number
    changePercent?: number
    ohlc?: any
  }
) {
  // Upsert: Update if exists, insert if not
  const existing = await db.query.stockQuotes.findFirst({
    where: and(
      eq(schema.stockQuotes.symbol, symbol),
      eq(schema.stockQuotes.exchange, exchange)
    ),
  })

  if (existing) {
    const [quote] = await db
      .update(schema.stockQuotes)
      .set({ ...data, fetchedAt: new Date() })
      .where(eq(schema.stockQuotes.id, existing.id))
      .returning()
    return quote
  }

  const [quote] = await db
    .insert(schema.stockQuotes)
    .values({
      symbol,
      exchange,
      ...data,
    })
    .returning()

  return quote
}

export async function getCachedHistoricalData(
  symbol: string,
  exchange: string,
  interval: string,
  fromDate: Date,
  toDate: Date,
  maxAgeMinutes = 60
) {
  const minFetchedAt = new Date(Date.now() - maxAgeMinutes * 60 * 1000)

  return await db.query.historicalData.findFirst({
    where: and(
      eq(schema.historicalData.symbol, symbol),
      eq(schema.historicalData.exchange, exchange),
      eq(schema.historicalData.interval, interval),
      lte(schema.historicalData.fromDate, fromDate),
      gte(schema.historicalData.toDate, toDate),
      gte(schema.historicalData.fetchedAt, minFetchedAt)
    ),
  })
}

export async function cacheHistoricalData(
  symbol: string,
  exchange: string,
  interval: string,
  fromDate: Date,
  toDate: Date,
  candles: any,
  instrumentToken?: number
) {
  const [data] = await db
    .insert(schema.historicalData)
    .values({
      symbol,
      exchange,
      interval,
      fromDate,
      toDate,
      candles,
      instrumentToken,
    })
    .returning()

  return data
}

// ============================================
// TRADE HISTORY
// ============================================

export async function getTradeHistory(userId: number, limit = 100) {
  return await db.query.tradeHistory.findMany({
    where: eq(schema.tradeHistory.userId, userId),
    orderBy: desc(schema.tradeHistory.exitTime),
    limit,
  })
}

export async function getTradeStatistics(userId: number) {
  const trades = await db.query.tradeHistory.findMany({
    where: eq(schema.tradeHistory.userId, userId),
  })

  if (trades.length === 0) {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalPnL: 0,
      averagePnL: 0,
      bestTrade: 0,
      worstTrade: 0,
    }
  }

  const winningTrades = trades.filter(t => t.pnl > 0)
  const losingTrades = trades.filter(t => t.pnl <= 0)
  const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0)
  const averagePnL = totalPnL / trades.length
  const bestTrade = Math.max(...trades.map(t => t.pnl))
  const worstTrade = Math.min(...trades.map(t => t.pnl))

  return {
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate: (winningTrades.length / trades.length) * 100,
    totalPnL,
    averagePnL,
    bestTrade,
    worstTrade,
  }
}

// ============================================
// SCREENER RESULTS
// ============================================

export async function saveScreenerResults(
  userId: number,
  screenerType: string,
  screenerLevel: string | null,
  results: any,
  totalStocks?: number,
  signalCount?: number
) {
  const [screener] = await db
    .insert(schema.screenerResults)
    .values({
      userId,
      screenerType,
      screenerLevel,
      results,
      totalStocks,
      signalCount,
    })
    .returning()

  return screener
}

export async function getLatestScreenerResults(userId: number, screenerType: string) {
  return await db.query.screenerResults.findFirst({
    where: and(
      eq(schema.screenerResults.userId, userId),
      eq(schema.screenerResults.screenerType, screenerType)
    ),
    orderBy: desc(schema.screenerResults.runAt),
  })
}

// ============================================
// ALERTS
// ============================================

export async function createAlert(
  userId: number,
  data: {
    symbol?: string
    alertType: string
    message: string
    priority?: string
    actionRequired?: boolean
    metadata?: any
  }
) {
  const [alert] = await db
    .insert(schema.alerts)
    .values({
      userId,
      ...data,
    })
    .returning()

  return alert
}

export async function getUnreadAlerts(userId: number) {
  return await db.query.alerts.findMany({
    where: and(
      eq(schema.alerts.userId, userId),
      eq(schema.alerts.isRead, false)
    ),
    orderBy: desc(schema.alerts.createdAt),
  })
}

export async function markAlertAsRead(alertId: number) {
  await db
    .update(schema.alerts)
    .set({ isRead: true })
    .where(eq(schema.alerts.id, alertId))
}

