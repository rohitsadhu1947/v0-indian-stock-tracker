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

// Comprehensive sector mapping for Indian stocks (100+ stocks across all major sectors)
export const STOCK_SECTOR_MAP: Record<string, SectorInfo> = {
  // ========== BANKING ==========
  // PSU Banks
  'IOB': { sector: 'Banking', industry: 'PSU Bank', relatedSectors: ['Banking', 'Financial Services'], macroFactors: ['RBI Policy', 'Interest Rates', 'Government Policy', 'FDI'] },
  'SBI': { sector: 'Banking', industry: 'PSU Bank', relatedSectors: ['Banking', 'Financial Services'], macroFactors: ['RBI Policy', 'Interest Rates', 'Government Policy', 'FDI'] },
  'PNB': { sector: 'Banking', industry: 'PSU Bank', relatedSectors: ['Banking', 'Financial Services'], macroFactors: ['RBI Policy', 'Interest Rates', 'Government Policy', 'FDI'] },
  'BANKBARODA': { sector: 'Banking', industry: 'PSU Bank', relatedSectors: ['Banking', 'Financial Services'], macroFactors: ['RBI Policy', 'Interest Rates', 'Government Policy', 'FDI'] },
  'CANBK': { sector: 'Banking', industry: 'PSU Bank', relatedSectors: ['Banking', 'Financial Services'], macroFactors: ['RBI Policy', 'Interest Rates', 'Government Policy', 'FDI'] },
  'INDIANB': { sector: 'Banking', industry: 'PSU Bank', relatedSectors: ['Banking', 'Financial Services'], macroFactors: ['RBI Policy', 'Interest Rates', 'Government Policy'] },
  'UNIONBANK': { sector: 'Banking', industry: 'PSU Bank', relatedSectors: ['Banking', 'Financial Services'], macroFactors: ['RBI Policy', 'Interest Rates', 'Government Policy'] },
  // Private Banks
  'HDFCBANK': { sector: 'Banking', industry: 'Private Bank', relatedSectors: ['Banking', 'Financial Services'], macroFactors: ['RBI Policy', 'Interest Rates', 'Credit Growth'] },
  'ICICIBANK': { sector: 'Banking', industry: 'Private Bank', relatedSectors: ['Banking', 'Financial Services'], macroFactors: ['RBI Policy', 'Interest Rates', 'Credit Growth'] },
  'AXISBANK': { sector: 'Banking', industry: 'Private Bank', relatedSectors: ['Banking', 'Financial Services'], macroFactors: ['RBI Policy', 'Interest Rates', 'Credit Growth'] },
  'KOTAKBANK': { sector: 'Banking', industry: 'Private Bank', relatedSectors: ['Banking', 'Financial Services'], macroFactors: ['RBI Policy', 'Interest Rates', 'Credit Growth'] },
  'INDUSINDBK': { sector: 'Banking', industry: 'Private Bank', relatedSectors: ['Banking', 'Financial Services'], macroFactors: ['RBI Policy', 'Interest Rates', 'Credit Growth'] },
  'BANDHANBNK': { sector: 'Banking', industry: 'Private Bank', relatedSectors: ['Banking', 'Financial Services'], macroFactors: ['RBI Policy', 'Interest Rates', 'Microfinance'] },
  'FEDERALBNK': { sector: 'Banking', industry: 'Private Bank', relatedSectors: ['Banking', 'Financial Services'], macroFactors: ['RBI Policy', 'Interest Rates', 'Credit Growth'] },
  'IDFCFIRSTB': { sector: 'Banking', industry: 'Private Bank', relatedSectors: ['Banking', 'Financial Services'], macroFactors: ['RBI Policy', 'Interest Rates', 'Credit Growth'] },
  'AUBANK': { sector: 'Banking', industry: 'Small Finance Bank', relatedSectors: ['Banking', 'Financial Services'], macroFactors: ['RBI Policy', 'Interest Rates', 'Financial Inclusion'] },

  // ========== NBFC / FINANCIAL SERVICES ==========
  'BAJFINANCE': { sector: 'Financial Services', industry: 'NBFC', relatedSectors: ['Banking', 'Financial Services'], macroFactors: ['Interest Rates', 'Consumer Spending', 'Credit Growth', 'RBI Policy'] },
  'BAJAJFINSV': { sector: 'Financial Services', industry: 'Financial Holding', relatedSectors: ['Banking', 'Financial Services', 'Insurance'], macroFactors: ['Interest Rates', 'Insurance Penetration'] },
  'CHOLAFIN': { sector: 'Financial Services', industry: 'NBFC', relatedSectors: ['Banking', 'Financial Services'], macroFactors: ['Interest Rates', 'Vehicle Financing', 'Rural Demand'] },
  'SHRIRAMFIN': { sector: 'Financial Services', industry: 'NBFC', relatedSectors: ['Banking', 'Financial Services'], macroFactors: ['Interest Rates', 'Commercial Vehicle Demand'] },
  'MUTHOOTFIN': { sector: 'Financial Services', industry: 'NBFC', subsector: 'Gold Loans', relatedSectors: ['Financial Services'], macroFactors: ['Interest Rates', 'Commodity Prices', 'Rural Demand'] },
  'MANAPPURAM': { sector: 'Financial Services', industry: 'NBFC', subsector: 'Gold Loans', relatedSectors: ['Financial Services'], macroFactors: ['Interest Rates', 'Commodity Prices', 'Rural Demand'] },
  'POONAWALLA': { sector: 'Financial Services', industry: 'NBFC', relatedSectors: ['Banking', 'Financial Services'], macroFactors: ['Interest Rates', 'Consumer Spending'] },
  'LICHSGFIN': { sector: 'Financial Services', industry: 'Housing Finance', relatedSectors: ['Banking', 'Real Estate'], macroFactors: ['Interest Rates', 'Real Estate Demand', 'RBI Policy'] },
  'PFC': { sector: 'Financial Services', industry: 'Power Finance', relatedSectors: ['Financial Services', 'Power'], macroFactors: ['Interest Rates', 'Government Policy', 'Infrastructure Spending'] },
  'RECLTD': { sector: 'Financial Services', industry: 'Power Finance', relatedSectors: ['Financial Services', 'Power'], macroFactors: ['Interest Rates', 'Government Policy', 'Infrastructure Spending'] },

  // ========== INSURANCE ==========
  'SBILIFE': { sector: 'Insurance', industry: 'Life Insurance', relatedSectors: ['Financial Services', 'Insurance'], macroFactors: ['Interest Rates', 'Insurance Penetration', 'FDI'] },
  'HDFCLIFE': { sector: 'Insurance', industry: 'Life Insurance', relatedSectors: ['Financial Services', 'Insurance'], macroFactors: ['Interest Rates', 'Insurance Penetration'] },
  'ICICIPRULI': { sector: 'Insurance', industry: 'Life Insurance', relatedSectors: ['Financial Services', 'Insurance'], macroFactors: ['Interest Rates', 'Insurance Penetration'] },
  'ICICIGI': { sector: 'Insurance', industry: 'General Insurance', relatedSectors: ['Financial Services', 'Insurance'], macroFactors: ['Interest Rates', 'Insurance Penetration', 'Climate Risk'] },

  // ========== IT SERVICES ==========
  'TCS': { sector: 'IT', industry: 'IT Services', relatedSectors: ['Technology', 'IT'], macroFactors: ['USD-INR', 'Global Tech', 'US Economy', 'Digital Transformation'] },
  'INFY': { sector: 'IT', industry: 'IT Services', relatedSectors: ['Technology', 'IT'], macroFactors: ['USD-INR', 'Global Tech', 'US Economy', 'Digital Transformation'] },
  'WIPRO': { sector: 'IT', industry: 'IT Services', relatedSectors: ['Technology', 'IT'], macroFactors: ['USD-INR', 'Global Tech', 'US Economy', 'Digital Transformation'] },
  'HCLTECH': { sector: 'IT', industry: 'IT Services', relatedSectors: ['Technology', 'IT'], macroFactors: ['USD-INR', 'Global Tech', 'US Economy', 'Digital Transformation'] },
  'TECHM': { sector: 'IT', industry: 'IT Services', relatedSectors: ['Technology', 'IT'], macroFactors: ['USD-INR', 'Global Tech', 'US Economy', 'Digital Transformation'] },
  'LTIM': { sector: 'IT', industry: 'IT Services', relatedSectors: ['Technology', 'IT'], macroFactors: ['USD-INR', 'Global Tech', 'US Economy'] },
  'MPHASIS': { sector: 'IT', industry: 'IT Services', relatedSectors: ['Technology', 'IT'], macroFactors: ['USD-INR', 'Global Tech', 'US Economy'] },
  'COFORGE': { sector: 'IT', industry: 'IT Services', relatedSectors: ['Technology', 'IT'], macroFactors: ['USD-INR', 'Global Tech', 'US Economy'] },
  'PERSISTENT': { sector: 'IT', industry: 'IT Services', relatedSectors: ['Technology', 'IT'], macroFactors: ['USD-INR', 'Global Tech', 'US Economy'] },

  // ========== OIL & GAS ==========
  'RELIANCE': { sector: 'Energy', industry: 'Oil & Gas', subsector: 'Refining & Marketing', relatedSectors: ['Energy', 'Petrochemicals', 'Retail'], macroFactors: ['Crude Oil Prices', 'USD-INR', 'Government Policy', 'Global Energy'] },
  'ONGC': { sector: 'Energy', industry: 'Oil & Gas', subsector: 'Exploration & Production', relatedSectors: ['Energy'], macroFactors: ['Crude Oil Prices', 'Government Policy', 'Global Energy'] },
  'BPCL': { sector: 'Energy', industry: 'Oil & Gas', subsector: 'Refining & Marketing', relatedSectors: ['Energy'], macroFactors: ['Crude Oil Prices', 'Government Policy', 'Subsidies'] },
  'IOC': { sector: 'Energy', industry: 'Oil & Gas', subsector: 'Refining & Marketing', relatedSectors: ['Energy'], macroFactors: ['Crude Oil Prices', 'Government Policy', 'Subsidies'] },
  'GAIL': { sector: 'Energy', industry: 'Natural Gas', subsector: 'Gas Transmission', relatedSectors: ['Energy'], macroFactors: ['Crude Oil Prices', 'Government Policy', 'Global Energy'] },
  'OIL': { sector: 'Energy', industry: 'Oil & Gas', subsector: 'Exploration & Production', relatedSectors: ['Energy'], macroFactors: ['Crude Oil Prices', 'Government Policy'] },
  'PETRONET': { sector: 'Energy', industry: 'Natural Gas', subsector: 'LNG Import', relatedSectors: ['Energy'], macroFactors: ['Crude Oil Prices', 'USD-INR', 'Global Energy'] },

  // ========== PAINTS (Crude-derivative heavy — key crude-oil proxy!) ==========
  'ASIANPAINT': { sector: 'Paints', industry: 'Paints & Coatings', relatedSectors: ['Chemicals', 'Real Estate'], macroFactors: ['Crude Oil Prices', 'Real Estate Demand', 'Consumer Spending', 'Commodity Prices'] },
  'BERGEPAINT': { sector: 'Paints', industry: 'Paints & Coatings', relatedSectors: ['Chemicals', 'Real Estate'], macroFactors: ['Crude Oil Prices', 'Real Estate Demand', 'Consumer Spending'] },
  'INDIGOPNTS': { sector: 'Paints', industry: 'Paints & Coatings', relatedSectors: ['Chemicals', 'Real Estate'], macroFactors: ['Crude Oil Prices', 'Real Estate Demand'] },

  // ========== AIRLINES (Jet fuel = crude derivative — massive impact!) ==========
  'INDIGO': { sector: 'Aviation', industry: 'Airlines', relatedSectors: ['Aviation', 'Tourism'], macroFactors: ['Crude Oil Prices', 'USD-INR', 'Consumer Spending', 'Tourism'] },
  'SPICEJET': { sector: 'Aviation', industry: 'Airlines', relatedSectors: ['Aviation', 'Tourism'], macroFactors: ['Crude Oil Prices', 'USD-INR', 'Consumer Spending', 'Debt Levels'] },

  // ========== AUTOMOBILES ==========
  'MARUTI': { sector: 'Automobile', industry: 'Passenger Vehicles', relatedSectors: ['Automobile', 'Retail'], macroFactors: ['Interest Rates', 'Consumer Spending', 'Commodity Prices', 'Crude Oil Prices'] },
  'TATAMOTORS': { sector: 'Automobile', industry: 'Auto Manufacturers', relatedSectors: ['Automobile'], macroFactors: ['Interest Rates', 'Consumer Spending', 'Steel Prices', 'USD-INR'] },
  'M&M': { sector: 'Automobile', industry: 'Auto Manufacturers', relatedSectors: ['Automobile'], macroFactors: ['Interest Rates', 'Rural Demand', 'Steel Prices', 'Crude Oil Prices'] },
  'BAJAJ-AUTO': { sector: 'Automobile', industry: 'Two Wheelers', relatedSectors: ['Automobile'], macroFactors: ['Interest Rates', 'Rural Demand', 'Consumer Spending', 'USD-INR'] },
  'HEROMOTOCO': { sector: 'Automobile', industry: 'Two Wheelers', relatedSectors: ['Automobile'], macroFactors: ['Interest Rates', 'Rural Demand', 'Crude Oil Prices', 'Consumer Spending'] },
  'EICHERMOT': { sector: 'Automobile', industry: 'Two Wheelers', relatedSectors: ['Automobile'], macroFactors: ['Consumer Spending', 'Crude Oil Prices', 'USD-INR'] },
  'ASHOKLEY': { sector: 'Automobile', industry: 'Commercial Vehicles', relatedSectors: ['Automobile', 'Infrastructure'], macroFactors: ['Interest Rates', 'Infrastructure Spending', 'Crude Oil Prices'] },
  'TVSMOTOR': { sector: 'Automobile', industry: 'Two Wheelers', relatedSectors: ['Automobile'], macroFactors: ['Interest Rates', 'Rural Demand', 'Consumer Spending'] },

  // ========== AUTO ANCILLARIES (Steel + rubber + crude derivatives) ==========
  'MOTHERSON': { sector: 'Auto Ancillary', industry: 'Auto Components', relatedSectors: ['Automobile'], macroFactors: ['Crude Oil Prices', 'USD-INR', 'Steel Prices', 'Global Demand'] },
  'BOSCHLTD': { sector: 'Auto Ancillary', industry: 'Auto Components', relatedSectors: ['Automobile'], macroFactors: ['Crude Oil Prices', 'Steel Prices'] },
  'BALKRISIND': { sector: 'Auto Ancillary', industry: 'Tyre Manufacturer', relatedSectors: ['Automobile'], macroFactors: ['Crude Oil Prices', 'Commodity Prices', 'USD-INR'] },
  'MRF': { sector: 'Auto Ancillary', industry: 'Tyre Manufacturer', relatedSectors: ['Automobile'], macroFactors: ['Crude Oil Prices', 'Commodity Prices', 'Consumer Spending'] },
  'APOLLOTYRE': { sector: 'Auto Ancillary', industry: 'Tyre Manufacturer', relatedSectors: ['Automobile'], macroFactors: ['Crude Oil Prices', 'Commodity Prices'] },
  'CEATLTD': { sector: 'Auto Ancillary', industry: 'Tyre Manufacturer', relatedSectors: ['Automobile'], macroFactors: ['Crude Oil Prices', 'Commodity Prices'] },

  // ========== PHARMACEUTICALS ==========
  'SUNPHARMA': { sector: 'Healthcare', industry: 'Pharmaceuticals', relatedSectors: ['Healthcare'], macroFactors: ['USD-INR', 'US FDA', 'Drug Pricing', 'R&D'] },
  'DRREDDY': { sector: 'Healthcare', industry: 'Pharmaceuticals', relatedSectors: ['Healthcare'], macroFactors: ['USD-INR', 'US FDA', 'Drug Pricing', 'R&D'] },
  'CIPLA': { sector: 'Healthcare', industry: 'Pharmaceuticals', relatedSectors: ['Healthcare'], macroFactors: ['USD-INR', 'US FDA', 'Drug Pricing', 'Generic Competition'] },
  'DIVISLAB': { sector: 'Healthcare', industry: 'API Manufacturer', relatedSectors: ['Healthcare', 'Chemicals'], macroFactors: ['USD-INR', 'US FDA', 'China Demand'] },
  'BIOCON': { sector: 'Healthcare', industry: 'Biopharmaceuticals', relatedSectors: ['Healthcare'], macroFactors: ['USD-INR', 'US FDA', 'R&D'] },
  'LUPIN': { sector: 'Healthcare', industry: 'Pharmaceuticals', relatedSectors: ['Healthcare'], macroFactors: ['USD-INR', 'US FDA', 'Drug Pricing'] },
  'AUROPHARMA': { sector: 'Healthcare', industry: 'Pharmaceuticals', relatedSectors: ['Healthcare'], macroFactors: ['USD-INR', 'US FDA', 'Drug Pricing'] },
  'TORNTPHARM': { sector: 'Healthcare', industry: 'Pharmaceuticals', relatedSectors: ['Healthcare'], macroFactors: ['USD-INR', 'Drug Pricing'] },
  'APOLLOHOSP': { sector: 'Healthcare', industry: 'Hospitals', relatedSectors: ['Healthcare'], macroFactors: ['Consumer Spending', 'Insurance Penetration', 'Medical Tourism'] },
  'MAXHEALTH': { sector: 'Healthcare', industry: 'Hospitals', relatedSectors: ['Healthcare'], macroFactors: ['Consumer Spending', 'Insurance Penetration'] },

  // ========== METALS & MINING ==========
  'TATASTEEL': { sector: 'Metals', industry: 'Steel', relatedSectors: ['Metals', 'Mining'], macroFactors: ['Steel Prices', 'China Demand', 'Infrastructure Spending', 'Iron Ore Prices'] },
  'JSWSTEEL': { sector: 'Metals', industry: 'Steel', relatedSectors: ['Metals', 'Mining'], macroFactors: ['Steel Prices', 'China Demand', 'Infrastructure Spending'] },
  'HINDALCO': { sector: 'Metals', industry: 'Aluminum', relatedSectors: ['Metals'], macroFactors: ['Aluminum Prices', 'Energy Costs', 'Global Demand', 'China Demand'] },
  'VEDL': { sector: 'Metals', industry: 'Diversified Metals', relatedSectors: ['Metals', 'Mining'], macroFactors: ['Commodity Prices', 'China Demand', 'Global Growth'] },
  'NATIONALUM': { sector: 'Metals', industry: 'Aluminum', relatedSectors: ['Metals'], macroFactors: ['Aluminum Prices', 'Energy Costs', 'Government Policy'] },
  'NMDC': { sector: 'Metals', industry: 'Mining', relatedSectors: ['Metals', 'Mining'], macroFactors: ['Iron Ore Prices', 'China Demand', 'Steel Prices'] },
  'COALINDIA': { sector: 'Metals', industry: 'Mining', subsector: 'Coal', relatedSectors: ['Metals', 'Mining', 'Power'], macroFactors: ['Energy Costs', 'Government Policy', 'Commodity Prices'] },
  'SAIL': { sector: 'Metals', industry: 'Steel', relatedSectors: ['Metals'], macroFactors: ['Steel Prices', 'China Demand', 'Infrastructure Spending', 'Government Policy'] },

  // ========== CHEMICALS (Crude-feedstock heavy!) ==========
  'PIDILITIND': { sector: 'Chemicals', industry: 'Specialty Chemicals', relatedSectors: ['Chemicals', 'Construction'], macroFactors: ['Crude Oil Prices', 'Real Estate Demand', 'Commodity Prices'] },
  'UPL': { sector: 'Chemicals', industry: 'Agrochemicals', relatedSectors: ['Chemicals', 'Agriculture'], macroFactors: ['Crude Oil Prices', 'Monsoon', 'Commodity Prices', 'USD-INR'] },
  'SRF': { sector: 'Chemicals', industry: 'Specialty Chemicals', relatedSectors: ['Chemicals'], macroFactors: ['Crude Oil Prices', 'USD-INR', 'Global Demand'] },
  'ATUL': { sector: 'Chemicals', industry: 'Specialty Chemicals', relatedSectors: ['Chemicals'], macroFactors: ['Crude Oil Prices', 'USD-INR', 'Global Demand'] },
  'DEEPAKNTR': { sector: 'Chemicals', industry: 'Specialty Chemicals', relatedSectors: ['Chemicals'], macroFactors: ['Crude Oil Prices', 'Commodity Prices', 'Global Demand'] },
  'CLEAN': { sector: 'Chemicals', industry: 'Specialty Chemicals', relatedSectors: ['Chemicals'], macroFactors: ['Crude Oil Prices', 'Commodity Prices'] },

  // ========== FMCG ==========
  'HINDUNILVR': { sector: 'FMCG', industry: 'Consumer Goods', relatedSectors: ['FMCG', 'Retail'], macroFactors: ['Rural Demand', 'Monsoon', 'Commodity Prices', 'Crude Oil Prices'] },
  'ITC': { sector: 'FMCG', industry: 'Diversified FMCG', relatedSectors: ['FMCG', 'Hospitality'], macroFactors: ['Tobacco Regulation', 'GST', 'Rural Demand'] },
  'NESTLEIND': { sector: 'FMCG', industry: 'Food Products', relatedSectors: ['FMCG'], macroFactors: ['Commodity Prices', 'Rural Demand', 'Crude Oil Prices'] },
  'BRITANNIA': { sector: 'FMCG', industry: 'Food Products', relatedSectors: ['FMCG'], macroFactors: ['Commodity Prices', 'Rural Demand', 'Crude Oil Prices'] },
  'DABUR': { sector: 'FMCG', industry: 'Consumer Goods', relatedSectors: ['FMCG'], macroFactors: ['Rural Demand', 'Monsoon', 'Commodity Prices'] },
  'MARICO': { sector: 'FMCG', industry: 'Consumer Goods', relatedSectors: ['FMCG'], macroFactors: ['Commodity Prices', 'Rural Demand', 'Crude Oil Prices'] },
  'GODREJCP': { sector: 'FMCG', industry: 'Consumer Goods', relatedSectors: ['FMCG'], macroFactors: ['Commodity Prices', 'Rural Demand'] },
  'COLPAL': { sector: 'FMCG', industry: 'Personal Care', relatedSectors: ['FMCG'], macroFactors: ['Commodity Prices', 'Consumer Spending'] },
  'TATACONSUM': { sector: 'FMCG', industry: 'Food & Beverages', relatedSectors: ['FMCG'], macroFactors: ['Commodity Prices', 'Rural Demand'] },
  'UNITDSPR': { sector: 'FMCG', industry: 'Alcoholic Beverages', relatedSectors: ['FMCG'], macroFactors: ['Consumer Spending', 'GST'] },

  // ========== TELECOM ==========
  'BHARTIARTL': { sector: 'Telecom', industry: 'Telecom Services', relatedSectors: ['Telecom', 'Technology'], macroFactors: ['5G Rollout', 'ARPU', 'Spectrum Pricing', 'Competition'] },
  'IDEA': { sector: 'Telecom', industry: 'Telecom Services', relatedSectors: ['Telecom'], macroFactors: ['5G Rollout', 'ARPU', 'Debt Levels', 'Competition'] },

  // ========== POWER & UTILITIES ==========
  'NTPC': { sector: 'Power', industry: 'Power Generation', relatedSectors: ['Power', 'Energy'], macroFactors: ['Crude Oil Prices', 'Government Policy', 'Infrastructure Spending', 'Energy Costs'] },
  'POWERGRID': { sector: 'Power', industry: 'Power Transmission', relatedSectors: ['Power'], macroFactors: ['Government Policy', 'Infrastructure Spending'] },
  'TATAPOWER': { sector: 'Power', industry: 'Power Generation', relatedSectors: ['Power', 'Renewable Energy'], macroFactors: ['Crude Oil Prices', 'Government Policy', 'Green Energy'] },
  'ADANIGREEN': { sector: 'Power', industry: 'Renewable Energy', relatedSectors: ['Power', 'Renewable Energy'], macroFactors: ['Government Policy', 'Green Energy', 'Interest Rates'] },
  'NHPC': { sector: 'Power', industry: 'Hydropower', relatedSectors: ['Power'], macroFactors: ['Government Policy', 'Monsoon', 'Infrastructure Spending'] },
  'ADANIENSOL': { sector: 'Power', industry: 'Power Distribution', relatedSectors: ['Power'], macroFactors: ['Government Policy', 'Infrastructure Spending'] },

  // ========== INFRASTRUCTURE & CONSTRUCTION ==========
  'LT': { sector: 'Infrastructure', industry: 'EPC & Construction', relatedSectors: ['Infrastructure', 'Capital Goods'], macroFactors: ['Interest Rates', 'Government Policy', 'Infrastructure Spending', 'Steel Prices'] },
  'ADANIENT': { sector: 'Infrastructure', industry: 'Diversified Infrastructure', relatedSectors: ['Infrastructure', 'Energy', 'Logistics'], macroFactors: ['Government Policy', 'Infrastructure Spending', 'Interest Rates'] },
  'ADANIPORTS': { sector: 'Infrastructure', industry: 'Ports & Logistics', relatedSectors: ['Infrastructure', 'Logistics'], macroFactors: ['Crude Oil Prices', 'USD-INR', 'Global Trade'] },
  'ULTRACEMCO': { sector: 'Infrastructure', industry: 'Cement', relatedSectors: ['Infrastructure', 'Construction'], macroFactors: ['Infrastructure Spending', 'Real Estate Demand', 'Crude Oil Prices', 'Energy Costs'] },
  'SHREECEM': { sector: 'Infrastructure', industry: 'Cement', relatedSectors: ['Infrastructure', 'Construction'], macroFactors: ['Infrastructure Spending', 'Real Estate Demand', 'Energy Costs'] },
  'AMBUJACEM': { sector: 'Infrastructure', industry: 'Cement', relatedSectors: ['Infrastructure', 'Construction'], macroFactors: ['Infrastructure Spending', 'Real Estate Demand', 'Energy Costs'] },
  'ACC': { sector: 'Infrastructure', industry: 'Cement', relatedSectors: ['Infrastructure', 'Construction'], macroFactors: ['Infrastructure Spending', 'Real Estate Demand', 'Energy Costs'] },
  'IRCTC': { sector: 'Infrastructure', industry: 'Railways', relatedSectors: ['Infrastructure', 'Tourism'], macroFactors: ['Government Policy', 'Consumer Spending', 'Infrastructure Spending'] },

  // ========== LOGISTICS (Diesel costs = crude impact!) ==========
  'DELHIVERY': { sector: 'Logistics', industry: 'Express Logistics', relatedSectors: ['Logistics', 'E-commerce'], macroFactors: ['Crude Oil Prices', 'Consumer Spending', 'E-commerce Growth'] },
  'CONCOR': { sector: 'Logistics', industry: 'Container Logistics', relatedSectors: ['Logistics', 'Infrastructure'], macroFactors: ['Crude Oil Prices', 'Global Trade', 'Infrastructure Spending'] },
  'BLUEDART': { sector: 'Logistics', industry: 'Express Logistics', relatedSectors: ['Logistics'], macroFactors: ['Crude Oil Prices', 'Consumer Spending', 'E-commerce Growth'] },

  // ========== REAL ESTATE ==========
  'DLF': { sector: 'Real Estate', industry: 'Real Estate Development', relatedSectors: ['Real Estate', 'Infrastructure'], macroFactors: ['Interest Rates', 'Real Estate Demand', 'Government Policy', 'FDI'] },
  'GODREJPROP': { sector: 'Real Estate', industry: 'Real Estate Development', relatedSectors: ['Real Estate'], macroFactors: ['Interest Rates', 'Real Estate Demand', 'Consumer Spending'] },
  'OBEROIRLTY': { sector: 'Real Estate', industry: 'Real Estate Development', relatedSectors: ['Real Estate'], macroFactors: ['Interest Rates', 'Real Estate Demand'] },
  'PRESTIGE': { sector: 'Real Estate', industry: 'Real Estate Development', relatedSectors: ['Real Estate'], macroFactors: ['Interest Rates', 'Real Estate Demand'] },
  'LODHA': { sector: 'Real Estate', industry: 'Real Estate Development', relatedSectors: ['Real Estate'], macroFactors: ['Interest Rates', 'Real Estate Demand', 'Consumer Spending'] },
  'PHOENIXLTD': { sector: 'Real Estate', industry: 'Commercial Real Estate', relatedSectors: ['Real Estate', 'Retail'], macroFactors: ['Interest Rates', 'Consumer Spending'] },

  // ========== CAPITAL GOODS & INDUSTRIALS ==========
  'SIEMENS': { sector: 'Capital Goods', industry: 'Electrical Equipment', relatedSectors: ['Capital Goods', 'Infrastructure'], macroFactors: ['Infrastructure Spending', 'Government Policy', 'Global Demand'] },
  'ABB': { sector: 'Capital Goods', industry: 'Electrical Equipment', relatedSectors: ['Capital Goods', 'Infrastructure'], macroFactors: ['Infrastructure Spending', 'Government Policy'] },
  'HAVELLS': { sector: 'Capital Goods', industry: 'Consumer Electricals', relatedSectors: ['Capital Goods', 'Consumer Durables'], macroFactors: ['Consumer Spending', 'Real Estate Demand', 'Commodity Prices'] },
  'VOLTAS': { sector: 'Capital Goods', industry: 'Consumer Electricals', relatedSectors: ['Capital Goods', 'Consumer Durables'], macroFactors: ['Consumer Spending', 'Commodity Prices'] },
  'BEL': { sector: 'Capital Goods', industry: 'Defence Electronics', relatedSectors: ['Capital Goods', 'Defence'], macroFactors: ['Government Policy', 'Defence Spending'] },
  'HAL': { sector: 'Capital Goods', industry: 'Defence & Aerospace', relatedSectors: ['Capital Goods', 'Defence'], macroFactors: ['Government Policy', 'Defence Spending', 'USD-INR'] },
  'BHEL': { sector: 'Capital Goods', industry: 'Heavy Electricals', relatedSectors: ['Capital Goods', 'Power'], macroFactors: ['Government Policy', 'Infrastructure Spending', 'Power Demand'] },
  'CUMMINSIND': { sector: 'Capital Goods', industry: 'Industrial Equipment', relatedSectors: ['Capital Goods'], macroFactors: ['Infrastructure Spending', 'Crude Oil Prices', 'USD-INR'] },

  // ========== CONSUMER DURABLES ==========
  'TITAN': { sector: 'Consumer Durables', industry: 'Jewellery & Watches', relatedSectors: ['Consumer Durables', 'Retail'], macroFactors: ['Commodity Prices', 'Consumer Spending', 'Rural Demand'] },
  'PAGEIND': { sector: 'Consumer Durables', industry: 'Textiles & Apparel', relatedSectors: ['Consumer Durables'], macroFactors: ['Consumer Spending', 'Commodity Prices'] },
  'DIXON': { sector: 'Consumer Durables', industry: 'Electronics Manufacturing', relatedSectors: ['Consumer Durables', 'Technology'], macroFactors: ['USD-INR', 'Consumer Spending', 'Government Policy'] },
  'WHIRLPOOL': { sector: 'Consumer Durables', industry: 'Home Appliances', relatedSectors: ['Consumer Durables'], macroFactors: ['Consumer Spending', 'Commodity Prices', 'Real Estate Demand'] },
  'CROMPTON': { sector: 'Consumer Durables', industry: 'Consumer Electricals', relatedSectors: ['Consumer Durables'], macroFactors: ['Consumer Spending', 'Commodity Prices'] },

  // ========== RETAIL & E-COMMERCE ==========
  'DMART': { sector: 'Retail', industry: 'Retail', relatedSectors: ['FMCG', 'Retail'], macroFactors: ['Consumer Spending', 'Commodity Prices', 'Rural Demand'] },
  'TRENT': { sector: 'Retail', industry: 'Fashion Retail', relatedSectors: ['Retail'], macroFactors: ['Consumer Spending'] },
  'NYKAA': { sector: 'Retail', industry: 'Beauty & Fashion', relatedSectors: ['Retail', 'E-commerce'], macroFactors: ['Consumer Spending', 'E-commerce Growth'] },
  'ZOMATO': { sector: 'Retail', industry: 'Food Delivery', relatedSectors: ['Retail', 'E-commerce', 'Technology'], macroFactors: ['Consumer Spending', 'Crude Oil Prices'] },

  // ========== CEMENT (Energy-intensive — crude/coal impact!) ==========
  // (Additional cement stocks beyond those in Infrastructure)
  'RAMCOCEM': { sector: 'Infrastructure', industry: 'Cement', relatedSectors: ['Infrastructure', 'Construction'], macroFactors: ['Infrastructure Spending', 'Real Estate Demand', 'Energy Costs', 'Crude Oil Prices'] },
  'JKCEMENT': { sector: 'Infrastructure', industry: 'Cement', relatedSectors: ['Infrastructure', 'Construction'], macroFactors: ['Infrastructure Spending', 'Real Estate Demand', 'Energy Costs'] },

  // ========== FERTILIZERS ==========
  'CHAMBLFERT': { sector: 'Fertilizers', industry: 'Fertilizers', relatedSectors: ['Chemicals', 'Agriculture'], macroFactors: ['Government Policy', 'Monsoon', 'Crude Oil Prices', 'Commodity Prices'] },
  'COROMANDEL': { sector: 'Fertilizers', industry: 'Fertilizers', relatedSectors: ['Chemicals', 'Agriculture'], macroFactors: ['Government Policy', 'Monsoon', 'Commodity Prices'] },
  'GNFC': { sector: 'Fertilizers', industry: 'Fertilizers & Chemicals', relatedSectors: ['Chemicals', 'Agriculture'], macroFactors: ['Government Policy', 'Monsoon', 'Crude Oil Prices'] },
  'RCF': { sector: 'Fertilizers', industry: 'Fertilizers', relatedSectors: ['Chemicals', 'Agriculture'], macroFactors: ['Government Policy', 'Monsoon', 'Crude Oil Prices', 'Commodity Prices'] },
  'NFL': { sector: 'Fertilizers', industry: 'Fertilizers', relatedSectors: ['Chemicals', 'Agriculture'], macroFactors: ['Government Policy', 'Monsoon'] },
  'DEEPAKFERT': { sector: 'Fertilizers', industry: 'Fertilizers & Chemicals', relatedSectors: ['Chemicals'], macroFactors: ['Crude Oil Prices', 'Government Policy', 'Commodity Prices'] },

  // ========== DEFENCE ==========
  'MAZAGON': { sector: 'Defence', industry: 'Shipbuilding', relatedSectors: ['Defence'], macroFactors: ['Defence Spending', 'Government Policy', 'Geopolitics'] },
  'COCHINSHIP': { sector: 'Defence', industry: 'Shipbuilding', relatedSectors: ['Defence'], macroFactors: ['Defence Spending', 'Government Policy'] },
  'SOLARINDS': { sector: 'Defence', industry: 'Defence Components', relatedSectors: ['Capital Goods', 'Defence'], macroFactors: ['Defence Spending', 'Government Policy'] },

  // ========== HOTELS & HOSPITALITY ==========
  'INDHOTEL': { sector: 'Hotels', industry: 'Hotels & Resorts', relatedSectors: ['Tourism', 'Consumer Spending'], macroFactors: ['Consumer Spending', 'Tourism', 'USD-INR'] },
  'ITCHOTELS': { sector: 'Hotels', industry: 'Hotels & Resorts', relatedSectors: ['Tourism', 'FMCG'], macroFactors: ['Consumer Spending', 'Tourism'] },
  'LEMONTRE': { sector: 'Hotels', industry: 'Hotels', relatedSectors: ['Tourism'], macroFactors: ['Consumer Spending', 'Tourism'] },
  'CHALET': { sector: 'Hotels', industry: 'Hotels & Resorts', relatedSectors: ['Tourism'], macroFactors: ['Consumer Spending', 'Tourism', 'USD-INR'] },

  // ========== TRAVEL & TOURISM ==========
  'EASEMYTRIP': { sector: 'Travel', industry: 'Online Travel', relatedSectors: ['Tourism', 'E-commerce'], macroFactors: ['Consumer Spending', 'Tourism', 'Crude Oil Prices'] },
  'THOMASCOOK': { sector: 'Travel', industry: 'Travel Services', relatedSectors: ['Tourism'], macroFactors: ['Consumer Spending', 'Tourism', 'USD-INR'] },
  'YATRA': { sector: 'Travel', industry: 'Online Travel', relatedSectors: ['Tourism', 'E-commerce'], macroFactors: ['Consumer Spending', 'Tourism'] },
};

// Sector-specific news keywords
export const SECTOR_NEWS_KEYWORDS: Record<string, string[]> = {
  'Banking': ['banking sector', 'PSU banks', 'private banks', 'NPA', 'credit growth', 'bank recap', 'FDI banks', 'RBI banks'],
  'IT': ['IT sector', 'software services', 'tech industry', 'digital transformation', 'IT hiring', 'H1B visa', 'offshore development'],
  'Energy': ['oil sector', 'gas sector', 'crude oil', 'petroleum', 'energy sector', 'OPEC', 'refining'],
  'Automobile': ['auto sector', 'automobile industry', 'car sales', 'vehicle sales', 'EV', 'electric vehicles', 'auto components'],
  'Auto Ancillary': ['tyre sector', 'auto components', 'auto ancillary', 'tyre prices', 'rubber prices'],
  'Healthcare': ['pharma sector', 'pharmaceutical industry', 'drug pricing', 'FDA approval', 'healthcare sector', 'hospital sector'],
  'Metals': ['steel sector', 'metal prices', 'steel prices', 'aluminum sector', 'mining sector', 'commodity metals', 'coal sector'],
  'FMCG': ['FMCG sector', 'consumer goods', 'rural demand', 'consumer sentiment', 'FMCG growth'],
  'Telecom': ['telecom sector', 'telco', '5G', 'spectrum auction', 'ARPU', 'telecom operators'],
  'Financial Services': ['NBFC', 'financial services', 'lending', 'fintech', 'housing finance', 'gold loans'],
  'Insurance': ['insurance sector', 'life insurance', 'general insurance', 'insurance penetration'],
  'Paints': ['paint sector', 'paint industry', 'raw material costs', 'TiO2 prices', 'paint companies'],
  'Aviation': ['aviation sector', 'airline industry', 'jet fuel', 'ATF prices', 'air travel', 'domestic flights'],
  'Chemicals': ['chemical sector', 'specialty chemicals', 'agrochemicals', 'chemical prices', 'petrochemicals'],
  'Infrastructure': ['infrastructure sector', 'construction', 'cement sector', 'highways', 'real estate construction', 'capex cycle'],
  'Real Estate': ['real estate sector', 'housing demand', 'property prices', 'RERA', 'home sales', 'office space'],
  'Power': ['power sector', 'electricity demand', 'renewable energy', 'solar energy', 'wind energy', 'thermal power'],
  'Logistics': ['logistics sector', 'freight rates', 'diesel prices', 'e-commerce delivery', 'warehousing'],
  'Capital Goods': ['capital goods', 'defence sector', 'defence orders', 'industrial equipment', 'capex'],
  'Consumer Durables': ['consumer durables', 'jewellery demand', 'gold demand', 'electronics manufacturing'],
  'Retail': ['retail sector', 'consumer spending', 'e-commerce', 'food delivery', 'quick commerce'],
  'Fertilizers': ['fertilizer sector', 'urea prices', 'subsidy', 'DAP prices', 'agri inputs', 'kharif season', 'rabi season'],
  'Defence': ['defence sector', 'defence orders', 'defence budget', 'HAL', 'BEL', 'military spending', 'Make in India defence'],
  'Hotels': ['hotel sector', 'hospitality industry', 'hotel occupancy', 'tourism revenue', 'hotel bookings'],
  'Travel': ['travel sector', 'tourism industry', 'air travel', 'railway bookings', 'foreign tourist arrivals'],
};

// Macro factors and their affected sectors
export const MACRO_IMPACT_MAP: Record<string, string[]> = {
  'RBI Policy': ['Banking', 'Financial Services', 'Real Estate', 'Automobile', 'Insurance'],
  'Interest Rates': ['Banking', 'Financial Services', 'Real Estate', 'Automobile', 'FMCG', 'Infrastructure', 'Power'],
  'Crude Oil Prices': ['Energy', 'Automobile', 'Aviation', 'Paints', 'Logistics', 'Chemicals', 'Auto Ancillary', 'FMCG', 'Infrastructure', 'Power'],
  'USD-INR': ['IT', 'Healthcare', 'Energy', 'Metals', 'Chemicals', 'Auto Ancillary', 'Capital Goods'],
  'Government Policy': ['Banking', 'Energy', 'Infrastructure', 'Telecom', 'Power', 'Capital Goods', 'Real Estate', 'Defence', 'Fertilizers'],
  'FDI': ['Banking', 'Retail', 'Insurance', 'Real Estate'],
  'Monsoon': ['FMCG', 'Automobile', 'Agriculture', 'Power', 'Fertilizers'],
  'China Demand': ['Metals', 'Energy', 'Chemicals'],
  'Global Tech': ['IT', 'Technology', 'Consumer Durables'],
  'Steel Prices': ['Metals', 'Automobile', 'Infrastructure', 'Capital Goods'],
  'Commodity Prices': ['FMCG', 'Energy', 'Metals', 'Chemicals', 'Paints', 'Consumer Durables', 'Auto Ancillary'],
  'Infrastructure Spending': ['Infrastructure', 'Metals', 'Capital Goods', 'Power', 'Logistics'],
  'Real Estate Demand': ['Real Estate', 'Infrastructure', 'Paints', 'Consumer Durables', 'Capital Goods'],
  'Consumer Spending': ['FMCG', 'Automobile', 'Retail', 'Consumer Durables', 'Aviation', 'Hotels', 'Travel'],
  'Defence Spending': ['Capital Goods', 'Defence'],
  'Geopolitics': ['Defence', 'Energy', 'Metals', 'Aviation'],
  'Tourism': ['Hotels', 'Travel', 'Aviation'],
  'Energy Costs': ['Metals', 'Infrastructure', 'Power', 'Chemicals', 'Fertilizers'],
  'E-commerce Growth': ['Logistics', 'Retail', 'Travel'],
  'Insurance Penetration': ['Insurance', 'Healthcare'],
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

// ============================================================================
// SECOND-ORDER EFFECTS ENGINE
// ============================================================================

export interface SecondOrderEffect {
  trigger: string           // What caused this effect
  direction: 'UP' | 'DOWN'  // Direction of the trigger
  affected: string           // Sector or stock type affected
  impact: number             // -100 to +100
  reasoning: string          // Human-readable explanation
  order: 1 | 2               // 1st or 2nd order effect
}

/**
 * Second-order effects mapping.
 * Key = macro factor, Value = { UP: effects when rising, DOWN: effects when falling }
 *
 * First-order: Direct, obvious impact
 * Second-order: Indirect, non-obvious impact (the edge)
 */
export const SECOND_ORDER_RULES: Record<string, {
  UP: { direct: SecondOrderEffect[], secondOrder: SecondOrderEffect[] }
  DOWN: { direct: SecondOrderEffect[], secondOrder: SecondOrderEffect[] }
}> = {
  'Crude Oil Prices': {
    UP: {
      direct: [
        { trigger: 'Crude Oil Prices', direction: 'UP', affected: 'Oil Marketing (BPCL, IOC, HPCL)', impact: -50, reasoning: 'Higher input costs squeeze refining margins', order: 1 },
        { trigger: 'Crude Oil Prices', direction: 'UP', affected: 'Airlines (INDIGO, SPICEJET)', impact: -60, reasoning: 'Fuel is 40% of airline costs', order: 1 },
        { trigger: 'Crude Oil Prices', direction: 'UP', affected: 'Exploration (ONGC, Oil India)', impact: 40, reasoning: 'Higher realization per barrel', order: 1 },
        { trigger: 'Crude Oil Prices', direction: 'UP', affected: 'Paints (ASIANPAINT, BERGEPAINT)', impact: -35, reasoning: 'Crude derivatives are key raw materials', order: 1 },
      ],
      secondOrder: [
        { trigger: 'Crude Oil Prices', direction: 'UP', affected: 'FMCG (HUL, DABUR)', impact: -20, reasoning: 'Higher transport/packaging costs erode margins', order: 2 },
        { trigger: 'Crude Oil Prices', direction: 'UP', affected: 'Auto (MARUTI, TATAMOTORS)', impact: -25, reasoning: 'Higher fuel costs reduce demand for ICE vehicles', order: 2 },
        { trigger: 'Crude Oil Prices', direction: 'UP', affected: 'EV/Battery (TATAELXSI, TATAMOTORS EV)', impact: 15, reasoning: 'Expensive petrol accelerates EV adoption', order: 2 },
        { trigger: 'Crude Oil Prices', direction: 'UP', affected: 'Fertilizers (NFL, RCF)', impact: -30, reasoning: 'Natural gas prices correlated — higher input costs', order: 2 },
        { trigger: 'Crude Oil Prices', direction: 'UP', affected: 'Government fiscal (PSU Banks)', impact: -15, reasoning: 'Oil subsidy burden → fiscal deficit → crowding out', order: 2 },
      ],
    },
    DOWN: {
      direct: [
        { trigger: 'Crude Oil Prices', direction: 'DOWN', affected: 'Oil Marketing (BPCL, IOC)', impact: 40, reasoning: 'Lower input costs, inventory gains', order: 1 },
        { trigger: 'Crude Oil Prices', direction: 'DOWN', affected: 'Airlines (INDIGO)', impact: 50, reasoning: 'Major cost reduction', order: 1 },
        { trigger: 'Crude Oil Prices', direction: 'DOWN', affected: 'Exploration (ONGC)', impact: -40, reasoning: 'Lower realization per barrel', order: 1 },
      ],
      secondOrder: [
        { trigger: 'Crude Oil Prices', direction: 'DOWN', affected: 'Auto (MARUTI)', impact: 20, reasoning: 'Lower fuel costs boost vehicle demand', order: 2 },
        { trigger: 'Crude Oil Prices', direction: 'DOWN', affected: 'Current account deficit', impact: 15, reasoning: 'India imports 85% of oil — lower CAD → stronger rupee', order: 2 },
      ],
    },
  },

  'USD-INR': {
    UP: { // Rupee weakening (USD strengthening)
      direct: [
        { trigger: 'USD-INR', direction: 'UP', affected: 'IT Services (TCS, INFY, WIPRO)', impact: 35, reasoning: 'Revenue in USD, costs in INR — margin expansion', order: 1 },
        { trigger: 'USD-INR', direction: 'UP', affected: 'Pharma exports (SUNPHARMA, DRREDDY)', impact: 30, reasoning: 'Export revenue boost from weak rupee', order: 1 },
        { trigger: 'USD-INR', direction: 'UP', affected: 'Oil importers (IOC, BPCL)', impact: -35, reasoning: 'Oil priced in USD — higher import bill', order: 1 },
      ],
      secondOrder: [
        { trigger: 'USD-INR', direction: 'UP', affected: 'Foreign debt companies', impact: -25, reasoning: 'FCCBs and ECBs become more expensive to service', order: 2 },
        { trigger: 'USD-INR', direction: 'UP', affected: 'FII flows', impact: -20, reasoning: 'Weak rupee discourages FII investment', order: 2 },
        { trigger: 'USD-INR', direction: 'UP', affected: 'Domestic consumption (FMCG)', impact: -10, reasoning: 'Import inflation passes through to consumer prices', order: 2 },
      ],
    },
    DOWN: { // Rupee strengthening
      direct: [
        { trigger: 'USD-INR', direction: 'DOWN', affected: 'IT Services (TCS, INFY)', impact: -30, reasoning: 'Export revenue drops in INR terms', order: 1 },
        { trigger: 'USD-INR', direction: 'DOWN', affected: 'Oil importers (IOC, BPCL)', impact: 25, reasoning: 'Lower import bill for crude', order: 1 },
      ],
      secondOrder: [
        { trigger: 'USD-INR', direction: 'DOWN', affected: 'FII flows', impact: 20, reasoning: 'Strong rupee attracts FII investment', order: 2 },
        { trigger: 'USD-INR', direction: 'DOWN', affected: 'Importers (electronics, capital goods)', impact: 20, reasoning: 'Cheaper imports, better margins', order: 2 },
      ],
    },
  },

  'Interest Rates': {
    UP: { // Rate hike
      direct: [
        { trigger: 'Interest Rates', direction: 'UP', affected: 'PSU Banks (SBI, PNB)', impact: 25, reasoning: 'Higher NIM (net interest margin) from rate hikes', order: 1 },
        { trigger: 'Interest Rates', direction: 'UP', affected: 'Real Estate (DLF, GODREJPROP)', impact: -40, reasoning: 'Higher EMIs reduce housing demand', order: 1 },
        { trigger: 'Interest Rates', direction: 'UP', affected: 'NBFCs (BAJFINANCE, HDFC)', impact: -20, reasoning: 'Higher borrowing costs, asset quality pressure', order: 1 },
      ],
      secondOrder: [
        { trigger: 'Interest Rates', direction: 'UP', affected: 'Auto (MARUTI, M&M)', impact: -25, reasoning: 'Higher auto loan EMIs reduce vehicle demand', order: 2 },
        { trigger: 'Interest Rates', direction: 'UP', affected: 'FMCG (HUL, ITC)', impact: -10, reasoning: 'Consumer spending drops as EMIs rise', order: 2 },
        { trigger: 'Interest Rates', direction: 'UP', affected: 'IT Services (defensive play)', impact: 10, reasoning: 'Low-debt sector, becomes defensive haven', order: 2 },
        { trigger: 'Interest Rates', direction: 'UP', affected: 'Infrastructure (L&T)', impact: -30, reasoning: 'Project financing becomes expensive', order: 2 },
      ],
    },
    DOWN: { // Rate cut
      direct: [
        { trigger: 'Interest Rates', direction: 'DOWN', affected: 'Real Estate (DLF, GODREJPROP)', impact: 40, reasoning: 'Lower EMIs boost housing demand', order: 1 },
        { trigger: 'Interest Rates', direction: 'DOWN', affected: 'NBFCs (BAJFINANCE)', impact: 30, reasoning: 'Lower borrowing costs, credit growth', order: 1 },
      ],
      secondOrder: [
        { trigger: 'Interest Rates', direction: 'DOWN', affected: 'Auto (MARUTI)', impact: 25, reasoning: 'Cheaper auto loans boost demand', order: 2 },
        { trigger: 'Interest Rates', direction: 'DOWN', affected: 'Infrastructure (L&T)', impact: 25, reasoning: 'Cheaper project financing', order: 2 },
        { trigger: 'Interest Rates', direction: 'DOWN', affected: 'PSU Banks (SBI, PNB)', impact: -15, reasoning: 'NIM compression in low-rate environment', order: 2 },
      ],
    },
  },

  'US Interest Rates': {
    UP: { // Fed hike
      direct: [
        { trigger: 'US Interest Rates', direction: 'UP', affected: 'FII-heavy stocks (broad market)', impact: -30, reasoning: 'Higher US yields attract capital away from EM', order: 1 },
      ],
      secondOrder: [
        { trigger: 'US Interest Rates', direction: 'UP', affected: 'IT Services (TCS, INFY)', impact: -20, reasoning: 'US rate hikes → US recession risk → lower IT spending', order: 2 },
        { trigger: 'US Interest Rates', direction: 'UP', affected: 'Real Estate/NBFC', impact: -15, reasoning: 'FII selling → INR weakening → RBI forced to hike', order: 2 },
        { trigger: 'US Interest Rates', direction: 'UP', affected: 'PSU Banks', impact: 10, reasoning: 'If RBI follows with hikes, bank NIMs improve', order: 2 },
      ],
    },
    DOWN: { // Fed cut
      direct: [
        { trigger: 'US Interest Rates', direction: 'DOWN', affected: 'FII-heavy stocks (broad market)', impact: 30, reasoning: 'Lower US yields → capital flows to EM for returns', order: 1 },
      ],
      secondOrder: [
        { trigger: 'US Interest Rates', direction: 'DOWN', affected: 'IT Services (TCS, INFY)', impact: 15, reasoning: 'US rate cuts → US economic recovery → higher IT spending', order: 2 },
        { trigger: 'US Interest Rates', direction: 'DOWN', affected: 'Real Estate/NBFC', impact: 15, reasoning: 'FII buying → INR strengthening → RBI room to cut too', order: 2 },
      ],
    },
  },

  'China Demand': {
    DOWN: { // China slowdown
      direct: [
        { trigger: 'China Demand', direction: 'DOWN', affected: 'Metals (TATASTEEL, HINDALCO)', impact: -40, reasoning: 'China is largest metals consumer — demand collapse', order: 1 },
      ],
      secondOrder: [
        { trigger: 'China Demand', direction: 'DOWN', affected: 'Chinese steel dumping → Indian steel', impact: -30, reasoning: 'Excess Chinese steel floods global markets at low prices', order: 2 },
        { trigger: 'China Demand', direction: 'DOWN', affected: 'Chemicals (AARTI, ATUL)', impact: 15, reasoning: 'China+1 strategy → Indian chemical exports benefit', order: 2 },
        { trigger: 'China Demand', direction: 'DOWN', affected: 'Electronics manufacturing', impact: 15, reasoning: 'Supply chain diversification benefits Indian manufacturers', order: 2 },
      ],
    },
    UP: { // China recovery
      direct: [
        { trigger: 'China Demand', direction: 'UP', affected: 'Metals (TATASTEEL, HINDALCO, VEDL)', impact: 35, reasoning: 'Higher commodity demand, price recovery', order: 1 },
      ],
      secondOrder: [
        { trigger: 'China Demand', direction: 'UP', affected: 'Crude Oil', impact: -10, reasoning: 'China recovery → higher oil demand → import bill up', order: 2 },
      ],
    },
  },

  'Global Trade War': {
    UP: { // Escalation
      direct: [
        { trigger: 'Global Trade War', direction: 'UP', affected: 'IT Services (TCS, INFY)', impact: -30, reasoning: 'H1B restrictions, visa issues, client budget cuts', order: 1 },
        { trigger: 'Global Trade War', direction: 'UP', affected: 'Pharma exports (SUNPHARMA)', impact: -25, reasoning: 'Drug pricing pressure, regulatory hurdles', order: 1 },
      ],
      secondOrder: [
        { trigger: 'Global Trade War', direction: 'UP', affected: 'Domestic consumption (FMCG, Retail)', impact: 10, reasoning: 'India turns inward — Make in India benefits', order: 2 },
        { trigger: 'Global Trade War', direction: 'UP', affected: 'Chemicals', impact: 15, reasoning: 'Anti-China tariffs benefit India as alternative source', order: 2 },
        { trigger: 'Global Trade War', direction: 'UP', affected: 'Gold', impact: 20, reasoning: 'Safe-haven demand rises in trade wars', order: 2 },
      ],
    },
    DOWN: { // De-escalation
      direct: [
        { trigger: 'Global Trade War', direction: 'DOWN', affected: 'IT Services (TCS, INFY)', impact: 25, reasoning: 'Better business environment, visa easing', order: 1 },
        { trigger: 'Global Trade War', direction: 'DOWN', affected: 'Pharma exports', impact: 20, reasoning: 'Smoother regulatory path', order: 1 },
      ],
      secondOrder: [],
    },
  },
}

/**
 * Get all second-order effects for a given macro factor and direction.
 */
export function getSecondOrderImpacts(
  macroFactor: string,
  direction: 'UP' | 'DOWN'
): SecondOrderEffect[] {
  const rules = SECOND_ORDER_RULES[macroFactor]
  if (!rules) return []

  const directionRules = rules[direction]
  if (!directionRules) return []

  return [...directionRules.direct, ...directionRules.secondOrder]
}

/**
 * Get only second-order (non-obvious) effects — the "edge" insights.
 */
export function getSecondOrderOnly(
  macroFactor: string,
  direction: 'UP' | 'DOWN'
): SecondOrderEffect[] {
  const rules = SECOND_ORDER_RULES[macroFactor]
  if (!rules) return []

  return rules[direction]?.secondOrder || []
}

/**
 * Get all effects (1st + 2nd order) that impact a specific stock's sector.
 */
export function getEffectsForStock(
  symbol: string,
  macroFactor: string,
  direction: 'UP' | 'DOWN'
): SecondOrderEffect[] {
  const sectorInfo = getSectorInfo(symbol)
  if (!sectorInfo) return []

  const allEffects = getSecondOrderImpacts(macroFactor, direction)

  return allEffects.filter(effect => {
    const affectedLower = effect.affected.toLowerCase()
    // Match by sector name
    if (affectedLower.includes(sectorInfo.sector.toLowerCase())) return true
    // Match by industry
    if (sectorInfo.industry && affectedLower.includes(sectorInfo.industry.toLowerCase())) return true
    // Match by stock symbol
    if (affectedLower.includes(symbol.toLowerCase())) return true
    return false
  })
}

/**
 * Generate human-readable second-order insights for a macro move.
 * Returns strings suitable for UI display or Telegram alerts.
 */
export function formatSecondOrderInsights(
  macroFactor: string,
  direction: 'UP' | 'DOWN',
  magnitude?: number // % change
): string[] {
  const effects = getSecondOrderOnly(macroFactor, direction)

  return effects.map(effect => {
    const emoji = effect.impact > 0 ? '📈' : '📉'
    const impactLabel = effect.impact > 0 ? 'positive' : 'negative'
    const magnitudeStr = magnitude ? ` (${direction === 'UP' ? '+' : ''}${magnitude.toFixed(1)}%)` : ''
    return `${emoji} ${effect.affected}: ${effect.reasoning} [${impactLabel}, ${effect.order === 2 ? '2nd order' : '1st order'}]`
  })
}

