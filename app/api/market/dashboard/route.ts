import { NextRequest, NextResponse } from 'next/server'
import type {
  MarketDashboard,
  MarketIndex,
  SectorPerformance,
  MarketBreadth,
  TopMover,
  MarketAlert
} from '@/lib/market-dashboard'
import {
  calculateBreadthSentiment,
  calculateMarketSentiment,
  generateDailyAnalysis
} from '@/lib/market-dashboard'

export const dynamic = 'force-dynamic'

/**
 * GET /api/market/dashboard
 * 
 * Returns comprehensive market dashboard data
 */
export async function GET(request: NextRequest) {
  try {
    console.log('📊 Fetching market dashboard...')
    
    // Get Kite session from cookies
    const cookies = request.cookies
    const accessToken = cookies.get('kite_access_token')?.value
    const apiKey = process.env.KITE_API_KEY
    
    if (!accessToken || !apiKey) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      )
    }
    
    const KiteConnect = require('kiteconnect').KiteConnect
    const kc = new KiteConnect({ api_key: apiKey })
    kc.setAccessToken(accessToken)
    
    // Fetch indices (NIFTY 50, BANK NIFTY, etc.)
    const indexSymbols = [
      'NSE:NIFTY 50',
      'NSE:NIFTY BANK',
      'NSE:NIFTY FIN SERVICE',
      'NSE:NIFTY IT',
      'NSE:NIFTY AUTO',
      'NSE:NIFTY PHARMA'
    ]
    
    const indicesData = await kc.getQuote(indexSymbols)
    
    const indices: MarketIndex[] = Object.entries(indicesData).map(([symbol, data]: [string, any]) => {
      const name = symbol.replace('NSE:', '').replace(' 50', '').replace('NIFTY ', '')
      return {
        name,
        symbol: name.replace(' ', ''),
        current: data.last_price,
        change: data.last_price - data.ohlc.close,
        changePercent: ((data.last_price - data.ohlc.close) / data.ohlc.close) * 100,
        open: data.ohlc.open,
        high: data.ohlc.high,
        low: data.ohlc.low,
        previousClose: data.ohlc.close
      }
    })
    
    console.log(`✅ Fetched ${indices.length} indices`)
    
    // Fetch NIFTY 50 constituent data for market breadth and sector analysis
    // For now, use a representative sample of major stocks
    const nifty50Sample = [
      'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
      'HINDUNILVR', 'ITC', 'SBIN', 'BHARTIARTL', 'KOTAKBANK',
      'LT', 'AXISBANK', 'ASIANPAINT', 'MARUTI', 'BAJFINANCE',
      'HCLTECH', 'WIPRO', 'ULTRACEMCO', 'NTPC', 'SUNPHARMA',
      'TITAN', 'NESTLEIND', 'POWERGRID', 'M&M', 'TATAMOTORS'
    ]
    
    // Fetch quotes for sample stocks
    const stockSymbols = nifty50Sample.map(s => `NSE:${s}`)
    const stocksData = await kc.getQuote(stockSymbols)
    
    const stocks = Object.entries(stocksData).map(([symbol, data]: [string, any]) => ({
      symbol: symbol.replace('NSE:', ''),
      current: data.last_price,
      change: data.last_price - data.ohlc.close,
      changePercent: ((data.last_price - data.ohlc.close) / data.ohlc.close) * 100,
      volume: data.volume,
      previousClose: data.ohlc.close,
      sector: getSectorForStock(symbol.replace('NSE:', ''))
    }))
    
    console.log(`✅ Fetched ${stocks.length} stocks for analysis`)
    
    // Calculate market breadth
    const advancers = stocks.filter(s => s.change > 0).length
    const decliners = stocks.filter(s => s.change < 0).length
    const unchanged = stocks.filter(s => s.change === 0).length
    const advanceDeclineRatio = decliners > 0 ? advancers / decliners : advancers
    
    // Simulate 52-week high/low data (in production, would need historical data)
    const stocksAt52WeekHigh = stocks.filter(s => s.changePercent > 3).length
    const stocksAt52WeekLow = stocks.filter(s => s.changePercent < -3).length
    const highLowRatio = stocksAt52WeekLow > 0 ? stocksAt52WeekHigh / stocksAt52WeekLow : stocksAt52WeekHigh
    
    const marketBreadth: MarketBreadth = {
      advancers,
      decliners,
      unchanged,
      advanceDeclineRatio,
      stocksAt52WeekHigh,
      stocksAt52WeekLow,
      highLowRatio,
      sentiment: 'NEUTRAL'
    }
    marketBreadth.sentiment = calculateBreadthSentiment(marketBreadth)
    
    console.log(`📊 Market breadth: ${advancers} up, ${decliners} down (A/D: ${advanceDeclineRatio.toFixed(2)})`)
    
    // Calculate sector performance
    const sectors = [
      'Banking', 'IT', 'Auto', 'Pharma', 'Consumer', 'Infrastructure', 'Energy', 'Metals'
    ]
    
    const sectorPerformance: SectorPerformance[] = sectors.map(sector => {
      const sectorStocks = stocks.filter(s => s.sector === sector)
      const avgChange = sectorStocks.length > 0
        ? sectorStocks.reduce((sum, s) => sum + s.changePercent, 0) / sectorStocks.length
        : 0
      
      const topGainer = sectorStocks.sort((a, b) => b.changePercent - a.changePercent)[0]
      const topLoser = sectorStocks.sort((a, b) => a.changePercent - b.changePercent)[0]
      
      const stocksUp = sectorStocks.filter(s => s.change > 0).length
      const stocksDown = sectorStocks.filter(s => s.change < 0).length
      
      return {
        sector,
        change: avgChange,
        topGainer: topGainer?.symbol || 'N/A',
        topLoser: topLoser?.symbol || 'N/A',
        stocksUp,
        stocksDown,
        volume: sectorStocks.reduce((sum, s) => sum + s.volume, 0),
        sentiment: avgChange > 0.5 ? 'BULLISH' : avgChange < -0.5 ? 'BEARISH' : 'NEUTRAL'
      }
    })
    
    console.log(`✅ Analyzed ${sectors.length} sectors`)
    
    // Top movers
    const topGainers: TopMover[] = stocks
      .filter(s => s.changePercent > 0)
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 10)
      .map(s => ({
        symbol: s.symbol,
        name: s.symbol,
        current: s.current,
        change: s.change,
        changePercent: s.changePercent,
        volume: s.volume,
        sector: s.sector
      }))
    
    const topLosers: TopMover[] = stocks
      .filter(s => s.changePercent < 0)
      .sort((a, b) => a.changePercent - b.changePercent)
      .slice(0, 10)
      .map(s => ({
        symbol: s.symbol,
        name: s.symbol,
        current: s.current,
        change: s.change,
        changePercent: s.changePercent,
        volume: s.volume,
        sector: s.sector
      }))
    
    const mostActive: TopMover[] = stocks
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 10)
      .map(s => ({
        symbol: s.symbol,
        name: s.symbol,
        current: s.current,
        change: s.change,
        changePercent: s.changePercent,
        volume: s.volume,
        sector: s.sector
      }))
    
    console.log(`✅ Top gainers: ${topGainers[0]?.symbol} (+${topGainers[0]?.changePercent.toFixed(2)}%)`)
    console.log(`✅ Top losers: ${topLosers[0]?.symbol} (${topLosers[0]?.changePercent.toFixed(2)}%)`)
    
    // Calculate market sentiment
    const sentiment = calculateMarketSentiment(indices, marketBreadth, sectorPerformance)
    
    console.log(`✅ Market sentiment: ${sentiment.overall} (${sentiment.score}/100)`)
    
    // Build dashboard
    const dashboard: Partial<MarketDashboard> = {
      indices,
      sectorPerformance,
      marketBreadth,
      topGainers,
      topLosers,
      mostActive,
      sentiment
    }
    
    // Generate daily analysis
    const dailyAnalysis = generateDailyAnalysis(dashboard)
    
    const fullDashboard: MarketDashboard = {
      timestamp: new Date(),
      indices,
      sectorPerformance,
      marketBreadth,
      topGainers,
      topLosers,
      mostActive,
      sentiment,
      dailyAnalysis,
      alerts: dailyAnalysis.alerts
    }
    
    console.log(`✅ Market dashboard generated successfully`)
    
    return NextResponse.json({
      success: true,
      data: fullDashboard
    })
    
  } catch (error: any) {
    console.error('❌ Error generating market dashboard:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to generate market dashboard'
      },
      { status: 500 }
    )
  }
}

/**
 * Helper function to map stocks to sectors
 * (In production, this would come from a database or API)
 */
function getSectorForStock(symbol: string): string {
  const sectorMap: Record<string, string> = {
    // Banking
    'HDFCBANK': 'Banking',
    'ICICIBANK': 'Banking',
    'KOTAKBANK': 'Banking',
    'AXISBANK': 'Banking',
    'SBIN': 'Banking',
    'INDUSINDBK': 'Banking',
    
    // IT
    'TCS': 'IT',
    'INFY': 'IT',
    'WIPRO': 'IT',
    'HCLTECH': 'IT',
    'TECHM': 'IT',
    
    // Auto
    'MARUTI': 'Auto',
    'M&M': 'Auto',
    'TATAMOTORS': 'Auto',
    'EICHERMOT': 'Auto',
    'HEROMOTOCO': 'Auto',
    'BAJAJ-AUTO': 'Auto',
    
    // Pharma
    'SUNPHARMA': 'Pharma',
    'DRREDDY': 'Pharma',
    'CIPLA': 'Pharma',
    'DIVISLAB': 'Pharma',
    
    // Consumer
    'HINDUNILVR': 'Consumer',
    'ITC': 'Consumer',
    'BRITANNIA': 'Consumer',
    'TITAN': 'Consumer',
    'NESTLEIND': 'Consumer',
    'TATACONSUM': 'Consumer',
    'ASIANPAINT': 'Consumer',
    
    // Infrastructure
    'LT': 'Infrastructure',
    'ADANIPORTS': 'Infrastructure',
    'POWERGRID': 'Infrastructure',
    'NTPC': 'Infrastructure',
    
    // Energy
    'RELIANCE': 'Energy',
    'ONGC': 'Energy',
    'BPCL': 'Energy',
    
    // Metals
    'TATASTEEL': 'Metals',
    'HINDALCO': 'Metals',
    'COALINDIA': 'Metals',
    'JSWSTEEL': 'Metals',
    'ULTRACEMCO': 'Metals',
    'SHREECEM': 'Metals',
    'GRASIM': 'Metals',
    
    // Telecom
    'BHARTIARTL': 'Telecom'
  }
  
  return sectorMap[symbol] || 'Others'
}

