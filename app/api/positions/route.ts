/**
 * Positions API - Database Persistence
 * Handles CRUD operations for trading positions
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { positions } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { cookies } from 'next/headers'

/**
 * Helper function to get authenticated user ID
 */
async function getAuthenticatedUserId(): Promise<number | null> {
  try {
    const cookieStore = await cookies()
    const kiteUserId = cookieStore.get('kite_user_id')?.value
    
    if (!kiteUserId) {
      return null
    }
    
    // Get user from database using kite_user_id
    const { users } = await import('@/db/schema')
    const [user] = await db.select().from(users).where(eq(users.kiteUserId, kiteUserId)).limit(1)
    
    return user?.id || null
  } catch (error) {
    console.error('❌ Error getting authenticated user:', error)
    return null
  }
}

/**
 * GET /api/positions
 * Fetch all active positions for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId()
    
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated',
        positions: []
      }, { status: 401 })
    }
    
    // Fetch user's positions from database
    const userPositions = await db.select()
      .from(positions)
      .where(and(
        eq(positions.userId, userId),
        eq(positions.status, 'OPEN')
      ))
    
    console.log(`✅ Fetched ${userPositions.length} active positions for user ${userId}`)
    
    return NextResponse.json({
      success: true,
      positions: userPositions.map(pos => ({
        id: pos.id,
        symbol: pos.symbol,
        exchange: pos.exchange,
        entryPrice: pos.entryPrice,
        currentPrice: pos.currentPrice,
        quantity: pos.quantity,
        positionType: pos.positionType,
        stopLoss: pos.stopLoss,
        target: pos.target,
        pnl: pos.pnl,
        pnlPercent: pos.pnlPercent,
        status: pos.status,
        entryTime: pos.entryTime,
        exitTime: pos.exitTime
      }))
    })
  } catch (error) {
    console.error('❌ Error fetching positions:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch positions',
      positions: []
    }, { status: 500 })
  }
}

/**
 * POST /api/positions
 * Create a new position
 * Body: { symbol, exchange, entryPrice, quantity, positionType, stopLoss, target }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId()
    
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }
    
    const body = await request.json()
    const { 
      symbol, 
      exchange = 'NSE', 
      entryPrice, 
      quantity, 
      positionType,
      stopLoss,
      target
    } = body
    
    if (!symbol || !entryPrice || !quantity || !positionType) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields'
      }, { status: 400 })
    }
    
    // Create position
    const [newPosition] = await db.insert(positions).values({
      userId,
      symbol: symbol.toUpperCase(),
      exchange,
      entryPrice: parseFloat(entryPrice),
      currentPrice: parseFloat(entryPrice),
      quantity: parseInt(quantity),
      positionType,
      stopLoss: stopLoss ? parseFloat(stopLoss) : null,
      target: target ? parseFloat(target) : null,
      pnl: 0,
      pnlPercent: 0,
      status: 'OPEN'
    }).returning()
    
    console.log(`✅ Created position for ${symbol} (user ${userId})`)
    
    return NextResponse.json({
      success: true,
      message: `Position created for ${symbol}`,
      position: newPosition
    })
  } catch (error) {
    console.error('❌ Error creating position:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to create position'
    }, { status: 500 })
  }
}

/**
 * PUT /api/positions/:id
 * Update a position (current price, P&L, status)
 * Body: { currentPrice?, pnl?, pnlPercent?, status?, exitPrice?, exitTime? }
 */
export async function PUT(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId()
    
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }
    
    const { searchParams } = new URL(request.url)
    const positionId = searchParams.get('id')
    
    if (!positionId) {
      return NextResponse.json({
        success: false,
        error: 'Position ID is required'
      }, { status: 400 })
    }
    
    const body = await request.json()
    const updateData: any = {}
    
    if (body.currentPrice !== undefined) updateData.currentPrice = parseFloat(body.currentPrice)
    if (body.pnl !== undefined) updateData.pnl = parseFloat(body.pnl)
    if (body.pnlPercent !== undefined) updateData.pnlPercent = parseFloat(body.pnlPercent)
    if (body.status) updateData.status = body.status
    if (body.exitPrice !== undefined) updateData.exitPrice = parseFloat(body.exitPrice)
    if (body.exitTime) updateData.exitTime = new Date(body.exitTime)
    
    // Update position
    const [updatedPosition] = await db.update(positions)
      .set(updateData)
      .where(and(
        eq(positions.id, parseInt(positionId)),
        eq(positions.userId, userId)
      ))
      .returning()
    
    if (!updatedPosition) {
      return NextResponse.json({
        success: false,
        error: 'Position not found'
      }, { status: 404 })
    }
    
    console.log(`✅ Updated position ${positionId}`)
    
    return NextResponse.json({
      success: true,
      message: 'Position updated',
      position: updatedPosition
    })
  } catch (error) {
    console.error('❌ Error updating position:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to update position'
    }, { status: 500 })
  }
}

/**
 * DELETE /api/positions/:id
 * Close/Delete a position
 */
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId()
    
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }
    
    const { searchParams } = new URL(request.url)
    const positionId = searchParams.get('id')
    
    if (!positionId) {
      return NextResponse.json({
        success: false,
        error: 'Position ID is required'
      }, { status: 400 })
    }
    
    // Mark as closed instead of deleting
    const [closedPosition] = await db.update(positions)
      .set({ status: 'CLOSED', exitTime: new Date() })
      .where(and(
        eq(positions.id, parseInt(positionId)),
        eq(positions.userId, userId)
      ))
      .returning()
    
    if (!closedPosition) {
      return NextResponse.json({
        success: false,
        error: 'Position not found'
      }, { status: 404 })
    }
    
    console.log(`✅ Closed position ${positionId}`)
    
    return NextResponse.json({
      success: true,
      message: 'Position closed'
    })
  } catch (error) {
    console.error('❌ Error closing position:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to close position'
    }, { status: 500 })
  }
}

