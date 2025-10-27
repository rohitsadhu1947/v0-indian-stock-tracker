// Pattern Analysis Library for Intraday Trading Intelligence

export interface DailyCandle {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IntradayPattern {
  gapFillRate: number; // % of times gap fills
  volatilityConsistency: number; // How consistent is daily range
  momentumFollowThrough: number; // How often momentum continues
  averageDayRange: number; // Average % move per day
  successRate: number; // % of days with >2% move
  bestEntry: 'GAP_UP' | 'GAP_DOWN' | 'BREAKOUT' | 'REVERSAL';
  confidence: number; // 0-100
}

export interface StockIntelligence {
  symbol: string;
  recommendation: 'STRONG_BUY' | 'BUY' | 'WATCH' | 'SKIP';
  confidence: number;
  pattern: IntradayPattern;
  reasons: string[];
  historicalScore: number; // Based on past performance
  keyLevels: {
    support: number[];
    resistance: number[];
  };
  expectedMove: {
    direction: 'UP' | 'DOWN' | 'NEUTRAL';
    target: number;
    stopLoss: number;
  };
}

export interface MarketCloseAnalysis {
  analysisDate: Date;
  topPicks: StockIntelligence[];
  sectorStrength: Record<string, number>;
  marketSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  tomorrowTheme: string;
  keyLevels: {
    nifty: { support: number; resistance: number };
  };
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

// Analyze historical patterns for a stock
export function analyzeHistoricalPatterns(
  symbol: string,
  dailyCandles: DailyCandle[]
): IntradayPattern {
  // More lenient: work with 2+ days (was 5)
  if (dailyCandles.length < 2) {
    return {
      gapFillRate: 0,
      volatilityConsistency: 0,
      momentumFollowThrough: 0,
      averageDayRange: 0,
      successRate: 0,
      bestEntry: 'BREAKOUT',
      confidence: 0
    };
  }

  // Calculate gap fill rate
  let gapFills = 0;
  let totalGaps = 0;
  
  for (let i = 1; i < dailyCandles.length; i++) {
    const prevClose = dailyCandles[i - 1].close;
    const open = dailyCandles[i].open;
    const high = dailyCandles[i].high;
    const low = dailyCandles[i].low;
    
    // Gap up
    if (open > prevClose) {
      totalGaps++;
      if (low <= prevClose) gapFills++; // Gap filled
    }
    
    // Gap down
    if (open < prevClose) {
      totalGaps++;
      if (high >= prevClose) gapFills++; // Gap filled
    }
  }
  
  const gapFillRate = totalGaps > 0 ? (gapFills / totalGaps) * 100 : 0;

  // Calculate volatility consistency
  const dayRanges = dailyCandles.map(c => ((c.high - c.low) / c.open) * 100);
  const avgRange = dayRanges.reduce((a, b) => a + b, 0) / dayRanges.length;
  const rangeStdDev = Math.sqrt(
    dayRanges.reduce((sum, r) => sum + Math.pow(r - avgRange, 2), 0) / dayRanges.length
  );
  const volatilityConsistency = Math.max(0, 100 - (rangeStdDev * 10)); // Lower std dev = higher consistency

  // Calculate momentum follow-through
  let momentumDays = 0;
  let totalMomentumDays = 0;
  
  for (let i = 1; i < dailyCandles.length; i++) {
    const prevChange = ((dailyCandles[i - 1].close - dailyCandles[i - 1].open) / dailyCandles[i - 1].open) * 100;
    const currChange = ((dailyCandles[i].close - dailyCandles[i].open) / dailyCandles[i].open) * 100;
    
    if (Math.abs(prevChange) > 0.5) { // Significant previous day move
      totalMomentumDays++;
      if ((prevChange > 0 && currChange > 0) || (prevChange < 0 && currChange < 0)) {
        momentumDays++; // Momentum continued
      }
    }
  }
  
  const momentumFollowThrough = totalMomentumDays > 0 ? (momentumDays / totalMomentumDays) * 100 : 50;

  // Calculate success rate (days with >2% move)
  const significantMoveDays = dailyCandles.filter(c => {
    const range = ((c.high - c.low) / c.open) * 100;
    return range > 2;
  }).length;
  
  const successRate = (significantMoveDays / dailyCandles.length) * 100;

  // Determine best entry strategy
  let bestEntry: 'GAP_UP' | 'GAP_DOWN' | 'BREAKOUT' | 'REVERSAL' = 'BREAKOUT';
  
  if (gapFillRate > 70) {
    bestEntry = 'REVERSAL'; // Gaps tend to fill, trade reversals
  } else if (momentumFollowThrough > 65) {
    bestEntry = dailyCandles[dailyCandles.length - 1].close > dailyCandles[dailyCandles.length - 2].close 
      ? 'GAP_UP' 
      : 'GAP_DOWN';
  } else if (volatilityConsistency > 70) {
    bestEntry = 'BREAKOUT'; // Consistent volatility, trade breakouts
  }

  // Calculate overall confidence
  const confidence = Math.round(
    (successRate * 0.4) + 
    (volatilityConsistency * 0.3) + 
    (momentumFollowThrough * 0.2) + 
    (Math.min(avgRange * 10, 100) * 0.1)
  );

  return {
    gapFillRate,
    volatilityConsistency,
    momentumFollowThrough,
    averageDayRange: avgRange,
    successRate,
    bestEntry,
    confidence
  };
}

// Generate stock intelligence recommendation
export function generateStockIntelligence(
  symbol: string,
  pattern: IntradayPattern,
  currentPrice: number,
  dailyCandles: DailyCandle[]
): StockIntelligence {
  const reasons: string[] = [];
  let recommendation: 'STRONG_BUY' | 'BUY' | 'WATCH' | 'SKIP' = 'WATCH';
  let historicalScore = 0;

  // Analyze success rate (MORE REALISTIC THRESHOLDS)
  if (pattern.successRate >= 60) {
    reasons.push(`🔥 High Success Rate: ${pattern.successRate.toFixed(0)}% days move >2%`);
    historicalScore += 35;
  } else if (pattern.successRate >= 45) {
    reasons.push(`✅ Good Success Rate: ${pattern.successRate.toFixed(0)}% days move >2%`);
    historicalScore += 25;
  } else if (pattern.successRate >= 30) {
    reasons.push(`📊 Moderate Success: ${pattern.successRate.toFixed(0)}% days move >2%`);
    historicalScore += 15;
  } else {
    reasons.push(`⚠️ Low Success Rate: ${pattern.successRate.toFixed(0)}% days move >2%`);
    historicalScore += 5; // Still give some points
  }

  // Analyze volatility consistency (MORE LENIENT)
  if (pattern.volatilityConsistency >= 60) {
    reasons.push(`📊 Consistent Volatility (${pattern.volatilityConsistency.toFixed(0)}%) - Predictable`);
    historicalScore += 20;
  } else if (pattern.volatilityConsistency >= 40) {
    reasons.push(`📊 Moderate Volatility (${pattern.volatilityConsistency.toFixed(0)}%)`);
    historicalScore += 10;
  } else {
    reasons.push(`⚠️ Erratic Volatility (${pattern.volatilityConsistency.toFixed(0)}%)`);
    // Don't subtract points, just don't add
  }

  // Analyze momentum follow-through (LOWER THRESHOLDS)
  if (pattern.momentumFollowThrough >= 60) {
    reasons.push(`🚀 Strong Momentum Follow-through (${pattern.momentumFollowThrough.toFixed(0)}%)`);
    historicalScore += 25;
  } else if (pattern.momentumFollowThrough >= 45) {
    reasons.push(`📈 Good Momentum (${pattern.momentumFollowThrough.toFixed(0)}%)`);
    historicalScore += 15;
  } else {
    reasons.push(`📊 Momentum: ${pattern.momentumFollowThrough.toFixed(0)}%`);
    historicalScore += 5; // Base points
  }

  // Analyze average day range (REALISTIC FOR INDIAN MARKETS)
  if (pattern.averageDayRange >= 2.5) {
    reasons.push(`💰 High Avg Range: ${pattern.averageDayRange.toFixed(2)}% per day`);
    historicalScore += 20;
  } else if (pattern.averageDayRange >= 1.2) {
    reasons.push(`📊 Good Range: ${pattern.averageDayRange.toFixed(2)}% per day`);
    historicalScore += 12;
  } else if (pattern.averageDayRange >= 0.7) {
    reasons.push(`📊 Moderate Range: ${pattern.averageDayRange.toFixed(2)}% per day`);
    historicalScore += 6;
  } else {
    reasons.push(`⏳ Low Range: ${pattern.averageDayRange.toFixed(2)}% per day`);
    // Don't subtract, stocks can still be good
  }

  // Best entry strategy
  reasons.push(`🎯 Best Entry: ${pattern.bestEntry.replace('_', ' ')}`);

  // Determine recommendation (ADJUSTED FOR LIMITED HISTORICAL DATA)
  // With 19 days of data, scores will be lower - adjust thresholds accordingly
  if (historicalScore >= 55 && pattern.successRate >= 40) {
    recommendation = 'STRONG_BUY';
    reasons.unshift('🚨 STRONG INTRADAY CANDIDATE - High confidence based on patterns');
  } else if (historicalScore >= 35) {
    recommendation = 'BUY';
    reasons.unshift('✅ GOOD INTRADAY CANDIDATE - Solid historical performance');
  } else if (historicalScore >= 15) {
    recommendation = 'WATCH';
    reasons.unshift('👀 WATCH - Moderate potential, needs confirmation');
  } else {
    recommendation = 'SKIP';
    reasons.unshift('⏭️ SKIP - Low activity for intraday');
  }

  // Calculate key levels
  const recentCandles = dailyCandles.slice(-10);
  const highs = recentCandles.map(c => c.high).sort((a, b) => b - a);
  const lows = recentCandles.map(c => c.low).sort((a, b) => a - b);
  
  const resistance = [highs[0], highs[1]].filter((v, i, a) => a.indexOf(v) === i);
  const support = [lows[0], lows[1]].filter((v, i, a) => a.indexOf(v) === i);

  // Expected move
  const avgMove = pattern.averageDayRange;
  const direction: 'UP' | 'DOWN' | 'NEUTRAL' = 
    pattern.momentumFollowThrough > 60 && dailyCandles[dailyCandles.length - 1].close > dailyCandles[dailyCandles.length - 2].close 
      ? 'UP' 
      : pattern.momentumFollowThrough > 60 
      ? 'DOWN' 
      : 'NEUTRAL';
  
  const target = direction === 'UP' 
    ? currentPrice * (1 + (avgMove / 100) * 0.7)
    : direction === 'DOWN'
    ? currentPrice * (1 - (avgMove / 100) * 0.7)
    : currentPrice;
  
  const stopLoss = direction === 'UP'
    ? currentPrice * 0.985
    : direction === 'DOWN'
    ? currentPrice * 1.015
    : currentPrice * 0.99;

  return {
    symbol,
    recommendation,
    confidence: pattern.confidence,
    pattern,
    reasons,
    historicalScore: Math.max(0, Math.min(100, historicalScore)),
    keyLevels: { support, resistance },
    expectedMove: { direction, target, stopLoss }
  };
}

// Analyze market close for tomorrow's strategy
export function analyzeMarketClose(
  stockIntelligence: StockIntelligence[]
): MarketCloseAnalysis {
  const topPicks = stockIntelligence
    .filter(s => s.recommendation === 'STRONG_BUY' || s.recommendation === 'BUY')
    .sort((a, b) => b.historicalScore - a.historicalScore)
    .slice(0, 10);

  // Determine market sentiment (placeholder - would use index data)
  const bullishCount = stockIntelligence.filter(s => s.expectedMove.direction === 'UP').length;
  const bearishCount = stockIntelligence.filter(s => s.expectedMove.direction === 'DOWN').length;
  
  const marketSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 
    bullishCount > bearishCount * 1.5 ? 'BULLISH' :
    bearishCount > bullishCount * 1.5 ? 'BEARISH' : 'NEUTRAL';

  // Risk level based on average confidence
  const avgConfidence = topPicks.reduce((sum, s) => sum + s.confidence, 0) / topPicks.length;
  const riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 
    avgConfidence >= 70 ? 'LOW' :
    avgConfidence >= 50 ? 'MEDIUM' : 'HIGH';

  return {
    analysisDate: new Date(),
    topPicks,
    sectorStrength: {}, // Would be populated with actual sector data
    marketSentiment,
    tomorrowTheme: `Focus on ${marketSentiment.toLowerCase()} setups with ${topPicks.length} high-confidence opportunities`,
    keyLevels: {
      nifty: { support: 0, resistance: 0 } // Would be calculated from index
    },
    riskLevel
  };
}

// Rate limiting helper
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

