import { NextRequest, NextResponse } from 'next/server'
import { getUserBrokerManager, KiteBrokerClient } from '@/lib/broker'

/**
 * GET /api/debug/kite-status
 *
 * Quick debug endpoint to check broker authentication status.
 * Kite-specific features (profile, F&O check) only work when Kite is the active broker.
 */
export async function GET(request: NextRequest) {
  try {
    const manager = await getUserBrokerManager()

    if (!manager.hasConnection()) {
      return NextResponse.json({
        connected: false,
        broker: null,
        hasApiKey: !!process.env.KITE_API_KEY,
        message: 'No broker connections available - please login via Kite or connect a broker in settings'
      })
    }

    const client = manager.getClient()

    // Basic info for any broker
    const response: Record<string, any> = {
      connected: client.isConnected(),
      broker: {
        id: client.brokerId,
        name: client.displayName,
      },
      message: `${client.displayName} connected successfully!`
    }

    // Kite-specific: get profile and F&O status
    if (client instanceof KiteBrokerClient) {
      try {
        const kite = client.getRawClient()
        const profile = await kite.getProfile()
        response.profile = {
          userId: profile.user_id,
          userName: profile.user_name,
          email: profile.email,
        }

        // Check F&O for test stocks
        const instruments = await client.getInstruments('NFO')
        const testStocks = ['IREDA', 'GLOBUSSPR', 'TEJASNET', 'TCS', 'RELIANCE']
        const fnoStatus: Record<string, any> = {}

        for (const sym of testStocks) {
          const options = instruments.filter(i =>
            i.name === sym && (i.instrumentType === 'CE' || i.instrumentType === 'PE')
          )
          const futures = instruments.filter(i =>
            i.name === sym && i.instrumentType === 'FUT'
          )
          fnoStatus[sym] = {
            options: options.length,
            futures: futures.length,
            inFnO: options.length > 0 || futures.length > 0
          }
        }

        response.totalNFOInstruments = instruments.length
        response.fnoStatus = fnoStatus
      } catch (profileErr: any) {
        response.profileError = profileErr.message
      }
    }

    return NextResponse.json(response)

  } catch (error: any) {
    console.error('Broker status check error:', error)
    return NextResponse.json({
      connected: false,
      error: error.message,
      message: 'Error checking broker status'
    }, { status: 500 })
  }
}
