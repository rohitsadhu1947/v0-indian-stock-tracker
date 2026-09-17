import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import crypto from 'crypto'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { db } from '@/db'
import { analystReports, users } from '@/db/schema'
import { eq, desc, and } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'
// addServerLog was in the deleted logs route; inline a no-op so call-sites compile
function addServerLog(_msg: string) { console.log(_msg) }

// Use dynamic import for pdf-parse to avoid build issues (v2 API: PDFParse class)
async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  try {
    const result = await parser.getText()
    return result.text
  } finally {
    await parser.destroy()
  }
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
    addServerLog('📥 === NEW UPLOAD REQUEST ===')
    
    // 1. Check authentication
    const userId = await getAuthenticatedUserIdCompat()

    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 })
    }

    // 2. Get form data
    const formData = await request.formData()
    const file = formData.get('file') as File
    const reportType = formData.get('type') as string || 'STOCK_REPORT'
    const source = formData.get('source') as string || 'HDFC Securities'
    
    if (!file) {
      addServerLog('❌ Error: No file uploaded')
      return NextResponse.json({
        success: false,
        error: 'No file uploaded'
      }, { status: 400 })
    }

    addServerLog(`📄 Processing: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`)

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
    
    addServerLog(`✅ PDF saved: ${relativePath}`)

    // 4. Extract text from PDF or text file
    let fullText = ''
    const isTextFile = file.type === 'text/plain' || file.name.endsWith('.txt')
    
    if (isTextFile) {
      // If it's a text file, just read it directly
      fullText = buffer.toString('utf-8')
      addServerLog(`📝 Text file: ${fullText.length} characters`)
    } else {
      // For PDFs, try multiple extraction methods
      
      // Method 1: Try pdf-parse first (fast but sometimes incomplete)
      try {
        fullText = await extractPdfText(buffer)
        addServerLog(`📝 pdf-parse: Extracted ${fullText.length} characters`)
        
        // If we got very little text, the PDF might have images or complex layout
        if (fullText.length < 100) {
          addServerLog('⚠️ Very little text extracted (<100 chars)')
        }
      } catch (error: any) {
        addServerLog(`❌ pdf-parse failed: ${error.message}`)
      }
      
      // Method 2: If Gemini is available and extraction was poor, use Gemini Vision
      if (genAI && fullText.length < 500) {
        addServerLog('🤖 Trying Gemini Vision (text < 500 chars)...')
        try {
          // Use Gemini to read the PDF as an image
          const base64Pdf = buffer.toString('base64')
          const extractedText = await extractTextWithGeminiVision(base64Pdf, buffer)
          
          if (extractedText && extractedText.length > fullText.length) {
            addServerLog(`✅ Gemini Vision: ${extractedText.length} characters`)
            fullText = extractedText
          }
        } catch (error: any) {
          addServerLog(`❌ Gemini Vision failed: ${error.message}`)
        }
      }
      
      // If still no good text, create a placeholder
      if (fullText.length < 50) {
        fullText = `[PDF text extraction incomplete. File saved for manual review: ${file.name}]`
        addServerLog('⚠️ Extraction incomplete, using placeholder')
      }
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
        // If we have text, use it; otherwise, we'll need to handle PDF directly
        if (fullText && fullText.length > 50) {
          addServerLog(`🤖 Parsing with Gemini AI (${fullText.length} chars)...`)
          const parsedData = await parseStockReportWithAI(fullText)
          structuredData = parsedData.structuredData
          sentiment = parsedData.sentiment
          sentimentScore = parsedData.sentimentScore
          confidenceLevel = parsedData.confidenceLevel
          summary = parsedData.summary
          symbol = parsedData.symbol
          title = parsedData.title || title
          
          addServerLog(`✅ AI parsed: ${symbol || 'N/A'} - ${sentiment} - ${structuredData.rating || 'N/A'}`)
        } else {
          addServerLog('⚠️ Text too short (<50 chars), skipping AI')
        }
      } catch (error: any) {
        addServerLog(`❌ AI parsing failed: ${error.message}`)
      }
    } else {
      if (!genAI) {
        addServerLog('⚠️ Gemini API key not configured')
      }
    }

    // Fallback: Regex-based parsing for HDFC Securities
    if (!symbol && source === 'HDFC Securities' && fullText && fullText.length > 50) {
      const regexParsed = parseHDFCReport(fullText)
      structuredData = regexParsed.structuredData
      sentiment = regexParsed.sentiment
      symbol = regexParsed.symbol
      title = regexParsed.title || title
      
      console.log(`🔍 Regex parsed: ${symbol} - ${sentiment}`)
    }
    
    // If still no data extracted, create placeholder
    if (!symbol && !structuredData.rating) {
      console.log('⚠️ Could not extract data, creating placeholder')
      structuredData = {
        note: 'PDF saved but extraction failed. Please add data manually or re-upload with text extraction enabled.',
        fileName: file.name
      }
      title = file.name.replace('.pdf', '')
      summary = `Report uploaded: ${file.name}. Manual review required.`
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

  // Use Gemini 2.5 Flash (latest stable model)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

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

  addServerLog('🤖 Calling Gemini API...')
  const result = await model.generateContent(prompt)
  const response = result.response.text()
  
  addServerLog(`📥 Gemini response received (${response.length} chars)`)
  
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
    summary: `${parsed.rating} rating with target of ₹${parsed.targetPrice} (${parsed.upside}% upside). ${parsed.keyPoints?.[0] || ''}`
  }
}

// Extract text from PDF using Gemini Vision API (for image-based PDFs)
async function extractTextWithGeminiVision(base64Data: string, pdfBuffer: Buffer) {
  if (!genAI) {
    throw new Error('Gemini API key not configured')
  }

  // Use Gemini Pro Vision to read the PDF
  // Note: This is a simplified approach - in production, you'd convert PDF pages to images first
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const prompt = `This is text extracted from a financial analyst report PDF. 
Please extract and return ALL the text content from this document, maintaining the structure and formatting as much as possible.
Focus on extracting: Company name, stock symbol, rating, target price, current price, key highlights, and analyst recommendations.

Return the complete text:`;

  try {
    addServerLog('🤖 Trying Gemini Vision for text extraction...')
    // For now, we'll just use the basic Gemini model
    // In a full implementation, you'd use gemini-pro-vision with converted PDF pages
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Data.substring(0, 100000), // Limit size
          mimeType: 'application/pdf'
        }
      }
    ])
    
    return result.response.text()
  } catch (error) {
    addServerLog('⚠️ Gemini Vision not available or failed, using text-only')
    return ''
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
    const userId = await getAuthenticatedUserIdCompat()

    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const symbol = searchParams.get('symbol')
    const type = searchParams.get('type')
    const limit = parseInt(searchParams.get('limit') || '10')

    // Build query
    const conditions = [eq(analystReports.userId, userId)] as any[]
    if (symbol) {
      conditions.push(eq(analystReports.symbol, symbol.toUpperCase()))
    }
    if (type) {
      conditions.push(eq(analystReports.type, type))
    }
    let queryBuilder = db.select().from(analystReports)
      .where(and(...conditions))

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

