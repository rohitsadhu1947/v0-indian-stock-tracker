import { NextRequest, NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';
import { convertToYahooSymbol, type FundamentalData } from '@/lib/fundamentals-utils';

// Disable caching for this API route during development
export const dynamic = 'force-dynamic';

/**
 * GET /api/fundamentals/quote?symbol=RELIANCE&exchange=NSE
 * 
 * Fetches comprehensive fundamental data for a stock from Yahoo Finance
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = searchParams.get('symbol');
    const exchange = (searchParams.get('exchange') || 'NSE').toUpperCase() as 'NSE' | 'BSE';
    
    if (!symbol) {
      return NextResponse.json(
        { error: 'Symbol parameter is required' },
        { status: 400 }
      );
    }
    
    // Convert to Yahoo Finance format (e.g., RELIANCE -> RELIANCE.NS)
    const yahooSymbol = convertToYahooSymbol(symbol, exchange);
    
    console.log(`📊 Fetching fundamentals for ${yahooSymbol}...`);
    
    // Fetch comprehensive data from Yahoo Finance
    // Using quoteSummary with multiple modules for complete picture
    const result = await yahooFinance.quoteSummary(yahooSymbol, {
      modules: [
        'price',                  // Current price, market cap
        'summaryDetail',          // P/E, dividend yield, beta, etc.
        'financialData',          // Revenue, profit margins, debt
        'defaultKeyStatistics',   // EPS, ROE, etc.
        'earnings',               // Earnings history
        'earningsHistory'         // Quarterly earnings
      ]
    });
    
    if (!result) {
      return NextResponse.json(
        { error: `No data found for ${symbol}` },
        { status: 404 }
      );
    }
    
    console.log(`✅ Received data for ${yahooSymbol}`);
    
    // Extract and structure the data
    const price = result.price;
    const summaryDetail = result.summaryDetail;
    const financialData = result.financialData;
    const keyStats = result.defaultKeyStatistics;
    
    // Build FundamentalData object
    const fundamentalData: FundamentalData = {
      symbol: symbol.toUpperCase(),
      companyName: price?.longName || price?.shortName || symbol,
      sector: price?.sector,
      industry: price?.industry,
      
      // Valuation
      marketCap: price?.marketCap || 0,
      enterpriseValue: keyStats?.enterpriseValue,
      peRatio: summaryDetail?.trailingPE || summaryDetail?.forwardPE,
      pbRatio: keyStats?.priceToBook,
      pegRatio: keyStats?.pegRatio,
      priceToSales: keyStats?.priceToSalesTrailing12Months,
      
      // Profitability
      eps: keyStats?.trailingEps,
      roe: financialData?.returnOnEquity,
      roa: financialData?.returnOnAssets,
      profitMargin: financialData?.profitMargins,
      operatingMargin: financialData?.operatingMargins,
      
      // Financial Health
      debtToEquity: financialData?.debtToEquity,
      currentRatio: financialData?.currentRatio,
      quickRatio: financialData?.quickRatio,
      
      // Dividends
      dividendYield: summaryDetail?.dividendYield,
      payoutRatio: summaryDetail?.payoutRatio,
      dividendPerShare: summaryDetail?.dividendRate,
      
      // Growth
      revenueGrowth: financialData?.revenueGrowth,
      earningsGrowth: financialData?.earningsGrowth,
      revenuePerShare: financialData?.revenuePerShare,
      
      // Market Data
      fiftyTwoWeekHigh: summaryDetail?.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: summaryDetail?.fiftyTwoWeekLow,
      beta: summaryDetail?.beta || keyStats?.beta,
      averageVolume: summaryDetail?.averageVolume,
      
      // Analyst Ratings
      targetPrice: financialData?.targetMeanPrice,
      recommendationMean: financialData?.recommendationMean,
      numberOfAnalysts: financialData?.numberOfAnalystOpinions,
      
      // Book Value
      bookValue: keyStats?.bookValue,
      priceToBook: keyStats?.priceToBook,
      
      lastUpdated: new Date()
    };
    
    // Log some key metrics
    console.log(`📊 ${symbol} fundamentals:`);
    console.log(`   Market Cap: ₹${(fundamentalData.marketCap / 1e9).toFixed(2)}B`);
    console.log(`   P/E Ratio: ${fundamentalData.peRatio?.toFixed(2) || 'N/A'}`);
    console.log(`   ROE: ${fundamentalData.roe ? (fundamentalData.roe * 100).toFixed(1) + '%' : 'N/A'}`);
    console.log(`   Debt/Equity: ${fundamentalData.debtToEquity?.toFixed(2) || 'N/A'}`);
    
    return NextResponse.json({
      success: true,
      data: fundamentalData,
      source: 'Yahoo Finance',
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('❌ Error fetching fundamentals:', error);
    
    // Handle specific Yahoo Finance errors
    if (error.message?.includes('No data found')) {
      return NextResponse.json(
        { 
          error: `Symbol not found on Yahoo Finance. Try different exchange (NSE/BSE)`,
          details: error.message 
        },
        { status: 404 }
      );
    }
    
    if (error.message?.includes('Too Many Requests')) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again in a moment.' },
        { status: 429 }
      );
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch fundamental data',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

