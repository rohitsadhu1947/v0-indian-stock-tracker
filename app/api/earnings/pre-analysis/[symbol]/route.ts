import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { quarterlyFinancials } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { getUserBrokerManager } from '@/lib/broker'
import type { BrokerClient, InstrumentData } from '@/lib/broker'

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
    // Get broker manager
    const manager = await getUserBrokerManager()
    const hasConnection = manager.hasConnection()
    let brokerClient: BrokerClient | null = null

    if (hasConnection) {
      brokerClient = manager.getClient()
    }

    console.log(`🔑 Broker: ${hasConnection ? 'Connected' : 'Not connected'}`)

    // Parallel fetch all data
    const [
      financials,
      priceData,
      newsData,
      optionsData
    ] = await Promise.all([
      fetchFinancials(symbol),
      fetchPriceData(symbol, brokerClient),
      fetchNews(symbol),
      fetchOptionsData(symbol, brokerClient)
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
async function fetchPriceData(symbol: string, client: BrokerClient | null) {
  // Try broker first
  if (client) {
    try {
      // Get instrument token
      const instruments = await client.getInstruments('NSE')
      const instrument = instruments.find((i) => i.tradingsymbol === symbol)

      if (!instrument) {
        console.log(`⚠️ Instrument not found for ${symbol}`)
      } else {
        // Fetch 6 months of daily data
        const toDate = new Date()
        const fromDate = new Date()
        fromDate.setMonth(fromDate.getMonth() - 6)

        const historicalData = await client.getHistoricalData({
          instrumentToken: instrument.instrumentToken,
          interval: 'day',
          from: fromDate,
          to: toDate,
          symbol,
          exchange: 'NSE'
        })

        // Get current quote
        const quote = await client.getQuote([`NSE:${symbol}`])
        const currentPrice = quote[`NSE:${symbol}`]?.lastPrice

        console.log(`✅ Got broker price data for ${symbol}: ₹${currentPrice}`)

        return {
          historical: historicalData,
          currentPrice,
          instrumentToken: instrument.instrumentToken,
          source: 'broker'
        }
      }
    } catch (error: any) {
      console.error('Broker price data error:', error.message)
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
 * Fetch COMPLETE options data from Kite
 * This is serious trading analysis - we fetch ALL options data
 */
async function fetchOptionsData(symbol: string, client: BrokerClient | null) {
  try {
    if (!client) {
      return { available: false, reason: 'Broker not connected' }
    }

    // Get NFO instruments for this symbol
    console.log(`🔍 Fetching COMPLETE F&O data for ${symbol}...`)
    const instruments = await client.getInstruments('NFO')

    // Find all options for this symbol
    const symbolOptions = instruments.filter((i) =>
      i.name === symbol &&
      (i.instrumentType === 'CE' || i.instrumentType === 'PE')
    )

    if (symbolOptions.length === 0) {
      console.log(`⚠️ No options found for ${symbol} - not in F&O segment`)
      return {
        available: false,
        reason: `${symbol} is not in F&O segment. Only ~200 stocks on NSE have options trading.`
      }
    }

    console.log(`📊 ${symbol}: Found ${symbolOptions.length} total option contracts`)

    // Get all unique expiries sorted by date
    const expiries = [...new Set(symbolOptions.map((o) => new Date(o.raw?.expiry).getTime()))]
      .sort((a, b) => a - b)
      .map(t => new Date(t))

    console.log(`📊 ${symbol}: ${expiries.length} expiries available`)

    // Log all expiries with their option counts
    const expiryData: { expiry: Date, calls: InstrumentData[], puts: InstrumentData[] }[] = []

    for (const expiry of expiries) {
      const expiryTime = expiry.getTime()
      const expiryOptions = symbolOptions.filter((i) =>
        new Date(i.raw?.expiry).getTime() === expiryTime
      )
      const calls = expiryOptions.filter((o) => o.instrumentType === 'CE')
      const puts = expiryOptions.filter((o) => o.instrumentType === 'PE')

      console.log(`  ${expiry.toLocaleDateString()}: ${calls.length} CE, ${puts.length} PE`)

      expiryData.push({ expiry, calls, puts })
    }

    // Select the MONTHLY expiry (usually last Thursday of month) with most liquidity
    // Monthly expiries typically have more options than weekly
    let selectedExpiry = expiryData[0]

    // Find expiry with most options (likely monthly)
    for (const ed of expiryData) {
      const totalOptions = ed.calls.length + ed.puts.length
      const selectedTotal = selectedExpiry.calls.length + selectedExpiry.puts.length

      // Prefer expiry with both calls AND puts, and more total options
      if (ed.calls.length > 0 && ed.puts.length > 0 && totalOptions > selectedTotal) {
        selectedExpiry = ed
      }
    }

    const calls = selectedExpiry.calls
    const puts = selectedExpiry.puts

    console.log(`📊 Selected expiry: ${selectedExpiry.expiry.toLocaleDateString()} with ${calls.length} CE, ${puts.length} PE`)

    // Fetch quotes for ALL options in selected expiry
    // Batch if needed (brokers typically allow ~500 symbols per request)
    const allOptions = [...calls, ...puts]
    const BATCH_SIZE = 400
    let allQuotes: Record<string, any> = {}

    for (let i = 0; i < allOptions.length; i += BATCH_SIZE) {
      const batch = allOptions.slice(i, i + BATCH_SIZE)
      const symbols = batch.map((o) => `NFO:${o.tradingsymbol}`)

      console.log(`📊 Fetching batch ${Math.floor(i/BATCH_SIZE) + 1}: ${symbols.length} options...`)

      const quotes = await client.getQuote(symbols)
      allQuotes = { ...allQuotes, ...quotes }
    }

    console.log(`📊 Got quotes for ${Object.keys(allQuotes).length} options`)

    // Calculate total open interest for calls and puts
    let totalCallOI = 0
    let totalPutOI = 0
    let totalCallVolume = 0
    let totalPutVolume = 0

    const callDetails: any[] = []
    const putDetails: any[] = []

    for (const call of calls) {
      const quote = allQuotes[`NFO:${call.tradingsymbol}`]
      if (quote) {
        const oi = quote.raw?.oi || 0
        totalCallOI += oi
        totalCallVolume += quote.volume || 0
        if (oi > 0) {
          callDetails.push({
            strike: call.raw?.strike,
            oi,
            volume: quote.volume,
            ltp: quote.lastPrice
          })
        }
      }
    }

    for (const put of puts) {
      const quote = allQuotes[`NFO:${put.tradingsymbol}`]
      if (quote) {
        const oi = quote.raw?.oi || 0
        totalPutOI += oi
        totalPutVolume += quote.volume || 0
        if (oi > 0) {
          putDetails.push({
            strike: put.raw?.strike,
            oi,
            volume: quote.volume,
            ltp: quote.lastPrice
          })
        }
      }
    }

    console.log(`📊 ${symbol} TOTAL OI: Calls=${totalCallOI.toLocaleString()}, Puts=${totalPutOI.toLocaleString()}`)
    console.log(`📊 ${symbol} TOTAL Volume: Calls=${totalCallVolume.toLocaleString()}, Puts=${totalPutVolume.toLocaleString()}`)

    // Find max pain (strike with highest total OI)
    const strikeOI: Record<number, number> = {}
    for (const c of callDetails) {
      strikeOI[c.strike] = (strikeOI[c.strike] || 0) + c.oi
    }
    for (const p of putDetails) {
      strikeOI[p.strike] = (strikeOI[p.strike] || 0) + p.oi
    }

    const maxPainStrike = Object.entries(strikeOI)
      .sort((a, b) => b[1] - a[1])[0]

    // PCR = Put OI / Call OI (standard formula)
    const pcr = totalCallOI > 0 ? totalPutOI / totalCallOI : 0

    // Volume PCR (more recent sentiment)
    const volumePCR = totalCallVolume > 0 ? totalPutVolume / totalCallVolume : 0

    console.log(`📊 ${symbol} PCR (OI): ${pcr.toFixed(2)}, PCR (Volume): ${volumePCR.toFixed(2)}`)
    console.log(`📊 ${symbol} Max Pain Strike: ${maxPainStrike?.[0]} (OI: ${maxPainStrike?.[1]?.toLocaleString()})`)

    return {
      available: true,
      expiry: selectedExpiry.expiry,
      putCallRatio: pcr,
      volumePCR,
      totalCallOI,
      totalPutOI,
      totalCallVolume,
      totalPutVolume,
      maxPainStrike: maxPainStrike ? Number(maxPainStrike[0]) : null,
      optionsAvailable: allOptions.length,
      callsWithOI: callDetails.length,
      putsWithOI: putDetails.length,
      topCalls: callDetails.sort((a, b) => b.oi - a.oi).slice(0, 5),
      topPuts: putDetails.sort((a, b) => b.oi - a.oi).slice(0, 5)
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
 * Analyze options data - comprehensive analysis
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
  const volumePCR = optionsData.volumePCR || pcr

  let sentiment = 'NEUTRAL'
  let interpretation = ''

  // PCR interpretation (using both OI and Volume):
  // PCR > 1.2: More puts = Contrarian BULLISH (put writers expect price to hold/rise)
  // PCR 0.8-1.2: Balanced = NEUTRAL
  // PCR < 0.8: More calls = BULLISH sentiment (call buyers expect rise)
  // PCR < 0.5: Extreme call buying = strong bullish

  if (pcr > 1.5) {
    sentiment = 'VERY_BULLISH'
    interpretation = `Heavy put writing (PCR: ${pcr.toFixed(2)}) - institutions expect strong support`
  } else if (pcr > 1.2) {
    sentiment = 'BULLISH'
    interpretation = `Put heavy (PCR: ${pcr.toFixed(2)}) - contrarian bullish, put sellers confident`
  } else if (pcr > 0.8) {
    sentiment = 'NEUTRAL'
    interpretation = `Balanced (PCR: ${pcr.toFixed(2)}) - market undecided`
  } else if (pcr > 0.5) {
    sentiment = 'BULLISH'
    interpretation = `Call heavy (PCR: ${pcr.toFixed(2)}) - bullish sentiment`
  } else if (pcr > 0) {
    sentiment = 'VERY_BULLISH'
    interpretation = `Extreme call buying (PCR: ${pcr.toFixed(2)}) - very bullish sentiment`
  } else {
    sentiment = 'NEUTRAL'
    interpretation = 'Insufficient open interest data'
  }

  // Add volume PCR context if different from OI PCR
  if (Math.abs(volumePCR - pcr) > 0.2) {
    interpretation += `. Today's volume PCR: ${volumePCR.toFixed(2)} (${volumePCR > pcr ? 'more put buying today' : 'more call buying today'})`
  }

  return {
    available: true,
    expiry: optionsData.expiry,
    putCallRatio: parseFloat(pcr.toFixed(2)),
    volumePCR: parseFloat(volumePCR.toFixed(2)),
    sentiment,
    interpretation,
    maxPainStrike: optionsData.maxPainStrike,
    openInterest: {
      calls: optionsData.totalCallOI,
      puts: optionsData.totalPutOI
    },
    volume: {
      calls: optionsData.totalCallVolume,
      puts: optionsData.totalPutVolume
    },
    contractsAnalyzed: optionsData.optionsAvailable,
    callsWithOI: optionsData.callsWithOI,
    putsWithOI: optionsData.putsWithOI,
    topStrikes: {
      calls: optionsData.topCalls,
      puts: optionsData.topPuts
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

  // OPTIONS IMPACT: Adjust expected move based on options sentiment
  if (data.optionsAnalysis?.available) {
    const pcr = data.optionsAnalysis.putCallRatio || 0

    // High PCR (>1.2) = put sellers confident = likely to hold/rise
    // Low PCR (<0.7) = call heavy = bullish momentum
    if (pcr > 1.5 || pcr < 0.5) {
      // Extreme positioning = expect bigger move
      expectedMove *= 1.15
    }
  }

  // Ensure reasonable bounds: 5-15% for earnings
  expectedMove = Math.max(5, Math.min(15, expectedMove))

  const volatility = dailyVolatility

  // Get Max Pain from options (key level where stock tends to gravitate)
  const maxPain = data.optionsAnalysis?.maxPainStrike || null

  if (currentPrice && (recommendation === 'STRONG_BUY' || recommendation === 'BUY')) {
    // Stop loss: 4-5% below entry (reasonable for earnings play)
    const stopLossPercent = Math.max(4, volatility * 1.5)
    // Target 1: Expected move (5-10%)
    const target1Percent = expectedMove
    // Target 2: 1.5-2x expected move
    const target2Percent = expectedMove * 1.8

    // Calculate actual prices
    const stopLossPrice = parseFloat((currentPrice * (1 - stopLossPercent / 100)).toFixed(2))
    let target1Price = parseFloat((currentPrice * (1 + target1Percent / 100)).toFixed(2))
    let target2Price = parseFloat((currentPrice * (1 + target2Percent / 100)).toFixed(2))

    // If Max Pain is ABOVE current price, use it as a target level
    if (maxPain && maxPain > currentPrice) {
      const maxPainPercent = ((maxPain - currentPrice) / currentPrice) * 100
      if (maxPainPercent > 2 && maxPainPercent < target1Percent) {
        // Max Pain is a realistic intermediate target
        target1Price = maxPain
      }
    }

    tradePlan = {
      action: 'LONG',
      entry: parseFloat(currentPrice.toFixed(2)),
      stopLoss: stopLossPrice,
      target1: target1Price,
      target2: target2Price,
      maxPain: maxPain,
      stopLossPercent: `-${stopLossPercent.toFixed(1)}%`,
      target1Percent: `+${((target1Price - currentPrice) / currentPrice * 100).toFixed(1)}%`,
      target2Percent: `+${((target2Price - currentPrice) / currentPrice * 100).toFixed(1)}%`,
      expectedMove: `\u00B1${expectedMove.toFixed(1)}%`,
      riskReward: `1:${(target1Percent / stopLossPercent).toFixed(1)}`,
      positionSize: recommendation === 'STRONG_BUY' ? 'Use 4-5% of capital' : 'Use 2-3% of capital',
      holdingPeriod: recommendation === 'STRONG_BUY' ? '1-5 days post results' : '1-3 days post results',
      timing: 'Enter before results OR wait for gap and ride momentum',
      optionsContext: data.optionsAnalysis?.available
        ? `PCR: ${data.optionsAnalysis.putCallRatio?.toFixed(2)} (${data.optionsAnalysis.sentiment})`
        : null
    }
  } else if (currentPrice && (recommendation === 'STRONG_SELL' || recommendation === 'SELL')) {
    const stopLossPercent = Math.max(5, volatility * 2)
    const target1Percent = expectedMove
    const target2Percent = expectedMove * 1.5

    const stopLossPrice = parseFloat((currentPrice * (1 + stopLossPercent / 100)).toFixed(2))
    let target1Price = parseFloat((currentPrice * (1 - target1Percent / 100)).toFixed(2))
    let target2Price = parseFloat((currentPrice * (1 - target2Percent / 100)).toFixed(2))

    // If Max Pain is BELOW current price, use it as a target level
    if (maxPain && maxPain < currentPrice) {
      const maxPainPercent = ((currentPrice - maxPain) / currentPrice) * 100
      if (maxPainPercent > 2 && maxPainPercent < target1Percent) {
        target1Price = maxPain
      }
    }

    tradePlan = {
      action: 'SHORT',
      entry: parseFloat(currentPrice.toFixed(2)),
      stopLoss: stopLossPrice,
      target1: target1Price,
      target2: target2Price,
      maxPain: maxPain,
      stopLossPercent: `+${stopLossPercent.toFixed(1)}%`,
      target1Percent: `-${((currentPrice - target1Price) / currentPrice * 100).toFixed(1)}%`,
      target2Percent: `-${((currentPrice - target2Price) / currentPrice * 100).toFixed(1)}%`,
      expectedMove: `\u00B1${expectedMove.toFixed(1)}%`,
      riskReward: `1:${(target1Percent / stopLossPercent).toFixed(1)}`,
      positionSize: 'Use 2-3% of capital (higher risk for shorts)',
      holdingPeriod: '1-3 days post results',
      timing: 'Wait for results, short on bad numbers + gap down',
      optionsContext: data.optionsAnalysis?.available
        ? `PCR: ${data.optionsAnalysis.putCallRatio?.toFixed(2)} (${data.optionsAnalysis.sentiment})`
        : null
    }
  } else if (currentPrice) {
    // HOLD recommendation - still show expected move and potential levels
    const potentialUp = parseFloat((currentPrice * (1 + expectedMove/100)).toFixed(2))
    const potentialDown = parseFloat((currentPrice * (1 - expectedMove/100)).toFixed(2))

    tradePlan = {
      action: 'WAIT',
      currentPrice: parseFloat(currentPrice.toFixed(2)),
      expectedMove: `\u00B1${expectedMove.toFixed(1)}%`,
      potentialRange: `\u20B9${potentialDown} - \u20B9${potentialUp}`,
      maxPain: maxPain,
      recommendation: 'Wait for results before taking position. Risk/reward not favorable pre-earnings.',
      positionSize: 'None - too risky without clear direction',
      optionsContext: data.optionsAnalysis?.available
        ? `PCR: ${data.optionsAnalysis.putCallRatio?.toFixed(2)} - watch for direction after results`
        : null
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
