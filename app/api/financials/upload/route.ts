import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { quarterlyFinancials, annualFinancials, companyInfo } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'

/**
 * POST /api/financials/upload
 * 
 * Upload quarterly or annual financial data via CSV
 * 
 * CSV Format for Quarterly:
 * symbol,quarter,fiscal_year,end_date,revenue,op_expenses,op_profit,depreciation,interest,tax,net_profit,eps
 * TCS,Q2,FY26,2025-09-30,64259,46334,17925,1234,156,4521,12380,33.8
 * 
 * CSV Format for Annual:
 * symbol,fiscal_year,end_date,revenue,op_expenses,op_profit,depreciation,interest,tax,net_profit,eps,book_value,roe,roce,op_margin,debt_equity
 * TCS,FY25,2025-03-31,240000,180000,60000,5000,1000,15000,44000,120,450,45,35,25,0.1
 */
export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserIdCompat()
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const dataType = formData.get('type') as string // 'quarterly' or 'annual'
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      )
    }
    
    if (!dataType || !['quarterly', 'annual'].includes(dataType)) {
      return NextResponse.json(
        { error: 'Invalid type. Must be "quarterly" or "annual"' },
        { status: 400 }
      )
    }
    
    const text = await file.text()
    const lines = text.trim().split('\n')
    
    if (lines.length < 2) {
      return NextResponse.json(
        { error: 'CSV must have header row and at least one data row' },
        { status: 400 }
      )
    }
    
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
    const results = {
      total: 0,
      inserted: 0,
      updated: 0,
      errors: [] as string[]
    }
    
    console.log(`📊 Processing ${dataType} financial data...`)
    console.log(`📋 Headers: ${headers.join(', ')}`)
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      
      const values = parseCSVLine(line)
      
      if (values.length !== headers.length) {
        results.errors.push(`Row ${i + 1}: Column count mismatch (expected ${headers.length}, got ${values.length})`)
        continue
      }
      
      const row: Record<string, string> = {}
      headers.forEach((header, idx) => {
        row[header] = values[idx]
      })
      
      try {
        if (dataType === 'quarterly') {
          await upsertQuarterlyData(row)
        } else {
          await upsertAnnualData(row)
        }
        results.inserted++
      } catch (err: any) {
        results.errors.push(`Row ${i + 1} (${row.symbol}): ${err.message}`)
      }
      
      results.total++
    }
    
    console.log(`✅ Upload complete: ${results.inserted}/${results.total} records processed`)
    
    return NextResponse.json({
      success: true,
      results
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
 * Parse CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false
  
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  values.push(current.trim())
  
  return values
}

/**
 * Parse number, handling commas and empty values
 */
function parseNumber(value: string): number | null {
  if (!value || value === '' || value === '-') return null
  // Remove commas and parse
  const cleaned = value.replace(/,/g, '')
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

/**
 * Parse date from various formats
 */
function parseDate(value: string): Date {
  // Handle formats like: 2025-09-30, Sep25, Sep '25, 30-Sep-2025
  if (!value) return new Date()
  
  // ISO format
  if (value.includes('-') && value.length === 10) {
    return new Date(value)
  }
  
  // Short format like "Sep25" or "Sep '25"
  const shortMatch = value.match(/^([A-Za-z]{3})\s*'?(\d{2})$/)
  if (shortMatch) {
    const month = shortMatch[1]
    const year = parseInt('20' + shortMatch[2])
    const monthMap: Record<string, number> = {
      'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
      'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
    }
    const monthNum = monthMap[month.toLowerCase()]
    if (monthNum !== undefined) {
      // Use last day of month
      return new Date(year, monthNum + 1, 0)
    }
  }
  
  return new Date(value)
}

/**
 * Convert quarter format (Sep25 -> Q2, FY26)
 */
function parseQuarterFromDate(dateStr: string): { quarter: string, fiscalYear: string } {
  const date = parseDate(dateStr)
  const month = date.getMonth() // 0-11
  const year = date.getFullYear()
  
  // Indian fiscal year: Apr-Mar
  // Q1: Apr-Jun (months 3-5)
  // Q2: Jul-Sep (months 6-8)
  // Q3: Oct-Dec (months 9-11)
  // Q4: Jan-Mar (months 0-2)
  
  let quarter: string
  let fiscalYear: string
  
  if (month >= 3 && month <= 5) {
    quarter = 'Q1'
    fiscalYear = `FY${(year + 1).toString().slice(-2)}`
  } else if (month >= 6 && month <= 8) {
    quarter = 'Q2'
    fiscalYear = `FY${(year + 1).toString().slice(-2)}`
  } else if (month >= 9 && month <= 11) {
    quarter = 'Q3'
    fiscalYear = `FY${(year + 1).toString().slice(-2)}`
  } else {
    quarter = 'Q4'
    fiscalYear = `FY${year.toString().slice(-2)}`
  }
  
  return { quarter, fiscalYear }
}

/**
 * Upsert quarterly financial data
 */
async function upsertQuarterlyData(row: Record<string, string>) {
  const symbol = row.symbol?.toUpperCase()
  if (!symbol) throw new Error('Symbol is required')
  
  // Determine quarter from various possible inputs
  let quarter = row.quarter
  let fiscalYear = row.fiscal_year || row.fiscalyear
  let endDate: Date
  
  // If we have end_date, derive quarter from it
  if (row.end_date || row.enddate) {
    endDate = parseDate(row.end_date || row.enddate)
    if (!quarter || !fiscalYear) {
      const parsed = parseQuarterFromDate(row.end_date || row.enddate)
      quarter = quarter || parsed.quarter
      fiscalYear = fiscalYear || parsed.fiscalYear
    }
  } else {
    // Derive end_date from quarter/fiscal year
    const quarterMonthEnd: Record<string, number> = {
      'Q1': 5, // June
      'Q2': 8, // September
      'Q3': 11, // December
      'Q4': 2 // March
    }
    const fyYear = parseInt('20' + fiscalYear.replace(/[^0-9]/g, ''))
    const month = quarterMonthEnd[quarter]
    const year = quarter === 'Q4' ? fyYear : fyYear - 1
    endDate = new Date(year, month + 1, 0) // Last day of month
  }
  
  const data = {
    symbol,
    quarter,
    fiscalYear,
    endDate,
    revenue: parseNumber(row.revenue || row.oper_rev || row.operating_revenue),
    operatingExpenses: parseNumber(row.op_expenses || row.operating_expenses),
    operatingProfit: parseNumber(row.op_profit || row.operating_profit),
    depreciation: parseNumber(row.depreciation),
    interest: parseNumber(row.interest),
    tax: parseNumber(row.tax),
    netProfit: parseNumber(row.net_profit || row.netprofit || row.pat),
    eps: parseNumber(row.eps),
    dataSource: 'manual',
    updatedAt: new Date()
  }
  
  // Check if exists
  const existing = await db.select()
    .from(quarterlyFinancials)
    .where(and(
      eq(quarterlyFinancials.symbol, symbol),
      eq(quarterlyFinancials.fiscalYear, fiscalYear),
      eq(quarterlyFinancials.quarter, quarter)
    ))
    .limit(1)
  
  if (existing.length > 0) {
    await db.update(quarterlyFinancials)
      .set(data)
      .where(eq(quarterlyFinancials.id, existing[0].id))
    console.log(`📝 Updated ${symbol} ${quarter} ${fiscalYear}`)
  } else {
    await db.insert(quarterlyFinancials).values(data)
    console.log(`➕ Inserted ${symbol} ${quarter} ${fiscalYear}`)
  }
  
  // Update company info
  await updateCompanyInfo(symbol, 'quarterly', `${quarter}${fiscalYear}`)
}

/**
 * Upsert annual financial data
 */
async function upsertAnnualData(row: Record<string, string>) {
  const symbol = row.symbol?.toUpperCase()
  if (!symbol) throw new Error('Symbol is required')
  
  let fiscalYear = row.fiscal_year || row.fiscalyear || row.year
  let endDate: Date
  
  // Parse fiscal year (formats: FY25, FY2025, 2025, Mar '25)
  if (fiscalYear.match(/^(Mar|mar)/)) {
    const yearMatch = fiscalYear.match(/\d{2,4}/)
    if (yearMatch) {
      const year = yearMatch[0].length === 2 ? '20' + yearMatch[0] : yearMatch[0]
      fiscalYear = `FY${year.slice(-2)}`
      endDate = new Date(parseInt(year), 2, 31) // March 31
    } else {
      endDate = new Date()
    }
  } else if (fiscalYear.match(/^\d{4}$/)) {
    fiscalYear = `FY${fiscalYear.slice(-2)}`
    endDate = new Date(parseInt(row.fiscal_year || row.year), 2, 31)
  } else if (row.end_date) {
    endDate = parseDate(row.end_date)
  } else {
    const fyYear = parseInt('20' + fiscalYear.replace(/[^0-9]/g, ''))
    endDate = new Date(fyYear, 2, 31) // March 31
  }
  
  const data = {
    symbol,
    fiscalYear,
    endDate,
    revenue: parseNumber(row.revenue || row.total_revenue),
    operatingExpenses: parseNumber(row.op_expenses || row.operating_expenses),
    operatingProfit: parseNumber(row.op_profit || row.operating_profit),
    depreciation: parseNumber(row.depreciation),
    interest: parseNumber(row.interest),
    tax: parseNumber(row.tax),
    netProfit: parseNumber(row.net_profit || row.netprofit || row.pat),
    eps: parseNumber(row.eps),
    bookValue: parseNumber(row.book_value || row.bookvalue),
    roe: parseNumber(row.roe),
    roce: parseNumber(row.roce),
    operatingMargin: parseNumber(row.op_margin || row.operating_margin),
    debtToEquity: parseNumber(row.debt_equity || row.debt_to_equity),
    cashFromOperations: parseNumber(row.cfo || row.cash_from_operations),
    cashFromInvesting: parseNumber(row.cfi || row.cash_from_investing),
    cashFromFinancing: parseNumber(row.cff || row.cash_from_financing),
    netCashFlow: parseNumber(row.net_cash_flow),
    dataSource: 'manual',
    updatedAt: new Date()
  }
  
  // Check if exists
  const existing = await db.select()
    .from(annualFinancials)
    .where(and(
      eq(annualFinancials.symbol, symbol),
      eq(annualFinancials.fiscalYear, fiscalYear)
    ))
    .limit(1)
  
  if (existing.length > 0) {
    await db.update(annualFinancials)
      .set(data)
      .where(eq(annualFinancials.id, existing[0].id))
    console.log(`📝 Updated ${symbol} ${fiscalYear} annual`)
  } else {
    await db.insert(annualFinancials).values(data)
    console.log(`➕ Inserted ${symbol} ${fiscalYear} annual`)
  }
  
  // Update company info
  await updateCompanyInfo(symbol, 'annual', fiscalYear)
}

/**
 * Update company info record
 */
async function updateCompanyInfo(symbol: string, dataType: 'quarterly' | 'annual', period: string) {
  const existing = await db.select()
    .from(companyInfo)
    .where(eq(companyInfo.symbol, symbol))
    .limit(1)
  
  if (existing.length > 0) {
    const updates: any = { updatedAt: new Date() }
    if (dataType === 'quarterly') {
      updates.hasQuarterlyData = true
      updates.lastQuarterUpdated = period
    } else {
      updates.hasAnnualData = true
    }
    
    await db.update(companyInfo)
      .set(updates)
      .where(eq(companyInfo.symbol, symbol))
  } else {
    await db.insert(companyInfo).values({
      symbol,
      companyName: symbol, // Will be updated with proper name later
      hasQuarterlyData: dataType === 'quarterly',
      hasAnnualData: dataType === 'annual',
      lastQuarterUpdated: dataType === 'quarterly' ? period : null
    })
  }
}

/**
 * GET /api/financials/upload
 * 
 * Get upload status and template
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const action = searchParams.get('action')
  
  if (action === 'template') {
    // Return CSV templates
    const quarterlyTemplate = `symbol,quarter,fiscal_year,end_date,revenue,op_expenses,op_profit,depreciation,interest,tax,net_profit,eps
TCS,Q2,FY26,2025-09-30,64259,46334,17925,1234,156,4521,12380,33.8
TCS,Q1,FY26,2025-06-30,62613,45243,17370,1200,150,4400,12040,32.9`

    const annualTemplate = `symbol,fiscal_year,end_date,revenue,op_expenses,op_profit,depreciation,interest,tax,net_profit,eps,book_value,roe,roce,op_margin,debt_equity
TCS,FY25,2025-03-31,240000,180000,60000,5000,1000,15000,44000,120,450,45,35,25,0.1`

    return NextResponse.json({
      success: true,
      templates: {
        quarterly: quarterlyTemplate,
        annual: annualTemplate
      },
      instructions: {
        quarterly: [
          'symbol: Stock symbol (e.g., TCS, RELIANCE)',
          'quarter: Q1, Q2, Q3, or Q4',
          'fiscal_year: FY26, FY25, etc.',
          'end_date: Quarter end date (YYYY-MM-DD)',
          'revenue: Operating revenue in Crores',
          'op_expenses: Operating expenses in Crores',
          'op_profit: Operating profit in Crores',
          'depreciation: Depreciation in Crores',
          'interest: Interest expense in Crores',
          'tax: Tax expense in Crores',
          'net_profit: Net profit (PAT) in Crores',
          'eps: Earnings per share'
        ],
        annual: [
          'Same as quarterly plus:',
          'book_value: Book value per share',
          'roe: Return on Equity (%)',
          'roce: Return on Capital Employed (%)',
          'op_margin: Operating margin (%)',
          'debt_equity: Debt to Equity ratio'
        ]
      }
    })
  }
  
  // Return upload status
  try {
    const quarterlyCount = await db.select()
      .from(quarterlyFinancials)
    
    const annualCount = await db.select()
      .from(annualFinancials)
    
    const companies = await db.select()
      .from(companyInfo)
      .where(eq(companyInfo.hasQuarterlyData, true))
    
    return NextResponse.json({
      success: true,
      status: {
        quarterlyRecords: quarterlyCount.length,
        annualRecords: annualCount.length,
        companiesWithData: companies.length,
        companies: companies.map(c => ({
          symbol: c.symbol,
          lastQuarter: c.lastQuarterUpdated
        }))
      }
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      note: 'Database tables may not exist yet. Run: npm run db:push'
    })
  }
}
