/**
 * Run the NSE update, tell the admins when it fails, freeze the month's
 * picks for the live track record, and run the paper day-trade tracker. Shared by the market-data cron and the
 * morning cron.
 */
import { db } from '@/db'
import { userPreferences, users } from '@/db/schema'
import { and, eq, isNotNull } from 'drizzle-orm'
import { runFoWatch, sendEntryAlerts } from '@/lib/fo-watch/service'
import logger from '@/lib/logger'
import { runPositionalWatch } from '@/lib/positional/service'
import { runSplitWatch } from '@/lib/positional/split-service'
import { runDividendWatch } from '@/lib/positional/dividend-service'
import { recordMonthlySignals } from '@/lib/portfolio/signals'
import { sendTelegramMessage } from '@/lib/telegram-alerts'
import { updateFromNseArchive, type UpdateSummary } from './daily-update'

export async function runMarketDataUpdate(): Promise<UpdateSummary> {
  // First, because it is time-critical: the 09:20 message for today's day-trade shorts. Outside 09:20 to 15:00 it does nothing
  await sendEntryAlerts().catch(err => logger.error('Day-trade entry message failed', { error: err.message }))
  const summary = await updateFromNseArchive()
  logger.info('Market data update', {
    ok: summary.ok, latest: summary.latestAfter, days: summary.days.length, problems: summary.problems,
  })
  if (!summary.ok) await alertAdmins(summary).catch(err => logger.error('Market data alert failed', { error: err.message }))

  // With prices current, freeze this month's picks if a month-end has passed since the last record
  try {
    const signals = await recordMonthlySignals()
    if (signals.recorded.length) logger.info('Monthly signals recorded', signals)
  } catch (err: any) {
    logger.error('Recording monthly signals failed', { error: err.message })
  }
  // The paper day-trade tracker reads the same evening's F&O files. Its failures are logged inside and never fail this run
  await runFoWatch()
  // Positional signals read the prices and results dates just loaded. Failures are logged inside
  await runPositionalWatch()
  await runSplitWatch()
  await runDividendWatch()
  return summary
}

async function alertAdmins(summary: UpdateSummary): Promise<void> {
  const admins = await db
    .select({ token: userPreferences.telegramBotToken, chat: userPreferences.telegramChatId })
    .from(userPreferences)
    .innerJoin(users, eq(users.id, userPreferences.userId))
    .where(and(eq(users.role, 'admin'), eq(userPreferences.telegramEnabled, true),
      isNotNull(userPreferences.telegramBotToken), isNotNull(userPreferences.telegramChatId)))
  const text = [
    '<b>Price data update failed</b>',
    `Prices are current to ${summary.latestAfter ?? 'nothing'}.`,
    ...summary.problems.slice(0, 5).map(p => `- ${p.replace(/[<>&]/g, ' ')}`),
  ].join('\n')
  for (const a of admins) await sendTelegramMessage(a.token!, a.chat!, text)
}
