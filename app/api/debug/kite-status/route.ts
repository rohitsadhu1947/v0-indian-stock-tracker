import { NextRequest, NextResponse } from 'next/server'
import { getBrokerManager, KiteBrokerClient } from '@/lib/broker'

/**
 * GET /api/debug/kite-status
 *
 * Quick debug endpoint to check Kite authentication status
 */
export async function GET(request: NextRequest) {
  try {
    const manager = await getBrokerManager()

    if (!manager.hasConnection()) {
      return NextResponse.json({
        connected: false,
        hasToken: false,
        hasApiKey: !!process.env.KITE_API_KEY,
        message: 'No broker connections available - please login via Kite or connect a broker in settings'
      })
    }

    const client = manager.getClient() as KiteBrokerClient
    const kite = client.getRawClient()

    // Get profile to verify
    const profile = await kite.getProfile()

    // Check F&O for test stocks
    const instruments = await kite.getInstruments('NFO')
    const testStocks = ['IREDA', 'GLOBUSSPR', 'TEJASNET', 'TCS', 'RELIANCE']
    const fnoStatus: Record<string, any> = {}

    for (const sym of testStocks) {
      const options = instruments.filter((i: any) =>
        i.name === sym && (i.instrument_type === 'CE' || i.instrument_type === 'PE')
      )
      const futures = instruments.filter((i: any) =>
        i.name === sym && i.instrument_type === 'FUT'
      )
      fnoStatus[sym] = {
        options: options.length,
        futures: futures.length,
        inFnO: options.length > 0 || futures.length > 0
      }
    }

    return NextResponse.json({
      connected: true,
      profile: {
        userId: profile.user_id,
        userName: profile.user_name,
        email: profile.email
      },
      totalNFOInstruments: instruments.length,
      fnoStatus,
      message: 'Kite connected successfully!'
    })

  } catch (error: any) {
    console.error('Kite status check error:', error)
    return NextResponse.json({
      connected: false,
      error: error.message,
      message: 'Error checking Kite status'
    }, { status: 500 })
  }
}
