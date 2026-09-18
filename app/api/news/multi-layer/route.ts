import { NextRequest, NextResponse } from 'next/server';
import Parser from 'rss-parser';
import { analyzeSentiment, calculateAggregateSentiment, getSentimentTradingSignal, getDayTradingSignal, type AggregateSentiment, type DayTradingSignal } from '@/lib/sentiment-utils';
import { getSectorInfo, buildSectorNewsQuery, buildMacroNewsQuery, MACRO_NEWS_KEYWORDS } from '@/lib/sector-mapping';
import { analyzeNewsSentiment, type GeminiSentimentResult } from '@/lib/gemini-sentiment';
import { detectGeopoliticalEvents, getGeopoliticalImpactForStock, type GeopoliticalSnapshot } from '@/lib/geopolitical-monitor';
import type { NewsItem } from '../quote/route';
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth';

export const dynamic = 'force-dynamic';

const parser = new Parser({
  customFields: {
    item: ['description', 'content', 'content:encoded']
  }
});

export interface MultiLayerNews {
  stockNews: {
    news: NewsItem[];
    sentiment: any;
  };
  sectorNews: {
    news: NewsItem[];
    sentiment: any;
    sector: string;
    industry: string;
  } | null;
  macroNews: {
    news: NewsItem[];
    sentiment: any;
    affectedFactors: string[];
  } | null;
  geminiSentiment?: GeminiSentimentResult;
  geopolitical?: GeopoliticalSnapshot;
  combinedSentiment: {
    overall: string;
    score: number;
    layers: {
      stock: number;
      sector: number;
      macro: number;
    };
    tradingSignal: any;
    reasoning: string;
  };
}

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserIdCompat()
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const exchange = searchParams.get('exchange');

  if (!symbol) {
    return NextResponse.json({ success: false, error: 'Symbol is required' }, { status: 400 });
  }

  try {
    console.log(`\n🎯 === MULTI-LAYER NEWS ANALYSIS ===`);
    console.log(`📥 Symbol: ${symbol}, Exchange: ${exchange}`);

    const sectorInfo = getSectorInfo(symbol.toUpperCase());
    console.log(`🏢 Sector: ${sectorInfo?.sector || 'Unknown'}, Industry: ${sectorInfo?.industry || 'Unknown'}`);

    // Layer 1: Stock-specific news
    console.log(`\n📰 LAYER 1: Fetching ${symbol}-specific news...`);
    const stockNews = await fetchStockNews(symbol, exchange || 'NSE');

    // Layer 2: Sector/Industry news
    let sectorNews = null;
    if (sectorInfo) {
      console.log(`\n🏢 LAYER 2: Fetching ${sectorInfo.sector}/${sectorInfo.industry} sector news...`);
      sectorNews = await fetchSectorNews(sectorInfo);
    }

    // Layer 3: Macro news
    let macroNews = null;
    if (sectorInfo) {
      console.log(`\n🌍 LAYER 3: Fetching macro/economic news for ${sectorInfo.macroFactors.join(', ')}...`);
      macroNews = await fetchMacroNews(sectorInfo);
    }

    // Layer 4: Gemini AI sentiment (contextual, understands nuance)
    console.log(`\n🤖 LAYER 4: Running Gemini AI sentiment analysis...`);
    let geminiSentiment: GeminiSentimentResult | undefined;
    try {
      const allHeadlines = [
        ...stockNews.news.map(n => n.title),
        ...(sectorNews?.news || []).map(n => n.title).slice(0, 5),
        ...(macroNews?.news || []).map(n => n.title).slice(0, 3),
      ];

      if (allHeadlines.length > 0) {
        geminiSentiment = await analyzeNewsSentiment(allHeadlines, {
          symbol: symbol.toUpperCase(),
          sector: sectorInfo?.sector,
          industry: sectorInfo?.industry,
        });
        console.log(`   ✅ Gemini: ${geminiSentiment.category} (score: ${geminiSentiment.sentiment}, confidence: ${geminiSentiment.confidence}%, source: ${geminiSentiment.source})`);
      }
    } catch (error: any) {
      console.log(`   ⚠️ Gemini sentiment failed: ${error.message}`);
    }

    // Layer 5: Geopolitical event detection
    console.log(`\n🌍 LAYER 5: Scanning for geopolitical events...`);
    let geopolitical: GeopoliticalSnapshot | undefined;
    try {
      const macroHeadlines = [
        ...(macroNews?.news || []).map(n => n.title),
        ...(sectorNews?.news || []).map(n => n.title).slice(0, 5),
      ];

      if (macroHeadlines.length > 0) {
        geopolitical = await detectGeopoliticalEvents(macroHeadlines);
        if (geopolitical.events.length > 0) {
          console.log(`   ✅ Detected ${geopolitical.events.length} geopolitical events (risk: ${geopolitical.overallRisk})`);
          const stockImpact = getGeopoliticalImpactForStock(symbol.toUpperCase(), geopolitical);
          if (stockImpact.relevantEvents.length > 0) {
            console.log(`   ⚠️ ${stockImpact.relevantEvents.length} events impact ${symbol} (score: ${stockImpact.impactScore})`);
          }
        } else {
          console.log(`   ✅ No geopolitical events detected`);
        }
      }
    } catch (error: any) {
      console.log(`   ⚠️ Geopolitical detection failed: ${error.message}`);
    }

    // Calculate combined sentiment (enhanced with Gemini + geopolitical)
    const combinedSentiment = calculateCombinedSentiment(stockNews, sectorNews, macroNews, sectorInfo, geminiSentiment, geopolitical ? getGeopoliticalImpactForStock(symbol.toUpperCase(), geopolitical) : undefined);

    // Calculate day trading signal (more aggressive for intraday)
    const dayTradingSignal = getDayTradingSignal(
      stockNews.sentiment.aggregate,
      sectorNews?.sentiment.aggregate || null,
      macroNews?.sentiment.aggregate || null,
      combinedSentiment.score
    );

    console.log(`\n✅ MULTI-LAYER ANALYSIS COMPLETE`);
    console.log(`   Stock Sentiment: ${stockNews.sentiment.aggregate.overall}`);
    if (sectorNews) console.log(`   Sector Sentiment: ${sectorNews.sentiment.aggregate.overall}`);
    if (macroNews) console.log(`   Macro Sentiment: ${macroNews.sentiment.aggregate.overall}`);
    if (geminiSentiment) console.log(`   🤖 Gemini: ${geminiSentiment.category} (${geminiSentiment.source})`);
    if (geopolitical?.events.length) console.log(`   🌍 Geopolitical: ${geopolitical.events.length} events (${geopolitical.overallRisk} risk)`);
    console.log(`   ⚡ COMBINED: ${combinedSentiment.overall} (${combinedSentiment.tradingSignal.signal})`);
    console.log(`   📊 DAY TRADING: ${dayTradingSignal.signal} (${dayTradingSignal.confidence}% confidence, ${dayTradingSignal.timeframe})`);

    return NextResponse.json({
      success: true,
      symbol,
      exchange,
      stockNews,
      sectorNews,
      macroNews,
      geminiSentiment: geminiSentiment || null,
      geopolitical: geopolitical || null,
      combinedSentiment,
      dayTradingSignal
    });

  } catch (error: any) {
    console.error('❌ Error in multi-layer news API:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch multi-layer news', message: error.message },
      { status: 500 }
    );
  }
}

/**
 * Fetch stock-specific news
 */
async function fetchStockNews(symbol: string, exchange: string) {
  const allNews: NewsItem[] = [];

  // Yahoo Finance
  try {
    const yahooSymbol = exchange === 'NSE' ? `${symbol}.NS` : exchange === 'BSE' ? `${symbol}.BO` : symbol;
    const yahooUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${yahooSymbol}&region=IN&lang=en-IN`;
    const feed = await parser.parseURL(yahooUrl);
    
    feed.items.slice(0, 5).forEach(item => {
      const title = item.title || 'No title';
      const snippet = extractSnippet(item.contentSnippet || item.content || item.description || '');
      const textForAnalysis = `${title} ${snippet}`;
      
      allNews.push({
        title,
        link: item.link || '',
        pubDate: item.pubDate || new Date().toISOString(),
        source: 'Yahoo Finance',
        snippet,
        timestamp: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
        sentiment: analyzeSentiment(textForAnalysis)
      });
    });
  } catch (error) {
    console.log('⚠️ Yahoo Finance stock news fetch failed');
  }

  // Google News
  try {
    const googleUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(symbol + ' stock India')}&hl=en-IN&gl=IN&ceid=IN:en`;
    const feed = await parser.parseURL(googleUrl);
    
    feed.items.slice(0, 10).forEach(item => {
      const title = item.title || 'No title';
      const snippet = extractSnippet(item.contentSnippet || item.content || item.description || '');
      const textForAnalysis = `${title} ${snippet}`;
      
      allNews.push({
        title,
        link: item.link || '',
        pubDate: item.pubDate || new Date().toISOString(),
        source: 'Google News',
        snippet,
        timestamp: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
        sentiment: analyzeSentiment(textForAnalysis)
      });
    });
  } catch (error) {
    console.log('⚠️ Google stock news fetch failed');
  }

  const uniqueNews = removeDuplicates(allNews);
  const sentiments = uniqueNews.map(item => item.sentiment);
  const aggregate = calculateAggregateSentiment(sentiments);
  const trading = getSentimentTradingSignal(aggregate);

  console.log(`   ✅ Stock: ${uniqueNews.length} articles, ${aggregate.overall} sentiment`);

  return { news: uniqueNews, sentiment: { aggregate, trading } };
}

/**
 * Fetch sector/industry news
 */
async function fetchSectorNews(sectorInfo: any) {
  const allNews: NewsItem[] = [];
  
  // Build sector-specific search query
  const sectorQuery = buildSectorNewsQuery(sectorInfo);
  const searchTerms = [
    `${sectorInfo.sector} sector India`,
    `${sectorInfo.industry} India`,
    sectorQuery
  ];

  for (const searchTerm of searchTerms.slice(0, 2)) {
    try {
      const googleUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(searchTerm)}&hl=en-IN&gl=IN&ceid=IN:en`;
      const feed = await parser.parseURL(googleUrl);
      
      feed.items.slice(0, 10).forEach(item => {
        const title = item.title || 'No title';
        const snippet = extractSnippet(item.contentSnippet || item.content || item.description || '');
        const textForAnalysis = `${title} ${snippet}`;
        
        allNews.push({
          title,
          link: item.link || '',
          pubDate: item.pubDate || new Date().toISOString(),
          source: 'Google News (Sector)',
          snippet,
          timestamp: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
          sentiment: analyzeSentiment(textForAnalysis)
        });
      });
    } catch (error) {
      // Continue if one source fails
    }
  }

  const uniqueNews = removeDuplicates(allNews).slice(0, 15);
  const sentiments = uniqueNews.map(item => item.sentiment);
  const aggregate = calculateAggregateSentiment(sentiments);
  const trading = getSentimentTradingSignal(aggregate);

  console.log(`   ✅ Sector (${sectorInfo.sector}): ${uniqueNews.length} articles, ${aggregate.overall} sentiment`);

  return {
    news: uniqueNews,
    sentiment: { aggregate, trading },
    sector: sectorInfo.sector,
    industry: sectorInfo.industry
  };
}

/**
 * Fetch macro/economic news
 */
async function fetchMacroNews(sectorInfo: any) {
  const allNews: NewsItem[] = [];
  
  // Fetch news for macro factors affecting this stock
  const macroFactors = sectorInfo.macroFactors.slice(0, 3); // Top 3 factors
  
  for (const factor of macroFactors) {
    try {
      const googleUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(factor + ' India')}&hl=en-IN&gl=IN&ceid=IN:en`;
      const feed = await parser.parseURL(googleUrl);
      
      feed.items.slice(0, 5).forEach(item => {
        const title = item.title || 'No title';
        const snippet = extractSnippet(item.contentSnippet || item.content || item.description || '');
        const textForAnalysis = `${title} ${snippet}`;
        
        allNews.push({
          title,
          link: item.link || '',
          pubDate: item.pubDate || new Date().toISOString(),
          source: `Macro (${factor})`,
          snippet,
          timestamp: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
          sentiment: analyzeSentiment(textForAnalysis)
        });
      });
    } catch (error) {
      // Continue if one source fails
    }
  }

  const uniqueNews = removeDuplicates(allNews).slice(0, 15);
  const sentiments = uniqueNews.map(item => item.sentiment);
  const aggregate = calculateAggregateSentiment(sentiments);
  const trading = getSentimentTradingSignal(aggregate);

  console.log(`   ✅ Macro: ${uniqueNews.length} articles, ${aggregate.overall} sentiment`);

  return {
    news: uniqueNews,
    sentiment: { aggregate, trading },
    affectedFactors: macroFactors
  };
}

/**
 * Calculate combined sentiment across all layers
 * Now enhanced with Gemini AI sentiment and geopolitical impact
 */
function calculateCombinedSentiment(
  stockNews: any,
  sectorNews: any,
  macroNews: any,
  sectorInfo: any,
  geminiSentiment?: GeminiSentimentResult,
  geopoliticalImpact?: { impactScore: number; relevantEvents: any[]; warnings: string[] }
) {
  // Weights for different layers (adjusted when Gemini available)
  const hasGemini = geminiSentiment && geminiSentiment.source === 'gemini'
  const WEIGHTS = hasGemini
    ? { stock: 0.25, sector: 0.15, macro: 0.15, gemini: 0.35, geopolitical: 0.10 }
    : { stock: 0.45, sector: 0.25, macro: 0.20, gemini: 0, geopolitical: 0.10 }

  // Extract scores
  const stockScore = stockNews.sentiment.aggregate.score || 0;
  const sectorScore = sectorNews?.sentiment.aggregate.score || 0;
  const macroScore = macroNews?.sentiment.aggregate.score || 0;

  // Gemini score normalized to same scale as bag-of-words (-5 to +5 ish)
  const geminiScore = geminiSentiment
    ? (geminiSentiment.sentiment / 100) * 3  // Map -100..+100 to -3..+3
    : 0;

  // Geopolitical impact normalized
  const geoScore = geopoliticalImpact
    ? (geopoliticalImpact.impactScore / 100) * 2  // Map -100..+100 to -2..+2
    : 0;

  // Calculate weighted score
  const combinedScore = (
    stockScore * WEIGHTS.stock +
    sectorScore * WEIGHTS.sector +
    macroScore * WEIGHTS.macro +
    geminiScore * WEIGHTS.gemini +
    geoScore * WEIGHTS.geopolitical
  );

  // Determine overall sentiment
  let overall: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  if (combinedScore > 0.5) {
    overall = 'POSITIVE';
  } else if (combinedScore < -0.5) {
    overall = 'NEGATIVE';
  } else {
    overall = 'NEUTRAL';
  }

  // Generate reasoning
  let reasoning = '';
  const stockSentiment = stockNews.sentiment.aggregate.overall;
  const sectorSentiment = sectorNews?.sentiment.aggregate.overall || 'NEUTRAL';
  const macroSentiment = macroNews?.sentiment.aggregate.overall || 'NEUTRAL';

  if (stockSentiment === 'POSITIVE' && sectorSentiment === 'POSITIVE') {
    reasoning = 'Strong positive sentiment across stock and sector news. Favorable market conditions.';
  } else if (stockSentiment === 'NEUTRAL' && sectorSentiment === 'POSITIVE') {
    reasoning = 'Sector tailwinds present strong opportunity despite neutral stock-specific news.';
  } else if (stockSentiment === 'POSITIVE' && sectorSentiment === 'NEGATIVE') {
    reasoning = 'Stock-specific strength but facing sector headwinds. Trade with caution.';
  } else if (stockSentiment === 'NEGATIVE' && sectorSentiment === 'POSITIVE') {
    reasoning = 'Stock underperforming despite positive sector sentiment. May indicate company-specific issues.';
  } else if (stockSentiment === 'NEGATIVE' && sectorSentiment === 'NEGATIVE') {
    reasoning = 'Negative sentiment across both stock and sector. High risk environment.';
  } else {
    reasoning = 'Mixed signals across different layers. Monitor developments closely.';
  }

  // Add macro context if significant
  if (macroSentiment === 'POSITIVE' && sectorInfo) {
    reasoning += ` Macro factors (${sectorInfo.macroFactors[0]}) are favorable.`;
  } else if (macroSentiment === 'NEGATIVE' && sectorInfo) {
    reasoning += ` Macro headwinds from ${sectorInfo.macroFactors[0]}.`;
  }

  // Add Gemini AI insights
  if (geminiSentiment && geminiSentiment.source === 'gemini') {
    const geminiLabel = geminiSentiment.category.replace('_', ' ').toLowerCase()
    if (geminiSentiment.keyFactors.length > 0) {
      reasoning += ` AI analysis: ${geminiLabel} — ${geminiSentiment.keyFactors[0]}.`
    }
    if (geminiSentiment.risks.length > 0) {
      reasoning += ` Key risk: ${geminiSentiment.risks[0]}.`
    }
  }

  // Add geopolitical context
  if (geopoliticalImpact && geopoliticalImpact.relevantEvents.length > 0) {
    const topEvent = geopoliticalImpact.relevantEvents[0]
    reasoning += ` ⚠️ Geopolitical: ${topEvent.title} (${topEvent.severity} severity).`
  }

  // Generate trading signal based on combined analysis
  const positiveCount = (stockNews.sentiment.aggregate.positive || 0) + (sectorNews?.sentiment.aggregate.positive || 0)
  const negativeCount = (stockNews.sentiment.aggregate.negative || 0) + (sectorNews?.sentiment.aggregate.negative || 0)
  const directionalCount = positiveCount + negativeCount

  const aggregate = {
    overall,
    score: combinedScore,
    balance: directionalCount > 0 ? (positiveCount - negativeCount) / directionalCount : 0,
    positive: (stockNews.sentiment.aggregate.positive || 0) + (sectorNews?.sentiment.aggregate.positive || 0),
    negative: (stockNews.sentiment.aggregate.negative || 0) + (sectorNews?.sentiment.aggregate.negative || 0),
    neutral: (stockNews.sentiment.aggregate.neutral || 0) + (sectorNews?.sentiment.aggregate.neutral || 0),
    total: (stockNews.sentiment.aggregate.total || 0) + (sectorNews?.sentiment.aggregate.total || 0),
    emoji: overall === 'POSITIVE' ? '🚀' : overall === 'NEGATIVE' ? '💥' : '😐',
    color: overall === 'POSITIVE' ? '#00ff64' : overall === 'NEGATIVE' ? '#ff0064' : '#888888',
    description: reasoning
  };

  const tradingSignal = getSentimentTradingSignal(aggregate);

  return {
    overall,
    score: combinedScore,
    layers: {
      stock: stockScore,
      sector: sectorScore,
      macro: macroScore
    },
    tradingSignal,
    reasoning
  };
}

function extractSnippet(content: string, maxLength: number = 150): string {
  let text = content.replace(/<[^>]*>/g, '');
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  text = text.trim();
  if (text.length > maxLength) {
    text = text.substring(0, maxLength) + '...';
  }
  return text;
}

function removeDuplicates(news: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  return news.filter(item => {
    const normalized = item.title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 50);
    if (seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

