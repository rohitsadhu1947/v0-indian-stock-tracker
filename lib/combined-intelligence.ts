/**
 * Combined Intelligence System
 * 
 * Analyzes Technical + Fundamental + Sentiment signals together
 * to provide a unified, actionable trading strategy
 */

export interface TechnicalSignal {
  signal: 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG SELL';
  reason: string;
}

export interface FundamentalData {
  pe?: number;
  roe?: number;
  debtToEquity?: number;
  marketCap?: number;
}

export interface SentimentData {
  dayTradingSignal: {
    signal: 'STRONG BUY' | 'BUY' | 'WATCH' | 'AVOID' | 'SHORT';
    confidence: number;
    reason: string;
  };
  combinedSentiment: {
    overall: string;
  };
}

export interface CombinedIntelligence {
  scenario: string;
  scenarioEmoji: string;
  overallSignal: 'STRONG BUY' | 'BUY' | 'WATCH' | 'HOLD' | 'AVOID';
  signalColor: string;
  timeframe: 'Intraday' | 'Swing (1-5 days)' | 'Long-term (weeks/months)' | 'Multi-timeframe';
  riskLevel: 'Low' | 'Medium' | 'High' | 'Very High';
  riskColor: string;
  confidence: number;
  strategy: {
    entry: string;
    stopLoss: string;
    target: string;
    exitConditions: string[];
  };
  explanation: {
    technical: string;
    fundamental: string;
    sentiment: string;
    synthesis: string;
  };
  alerts: string[];
}

/**
 * Main function to generate combined intelligence
 */
export function generateCombinedIntelligence(
  technical: TechnicalSignal,
  fundamental: FundamentalData,
  sentiment: SentimentData
): CombinedIntelligence {
  
  // Analyze fundamental quality
  const fundamentalQuality = analyzeFundamentalQuality(fundamental);
  
  // Analyze technical setup
  const technicalSetup = analyzeTechnicalSetup(technical);
  
  // Analyze sentiment context
  const sentimentContext = analyzeSentimentContext(sentiment);
  
  // Identify the trading scenario
  const scenario = identifyScenario(technicalSetup, fundamentalQuality, sentimentContext);
  
  return scenario;
}

/**
 * Analyze fundamental quality
 */
function analyzeFundamentalQuality(fundamental: FundamentalData): {
  quality: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Risky';
  score: number;
  issues: string[];
  strengths: string[];
} {
  const issues: string[] = [];
  const strengths: string[] = [];
  let score = 50; // Start neutral
  
  // P/E Ratio analysis
  if (fundamental.pe !== undefined) {
    if (fundamental.pe < 15) {
      strengths.push('Undervalued (Low P/E)');
      score += 15;
    } else if (fundamental.pe < 25) {
      strengths.push('Fair valuation');
      score += 5;
    } else if (fundamental.pe > 40) {
      issues.push('Overvalued (High P/E)');
      score -= 15;
    }
  }
  
  // ROE analysis
  if (fundamental.roe !== undefined) {
    if (fundamental.roe > 20) {
      strengths.push('Excellent returns (High ROE)');
      score += 15;
    } else if (fundamental.roe > 15) {
      strengths.push('Good returns');
      score += 10;
    } else if (fundamental.roe < 10) {
      issues.push('Low profitability');
      score -= 10;
    }
  }
  
  // Debt analysis
  if (fundamental.debtToEquity !== undefined) {
    if (fundamental.debtToEquity > 50) {
      issues.push('High debt (risky)');
      score -= 20;
    } else if (fundamental.debtToEquity > 30) {
      issues.push('Elevated debt');
      score -= 10;
    } else if (fundamental.debtToEquity < 20) {
      strengths.push('Low debt (safe)');
      score += 10;
    }
  }
  
  let quality: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Risky';
  if (score >= 75) quality = 'Excellent';
  else if (score >= 60) quality = 'Good';
  else if (score >= 45) quality = 'Fair';
  else if (score >= 30) quality = 'Poor';
  else quality = 'Risky';
  
  return { quality, score, issues, strengths };
}

/**
 * Analyze technical setup
 */
function analyzeTechnicalSetup(technical: TechnicalSignal): {
  strength: 'Very Strong' | 'Strong' | 'Moderate' | 'Weak';
  setup: string;
} {
  const signal = technical.signal;
  const reason = technical.reason.toLowerCase();
  
  let strength: 'Very Strong' | 'Strong' | 'Moderate' | 'Weak';
  let setup: string;
  
  if (signal === 'STRONG BUY') {
    strength = 'Very Strong';
    if (reason.includes('oversold')) {
      setup = 'Oversold Bounce';
    } else if (reason.includes('breakout')) {
      setup = 'Breakout';
    } else {
      setup = 'Multiple Bullish Indicators';
    }
  } else if (signal === 'BUY') {
    strength = 'Strong';
    setup = 'Bullish Setup';
  } else if (signal === 'HOLD') {
    strength = 'Weak';
    setup = 'Neutral';
  } else if (signal === 'SELL' || signal === 'STRONG SELL') {
    strength = 'Very Strong';
    setup = 'Bearish Setup';
  } else {
    strength = 'Moderate';
    setup = 'Mixed Signals';
  }
  
  return { strength, setup };
}

/**
 * Analyze sentiment context
 */
function analyzeSentimentContext(sentiment: SentimentData): {
  newsFlow: 'Strong Positive' | 'Positive' | 'Neutral' | 'Negative' | 'No Catalyst';
  daySignal: string;
} {
  const daySignal = sentiment.dayTradingSignal.signal;
  const overall = sentiment.combinedSentiment.overall;
  
  let newsFlow: 'Strong Positive' | 'Positive' | 'Neutral' | 'Negative' | 'No Catalyst';
  
  if (overall === 'POSITIVE' || overall === 'VERY POSITIVE') {
    newsFlow = 'Strong Positive';
  } else if (overall === 'SLIGHTLY POSITIVE') {
    newsFlow = 'Positive';
  } else if (overall === 'NEGATIVE' || overall === 'VERY NEGATIVE') {
    newsFlow = 'Negative';
  } else if (daySignal === 'WATCH' || daySignal === 'AVOID') {
    newsFlow = 'No Catalyst';
  } else {
    newsFlow = 'Neutral';
  }
  
  return { newsFlow, daySignal };
}

/**
 * Identify the trading scenario and generate strategy
 */
function identifyScenario(
  technical: { strength: string; setup: string },
  fundamental: { quality: string; score: number; issues: string[]; strengths: string[] },
  sentiment: { newsFlow: string; daySignal: string }
): CombinedIntelligence {
  
  // Scenario 1: OVERSOLD BOUNCE PLAY (Technical oversold, weak fundamentals, no catalyst)
  if (
    technical.setup === 'Oversold Bounce' &&
    (fundamental.quality === 'Poor' || fundamental.quality === 'Risky' || fundamental.quality === 'Fair') &&
    sentiment.newsFlow === 'No Catalyst'
  ) {
    return {
      scenario: 'Oversold Bounce Play',
      scenarioEmoji: '🎯',
      overallSignal: 'BUY',
      signalColor: '#10b981',
      timeframe: 'Intraday',
      riskLevel: 'Medium',
      riskColor: '#f59e0b',
      confidence: 75,
      strategy: {
        entry: 'Buy on dips near support (Lower BB or key level)',
        stopLoss: 'Tight stop below recent low (1-2% max)',
        target: '2-4% bounce to mean reversion',
        exitConditions: [
          'Target hit (2-4% profit)',
          'Stop-loss triggered',
          'Volume dries up (momentum lost)',
          'End of day (no overnight hold)'
        ]
      },
      explanation: {
        technical: `✅ ${technical.setup} - Price has been beaten down and is showing bullish reversal signals`,
        fundamental: `⚠️ ${fundamental.quality} fundamentals - Not suitable for long-term holding, but technical setup is strong`,
        sentiment: `📰 ${sentiment.newsFlow} - No hype means better risk/reward for technical bounce`,
        synthesis: `This is a CLASSIC INTRADAY OPPORTUNITY. The stock is oversold (technical), fundamentally weak (avoid long-term), and has no news catalyst (no hype). Perfect setup for a quick bounce trade. The weak fundamentals ACTUALLY HELP because it means the stock was over-sold, creating the bounce opportunity.`
      },
      alerts: [
        '⚠️ Do NOT hold overnight - fundamentals are weak',
        '✅ Perfect for scalping/day trading',
        `🎯 Risk: ${fundamental.issues.join(', ')}`,
        '💡 Exit at first sign of weakness'
      ]
    };
  }
  
  // Scenario 2: BREAKOUT WITH CATALYST (Strong technical + positive news)
  if (
    (technical.setup.includes('Breakout') || technical.strength === 'Very Strong') &&
    (sentiment.newsFlow === 'Strong Positive' || sentiment.newsFlow === 'Positive')
  ) {
    return {
      scenario: 'Breakout with Catalyst',
      scenarioEmoji: '🚀',
      overallSignal: 'STRONG BUY',
      signalColor: '#059669',
      timeframe: 'Swing (1-5 days)',
      riskLevel: fundamental.quality === 'Good' || fundamental.quality === 'Excellent' ? 'Medium' : 'High',
      riskColor: fundamental.quality === 'Good' || fundamental.quality === 'Excellent' ? '#f59e0b' : '#ef4444',
      confidence: 85,
      strategy: {
        entry: 'Buy on breakout or pullback to breakout level',
        stopLoss: 'Below breakout level (3-5%)',
        target: '8-15% upside (news-driven momentum)',
        exitConditions: [
          'Target achieved',
          'News catalyst exhausted',
          'Volume declining significantly',
          'Stop-loss hit'
        ]
      },
      explanation: {
        technical: `🚀 ${technical.setup} with ${technical.strength.toLowerCase()} momentum - Price breaking key resistance`,
        fundamental: `${fundamental.quality === 'Excellent' || fundamental.quality === 'Good' ? '✅' : '⚠️'} ${fundamental.quality} fundamentals - ${fundamental.strengths[0] || 'Mixed metrics'}`,
        sentiment: `📰 ${sentiment.newsFlow} - News catalyst driving momentum`,
        synthesis: `MOMENTUM PLAY! Strong technical breakout combined with positive news creates explosive potential. ${fundamental.quality === 'Excellent' || fundamental.quality === 'Good' ? 'Good fundamentals support the move.' : 'Watch fundamentals - exit if momentum fades.'}`
      },
      alerts: [
        '🚀 High momentum - potential for quick gains',
        '⏰ News-driven - watch for news exhaustion',
        fundamental.quality === 'Poor' || fundamental.quality === 'Risky' ? '⚠️ Weak fundamentals - take profits early' : '✅ Fundamentals support the move',
        '💡 Trail stop-loss as price moves up'
      ]
    };
  }
  
  // Scenario 3: VALUE PLAY (Good fundamentals, weak technical, neutral sentiment)
  if (
    fundamental.quality === 'Excellent' || fundamental.quality === 'Good'&&
    (technical.strength === 'Weak' || technical.strength === 'Moderate') &&
    sentiment.newsFlow !== 'Negative'
  ) {
    return {
      scenario: 'Value Accumulation',
      scenarioEmoji: '💎',
      overallSignal: 'BUY',
      signalColor: '#3b82f6',
      timeframe: 'Long-term (weeks/months)',
      riskLevel: 'Low',
      riskColor: '#10b981',
      confidence: 70,
      strategy: {
        entry: 'Accumulate on dips over multiple days',
        stopLoss: 'Wide stop (10-15% below entry)',
        target: '20-40% upside (fair value)',
        exitConditions: [
          'Valuation reaches fair value',
          'Fundamentals deteriorate',
          'Better opportunities emerge',
          'Stop-loss breached'
        ]
      },
      explanation: {
        technical: `📊 ${technical.setup} - No immediate catalyst, but not a concern for value investing`,
        fundamental: `✅ ${fundamental.quality} fundamentals - ${fundamental.strengths.join(', ')}`,
        sentiment: `📰 ${sentiment.newsFlow} - Market hasn't noticed yet (good for accumulation)`,
        synthesis: `LONG-TERM VALUE PLAY. Strong fundamentals are undervalued by the market. Lack of technical momentum and news means you can accumulate at better prices. This is a PATIENT INVESTOR'S opportunity, not a day trade.`
      },
      alerts: [
        '💎 Quality stock at good price',
        '⏳ Requires patience - not for quick profits',
        '✅ Low risk for long-term holders',
        `💡 Strengths: ${fundamental.strengths.join(', ')}`
      ]
    };
  }
  
  // Scenario 4: CONFLICTING SIGNALS (Technical says buy, fundamentals/sentiment say avoid)
  if (
    (technical.strength === 'Very Strong' || technical.strength === 'Strong') &&
    (fundamental.quality === 'Poor' || fundamental.quality === 'Risky') &&
    sentiment.newsFlow === 'Negative'
  ) {
    return {
      scenario: 'High Risk - Conflicting Signals',
      scenarioEmoji: '⚠️',
      overallSignal: 'WATCH',
      signalColor: '#f59e0b',
      timeframe: 'Intraday',
      riskLevel: 'Very High',
      riskColor: '#dc2626',
      confidence: 50,
      strategy: {
        entry: 'Only if you\'re an experienced trader - small position',
        stopLoss: 'Very tight (1-2% maximum)',
        target: 'Quick scalp (2-3% max)',
        exitConditions: [
          'ANY profit (don\'t be greedy)',
          'Immediate stop if reverses',
          'Exit within same day',
          'If negative news intensifies'
        ]
      },
      explanation: {
        technical: `⚠️ ${technical.setup} - Strong technical signal BUT...`,
        fundamental: `❌ ${fundamental.quality} fundamentals - ${fundamental.issues.join(', ')}`,
        sentiment: `📰 ${sentiment.newsFlow} - Negative news flow working against technical setup`,
        synthesis: `DANGER ZONE! Technical setup looks good but fundamentals are weak AND sentiment is negative. This is a TRAP for beginners. Only experienced traders should attempt this with very tight risk management. The technical bounce may be short-lived.`
      },
      alerts: [
        '🚨 HIGH RISK - Conflicting signals',
        '⚠️ Weak fundamentals + negative news',
        '💡 If you trade: SMALL SIZE, TIGHT STOP',
        '❌ NOT recommended for beginners'
      ]
    };
  }
  
  // Scenario 5: ALL SYSTEMS GO (Everything aligned)
  if (
    (technical.strength === 'Very Strong' || technical.strength === 'Strong') &&
    (fundamental.quality === 'Excellent' || fundamental.quality === 'Good') &&
    (sentiment.newsFlow === 'Strong Positive' || sentiment.newsFlow === 'Positive')
  ) {
    return {
      scenario: 'Perfect Storm - All Signals Aligned',
      scenarioEmoji: '⚡',
      overallSignal: 'STRONG BUY',
      signalColor: '#059669',
      timeframe: 'Multi-timeframe',
      riskLevel: 'Low',
      riskColor: '#10b981',
      confidence: 95,
      strategy: {
        entry: 'Aggressive entry - this rarely happens!',
        stopLoss: 'Moderate stop (5-7%)',
        target: '15-30%+ (ride the trend)',
        exitConditions: [
          'Technical breakdown',
          'News turns negative',
          'Fundamentals deteriorate',
          'Target achieved'
        ]
      },
      explanation: {
        technical: `🚀 ${technical.setup} - ${technical.strength} technical momentum`,
        fundamental: `✅ ${fundamental.quality} fundamentals - ${fundamental.strengths.join(', ')}`,
        sentiment: `📰 ${sentiment.newsFlow} - Positive catalyst driving interest`,
        synthesis: `RARE OPPORTUNITY! Technical, fundamental, and sentiment ALL aligned positively. This is the holy grail of trading setups. Good for both swing trading AND long-term holding. High probability of success.`
      },
      alerts: [
        '🎯 RARE SETUP - All signals aligned!',
        '✅ Suitable for all timeframes',
        '💎 Consider larger position size',
        '⚡ High probability setup - don\'t miss it!'
      ]
    };
  }
  
  // Default: NEUTRAL/MIXED SIGNALS
  return {
    scenario: 'Mixed Signals - No Clear Edge',
    scenarioEmoji: '🤔',
    overallSignal: 'HOLD',
    signalColor: '#6b7280',
    timeframe: 'Swing (1-5 days)',
    riskLevel: 'Medium',
    riskColor: '#f59e0b',
    confidence: 40,
    strategy: {
      entry: 'Wait for clearer setup',
      stopLoss: 'N/A',
      target: 'N/A',
      exitConditions: [
        'Better opportunity emerges',
        'Signals become clearer',
        'Technical setup improves',
        'News catalyst appears'
      ]
    },
    explanation: {
      technical: `📊 ${technical.setup} - ${technical.strength} technical signal`,
      fundamental: `${fundamental.quality === 'Excellent' || fundamental.quality === 'Good' ? '✅' : '⚠️'} ${fundamental.quality} fundamentals`,
      sentiment: `📰 ${sentiment.newsFlow}`,
      synthesis: `NO CLEAR EDGE. The signals are mixed and don't provide a high-probability setup. Best to WAIT for a clearer opportunity. Don't force trades when the edge isn't clear.`
    },
    alerts: [
      '⏸️ No clear trading edge',
      '💡 Patience is a position',
      '✅ Preserve capital for better setups',
      '📊 Re-evaluate when signals change'
    ]
  };
}

