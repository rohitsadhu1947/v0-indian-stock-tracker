import { NextRequest, NextResponse } from 'next/server';
import { getUserBrokerManager } from '@/lib/broker';
import type { InstrumentData } from '@/lib/broker';
import { scanForNewsPops, type NewsPopSignal } from '@/lib/news-pop-scanner';
import { batchCalculateMasterScores, type MasterScore } from '@/lib/master-scorer';
import { db } from '@/db';
import { analystReports, userPreferences } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth';
import { sendNewsPopAlert, type TelegramConfig } from '@/lib/telegram-alerts';
import { getMacroSnapshot } from '@/lib/macro-intelligence';

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

    // Get broker manager
    const manager = await getUserBrokerManager()
    if (!manager.hasConnection()) {
      return NextResponse.json({
        success: false,
        error: 'No broker connections available. Admin must connect a broker in settings.'
      }, { status: 401 })
    }
    const client = manager.getClient()

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

    // 3. Fetch instruments (all NSE equity)
    console.log('\n📊 Fetching NSE instruments...');
    const instruments = await client.getInstruments('NSE');
    const equityInstruments = instruments.filter((inst: InstrumentData) => inst.instrumentType === 'EQ');
    console.log(`✅ Found ${equityInstruments.length} equity instruments`);

    // 4. Get symbols to scan (custom or top 200 by volume for speed)
    let symbolsToScan: string[];

    if (customSymbols.length > 0) {
      // Custom scan: only these symbols
      symbolsToScan = customSymbols;
      console.log(`🔍 Scanning custom symbols only: ${symbolsToScan.length} stocks`);
    } else {
      // Regular scan: Top 200 stocks by average volume (for speed)
      // In production, you might want to scan Nifty 500
      const sortedByVolume = [...equityInstruments]
        .filter(inst => inst.raw?.last_price && inst.raw.last_price > 50)
        .sort((a, b) => (b.raw?.volume || 0) - (a.raw?.volume || 0))
        .slice(0, 200);

      symbolsToScan = sortedByVolume.map(inst => inst.tradingsymbol);
      console.log(`🔍 Scanning top 200 stocks by volume`);
    }

    // 5. Create instrument map
    const instrumentMap = new Map();
    for (const inst of equityInstruments) {
      if (symbolsToScan.includes(inst.tradingsymbol)) {
        instrumentMap.set(inst.tradingsymbol, inst);
      }
    }

    console.log(`✅ Mapped ${instrumentMap.size} instruments`);

    // 6. Fetch quotes for all symbols (in batches)
    console.log(`\n📊 Fetching quotes for ${instrumentMap.size} symbols...`);
    const symbols = Array.from(instrumentMap.keys());
    const batchSize = 200; // Kite allows up to 500, but we'll be conservative
    const stocksData = [];

    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const quoteSymbols = batch.map(sym => `NSE:${sym}`);

      try {
        const quotes = await client.getQuote(quoteSymbols);

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

            const candles = await client.getHistoricalData({
              instrumentToken: inst.instrumentToken,
              interval: 'day',
              from,
              to,
              symbol: symbol,
              exchange: 'NSE'
            });

            if (!candles || candles.length < 30) continue;

            // Calculate average volume (same as momentum scanner - all candles)
            const avgVolume = candles.length > 0
              ? candles.reduce((sum: number, c: any) => sum + c.volume, 0) / candles.length
              : quote.volume;

            stocksData.push({
              symbol,
              exchange: 'NSE',
              instrumentToken: inst.instrumentToken.toString(),
              current: quote.lastPrice,
              change: quote.change || 0,
              changePercent: quote.change && quote.close
                ? ((quote.change / quote.close) * 100)
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

    // 7. Run News Pop Scanner (uses direct function import, not HTTP)
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

    // 8. Fetch analyst reports for scoring
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

    // 9. Calculate master scores (includes fundamentals + intelligence + macro)
    console.log(`\n🎯 Calculating master scores for ${newsPops.length} signals...`);
    let macroSnapshot = null;
    try {
      macroSnapshot = await getMacroSnapshot();
    } catch { /* non-fatal */ }
    const masterScores = await batchCalculateMasterScores(
      newsPops,
      reportsBySymbol,
      capital,
      macroSnapshot
    );

    console.log(`✅ Calculated ${masterScores.length} master scores`);

    // 10. Combine news pop data with master scores
    const scoredNewsPops = masterScores.map(score => {
      const newsPop = newsPops.find(np => np.symbol === score.symbol);
      return {
        ...score,
        // Add fields from newsPop that aren't in masterScores
        current: newsPop?.current || 0, // Current price
        changePercent: newsPop?.changePercent || 0, // Price change %
        news: newsPop?.news || [],
        newsSentiment: newsPop?.newsSentiment || 'NEUTRAL',
        newsSentimentScore: newsPop?.newsSentimentScore || 0,
        volumeSpike: newsPop?.volumeSpike || 0,
        detectedAt: newsPop?.detectedAt || new Date()
      };
    });

    // Sort by total score (highest first)
    scoredNewsPops.sort((a, b) => b.totalScore - a.totalScore);

    // 11. Send Telegram alerts for high-urgency news pops
    console.log(`\n📱 Checking Telegram alert preferences...`);

    // Fetch user preferences for Telegram
    const preferences = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    if (preferences.length > 0 && preferences[0].telegramEnabled) {
      const telegramConfig: TelegramConfig = {
        botToken: preferences[0].telegramBotToken || '',
        chatId: preferences[0].telegramChatId || '',
        enabled: preferences[0].telegramEnabled
      };

      // Check if News Pop alerts are enabled in preferences
      const alertPrefs = preferences[0].telegramAlertPreferences as any || {};
      const newsAlertsEnabled = alertPrefs.newsPops !== false; // Default to true if not set

      if (!newsAlertsEnabled) {
        console.log(`⚠️ News Pop alerts disabled in user preferences`);
      } else {
        console.log(`✅ Telegram alerts enabled. Sending alerts for high-urgency news pops...`);

        // Send alerts for high-urgency pops
        // Alert if: (volume 3x+ and score 40+) OR (score 75+)
        const highUrgencyPops = scoredNewsPops.filter(pop => {
          const volumeSpike = pop.volumeSpike || 0;
          const hasHighVolume = volumeSpike >= 3.0 && pop.totalScore >= 40; // Volume spike with minimum quality
          const hasHighScore = pop.totalScore >= 75; // High-conviction setup
          return hasHighVolume || hasHighScore;
        });

        console.log(`🚨 Found ${highUrgencyPops.length} high-urgency news pops to alert`);

        for (const pop of highUrgencyPops) {
          try {
            // Validate required fields
            if (!pop.tradePlan || !pop.current) {
              console.error(`  ⚠️ ${pop.symbol}: Missing trade plan or current price, skipping alert`);
              continue;
            }

            // Get first news headline as snippet
            const newsSnippet = pop.news && pop.news.length > 0
              ? pop.news[0].title
              : undefined;

            // Determine urgency
            const volumeSpike = pop.volumeSpike || 0;
            const urgency: 'HIGH' | 'MEDIUM' = volumeSpike >= 3.0 || pop.totalScore >= 75 ? 'HIGH' : 'MEDIUM';

            await sendNewsPopAlert(telegramConfig, {
              symbol: pop.symbol,
              exchange: pop.exchange || 'NSE',
              totalScore: pop.totalScore,
              currentPrice: pop.current,
              entryPrice: pop.tradePlan.entry,
              stopLoss: pop.tradePlan.stopLoss,
              target1: pop.tradePlan.target1,
              target2: pop.tradePlan.target2,
              positionSize: pop.tradePlan.positionSize,
              capitalRequired: pop.tradePlan.capitalRequired,
              riskAmount: pop.tradePlan.riskAmount,
              volumeSpike: pop.volumeSpike || 0,
              changePercent: pop.changePercent || 0,
              newsSentiment: pop.newsSentiment as 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL',
              newsSnippet,
              urgency
            });

            console.log(`  ✅ Alert sent for ${pop.symbol}`);
          } catch (error: any) {
            console.error(`  ❌ Failed to send alert for ${pop.symbol}:`, error.message);
            console.error(`  📊 Debug info:`, {
              hasTradePlan: !!pop.tradePlan,
              hasCurrent: !!pop.current,
              tradePlan: pop.tradePlan,
              current: pop.current
            });
          }
        }
      }
    } else {
      console.log(`⚠️ Telegram alerts disabled or not configured`);
    }

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
