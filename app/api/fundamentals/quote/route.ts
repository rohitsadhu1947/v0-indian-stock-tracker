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
    let result;
    try {
      result = await yahooFinance.quoteSummary(yahooSymbol, {
        modules: [
          'price',                  // Current price, market cap
          'summaryDetail',          // P/E, dividend yield, beta, etc.
          'financialData',          // Revenue, profit margins, debt
          'defaultKeyStatistics'    // EPS, ROE, etc.
        ]
      });
    } catch (yahooError: any) {
      console.error(`❌ Yahoo Finance API error for ${yahooSymbol}:`, yahooError.message);
      
      // Try alternate approach with just quote
      console.log(`📊 Trying alternate approach for ${yahooSymbol}...`);
      try {
        const quote = await yahooFinance.quote(yahooSymbol);
        
        if (!quote) {
          throw new Error(`No data found for ${yahooSymbol}`);
        }
        
        // Return simplified data from quote
        const fundamentalData: FundamentalData = {
          symbol: symbol.toUpperCase(),
          companyName: quote.longName || quote.shortName || symbol,
          sector: quote.sector,
          industry: quote.industry,
          
          marketCap: quote.marketCap || 0,
          peRatio: quote.trailingPE || quote.forwardPE,
          pbRatio: quote.priceToBook,
          eps: quote.epsTrailingTwelveMonths,
          
          dividendYield: quote.dividendYield,
          
          fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
          fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
          beta: quote.beta,
          averageVolume: quote.averageVolume,
          
          bookValue: quote.bookValue,
          priceToBook: quote.priceToBook,
          
          lastUpdated: new Date()
        };
        
        console.log(`✅ Retrieved basic data for ${yahooSymbol} using quote()`);
        
        return NextResponse.json({
          success: true,
          data: fundamentalData,
          source: 'Yahoo Finance (Quote)',
          timestamp: new Date().toISOString(),
          note: 'Limited data available - using basic quote API'
        });
        
      } catch (quoteError: any) {
        console.error(`❌ Quote API also failed:`, quoteError.message);
        throw new Error(`Could not fetch data for ${symbol}. ${quoteError.message}`);
      }
    }
    
    if (!result) {
      return NextResponse.json(
        { error: `No data found for ${symbol}` },
        { status: 404 }
      );
    }
    
    console.log(`✅ Received comprehensive data for ${yahooSymbol}`);
    
    // Extract and structure the data
    const price = result.price;
    const summaryDetail = result.summaryDetail;
    const financialData = result.financialData;
    const keyStats = result.defaultKeyStatistics;
    
    console.log(`📊 Data modules received:`, {
      hasPrice: !!price,
      hasSummaryDetail: !!summaryDetail,
      hasFinancialData: !!financialData,
      hasKeyStats: !!keyStats
    });
    
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
    console.error('   Error stack:', error.stack);
    
    // Handle specific Yahoo Finance errors
    if (error.message?.includes('No data found') || error.message?.includes('Not Found')) {
      return NextResponse.json(
        { 
          error: `Symbol "${symbol}" not found on Yahoo Finance`,
          suggestion: 'Try different exchange (NSE/BSE) or verify symbol spelling',
          details: error.message,
          yahooSymbol: convertToYahooSymbol(symbol, exchange)
        },
        { status: 404 }
      );
    }
    
    if (error.message?.includes('Too Many Requests') || error.message?.includes('429')) {
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded',
          suggestion: 'Please wait a minute and try again',
          details: error.message 
        },
        { status: 429 }
      );
    }
    
    if (error.message?.includes('ECONNREFUSED') || error.message?.includes('network')) {
      return NextResponse.json(
        { 
          error: 'Network error connecting to Yahoo Finance',
          suggestion: 'Check your internet connection',
          details: error.message 
        },
        { status: 503 }
      );
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch fundamental data',
        suggestion: 'Try again or check console for details',
        details: error.message,
        errorType: error.name || 'Unknown'
      },
      { status: 500 }
    );
  }
}

