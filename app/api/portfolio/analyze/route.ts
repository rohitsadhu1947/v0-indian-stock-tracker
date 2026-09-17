/**
 * Portfolio Analysis API
 *
 * POST /api/portfolio/analyze
 *   Body: { positions: PortfolioPosition[] }
 *   Returns: PortfolioAnalysisReport
 *
 * GET /api/portfolio/analyze
 *   Fetches positions from DB and analyzes them
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { positions } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'
import { analyzePortfolio, type PortfolioPosition } from '@/lib/portfolio-analyst'
import logger from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET — Analyze all open positions for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserIdCompat()

    if (!userId) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }

    // Fetch open positions from DB
    const dbPositions = await db.select()
      .from(positions)
      .where(and(
        eq(positions.userId, userId),
        eq(positions.status, 'OPEN')
      ))

    if (dbPositions.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No open positions found. Add positions first to get portfolio analysis.',
        positions: [],
      })
    }

    const portfolioPositions: PortfolioPosition[] = dbPositions.map(pos => ({
      id: pos.id,
      symbol: pos.symbol,
      exchange: pos.exchange ?? 'NSE',
      entryPrice: pos.entryPrice,
      currentPrice: pos.currentPrice,
      quantity: pos.quantity,
      positionType: (pos.positionType as 'BUY' | 'SELL') ?? 'BUY',
      stopLoss: pos.stopLoss,
      target: pos.target,
      pnl: pos.pnl,
      pnlPercent: pos.pnlPercent,
      status: pos.status ?? 'open',
      entryTime: pos.entryTime ?? pos.createdAt,
      strategy: pos.strategy,
    }))

    const report = await analyzePortfolio(portfolioPositions, String(userId))

    return NextResponse.json({ success: true, report })
  } catch (error) {
    logger.error('Portfolio analysis failed', { error: (error as Error).message })
    return NextResponse.json({
      success: false,
      error: `Analysis failed: ${(error as Error).message}`,
    }, { status: 500 })
  }
}

/**
 * POST — Analyze provided positions (for custom/manual portfolios)
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserIdCompat()

    if (!userId) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    const { positions: inputPositions } = body

    if (!inputPositions || !Array.isArray(inputPositions) || inputPositions.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Provide positions array with symbol, entryPrice, quantity, positionType',
      }, { status: 400 })
    }

    // Validate and normalize positions
    const portfolioPositions: PortfolioPosition[] = inputPositions.map((p: any, i: number) => ({
      id: p.id ?? i + 1,
      symbol: (p.symbol || '').toUpperCase(),
      exchange: p.exchange || 'NSE',
      entryPrice: Number(p.entryPrice) || 0,
      currentPrice: p.currentPrice ? Number(p.currentPrice) : null,
      quantity: Number(p.quantity) || 0,
      positionType: p.positionType === 'SELL' ? 'SELL' : 'BUY',
      stopLoss: p.stopLoss ? Number(p.stopLoss) : null,
      target: p.target ? Number(p.target) : null,
      pnl: p.pnl ? Number(p.pnl) : null,
      pnlPercent: p.pnlPercent ? Number(p.pnlPercent) : null,
      status: p.status || 'open',
      entryTime: p.entryTime || new Date().toISOString(),
      strategy: p.strategy || null,
    }))

    const invalid = portfolioPositions.filter(p => !p.symbol || !p.entryPrice || !p.quantity)
    if (invalid.length > 0) {
      return NextResponse.json({
        success: false,
        error: `Invalid positions: ${invalid.map(p => p.symbol || 'empty').join(', ')}. Each needs symbol, entryPrice, quantity.`,
      }, { status: 400 })
    }

    const report = await analyzePortfolio(portfolioPositions, String(userId))

    return NextResponse.json({ success: true, report })
  } catch (error) {
    logger.error('Portfolio analysis (POST) failed', { error: (error as Error).message })
    return NextResponse.json({
      success: false,
      error: `Analysis failed: ${(error as Error).message}`,
    }, { status: 500 })
  }
}
