import { NextRequest, NextResponse } from 'next/server';
import { type FundamentalData } from '@/lib/fundamentals-utils';
import { db } from '@/db'
import { fundamentalData as fundamentalDataTable } from '@/db/schema'

// Disable caching for this API route during development
export const dynamic = 'force-dynamic';

/**
 * GET /api/fundamentals/screener?symbol=RELIANCE
 * 
 * Fetches fundamental data from Screener.in (Indian stock data)
 * This is an alternative to Yahoo Finance that works better for Indian stocks
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = searchParams.get('symbol');
    
    if (!symbol) {
      return NextResponse.json(
        { error: 'Symbol parameter is required' },
        { status: 400 }
      );
    }
    
    console.log(`📊 Fetching from Screener.in for ${symbol}...`);
    
    // Screener.in URL format: https://www.screener.in/api/company/RELIANCE/
    const screenerUrl = `https://www.screener.in/api/company/${symbol}/`;
    
    const response = await fetch(screenerUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Screener.in returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data || !data.name) {
      throw new Error(`No data found for ${symbol}`);
    }
    
    console.log(`✅ Received data from Screener.in for ${symbol}`);
    
    // Map Screener.in data to our FundamentalData format
    const fundamentalData: FundamentalData = {
      symbol: symbol.toUpperCase(),
      companyName: data.name || symbol,
      sector: data.sector,
      industry: data.industry,
      
      // Valuation
      marketCap: data.market_cap ? data.market_cap * 10000000 : 0, // Screener stores in crores
      peRatio: data.current_pe,
      pbRatio: data.price_to_book,
      eps: data.eps,
      
      // Profitability
      roe: data.roe ? data.roe / 100 : undefined, // Convert percentage to decimal
      roa: data.roa ? data.roa / 100 : undefined,
      profitMargin: data.npm ? data.npm / 100 : undefined, // Net profit margin
      
      // Financial Health
      debtToEquity: data.debt_to_equity,
      currentRatio: data.current_ratio,
      
      // Dividends
      dividendYield: data.dividend_yield ? data.dividend_yield / 100 : undefined,
      
      // Growth
      revenueGrowth: data.sales_growth ? data.sales_growth / 100 : undefined,
      earningsGrowth: data.profit_growth ? data.profit_growth / 100 : undefined,
      
      // Market Data
      fiftyTwoWeekHigh: data.high_52_week,
      fiftyTwoWeekLow: data.low_52_week,
      
      // Book Value
      bookValue: data.book_value,
      priceToBook: data.price_to_book,
      
      lastUpdated: new Date()
    };
    
    console.log(`📊 ${symbol} fundamentals from Screener.in:`);
    console.log(`   Market Cap: ₹${(fundamentalData.marketCap / 1e9).toFixed(2)}B`);
    console.log(`   P/E Ratio: ${fundamentalData.peRatio?.toFixed(2) || 'N/A'}`);
    console.log(`   ROE: ${fundamentalData.roe ? (fundamentalData.roe * 100).toFixed(1) + '%' : 'N/A'}`);
    console.log(`   Debt/Equity: ${fundamentalData.debtToEquity?.toFixed(2) || 'N/A'}`);
    
    // Persist to DB (non-fatal)
    try {
      await db.insert(fundamentalDataTable).values({
        symbol: fundamentalData.symbol,
        exchange: 'NSE',
        marketCap: fundamentalData.marketCap ? String(fundamentalData.marketCap) : null,
        peRatio: fundamentalData.peRatio ?? null,
        pbRatio: fundamentalData.pbRatio ?? null,
        dividendYield: fundamentalData.dividendYield ?? null,
        debtToEquity: fundamentalData.debtToEquity ?? null,
        roe: fundamentalData.roe ?? null,
        sector: fundamentalData.sector ?? null,
        industry: fundamentalData.industry ?? null,
        data: data, // full Screener.in response
        score: null,
        signal: null,
        fetchedAt: new Date(),
      }).onConflictDoUpdate({
        target: [fundamentalDataTable.symbol, fundamentalDataTable.exchange],
        set: {
          marketCap: fundamentalData.marketCap ? String(fundamentalData.marketCap) : null,
          peRatio: fundamentalData.peRatio ?? null,
          pbRatio: fundamentalData.pbRatio ?? null,
          dividendYield: fundamentalData.dividendYield ?? null,
          debtToEquity: fundamentalData.debtToEquity ?? null,
          roe: fundamentalData.roe ?? null,
          sector: fundamentalData.sector ?? null,
          industry: fundamentalData.industry ?? null,
          data: data,
          fetchedAt: new Date(),
        }
      })
      console.log(`💾 Saved fundamental data to DB for ${symbol}`)
    } catch (dbError) {
      console.error(`⚠️ Failed to save fundamental data to DB for ${symbol}:`, dbError)
    }

    return NextResponse.json({
      success: true,
      data: fundamentalData,
      source: 'Screener.in',
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Error fetching from Screener.in:', error);
    
    if (error.message?.includes('404') || error.message?.includes('Not Found')) {
      return NextResponse.json(
        { 
          error: `Symbol "${searchParams.get('symbol')}" not found on Screener.in`,
          suggestion: 'Verify symbol spelling. Screener.in uses NSE symbols (e.g., RELIANCE, TCS, INFY)',
          details: error.message
        },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch from Screener.in',
        suggestion: 'Try again or check console for details',
        details: error.message
      },
      { status: 500 }
    );
  }
}

