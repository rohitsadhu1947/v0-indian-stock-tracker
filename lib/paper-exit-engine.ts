/**
 * Paper position exit engine.
 *
 * One implementation shared by the user-triggered route
 * (POST /api/positions/paper/update-pnl) and the scheduled job
 * (GET /api/cron/check-exits), so stops and targets are honoured even when
 * nobody has the app open.
 *
 * Prices come from the user's own broker connection — no internal HTTP.
 */

import { db } from '@/db'
import { paperPositions, userPreferences, tradeHistory, alerts } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { getBrokerManager } from '@/lib/broker'
import { calculatePnl, checkExit, type ExitReason } from '@/lib/paper-trading'
import { sendTargetHitAlert, sendStopLossHitAlert, type TelegramConfig } from '@/lib/telegram-alerts'
import logger from '@/lib/logger'

export interface ExitInfo {
  positionId: number
  symbol: string
  positionType: string
  reason: ExitReason
  exitPrice: number
  entryPrice: number
  pnl: number
  pnlPercent: number
}

export interface ExitRunResult {
  userId: number
  open: number
  updated: number
  autoExits: ExitInfo[]
  priced: number
  error?: string
}

function holdingTime(entry: Date, exit: Date): string {
  const mins = Math.max(0, Math.floor((exit.getTime() - entry.getTime()) / 60000))
  const days = Math.floor(mins / 1440)
  const hours = Math.floor((mins % 1440) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins % 60}m`
  return `${mins}m`
}

/**
 * Update P&L for one user's open paper positions and close any that hit a
 * stop or target. Returns a summary; never throws for a single user.
 */
export async function processUserExits(userId: number): Promise<ExitRunResult> {
  const result: ExitRunResult = { userId, open: 0, updated: 0, autoExits: [], priced: 0 }

  const openPositions = await db
    .select()
    .from(paperPositions)
    .where(and(eq(paperPositions.userId, userId), eq(paperPositions.status, 'open')))

  result.open = openPositions.length
  if (openPositions.length === 0) return result

  // ── Live prices via the user's broker ───────────────────────────────────
  const manager = await getBrokerManager(userId)
  if (!manager.hasConnection()) {
    result.error = 'No usable broker connection (token expired or not connected)'
    return result
  }

  const symbols = [...new Set(openPositions.map(p => p.symbol))]
  const quoteKeys = symbols.map(s => `NSE:${s}`)

  let priceData: Record<string, number> = {}
  try {
    const quotes = await manager.getClient().getQuote(quoteKeys)
    for (const [key, quote] of Object.entries<any>(quotes || {})) {
      const symbol = key.includes(':') ? key.split(':')[1] : key
      const ltp = quote?.lastPrice ?? quote?.last_price
      if (symbol && typeof ltp === 'number' && ltp > 0) priceData[symbol] = ltp
    }
  } catch (err: any) {
    result.error = `Quote fetch failed: ${err.message}`
    return result
  }

  result.priced = Object.keys(priceData).length
  if (result.priced === 0) {
    result.error = 'Broker returned no prices'
    return result
  }

  // ── Telegram preferences (optional) ─────────────────────────────────────
  const [prefs] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1)

  const telegram: TelegramConfig = {
    enabled: prefs?.telegramEnabled || false,
    botToken: prefs?.telegramBotToken || '',
    chatId: prefs?.telegramChatId || '',
  }
  const alertPrefs = (prefs?.telegramAlertPreferences as any) || { targetHits: true, stopLossHits: true }

  // ── Per position ────────────────────────────────────────────────────────
  for (const position of openPositions) {
    const currentPrice = priceData[position.symbol]
    if (!currentPrice) continue // no quote this run: leave the position untouched

    const { pnl, pnlPercent } = calculatePnl({
      positionType: position.positionType,
      entryPrice: position.entryPrice,
      currentPrice,
      quantity: position.quantity,
    })

    const exitReason = checkExit(position, currentPrice)

    if (!exitReason) {
      await db.update(paperPositions)
        .set({ currentPrice, pnl, pnlPercent, updatedAt: new Date() })
        .where(eq(paperPositions.id, position.id))
      result.updated++
      continue
    }

    const exitTime = new Date()
    const entryTime = position.entryTime ? new Date(position.entryTime) : position.createdAt

    await db.update(paperPositions)
      .set({
        currentPrice,
        exitPrice: currentPrice,
        pnl,
        pnlPercent,
        status: 'closed',
        exitTime,
        exitReason: exitReason.toLowerCase().replace('_', ' '),
        notes: `Auto-exited: ${exitReason}`,
        updatedAt: new Date(),
      })
      .where(eq(paperPositions.id, position.id))

    result.updated++
    result.autoExits.push({
      positionId: position.id,
      symbol: position.symbol,
      positionType: position.positionType,
      reason: exitReason,
      exitPrice: currentPrice,
      entryPrice: position.entryPrice,
      pnl,
      pnlPercent,
    })

    // Trade history is the record we measure the strategy on: a failure here
    // must be loud, not swallowed.
    try {
      await db.insert(tradeHistory).values({
        userId: position.userId,
        positionId: position.id,
        source: 'paper',
        symbol: position.symbol,
        exchange: position.exchange,
        entryPrice: position.entryPrice,
        exitPrice: currentPrice,
        quantity: position.quantity,
        pnl,
        pnlPercent,
        strategy: position.strategy,
        exitReason: exitReason.toLowerCase(),
        entryTime,
        exitTime,
        duration: Math.floor((exitTime.getTime() - entryTime.getTime()) / 60000),
      })
    } catch (err: any) {
      logger.error('Failed to record trade history', {
        positionId: position.id, symbol: position.symbol, error: err.message,
      })
    }

    try {
      await db.insert(alerts).values({
        userId: position.userId,
        symbol: position.symbol,
        alertType: 'exit',
        message: `Position auto-closed at ₹${currentPrice.toFixed(2)}. P&L: ₹${pnl.toFixed(2)} (${pnlPercent > 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)`,
        priority: exitReason === 'STOP_LOSS' ? 'high' : 'medium',
        metadata: {
          positionId: position.id, exitReason, entryPrice: position.entryPrice,
          exitPrice: currentPrice, pnl, pnlPercent,
        },
      })
    } catch (err: any) {
      logger.warn('Failed to create exit alert', { symbol: position.symbol, error: err.message })
    }

    if (telegram.enabled) {
      try {
        const held = holdingTime(entryTime, exitTime)
        if (exitReason === 'STOP_LOSS' && alertPrefs.stopLossHits) {
          await sendStopLossHitAlert(telegram, {
            symbol: position.symbol, exchange: position.exchange,
            entryPrice: position.entryPrice, currentPrice,
            stopLoss: position.stopLoss || 0, pnl, pnlPercent,
            quantity: position.quantity, holdingTime: held,
          })
        } else if (exitReason !== 'STOP_LOSS' && alertPrefs.targetHits) {
          await sendTargetHitAlert(telegram, {
            symbol: position.symbol, exchange: position.exchange,
            entryPrice: position.entryPrice, currentPrice,
            targetLevel: exitReason === 'TARGET_1' ? 1 : 2,
            targetPrice: (exitReason === 'TARGET_1' ? position.target1 : position.target2) || 0,
            pnl, pnlPercent, quantity: position.quantity, holdingTime: held,
          })
        }
      } catch (err: any) {
        logger.warn('Telegram exit alert failed', { symbol: position.symbol, error: err.message })
      }
    }
  }

  return result
}

/** Users holding at least one open paper position. */
export async function usersWithOpenPositions(): Promise<number[]> {
  const rows = await db
    .selectDistinct({ userId: paperPositions.userId })
    .from(paperPositions)
    .where(eq(paperPositions.status, 'open'))
  return rows.map(r => r.userId)
}
