import { NextResponse } from 'next/server'
import { db } from '@/db'
import { quarterlyFinancials, companyInfo } from '@/db/schema'
import { desc, sql } from 'drizzle-orm'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'

/**
 * GET /api/financials/list
 * 
 * Get all stocks with uploaded financial data
 */
export async function GET() {
  const userId = await getAuthenticatedUserIdCompat()
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    // Get distinct symbols with their quarter counts
    const stocksData = await db.select({
      symbol: quarterlyFinancials.symbol,
      quarterCount: sql<number>`COUNT(*)`.as('quarter_count'),
      latestQuarter: sql<string>`MAX(${quarterlyFinancials.quarter} || ' ' || ${quarterlyFinancials.fiscalYear})`.as('latest_quarter'),
      latestUpdate: sql<Date>`MAX(${quarterlyFinancials.updatedAt})`.as('latest_update')
    })
    .from(quarterlyFinancials)
    .groupBy(quarterlyFinancials.symbol)
    .orderBy(desc(sql`latest_update`))

    // Format response
    const stocks = stocksData.map(s => ({
      symbol: s.symbol,
      quarters: [], // Will be populated when details are fetched
      latestQuarter: s.latestQuarter || 'N/A',
      quarterCount: s.quarterCount,
      updatedAt: s.latestUpdate
    }))

    // Get sample quarters for each stock
    for (const stock of stocks) {
      const quarters = await db.select({
        quarter: quarterlyFinancials.quarter,
        fiscalYear: quarterlyFinancials.fiscalYear,
        revenue: quarterlyFinancials.revenue,
        netProfit: quarterlyFinancials.netProfit
      })
      .from(quarterlyFinancials)
      .where(sql`${quarterlyFinancials.symbol} = ${stock.symbol}`)
      .orderBy(desc(quarterlyFinancials.endDate))
      .limit(4)

      stock.quarters = quarters as any
    }

    return NextResponse.json({
      success: true,
      count: stocks.length,
      stocks
    })

  } catch (error: any) {
    console.error('Failed to list financials:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
