import { NextResponse } from 'next/server'
import { analyzeDeliveryPattern } from '@/lib/delivery-analyzer'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const userId = await getAuthenticatedUserIdCompat()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { symbol } = await params
  if (!symbol) {
    return NextResponse.json({ error: 'Symbol required' }, { status: 400 })
  }

  try {
    const analysis = await analyzeDeliveryPattern(symbol.toUpperCase())

    return NextResponse.json({
      symbol: symbol.toUpperCase(),
      ...analysis,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch delivery data', detail: (error as Error).message },
      { status: 500 },
    )
  }
}
