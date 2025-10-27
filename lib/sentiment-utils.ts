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
  
  // Thresholds for classification
  const positiveThreshold = 0.5;
  const negativeThreshold = -0.5;
  
  if (result.comparative > positiveThreshold) {
    label = 'POSITIVE';
    emoji = result.comparative > 2 ? '🚀' : result.comparative > 1 ? '📈' : '😊';
    color = '#00ff64'; // Green
  } else if (result.comparative < negativeThreshold) {
    label = 'NEGATIVE';
    emoji = result.comparative < -2 ? '💥' : result.comparative < -1 ? '📉' : '😟';
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
  score: number;          // Average comparative score
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

