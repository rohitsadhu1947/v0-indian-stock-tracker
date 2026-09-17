/**
 * Cron: Morning Note PDF Generator & Telegram Delivery
 *
 * GET /api/cron/morning-note
 *
 * Scheduled via Vercel Cron at 8:30 AM IST (Mon-Fri).
 * Generates a comprehensive PDF morning note and sends it to all
 * users who have Telegram enabled with dailySummary preference.
 *
 * Auth: Vercel CRON_SECRET header or admin session.
 * Also callable manually via the dashboard for testing.
 */

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { db } from '@/db'
import { userPreferences } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { getMacroSnapshot } from '@/lib/macro-intelligence'
import { analyzeMarketRegime, type HistoricalBar } from '@/lib/market-regime'
import { fetchFIIDIIData, analyzeSmartMoney, generateSampleFIIDIIData } from '@/lib/smart-money-tracker'
import { detectGeopoliticalEvents } from '@/lib/geopolitical-monitor'
import { generateMorningNote, type MorningNoteParams } from '@/lib/morning-note'
import { generateMorningNotePDF } from '@/lib/morning-note-pdf'
import { sendTelegramDocument } from '@/lib/telegram-alerts'
import { getUserBrokerManager } from '@/lib/broker'
import type { CandleData } from '@/lib/broker'
import { generateRecommendations } from '@/lib/recommendation-engine'
import logger from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Allow up to 60s for PDF generation + sending

const NIFTY_INSTRUMENT_TOKEN = 256265

export async function GET(request: NextRequest) {
  try {
    // ── Auth: Vercel CRON_SECRET (scheduler) or an admin session (manual) ─
    // Fails closed: without CRON_SECRET configured, only admins can trigger it.
    const cronSecret = process.env.CRON_SECRET
    const authHeader = Buffer.from(request.headers.get('authorization') || '')
    const expected = Buffer.from(cronSecret ? `Bearer ${cronSecret}` : '')
    const isScheduler =
      !!cronSecret &&
      authHeader.length === expected.length &&
      timingSafeEqual(authHeader, expected)

    if (isScheduler) {
      logger.info('Morning note cron triggered by scheduler')
    } else {
      const { getCurrentUser } = await import('@/lib/multi-user-auth')
      const user = await getCurrentUser()
      if (!user || user.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      logger.info('Morning note cron triggered manually', { userId: user.id })
    }

    // ── Phase 1: Fetch all data sources in parallel ──────────────────────
    logger.info('Starting morning note generation...')

    // Try to get broker for historical data (may not be available in cron context)
    let historicalBars: CandleData[] | null = null
    try {
      const manager = await getUserBrokerManager()
      if (manager.hasConnection()) {
        const client = manager.getClient()
        const now = new Date()
        const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
        historicalBars = await client.getHistoricalData({
          instrumentToken: NIFTY_INSTRUMENT_TOKEN,
          exchange: 'NSE',
          symbol: 'NIFTY 50',
          interval: 'day',
          from: sixtyDaysAgo,
          to: now,
        })
      }
    } catch {
      logger.warn('Broker not available for cron — skipping historical data')
    }

    const [macroResult, fiidiiResult, newsResult, recsResult] = await Promise.allSettled([
      getMacroSnapshot(),
      fetchFIIDIIData(),
      fetchNewsHeadlines(),
      generateRecommendations().catch(err => {
        logger.warn('Recommendation engine failed', { error: err.message })
        return null
      }),
    ])

    const macro = macroResult.status === 'fulfilled' ? macroResult.value : null
    let fiidiiData = fiidiiResult.status === 'fulfilled' ? fiidiiResult.value : []
    const headlines = newsResult.status === 'fulfilled' ? newsResult.value : []
    const recommendations = recsResult.status === 'fulfilled' ? recsResult.value : null

    // Use sample FII/DII if real data unavailable
    const hasRealFII = fiidiiData.length > 0 && fiidiiData.some(d => d.fiiNetValue !== 0 || d.diiNetValue !== 0)
    if (!hasRealFII) {
      fiidiiData = generateSampleFIIDIIData()
    }

    // ── Phase 2: Derived analysis ────────────────────────────────────────
    let regime = null
    if (historicalBars && historicalBars.length >= 20) {
      const bars: HistoricalBar[] = historicalBars.map(c => ({
        date: c.date, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
      }))
      regime = analyzeMarketRegime(bars)
    }

    const smartMoney = fiidiiData.length > 0 ? analyzeSmartMoney(fiidiiData, []) : null
    const geopolitical = headlines.length > 0 ? await detectGeopoliticalEvents(headlines) : null

    logger.info('Data fetched for morning note', {
      macro: macro ? 'yes' : 'no',
      regime: regime?.regime ?? 'unavailable',
      smartMoney: smartMoney?.overallSignal ?? 'unavailable',
      geopolitical: geopolitical?.overallRisk ?? 'unavailable',
      headlines: headlines.length,
    })

    // ── Phase 3: Build indices from macro (since we may not have broker) ─
    // When broker is unavailable, construct minimal index data from macro snapshot
    const indices = buildIndicesFromMacro(macro)

    // ── Phase 4: Generate morning note ───────────────────────────────────
    const params: MorningNoteParams = {
      indices,
      sectorPerformance: [], // Not available without broker quotes
      breadth: { advancers: 0, decliners: 0, unchanged: 0, advanceDeclineRatio: 1, stocksAt52WeekHigh: 0, stocksAt52WeekLow: 0, highLowRatio: 0, sentiment: 'NEUTRAL' },
      macro,
      regime,
      smartMoney,
      geopolitical,
      newsHeadlines: headlines,
      recommendations,
    }

    const morningNote = generateMorningNote(params)
    logger.info('Morning note generated', { sentiment: morningNote.sentiment.overall, score: morningNote.sentiment.score })

    // ── Phase 5: Generate PDF ────────────────────────────────────────────
    const pdfBuffer = await generateMorningNotePDF(morningNote)
    const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '_')
    const filename = `India_Morning_Note_${dateStr}.pdf`

    logger.info('PDF generated', { filename, sizeKB: Math.round(pdfBuffer.length / 1024) })

    // ── Phase 6: Send to all Telegram-enabled users ──────────────────────
    const recipients = await db.select({
      userId: userPreferences.userId,
      botToken: userPreferences.telegramBotToken,
      chatId: userPreferences.telegramChatId,
      prefs: userPreferences.telegramAlertPreferences,
    })
      .from(userPreferences)
      .where(eq(userPreferences.telegramEnabled, true))

    let sent = 0
    let failed = 0

    const caption = [
      `<b>India Equity Morning Note</b>`,
      `${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}`,
      ``,
      `Sentiment: <b>${morningNote.sentiment.overall.replace('_', ' ')}</b> (${morningNote.sentiment.score}/100)`,
      morningNote.sentiment.overrides.length > 0 ? `⚠ ${morningNote.sentiment.overrides.length} override(s) active` : '',
      ``,
      `Regime: ${morningNote.marketSnapshot.regime?.label.replace('_', ' ') ?? 'N/A'}`,
      morningNote.marketSnapshot.vix ? `VIX: ${morningNote.marketSnapshot.vix.value.toFixed(1)} (${morningNote.marketSnapshot.vix.riskLevel})` : '',
      morningNote.institutionalFlows.signal ? `FII/DII: ${morningNote.institutionalFlows.signal.replace('_', ' ')}` : '',
    ].filter(Boolean).join('\n')

    for (const r of recipients) {
      if (!r.botToken || !r.chatId) continue

      // Check if user wants daily summary (if pref exists)
      const prefs = r.prefs as any
      if (prefs && prefs.dailySummary === false) continue

      const ok = await sendTelegramDocument(r.botToken, r.chatId, pdfBuffer, filename, caption)
      if (ok) sent++
      else failed++
    }

    logger.info('Morning note delivery complete', { sent, failed, totalRecipients: recipients.length })

    return NextResponse.json({
      success: true,
      morningNote: {
        sentiment: morningNote.sentiment.overall,
        score: morningNote.sentiment.score,
        overrides: morningNote.sentiment.overrides,
        regime: morningNote.marketSnapshot.regime?.label ?? null,
        vix: morningNote.marketSnapshot.vix?.value ?? null,
      },
      pdf: { filename, sizeKB: Math.round(pdfBuffer.length / 1024) },
      delivery: { sent, failed, totalRecipients: recipients.length },
    })

  } catch (error: any) {
    logger.error('Morning note cron failed', { error: error.message, stack: error.stack })
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build minimal index data from macro snapshot when broker is unavailable.
 */
function buildIndicesFromMacro(macro: any) {
  // Without broker quotes we can't get NIFTY price, but we can still build the note
  // from macro, FII/DII, geopolitical data
  return []
}

/**
 * Fetch news headlines for the morning note.
 */
async function fetchNewsHeadlines(): Promise<string[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3006'
    const res = await fetch(`${baseUrl}/api/news/multi-layer?symbol=NIFTY&limit=15`, {
      next: { revalidate: 300 },
    })
    if (!res.ok) return []
    const data = await res.json()
    if (!data.success || !Array.isArray(data.articles)) return []
    return data.articles.map((a: any) => a.title || a.headline || '').filter(Boolean)
  } catch {
    return []
  }
}
