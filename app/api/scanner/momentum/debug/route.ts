import { NextRequest, NextResponse } from 'next/server'
import { KiteConnect } from 'kiteconnect'
import { cookies } from 'next/headers'

const KITE_API_KEY = process.env.KITE_API_KEY!

/**
 * GET /api/scanner/momentum/debug
 * 
 * Debug version that tests each step with just 5 stocks
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🔍 DEBUG SCANNER: Starting...')
    
    // 1. Check authentication
    const cookieStore = cookies()
    const accessToken = cookieStore.get('kite_access_token')?.value
    
    if (!accessToken) {
      console.log('❌ DEBUG: No access token')
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }
    
    console.log('✅ DEBUG: Authenticated')
    
    // 2. Initialize Kite Connect
    const kc = new KiteConnect({ api_key: KITE_API_KEY })
    kc.setAccessToken(accessToken)
    
    console.log('✅ DEBUG: Kite initialized')
    
    // 3. Test with just 5 major stocks
    const testStocks = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK']
    
    const instruments = await kc.getInstruments('NSE')
    console.log(`✅ DEBUG: Got ${instruments.length} total instruments`)
    
    const symbolMap = new Map<string, any>()
    for (const inst of instruments) {
      if (inst.instrument_type === 'EQ' && testStocks.includes(inst.tradingsymbol)) {
        symbolMap.set(inst.tradingsymbol, inst)
      }
    }
    
    console.log(`✅ DEBUG: Found ${symbolMap.size} test stocks: ${Array.from(symbolMap.keys()).join(', ')}`)
    
    // 4. Try to get quotes for test stocks
    const quoteSymbols = Array.from(symbolMap.keys()).map(sym => `NSE:${sym}`)
    console.log(`📊 DEBUG: Fetching quotes for: ${quoteSymbols.join(', ')}`)
    
    const quotes = await kc.getQuote(quoteSymbols)
    console.log(`✅ DEBUG: Got ${Object.keys(quotes).length} quotes`)
    
    // 5. Try to get historical data for first stock
    const firstSymbol = testStocks[0]
    const firstInst = symbolMap.get(firstSymbol)
    
    if (firstInst) {
      console.log(`📊 DEBUG: Fetching historical data for ${firstSymbol} (token: ${firstInst.instrument_token})`)
      
      const to = new Date()
      const from = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
      
      try {
        const candles = await kc.getHistoricalData(
          firstInst.instrument_token,
          'day',
          from,
          to
        )
        console.log(`✅ DEBUG: Got ${candles.length} candles for ${firstSymbol}`)
        console.log(`📊 DEBUG: Latest candle: ${JSON.stringify(candles[candles.length - 1])}`)
      } catch (error: any) {
        console.error(`❌ DEBUG: Historical data error: ${error.message}`)
        return NextResponse.json({
          success: false,
          error: `Historical data failed: ${error.message}`,
          hint: 'You may not have historical data API access on your Kite Connect plan'
        }, { status: 500 })
      }
    }
    
    return NextResponse.json({
      success: true,
      debug: {
        authenticated: true,
        instrumentsFound: symbolMap.size,
        quotesFound: Object.keys(quotes).length,
        message: 'Debug scan complete - check server logs for details'
      }
    })
    
  } catch (error: any) {
    console.error('❌ DEBUG ERROR:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Debug scan failed',
      stack: error.stack
    }, { status: 500 })
  }
}

