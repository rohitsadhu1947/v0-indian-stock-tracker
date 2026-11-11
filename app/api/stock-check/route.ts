/**
 * GET /api/stock-check?symbol=SPICEJET&capital=300000&maxLossPct=1
 *
 * Risk report card for one NSE or BSE stock (see lib/stock-check.ts). NIFTY 500
 * stocks read stored daily bars; anything else is fetched from the user's
 * broker (needs today's Kite login).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'
import { brokerClientFor, parseCapital } from '../model-portfolio/_shared'
import { computeStockCheck } from '@/lib/stock-check'
import { rankMomentum, type DailyBar } from '@/lib/portfolio/momentum'
import { loadBars, istDate, dataFreshness } from '@/lib/portfolio/data'
import { UNIVERSE_SYMBOLS, INDUSTRY_BY_SYMBOL } from '@/lib/portfolio/universe'
import { STOCK_MOMENTUM } from '@/lib/portfolio/config'
import logger from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const SYMBOL_RE = /^[A-Z0-9&-]{1,20}$/
const UNIVERSE = new Set(UNIVERSE_SYMBOLS)

// Universe statistics are the same for every request on a given day, and the
// ranking reads ~200k rows: compute once per data date per server instance.
let universeCache: { date: string; scoresSorted: number[]; medianVolPct: number; top: Set<string> } | null = null

async function universeContext() {
  const fresh = await dataFreshness()
  const date = fresh.latestDate ?? ''
  if (universeCache?.date === date) return universeCache
  const since = istDate(new Date(Date.now() - 420 * 86400000))
  const ranking = rankMomentum(await loadBars(UNIVERSE_SYMBOLS, since))
  const vols = ranking.ranked.map(r => r.volatilityPct).sort((a, b) => a - b)
  universeCache = {
    date,
    scoresSorted: ranking.ranked.map(r => r.score).sort((a, b) => a - b),
    medianVolPct: vols[Math.floor(vols.length / 2)] ?? 0,
    top: new Set(ranking.ranked.slice(0, STOCK_MOMENTUM.topN).map(r => r.symbol)),
  }
  return universeCache
}

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserIdCompat()
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  const sp = request.nextUrl.searchParams
  const symbol = (sp.get('symbol') || '').trim().toUpperCase()
  if (!SYMBOL_RE.test(symbol)) {
    return NextResponse.json({ success: false, error: 'Enter an NSE symbol, e.g. RELIANCE' }, { status: 400 })
  }
  const capital = parseCapital(sp.get('capital')) ?? 300000
  const maxLossPct = Math.min(5, Math.max(0.25, Number(sp.get('maxLossPct')) || 1))

  try {
    let bars: DailyBar[] = []
    let source: 'stored' | 'broker' = 'stored'
    let exchange = 'NSE'

    if (UNIVERSE.has(symbol)) {
      bars = (await loadBars([symbol], istDate(new Date(Date.now() - 420 * 86400000))))[symbol] ?? []
    }

    if (bars.length < 60) {
      const client = await brokerClientFor(userId)
      if (!client) {
        return NextResponse.json({
          success: false,
          error: UNIVERSE.has(symbol)
            ? 'Not enough stored history for this stock yet.'
            : 'This stock is outside the NIFTY 500, so its prices come from Kite: log in with Kite today and try again.',
        }, { status: 503 })
      }
      // Some companies (e.g. SpiceJet) are listed only on BSE
      let token: number | undefined
      for (const ex of ['NSE', 'BSE']) {
        const quote = (await client.getQuote([`${ex}:${symbol}`]))[`${ex}:${symbol}`] as any
        token = quote?.raw?.instrument_token
        if (token) { exchange = ex; break }
      }
      if (!token) {
        return NextResponse.json({ success: false, error: `${symbol} was not found on NSE or BSE.` }, { status: 404 })
      }
      const candles = await client.getHistoricalData({
        instrumentToken: token, exchange, symbol, interval: 'day',
        from: new Date(Date.now() - 420 * 86400000), to: new Date(),
      })
      bars = candles.map(c => ({ date: istDate(new Date(c.date)), close: c.close, volume: c.volume }))
      source = 'broker'
    }

    if (bars.length < 20) {
      return NextResponse.json({ success: false, error: `Only ${bars.length} days of history for ${symbol}; too little to assess.` }, { status: 422 })
    }

    const ctx = await universeContext()
    const result = computeStockCheck({
      symbol,
      bars,
      universeScoresSorted: ctx.scoresSorted,
      universeMedianVolPct: ctx.medianVolPct || null,
      capital,
      maxLossPct,
      inNifty500: UNIVERSE.has(symbol),
      industry: INDUSTRY_BY_SYMBOL[symbol] ?? null,
      inMomentumBook: ctx.top.has(symbol),
    })
    return NextResponse.json({ success: true, source, exchange, result })
  } catch (error: any) {
    logger.error('Stock check failed', { symbol, error: error.message })
    return NextResponse.json({ success: false, error: 'Stock check failed', details: error.message }, { status: 500 })
  }
}
