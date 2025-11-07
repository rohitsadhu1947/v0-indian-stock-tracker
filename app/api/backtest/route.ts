/**
 * Backtesting API
 * Run strategy backtests on historical data
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'
import { simulateMasterScoreStrategy } from '@/lib/backtest-simulator'
import type { BacktestConfig } from '@/lib/backtesting-engine'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes for long backtests

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserIdCompat()
    
    if (!userId) {
      return NextResponse.json({
        error: 'Unauthorized'
      }, { status: 401 })
    }

    const body = await request.json()
    
    // Parse config
    const config: BacktestConfig = {
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      initialCapital: body.initialCapital || 300000,
      maxPositions: body.maxPositions || 5,
      riskPercentPerTrade: body.riskPercentPerTrade || 2.0,
      strategy: body.strategy || 'MASTER_SCORE',
      minScore: body.minScore || 60,
      symbols: body.symbols // Optional: specific symbols to test
    }

    console.log('\n🎯 === BACKTEST STARTED ===')
    console.log(`👤 User ID: ${userId}`)
    console.log(`📅 Period: ${config.startDate.toDateString()} to ${config.endDate.toDateString()}`)
    console.log(`💰 Initial Capital: ₹${config.initialCapital.toLocaleString()}`)
    console.log(`📊 Strategy: ${config.strategy}`)

    // Get access token from cookies
    const cookieStore = cookies()
    const accessToken = cookieStore.get('kite_access_token')?.value

    if (!accessToken) {
      return NextResponse.json({
        success: false,
        error: 'Kite access token not found. Please login.'
      }, { status: 401 })
    }

    // Run backtest
    const result = await simulateMasterScoreStrategy(config, accessToken)

    console.log('\n📊 === BACKTEST RESULTS ===')
    console.log(`Total Trades: ${result.totalTrades}`)
    console.log(`Win Rate: ${result.winRate.toFixed(2)}%`)
    console.log(`Total Return: ${result.totalReturn >= 0 ? '+' : ''}${result.totalReturn.toFixed(2)}%`)
    console.log(`Sharpe Ratio: ${result.sharpeRatio.toFixed(2)}`)
    console.log(`Max Drawdown: ${result.maxDrawdown.toFixed(2)}%`)
    console.log(`Final Capital: ₹${result.finalCapital.toLocaleString()}`)

    return NextResponse.json({
      success: true,
      result
    })

  } catch (error: any) {
    console.error('❌ Backtest error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Backtest failed',
        details: error.message
      },
      { status: 500 }
    )
  }
}

// GET: Get saved backtest results (future feature)
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserIdCompat()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // TODO: Fetch saved backtest results from database
    
    return NextResponse.json({
      success: true,
      backtests: []
    })

  } catch (error: any) {
    console.error('❌ Failed to fetch backtests:', error)
    return NextResponse.json(
      { error: 'Failed to fetch backtests', details: error.message },
      { status: 500 }
    )
  }
}

