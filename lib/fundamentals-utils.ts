// Fundamental Analysis Utilities for Indian Stocks

export interface FundamentalData {
  symbol: string;
  companyName: string;
  sector?: string;
  industry?: string;
  
  // Valuation Metrics
  marketCap: number;
  enterpriseValue?: number;
  peRatio?: number;
  pbRatio?: number;
  pegRatio?: number;
  priceToSales?: number;
  
  // Profitability
  eps?: number;
  roe?: number; // Return on Equity
  roa?: number; // Return on Assets
  roce?: number; // Return on Capital Employed
  profitMargin?: number;
  operatingMargin?: number;
  
  // Financial Health
  debtToEquity?: number;
  currentRatio?: number;
  quickRatio?: number;
  interestCoverage?: number;
  
  // Dividends
  dividendYield?: number;
  payoutRatio?: number;
  dividendPerShare?: number;
  
  // Growth Metrics
  revenueGrowth?: number;
  earningsGrowth?: number;
  revenuePerShare?: number;
  
  // Market Data
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  beta?: number;
  averageVolume?: number;
  
  // Analyst Ratings
  targetPrice?: number;
  recommendationMean?: number; // 1=Strong Buy, 5=Sell
  numberOfAnalysts?: number;
  
  // Valuation
  bookValue?: number;
  priceToBook?: number;
  
  lastUpdated: Date;
}

export interface FundamentalScore {
  overall: number; // 0-100
  valuation: number; // 0-100
  profitability: number; // 0-100
  financial_health: number; // 0-100
  growth: number; // 0-100
  rating: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'VERY POOR';
  reasons: string[];
}

/**
 * Calculate overall fundamental score (0-100)
 */
export function calculateFundamentalScore(data: FundamentalData): FundamentalScore {
  let valuationScore = 50;
  let profitabilityScore = 50;
  let financialHealthScore = 50;
  let growthScore = 50;
  const reasons: string[] = [];
  
  // === VALUATION METRICS ===
  
  // P/E Ratio (lower is better for value, but not too low)
  if (data.peRatio !== undefined && data.peRatio > 0) {
    if (data.peRatio < 10) {
      valuationScore += 5;
      reasons.push('Low P/E ratio - possibly undervalued');
    } else if (data.peRatio < 15) {
      valuationScore += 15;
      reasons.push('Attractive P/E ratio');
    } else if (data.peRatio < 25) {
      valuationScore += 10;
      reasons.push('Fair P/E ratio');
    } else if (data.peRatio < 35) {
      valuationScore += 5;
      reasons.push('Moderate P/E ratio');
    } else {
      valuationScore -= 10;
      reasons.push('High P/E ratio - may be overvalued');
    }
  }
  
  // P/B Ratio (lower is better)
  if (data.pbRatio !== undefined && data.pbRatio > 0) {
    if (data.pbRatio < 1) {
      valuationScore += 10;
      reasons.push('Trading below book value');
    } else if (data.pbRatio < 3) {
      valuationScore += 5;
    } else if (data.pbRatio > 5) {
      valuationScore -= 5;
      reasons.push('High P/B ratio');
    }
  }
  
  // Dividend Yield (higher is better for income investors)
  if (data.dividendYield !== undefined && data.dividendYield > 0) {
    if (data.dividendYield > 3) {
      valuationScore += 10;
      reasons.push(`High dividend yield: ${(data.dividendYield * 100).toFixed(2)}%`);
    } else if (data.dividendYield > 2) {
      valuationScore += 5;
      reasons.push(`Good dividend yield: ${(data.dividendYield * 100).toFixed(2)}%`);
    }
  }
  
  // === PROFITABILITY METRICS ===
  
  // ROE (higher is better)
  if (data.roe !== undefined && data.roe > 0) {
    if (data.roe > 0.25) { // 25%+
      profitabilityScore += 20;
      reasons.push(`Excellent ROE: ${(data.roe * 100).toFixed(1)}%`);
    } else if (data.roe > 0.20) { // 20%+
      profitabilityScore += 15;
      reasons.push(`Strong ROE: ${(data.roe * 100).toFixed(1)}%`);
    } else if (data.roe > 0.15) { // 15%+
      profitabilityScore += 10;
      reasons.push(`Good ROE: ${(data.roe * 100).toFixed(1)}%`);
    } else if (data.roe > 0.10) { // 10%+
      profitabilityScore += 5;
    } else {
      profitabilityScore -= 5;
      reasons.push(`Low ROE: ${(data.roe * 100).toFixed(1)}%`);
    }
  }
  
  // Profit Margin (higher is better)
  if (data.profitMargin !== undefined && data.profitMargin > 0) {
    if (data.profitMargin > 0.20) { // 20%+
      profitabilityScore += 15;
      reasons.push(`High profit margin: ${(data.profitMargin * 100).toFixed(1)}%`);
    } else if (data.profitMargin > 0.15) { // 15%+
      profitabilityScore += 10;
    } else if (data.profitMargin > 0.10) { // 10%+
      profitabilityScore += 5;
    } else if (data.profitMargin < 0.05) { // < 5%
      profitabilityScore -= 10;
      reasons.push('Low profit margin');
    }
  }
  
  // Operating Margin
  if (data.operatingMargin !== undefined && data.operatingMargin > 0) {
    if (data.operatingMargin > 0.20) {
      profitabilityScore += 5;
    } else if (data.operatingMargin < 0.10) {
      profitabilityScore -= 5;
    }
  }
  
  // === FINANCIAL HEALTH ===
  
  // Debt to Equity (lower is better)
  if (data.debtToEquity !== undefined) {
    if (data.debtToEquity < 0.3) {
      financialHealthScore += 15;
      reasons.push('Very low debt - strong balance sheet');
    } else if (data.debtToEquity < 0.5) {
      financialHealthScore += 10;
      reasons.push('Low debt levels');
    } else if (data.debtToEquity < 1.0) {
      financialHealthScore += 5;
    } else if (data.debtToEquity < 2.0) {
      financialHealthScore -= 5;
      reasons.push('Moderate debt levels');
    } else {
      financialHealthScore -= 15;
      reasons.push('High debt - risk factor');
    }
  }
  
  // Current Ratio (liquidity - higher is better, but not too high)
  if (data.currentRatio !== undefined) {
    if (data.currentRatio > 2.0) {
      financialHealthScore += 10;
      reasons.push('Strong liquidity position');
    } else if (data.currentRatio > 1.5) {
      financialHealthScore += 5;
    } else if (data.currentRatio < 1.0) {
      financialHealthScore -= 10;
      reasons.push('Weak liquidity - may face cash issues');
    }
  }
  
  // Quick Ratio (even stricter liquidity test)
  if (data.quickRatio !== undefined) {
    if (data.quickRatio > 1.0) {
      financialHealthScore += 5;
    } else if (data.quickRatio < 0.5) {
      financialHealthScore -= 5;
    }
  }
  
  // === GROWTH METRICS ===
  
  // Revenue Growth (higher is better)
  if (data.revenueGrowth !== undefined) {
    if (data.revenueGrowth > 0.30) { // 30%+
      growthScore += 20;
      reasons.push(`Exceptional revenue growth: ${(data.revenueGrowth * 100).toFixed(1)}%`);
    } else if (data.revenueGrowth > 0.20) { // 20%+
      growthScore += 15;
      reasons.push(`Strong revenue growth: ${(data.revenueGrowth * 100).toFixed(1)}%`);
    } else if (data.revenueGrowth > 0.15) { // 15%+
      growthScore += 10;
      reasons.push(`Good revenue growth: ${(data.revenueGrowth * 100).toFixed(1)}%`);
    } else if (data.revenueGrowth > 0.10) { // 10%+
      growthScore += 5;
    } else if (data.revenueGrowth < 0) {
      growthScore -= 15;
      reasons.push('Declining revenue - red flag');
    }
  }
  
  // Earnings Growth
  if (data.earningsGrowth !== undefined) {
    if (data.earningsGrowth > 0.25) { // 25%+
      growthScore += 15;
      reasons.push(`Strong earnings growth: ${(data.earningsGrowth * 100).toFixed(1)}%`);
    } else if (data.earningsGrowth > 0.15) { // 15%+
      growthScore += 10;
    } else if (data.earningsGrowth < 0) {
      growthScore -= 10;
      reasons.push('Declining earnings');
    }
  }
  
  // Cap scores at 0-100
  valuationScore = Math.min(100, Math.max(0, valuationScore));
  profitabilityScore = Math.min(100, Math.max(0, profitabilityScore));
  financialHealthScore = Math.min(100, Math.max(0, financialHealthScore));
  growthScore = Math.min(100, Math.max(0, growthScore));
  
  // Overall score (weighted average)
  const overall = Math.round(
    valuationScore * 0.25 +
    profitabilityScore * 0.30 +
    financialHealthScore * 0.25 +
    growthScore * 0.20
  );
  
  // Determine rating
  let rating: FundamentalScore['rating'];
  if (overall >= 80) {
    rating = 'EXCELLENT';
  } else if (overall >= 65) {
    rating = 'GOOD';
  } else if (overall >= 50) {
    rating = 'FAIR';
  } else if (overall >= 35) {
    rating = 'POOR';
  } else {
    rating = 'VERY POOR';
  }
  
  return {
    overall,
    valuation: Math.round(valuationScore),
    profitability: Math.round(profitabilityScore),
    financial_health: Math.round(financialHealthScore),
    growth: Math.round(growthScore),
    rating,
    reasons
  };
}

/**
 * Format large numbers (Market Cap, Revenue, etc.)
 */
export function formatLargeNumber(num: number): string {
  if (num >= 1e12) {
    return `₹${(num / 1e12).toFixed(2)} T`; // Trillion
  } else if (num >= 1e9) {
    return `₹${(num / 1e9).toFixed(2)} B`; // Billion
  } else if (num >= 1e7) {
    return `₹${(num / 1e7).toFixed(2)} Cr`; // Crore
  } else if (num >= 1e5) {
    return `₹${(num / 1e5).toFixed(2)} L`; // Lakh
  } else {
    return `₹${num.toFixed(2)}`;
  }
}

/**
 * Convert Yahoo Finance symbol format
 * NSE: Add .NS suffix
 * BSE: Add .BO suffix
 */
export function convertToYahooSymbol(symbol: string, exchange: 'NSE' | 'BSE' = 'NSE'): string {
  // Remove any existing suffixes
  const cleanSymbol = symbol.replace(/\.(NS|BO|NSE|BSE)$/i, '');
  
  // Add appropriate suffix
  return exchange === 'NSE' ? `${cleanSymbol}.NS` : `${cleanSymbol}.BO`;
}

/**
 * Check if market cap suggests company size
 */
export function getCompanySize(marketCap: number): string {
  if (marketCap >= 1e14) {
    return 'Mega Cap'; // ₹10 Lakh Crore+
  } else if (marketCap >= 5e13) {
    return 'Large Cap'; // ₹50,000 Crore+
  } else if (marketCap >= 2e13) {
    return 'Mid Cap'; // ₹20,000 Crore+
  } else if (marketCap >= 5e12) {
    return 'Small Cap'; // ₹5,000 Crore+
  } else {
    return 'Micro Cap'; // < ₹5,000 Crore
  }
}

