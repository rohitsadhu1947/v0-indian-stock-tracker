/**
 * Telegram Alerts System
 * 
 * This module sends real-time trading alerts via Telegram Bot API.
 * 
 * Setup:
 * 1. Create a bot via @BotFather on Telegram
 * 2. Get your bot token and add to .env.local as TELEGRAM_BOT_TOKEN
 * 3. Start a chat with your bot and send any message
 * 4. Get your chat ID via the settings page
 * 5. Enable alerts in the app
 */

import logger from '@/lib/logger'

export interface TelegramConfig {
  botToken: string
  chatId: string
  enabled: boolean
}

export interface AlertPreferences {
  targetHits: boolean
  stopLossHits: boolean
  dailySummary: boolean
}

/**
 * Format number with Indian comma separator
 */
function formatINR(amount: number | undefined): string {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return '₹0.00';
  }
  return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/**
 * Send a Telegram message
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  message: string,
  parseMode: 'HTML' | 'Markdown' = 'HTML'
): Promise<boolean> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: parseMode,
        disable_web_page_preview: true
      })
    })

    const data = await response.json()
    
    if (!data.ok) {
      logger.error('Telegram API error', { data })
      return false
    }

    logger.debug('Telegram message sent')
    return true
  } catch (error: any) {
    logger.error('Failed to send Telegram message', { error: error.message })
    return false
  }
}

/**
 * Send a document (PDF, etc.) via Telegram
 */
export async function sendTelegramDocument(
  botToken: string,
  chatId: string,
  fileBuffer: Buffer,
  filename: string,
  caption?: string,
): Promise<boolean> {
  try {
    const formData = new FormData()
    formData.append('chat_id', chatId)
    formData.append('document', new Blob([new Uint8Array(fileBuffer)]), filename)
    if (caption) {
      formData.append('caption', caption)
      formData.append('parse_mode', 'HTML')
    }

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
      method: 'POST',
      body: formData,
    })

    const data = await response.json()

    if (!data.ok) {
      logger.error('Telegram sendDocument error', { data })
      return false
    }

    logger.info('Telegram document sent', { filename })
    return true
  } catch (error: any) {
    logger.error('Failed to send Telegram document', { error: error.message })
    return false
  }
}

/**
 * Alert: Target hit - book profits!
 */
export async function sendTargetHitAlert(
  config: TelegramConfig,
  position: {
    symbol: string
    exchange: string
    entryPrice: number
    currentPrice: number
    targetLevel: number
    targetPrice: number
    pnl: number
    pnlPercent: number
    quantity: number
    holdingTime: string
  }
): Promise<boolean> {
  if (!config.enabled || !config.botToken || !config.chatId) {
    return false
  }

  const message = `
✅ <b>TARGET ${position.targetLevel} HIT: ${position.symbol}</b>

<b>🎯 BOOK PROFIT NOW!</b>

Entry: ${formatINR(position.entryPrice)}
Current: ${formatINR(position.currentPrice)}
Target: ${formatINR(position.targetPrice)}

<b>P&L:</b> ${formatINR(position.pnl)} (${position.pnlPercent.toFixed(2)}%)
<b>Quantity:</b> ${position.quantity} shares
<b>Holding Time:</b> ${position.holdingTime}

<i>💡 Suggested Action:</i>
${position.targetLevel === 1 ? 'Book 50% profit, trail stop-loss to breakeven' : 'Book remaining 50% profit'}

<i>⏰ ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</i>
`.trim()

  return sendTelegramMessage(config.botToken, config.chatId, message)
}

/**
 * Alert: Stop-loss hit - exit immediately!
 */
export async function sendStopLossHitAlert(
  config: TelegramConfig,
  position: {
    symbol: string
    exchange: string
    entryPrice: number
    currentPrice: number
    stopLoss: number
    pnl: number
    pnlPercent: number
    quantity: number
    holdingTime: string
  }
): Promise<boolean> {
  if (!config.enabled || !config.botToken || !config.chatId) {
    return false
  }

  const message = `
❌ <b>STOP-LOSS HIT: ${position.symbol}</b>

<b>🚨 EXIT IMMEDIATELY!</b>

Entry: ${formatINR(position.entryPrice)}
Current: ${formatINR(position.currentPrice)}
Stop Loss: ${formatINR(position.stopLoss)}

<b>Loss:</b> ${formatINR(position.pnl)} (${position.pnlPercent.toFixed(2)}%)
<b>Quantity:</b> ${position.quantity} shares
<b>Holding Time:</b> ${position.holdingTime}

<i>💡 Accept the loss and move on. Protect your capital.</i>

<i>⏰ ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</i>
`.trim()

  return sendTelegramMessage(config.botToken, config.chatId, message)
}

/**
 * Alert: Daily summary report
 */
export async function sendDailySummaryAlert(
  config: TelegramConfig,
  summary: {
    date: string
    totalTrades: number
    winningTrades: number
    losingTrades: number
    totalPnL: number
    totalPnLPercent: number
    biggestWinner: { symbol: string; pnl: number } | null
    biggestLoser: { symbol: string; pnl: number } | null
    openPositions: number
    capitalDeployed: number
    capitalAvailable: number
  }
): Promise<boolean> {
  if (!config.enabled || !config.botToken || !config.chatId) {
    return false
  }

  const winRate = summary.totalTrades > 0 
    ? ((summary.winningTrades / summary.totalTrades) * 100).toFixed(1) 
    : '0.0'

  const pnlEmoji = summary.totalPnL >= 0 ? '🟢' : '🔴'
  const pnlSign = summary.totalPnL >= 0 ? '+' : ''

  const message = `
📊 <b>DAILY REPORT - ${summary.date}</b>

${pnlEmoji} <b>Total P&L: ${pnlSign}${formatINR(summary.totalPnL)}</b> (${pnlSign}${summary.totalPnLPercent.toFixed(2)}%)

<b>📈 TRADES:</b>
Total: ${summary.totalTrades}
Wins: ${summary.winningTrades} ✅
Losses: ${summary.losingTrades} ❌
Win Rate: ${winRate}%

${summary.biggestWinner ? `<b>🏆 Biggest Winner:</b> ${summary.biggestWinner.symbol} (+${formatINR(summary.biggestWinner.pnl)})` : ''}
${summary.biggestLoser ? `<b>💔 Biggest Loser:</b> ${summary.biggestLoser.symbol} (${formatINR(summary.biggestLoser.pnl)})` : ''}

<b>📊 CAPITAL:</b>
Deployed: ${formatINR(summary.capitalDeployed)} (${summary.openPositions} positions)
Available: ${formatINR(summary.capitalAvailable)}

<i>⏰ ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</i>
`.trim()

  return sendTelegramMessage(config.botToken, config.chatId, message)
}

/**
 * Get Telegram chat ID from bot token (for setup)
 */
export async function getTelegramChatId(botToken: string): Promise<{ chatId: string; firstName: string } | null> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates`)
    const data = await response.json()
    
    if (!data.ok || !data.result || data.result.length === 0) {
      return null
    }

    // Get the most recent message
    const lastUpdate = data.result[data.result.length - 1]
    const chatId = lastUpdate.message?.chat?.id?.toString()
    const firstName = lastUpdate.message?.chat?.first_name

    if (!chatId) {
      return null
    }

    return { chatId, firstName }
  } catch (error: any) {
    logger.error('Failed to get Telegram chat ID', { error: error.message })
    return null
  }
}

/**
 * Test the Telegram connection
 */
export async function testTelegramConnection(botToken: string, chatId: string): Promise<boolean> {
  const message = `
✅ <b>Telegram Alerts Connected!</b>

Your Indian Stock Tracker is now connected to Telegram.

You'll receive real-time alerts for:
• New high-conviction signals 🔥
• Target hits ✅
• Stop-loss hits ❌
• Daily summary reports 📊

<i>Happy Trading! 🚀</i>
`.trim()

  return sendTelegramMessage(botToken, chatId, message)
}

