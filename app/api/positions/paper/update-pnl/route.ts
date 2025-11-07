/**
 * Auto P&L Update & Auto-Exit API
 * Fetches live prices for all open positions
 * Updates P&L and auto-exits when stop-loss or targets are hit
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { paperPositions, userPreferences } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'
import { sendTargetHitAlert, sendStopLossHitAlert, type TelegramConfig } from '@/lib/telegram-alerts'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface ExitInfo {
  positionId: number
  symbol: string
  reason: 'STOP_LOSS' | 'TARGET_1' | 'TARGET_2' | 'MANUAL'
  exitPrice: number
  entryPrice: number
  pnl: number
  pnlPercent: number
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserIdCompat()
    
    if (!userId) {
      return NextResponse.json({ 
        error: 'Unauthorized' 
      }, { status: 401 })
    }

    console.log('\n🔄 === AUTO P&L UPDATE STARTED ===')
    console.log(`👤 User ID: ${userId}`)

    // Fetch user's Telegram preferences
    const userPrefs = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1)
    
    const telegramConfig: TelegramConfig = {
      enabled: userPrefs[0]?.telegramEnabled || false,
      botToken: userPrefs[0]?.telegramBotToken || '',
      chatId: userPrefs[0]?.telegramChatId || ''
    }

    const alertPrefs = (userPrefs[0]?.telegramAlertPreferences as any) || {
      newSignals: true,
      targetHits: true,
      stopLossHits: true,
      dailySummary: true,
      positionUpdates: false
    }

    if (telegramConfig.enabled) {
      console.log(`📱 Telegram alerts enabled for user ${userId}`)
    }

    // Fetch all open positions for this user
    const openPositions = await db
      .select()
      .from(paperPositions)
      .where(
        and(
          eq(paperPositions.userId, userId),
          eq(paperPositions.status, 'open')
        )
      )

    console.log(`📊 Found ${openPositions.length} open positions`)

    if (openPositions.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No open positions to update',
        updated: 0,
        autoExits: []
      })
    }

    // Get unique symbols
    const symbols = [...new Set(openPositions.map(p => p.symbol))]
    console.log(`📈 Fetching live prices for: ${symbols.join(', ')}`)

    // Build proper symbol format for Kite API (NSE:SYMBOL)
    const formattedSymbols = symbols.map(s => `NSE:${s}`).join(',')
    
    // Fetch live prices from Kite API
    const priceResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/kite/quote?symbols=${formattedSymbols}`, {
      headers: {
        'Cookie': request.headers.get('cookie') || ''
      }
    })

    if (!priceResponse.ok) {
      const errorText = await priceResponse.text()
      console.error('❌ Kite API failed:', priceResponse.status, errorText)
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch live prices from Kite API',
        details: errorText
      }, { status: 500 })
    }

    const priceResult = await priceResponse.json()
    
    if (!priceResult.success || !priceResult.data) {
      console.error('❌ Kite API returned invalid data:', priceResult)
      return NextResponse.json({
        success: false,
        error: 'Kite API returned invalid data',
        details: priceResult
      }, { status: 500 })
    }

    // Extract LTP from quotes
    const priceData: Record<string, number> = {}
    Object.entries(priceResult.data).forEach(([key, quote]: [string, any]) => {
      const symbol = key.split(':')[1] // Extract symbol from NSE:SYMBOL
      if (symbol && quote.last_price) {
        priceData[symbol] = quote.last_price
        console.log(`  💹 ${symbol}: ₹${quote.last_price} (Live from Kite)`)
      }
    })
    
    console.log(`✅ Fetched LIVE prices for ${Object.keys(priceData).length} symbols`)
    
    if (Object.keys(priceData).length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No price data received from Kite API',
        details: priceResult
      }, { status: 500 })
    }

    const updates: any[] = []
    const autoExits: ExitInfo[] = []

    // Process each position
    for (const position of openPositions) {
      const currentPrice = priceData[position.symbol] || position.currentPrice || position.entryPrice
      
      // Calculate P&L
      const priceChange = currentPrice - position.entryPrice
      const pnl = priceChange * position.quantity
      const pnlPercent = (priceChange / position.entryPrice) * 100

      // Check for auto-exit conditions
      let shouldExit = false
      let exitReason: 'STOP_LOSS' | 'TARGET_1' | 'TARGET_2' | null = null

      // Check stop-loss
      if (position.stopLoss && currentPrice <= position.stopLoss) {
        shouldExit = true
        exitReason = 'STOP_LOSS'
        console.log(`🔴 STOP LOSS HIT: ${position.symbol} @ ₹${currentPrice} (SL: ₹${position.stopLoss})`)
      }
      // Check target 2 (higher priority)
      else if (position.target2 && currentPrice >= position.target2) {
        shouldExit = true
        exitReason = 'TARGET_2'
        console.log(`🟢 TARGET 2 HIT: ${position.symbol} @ ₹${currentPrice} (T2: ₹${position.target2})`)
      }
      // Check target 1
      else if (position.target1 && currentPrice >= position.target1) {
        shouldExit = true
        exitReason = 'TARGET_1'
        console.log(`🟢 TARGET 1 HIT: ${position.symbol} @ ₹${currentPrice} (T1: ₹${position.target1})`)
      }

      if (shouldExit && exitReason) {
        // Auto-exit the position
        const [updated] = await db
          .update(paperPositions)
          .set({
            currentPrice,
            exitPrice: currentPrice,
            pnl,
            pnlPercent,
            status: 'closed',
            exitTime: new Date(),
            exitReason: exitReason.toLowerCase().replace('_', ' '),
            notes: `Auto-exited: ${exitReason}`,
            updatedAt: new Date()
          })
          .where(eq(paperPositions.id, position.id))
          .returning()

        autoExits.push({
          positionId: position.id,
          symbol: position.symbol,
          reason: exitReason,
          exitPrice: currentPrice,
          entryPrice: position.entryPrice,
          pnl,
          pnlPercent
        })

        updates.push(updated)

        // 📱 SEND TELEGRAM ALERT for exit
        if (telegramConfig.enabled) {
          const entryTime = position.entryTime ? new Date(position.entryTime) : new Date()
          const exitTime = new Date()
          const holdingMinutes = Math.floor((exitTime.getTime() - entryTime.getTime()) / 60000)
          const holdingHours = Math.floor(holdingMinutes / 60)
          const holdingMins = holdingMinutes % 60
          const holdingTimeStr = holdingHours > 0 
            ? `${holdingHours}h ${holdingMins}m` 
            : `${holdingMins}m`

          if (exitReason === 'STOP_LOSS' && alertPrefs.stopLossHits) {
            // Send stop-loss alert
            await sendStopLossHitAlert(telegramConfig, {
              symbol: position.symbol,
              exchange: position.exchange,
              entryPrice: position.entryPrice,
              currentPrice,
              stopLoss: position.stopLoss || 0,
              pnl,
              pnlPercent,
              quantity: position.quantity,
              holdingTime: holdingTimeStr
            })
            console.log(`📱 Sent stop-loss alert for ${position.symbol}`)
          } else if ((exitReason === 'TARGET_1' || exitReason === 'TARGET_2') && alertPrefs.targetHits) {
            // Send target hit alert
            const targetLevel = exitReason === 'TARGET_1' ? 1 : 2
            const targetPrice = exitReason === 'TARGET_1' ? position.target1 : position.target2
            await sendTargetHitAlert(telegramConfig, {
              symbol: position.symbol,
              exchange: position.exchange,
              entryPrice: position.entryPrice,
              currentPrice,
              targetLevel,
              targetPrice: targetPrice || 0,
              pnl,
              pnlPercent,
              quantity: position.quantity,
              holdingTime: holdingTimeStr
            })
            console.log(`📱 Sent target hit alert for ${position.symbol} (T${targetLevel})`)
          }
        }
      } else {
        // Just update P&L
        const [updated] = await db
          .update(paperPositions)
          .set({
            currentPrice,
            pnl,
            pnlPercent,
            updatedAt: new Date()
          })
          .where(eq(paperPositions.id, position.id))
          .returning()

        updates.push(updated)
      }
    }

    console.log(`✅ Updated ${updates.length} positions`)
    console.log(`🎯 Auto-exited ${autoExits.length} positions`)
    
    if (autoExits.length > 0) {
      console.log('\n📊 Auto-Exit Summary:')
      autoExits.forEach(exit => {
        const profitEmoji = exit.pnl >= 0 ? '💰' : '💸'
        console.log(`${profitEmoji} ${exit.symbol}: ${exit.reason} @ ₹${exit.exitPrice.toFixed(2)} | P&L: ₹${exit.pnl.toFixed(2)} (${exit.pnlPercent > 0 ? '+' : ''}${exit.pnlPercent.toFixed(2)}%)`)
      })
    }

    return NextResponse.json({
      success: true,
      updated: updates.length,
      autoExits,
      positions: updates
    })

  } catch (error: any) {
    console.error('❌ Auto P&L update error:', error)
    return NextResponse.json(
      { error: 'Failed to update positions', details: error.message },
      { status: 500 }
    )
  }
}

// GET endpoint to check status
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId()
    
    if (!userId) {
      return NextResponse.json({ 
        error: 'Unauthorized' 
      }, { status: 401 })
    }

    // Get count of open positions
    const openPositions = await db
      .select()
      .from(paperPositions)
      .where(
        and(
          eq(paperPositions.userId, userId),
          eq(paperPositions.status, 'open')
        )
      )

    // Calculate total P&L
    const totalPnL = openPositions.reduce((sum, p) => sum + (p.pnl || 0), 0)
    const totalCapital = openPositions.reduce((sum, p) => sum + (p.capitalRequired || 0), 0)

    return NextResponse.json({
      success: true,
      openPositions: openPositions.length,
      totalPnL,
      totalCapital,
      lastUpdate: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('❌ Status check error:', error)
    return NextResponse.json(
      { error: 'Failed to check status', details: error.message },
      { status: 500 }
    )
  }
}

