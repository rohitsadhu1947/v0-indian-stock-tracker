/**
 * Sector Rotation Scanner
 * 
 * Identifies hot sectors and finds momentum stocks within those sectors.
 * Strategy: Ride sector momentum for higher win rates.
 */

import { STOCK_SECTOR_MAP, getSectorInfo } from './sector-mapping'

export interface SectorPerformance {
  sector: string
  stockCount: number
  avgChange: number
  positiveCount: number
  momentum: 'HOT' | 'WARM' | 'NEUTRAL' | 'COLD'
  topGainers: string[]
  topLosers: string[]
  volumeSpike: number
}

export interface SectorStock {
  symbol: string
  sector: string
  price: number
  change: number
  volume: number
  avgVolume: number
  volumeRatio: number
  momentum: number
  rsi: number
}

/**
 * Analyze sector performance
 */
export function analyzeSectorPerformance(
  stockData: Record<string, { symbol: string; price: number; change: number; volume: number; avgVolume: number }>
): SectorPerformance[] {
  // Group stocks by sector
  const sectorGroups: Record<string, typeof stockData[string][]> = {}
  
  for (const [symbol, data] of Object.entries(stockData)) {
    const sectorInfo = getSectorInfo(symbol)
    const sector = sectorInfo?.sector || 'OTHER'
    
    if (!sectorGroups[sector]) {
      sectorGroups[sector] = []
    }
    
    sectorGroups[sector].push(data)
  }
  
  // Calculate sector performance
  const sectorPerf: SectorPerformance[] = []
  
  for (const [sector, stocks] of Object.entries(sectorGroups)) {
    if (stocks.length === 0) continue
    
    const avgChange = stocks.reduce((sum, s) => sum + s.change, 0) / stocks.length
    const positiveCount = stocks.filter(s => s.change > 0).length
    const avgVolume = stocks.reduce((sum, s) => sum + (s.volume / s.avgVolume), 0) / stocks.length
    
    // Sort by change
    const sorted = [...stocks].sort((a, b) => b.change - a.change)
    const topGainers = sorted.slice(0, 3).map(s => s.symbol)
    const topLosers = sorted.slice(-3).reverse().map(s => s.symbol)
    
    // Determine momentum
    let momentum: 'HOT' | 'WARM' | 'NEUTRAL' | 'COLD'
    if (avgChange >= 2 && positiveCount / stocks.length >= 0.7) {
      momentum = 'HOT'
    } else if (avgChange >= 1 && positiveCount / stocks.length >= 0.6) {
      momentum = 'WARM'
    } else if (avgChange <= -1 && positiveCount / stocks.length <= 0.4) {
      momentum = 'COLD'
    } else {
      momentum = 'NEUTRAL'
    }
    
    sectorPerf.push({
      sector,
      stockCount: stocks.length,
      avgChange,
      positiveCount,
      momentum,
      topGainers,
      topLosers,
      volumeSpike: avgVolume
    })
  }
  
  // Sort by avgChange (descending)
  return sectorPerf.sort((a, b) => b.avgChange - a.avgChange)
}

/**
 * Find best stocks in hot sectors
 */
export function findHotSectorStocks(
  sectorPerformance: SectorPerformance[],
  allMomentumSignals: any[]
): any[] {
  // Get hot and warm sectors
  const hotSectors = sectorPerformance.filter(s => s.momentum === 'HOT' || s.momentum === 'WARM')
  
  if (hotSectors.length === 0) {
    return []
  }
  
  const hotSectorNames = new Set(hotSectors.map(s => s.sector))
  
  // Filter momentum signals for stocks in hot sectors
  const hotSectorSignals = allMomentumSignals.filter(signal => {
    const sectorInfo = getSectorInfo(signal.symbol)
    return sectorInfo && hotSectorNames.has(sectorInfo.sector)
  })
  
  // Add sector info to signals
  return hotSectorSignals.map(signal => {
    const sectorInfo = getSectorInfo(signal.symbol)
    const sector = sectorInfo?.sector || 'OTHER'
    return {
      ...signal,
      sector,
      sectorMomentum: sectorPerformance.find(s => s.sector === sector)?.momentum || 'NEUTRAL'
    }
  })
}

/**
 * Generate sector rotation recommendation
 */
export function generateSectorRecommendation(sectorPerf: SectorPerformance): string {
  const { sector, avgChange, positiveCount, stockCount, momentum } = sectorPerf
  
  if (momentum === 'HOT') {
    return `🔥 ${sector} is rallying! ${positiveCount}/${stockCount} stocks up. Avg +${avgChange.toFixed(2)}%. Look for breakouts!`
  } else if (momentum === 'WARM') {
    return `✅ ${sector} showing strength. ${positiveCount}/${stockCount} stocks positive. Avg +${avgChange.toFixed(2)}%. Good setups possible.`
  } else if (momentum === 'COLD') {
    return `❄️ ${sector} is weak. ${positiveCount}/${stockCount} stocks positive. Avg ${avgChange.toFixed(2)}%. Avoid or short.`
  } else {
    return `➖ ${sector} is neutral. ${positiveCount}/${stockCount} stocks positive. Avg ${avgChange.toFixed(2)}%.`
  }
}

