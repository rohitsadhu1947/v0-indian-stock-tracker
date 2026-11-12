/**
 * Daily Summary Report API
 * Generates and sends a daily P&L summary via Telegram
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { paperPositions, userPreferences } from '@/db/schema'
import { eq, and, gte } from 'drizzle-orm'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'
import { sendDailySummaryAlert, type TelegramConfig } from '@/lib/telegram-alerts'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserIdCompat()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('\n📊 === DAILY SUMMARY GENERATION ===')
    console.log(`👤 User ID: ${userId}`)

    // Get today's date at midnight (IST)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    // Fetch all positions that were active today (opened today or still open)
    const todayPositions = await db
      .select()
      .from(paperPositions)
      .where(
        and(
          eq(paperPositions.userId, userId),
          gte(paperPositions.entryTime, today)
        )
      )

    // Also fetch currently open positions (for capital deployed)
    const openPositions = await db
      .select()
      .from(paperPositions)
      .where(
        and(
          eq(paperPositions.userId, userId),
          eq(paperPositions.status, 'open')
        )
      )

    // Calculate stats
    const totalTrades = todayPositions.filter(p => p.status === 'closed').length
    const winningTrades = todayPositions.filter(p => p.status === 'closed' && (p.pnl || 0) > 0).length
    const losingTrades = todayPositions.filter(p => p.status === 'closed' && (p.pnl || 0) < 0).length
    
    const totalPnL = todayPositions
      .filter(p => p.status === 'closed')
      .reduce((sum, p) => sum + (p.pnl || 0), 0)
    
    const totalCapitalUsed = todayPositions
      .filter(p => p.status === 'closed')
      .reduce((sum, p) => sum + (p.capitalRequired || (p.entryPrice * p.quantity)), 0)
    
    const totalPnLPercent = totalCapitalUsed > 0 ? (totalPnL / totalCapitalUsed) * 100 : 0

    // Find biggest winner and loser
    const closedToday = todayPositions.filter(p => p.status === 'closed')
    const biggestWinner = closedToday.length > 0
      ? closedToday.reduce((max, p) => ((p.pnl || 0) > (max.pnl || 0) ? p : max))
      : null
    const biggestLoser = closedToday.length > 0
      ? closedToday.reduce((min, p) => ((p.pnl || 0) < (min.pnl || 0) ? p : min))
      : null

    // Calculate capital deployed and available
    const capitalDeployed = openPositions.reduce((sum, p) => sum + (p.capitalRequired || 0), 0)
    const totalCapital = 300000 // TODO: Make this configurable per user
    const capitalAvailable = totalCapital - capitalDeployed

    const summary = {
      date: today.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      totalTrades,
      winningTrades,
      losingTrades,
      totalPnL,
      totalPnLPercent,
      biggestWinner: biggestWinner ? { symbol: biggestWinner.symbol, pnl: biggestWinner.pnl || 0 } : null,
      biggestLoser: biggestLoser ? { symbol: biggestLoser.symbol, pnl: biggestLoser.pnl || 0 } : null,
      openPositions: openPositions.length,
      capitalDeployed,
      capitalAvailable
    }

    console.log('📊 Daily summary:')
    console.log(`  Total trades: ${totalTrades} (${winningTrades}W / ${losingTrades}L)`)
    console.log(`  Total P&L: ₹${totalPnL.toFixed(2)} (${totalPnLPercent >= 0 ? '+' : ''}${totalPnLPercent.toFixed(2)}%)`)
    console.log(`  Open positions: ${openPositions.length}`)

    // Fetch user's Telegram preferences and send alert
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
      targetHits: true,
      stopLossHits: true,
      dailySummary: true,
    }

    if (telegramConfig.enabled && alertPrefs.dailySummary) {
      console.log('📱 Sending daily summary via Telegram...')
      await sendDailySummaryAlert(telegramConfig, summary)
      console.log('✅ Daily summary sent!')
    }

    return NextResponse.json({
      success: true,
      summary,
      telegramSent: telegramConfig.enabled && alertPrefs.dailySummary
    })

  } catch (error: any) {
    console.error('❌ Daily summary error:', error)
    return NextResponse.json(
      { error: 'Failed to generate daily summary', details: error.message },
      { status: 500 }
    )
  }
}

