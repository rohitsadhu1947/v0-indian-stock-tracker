/**
 * API route for paper trading (simulated) positions
 * Handles create, update, and fetch operations for paper trades
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { db } from '@/db'
import { paperPositions } from '@/db/schema'
import { getAuthenticatedUserId } from '@/lib/auth-helpers'
import { eq, and, desc } from 'drizzle-orm'

// POST - Create new paper position
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId()
    
    console.log('📝 Paper position POST - User ID:', userId)
    
    if (!userId) {
      // More helpful error
      const cookieStore = cookies()
      const kiteUserId = cookieStore.get('kite_user_id')?.value
      const accessToken = cookieStore.get('kite_access_token')?.value
      
      console.log('❌ Auth failed:', { 
        hasKiteUserId: !!kiteUserId, 
        hasAccessToken: !!accessToken,
        kiteUserId 
      })
      
      return NextResponse.json({ 
        error: 'Unauthorized - User not found in database. Please re-login.' 
      }, { status: 401 })
    }

    const body = await request.json()
    const {
      symbol,
      exchange,
      positionType,
      entryPrice,
      quantity,
      stopLoss,
      target1,
      target2,
      strategy,
      momentumScore,
      confidence,
      rsi,
      volumeRatio,
      reasons,
      warnings,
      capitalRequired,
      riskAmount,
      signalData: providedSignalData
    } = body

    // Validate required fields
    if (!symbol || !exchange || !positionType || !entryPrice || !quantity) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Store full signal data as JSONB (includes rsi, volumeRatio, reasons, warnings, etc.)
    const fullSignalData = providedSignalData || {
      rsi,
      volumeRatio,
      reasons,
      warnings,
      ...body // Include all other signal properties
    }

    // Create paper position
    const [newPosition] = await db
      .insert(paperPositions)
      .values({
        userId,
        symbol,
        exchange,
        positionType,
        entryPrice,
        quantity,
        currentPrice: entryPrice,
        stopLoss: stopLoss || null,
        target1: target1 || null,
        target2: target2 || null,
        pnl: 0,
        pnlPercent: 0,
        status: 'open',
        entryTime: new Date(),
        strategy: strategy || 'momentum',
        signalData: fullSignalData,
        momentumScore: momentumScore || null,
        confidence: confidence || null,
        riskAmount: riskAmount || null,
        capitalRequired: capitalRequired || null,
      })
      .returning()

    console.log(`📝 Paper trade created: ${symbol} (${quantity} shares @ ₹${entryPrice})`)

    return NextResponse.json({
      success: true,
      position: newPosition,
    })
  } catch (error: any) {
    console.error('Error creating paper position:', error)
    return NextResponse.json(
      { error: 'Failed to create paper position', details: error.message },
      { status: 500 }
    )
  }
}

// GET - Fetch all paper positions for user
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') // 'open', 'closed', or 'all'

    let query = db
      .select()
      .from(paperPositions)
      .where(eq(paperPositions.userId, userId))
      .orderBy(desc(paperPositions.entryTime))

    // Filter by status if provided
    if (status && status !== 'all') {
      query = db
        .select()
        .from(paperPositions)
        .where(
          and(
            eq(paperPositions.userId, userId),
            eq(paperPositions.status, status)
          )
        )
        .orderBy(desc(paperPositions.entryTime)) as any
    }

    const positions = await query

    console.log(`📊 Fetched ${positions.length} paper positions (status: ${status || 'all'})`)

    return NextResponse.json({
      success: true,
      positions,
    })
  } catch (error: any) {
    console.error('Error fetching paper positions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch paper positions', details: error.message },
      { status: 500 }
    )
  }
}

// PATCH - Update paper position (for P&L tracking and exit)
export async function PATCH(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { id, currentPrice, status, exitPrice, exitTime, notes } = body

    if (!id) {
      return NextResponse.json({ error: 'Position ID required' }, { status: 400 })
    }

    // Verify ownership
    const [existingPosition] = await db
      .select()
      .from(paperPositions)
      .where(
        and(eq(paperPositions.id, id), eq(paperPositions.userId, userId))
      )

    if (!existingPosition) {
      return NextResponse.json({ error: 'Position not found' }, { status: 404 })
    }

    // Calculate P&L if current price provided
    let pnl = existingPosition.pnl
    let pnlPercent = existingPosition.pnlPercent

    if (currentPrice) {
      const priceChange = currentPrice - existingPosition.entryPrice
      pnl = priceChange * existingPosition.quantity
      pnlPercent = (priceChange / existingPosition.entryPrice) * 100
    }

    // Update position
    const updateData: any = {
      updatedAt: new Date(),
    }

    if (currentPrice) {
      updateData.currentPrice = currentPrice
      updateData.pnl = pnl
      updateData.pnlPercent = pnlPercent
    }

    if (status) updateData.status = status
    if (exitPrice) updateData.exitPrice = exitPrice
    if (exitTime) updateData.exitTime = exitTime
    if (notes) updateData.notes = notes

    const [updatedPosition] = await db
      .update(paperPositions)
      .set(updateData)
      .where(and(eq(paperPositions.id, id), eq(paperPositions.userId, userId)))
      .returning()

    console.log(
      `🔄 Paper position updated: ${existingPosition.symbol} | P&L: ₹${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)`
    )

    return NextResponse.json({
      success: true,
      position: updatedPosition,
    })
  } catch (error: any) {
    console.error('Error updating paper position:', error)
    return NextResponse.json(
      { error: 'Failed to update paper position', details: error.message },
      { status: 500 }
    )
  }
}

