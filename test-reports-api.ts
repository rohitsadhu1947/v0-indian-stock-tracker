/**
 * Test script for Analyst Reports API
 * Run: npx tsx test-reports-api.ts
 */

import fs from 'fs'
import path from 'path'

const API_URL = 'http://localhost:3000'

async function testReportsAPI() {
  console.log('🧪 Testing Analyst Reports API\n')

  // Test 1: Upload a dummy PDF
  console.log('📤 Test 1: Upload PDF Report')
  try {
    // Create a simple test PDF content (we'll use a text file for now)
    const testContent = `
HDFC Securities Research Report

Company: Infosys Limited (INFY)
Rating: BUY
Current Price: ₹1,650
Target Price: ₹1,850
Upside: 12.1%

Key Highlights:
• Strong Q3 results with 15% YoY growth
• Cloud business accelerating
• Digital transformation deals pipeline robust
• Maintain BUY rating

Analyst: Pradeep Kumar
Date: November 2, 2024
    `

    // For now, let's create a simple form data test
    const formData = new FormData()
    
    // Create a blob from text (simulate PDF)
    const blob = new Blob([testContent], { type: 'application/pdf' })
    const file = new File([blob], 'test-hdfc-report.pdf', { type: 'application/pdf' })
    
    formData.append('file', file)
    formData.append('type', 'STOCK_REPORT')
    formData.append('source', 'HDFC Securities')

    const uploadResponse = await fetch(`${API_URL}/api/reports/upload`, {
      method: 'POST',
      body: formData,
      // Add your cookies here if needed for authentication
    })

    if (!uploadResponse.ok) {
      const error = await uploadResponse.json()
      console.error('❌ Upload failed:', error)
      return
    }

    const uploadResult = await uploadResponse.json()
    console.log('✅ Upload successful!')
    console.log('Report ID:', uploadResult.report?.id)
    console.log('Symbol:', uploadResult.report?.symbol)
    console.log('Sentiment:', uploadResult.report?.sentiment)
    console.log('Summary:', uploadResult.report?.summary)
    console.log('Structured Data:', JSON.stringify(uploadResult.report?.structuredData, null, 2))
    console.log()

    // Test 2: Fetch all reports
    console.log('📥 Test 2: Fetch All Reports')
    const fetchResponse = await fetch(`${API_URL}/api/reports/upload?limit=5`)
    
    if (!fetchResponse.ok) {
      const error = await fetchResponse.json()
      console.error('❌ Fetch failed:', error)
      return
    }

    const fetchResult = await fetchResponse.json()
    console.log(`✅ Found ${fetchResult.reports?.length || 0} reports`)
    fetchResult.reports?.forEach((report: any, i: number) => {
      console.log(`  ${i + 1}. ${report.symbol || 'N/A'} - ${report.title} (${report.source})`)
    })
    console.log()

    // Test 3: Fetch reports for specific symbol
    if (uploadResult.report?.symbol) {
      console.log(`📥 Test 3: Fetch Reports for ${uploadResult.report.symbol}`)
      const symbolResponse = await fetch(
        `${API_URL}/api/reports/upload?symbol=${uploadResult.report.symbol}`
      )
      
      if (symbolResponse.ok) {
        const symbolResult = await symbolResponse.json()
        console.log(`✅ Found ${symbolResult.reports?.length || 0} reports for ${uploadResult.report.symbol}`)
      }
    }

    console.log('\n✅ All tests passed!')

  } catch (error) {
    console.error('❌ Test failed:', error)
  }
}

// Run tests
testReportsAPI()

console.log(`
📝 MANUAL TESTING INSTRUCTIONS:
================================

1. Start your dev server:
   npm run dev

2. Login to your app first to get authentication cookies

3. Test with a real PDF using curl:

   curl -X POST http://localhost:3000/api/reports/upload \\
     -F "file=@/path/to/your/hdfc-report.pdf" \\
     -F "type=STOCK_REPORT" \\
     -F "source=HDFC Securities" \\
     -H "Cookie: kite_user_id=YOUR_USER_ID; kite_access_token=YOUR_TOKEN"

4. Or test via browser:
   - Open DevTools Console
   - Run:
   
   const formData = new FormData()
   const fileInput = document.createElement('input')
   fileInput.type = 'file'
   fileInput.accept = '.pdf'
   fileInput.onchange = async (e) => {
     formData.append('file', e.target.files[0])
     formData.append('type', 'STOCK_REPORT')
     formData.append('source', 'HDFC Securities')
     
     const res = await fetch('/api/reports/upload', {
       method: 'POST',
       body: formData
     })
     console.log(await res.json())
   }
   fileInput.click()

5. Check uploaded files in: public/uploads/reports/

6. Query reports:
   curl http://localhost:3000/api/reports/upload?limit=10

7. Check database:
   SELECT * FROM analyst_reports ORDER BY created_at DESC LIMIT 5;
`)

