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

export interface TelegramConfig {
  botToken: string
  chatId: string
  enabled: boolean
}

export interface AlertPreferences {
  newSignals: boolean
  targetHits: boolean
  stopLossHits: boolean
  dailySummary: boolean
  positionUpdates: boolean
}

export type AlertType = 
  | 'NEW_SIGNAL'
  | 'NEWS_POP'
  | 'ORB_BREAKOUT'
  | 'TARGET_HIT'
  | 'STOP_LOSS_HIT'
  | 'POSITION_UPDATE'
  | 'DAILY_SUMMARY'
  | 'MARKET_OPEN'
  | 'MARKET_CLOSE'

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
async function sendTelegramMessage(
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
      console.error('❌ Telegram API error:', data)
      return false
    }

    console.log('✅ Telegram message sent successfully')
    return true
  } catch (error: any) {
    console.error('❌ Failed to send Telegram message:', error.message)
    return false
  }
}

/**
 * Alert: New high-conviction trading signal detected
 */
export async function sendNewSignalAlert(
  config: TelegramConfig,
  signal: {
    symbol: string
    exchange: string
    totalScore: number
    tier: string
    entryPrice: number
    stopLoss: number
    target1: number
    target2: number
    positionSize: number
    capitalRequired: number
    riskAmount: number
    reasons: string[]
  }
): Promise<boolean> {
  if (!config.enabled || !config.botToken || !config.chatId) {
    return false
  }

  const emoji = signal.tier === 'HIGH_CONVICTION' ? '🔥' : signal.tier === 'MODERATE' ? '✅' : '👀'
  const riskReward = ((signal.target1 - signal.entryPrice) / (signal.entryPrice - signal.stopLoss)).toFixed(2)

  const message = `
${emoji} <b>NEW SIGNAL: ${signal.symbol}</b>

<b>Score:</b> ${signal.totalScore}/100 (${signal.tier})
<b>Exchange:</b> ${signal.exchange}

<b>📊 TRADE PLAN:</b>
Entry: ${formatINR(signal.entryPrice)}
Stop Loss: ${formatINR(signal.stopLoss)} (${(((signal.stopLoss - signal.entryPrice) / signal.entryPrice) * 100).toFixed(2)}%)
Target 1: ${formatINR(signal.target1)} (${(((signal.target1 - signal.entryPrice) / signal.entryPrice) * 100).toFixed(2)}%)
Target 2: ${formatINR(signal.target2)} (${(((signal.target2 - signal.entryPrice) / signal.entryPrice) * 100).toFixed(2)}%)

<b>Position Size:</b> ${signal.positionSize} shares
<b>Capital Required:</b> ${formatINR(signal.capitalRequired)}
<b>Max Risk:</b> ${formatINR(signal.riskAmount)}
<b>Risk:Reward:</b> 1:${riskReward}

<b>💡 WHY THIS TRADE?</b>
${signal.reasons.slice(0, 3).map((r, i) => `${i + 1}. ${r}`).join('\n')}

<i>⏰ ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</i>
`.trim()

  return sendTelegramMessage(config.botToken, config.chatId, message)
}

/**
 * Alert: News-driven price pop detected (urgent short-term opportunity)
 */
export async function sendNewsPopAlert(
  config: TelegramConfig,
  newsPop: {
    symbol: string
    exchange: string
    totalScore: number
    currentPrice: number
    entryPrice: number
    stopLoss: number
    target1: number
    target2: number
    positionSize: number
    capitalRequired: number
    riskAmount: number
    volumeSpike: number
    changePercent: number
    newsSentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'
    newsSnippet?: string
    urgency: 'HIGH' | 'MEDIUM'
  }
): Promise<boolean> {
  if (!config.enabled || !config.botToken || !config.chatId) {
    return false
  }

  const urgencyEmoji = newsPop.urgency === 'HIGH' ? '🚨🔥' : '⚡'
  const sentimentEmoji = newsPop.newsSentiment === 'POSITIVE' ? '📈' : 
                         newsPop.newsSentiment === 'NEGATIVE' ? '📉' : '➡️'
  
  // Safe calculations with fallbacks
  const riskReward = (newsPop.target1 && newsPop.entryPrice && newsPop.stopLoss)
    ? ((newsPop.target1 - newsPop.entryPrice) / (newsPop.entryPrice - newsPop.stopLoss)).toFixed(2)
    : 'N/A'
  const priceChangeSign = (newsPop.changePercent || 0) >= 0 ? '+' : ''
  const priceChange = (newsPop.changePercent || 0).toFixed(2)
  const volumeSpikeText = (newsPop.volumeSpike || 0).toFixed(1)
  
  // Calculate percentage changes safely
  const slPercent = (newsPop.stopLoss && newsPop.entryPrice)
    ? (((newsPop.stopLoss - newsPop.entryPrice) / newsPop.entryPrice) * 100).toFixed(2)
    : '0.00'
  const t1Percent = (newsPop.target1 && newsPop.entryPrice)
    ? (((newsPop.target1 - newsPop.entryPrice) / newsPop.entryPrice) * 100).toFixed(2)
    : '0.00'
  const t2Percent = (newsPop.target2 && newsPop.entryPrice)
    ? (((newsPop.target2 - newsPop.entryPrice) / newsPop.entryPrice) * 100).toFixed(2)
    : '0.00'

  const message = `
${urgencyEmoji} <b>NEWS POP ALERT: ${newsPop.symbol}</b>

<b>${newsPop.urgency} URGENCY</b> - ${sentimentEmoji} ${newsPop.newsSentiment} NEWS

<b>📰 NEWS TRIGGER:</b>
${newsPop.newsSnippet || 'Breaking news detected - check app for details'}

<b>📊 MARKET REACTION:</b>
Price: ${formatINR(newsPop.currentPrice)} (${priceChangeSign}${priceChange}%)
Volume Spike: <b>${volumeSpikeText}x</b> normal
Score: ${newsPop.totalScore}/100

<b>🎯 QUICK TRADE PLAN:</b>
Entry: ${formatINR(newsPop.entryPrice)}
Stop Loss: ${formatINR(newsPop.stopLoss)} (${slPercent}%)
Target 1: ${formatINR(newsPop.target1)} (${t1Percent}%)
Target 2: ${formatINR(newsPop.target2)} (${t2Percent}%)

<b>Position Size:</b> ${newsPop.positionSize} shares
<b>Capital:</b> ${formatINR(newsPop.capitalRequired)}
<b>Risk:Reward:</b> 1:${riskReward}

<i>⚡ News-driven moves are FAST. Act quickly or skip!</i>

<i>⏰ ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</i>
`.trim()

  return sendTelegramMessage(config.botToken, config.chatId, message)
}

/**
 * Alert: ORB (Opening Range Breakout) detected
 */
export async function sendOrbBreakoutAlert(
  config: TelegramConfig,
  breakout: {
    symbol: string
    exchange: string
    breakoutType: 'ABOVE HIGH' | 'BELOW LOW'
    signalType: 'BUY' | 'SELL'
    orbHigh: number
    orbLow: number
    rangeSize: number
    rangePercent: number
    currentPrice: number
    entryPrice: number
    stopLoss: number
    target: number
    positionSize: number
    capitalRequired: number
    riskAmount: number
    strength: number
    volumeConfirmed: boolean
  }
): Promise<boolean> {
  if (!config.enabled || !config.botToken || !config.chatId) {
    return false
  }

  const emoji = breakout.breakoutType === 'ABOVE HIGH' ? '🚀' : '📉'
  const directionText = breakout.breakoutType === 'ABOVE HIGH' ? 'BULLISH' : 'BEARISH'
  const volumeEmoji = breakout.volumeConfirmed ? '🔥' : '📊'
  
  const slPercent = (((breakout.stopLoss - breakout.entryPrice) / breakout.entryPrice) * 100).toFixed(2)
  const targetPercent = (((breakout.target - breakout.entryPrice) / breakout.entryPrice) * 100).toFixed(2)
  const riskReward = ((Math.abs(breakout.target - breakout.entryPrice)) / (Math.abs(breakout.entryPrice - breakout.stopLoss))).toFixed(2)

  const message = `
${emoji} <b>ORB BREAKOUT: ${breakout.symbol}</b>

<b>🎯 ${directionText} BREAKOUT CONFIRMED!</b>

<b>📏 Opening Range (9:15-9:30 AM):</b>
High: ${formatINR(breakout.orbHigh)}
Low: ${formatINR(breakout.orbLow)}
Range: ${formatINR(breakout.rangeSize)} (${breakout.rangePercent}%)

<b>⚡ BREAKOUT DETAILS:</b>
Type: ${breakout.breakoutType}
Current Price: ${formatINR(breakout.currentPrice)}
Strength: ${'⭐'.repeat(breakout.strength)}/5
Volume: ${volumeEmoji} ${breakout.volumeConfirmed ? 'STRONG' : 'Moderate'}

<b>📊 TRADE PLAN:</b>
Signal: <b>${breakout.signalType}</b>
Entry: ${formatINR(breakout.entryPrice)}
Stop Loss: ${formatINR(breakout.stopLoss)} (${slPercent}%)
Target: ${formatINR(breakout.target)} (${targetPercent}%)

<b>Position Size:</b> ${breakout.positionSize} shares
<b>Capital Required:</b> ${formatINR(breakout.capitalRequired)}
<b>Max Risk:</b> ${formatINR(breakout.riskAmount)}
<b>Risk:Reward:</b> 1:${riskReward}

<i>💡 ORB breakouts have high success rate in first hour of trading!</i>

<i>⏰ ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</i>
`.trim()

  return sendTelegramMessage(config.botToken, config.chatId, message)
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
 * Alert: Position update (for manual trades or important changes)
 */
export async function sendPositionUpdateAlert(
  config: TelegramConfig,
  update: {
    symbol: string
    action: 'OPENED' | 'CLOSED' | 'MODIFIED'
    details: string
  }
): Promise<boolean> {
  if (!config.enabled || !config.botToken || !config.chatId) {
    return false
  }

  const emoji = update.action === 'OPENED' ? '🆕' : update.action === 'CLOSED' ? '🔒' : '✏️'

  const message = `
${emoji} <b>${update.action}: ${update.symbol}</b>

${update.details}

<i>⏰ ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</i>
`.trim()

  return sendTelegramMessage(config.botToken, config.chatId, message)
}

/**
 * Alert: Market open (morning briefing)
 */
export async function sendMarketOpenAlert(
  config: TelegramConfig,
  briefing: {
    openPositions: number
    capitalDeployed: number
    unrealizedPnL: number
    todaySignals: number
    marketSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  }
): Promise<boolean> {
  if (!config.enabled || !config.botToken || !config.chatId) {
    return false
  }

  const sentimentEmoji = briefing.marketSentiment === 'BULLISH' ? '🟢' : 
                         briefing.marketSentiment === 'BEARISH' ? '🔴' : '🟡'

  const message = `
🌅 <b>MARKET OPEN - Good Morning!</b>

${sentimentEmoji} <b>Market Sentiment:</b> ${briefing.marketSentiment}

<b>📊 YOUR PORTFOLIO:</b>
Open Positions: ${briefing.openPositions}
Capital Deployed: ${formatINR(briefing.capitalDeployed)}
Unrealized P&L: ${formatINR(briefing.unrealizedPnL)}

<b>🎯 TODAY'S SIGNALS:</b>
${briefing.todaySignals} high-conviction setups found

<i>💡 Check the app for detailed signals and trade plans.</i>

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
    console.error('❌ Failed to get chat ID:', error.message)
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

