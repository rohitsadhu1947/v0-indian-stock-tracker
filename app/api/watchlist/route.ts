/**
 * Watchlist API - Database Persistence
 * Handles CRUD operations for user watchlists
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { watchlists } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'
import logger from '@/lib/logger'

/**
 * GET /api/watchlist
 * Fetch all watchlist items for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserIdCompat()
    
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated',
        watchlist: []
      }, { status: 401 })
    }
    
    const userWatchlist = await db.select().from(watchlists).where(eq(watchlists.userId, userId))

    const watchlistData = userWatchlist.map(item => ({
      symbol: item.symbol,
      exchange: item.exchange,
      instrumentToken: item.instrumentToken,
      addedAt: item.addedAt
    }))

    logger.debug('Fetched watchlist', { userId, count: userWatchlist.length })

    return NextResponse.json({
      success: true,
      watchlist: watchlistData
    })
  } catch (error) {
    logger.error('Error fetching watchlist', { error: String(error) })
    return NextResponse.json({ success: false, error: 'Failed to fetch watchlist', watchlist: [] }, { status: 500 })
  }
}

/**
 * POST /api/watchlist
 * Add a stock to the watchlist
 * Body: { symbol: string, exchange: string, instrumentToken?: number }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserIdCompat()
    
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }
    
    const body = await request.json()
    const { symbol, exchange = 'NSE', instrumentToken } = body
    
    if (!symbol) {
      return NextResponse.json({
        success: false,
        error: 'Symbol is required'
      }, { status: 400 })
    }
    
    // Check if already exists
    const existing = await db.select()
      .from(watchlists)
      .where(and(
        eq(watchlists.userId, userId),
        eq(watchlists.symbol, symbol.toUpperCase()),
        eq(watchlists.exchange, exchange)
      ))
      .limit(1)
    
    if (existing.length > 0) {
      return NextResponse.json({
        success: false,
        error: 'Stock already in watchlist'
      }, { status: 400 })
    }
    
    // Add to database
    const [newItem] = await db.insert(watchlists).values({
      userId,
      symbol: symbol.toUpperCase(),
      exchange,
      instrumentToken
    }).returning()
    
    logger.info('Added to watchlist', { userId, symbol })

    return NextResponse.json({
      success: true,
      message: `Added ${symbol} to watchlist`,
      item: newItem
    })
  } catch (error) {
    logger.error('Error adding to watchlist', { error: String(error) })
    return NextResponse.json({
      success: false,
      error: 'Failed to add to watchlist'
    }, { status: 500 })
  }
}

/**
 * DELETE /api/watchlist
 * Remove a stock from the watchlist
 * Body: { symbol: string, exchange: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserIdCompat()
    
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }
    
    const body = await request.json()
    const { symbol, exchange = 'NSE' } = body
    
    if (!symbol) {
      return NextResponse.json({
        success: false,
        error: 'Symbol is required'
      }, { status: 400 })
    }
    
    // Delete from database
    await db.delete(watchlists)
      .where(and(
        eq(watchlists.userId, userId),
        eq(watchlists.symbol, symbol.toUpperCase()),
        eq(watchlists.exchange, exchange)
      ))
    
    logger.info('Removed from watchlist', { userId, symbol })

    return NextResponse.json({ success: true, message: `Removed ${symbol} from watchlist` })
  } catch (error) {
    logger.error('Error removing from watchlist', { error: String(error) })
    return NextResponse.json({
      success: false,
      error: 'Failed to remove from watchlist'
    }, { status: 500 })
  }
}

