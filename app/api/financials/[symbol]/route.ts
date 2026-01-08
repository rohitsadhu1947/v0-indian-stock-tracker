import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { quarterlyFinancials, annualFinancials, companyInfo } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'

/**
 * DELETE /api/financials/[symbol]
 * 
 * Delete all financial data for a stock
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { symbol: string } }
) {
  try {
    const symbol = params.symbol.toUpperCase()
    
    // Delete quarterly data
    await db.delete(quarterlyFinancials)
      .where(eq(quarterlyFinancials.symbol, symbol))
    
    // Delete annual data  
    await db.delete(annualFinancials)
      .where(eq(annualFinancials.symbol, symbol))
    
    // Delete company info
    await db.delete(companyInfo)
      .where(eq(companyInfo.symbol, symbol))
    
    console.log(`🗑️ Deleted all financial data for ${symbol}`)
    
    return NextResponse.json({
      success: true,
      message: `Deleted all financial data for ${symbol}`
    })
    
  } catch (error: any) {
    console.error('Error deleting financials:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to delete financials'
    }, { status: 500 })
  }
}

/**
 * GET /api/financials/[symbol]
 * 
 * Get all financial data for a stock
 * Returns quarterly and annual data with YoY/QoQ comparisons
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { symbol: string } }
) {
  try {
    const symbol = params.symbol.toUpperCase()
    
    // Get quarterly data (last 8 quarters)
    const quarterly = await db.select()
      .from(quarterlyFinancials)
      .where(eq(quarterlyFinancials.symbol, symbol))
      .orderBy(desc(quarterlyFinancials.endDate))
      .limit(8)
    
    // Get annual data (last 5 years)
    const annual = await db.select()
      .from(annualFinancials)
      .where(eq(annualFinancials.symbol, symbol))
      .orderBy(desc(annualFinancials.endDate))
      .limit(5)
    
    // Get company info
    const company = await db.select()
      .from(companyInfo)
      .where(eq(companyInfo.symbol, symbol))
      .limit(1)
    
    if (quarterly.length === 0 && annual.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No financial data found for this symbol',
        symbol
      }, { status: 404 })
    }
    
    // Calculate growth metrics
    const quarterlyWithGrowth = calculateQuarterlyGrowth(quarterly)
    const annualWithGrowth = calculateAnnualGrowth(annual)
    
    // Get latest quarter analysis
    const latestAnalysis = analyzeLatestQuarter(quarterlyWithGrowth)
    
    return NextResponse.json({
      success: true,
      symbol,
      company: company[0] || null,
      quarterly: quarterlyWithGrowth,
      annual: annualWithGrowth,
      analysis: latestAnalysis,
      dataAvailable: {
        quarters: quarterly.length,
        years: annual.length
      }
    })
    
  } catch (error: any) {
    console.error('Error fetching financials:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch financials'
    }, { status: 500 })
  }
}

/**
 * Calculate QoQ and YoY growth for quarterly data
 */
function calculateQuarterlyGrowth(quarters: any[]) {
  if (quarters.length === 0) return []
  
  return quarters.map((q, idx) => {
    const result = { ...q, growth: {} as any }
    
    // QoQ (vs previous quarter)
    if (idx < quarters.length - 1) {
      const prev = quarters[idx + 1]
      result.growth.qoq = {
        revenue: calculateGrowth(q.revenue, prev.revenue),
        operatingProfit: calculateGrowth(q.operatingProfit, prev.operatingProfit),
        netProfit: calculateGrowth(q.netProfit, prev.netProfit)
      }
    }
    
    // YoY (vs same quarter last year - 4 quarters ago)
    if (idx + 4 < quarters.length) {
      const lastYear = quarters[idx + 4]
      result.growth.yoy = {
        revenue: calculateGrowth(q.revenue, lastYear.revenue),
        operatingProfit: calculateGrowth(q.operatingProfit, lastYear.operatingProfit),
        netProfit: calculateGrowth(q.netProfit, lastYear.netProfit)
      }
    }
    
    return result
  })
}

/**
 * Calculate YoY growth for annual data
 */
function calculateAnnualGrowth(years: any[]) {
  if (years.length === 0) return []
  
  return years.map((y, idx) => {
    const result = { ...y, growth: {} as any }
    
    if (idx < years.length - 1) {
      const prev = years[idx + 1]
      result.growth.yoy = {
        revenue: calculateGrowth(y.revenue, prev.revenue),
        operatingProfit: calculateGrowth(y.operatingProfit, prev.operatingProfit),
        netProfit: calculateGrowth(y.netProfit, prev.netProfit)
      }
    }
    
    return result
  })
}

/**
 * Calculate percentage growth
 */
function calculateGrowth(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

/**
 * Analyze latest quarter performance
 */
function analyzeLatestQuarter(quarters: any[]): any {
  if (quarters.length === 0) return null
  
  const latest = quarters[0]
  const analysis: any = {
    quarter: `${latest.quarter} ${latest.fiscalYear}`,
    metrics: {
      revenue: latest.revenue,
      operatingProfit: latest.operatingProfit,
      netProfit: latest.netProfit,
      operatingMargin: latest.operatingProfit && latest.revenue 
        ? ((latest.operatingProfit / latest.revenue) * 100).toFixed(1)
        : null,
      netMargin: latest.netProfit && latest.revenue
        ? ((latest.netProfit / latest.revenue) * 100).toFixed(1)
        : null
    },
    signals: [],
    verdict: 'NEUTRAL'
  }
  
  // Generate signals based on growth
  if (latest.growth?.yoy) {
    const yoy = latest.growth.yoy
    
    // Revenue growth signals
    if (yoy.revenue !== null) {
      if (yoy.revenue > 20) {
        analysis.signals.push({ type: 'positive', message: `Strong revenue growth: +${yoy.revenue.toFixed(1)}% YoY` })
      } else if (yoy.revenue > 10) {
        analysis.signals.push({ type: 'positive', message: `Healthy revenue growth: +${yoy.revenue.toFixed(1)}% YoY` })
      } else if (yoy.revenue < -10) {
        analysis.signals.push({ type: 'negative', message: `Revenue decline: ${yoy.revenue.toFixed(1)}% YoY` })
      } else if (yoy.revenue < 0) {
        analysis.signals.push({ type: 'warning', message: `Slight revenue decline: ${yoy.revenue.toFixed(1)}% YoY` })
      }
    }
    
    // Profit growth signals
    if (yoy.netProfit !== null) {
      if (yoy.netProfit > 25) {
        analysis.signals.push({ type: 'positive', message: `Excellent profit growth: +${yoy.netProfit.toFixed(1)}% YoY` })
      } else if (yoy.netProfit > 10) {
        analysis.signals.push({ type: 'positive', message: `Good profit growth: +${yoy.netProfit.toFixed(1)}% YoY` })
      } else if (yoy.netProfit < -20) {
        analysis.signals.push({ type: 'negative', message: `Significant profit decline: ${yoy.netProfit.toFixed(1)}% YoY` })
      } else if (yoy.netProfit < 0) {
        analysis.signals.push({ type: 'warning', message: `Profit decline: ${yoy.netProfit.toFixed(1)}% YoY` })
      }
    }
  }
  
  // Margin analysis
  if (analysis.metrics.operatingMargin) {
    const margin = parseFloat(analysis.metrics.operatingMargin)
    if (margin > 25) {
      analysis.signals.push({ type: 'positive', message: `High operating margin: ${margin}%` })
    } else if (margin < 10) {
      analysis.signals.push({ type: 'warning', message: `Low operating margin: ${margin}%` })
    }
  }
  
  // Determine overall verdict
  const positives = analysis.signals.filter((s: any) => s.type === 'positive').length
  const negatives = analysis.signals.filter((s: any) => s.type === 'negative').length
  
  if (positives >= 2 && negatives === 0) {
    analysis.verdict = 'STRONG'
  } else if (positives > negatives) {
    analysis.verdict = 'GOOD'
  } else if (negatives >= 2) {
    analysis.verdict = 'WEAK'
  } else if (negatives > positives) {
    analysis.verdict = 'CONCERNING'
  }
  
  return analysis
}
