import { NextRequest, NextResponse } from 'next/server'
import { enhanceSignals, EnhancementContext } from '@/lib/signal-enhancer'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'

/**
 * POST /api/scanner/enhance
 * 
 * Takes momentum signals and adds contextual enhancements
 * WITHOUT modifying the original scores.
 * 
 * Body: { signals: MasterScore[] }
 * Returns: EnhancedSignal[]
 */
export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserIdCompat()
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { signals } = body
    
    if (!signals || !Array.isArray(signals)) {
      return NextResponse.json(
        { error: 'signals array required' },
        { status: 400 }
      )
    }
    
    console.log(`🔧 Enhancing ${signals.length} signals with context...`)
    
    // Build context from our APIs (fetch in parallel)
    // Forward cookies so authenticated APIs work
    const baseUrl = new URL(request.url).origin
    const cookies = request.headers.get('cookie') || ''
    const headers = { cookie: cookies }
    
    const [regimeRes, smartMoneyRes, eventsRes, correlationRes] = await Promise.all([
      fetch(`${baseUrl}/api/market/regime`, { headers }).catch(() => null),
      fetch(`${baseUrl}/api/market/smart-money`, { headers }).catch(() => null),
      fetch(`${baseUrl}/api/market/events`, { headers }).catch(() => null),
      // Only fetch correlation if we have multiple signals
      signals.length > 1 
        ? fetch(`${baseUrl}/api/market/correlation?symbols=${signals.map((s: any) => s.symbol || s.tradingSymbol).join(',')}`, { headers }).catch(() => null)
        : Promise.resolve(null)
    ])
    
    const context: EnhancementContext = {}
    
    // Parse market regime
    if (regimeRes?.ok) {
      try {
        const regimeData = await regimeRes.json()
        if (regimeData.regime) {
          context.marketRegime = {
            regime: regimeData.regime,
            confidence: regimeData.confidence || 0.5,
            positionSizeMultiplier: regimeData.tradingImplications?.positionSizeMultiplier || 1.0
          }
          console.log(`📊 Market Regime: ${regimeData.regime}`)
        } else if (regimeData.error) {
          console.log(`⚠️ Regime API error: ${regimeData.error}`)
        }
      } catch (e) {
        console.log('⚠️ Could not parse regime data')
      }
    } else {
      console.log(`⚠️ Regime fetch failed: ${regimeRes?.status || 'no response'}`)
    }
    
    // Parse smart money
    if (smartMoneyRes?.ok) {
      try {
        const smartMoneyData = await smartMoneyRes.json()
        if (smartMoneyData.analysis) {
          context.smartMoney = {
            fiiTrend: smartMoneyData.analysis.fiiTrend?.trend || 'NEUTRAL',
            diiTrend: smartMoneyData.analysis.diiTrend?.trend || 'NEUTRAL',
            fiiNetValue: smartMoneyData.latest?.fiiNetValue || 0,
            diiNetValue: smartMoneyData.latest?.diiNetValue || 0
          }
          console.log(`🏦 FII: ${context.smartMoney.fiiTrend}, DII: ${context.smartMoney.diiTrend}`)
        }
      } catch (e) {
        console.log('⚠️ Could not parse smart money data')
      }
    }
    
    // Parse upcoming events
    if (eventsRes?.ok) {
      try {
        const eventsData = await eventsRes.json()
        const allEvents = [
          ...(eventsData.today || []),
          ...(eventsData.thisWeek || []),
          ...(eventsData.thisMonth || [])
        ]
        
        const signalSymbols = signals.map((s: any) => 
          (s.symbol || s.tradingSymbol || '').toUpperCase()
        )
        
        // Filter to events for our signals only, dedupe by symbol+eventType+date
        const seen = new Set<string>()
        const relevantEvents = allEvents
          .filter((e: any) => signalSymbols.includes(e.symbol?.toUpperCase()))
          .map((e: any) => {
            const eventDate = new Date(e.eventDate)
            const today = new Date()
            const daysUntil = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
            
            return {
              symbol: e.symbol,
              eventType: e.eventType,
              eventDate: e.eventDate,
              daysUntil: Math.max(0, daysUntil)
            }
          })
          .filter((e: any) => {
            const key = `${e.symbol}-${e.eventType}-${e.eventDate}`
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })
        
        if (relevantEvents.length > 0) {
          context.upcomingEvents = relevantEvents
          console.log(`📅 Found ${relevantEvents.length} upcoming events for selected stocks`)
        }
      } catch (e) {
        console.log('⚠️ Could not parse events data')
      }
    }
    
    // Parse correlations
    if (correlationRes?.ok) {
      try {
        const correlationData = await correlationRes.json()
        if (correlationData.highlyCorrelated) {
          context.correlations = correlationData.highlyCorrelated.map((c: any) => ({
            pair: c.pair,
            correlation: c.correlation
          }))
          console.log(`🔗 Found ${context.correlations?.length || 0} high correlations`)
        }
      } catch (e) {
        console.log('⚠️ Could not parse correlation data')
      }
    }
    
    // Enhance signals with context
    const enhancedSignals = enhanceSignals(signals, context)
    
    // Summary
    const warningCount = enhancedSignals.reduce((sum, s) => sum + s.warnings.length, 0)
    const suggestionCount = enhancedSignals.reduce((sum, s) => sum + s.suggestions.length, 0)
    
    console.log(`✅ Enhancement complete: ${warningCount} warnings, ${suggestionCount} suggestions`)
    
    return NextResponse.json({
      success: true,
      enhancedSignals,
      context: {
        hasRegime: !!context.marketRegime,
        hasSmartMoney: !!context.smartMoney,
        hasEvents: (context.upcomingEvents?.length || 0) > 0,
        hasCorrelations: (context.correlations?.length || 0) > 0
      },
      summary: {
        totalWarnings: warningCount,
        totalSuggestions: suggestionCount,
        highRiskCount: enhancedSignals.filter(s => s.riskLevel === 'HIGH' || s.riskLevel === 'VERY_HIGH').length
      }
    })
    
  } catch (error: any) {
    console.error('❌ Enhancement error:', error)
    return NextResponse.json(
      { error: error.message || 'Enhancement failed' },
      { status: 500 }
    )
  }
}
