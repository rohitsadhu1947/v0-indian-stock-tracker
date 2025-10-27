import { NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';

/**
 * Simple test endpoint to verify Yahoo Finance API is working
 * GET /api/fundamentals/test
 */
export async function GET() {
  try {
    console.log('🧪 Testing Yahoo Finance API connection...');
    
    // Test with a known good US stock first
    console.log('📊 Testing with AAPL (Apple)...');
    const appleQuote = await yahooFinance.quote('AAPL');
    console.log('✅ Apple quote:', appleQuote.symbol, appleQuote.regularMarketPrice);
    
    // Test with Indian stock
    console.log('📊 Testing with RELIANCE.NS...');
    const relianceQuote = await yahooFinance.quote('RELIANCE.NS');
    console.log('✅ Reliance quote:', relianceQuote.symbol, relianceQuote.regularMarketPrice);
    
    // Test with TCS
    console.log('📊 Testing with TCS.NS...');
    const tcsQuote = await yahooFinance.quote('TCS.NS');
    console.log('✅ TCS quote:', tcsQuote.symbol, tcsQuote.regularMarketPrice);
    
    return NextResponse.json({
      success: true,
      message: 'Yahoo Finance API is working!',
      tests: {
        apple: {
          symbol: appleQuote.symbol,
          price: appleQuote.regularMarketPrice,
          marketCap: appleQuote.marketCap
        },
        reliance: {
          symbol: relianceQuote.symbol,
          price: relianceQuote.regularMarketPrice,
          marketCap: relianceQuote.marketCap
        },
        tcs: {
          symbol: tcsQuote.symbol,
          price: tcsQuote.regularMarketPrice,
          marketCap: tcsQuote.marketCap
        }
      }
    });
    
  } catch (error: any) {
    console.error('❌ Yahoo Finance test failed:', error);
    console.error('   Error type:', error.name);
    console.error('   Error message:', error.message);
    console.error('   Error stack:', error.stack);
    
    return NextResponse.json({
      success: false,
      error: error.message,
      errorType: error.name,
      suggestion: 'Yahoo Finance API may be blocked or unavailable. Check if you can access finance.yahoo.com in your browser.'
    }, { status: 500 });
  }
}

