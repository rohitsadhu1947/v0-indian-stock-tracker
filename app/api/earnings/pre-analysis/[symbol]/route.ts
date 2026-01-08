import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { quarterlyFinancials } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { KiteConnect } from 'kiteconnect'
import { getKiteAccessToken, getKiteApiKey } from '@/lib/kite-token-helper'

/**
 * GET /api/earnings/pre-analysis/[symbol]
 * 
 * Comprehensive pre-earnings analysis for a stock
 * Returns: Price setup, financial trends, historical reactions, news, verdict
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { symbol: string } }
) {
  const symbol = params.symbol.toUpperCase()
  
  console.log(`\n📊 Starting Pre-Earnings Analysis for ${symbol}...`)
  
  try {
    // Get Kite access
    const accessToken = await getKiteAccessToken()
    const apiKey = getKiteApiKey()
    
    console.log(`🔑 Kite Auth: Token=${accessToken ? 'YES' : 'NO'}, API Key=${apiKey ? 'YES' : 'NO'}`)
    
    // Parallel fetch all data
    const [
      financials,
      priceData,
      newsData,
      optionsData
    ] = await Promise.all([
      fetchFinancials(symbol),
      fetchPriceData(symbol, accessToken, apiKey),
      fetchNews(symbol),
      fetchOptionsData(symbol, accessToken, apiKey)
    ])
    
    // Calculate historical earnings reactions
    const earningsReactions = calculateEarningsReactions(financials, priceData)
    
    // Analyze price setup
    const priceSetup = analyzePriceSetup(priceData)
    
    // Analyze financial trend
    const financialTrend = analyzeFinancialTrend(financials)
    
    // Calculate sentiment score from news
    const sentiment = analyzeSentiment(newsData)
    
    // Analyze options (if available)
    const optionsAnalysis = analyzeOptions(optionsData)
    
    // Generate final verdict
    const verdict = generateVerdict({
      symbol,
      priceSetup,
      financialTrend,
      earningsReactions,
      sentiment,
      optionsAnalysis
    })
    
    console.log(`✅ ${symbol} Pre-Earnings Analysis Complete: ${verdict.recommendation}`)
    
    return NextResponse.json({
      success: true,
      symbol,
      analysisDate: new Date().toISOString(),
      
      // Price Analysis
      priceSetup,
      
      // Financial Trend
      financialTrend,
      
      // Historical Earnings Reactions
      earningsReactions,
      
      // News & Sentiment
      news: newsData,
      sentiment,
      
      // Options Analysis
      options: optionsAnalysis,
      
      // Final Verdict
      verdict
    })
    
  } catch (error: any) {
    console.error(`❌ Pre-earnings analysis failed for ${symbol}:`, error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Analysis failed'
    }, { status: 500 })
  }
}

/**
 * Fetch quarterly financials from database
 */
async function fetchFinancials(symbol: string) {
  const quarters = await db.select()
    .from(quarterlyFinancials)
    .where(eq(quarterlyFinancials.symbol, symbol))
    .orderBy(desc(quarterlyFinancials.endDate))
    .limit(16) // 4 years of data
  
  return quarters
}

/**
 * Fetch 6 months of price data from Kite, with fallback to NSE/Google
 */
async function fetchPriceData(symbol: string, accessToken: string | null, apiKey: string | null) {
  // Try Kite first
  if (accessToken && apiKey) {
    try {
      const kite = new KiteConnect({ api_key: apiKey })
      kite.setAccessToken(accessToken)
      
      // Get instrument token
      const instruments = await kite.getInstruments('NSE')
      const instrument = instruments.find((i: any) => i.tradingsymbol === symbol)
      
      if (!instrument) {
        console.log(`⚠️ Instrument not found for ${symbol}`)
      } else {
        // Fetch 6 months of daily data
        const toDate = new Date()
        const fromDate = new Date()
        fromDate.setMonth(fromDate.getMonth() - 6)
        
        const historicalData = await kite.getHistoricalData(
          instrument.instrument_token,
          'day',
          fromDate,
          toDate
        )
        
        // Get current quote
        const quote = await kite.getQuote([`NSE:${symbol}`])
        const currentPrice = quote[`NSE:${symbol}`]?.last_price
        
        console.log(`✅ Got Kite price data for ${symbol}: ₹${currentPrice}`)
        
        return {
          historical: historicalData,
          currentPrice,
          instrumentToken: instrument.instrument_token,
          source: 'kite'
        }
      }
    } catch (error: any) {
      console.error('Kite price data error:', error.message)
    }
  }
  
  // Fallback: Try to get current price from Google Finance
  console.log(`⚠️ Kite not available, trying fallback for ${symbol}`)
  const fallbackPrice = await fetchFallbackPrice(symbol)
  
  if (fallbackPrice) {
    return {
      historical: null,
      currentPrice: fallbackPrice.price,
      change: fallbackPrice.change,
      changePercent: fallbackPrice.changePercent,
      source: 'fallback'
    }
  }
  
  return null
}

/**
 * Fallback price fetcher using NSE India API
 */
async function fetchFallbackPrice(symbol: string): Promise<{ price: number, change: number, changePercent: number } | null> {
  try {
    // Try NSE India API
    const response = await fetch(`https://www.nseindia.com/api/quote-equity?symbol=${symbol}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    })
    
    if (response.ok) {
      const data = await response.json()
      const price = data.priceInfo?.lastPrice
      const change = data.priceInfo?.change
      const changePercent = data.priceInfo?.pChange
      
      if (price) {
        console.log(`✅ NSE fallback price for ${symbol}: ₹${price}`)
        return { price, change, changePercent }
      }
    }
  } catch (e) {
    console.log('NSE API fallback failed')
  }
  
  // Try Yahoo Finance as second fallback
  try {
    const yahooSymbol = `${symbol}.NS`
    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=1d`)
    
    if (response.ok) {
      const data = await response.json()
      const price = data.chart?.result?.[0]?.meta?.regularMarketPrice
      const prevClose = data.chart?.result?.[0]?.meta?.previousClose
      
      if (price) {
        const change = price - (prevClose || price)
        const changePercent = prevClose ? ((price - prevClose) / prevClose) * 100 : 0
        console.log(`✅ Yahoo fallback price for ${symbol}: ₹${price}`)
        return { price, change, changePercent }
      }
    }
  } catch (e) {
    console.log('Yahoo API fallback failed')
  }
  
  return null
}

/**
 * Fetch recent news from Google News RSS
 */
async function fetchNews(symbol: string): Promise<any[]> {
  try {
    // Google News RSS feed
    const query = encodeURIComponent(`${symbol} stock NSE India`)
    const rssUrl = `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`
    
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; StockTracker/1.0)'
      }
    })
    
    if (!response.ok) {
      console.log('⚠️ News fetch failed, status:', response.status)
      return []
    }
    
    const xml = await response.text()
    
    // Parse RSS XML (simple parsing)
    const items: any[] = []
    const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/g) || []
    
    for (const itemXml of itemMatches.slice(0, 10)) {
      const title = itemXml.match(/<title>(.*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '') || ''
      const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] || ''
      const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || ''
      const source = itemXml.match(/<source.*?>(.*?)<\/source>/)?.[1] || ''
      
      if (title) {
        items.push({
          title: decodeHTMLEntities(title),
          link,
          pubDate: new Date(pubDate).toISOString(),
          source: decodeHTMLEntities(source),
          // Simple sentiment from title
          sentiment: analyzeTitleSentiment(title)
        })
      }
    }
    
    console.log(`📰 Found ${items.length} news items for ${symbol}`)
    return items
    
  } catch (error: any) {
    console.error('News fetch error:', error.message)
    return []
  }
}

/**
 * Fetch options data from Kite
 */
async function fetchOptionsData(symbol: string, accessToken: string | null, apiKey: string | null) {
  try {
    if (!accessToken || !apiKey) {
      return { available: false, reason: 'Kite not connected' }
    }
    
    const kite = new KiteConnect({ api_key: apiKey })
    kite.setAccessToken(accessToken)
    
    // Get NFO instruments for this symbol
    console.log(`🔍 Fetching F&O instruments for ${symbol}...`)
    const instruments = await kite.getInstruments('NFO')
    console.log(`📊 Total NFO instruments: ${instruments.length}`)
    
    // Find all options for this symbol
    const symbolOptions = instruments.filter((i: any) => 
      i.name === symbol && 
      (i.instrument_type === 'CE' || i.instrument_type === 'PE')
    )
    console.log(`📊 ${symbol} options found: ${symbolOptions.length}`)
    
    if (symbolOptions.length === 0) {
      console.log(`⚠️ No options found for ${symbol} - not in F&O segment`)
      return { 
        available: false, 
        reason: `${symbol} is not in F&O segment. Only ~200 stocks on NSE have options trading.`
      }
    }
    
    // Get nearest expiry options
    const sortedByExpiry = symbolOptions.sort((a: any, b: any) => 
      new Date(a.expiry).getTime() - new Date(b.expiry).getTime()
    )
    
    const nearestExpiry = sortedByExpiry[0]?.expiry
    const nearestOptions = symbolOptions.filter((i: any) => i.expiry === nearestExpiry)
    
    // Separate calls and puts
    const calls = nearestOptions.filter((o: any) => o.instrument_type === 'CE')
    const puts = nearestOptions.filter((o: any) => o.instrument_type === 'PE')
    
    console.log(`📊 ${symbol} nearest expiry (${nearestExpiry}): ${calls.length} calls, ${puts.length} puts`)
    
    // Get quotes for ALL options in nearest expiry (up to 50 each for calls/puts)
    const optionsToQuote = [
      ...calls.slice(0, 50).map((o: any) => `NFO:${o.tradingsymbol}`),
      ...puts.slice(0, 50).map((o: any) => `NFO:${o.tradingsymbol}`)
    ]
    
    console.log(`📊 Fetching quotes for ${optionsToQuote.length} options...`)
    const quotes = await kite.getQuote(optionsToQuote)
    
    // Calculate total open interest for calls and puts
    let totalCallOI = 0
    let totalPutOI = 0
    
    for (const call of calls) {
      const quote = quotes[`NFO:${call.tradingsymbol}`]
      if (quote?.oi) {
        totalCallOI += quote.oi
      }
    }
    
    for (const put of puts) {
      const quote = quotes[`NFO:${put.tradingsymbol}`]
      if (quote?.oi) {
        totalPutOI += quote.oi
      }
    }
    
    console.log(`📊 ${symbol} OI: Calls=${totalCallOI.toLocaleString()}, Puts=${totalPutOI.toLocaleString()}`)
    
    // PCR = Put OI / Call OI (standard formula)
    // PCR > 1 = more puts = bearish positioning OR bullish (put writers expect price to stay up)
    // PCR < 1 = more calls = bullish positioning
    const pcr = totalCallOI > 0 ? totalPutOI / totalCallOI : 0
    
    return {
      available: true,
      expiry: nearestExpiry,
      putCallRatio: pcr,
      totalCallOI,
      totalPutOI,
      impliedVolatility: null,
      optionsAvailable: nearestOptions.length
    }
    
  } catch (error: any) {
    console.error('Options data fetch error:', error.message)
    return { available: false, reason: error.message }
  }
}

/**
 * Calculate how stock reacted to past earnings
 */
function calculateEarningsReactions(financials: any[], priceData: any) {
  if (!priceData?.historical || financials.length === 0) {
    return {
      available: false,
      message: 'Price data not available for reaction analysis'
    }
  }
  
  const reactions: any[] = []
  const prices = priceData.historical
  
  for (const quarter of financials.slice(0, 8)) { // Last 8 quarters
    const endDate = new Date(quarter.endDate)
    // Assume results announced ~1 month after quarter end
    const resultDate = new Date(endDate)
    resultDate.setMonth(resultDate.getMonth() + 1)
    
    // Find price on result day and days after
    const resultDayIdx = findNearestPriceIndex(prices, resultDate)
    
    if (resultDayIdx >= 0 && resultDayIdx < prices.length - 5) {
      const dayBefore = prices[resultDayIdx - 1]?.close || prices[resultDayIdx].open
      const resultDay = prices[resultDayIdx]
      const day1After = prices[resultDayIdx + 1]
      const day5After = prices[resultDayIdx + 5]
      
      const oneDayMove = ((resultDay.close - dayBefore) / dayBefore) * 100
      const fiveDayMove = day5After ? ((day5After.close - dayBefore) / dayBefore) * 100 : null
      
      reactions.push({
        quarter: `${quarter.quarter} ${quarter.fiscalYear}`,
        netProfit: quarter.netProfit,
        profitGrowthYoY: quarter.growth?.yoy?.netProfit || null,
        resultDate: resultDate.toISOString().split('T')[0],
        oneDayMove: parseFloat(oneDayMove.toFixed(2)),
        fiveDayMove: fiveDayMove ? parseFloat(fiveDayMove.toFixed(2)) : null,
        gap: resultDay.open !== dayBefore ? ((resultDay.open - dayBefore) / dayBefore) * 100 : 0
      })
    }
  }
  
  // Calculate averages
  const avgOneDayMove = reactions.length > 0
    ? reactions.reduce((sum, r) => sum + Math.abs(r.oneDayMove), 0) / reactions.length
    : 0
    
  const positiveReactions = reactions.filter(r => r.oneDayMove > 0).length
  const negativeReactions = reactions.filter(r => r.oneDayMove < 0).length
  
  return {
    available: true,
    reactions,
    summary: {
      avgAbsoluteMove: parseFloat(avgOneDayMove.toFixed(2)),
      positiveReactions,
      negativeReactions,
      consistency: positiveReactions > negativeReactions ? 'Tends to rally' : 
                   negativeReactions > positiveReactions ? 'Tends to fall' : 'Mixed'
    }
  }
}

/**
 * Analyze current price setup
 */
function analyzePriceSetup(priceData: any) {
  // Handle fallback price data (current price only, no historical)
  if (priceData && priceData.source === 'fallback' && priceData.currentPrice) {
    return {
      available: true,
      currentPrice: priceData.currentPrice,
      change: priceData.change,
      changePercent: priceData.changePercent,
      trend: priceData.changePercent > 1 ? 'UPTREND' : priceData.changePercent < -1 ? 'DOWNTREND' : 'SIDEWAYS',
      momentum: {
        thirtyDay: null,
        ninetyDay: null
      },
      levels: {
        resistance90D: null,
        support90D: null,
        resistance30D: null,
        support30D: null,
        sma20: null,
        sma50: null
      },
      volatility: {
        avgDailyRange: 3, // Default 3% for small caps
        distanceFromHigh: null,
        distanceFromLow: null
      },
      setup: 'UNKNOWN',
      source: 'fallback',
      note: 'Limited data - login to Kite for full technical analysis'
    }
  }
  
  if (!priceData?.historical || priceData.historical.length < 20) {
    return {
      available: false,
      currentPrice: priceData?.currentPrice || null,
      message: 'Insufficient price data for technical analysis'
    }
  }
  
  const prices = priceData.historical
  const currentPrice = priceData.currentPrice || prices[prices.length - 1].close
  
  // Calculate key levels
  const last90Days = prices.slice(-90)
  const last30Days = prices.slice(-30)
  const last5Days = prices.slice(-5)
  
  const high90 = Math.max(...last90Days.map((p: any) => p.high))
  const low90 = Math.min(...last90Days.map((p: any) => p.low))
  const high30 = Math.max(...last30Days.map((p: any) => p.high))
  const low30 = Math.min(...last30Days.map((p: any) => p.low))
  
  // Moving averages
  const sma20 = last30Days.slice(-20).reduce((sum: number, p: any) => sum + p.close, 0) / 20
  const sma50 = prices.slice(-50).reduce((sum: number, p: any) => sum + p.close, 0) / Math.min(50, prices.length)
  
  // Price momentum
  const price30DaysAgo = last30Days[0]?.close || currentPrice
  const price90DaysAgo = last90Days[0]?.close || currentPrice
  const momentum30D = ((currentPrice - price30DaysAgo) / price30DaysAgo) * 100
  const momentum90D = ((currentPrice - price90DaysAgo) / price90DaysAgo) * 100
  
  // Volatility (average daily range)
  const avgRange = last30Days.reduce((sum: number, p: any) => sum + ((p.high - p.low) / p.close) * 100, 0) / 30
  
  // Distance from key levels
  const distanceFromHigh = ((high90 - currentPrice) / high90) * 100
  const distanceFromLow = ((currentPrice - low90) / low90) * 100
  
  // Trend determination
  let trend = 'SIDEWAYS'
  if (currentPrice > sma20 && sma20 > sma50 && momentum30D > 5) {
    trend = 'UPTREND'
  } else if (currentPrice < sma20 && sma20 < sma50 && momentum30D < -5) {
    trend = 'DOWNTREND'
  }
  
  // Support/Resistance
  const support = low30
  const resistance = high30
  
  return {
    available: true,
    currentPrice,
    trend,
    momentum: {
      thirtyDay: parseFloat(momentum30D.toFixed(2)),
      ninetyDay: parseFloat(momentum90D.toFixed(2))
    },
    levels: {
      resistance90D: high90,
      support90D: low90,
      resistance30D: high30,
      support30D: low30,
      sma20: parseFloat(sma20.toFixed(2)),
      sma50: parseFloat(sma50.toFixed(2))
    },
    volatility: {
      avgDailyRange: parseFloat(avgRange.toFixed(2)),
      distanceFromHigh: parseFloat(distanceFromHigh.toFixed(2)),
      distanceFromLow: parseFloat(distanceFromLow.toFixed(2))
    },
    setup: trend === 'UPTREND' ? 'BULLISH' : trend === 'DOWNTREND' ? 'BEARISH' : 'NEUTRAL'
  }
}

/**
 * Analyze financial trend
 */
function analyzeFinancialTrend(financials: any[]) {
  if (financials.length < 4) {
    return {
      available: false,
      message: 'Insufficient financial data'
    }
  }
  
  const latest = financials[0]
  const prevQuarter = financials[1]
  const sameQuarterLastYear = financials[4] // 4 quarters ago
  
  // QoQ growth
  const qoqRevenue = prevQuarter?.revenue 
    ? ((latest.revenue - prevQuarter.revenue) / prevQuarter.revenue) * 100 
    : null
  const qoqProfit = prevQuarter?.netProfit
    ? ((latest.netProfit - prevQuarter.netProfit) / prevQuarter.netProfit) * 100
    : null
    
  // YoY growth
  const yoyRevenue = sameQuarterLastYear?.revenue
    ? ((latest.revenue - sameQuarterLastYear.revenue) / sameQuarterLastYear.revenue) * 100
    : null
  const yoyProfit = sameQuarterLastYear?.netProfit
    ? ((latest.netProfit - sameQuarterLastYear.netProfit) / sameQuarterLastYear.netProfit) * 100
    : null
    
  // Margin trend
  const latestMargin = latest.operatingProfit && latest.revenue
    ? (latest.operatingProfit / latest.revenue) * 100 : null
  const prevMargin = prevQuarter?.operatingProfit && prevQuarter?.revenue
    ? (prevQuarter.operatingProfit / prevQuarter.revenue) * 100 : null
    
  // Consistency check (last 4 quarters profit growth)
  let consecutiveGrowth = 0
  for (let i = 0; i < Math.min(4, financials.length - 1); i++) {
    if (financials[i].netProfit > financials[i + 1]?.netProfit) {
      consecutiveGrowth++
    } else {
      break
    }
  }
  
  // Determine trend
  let trend = 'NEUTRAL'
  if (yoyProfit && yoyProfit > 15 && qoqProfit && qoqProfit > 0) {
    trend = 'STRONG_GROWTH'
  } else if (yoyProfit && yoyProfit > 5) {
    trend = 'MODERATE_GROWTH'
  } else if (yoyProfit && yoyProfit < -10) {
    trend = 'DECLINING'
  } else if (yoyProfit && yoyProfit < 0) {
    trend = 'WEAK'
  }
  
  return {
    available: true,
    latestQuarter: `${latest.quarter} ${latest.fiscalYear}`,
    metrics: {
      revenue: latest.revenue,
      netProfit: latest.netProfit,
      eps: latest.eps,
      operatingMargin: latestMargin ? parseFloat(latestMargin.toFixed(2)) : null
    },
    growth: {
      qoqRevenue: qoqRevenue ? parseFloat(qoqRevenue.toFixed(2)) : null,
      qoqProfit: qoqProfit ? parseFloat(qoqProfit.toFixed(2)) : null,
      yoyRevenue: yoyRevenue ? parseFloat(yoyRevenue.toFixed(2)) : null,
      yoyProfit: yoyProfit ? parseFloat(yoyProfit.toFixed(2)) : null
    },
    marginTrend: latestMargin && prevMargin 
      ? (latestMargin > prevMargin ? 'EXPANDING' : 'CONTRACTING')
      : 'UNKNOWN',
    consecutiveGrowthQuarters: consecutiveGrowth,
    trend
  }
}

/**
 * Analyze news sentiment
 */
function analyzeSentiment(news: any[]) {
  if (news.length === 0) {
    return {
      available: false,
      score: 0,
      label: 'NO_DATA'
    }
  }
  
  let positiveCount = 0
  let negativeCount = 0
  let neutralCount = 0
  
  for (const item of news) {
    if (item.sentiment === 'POSITIVE') positiveCount++
    else if (item.sentiment === 'NEGATIVE') negativeCount++
    else neutralCount++
  }
  
  const total = news.length
  const score = ((positiveCount - negativeCount) / total) * 100
  
  let label = 'NEUTRAL'
  if (score > 30) label = 'BULLISH'
  else if (score > 10) label = 'SLIGHTLY_BULLISH'
  else if (score < -30) label = 'BEARISH'
  else if (score < -10) label = 'SLIGHTLY_BEARISH'
  
  return {
    available: true,
    score: parseFloat(score.toFixed(2)),
    label,
    breakdown: {
      positive: positiveCount,
      negative: negativeCount,
      neutral: neutralCount,
      total
    }
  }
}

/**
 * Analyze options data
 */
function analyzeOptions(optionsData: any) {
  if (!optionsData || !optionsData.available) {
    return {
      available: false,
      message: optionsData?.reason || 'Options data not available',
      notInFnO: optionsData?.reason?.includes('not in F&O') || false
    }
  }
  
  const pcr = optionsData.putCallRatio
  let sentiment = 'NEUTRAL'
  let interpretation = ''
  
  // PCR interpretation:
  // PCR > 1.2: More puts = Contrarian BULLISH (put writers expect price to hold/rise)
  // PCR 0.8-1.2: Balanced = NEUTRAL
  // PCR < 0.8: More calls = BULLISH sentiment (call buyers expect rise)
  // PCR < 0.5: Extreme call buying = Could be topping (contrarian bearish)
  
  if (pcr > 1.5) {
    sentiment = 'VERY_BULLISH'
    interpretation = 'Heavy put writing - market makers expect support'
  } else if (pcr > 1.2) {
    sentiment = 'BULLISH'
    interpretation = 'More puts than calls - contrarian bullish signal'
  } else if (pcr > 0.8) {
    sentiment = 'NEUTRAL'
    interpretation = 'Balanced positioning'
  } else if (pcr > 0.5) {
    sentiment = 'BULLISH'
    interpretation = 'More calls - bullish sentiment'
  } else if (pcr > 0) {
    sentiment = 'VERY_BULLISH'
    interpretation = 'Extreme call buying - strong bullish sentiment'
  } else {
    sentiment = 'NEUTRAL'
    interpretation = 'Insufficient data'
  }
  
  return {
    available: true,
    expiry: optionsData.expiry,
    putCallRatio: parseFloat(pcr.toFixed(2)),
    sentiment,
    interpretation,
    openInterest: {
      calls: optionsData.totalCallOI,
      puts: optionsData.totalPutOI
    }
  }
}

/**
 * Generate final trading verdict
 */
function generateVerdict(data: {
  symbol: string
  priceSetup: any
  financialTrend: any
  earningsReactions: any
  sentiment: any
  optionsAnalysis: any
}) {
  const scores = {
    priceSetup: 0,
    financials: 0,
    historicalReaction: 0,
    sentiment: 0,
    options: 0
  }
  
  // Score price setup (max 25)
  if (data.priceSetup.available) {
    if (data.priceSetup.setup === 'BULLISH') scores.priceSetup = 20
    else if (data.priceSetup.setup === 'BEARISH') scores.priceSetup = -15
    
    // Momentum bonus
    if (data.priceSetup.momentum?.thirtyDay > 10) scores.priceSetup += 5
    else if (data.priceSetup.momentum?.thirtyDay < -10) scores.priceSetup -= 5
  }
  
  // Score financials (max 30)
  if (data.financialTrend.available) {
    const trend = data.financialTrend.trend
    if (trend === 'STRONG_GROWTH') scores.financials = 30
    else if (trend === 'MODERATE_GROWTH') scores.financials = 20
    else if (trend === 'NEUTRAL') scores.financials = 5
    else if (trend === 'WEAK') scores.financials = -10
    else if (trend === 'DECLINING') scores.financials = -20
    
    // Margin bonus
    if (data.financialTrend.marginTrend === 'EXPANDING') scores.financials += 5
    else if (data.financialTrend.marginTrend === 'CONTRACTING') scores.financials -= 5
  }
  
  // Score historical reactions (max 15)
  if (data.earningsReactions.available) {
    const summary = data.earningsReactions.summary
    if (summary.consistency === 'Tends to rally') scores.historicalReaction = 15
    else if (summary.consistency === 'Tends to fall') scores.historicalReaction = -10
  }
  
  // Score sentiment (max 15)
  if (data.sentiment.available) {
    const label = data.sentiment.label
    if (label === 'BULLISH') scores.sentiment = 15
    else if (label === 'SLIGHTLY_BULLISH') scores.sentiment = 8
    else if (label === 'BEARISH') scores.sentiment = -12
    else if (label === 'SLIGHTLY_BEARISH') scores.sentiment = -6
  }
  
  // Score options (max 15)
  if (data.optionsAnalysis.available) {
    const optSentiment = data.optionsAnalysis.sentiment
    if (optSentiment === 'VERY_BULLISH') scores.options = 15
    else if (optSentiment === 'BULLISH') scores.options = 10
    else if (optSentiment === 'BEARISH') scores.options = -8
    else if (optSentiment === 'VERY_BEARISH') scores.options = -12
  }
  
  // Calculate total score
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0)
  const maxScore = 100
  const normalizedScore = Math.max(-100, Math.min(100, totalScore))
  
  // Determine recommendation
  let recommendation: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL' | 'AVOID'
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  
  if (normalizedScore >= 50) {
    recommendation = 'STRONG_BUY'
    confidence = 'HIGH'
  } else if (normalizedScore >= 25) {
    recommendation = 'BUY'
    confidence = 'MEDIUM'
  } else if (normalizedScore >= 0) {
    recommendation = 'HOLD'
    confidence = 'LOW'
  } else if (normalizedScore >= -25) {
    recommendation = 'HOLD'
    confidence = 'LOW'
  } else if (normalizedScore >= -50) {
    recommendation = 'SELL'
    confidence = 'MEDIUM'
  } else {
    recommendation = 'STRONG_SELL'
    confidence = 'HIGH'
  }
  
  // Calculate trade levels - use price data if available
  let tradePlan = null
  let currentPrice = data.priceSetup?.currentPrice
  
  // Get volatility from price data
  const dailyVolatility = data.priceSetup?.volatility?.avgDailyRange || 3
  
  // Expected move on earnings = at least 2x daily volatility, minimum 5%
  // Historical reactions can inform but use minimum thresholds
  let expectedMove = Math.max(5, dailyVolatility * 2)
  
  // Check historical reactions - but only use if realistic (> 2%)
  if (data.earningsReactions?.available && data.earningsReactions.summary?.avgAbsoluteMove > 2) {
    expectedMove = Math.max(expectedMove, data.earningsReactions.summary.avgAbsoluteMove)
  }
  
  // Adjust expected move based on financial trend
  if (data.financialTrend?.trend === 'STRONG_GROWTH') {
    expectedMove *= 1.2 // 20% more move expected on strong growth
  } else if (data.financialTrend?.trend === 'DECLINING') {
    expectedMove *= 1.3 // Declining stocks can have sharper moves
  }
  
  // Ensure reasonable bounds: 5-15% for earnings
  expectedMove = Math.max(5, Math.min(15, expectedMove))
  
  const volatility = dailyVolatility
  
  if (currentPrice && (recommendation === 'STRONG_BUY' || recommendation === 'BUY')) {
    // Stop loss: 4-5% below entry (reasonable for earnings play)
    const stopLossPercent = Math.max(4, volatility * 1.5)
    // Target 1: Expected move (5-10%)
    const target1Percent = expectedMove
    // Target 2: 1.5-2x expected move
    const target2Percent = expectedMove * 1.8
    
    tradePlan = {
      action: 'LONG',
      entry: parseFloat(currentPrice.toFixed(2)),
      stopLoss: parseFloat((currentPrice * (1 - stopLossPercent / 100)).toFixed(2)),
      target1: parseFloat((currentPrice * (1 + target1Percent / 100)).toFixed(2)),
      target2: parseFloat((currentPrice * (1 + target2Percent / 100)).toFixed(2)),
      stopLossPercent: `-${stopLossPercent.toFixed(1)}%`,
      target1Percent: `+${target1Percent.toFixed(1)}%`,
      target2Percent: `+${target2Percent.toFixed(1)}%`,
      expectedMove: `±${expectedMove.toFixed(1)}%`,
      riskReward: `1:${(target1Percent / stopLossPercent).toFixed(1)}`,
      positionSize: recommendation === 'STRONG_BUY' ? 'Use 4-5% of capital' : 'Use 2-3% of capital',
      holdingPeriod: recommendation === 'STRONG_BUY' ? '1-5 days post results' : '1-3 days post results',
      timing: 'Enter before results OR wait for gap and ride momentum'
    }
  } else if (currentPrice && (recommendation === 'STRONG_SELL' || recommendation === 'SELL')) {
    const stopLossPercent = Math.max(5, volatility * 2)
    const target1Percent = expectedMove
    const target2Percent = expectedMove * 1.5
    
    tradePlan = {
      action: 'SHORT',
      entry: parseFloat(currentPrice.toFixed(2)),
      stopLoss: parseFloat((currentPrice * (1 + stopLossPercent / 100)).toFixed(2)),
      target1: parseFloat((currentPrice * (1 - target1Percent / 100)).toFixed(2)),
      target2: parseFloat((currentPrice * (1 - target2Percent / 100)).toFixed(2)),
      stopLossPercent: `+${stopLossPercent.toFixed(1)}%`,
      target1Percent: `-${target1Percent.toFixed(1)}%`,
      target2Percent: `-${target2Percent.toFixed(1)}%`,
      expectedMove: `±${expectedMove.toFixed(1)}%`,
      riskReward: `1:${(target1Percent / stopLossPercent).toFixed(1)}`,
      positionSize: 'Use 2-3% of capital (higher risk for shorts)',
      holdingPeriod: '1-3 days post results',
      timing: 'Wait for results, short on bad numbers + gap down'
    }
  } else if (currentPrice) {
    // HOLD recommendation - still show expected move and potential levels
    const potentialUp = parseFloat((currentPrice * 1.06).toFixed(2))
    const potentialDown = parseFloat((currentPrice * 0.94).toFixed(2))
    
    tradePlan = {
      action: 'WAIT',
      currentPrice: parseFloat(currentPrice.toFixed(2)),
      expectedMove: `±${expectedMove.toFixed(1)}%`,
      potentialRange: `₹${potentialDown} - ₹${potentialUp}`,
      recommendation: 'Wait for results before taking position. Risk/reward not favorable pre-earnings.',
      positionSize: 'None - too risky without clear direction'
    }
  }
  
  // Risk factors
  const riskFactors: string[] = []
  if (data.earningsReactions.available && data.earningsReactions.summary.avgAbsoluteMove > 5) {
    riskFactors.push(`High volatility expected (avg ${data.earningsReactions.summary.avgAbsoluteMove}% move on results)`)
  }
  if (data.sentiment.label?.includes('BEARISH')) {
    riskFactors.push('Negative news sentiment')
  }
  if (data.financialTrend.trend === 'DECLINING') {
    riskFactors.push('Declining financial performance')
  }
  if (!data.optionsAnalysis.available) {
    riskFactors.push('No options data - harder to hedge')
  }
  
  return {
    recommendation,
    confidence,
    score: normalizedScore,
    breakdown: scores,
    tradePlan,
    riskFactors,
    summary: generateSummary(data, recommendation, normalizedScore)
  }
}

/**
 * Generate human-readable summary
 */
function generateSummary(data: any, recommendation: string, score: number): string {
  const parts: string[] = []
  
  // Price setup
  if (data.priceSetup.available) {
    parts.push(`Stock is in ${data.priceSetup.trend.toLowerCase()} with ${data.priceSetup.momentum?.thirtyDay > 0 ? 'positive' : 'negative'} momentum.`)
  }
  
  // Financials
  if (data.financialTrend.available) {
    const trend = data.financialTrend.trend.replace('_', ' ').toLowerCase()
    parts.push(`Financial performance shows ${trend} trend.`)
  }
  
  // Historical
  if (data.earningsReactions.available) {
    parts.push(`Historically, stock ${data.earningsReactions.summary.consistency.toLowerCase()} after earnings.`)
  }
  
  // Final verdict
  if (recommendation.includes('BUY')) {
    parts.push(`Overall setup is favorable for a long position.`)
  } else if (recommendation.includes('SELL')) {
    parts.push(`Consider avoiding or taking a short position.`)
  } else {
    parts.push(`Wait for more clarity before taking a position.`)
  }
  
  return parts.join(' ')
}

// Helper functions
function findNearestPriceIndex(prices: any[], targetDate: Date): number {
  const targetTime = targetDate.getTime()
  let nearestIdx = -1
  let minDiff = Infinity
  
  for (let i = 0; i < prices.length; i++) {
    const priceDate = new Date(prices[i].date)
    const diff = Math.abs(priceDate.getTime() - targetTime)
    if (diff < minDiff) {
      minDiff = diff
      nearestIdx = i
    }
  }
  
  return nearestIdx
}

function analyzeTitleSentiment(title: string): 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' {
  const positiveWords = ['surge', 'rally', 'gain', 'rise', 'jump', 'soar', 'profit', 'beat', 'growth', 'strong', 'bullish', 'buy', 'upgrade', 'record', 'high']
  const negativeWords = ['fall', 'drop', 'decline', 'loss', 'crash', 'plunge', 'weak', 'bearish', 'sell', 'downgrade', 'miss', 'concern', 'warning', 'risk', 'trouble', 'fraud']
  
  const lowerTitle = title.toLowerCase()
  
  let positiveScore = 0
  let negativeScore = 0
  
  for (const word of positiveWords) {
    if (lowerTitle.includes(word)) positiveScore++
  }
  for (const word of negativeWords) {
    if (lowerTitle.includes(word)) negativeScore++
  }
  
  if (positiveScore > negativeScore) return 'POSITIVE'
  if (negativeScore > positiveScore) return 'NEGATIVE'
  return 'NEUTRAL'
}

function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
}
