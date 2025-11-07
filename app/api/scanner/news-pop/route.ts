import { NextRequest, NextResponse } from 'next/server';
import { KiteConnect } from 'kiteconnect';
import { getKiteAccessToken, getKiteApiKey } from '@/lib/kite-token-helper';
import { scanForNewsPops, type NewsPopSignal } from '@/lib/news-pop-scanner';
import { batchCalculateMasterScores, type MasterScore } from '@/lib/master-scorer';
import { db } from '@/db';
import { analystReports } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth';

// Disable caching
export const dynamic = 'force-dynamic';

/**
 * GET /api/scanner/news-pop
 * 
 * Scans for news-driven price/volume spikes
 * 
 * Query params:
 * - capital: Available capital (default 300000)
 * - customSymbols: Comma-separated symbols to force-scan (optional)
 */
export async function GET(request: NextRequest) {
  try {
    console.log('\n🚨 === NEWS POP SCANNER API STARTED ===');
    console.log(`📅 Time: ${new Date().toISOString()}`);

    // 1. Check authentication
    const userId = await getAuthenticatedUserIdCompat();
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 });
    }

    const accessToken = await getKiteAccessToken();
    if (!accessToken) {
      return NextResponse.json({
        success: false,
        error: 'Kite access token not available. Please ensure admin user has logged in via Kite.'
      }, { status: 401 });
    }

    const apiKey = getKiteApiKey();
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'Kite API key not configured'
      }, { status: 500 });
    }

    // 2. Get query params
    const { searchParams } = new URL(request.url);
    const capital = parseInt(searchParams.get('capital') || '300000');
    const customSymbolsParam = searchParams.get('customSymbols') || '';
    
    const customSymbols = customSymbolsParam
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(s => s.length > 0);

    console.log(`💰 Capital: ₹${capital.toLocaleString()}`);
    if (customSymbols.length > 0) {
      console.log(`📝 Custom symbols: ${customSymbols.join(', ')}`);
    }

    // 3. Initialize Kite Connect
    const kc = new KiteConnect({ api_key: apiKey });
    kc.setAccessToken(accessToken);

    // 4. Fetch instruments (all NSE equity)
    console.log('\n📊 Fetching NSE instruments...');
    const instruments = await kc.getInstruments('NSE');
    const equityInstruments = instruments.filter(inst => inst.instrument_type === 'EQ');
    console.log(`✅ Found ${equityInstruments.length} equity instruments`);

    // 5. Get symbols to scan (custom or top 200 by volume for speed)
    let symbolsToScan: string[];
    
    if (customSymbols.length > 0) {
      // Custom scan: only these symbols
      symbolsToScan = customSymbols;
      console.log(`🔍 Scanning custom symbols only: ${symbolsToScan.length} stocks`);
    } else {
      // Regular scan: Top 200 stocks by average volume (for speed)
      // In production, you might want to scan Nifty 500
      const sortedByVolume = [...equityInstruments]
        .filter(inst => inst.last_price && inst.last_price > 50)
        .sort((a, b) => (b.volume || 0) - (a.volume || 0))
        .slice(0, 200);
      
      symbolsToScan = sortedByVolume.map(inst => inst.tradingsymbol);
      console.log(`🔍 Scanning top 200 stocks by volume`);
    }

    // 6. Create instrument map
    const instrumentMap = new Map();
    for (const inst of equityInstruments) {
      if (symbolsToScan.includes(inst.tradingsymbol)) {
        instrumentMap.set(inst.tradingsymbol, inst);
      }
    }

    console.log(`✅ Mapped ${instrumentMap.size} instruments`);

    // 7. Fetch quotes for all symbols (in batches)
    console.log(`\n📊 Fetching quotes for ${instrumentMap.size} symbols...`);
    const symbols = Array.from(instrumentMap.keys());
    const batchSize = 200; // Kite allows up to 500, but we'll be conservative
    const stocksData = [];

    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const quoteSymbols = batch.map(sym => `NSE:${sym}`);
      
      try {
        const quotes = await kc.getQuote(quoteSymbols);
        
        // Fetch historical data for each stock in batch
        for (const symbol of batch) {
          try {
            const inst = instrumentMap.get(symbol);
            if (!inst) continue;

            const quoteKey = `NSE:${symbol}`;
            const quote = quotes[quoteKey];
            if (!quote) continue;

            // Get 60 days of historical data
            const to = new Date();
            const from = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

            const candles = await kc.getHistoricalData(
              inst.instrument_token,
              'day',
              from,
              to
            );

            if (!candles || candles.length < 30) continue;

            // Calculate average volume (last 20 days)
            const recentCandles = candles.slice(-20);
            const avgVolume = recentCandles.reduce((sum: number, c: any) => sum + (c.volume || 0), 0) / recentCandles.length;

            stocksData.push({
              symbol,
              exchange: 'NSE',
              instrumentToken: inst.instrument_token.toString(),
              current: quote.last_price,
              change: quote.net_change || 0,
              changePercent: quote.net_change && quote.ohlc?.close 
                ? ((quote.net_change / quote.ohlc.close) * 100) 
                : 0,
              volume: quote.volume || 0,
              avgVolume,
              candles,
              sector: inst.segment || 'Unknown'
            });
          } catch (error: any) {
            console.error(`  ⚠️ ${symbol}: Failed to fetch data:`, error.message);
          }
        }
      } catch (error: any) {
        console.error(`  ❌ Batch ${Math.floor(i / batchSize) + 1} failed:`, error.message);
      }
    }

    console.log(`✅ Successfully fetched data for ${stocksData.length} stocks`);

    if (stocksData.length === 0) {
      return NextResponse.json({
        success: true,
        newsPops: [],
        message: 'No stocks with sufficient data found'
      });
    }

    // 8. Run News Pop Scanner (uses direct function import, not HTTP)
    console.log(`\n📰 Running News Pop Scanner...`);
    
    // For custom symbols, force analyze even without volume/price filters
    const forceAnalyze = customSymbols.length > 0;
    
    const newsPops = await scanForNewsPops(stocksData, capital, forceAnalyze);
    console.log(`✅ Found ${newsPops.length} news pops`);

    if (newsPops.length === 0) {
      return NextResponse.json({
        success: true,
        newsPops: [],
        message: 'No news-driven moves detected'
      });
    }

    // 9. Fetch analyst reports for scoring
    console.log(`\n📊 Fetching analyst reports...`);
    const reports = await db
      .select()
      .from(analystReports)
      .where(eq(analystReports.userId, userId))
      .orderBy(desc(analystReports.reportDate));

    const reportsBySymbol: Record<string, any> = {};
    reports.forEach(report => {
      if (report.symbol && !reportsBySymbol[report.symbol]) {
        reportsBySymbol[report.symbol] = report;
      }
    });

    console.log(`✅ Found ${Object.keys(reportsBySymbol).length} analyst reports`);

    // 10. Calculate master scores (includes fundamentals + intelligence)
    console.log(`\n🎯 Calculating master scores for ${newsPops.length} signals...`);
    const masterScores = await batchCalculateMasterScores(
      newsPops,
      reportsBySymbol,
      capital
    );

    console.log(`✅ Calculated ${masterScores.length} master scores`);

    // 11. Combine news pop data with master scores
    const scoredNewsPops = masterScores.map(score => {
      const newsPop = newsPops.find(np => np.symbol === score.symbol);
      return {
        ...score,
        news: newsPop?.news || [],
        newsSentiment: newsPop?.newsSentiment || 'NEUTRAL',
        newsSentimentScore: newsPop?.newsSentimentScore || 0,
        volumeSpike: newsPop?.volumeSpike || 0,
        detectedAt: newsPop?.detectedAt || new Date()
      };
    });

    // Sort by total score (highest first)
    scoredNewsPops.sort((a, b) => b.totalScore - a.totalScore);

    console.log(`\n✅ News Pop scan complete: ${scoredNewsPops.length} signals ready`);
    console.log(`🚨 === NEWS POP SCANNER API COMPLETE ===\n`);

    return NextResponse.json({
      success: true,
      newsPops: scoredNewsPops,
      summary: {
        total: scoredNewsPops.length,
        positive: scoredNewsPops.filter(s => s.newsSentiment === 'POSITIVE').length,
        negative: scoredNewsPops.filter(s => s.newsSentiment === 'NEGATIVE').length,
        highScore: scoredNewsPops.filter(s => s.totalScore >= 75).length
      }
    });

  } catch (error: any) {
    console.error('❌ News Pop Scanner API error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
}

