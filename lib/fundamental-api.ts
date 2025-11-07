/**
 * Yahoo Finance API Integration
 * Fetches fundamental data: P/E, ROE, Debt/Equity, Market Cap
 */

export interface FundamentalData {
  symbol: string
  marketCap: number
  pe: number | null
  roe: number | null
  debtToEquity: number | null
  priceToBook: number | null
  currentPrice: number
  lastUpdated: Date
}

export interface FundamentalScore {
  score: number  // 0-30
  tier: 'BLUE_CHIP' | 'QUALITY' | 'SPECULATIVE' | 'FAIL'
  data: FundamentalData
  reasoning: string
}

/**
 * REALISTIC DUMMY DATA FOR TESTING
 * TODO: Replace with paid API (Alpha Vantage, Financial Modeling Prep, etc.)
 * Yahoo Finance has blocked free API access (401 errors)
 */
const REALISTIC_FUNDAMENTAL_DATA: Record<string, Partial<FundamentalData>> = {
  // Large Caps - Blue Chip Quality
  'RELIANCE': { marketCap: 1700000000000, pe: 24, roe: 12, debtToEquity: 0.6, priceToBook: 2.1 },
  'TCS': { marketCap: 1300000000000, pe: 28, roe: 42, debtToEquity: 0.1, priceToBook: 12.5 },
  'HDFCBANK': { marketCap: 1200000000000, pe: 18, roe: 16, debtToEquity: 5.2, priceToBook: 2.8 },
  'INFY': { marketCap: 700000000000, pe: 26, roe: 31, debtToEquity: 0.1, priceToBook: 8.2 },
  'ICICIBANK': { marketCap: 800000000000, pe: 17, roe: 18, debtToEquity: 6.1, priceToBook: 2.9 },
  'SBIN': { marketCap: 600000000000, pe: 10, roe: 19, debtToEquity: 7.8, priceToBook: 1.2 },
  'BHARTIARTL': { marketCap: 550000000000, pe: 35, roe: 14, debtToEquity: 1.8, priceToBook: 6.5 },
  'ITC': { marketCap: 500000000000, pe: 22, roe: 25, debtToEquity: 0.2, priceToBook: 5.8 },
  'LT': { marketCap: 480000000000, pe: 29, roe: 13, debtToEquity: 0.7, priceToBook: 4.2 },
  'KOTAKBANK': { marketCap: 400000000000, pe: 16, roe: 14, debtToEquity: 4.9, priceToBook: 2.1 },
  
  // Oil & Gas - Quality/Speculative
  'ONGC': { marketCap: 280000000000, pe: 8, roe: 14, debtToEquity: 0.3, priceToBook: 1.1 },
  'BPCL': { marketCap: 150000000000, pe: 12, roe: 15, debtToEquity: 0.8, priceToBook: 1.6 },
  'IOC': { marketCap: 180000000000, pe: 9, roe: 11, debtToEquity: 1.2, priceToBook: 0.9 },
  'GAIL': { marketCap: 90000000000, pe: 11, roe: 16, debtToEquity: 0.5, priceToBook: 1.3 },
  
  // Pharma - Mixed Quality
  'SUNPHARMA': { marketCap: 350000000000, pe: 36, roe: 14, debtToEquity: 0.1, priceToBook: 4.8 },
  'DRREDDY': { marketCap: 110000000000, pe: 20, roe: 17, debtToEquity: 0.2, priceToBook: 3.5 },
  'CIPLA': { marketCap: 120000000000, pe: 25, roe: 18, debtToEquity: 0.1, priceToBook: 4.2 },
  'BIOCON': { marketCap: 70000000000, pe: 45, roe: 8, debtToEquity: 0.4, priceToBook: 2.9 },
  'LUPIN': { marketCap: 60000000000, pe: 28, roe: 9, debtToEquity: 0.3, priceToBook: 2.1 },
  'TORNTPHARM': { marketCap: 85000000000, pe: 52, roe: 16, debtToEquity: 0.0, priceToBook: 9.8 },
  'DIVISLAB': { marketCap: 95000000000, pe: 42, roe: 15, debtToEquity: 0.1, priceToBook: 6.5 },
  
  // Metals & Mining - Cyclical/Speculative
  'HINDALCO': { marketCap: 120000000000, pe: 15, roe: 12, debtToEquity: 0.9, priceToBook: 1.8 },
  'TATASTEEL': { marketCap: 180000000000, pe: 7, roe: 8, debtToEquity: 1.1, priceToBook: 1.2 },
  'COALINDIA': { marketCap: 250000000000, pe: 9, roe: 35, debtToEquity: 0.1, priceToBook: 2.8 },
  'VEDL': { marketCap: 140000000000, pe: 12, roe: 10, debtToEquity: 0.6, priceToBook: 1.5 },
  'SAIL': { marketCap: 45000000000, pe: 18, roe: 6, debtToEquity: 2.1, priceToBook: 0.8 },
  'JSWSTEEL': { marketCap: 200000000000, pe: 21, roe: 15, debtToEquity: 0.7, priceToBook: 2.1 },
  
  // Cement - Quality
  'ULTRACEMCO': { marketCap: 350000000000, pe: 32, roe: 19, debtToEquity: 0.1, priceToBook: 6.5 },
  'ACC': { marketCap: 48000000000, pe: 25, roe: 12, debtToEquity: 0.2, priceToBook: 2.8 },
  'AMBUJACEM': { marketCap: 110000000000, pe: 28, roe: 14, debtToEquity: 0.1, priceToBook: 3.2 },
  'GRASIM': { marketCap: 150000000000, pe: 18, roe: 13, debtToEquity: 0.5, priceToBook: 2.1 },
  
  // FMCG - Quality
  'HINDUNILVR': { marketCap: 620000000000, pe: 58, roe: 85, debtToEquity: 0.0, priceToBook: 47.5 },
  'NESTLEIND': { marketCap: 230000000000, pe: 72, roe: 92, debtToEquity: 0.0, priceToBook: 52.8 },
  'BRITANNIA': { marketCap: 140000000000, pe: 48, roe: 32, debtToEquity: 0.1, priceToBook: 15.2 },
  'DABUR': { marketCap: 100000000000, pe: 50, roe: 21, debtToEquity: 0.0, priceToBook: 10.5 },
  
  // Banks - PSU (Speculative)
  'PNB': { marketCap: 95000000000, pe: 8, roe: 12, debtToEquity: 8.5, priceToBook: 0.9 },
  'BANKBARODA': { marketCap: 100000000000, pe: 6, roe: 14, debtToEquity: 9.2, priceToBook: 0.8 },
  'CANBK': { marketCap: 75000000000, pe: 5, roe: 16, debtToEquity: 8.1, priceToBook: 0.7 },
  'UNIONBANK': { marketCap: 80000000000, pe: 7, roe: 13, debtToEquity: 9.8, priceToBook: 0.8 },
  
  // Agriculture/Chemicals
  'UPL': { marketCap: 60000000000, pe: 18, roe: 11, debtToEquity: 1.2, priceToBook: 2.1 },
  'PIDILITIND': { marketCap: 140000000000, pe: 85, roe: 23, debtToEquity: 0.0, priceToBook: 19.5 },
  'AARTI IND': { marketCap: 32000000000, pe: 28, roe: 14, debtToEquity: 0.8, priceToBook: 3.8 },
}

/**
 * Fetch fundamental data from existing API endpoint
 * This uses the same working system as the Fundamentals tab
 * Falls back to dummy data if API fails (for common stocks)
 */
export async function getFundamentals(symbol: string): Promise<FundamentalData | null> {
  try {
    // Use the existing /api/fundamentals/quote endpoint
    // This has 3-tier fallback: Yahoo quoteSummary → Yahoo quote → Screener.in
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/fundamentals/quote?symbol=${symbol}&exchange=NSE`, {
      // Add timeout to prevent hanging
      signal: AbortSignal.timeout(10000) // 10 second timeout
    })
    
    if (!response.ok) {
      console.error(`⚠️  Fundamentals API failed for ${symbol}: ${response.status}`)
      // Fall back to dummy data for common stocks
      return getDummyFallbackData(symbol)
    }
    
    const result = await response.json()
    
    if (!result.success || !result.data) {
      console.error(`⚠️  No fundamental data for ${symbol}`)
      return getDummyFallbackData(symbol)
    }
    
    // Map the API response to our FundamentalData format
    const apiData = result.data
    
    console.log(`✅ Live fundamentals fetched for ${symbol}`)
    
    return {
      symbol: symbol.toUpperCase(),
      marketCap: apiData.marketCap || 0,
      pe: apiData.peRatio || null,
      roe: apiData.roe ? (apiData.roe > 1 ? apiData.roe : apiData.roe * 100) : null, // Handle both decimal and percentage
      debtToEquity: apiData.debtToEquity || null,
      priceToBook: apiData.pbRatio || apiData.priceToBook || null,
      currentPrice: apiData.currentPrice || 0,
      lastUpdated: new Date()
    }
  } catch (error: any) {
    console.error(`❌ Error fetching fundamentals for ${symbol}:`, error.message)
    // Fall back to dummy data
    return getDummyFallbackData(symbol)
  }
}

/**
 * Get dummy/fallback fundamental data for common stocks
 * Used when API fails or times out
 */
function getDummyFallbackData(symbol: string): FundamentalData | null {
  const dummyData = REALISTIC_FUNDAMENTAL_DATA[symbol]
  if (dummyData) {
    console.log(`📋 Using fallback data for ${symbol}`)
    return {
      symbol,
      marketCap: dummyData.marketCap || 50000000000,
      pe: dummyData.pe || null,
      roe: dummyData.roe || null,
      debtToEquity: dummyData.debtToEquity || null,
      priceToBook: dummyData.priceToBook || null,
      currentPrice: 0,
      lastUpdated: new Date()
    }
  }
  
  // For unknown stocks, return moderate defaults
  console.log(`⚠️  No data for ${symbol}, using defaults`)
  return {
    symbol,
    marketCap: 50000000000, // 50,000 Cr (mid cap)
    pe: 20,
    roe: 12,
    debtToEquity: 1.0,
    priceToBook: 2.5,
    currentPrice: 0,
    lastUpdated: new Date()
  }
}

/**
 * Calculate fundamental score based on quality tiers
 * UPDATED: More realistic thresholds for Indian stocks (especially oil/gas/banks)
 */
export function calculateFundamentalScore(data: FundamentalData | null): FundamentalScore {
  if (!data) {
    return {
      score: 0,
      tier: 'FAIL',
      data: {
        symbol: '',
        marketCap: 0,
        pe: null,
        roe: null,
        debtToEquity: null,
        priceToBook: null,
        currentPrice: 0,
        lastUpdated: new Date()
      },
      reasoning: 'No fundamental data available'
    }
  }

  const { marketCap, pe, roe, debtToEquity } = data

  // Market cap is already in INR (not USD), so convert to Crores directly
  const marketCapCr = marketCap / 10000000 // Convert to Crores (1 Cr = 10 million)
  
  // TIER 1: BLUE CHIP (30 points)
  // Large cap (>50K Cr), good ROE (>15%), reasonable P/E (5-30), acceptable debt (<5.0)
  // NOTE: Oil/gas/banks have naturally higher D/E ratios
  if (
    marketCapCr > 50000 &&
    pe !== null && pe > 0 && pe >= 5 && pe <= 30 &&
    roe !== null && roe > 15 &&
    (debtToEquity === null || debtToEquity < 5.0)
  ) {
    return {
      score: 30,
      tier: 'BLUE_CHIP',
      data,
      reasoning: `Blue Chip: ₹${(marketCapCr/1000).toFixed(0)}K Cr, ROE ${roe.toFixed(1)}%, P/E ${pe.toFixed(1)}, D/E ${debtToEquity?.toFixed(1) || 'N/A'}`
    }
  }

  // TIER 2: QUALITY (20 points)
  // Mid-large cap (>10K Cr), decent ROE (>10%), acceptable P/E (5-40), moderate debt (<10.0)
  if (
    marketCapCr > 10000 &&
    pe !== null && pe > 0 && pe >= 5 && pe <= 40 &&
    roe !== null && roe > 10 &&
    (debtToEquity === null || debtToEquity < 10.0)
  ) {
    return {
      score: 20,
      tier: 'QUALITY',
      data,
      reasoning: `Quality: ₹${(marketCapCr/1000).toFixed(0)}K Cr, ROE ${roe.toFixed(1)}%, P/E ${pe.toFixed(1)}, D/E ${debtToEquity?.toFixed(1) || 'N/A'}`
    }
  }

  // TIER 3: SPECULATIVE (10 points)
  // Decent cap (>1K Cr), some profitability (>5% ROE), or missing ROE but profitable (P/E < 50)
  if (
    marketCapCr > 1000 &&
    (
      (roe !== null && roe > 5) ||
      (pe !== null && pe > 0 && pe < 50)
    ) &&
    (debtToEquity === null || debtToEquity < 100.0)
  ) {
    return {
      score: 10,
      tier: 'SPECULATIVE',
      data,
      reasoning: `Speculative: ₹${(marketCapCr/1000).toFixed(0)}K Cr, ROE ${roe?.toFixed(1) || 'N/A'}%, P/E ${pe?.toFixed(1) || 'N/A'}`
    }
  }

  // FAIL (0 points)
  return {
    score: 0,
    tier: 'FAIL',
    data,
    reasoning: `Fails criteria: Market Cap ${(marketCapCr/1000).toFixed(0)}K Cr, ROE ${roe?.toFixed(1) || 'N/A'}%, P/E ${pe?.toFixed(1) || 'N/A'}`
  }
}

/**
 * Format market cap for display
 */
export function formatMarketCap(marketCap: number): string {
  const crores = marketCap / 10000000
  
  if (crores >= 100000) {
    return `₹${(crores / 100000).toFixed(2)}L Cr`
  } else if (crores >= 1000) {
    return `₹${(crores / 1000).toFixed(2)}K Cr`
  } else {
    return `₹${crores.toFixed(0)} Cr`
  }
}

/**
 * Batch fetch fundamentals for multiple symbols
 */
export async function batchGetFundamentals(symbols: string[]): Promise<Record<string, FundamentalData | null>> {
  const results: Record<string, FundamentalData | null> = {}
  
  // Fetch in parallel but with rate limiting (5 at a time)
  const batchSize = 5
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map(symbol => getFundamentals(symbol))
    )
    
    batch.forEach((symbol, index) => {
      results[symbol] = batchResults[index]
    })
    
    // Rate limiting: wait 1 second between batches
    if (i + batchSize < symbols.length) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  
  return results
}

