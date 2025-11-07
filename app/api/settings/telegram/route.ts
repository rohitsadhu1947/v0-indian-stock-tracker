/**
 * Telegram Settings API
 * Manage Telegram bot connection and alert preferences
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { userPreferences } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'
import { getTelegramChatId, testTelegramConnection } from '@/lib/telegram-alerts'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// GET: Fetch current Telegram settings
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserIdCompat()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const prefs = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1)

    if (!prefs[0]) {
      // Create default preferences
      const [newPrefs] = await db
        .insert(userPreferences)
        .values({
          userId,
          telegramEnabled: false,
          telegramAlertPreferences: {
            newSignals: true,
            targetHits: true,
            stopLossHits: true,
            dailySummary: true,
            positionUpdates: false
          }
        })
        .returning()

      return NextResponse.json({
        success: true,
        preferences: {
          enabled: false,
          connected: false,
          botToken: '',
          chatId: '',
          alertPreferences: newPrefs.telegramAlertPreferences
        }
      })
    }

    return NextResponse.json({
      success: true,
      preferences: {
        enabled: prefs[0].telegramEnabled,
        connected: !!(prefs[0].telegramBotToken && prefs[0].telegramChatId),
        botToken: prefs[0].telegramBotToken || '',
        chatId: prefs[0].telegramChatId || '',
        alertPreferences: prefs[0].telegramAlertPreferences || {
          newSignals: true,
          targetHits: true,
          stopLossHits: true,
          dailySummary: true,
          positionUpdates: false
        }
      }
    })
  } catch (error: any) {
    console.error('❌ Failed to fetch Telegram settings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch settings', details: error.message },
      { status: 500 }
    )
  }
}

// POST: Update Telegram settings
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserIdCompat()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action, botToken, enabled, alertPreferences } = body

    // Action: Connect (get chat ID from bot)
    if (action === 'connect' && botToken) {
      console.log('🔗 Attempting to connect Telegram bot...')
      
      const chatInfo = await getTelegramChatId(botToken)
      
      if (!chatInfo) {
        return NextResponse.json({
          success: false,
          error: 'Could not get chat ID. Make sure you have sent a message to your bot first.'
        }, { status: 400 })
      }

      // Test the connection
      const testSuccess = await testTelegramConnection(botToken, chatInfo.chatId)
      
      if (!testSuccess) {
        return NextResponse.json({
          success: false,
          error: 'Connection test failed. Please check your bot token.'
        }, { status: 400 })
      }

      // Update database
      await db
        .update(userPreferences)
        .set({
          telegramBotToken: botToken,
          telegramChatId: chatInfo.chatId,
          telegramEnabled: true,
          updatedAt: new Date()
        })
        .where(eq(userPreferences.userId, userId))

      console.log(`✅ Telegram connected for user ${userId} (${chatInfo.firstName})`)

      return NextResponse.json({
        success: true,
        chatId: chatInfo.chatId,
        firstName: chatInfo.firstName,
        message: 'Telegram connected successfully! Check your bot for a confirmation message.'
      })
    }

    // Action: Disconnect
    if (action === 'disconnect') {
      await db
        .update(userPreferences)
        .set({
          telegramEnabled: false,
          telegramBotToken: null,
          telegramChatId: null,
          updatedAt: new Date()
        })
        .where(eq(userPreferences.userId, userId))

      return NextResponse.json({
        success: true,
        message: 'Telegram disconnected'
      })
    }

    // Action: Toggle enabled/disabled
    if (action === 'toggle' && typeof enabled === 'boolean') {
      await db
        .update(userPreferences)
        .set({
          telegramEnabled: enabled,
          updatedAt: new Date()
        })
        .where(eq(userPreferences.userId, userId))

      return NextResponse.json({
        success: true,
        enabled,
        message: enabled ? 'Telegram alerts enabled' : 'Telegram alerts disabled'
      })
    }

    // Action: Update alert preferences
    if (action === 'update_preferences' && alertPreferences) {
      await db
        .update(userPreferences)
        .set({
          telegramAlertPreferences: alertPreferences,
          updatedAt: new Date()
        })
        .where(eq(userPreferences.userId, userId))

      return NextResponse.json({
        success: true,
        alertPreferences,
        message: 'Alert preferences updated'
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action or missing parameters'
    }, { status: 400 })

  } catch (error: any) {
    console.error('❌ Failed to update Telegram settings:', error)
    return NextResponse.json(
      { error: 'Failed to update settings', details: error.message },
      { status: 500 }
    )
  }
}

