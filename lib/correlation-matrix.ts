/**
 * 📊 CORRELATION MATRIX
 * 
 * Calculates correlation coefficients between stocks for:
 * - Portfolio diversification analysis
 * - Risk management (avoid highly correlated positions)
 * - Sector/theme identification
 * - Hedging opportunities
 */

export interface CorrelationPair {
  stock1: string
  stock2: string
  correlation: number  // -1 to 1
  strength: 'STRONG_POSITIVE' | 'MODERATE_POSITIVE' | 'WEAK' | 'MODERATE_NEGATIVE' | 'STRONG_NEGATIVE'
  interpretation: string
}

export interface CorrelationMatrix {
  symbols: string[]
  matrix: number[][]  // 2D correlation matrix
  pairs: CorrelationPair[]  // Sorted by absolute correlation (highest first)
  
  // Portfolio insights
  insights: {
    highlyCorrelated: CorrelationPair[]  // > 0.7 correlation
    negativelyCorrrelated: CorrelationPair[]  // < -0.3 (potential hedges)
    diversified: CorrelationPair[]  // -0.3 to 0.3 (good diversification)
  }
  
  // Cluster analysis (stocks that move together)
  clusters: {
    name: string
    stocks: string[]
    avgCorrelation: number
  }[]
  
  analyzedAt: Date
  dataPoints: number  // Number of days used
}

export interface PriceData {
  symbol: string
  prices: number[]  // Daily close prices
  dates: Date[]
}

/**
 * Calculate Pearson correlation coefficient between two arrays
 */
function pearsonCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0
  
  const n = x.length
  
  // Calculate means
  const meanX = x.reduce((a, b) => a + b, 0) / n
  const meanY = y.reduce((a, b) => a + b, 0) / n
  
  // Calculate correlation components
  let numerator = 0
  let sumSqX = 0
  let sumSqY = 0
  
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX
    const dy = y[i] - meanY
    numerator += dx * dy
    sumSqX += dx * dx
    sumSqY += dy * dy
  }
  
  const denominator = Math.sqrt(sumSqX * sumSqY)
  
  if (denominator === 0) return 0
  
  return numerator / denominator
}

/**
 * Calculate daily returns from prices
 */
function calculateReturns(prices: number[]): number[] {
  const returns: number[] = []
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return returns
}

/**
 * Get correlation strength classification
 */
function getCorrelationStrength(corr: number): CorrelationPair['strength'] {
  const absCorr = Math.abs(corr)
  if (corr >= 0.7) return 'STRONG_POSITIVE'
  if (corr >= 0.4) return 'MODERATE_POSITIVE'
  if (corr <= -0.7) return 'STRONG_NEGATIVE'
  if (corr <= -0.4) return 'MODERATE_NEGATIVE'
  return 'WEAK'
}

/**
 * Get interpretation of correlation
 */
function getCorrelationInterpretation(corr: number, stock1: string, stock2: string): string {
  if (corr >= 0.8) return `${stock1} and ${stock2} move almost identically - avoid holding both`
  if (corr >= 0.6) return `${stock1} and ${stock2} are highly correlated - consider sector overlap`
  if (corr >= 0.4) return `${stock1} and ${stock2} tend to move together`
  if (corr <= -0.6) return `${stock1} and ${stock2} move inversely - potential hedge pair`
  if (corr <= -0.4) return `${stock1} and ${stock2} have negative correlation - good for diversification`
  return `${stock1} and ${stock2} have low correlation - independent movement`
}

/**
 * Identify clusters of correlated stocks
 */
function identifyClusters(symbols: string[], matrix: number[][]): { name: string; stocks: string[]; avgCorrelation: number }[] {
  const clusters: { name: string; stocks: string[]; avgCorrelation: number }[] = []
  const assigned = new Set<string>()
  
  // Simple clustering: group stocks with correlation > 0.6
  for (let i = 0; i < symbols.length; i++) {
    if (assigned.has(symbols[i])) continue
    
    const cluster: string[] = [symbols[i]]
    assigned.add(symbols[i])
    
    for (let j = i + 1; j < symbols.length; j++) {
      if (assigned.has(symbols[j])) continue
      if (matrix[i][j] >= 0.6) {
        cluster.push(symbols[j])
        assigned.add(symbols[j])
      }
    }
    
    if (cluster.length > 1) {
      // Calculate average correlation within cluster
      let totalCorr = 0
      let count = 0
      for (let a = 0; a < cluster.length; a++) {
        for (let b = a + 1; b < cluster.length; b++) {
          const idxA = symbols.indexOf(cluster[a])
          const idxB = symbols.indexOf(cluster[b])
          totalCorr += matrix[idxA][idxB]
          count++
        }
      }
      
      clusters.push({
        name: `Cluster ${clusters.length + 1}`,
        stocks: cluster,
        avgCorrelation: count > 0 ? totalCorr / count : 0
      })
    }
  }
  
  return clusters
}

/**
 * Main function: Calculate correlation matrix from price data
 */
export function calculateCorrelationMatrix(priceData: PriceData[]): CorrelationMatrix {
  const symbols = priceData.map(p => p.symbol)
  const n = symbols.length
  
  // Initialize matrix with 1s on diagonal
  const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0))
  
  // Calculate returns for each stock
  const returnsMap = new Map<string, number[]>()
  for (const data of priceData) {
    returnsMap.set(data.symbol, calculateReturns(data.prices))
  }
  
  // Calculate correlation for each pair
  const pairs: CorrelationPair[] = []
  
  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1  // Self-correlation is always 1
    
    for (let j = i + 1; j < n; j++) {
      const returns1 = returnsMap.get(symbols[i]) || []
      const returns2 = returnsMap.get(symbols[j]) || []
      
      // Use minimum length
      const minLen = Math.min(returns1.length, returns2.length)
      const corr = pearsonCorrelation(
        returns1.slice(-minLen),
        returns2.slice(-minLen)
      )
      
      matrix[i][j] = corr
      matrix[j][i] = corr  // Symmetric matrix
      
      pairs.push({
        stock1: symbols[i],
        stock2: symbols[j],
        correlation: corr,
        strength: getCorrelationStrength(corr),
        interpretation: getCorrelationInterpretation(corr, symbols[i], symbols[j])
      })
    }
  }
  
  // Sort pairs by absolute correlation (highest first)
  pairs.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
  
  // Generate insights
  const insights = {
    highlyCorrelated: pairs.filter(p => p.correlation >= 0.7),
    negativelyCorrrelated: pairs.filter(p => p.correlation <= -0.3),
    diversified: pairs.filter(p => p.correlation > -0.3 && p.correlation < 0.3)
  }
  
  // Identify clusters
  const clusters = identifyClusters(symbols, matrix)
  
  // Get data points count
  const dataPoints = Math.min(...priceData.map(p => p.prices.length))
  
  return {
    symbols,
    matrix,
    pairs,
    insights,
    clusters,
    analyzedAt: new Date(),
    dataPoints
  }
}

/**
 * Get correlation color for heatmap visualization
 */
export function getCorrelationColor(correlation: number): string {
  // Red for positive, blue for negative, white for zero
  if (correlation >= 0.8) return '#FF4444'
  if (correlation >= 0.6) return '#FF7777'
  if (correlation >= 0.4) return '#FFAAAA'
  if (correlation >= 0.2) return '#FFDDDD'
  if (correlation <= -0.8) return '#4444FF'
  if (correlation <= -0.6) return '#7777FF'
  if (correlation <= -0.4) return '#AAAAFF'
  if (correlation <= -0.2) return '#DDDDFF'
  return '#FFFFFF'
}

/**
 * Calculate portfolio correlation score
 * Lower is better (more diversified)
 */
export function calculatePortfolioCorrelationScore(
  positions: string[],
  correlationMatrix: CorrelationMatrix
): { score: number; interpretation: string; warnings: string[] } {
  if (positions.length < 2) {
    return { score: 0, interpretation: 'Single position - no correlation analysis needed', warnings: [] }
  }
  
  const warnings: string[] = []
  let totalCorr = 0
  let count = 0
  
  for (let i = 0; i < positions.length; i++) {
    const idx1 = correlationMatrix.symbols.indexOf(positions[i])
    if (idx1 === -1) continue
    
    for (let j = i + 1; j < positions.length; j++) {
      const idx2 = correlationMatrix.symbols.indexOf(positions[j])
      if (idx2 === -1) continue
      
      const corr = correlationMatrix.matrix[idx1][idx2]
      totalCorr += corr
      count++
      
      if (corr >= 0.7) {
        warnings.push(`⚠️ ${positions[i]} and ${positions[j]} highly correlated (${(corr * 100).toFixed(0)}%)`)
      }
    }
  }
  
  const avgCorr = count > 0 ? totalCorr / count : 0
  const score = avgCorr * 100  // Convert to percentage
  
  let interpretation: string
  if (avgCorr >= 0.6) {
    interpretation = 'Portfolio highly concentrated - consider diversifying'
  } else if (avgCorr >= 0.4) {
    interpretation = 'Portfolio moderately correlated - some diversification benefit'
  } else if (avgCorr >= 0.2) {
    interpretation = 'Portfolio reasonably diversified'
  } else {
    interpretation = 'Portfolio well diversified - positions move independently'
  }
  
  return { score, interpretation, warnings }
}
