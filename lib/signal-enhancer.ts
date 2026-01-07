/**
 * Signal Enhancer - Post-processor for momentum signals
 * 
 * IMPORTANT: This does NOT modify the core momentum scores.
 * It only adds contextual warnings, labels, and suggestions.
 * 
 * The original signal data passes through unchanged.
 */

export interface EnhancementContext {
  marketRegime?: {
    regime: string
    confidence: number
    positionSizeMultiplier: number
  }
  smartMoney?: {
    fiiTrend: 'BUYING' | 'SELLING' | 'NEUTRAL'
    diiTrend: 'BUYING' | 'SELLING' | 'NEUTRAL'
    fiiNetValue: number
    diiNetValue: number
  }
  upcomingEvents?: {
    symbol: string
    eventType: string
    eventDate: string
    daysUntil: number
  }[]
  correlations?: {
    pair: [string, string]
    correlation: number
  }[]
}

export interface SignalWarning {
  type: 'EARNINGS' | 'REGIME' | 'SMART_MONEY' | 'CORRELATION' | 'VOLATILITY'
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  message: string
  emoji: string
}

export interface SignalSuggestion {
  type: 'POSITION_SIZE' | 'TIMING' | 'DIVERSIFICATION'
  suggestion: string
  emoji: string
}

export interface EnhancedSignal {
  // Original signal data (UNCHANGED)
  originalSignal: any
  
  // New: Contextual enhancements
  warnings: SignalWarning[]
  suggestions: SignalSuggestion[]
  
  // Suggested position size adjustment (1.0 = normal, 0.5 = half, 1.5 = 150%)
  positionSizeMultiplier: number
  
  // Overall risk assessment
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH'
}

/**
 * Enhance signals with contextual warnings and suggestions
 * Does NOT modify original scores - only adds metadata
 */
export function enhanceSignals(
  signals: any[],
  context: EnhancementContext
): EnhancedSignal[] {
  return signals.map(signal => enhanceSignal(signal, context, signals))
}

function enhanceSignal(
  signal: any,
  context: EnhancementContext,
  allSignals: any[]
): EnhancedSignal {
  const warnings: SignalWarning[] = []
  const suggestions: SignalSuggestion[] = []
  let positionSizeMultiplier = 1.0
  
  const symbol = signal.symbol || signal.tradingSymbol || ''
  
  // 1. Check for upcoming events (earnings, dividends, etc.)
  if (context.upcomingEvents) {
    const stockEvents = context.upcomingEvents.filter(e => 
      e.symbol.toUpperCase() === symbol.toUpperCase()
    )
    
    for (const event of stockEvents) {
      if (event.daysUntil <= 3) {
        warnings.push({
          type: 'EARNINGS',
          severity: 'HIGH',
          message: `${event.eventType} in ${event.daysUntil} day${event.daysUntil !== 1 ? 's' : ''} (${event.eventDate})`,
          emoji: '⚠️'
        })
        // Reduce position size for stocks with imminent events
        positionSizeMultiplier *= 0.5
      } else if (event.daysUntil <= 7) {
        warnings.push({
          type: 'EARNINGS',
          severity: 'MEDIUM',
          message: `${event.eventType} coming on ${event.eventDate}`,
          emoji: '📅'
        })
      }
    }
  }
  
  // 2. Market regime adjustments
  if (context.marketRegime) {
    const { regime, confidence, positionSizeMultiplier: regimeMultiplier } = context.marketRegime
    
    if (regime === 'STRONG_BEAR' || regime === 'BEAR') {
      warnings.push({
        type: 'REGIME',
        severity: regime === 'STRONG_BEAR' ? 'HIGH' : 'MEDIUM',
        message: `Market in ${regime.replace('_', ' ')} mode - consider reduced exposure`,
        emoji: '🐻'
      })
      suggestions.push({
        type: 'POSITION_SIZE',
        suggestion: `Regime suggests ${Math.round(regimeMultiplier * 100)}% of normal position size`,
        emoji: '📊'
      })
      positionSizeMultiplier *= regimeMultiplier
    } else if (regime === 'STRONG_BULL') {
      suggestions.push({
        type: 'POSITION_SIZE',
        suggestion: `Strong bull regime - can consider larger positions`,
        emoji: '🐂'
      })
      positionSizeMultiplier *= regimeMultiplier
    } else if (regime === 'SIDEWAYS') {
      warnings.push({
        type: 'REGIME',
        severity: 'LOW',
        message: 'Sideways market - breakout trades may have lower success rate',
        emoji: '↔️'
      })
    }
  }
  
  // 3. Smart money context
  if (context.smartMoney) {
    const { fiiTrend, diiTrend, fiiNetValue } = context.smartMoney
    
    // Determine stock's sector (simplified - you could enhance this)
    const sector = signal.fundamental?.data?.sector || signal.sector || ''
    
    if (fiiTrend === 'SELLING' && Math.abs(fiiNetValue) > 1000) {
      warnings.push({
        type: 'SMART_MONEY',
        severity: 'MEDIUM',
        message: `FII selling heavily (₹${Math.abs(fiiNetValue).toFixed(0)} Cr net outflow)`,
        emoji: '🏦'
      })
    } else if (fiiTrend === 'BUYING' && fiiNetValue > 1000) {
      suggestions.push({
        type: 'TIMING',
        suggestion: `FII buying (₹${fiiNetValue.toFixed(0)} Cr inflow) - institutional support`,
        emoji: '💰'
      })
    }
    
    // FII selling but DII buying = divergence
    if (fiiTrend === 'SELLING' && diiTrend === 'BUYING') {
      suggestions.push({
        type: 'TIMING',
        suggestion: 'FII/DII divergence - DIIs absorbing FII selling',
        emoji: '🔄'
      })
    }
  }
  
  // 4. Correlation check with other selected signals
  if (context.correlations && allSignals.length > 1) {
    const otherSymbols = allSignals
      .filter(s => (s.symbol || s.tradingSymbol) !== symbol)
      .map(s => s.symbol || s.tradingSymbol)
    
    const highCorrelations = context.correlations.filter(c => {
      const [s1, s2] = c.pair
      return (
        (s1.toUpperCase() === symbol.toUpperCase() && otherSymbols.some(o => o.toUpperCase() === s2.toUpperCase())) ||
        (s2.toUpperCase() === symbol.toUpperCase() && otherSymbols.some(o => o.toUpperCase() === s1.toUpperCase()))
      ) && c.correlation > 0.7
    })
    
    if (highCorrelations.length > 0) {
      const correlatedWith = highCorrelations.map(c => {
        const [s1, s2] = c.pair
        return s1.toUpperCase() === symbol.toUpperCase() ? s2 : s1
      })
      
      warnings.push({
        type: 'CORRELATION',
        severity: 'MEDIUM',
        message: `Highly correlated with ${correlatedWith.join(', ')} - diversification risk`,
        emoji: '🔗'
      })
      
      suggestions.push({
        type: 'DIVERSIFICATION',
        suggestion: 'Consider picking only one from correlated group',
        emoji: '⚖️'
      })
    }
  }
  
  // Calculate overall risk level
  const highWarnings = warnings.filter(w => w.severity === 'HIGH').length
  const mediumWarnings = warnings.filter(w => w.severity === 'MEDIUM').length
  
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH' = 'LOW'
  if (highWarnings >= 2 || (highWarnings >= 1 && mediumWarnings >= 2)) {
    riskLevel = 'VERY_HIGH'
  } else if (highWarnings >= 1 || mediumWarnings >= 2) {
    riskLevel = 'HIGH'
  } else if (mediumWarnings >= 1) {
    riskLevel = 'MEDIUM'
  }
  
  // Cap position size multiplier
  positionSizeMultiplier = Math.max(0.25, Math.min(1.5, positionSizeMultiplier))
  
  return {
    originalSignal: signal,
    warnings,
    suggestions,
    positionSizeMultiplier,
    riskLevel
  }
}

/**
 * Get risk level color for UI
 */
export function getRiskColor(riskLevel: string): string {
  switch (riskLevel) {
    case 'LOW': return 'text-green-600'
    case 'MEDIUM': return 'text-yellow-600'
    case 'HIGH': return 'text-orange-600'
    case 'VERY_HIGH': return 'text-red-600'
    default: return 'text-gray-600'
  }
}

/**
 * Get risk level badge color for UI
 */
export function getRiskBadgeColor(riskLevel: string): string {
  switch (riskLevel) {
    case 'LOW': return 'bg-green-100 text-green-800'
    case 'MEDIUM': return 'bg-yellow-100 text-yellow-800'
    case 'HIGH': return 'bg-orange-100 text-orange-800'
    case 'VERY_HIGH': return 'bg-red-100 text-red-800'
    default: return 'bg-gray-100 text-gray-800'
  }
}
