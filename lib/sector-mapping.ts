/**
 * Sector and Industry Mapping for Indian Stocks
 * Maps sectors to their constituent stocks and defines sector relationships
 */

export interface SectorInfo {
  sector: string;
  industry: string;
  subsector?: string;
  relatedSectors: string[]; // Sectors that influence this one
  macroFactors: string[]; // Macro factors that affect this sector
}

// Comprehensive sector mapping for Indian stocks
export const STOCK_SECTOR_MAP: Record<string, SectorInfo> = {
  // PSU Banks
  'IOB': { sector: 'Banking', industry: 'PSU Bank', relatedSectors: ['Banking', 'Financial Services'], macroFactors: ['RBI Policy', 'Interest Rates', 'Government Policy', 'FDI'] },
  'SBI': { sector: 'Banking', industry: 'PSU Bank', relatedSectors: ['Banking', 'Financial Services'], macroFactors: ['RBI Policy', 'Interest Rates', 'Government Policy', 'FDI'] },
  'PNB': { sector: 'Banking', industry: 'PSU Bank', relatedSectors: ['Banking', 'Financial Services'], macroFactors: ['RBI Policy', 'Interest Rates', 'Government Policy', 'FDI'] },
  'BANKBARODA': { sector: 'Banking', industry: 'PSU Bank', relatedSectors: ['Banking', 'Financial Services'], macroFactors: ['RBI Policy', 'Interest Rates', 'Government Policy', 'FDI'] },
  'CANBK': { sector: 'Banking', industry: 'PSU Bank', relatedSectors: ['Banking', 'Financial Services'], macroFactors: ['RBI Policy', 'Interest Rates', 'Government Policy', 'FDI'] },
  
  // Private Banks
  'HDFCBANK': { sector: 'Banking', industry: 'Private Bank', relatedSectors: ['Banking', 'Financial Services'], macroFactors: ['RBI Policy', 'Interest Rates', 'Credit Growth'] },
  'ICICIBANK': { sector: 'Banking', industry: 'Private Bank', relatedSectors: ['Banking', 'Financial Services'], macroFactors: ['RBI Policy', 'Interest Rates', 'Credit Growth'] },
  'AXISBANK': { sector: 'Banking', industry: 'Private Bank', relatedSectors: ['Banking', 'Financial Services'], macroFactors: ['RBI Policy', 'Interest Rates', 'Credit Growth'] },
  'KOTAKBANK': { sector: 'Banking', industry: 'Private Bank', relatedSectors: ['Banking', 'Financial Services'], macroFactors: ['RBI Policy', 'Interest Rates', 'Credit Growth'] },
  
  // IT Services
  'TCS': { sector: 'IT', industry: 'IT Services', relatedSectors: ['Technology', 'IT'], macroFactors: ['USD-INR', 'Global Tech', 'US Economy', 'Digital Transformation'] },
  'INFY': { sector: 'IT', industry: 'IT Services', relatedSectors: ['Technology', 'IT'], macroFactors: ['USD-INR', 'Global Tech', 'US Economy', 'Digital Transformation'] },
  'WIPRO': { sector: 'IT', industry: 'IT Services', relatedSectors: ['Technology', 'IT'], macroFactors: ['USD-INR', 'Global Tech', 'US Economy', 'Digital Transformation'] },
  'HCLTECH': { sector: 'IT', industry: 'IT Services', relatedSectors: ['Technology', 'IT'], macroFactors: ['USD-INR', 'Global Tech', 'US Economy', 'Digital Transformation'] },
  'TECHM': { sector: 'IT', industry: 'IT Services', relatedSectors: ['Technology', 'IT'], macroFactors: ['USD-INR', 'Global Tech', 'US Economy', 'Digital Transformation'] },
  
  // Oil & Gas
  'RELIANCE': { sector: 'Energy', industry: 'Oil & Gas', subsector: 'Refining & Marketing', relatedSectors: ['Energy', 'Petrochemicals', 'Retail'], macroFactors: ['Crude Oil Prices', 'USD-INR', 'Government Policy', 'Global Energy'] },
  'ONGC': { sector: 'Energy', industry: 'Oil & Gas', subsector: 'Exploration & Production', relatedSectors: ['Energy'], macroFactors: ['Crude Oil Prices', 'Government Policy', 'Global Energy'] },
  'BPCL': { sector: 'Energy', industry: 'Oil & Gas', subsector: 'Refining & Marketing', relatedSectors: ['Energy'], macroFactors: ['Crude Oil Prices', 'Government Policy', 'Subsidies'] },
  'IOC': { sector: 'Energy', industry: 'Oil & Gas', subsector: 'Refining & Marketing', relatedSectors: ['Energy'], macroFactors: ['Crude Oil Prices', 'Government Policy', 'Subsidies'] },
  
  // Automobiles
  'MARUTI': { sector: 'Automobile', industry: 'Auto Manufacturers', relatedSectors: ['Automobile', 'Retail'], macroFactors: ['Interest Rates', 'Consumer Spending', 'Commodity Prices', 'EV Policy'] },
  'TATAMOTORS': { sector: 'Automobile', industry: 'Auto Manufacturers', relatedSectors: ['Automobile'], macroFactors: ['Interest Rates', 'Consumer Spending', 'Steel Prices', 'EV Policy'] },
  'M&M': { sector: 'Automobile', industry: 'Auto Manufacturers', relatedSectors: ['Automobile'], macroFactors: ['Interest Rates', 'Rural Demand', 'Steel Prices', 'Tractor Demand'] },
  
  // Pharmaceuticals
  'SUNPHARMA': { sector: 'Healthcare', industry: 'Pharmaceuticals', relatedSectors: ['Healthcare'], macroFactors: ['USD-INR', 'US FDA', 'Drug Pricing', 'R&D'] },
  'DRREDDY': { sector: 'Healthcare', industry: 'Pharmaceuticals', relatedSectors: ['Healthcare'], macroFactors: ['USD-INR', 'US FDA', 'Drug Pricing', 'R&D'] },
  'CIPLA': { sector: 'Healthcare', industry: 'Pharmaceuticals', relatedSectors: ['Healthcare'], macroFactors: ['USD-INR', 'US FDA', 'Drug Pricing', 'Generic Competition'] },
  
  // Metals & Mining
  'TATASTEEL': { sector: 'Metals', industry: 'Steel', relatedSectors: ['Metals', 'Mining'], macroFactors: ['Steel Prices', 'China Demand', 'Infrastructure Spending', 'Iron Ore Prices'] },
  'HINDALCO': { sector: 'Metals', industry: 'Aluminum', relatedSectors: ['Metals'], macroFactors: ['Aluminum Prices', 'Energy Costs', 'Global Demand'] },
  'VEDL': { sector: 'Metals', industry: 'Diversified Metals', relatedSectors: ['Metals', 'Mining'], macroFactors: ['Commodity Prices', 'China Demand', 'Global Growth'] },
  
  // FMCG
  'HINDUNILVR': { sector: 'FMCG', industry: 'Consumer Goods', relatedSectors: ['FMCG', 'Retail'], macroFactors: ['Rural Demand', 'Monsoon', 'Commodity Prices', 'GST'] },
  'ITC': { sector: 'FMCG', industry: 'Diversified FMCG', relatedSectors: ['FMCG', 'Hospitality'], macroFactors: ['Tobacco Regulation', 'GST', 'Rural Demand'] },
  'NESTLEIND': { sector: 'FMCG', industry: 'Food Products', relatedSectors: ['FMCG'], macroFactors: ['Commodity Prices', 'Rural Demand', 'Health Trends'] },
  
  // Telecom
  'BHARTIARTL': { sector: 'Telecom', industry: 'Telecom Services', relatedSectors: ['Telecom', 'Technology'], macroFactors: ['5G Rollout', 'ARPU', 'Spectrum Pricing', 'Competition'] },
  'IDEA': { sector: 'Telecom', industry: 'Telecom Services', relatedSectors: ['Telecom'], macroFactors: ['5G Rollout', 'ARPU', 'Debt Levels', 'Competition'] },
};

// Sector-specific news keywords
export const SECTOR_NEWS_KEYWORDS: Record<string, string[]> = {
  'Banking': ['banking sector', 'PSU banks', 'private banks', 'NPA', 'credit growth', 'bank recap', 'FDI banks', 'RBI banks'],
  'IT': ['IT sector', 'software services', 'tech industry', 'digital transformation', 'IT hiring', 'H1B visa', 'offshore development'],
  'Energy': ['oil sector', 'gas sector', 'crude oil', 'petroleum', 'energy sector', 'OPEC', 'refining'],
  'Automobile': ['auto sector', 'automobile industry', 'car sales', 'vehicle sales', 'EV', 'electric vehicles', 'auto components'],
  'Healthcare': ['pharma sector', 'pharmaceutical industry', 'drug pricing', 'FDA approval', 'healthcare sector'],
  'Metals': ['steel sector', 'metal prices', 'steel prices', 'aluminum sector', 'mining sector', 'commodity metals'],
  'FMCG': ['FMCG sector', 'consumer goods', 'rural demand', 'consumer sentiment', 'FMCG growth'],
  'Telecom': ['telecom sector', 'telco', '5G', 'spectrum auction', 'ARPU', 'telecom operators'],
  'Financial Services': ['NBFC', 'financial services', 'lending', 'fintech', 'insurance'],
};

// Macro factors and their affected sectors
export const MACRO_IMPACT_MAP: Record<string, string[]> = {
  'RBI Policy': ['Banking', 'Financial Services', 'Real Estate', 'Automobile'],
  'Interest Rates': ['Banking', 'Financial Services', 'Real Estate', 'Automobile', 'FMCG'],
  'Crude Oil Prices': ['Energy', 'Automobile', 'Aviation', 'Paints', 'Logistics'],
  'USD-INR': ['IT', 'Healthcare', 'Energy', 'Metals'],
  'Government Policy': ['Banking', 'Energy', 'Infrastructure', 'Telecom'],
  'FDI': ['Banking', 'Retail', 'Insurance', 'Real Estate'],
  'Monsoon': ['FMCG', 'Automobile', 'Agriculture'],
  'China Demand': ['Metals', 'Energy', 'Chemicals'],
  'Global Tech': ['IT', 'Technology'],
  'Steel Prices': ['Metals', 'Automobile', 'Infrastructure'],
  'Commodity Prices': ['FMCG', 'Energy', 'Metals'],
};

// Macro news sources
export const MACRO_NEWS_KEYWORDS = [
  'RBI policy',
  'interest rate',
  'repo rate',
  'inflation',
  'GDP growth',
  'government budget',
  'FDI policy',
  'GST',
  'crude oil',
  'dollar rupee',
  'USD INR',
  'foreign exchange',
  'monsoon',
  'global markets',
];

/**
 * Get sector information for a stock symbol
 */
export function getSectorInfo(symbol: string): SectorInfo | null {
  return STOCK_SECTOR_MAP[symbol] || null;
}

/**
 * Get all stocks in a sector
 */
export function getStocksInSector(sector: string): string[] {
  return Object.entries(STOCK_SECTOR_MAP)
    .filter(([_, info]) => info.sector === sector)
    .map(([symbol, _]) => symbol);
}

/**
 * Get sectors affected by a macro factor
 */
export function getSectorsAffectedByMacro(macroFactor: string): string[] {
  return MACRO_IMPACT_MAP[macroFactor] || [];
}

/**
 * Build search query for sector news
 */
export function buildSectorNewsQuery(sectorInfo: SectorInfo): string {
  const keywords = SECTOR_NEWS_KEYWORDS[sectorInfo.sector] || [];
  if (sectorInfo.industry) {
    keywords.push(sectorInfo.industry.toLowerCase());
  }
  if (sectorInfo.subsector) {
    keywords.push(sectorInfo.subsector.toLowerCase());
  }
  
  return keywords.slice(0, 5).join(' OR ');
}

/**
 * Build search query for macro news affecting a stock
 */
export function buildMacroNewsQuery(sectorInfo: SectorInfo): string {
  return sectorInfo.macroFactors.slice(0, 5).join(' OR ');
}

/**
 * Check if a macro event affects a stock
 */
export function doesMacroAffectStock(macroFactor: string, symbol: string): boolean {
  const sectorInfo = getSectorInfo(symbol);
  if (!sectorInfo) return false;
  
  const affectedSectors = getSectorsAffectedByMacro(macroFactor);
  return affectedSectors.includes(sectorInfo.sector);
}

