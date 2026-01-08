import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { quarterlyFinancials, companyInfo } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

/**
 * POST /api/financials/upload-table
 * 
 * Upload financial data in PIVOTED table format (easier to copy-paste from Screener)
 * 
 * Format:
 * Indicator    Sep '25    Jun '25    Mar '25    ...
 * Total Rev.   18,919.20  20,412     18,043.70  ...
 * Operating Exp. 11,769.20 13,488.60 11,261.80 ...
 * ...
 * 
 * Body: { symbol: string, data: string (tab-separated table) }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { symbol, data } = body
    
    if (!symbol || !data) {
      return NextResponse.json(
        { error: 'symbol and data are required' },
        { status: 400 }
      )
    }
    
    const upperSymbol = symbol.toUpperCase().trim()
    console.log(`📊 Processing pivoted table for ${upperSymbol}...`)
    
    // Parse the table
    const lines = data.trim().split('\n')
    if (lines.length < 2) {
      return NextResponse.json(
        { error: 'Table must have header row and at least one data row' },
        { status: 400 }
      )
    }
    
    // Parse header row to get quarter names
    const headerCells = lines[0].split('\t').map(c => c.trim())
    const quarters = headerCells.slice(1) // Skip "Indicator" column
    
    console.log(`📅 Found ${quarters.length} quarters: ${quarters.slice(0, 4).join(', ')}...`)
    
    // Parse quarter names to get proper quarter/fiscalYear
    const quarterInfo = quarters.map(q => parseQuarterName(q))
    
    // Build a map of indicator -> values
    const indicatorMap: Record<string, (number | null)[]> = {}
    
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split('\t').map(c => c.trim())
      if (cells.length < 2) continue
      
      const indicator = normalizeIndicatorName(cells[0])
      const values = cells.slice(1).map(v => parseNumber(v))
      
      indicatorMap[indicator] = values
    }
    
    console.log(`📋 Parsed indicators: ${Object.keys(indicatorMap).join(', ')}`)
    
    // Insert/update each quarter
    const results = {
      total: quarterInfo.length,
      inserted: 0,
      updated: 0,
      errors: [] as string[]
    }
    
    for (let i = 0; i < quarterInfo.length; i++) {
      const qi = quarterInfo[i]
      if (!qi.quarter || !qi.fiscalYear) {
        results.errors.push(`Could not parse quarter: ${quarters[i]}`)
        continue
      }
      
      try {
        const quarterData = {
          symbol: upperSymbol,
          quarter: qi.quarter,
          fiscalYear: qi.fiscalYear,
          endDate: qi.endDate,
          revenue: indicatorMap['revenue']?.[i] ?? indicatorMap['total_revenue']?.[i] ?? null,
          operatingExpenses: indicatorMap['operating_expenses']?.[i] ?? indicatorMap['op_expenses']?.[i] ?? null,
          operatingProfit: indicatorMap['operating_profit']?.[i] ?? indicatorMap['op_profit']?.[i] ?? null,
          depreciation: indicatorMap['depreciation']?.[i] ?? indicatorMap['depr']?.[i] ?? null,
          interest: indicatorMap['interest']?.[i] ?? null,
          tax: indicatorMap['tax']?.[i] ?? null,
          netProfit: indicatorMap['net_profit']?.[i] ?? indicatorMap['pat']?.[i] ?? null,
          eps: indicatorMap['eps']?.[i] ?? indicatorMap['eps_adj']?.[i] ?? indicatorMap['basic_eps']?.[i] ?? null,
          // Store additional metrics in a way we can use
          profitBeforeTax: indicatorMap['profit_before_tax']?.[i] ?? indicatorMap['pbt']?.[i] ?? null,
          operatingMargin: indicatorMap['operating_profit_margin']?.[i] ?? indicatorMap['opm']?.[i] ?? null,
          dataSource: 'manual',
          updatedAt: new Date()
        }
        
        // Check if exists
        const existing = await db.select()
          .from(quarterlyFinancials)
          .where(and(
            eq(quarterlyFinancials.symbol, upperSymbol),
            eq(quarterlyFinancials.fiscalYear, qi.fiscalYear),
            eq(quarterlyFinancials.quarter, qi.quarter)
          ))
          .limit(1)
        
        if (existing.length > 0) {
          await db.update(quarterlyFinancials)
            .set(quarterData)
            .where(eq(quarterlyFinancials.id, existing[0].id))
          results.updated++
        } else {
          await db.insert(quarterlyFinancials).values(quarterData)
          results.inserted++
        }
        
      } catch (err: any) {
        results.errors.push(`${qi.quarter} ${qi.fiscalYear}: ${err.message}`)
      }
    }
    
    // Update company info
    await updateCompanyInfo(upperSymbol, quarterInfo[0])
    
    console.log(`✅ ${upperSymbol}: ${results.inserted} inserted, ${results.updated} updated`)
    
    return NextResponse.json({
      success: true,
      symbol: upperSymbol,
      results,
      quartersProcessed: quarterInfo.filter(q => q.quarter).map(q => `${q.quarter} ${q.fiscalYear}`)
    })
    
  } catch (error: any) {
    console.error('❌ Upload error:', error)
    return NextResponse.json(
      { error: error.message || 'Upload failed' },
      { status: 500 }
    )
  }
}

/**
 * Parse quarter name like "Sep '25" or "Mar '24" or "Dec '22"
 */
function parseQuarterName(name: string): { quarter: string, fiscalYear: string, endDate: Date } {
  // Match patterns like "Sep '25", "Jun '25", "Mar '25", "Dec '24"
  const match = name.match(/^([A-Za-z]{3})\s*'?(\d{2})$/)
  
  if (!match) {
    return { quarter: '', fiscalYear: '', endDate: new Date() }
  }
  
  const month = match[1].toLowerCase()
  const year = parseInt('20' + match[2])
  
  // Map month to quarter (Indian Fiscal Year: Apr-Mar)
  // Q1: Apr-Jun (months 3-5)
  // Q2: Jul-Sep (months 6-8)  
  // Q3: Oct-Dec (months 9-11)
  // Q4: Jan-Mar (months 0-2)
  
  const monthMap: Record<string, { quarter: string, monthNum: number, fyOffset: number }> = {
    'jan': { quarter: 'Q4', monthNum: 0, fyOffset: 0 },
    'feb': { quarter: 'Q4', monthNum: 1, fyOffset: 0 },
    'mar': { quarter: 'Q4', monthNum: 2, fyOffset: 0 },
    'apr': { quarter: 'Q1', monthNum: 3, fyOffset: 1 },
    'may': { quarter: 'Q1', monthNum: 4, fyOffset: 1 },
    'jun': { quarter: 'Q1', monthNum: 5, fyOffset: 1 },
    'jul': { quarter: 'Q2', monthNum: 6, fyOffset: 1 },
    'aug': { quarter: 'Q2', monthNum: 7, fyOffset: 1 },
    'sep': { quarter: 'Q2', monthNum: 8, fyOffset: 1 },
    'oct': { quarter: 'Q3', monthNum: 9, fyOffset: 1 },
    'nov': { quarter: 'Q3', monthNum: 10, fyOffset: 1 },
    'dec': { quarter: 'Q3', monthNum: 11, fyOffset: 1 }
  }
  
  const info = monthMap[month]
  if (!info) {
    return { quarter: '', fiscalYear: '', endDate: new Date() }
  }
  
  const fiscalYear = `FY${(year + info.fyOffset).toString().slice(-2)}`
  const endDate = new Date(year, info.monthNum + 1, 0) // Last day of month
  
  return {
    quarter: info.quarter,
    fiscalYear,
    endDate
  }
}

/**
 * Normalize indicator names to standard keys
 */
function normalizeIndicatorName(name: string): string {
  const lower = name.toLowerCase()
    .replace(/[%₹,]/g, '')
    .replace(/\s+/g, '_')
    .replace(/\./g, '')
    .trim()
  
  // Map various names to standard keys
  const mappings: Record<string, string> = {
    'total_rev': 'revenue',
    'total_revenue': 'revenue',
    'oper_rev': 'revenue',
    'operating_rev': 'revenue',
    'operating_revenue': 'revenue',
    'operating_exp': 'operating_expenses',
    'op_exp': 'operating_expenses',
    'operating_expenses': 'operating_expenses',
    'operating_profit': 'operating_profit',
    'op_profit': 'operating_profit',
    'operating_profit_margin_': 'operating_profit_margin',
    'opm': 'operating_profit_margin',
    'depr': 'depreciation',
    'depreciation': 'depreciation',
    'interest': 'interest',
    'profit_before_tax': 'profit_before_tax',
    'pbt': 'profit_before_tax',
    'tax': 'tax',
    'net_profit': 'net_profit',
    'pat': 'net_profit',
    'eps_adj_latest': 'eps',
    'eps_adj': 'eps',
    'basic_eps': 'eps',
    'eps': 'eps',
    'basic_eps_ttm': 'eps_ttm',
    'net_profit_ttm': 'net_profit_ttm'
  }
  
  return mappings[lower] || lower
}

/**
 * Parse number from string with commas and percentages
 */
function parseNumber(value: string): number | null {
  if (!value || value === '-' || value === '' || value === 'NA' || value === 'N/A') {
    return null
  }
  
  // Remove commas, percentage signs, and currency symbols
  const cleaned = value.replace(/[,%₹$]/g, '').trim()
  const num = parseFloat(cleaned)
  
  return isNaN(num) ? null : num
}

/**
 * Update company info
 */
async function updateCompanyInfo(symbol: string, latestQuarter: { quarter: string, fiscalYear: string }) {
  try {
    const existing = await db.select()
      .from(companyInfo)
      .where(eq(companyInfo.symbol, symbol))
      .limit(1)
    
    const updates = {
      hasQuarterlyData: true,
      lastQuarterUpdated: `${latestQuarter.quarter}${latestQuarter.fiscalYear}`,
      updatedAt: new Date()
    }
    
    if (existing.length > 0) {
      await db.update(companyInfo)
        .set(updates)
        .where(eq(companyInfo.symbol, symbol))
    } else {
      await db.insert(companyInfo).values({
        symbol,
        companyName: symbol,
        ...updates
      })
    }
  } catch (err) {
    console.error('Failed to update company info:', err)
  }
}
