// @ts-ignore - no type declarations available for 'sentiment'
import Sentiment from 'sentiment';

// Initialize sentiment analyzer
const analyzer = new Sentiment();

// Sentiment result interface
export interface SentimentResult {
  score: number;           // Raw sentiment score (-5 to +5 typically)
  comparative: number;     // Score normalized by word count
  label: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  confidence: number;      // Confidence percentage (0-100)
  emoji: string;          // Visual indicator
  color: string;          // Color for UI
}

// Custom word list for financial/stock market context
const customWords = {
  // Positive financial words
  'bullish': 3,
  'rally': 3,
  'surge': 3,
  'soar': 3,
  'gain': 2,
  'profit': 2,
  'growth': 2,
  'rise': 2,
  'up': 1,
  'positive': 2,
  'strong': 2,
  'outperform': 3,
  'beat': 2,
  'exceed': 2,
  'upgrade': 2,
  'buy': 2,
  'momentum': 2,
  'breakout': 2,
  'high': 1,
  'record': 2,
  'best': 2,
  'improve': 2,
  'recovery': 2,
  'boost': 2,
  'jump': 2,
  
  // Negative financial words
  'bearish': -3,
  'crash': -4,
  'plunge': -3,
  'tumble': -3,
  'fall': -2,
  'loss': -2,
  'decline': -2,
  'drop': -2,
  'down': -1,
  'negative': -2,
  'weak': -2,
  'underperform': -3,
  'miss': -2,
  'downgrade': -2,
  'sell': -2,
  'concern': -2,
  'fear': -2,
  'low': -1,
  'worst': -2,
  'cut': -2,
  'slide': -2,
  'slump': -2,
  'warning': -2,
  'risk': -1,
  'volatile': -1,
  'uncertainty': -2,

  // Inflections and Indian-market phrasing. The base-form-only list missed
  // most real headlines: "ratings downgraded", "brokerages turn cautious",
  // "shares surged", "profit booking" all scored zero.
  'bull': 2, 'bulls': 2, 'rallies': 3, 'rallied': 3, 'surged': 3, 'surges': 3,
  'soared': 3, 'soars': 3, 'gains': 2, 'gained': 2, 'profits': 2, 'rises': 2,
  'rose': 2, 'jumped': 2, 'jumps': 2, 'upgraded': 2, 'upgrades': 2,
  'outperformed': 3, 'outperforms': 3, 'beats': 2, 'exceeded': 2, 'exceeds': 2,
  'boosted': 2, 'boosts': 2, 'improved': 2, 'improves': 2, 'multibagger': 3,
  'breakouts': 2, 'zoom': 3, 'zooms': 3, 'zoomed': 3, 'spike': 2, 'spikes': 2,
  'climbs': 2, 'climbed': 2, 'advance': 2, 'advances': 2, 'bullishness': 3,
  'optimistic': 2, 'optimism': 2, 'robust': 2, 'expansion': 2, 'accumulate': 2,
  'overweight': 2, 'target price': 1, 'dividend': 1, 'bonus': 1, 'order win': 3,
  'wins': 2, 'won': 2, 'approval': 2, 'approved': 2, 'launch': 1,

  'bears': -3, 'crashed': -4, 'crashes': -4, 'plunged': -3, 'plunges': -3,
  'tumbled': -3, 'tumbles': -3, 'falls': -2, 'fell': -2, 'losses': -2,
  'declines': -2, 'declined': -2, 'drops': -2, 'dropped': -2, 'weakness': -2,
  'weaker': -2, 'misses': -2, 'missed': -2, 'downgraded': -3, 'downgrades': -3,
  'cautious': -2, 'caution': -2, 'concerns': -2, 'fears': -2, 'cuts': -2,
  'slashed': -3, 'slashes': -3, 'slides': -2, 'slid': -2, 'slumped': -3,
  'slumps': -3, 'warns': -2, 'warned': -2, 'risks': -1, 'volatility': -1,
  'selloff': -3, 'sell-off': -3, 'profit booking': -2, 'muted': -2,
  'subdued': -2, 'sluggish': -2, 'underweight': -2, 'probe': -2, 'fraud': -4,
  'penalty': -2, 'fine': -1, 'lawsuit': -2, 'default': -3, 'downtrend': -2,
  'pressure': -1, 'drag': -2, 'drags': -2, 'dragged': -2, 'halt': -2,
  'recall': -2, 'resign': -2, 'resigned': -2, 'layoff': -2, 'layoffs': -2,
};

// Register custom words with the analyzer
analyzer.registerLanguage('en', {
  labels: customWords
});

/**
 * Analyze sentiment of a text (headline or snippet)
 */
export function analyzeSentiment(text: string): SentimentResult {
  if (!text || text.trim().length === 0) {
    return {
      score: 0,
      comparative: 0,
      label: 'NEUTRAL',
      confidence: 0,
      emoji: '😐',
      color: '#888888'
    };
  }
  
  // Clean the text
  const cleanText = text.toLowerCase().trim();
  
  // Analyze with sentiment library
  const result = analyzer.analyze(cleanText);
  
  // Determine label based on score
  let label: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  let emoji: string;
  let color: string;
  
  // Classify on the RAW valence sum, not `comparative` (= raw / word count).
  // Headlines are 10-20 words, so comparative tops out around 0.4; the old
  // 0.5 threshold could never be met and every article came back NEUTRAL.
  // Measured over 75 live headlines: |raw| >= 2 marks a genuine directional
  // headline ("shares surge 2%" = +7, "shares crash 7.5%" = -5), while +-1 is
  // incidental wording.
  const positiveThreshold = 2;
  const negativeThreshold = -2;
  
  if (result.score >= positiveThreshold) {
    label = 'POSITIVE';
    emoji = result.score >= 7 ? '🚀' : result.score >= 4 ? '📈' : '😊';
    color = '#00ff64'; // Green
  } else if (result.score <= negativeThreshold) {
    label = 'NEGATIVE';
    emoji = result.score <= -7 ? '💥' : result.score <= -4 ? '📉' : '😟';
    color = '#ff0064'; // Red
  } else {
    label = 'NEUTRAL';
    emoji = '😐';
    color = '#888888'; // Gray
  }
  
  // Calculate confidence (0-100)
  // Higher absolute comparative score = higher confidence
  const absComparative = Math.abs(result.comparative);
  const confidence = Math.min(100, Math.round(absComparative * 30)); // Scale to 0-100
  
  return {
    score: result.score,
    comparative: result.comparative,
    label,
    confidence,
    emoji,
    color
  };
}

/**
 * Calculate aggregate sentiment from multiple news items
 */
export interface AggregateSentiment {
  overall: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  score: number;          // Average comparative score (tiny: divided by word count)
  /**
   * Balance of positive vs negative ARTICLES, -1..1.
   * Use this for scoring: `score` is a per-word average that lands inside any
   * sensible neutral band for almost every headline, which pinned the
   * intelligence score to its neutral value.
   */
  balance: number;
  positive: number;       // Count of positive articles
  negative: number;       // Count of negative articles
  neutral: number;        // Count of neutral articles
  total: number;          // Total articles
  emoji: string;
  color: string;
  description: string;
}

export function calculateAggregateSentiment(sentiments: SentimentResult[]): AggregateSentiment {
  if (sentiments.length === 0) {
    return {
      overall: 'NEUTRAL',
      score: 0,
      balance: 0,
      positive: 0,
      negative: 0,
      neutral: 0,
      total: 0,
      emoji: '😐',
      color: '#888888',
      description: 'No sentiment data available'
    };
  }
  
  // Count by label
  const positive = sentiments.filter(s => s.label === 'POSITIVE').length;
  const negative = sentiments.filter(s => s.label === 'NEGATIVE').length;
  const neutral = sentiments.filter(s => s.label === 'NEUTRAL').length;
  const total = sentiments.length;
  
  // Calculate average score
  const avgScore = sentiments.reduce((sum, s) => sum + s.comparative, 0) / total;

  // Article balance: how one-sided the coverage is, ignoring neutral filler.
  const directional = positive + negative;
  const balance = directional > 0 ? (positive - negative) / directional : 0;
  
  // Determine overall sentiment
  let overall: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  let emoji: string;
  let color: string;
  let description: string;
  
  const positivePercent = (positive / total) * 100;
  const negativePercent = (negative / total) * 100;
  
  if (positivePercent > 50 && avgScore > 0.3) {
    overall = 'POSITIVE';
    emoji = '🚀';
    color = '#00ff64';
    description = `Bullish sentiment - ${positivePercent.toFixed(0)}% positive news`;
  } else if (negativePercent > 50 && avgScore < -0.3) {
    overall = 'NEGATIVE';
    emoji = '💥';
    color = '#ff0064';
    description = `Bearish sentiment - ${negativePercent.toFixed(0)}% negative news`;
  } else if (avgScore > 0.1) {
    overall = 'POSITIVE';
    emoji = '📈';
    color = '#00ff64';
    description = `Slightly positive sentiment`;
  } else if (avgScore < -0.1) {
    overall = 'NEGATIVE';
    emoji = '📉';
    color = '#ff0064';
    description = `Slightly negative sentiment`;
  } else {
    overall = 'NEUTRAL';
    emoji = '😐';
    color = '#888888';
    description = `Neutral sentiment - mixed signals`;
  }
  
  return {
    overall,
    score: avgScore,
    balance,
    positive,
    negative,
    neutral,
    total,
    emoji,
    color,
    description
  };
}

/**
 * Get sentiment trading signal based on news sentiment
 */
export function getSentimentTradingSignal(aggregate: AggregateSentiment): {
  signal: string;
  strength: number; // 0-10
  reason: string;
} {
  const positiveRatio = aggregate.positive / aggregate.total;
  const negativeRatio = aggregate.negative / aggregate.total;
  
  if (positiveRatio > 0.7 && aggregate.score > 1) {
    return {
      signal: 'STRONG BUY',
      strength: 9,
      reason: 'Overwhelming positive news sentiment with high conviction'
    };
  } else if (positiveRatio > 0.6 && aggregate.score > 0.5) {
    return {
      signal: 'BUY',
      strength: 7,
      reason: 'Majority positive news sentiment suggests upward momentum'
    };
  } else if (negativeRatio > 0.7 && aggregate.score < -1) {
    return {
      signal: 'STRONG SELL',
      strength: 9,
      reason: 'Overwhelming negative news sentiment with high conviction'
    };
  } else if (negativeRatio > 0.6 && aggregate.score < -0.5) {
    return {
      signal: 'SELL',
      strength: 7,
      reason: 'Majority negative news sentiment suggests downward pressure'
    };
  } else if (positiveRatio > 0.5) {
    return {
      signal: 'WATCH (Positive Bias)',
      strength: 5,
      reason: 'Slightly positive sentiment but not strong enough for clear signal'
    };
  } else if (negativeRatio > 0.5) {
    return {
      signal: 'WATCH (Negative Bias)',
      strength: 5,
      reason: 'Slightly negative sentiment but not strong enough for clear signal'
    };
  } else {
    return {
      signal: 'HOLD',
      strength: 3,
      reason: 'Mixed or neutral sentiment - wait for clearer signals'
    };
  }
}

/**
 * Day Trading Signal - More aggressive and sensitive for intraday trades
 * Considers: recency, velocity, volume, and sentiment divergence
 */
export interface DayTradingSignal {
  signal: 'STRONG BUY' | 'BUY' | 'WATCH' | 'AVOID' | 'SHORT';
  strength: number; // 1-10
  confidence: number; // 0-100%
  reason: string;
  actions: string[];
  timeframe: string;
}

export function getDayTradingSignal(
  stockSentiment: AggregateSentiment,
  sectorSentiment: AggregateSentiment | null,
  macroSentiment: AggregateSentiment | null,
  combinedScore: number
): DayTradingSignal {
  
  const stockScore = stockSentiment.score || 0;
  const sectorScore = sectorSentiment?.score || 0;
  const macroScore = macroSentiment?.score || 0;
  
  const stockPositiveRatio = stockSentiment.total > 0 ? stockSentiment.positive / stockSentiment.total : 0;
  const stockNegativeRatio = stockSentiment.total > 0 ? stockSentiment.negative / stockSentiment.total : 0;
  const sectorPositiveRatio = sectorSentiment && sectorSentiment.total > 0 ? sectorSentiment.positive / sectorSentiment.total : 0;
  
  // News volume (more news = more volatility = more opportunity)
  const newsVolume = stockSentiment.total + (sectorSentiment?.total || 0);
  const highVolume = newsVolume > 20;
  
  // Sentiment divergence (stock vs sector)
  const divergence = sectorScore - stockScore;
  const strongDivergence = Math.abs(divergence) > 0.5;
  
  // Calculate confidence based on news volume and agreement
  let confidence = 50; // Base confidence
  if (newsVolume > 15) confidence += 20;
  if (stockSentiment.total > 8) confidence += 10;
  if (strongDivergence) confidence += 15;
  confidence = Math.min(100, confidence);
  
  let signal: 'STRONG BUY' | 'BUY' | 'WATCH' | 'AVOID' | 'SHORT';
  let strength: number;
  let reason: string;
  let actions: string[] = [];
  let timeframe: string = '1-3 hours';
  
  // STRONG BUY: Positive momentum + high volume + sector support
  if (stockScore > 0.3 && sectorScore > 0.2 && highVolume) {
    signal = 'STRONG BUY';
    strength = Math.min(10, Math.round((stockScore + sectorScore) * 5) + 2);
    reason = `Strong positive momentum with sector support. High news volume indicates volatility.`;
    actions = [
      'Enter long position immediately',
      'Set tight stop-loss (1-2%)',
      'Target: 2-4% profit',
      'Watch for momentum continuation'
    ];
    timeframe = '30min-2 hours';
  }
  // BUY: Positive sentiment or lagging behind positive sector
  else if (stockScore > 0.1 || (divergence > 0.5 && sectorScore > 0.3)) {
    signal = 'BUY';
    strength = Math.round((Math.abs(stockScore) + sectorScore) * 4) + 1;
    
    if (divergence > 0.5) {
      reason = `Stock lagging positive sector (${sectorScore > 0 ? '+' : ''}${(sectorScore * 100).toFixed(0)}%). Catch-up opportunity.`;
      actions = [
        'Enter on dips/consolidation',
        'Sector tailwind likely to lift stock',
        'Target: 1.5-3% profit',
        'Exit if sector momentum reverses'
      ];
    } else {
      reason = `Positive sentiment building. Early momentum detected.`;
      actions = [
        'Enter with 50% position',
        'Add on confirmation',
        'Target: 1-2% profit',
        'Scalp on volatility'
      ];
    }
    timeframe = '1-3 hours';
  }
  // SHORT: Strong negative sentiment
  else if (stockScore < -0.3 || (stockNegativeRatio > 0.4 && highVolume)) {
    signal = 'SHORT';
    strength = Math.min(10, Math.round(Math.abs(stockScore) * 5) + 2);
    reason = `Strong negative sentiment. ${Math.round(stockNegativeRatio * 100)}% bearish articles.`;
    actions = [
      'Consider shorting on rallies',
      'Tight stop above resistance',
      'Target: 1-3% profit',
      'Watch for panic selling opportunities'
    ];
    timeframe = '30min-2 hours';
  }
  // AVOID: Weak negative or high uncertainty
  else if (stockScore < -0.1 || (stockSentiment.total < 5 && combinedScore < 0)) {
    signal = 'AVOID';
    strength = Math.round(Math.abs(stockScore) * 3) + 1;
    reason = stockSentiment.total < 5 
      ? 'Insufficient news flow for day trading. Low liquidity risk.'
      : 'Negative undertone. Risk > reward for intraday.';
    actions = [
      'Stay out - unclear direction',
      'Wait for clearer signals',
      'Consider other opportunities',
      'Monitor for reversal'
    ];
    timeframe = 'Wait';
  }
  // WATCH: Neutral but with potential
  else {
    signal = 'WATCH';
    strength = Math.round((Math.abs(stockScore) + Math.abs(sectorScore)) * 2) + 3;
    
    if (highVolume && Math.abs(divergence) < 0.2) {
      reason = `High news volume but neutral sentiment. Volatility setup - wait for direction.`;
      actions = [
        'Watch for breakout/breakdown',
        'Set alerts at key levels',
        'Don\'t trade yet - wait for trigger',
        'News catalyst could spark move'
      ];
      confidence = Math.min(confidence + 10, 100);
    } else if (strongDivergence) {
      reason = `Sentiment conflict: Stock ${stockScore > 0 ? 'positive' : 'negative'} but sector ${sectorScore > 0 ? 'positive' : 'negative'}. Mixed signals.`;
      actions = [
        'Wait for alignment',
        'Sector usually leads',
        'Don\'t force trades',
        'Monitor for next 1-2 hours'
      ];
    } else {
      reason = `Low conviction. Minimal news catalyst. Wait for better setup.`;
      actions = [
        'Skip - no edge',
        'Look for stocks with clearer signals',
        'Preserve capital for better opportunities',
        'Check back in 2-3 hours'
      ];
    }
    timeframe = 'Wait for setup';
  }
  
  return {
    signal,
    strength: Math.max(1, Math.min(10, strength)),
    confidence: Math.max(20, Math.min(100, confidence)),
    reason,
    actions,
    timeframe
  };
}

