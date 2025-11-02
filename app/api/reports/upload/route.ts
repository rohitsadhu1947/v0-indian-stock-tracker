import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import crypto from 'crypto'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { db } from '@/db'
import { analystReports } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { getAuthenticatedUserId } from '@/lib/auth-helpers'

// Use dynamic import for pdf-parse to avoid build issues
let pdfParse: any = null

async function getPdfParse() {
  if (!pdfParse) {
    pdfParse = (await import('pdf-parse')).default
  }
  return pdfParse
}

// Initialize Gemini AI (you'll add your API key to .env.local)
const genAI = process.env.GEMINI_API_KEY 
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null

// Force Node.js runtime (not Edge)
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    // 1. Check authentication
    const userId = await getAuthenticatedUserId()
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }

    // 2. Get form data
    const formData = await request.formData()
    const file = formData.get('file') as File
    const reportType = formData.get('type') as string || 'STOCK_REPORT'
    const source = formData.get('source') as string || 'HDFC Securities'
    
    if (!file) {
      return NextResponse.json({
        success: false,
        error: 'No file uploaded'
      }, { status: 400 })
    }

    console.log(`📄 Processing report: ${file.name} (${file.size} bytes)`)

    // 3. Save PDF to local storage
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    
    // Generate unique filename
    const hash = crypto.createHash('md5').update(buffer).digest('hex')
    const timestamp = Date.now()
    const fileName = `${hash}-${timestamp}.pdf`
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'reports')
    const filePath = path.join(uploadDir, fileName)
    
    // Ensure directory exists
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true })
    }
    
    // Write file
    await writeFile(filePath, buffer)
    const relativePath = `/uploads/reports/${fileName}`
    
    console.log(`✅ PDF saved: ${relativePath}`)

    // 4. Extract text from PDF
    let fullText = ''
    try {
      const pdf = await getPdfParse()
      const pdfData = await pdf(buffer)
      fullText = pdfData.text
      console.log(`📝 Extracted ${fullText.length} characters from PDF`)
    } catch (error) {
      console.error('Error extracting PDF text:', error)
      return NextResponse.json({
        success: false,
        error: 'Failed to extract text from PDF'
      }, { status: 500 })
    }

    // 5. Parse report using AI (Gemini) or regex
    let structuredData: any = {}
    let sentiment = 'NEUTRAL'
    let sentimentScore = 0
    let confidenceLevel = 0.5
    let summary = ''
    let symbol: string | null = null
    let title = file.name.replace('.pdf', '')

    // Try AI extraction first (if Gemini key is available)
    if (genAI && reportType === 'STOCK_REPORT') {
      try {
        const parsedData = await parseStockReportWithAI(fullText)
        structuredData = parsedData.structuredData
        sentiment = parsedData.sentiment
        sentimentScore = parsedData.sentimentScore
        confidenceLevel = parsedData.confidenceLevel
        summary = parsedData.summary
        symbol = parsedData.symbol
        title = parsedData.title || title
        
        console.log(`🤖 AI parsed: ${symbol} - ${sentiment}`)
      } catch (error) {
        console.error('AI parsing failed, falling back to regex:', error)
      }
    }

    // Fallback: Regex-based parsing for HDFC Securities
    if (!symbol && source === 'HDFC Securities') {
      const regexParsed = parseHDFCReport(fullText)
      structuredData = regexParsed.structuredData
      sentiment = regexParsed.sentiment
      symbol = regexParsed.symbol
      title = regexParsed.title || title
      
      console.log(`🔍 Regex parsed: ${symbol} - ${sentiment}`)
    }

    // 6. Save to database
    const [report] = await db.insert(analystReports).values({
      userId,
      type: reportType,
      symbol: symbol?.toUpperCase() || null,
      title,
      source,
      reportDate: new Date(), // You can extract this from PDF later
      pdfPath: relativePath,
      fullText,
      structuredData,
      sentiment,
      sentimentScore,
      confidenceLevel,
      summary: summary || `${source} report on ${symbol || 'market'}`,
      tags: [],
      isActive: true,
    }).returning()

    console.log(`✅ Report saved to database: ID ${report.id}`)

    return NextResponse.json({
      success: true,
      report: {
        id: report.id,
        symbol: report.symbol,
        title: report.title,
        source: report.source,
        sentiment: report.sentiment,
        summary: report.summary,
        structuredData: report.structuredData,
        pdfPath: report.pdfPath,
      }
    })

  } catch (error: any) {
    console.error('❌ Error uploading report:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to upload report'
    }, { status: 500 })
  }
}

// AI-powered parsing using Gemini
async function parseStockReportWithAI(text: string) {
  if (!genAI) {
    throw new Error('Gemini API key not configured')
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-pro' })

  const prompt = `You are an expert at analyzing Indian stock market analyst reports.

Extract the following information from this analyst report:

1. Stock symbol (e.g., INFY, TCS, RELIANCE)
2. Company name
3. Rating (BUY, ACCUMULATE, HOLD, REDUCE, SELL)
4. Target price (in rupees)
5. Current price (in rupees)
6. Upside percentage
7. Analyst name
8. Key points (3-5 bullet points)
9. Risks (2-3 bullet points)
10. Overall sentiment (BULLISH, NEUTRAL, BEARISH)
11. Report title

Return ONLY a JSON object with this exact structure (no markdown, no extra text):
{
  "symbol": "SYMBOL",
  "companyName": "Company Name",
  "rating": "BUY",
  "targetPrice": 1850,
  "currentPrice": 1650,
  "upside": 12.1,
  "analystName": "Analyst Name",
  "keyPoints": ["Point 1", "Point 2"],
  "risks": ["Risk 1", "Risk 2"],
  "sentiment": "BULLISH",
  "sentimentScore": 0.8,
  "title": "Report Title"
}

Report text:
${text.substring(0, 4000)}

JSON:`;

  const result = await model.generateContent(prompt)
  const response = result.response.text()
  
  // Extract JSON from response
  let jsonStr = response.trim()
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '')
  }
  
  const parsed = JSON.parse(jsonStr)

  return {
    symbol: parsed.symbol,
    title: parsed.title || `${parsed.companyName} - ${parsed.rating}`,
    structuredData: parsed,
    sentiment: parsed.sentiment || 'NEUTRAL',
    sentimentScore: parsed.sentimentScore || 0,
    confidenceLevel: 0.85,
    summary: `${parsed.rating} rating with target of ₹${parsed.targetPrice} (${parsed.upside}% upside). ${parsed.keyPoints[0] || ''}`
  }
}

// Regex-based parsing for HDFC Securities reports
function parseHDFCReport(text: string) {
  let symbol: string | null = null
  let companyName = ''
  let rating = 'HOLD'
  let targetPrice = 0
  let currentPrice = 0
  let keyPoints: string[] = []

  // Extract symbol (common patterns)
  const symbolMatch = text.match(/(?:Stock|Symbol|Company):\s*([A-Z]{2,15})/i) ||
                      text.match(/\b([A-Z]{2,15})\s+(?:Ltd|Limited)\b/)
  if (symbolMatch) {
    symbol = symbolMatch[1]
  }

  // Extract company name
  const companyMatch = text.match(/^([A-Z][a-zA-Z\s&]+(?:Ltd|Limited))/m)
  if (companyMatch) {
    companyName = companyMatch[1].trim()
  }

  // Extract rating
  const ratingMatch = text.match(/(?:Rating|Recommendation):\s*(BUY|ACCUMULATE|HOLD|REDUCE|SELL)/i)
  if (ratingMatch) {
    rating = ratingMatch[1].toUpperCase()
  }

  // Extract target price
  const targetMatch = text.match(/(?:Target Price|TP):\s*₹?\s*([0-9,]+)/i) ||
                      text.match(/(?:Price Target):\s*₹?\s*([0-9,]+)/i)
  if (targetMatch) {
    targetPrice = parseFloat(targetMatch[1].replace(/,/g, ''))
  }

  // Extract current price
  const currentMatch = text.match(/(?:Current Price|CMP):\s*₹?\s*([0-9,]+)/i)
  if (currentMatch) {
    currentPrice = parseFloat(currentMatch[1].replace(/,/g, ''))
  }

  // Calculate upside
  const upside = currentPrice > 0 ? ((targetPrice - currentPrice) / currentPrice) * 100 : 0

  // Determine sentiment
  let sentiment = 'NEUTRAL'
  if (rating === 'BUY' || rating === 'ACCUMULATE') {
    sentiment = 'BULLISH'
  } else if (rating === 'REDUCE' || rating === 'SELL') {
    sentiment = 'BEARISH'
  }

  return {
    symbol,
    title: companyName ? `${companyName} - ${rating}` : `HDFC Securities Report`,
    structuredData: {
      symbol,
      companyName,
      rating,
      targetPrice,
      currentPrice,
      upside: parseFloat(upside.toFixed(2)),
      keyPoints,
    },
    sentiment,
  }
}

// GET endpoint to fetch reports
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId()
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const symbol = searchParams.get('symbol')
    const type = searchParams.get('type')
    const limit = parseInt(searchParams.get('limit') || '10')

    // Build query
    let queryBuilder = db.select().from(analystReports)
      .where(eq(analystReports.userId, userId))
    
    if (symbol) {
      queryBuilder = queryBuilder.where(eq(analystReports.symbol, symbol.toUpperCase()))
    }
    
    if (type) {
      queryBuilder = queryBuilder.where(eq(analystReports.type, type))
    }

    const reports = await queryBuilder
      .orderBy(desc(analystReports.reportDate))
      .limit(limit)

    return NextResponse.json({
      success: true,
      reports
    })

  } catch (error: any) {
    console.error('Error fetching reports:', error)
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}

