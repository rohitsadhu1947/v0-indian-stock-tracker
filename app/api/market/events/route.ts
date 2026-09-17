/**
 * Corporate Events Calendar API
 * GET /api/market/events
 * GET /api/market/events?symbol=RELIANCE
 * GET /api/market/events?watchlist=RELIANCE,TCS,INFY
 * 
 * Fetches corporate events: earnings, dividends, splits, AGMs
 */

import { NextRequest, NextResponse } from 'next/server'
import https from 'https'
import {
  categorizeEvents,
  generateSampleEvents,
  filterWatchlistEvents,
  getTodayAlerts,
  getEventEmoji,
  getEventColor,
  type CorporateEvent
} from '@/lib/event-calendar'
import { getAuthenticatedUserIdCompat } from '@/lib/multi-user-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Cache for 1 hour (corporate events don't change frequently)
let cachedEvents: CorporateEvent[] | null = null
let cacheTimestamp: number = 0
const CACHE_DURATION = 60 * 60 * 1000

/**
 * Fetch board meetings / results calendar from NSE
 */
async function fetchNSEBoardMeetings(): Promise<CorporateEvent[]> {
  return new Promise((resolve) => {
    const url = 'https://www.nseindia.com/api/event-calendar'
    
    const timeout = setTimeout(() => {
      console.log('⚠️ NSE board meetings request timed out')
      resolve([])
    }, 8000)
    
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.nseindia.com/'
      }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        clearTimeout(timeout)
        try {
          const json = JSON.parse(data)
          if (Array.isArray(json) && json.length > 0) {
            console.log(`📊 NSE Event Calendar: ${json.length} events found`)
            
            const events: CorporateEvent[] = json.slice(0, 100).map((item: any, i: number) => {
              // Determine event type from purpose
              const purpose = (item.purpose || item.bm_desc || '').toLowerCase()
              let eventType: CorporateEvent['eventType'] = 'BOARD_MEETING'
              let impact: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM'
              
              if (purpose.includes('financial result') || purpose.includes('quarterly') || purpose.includes('results')) {
                eventType = 'EARNINGS'
                impact = 'HIGH'
              } else if (purpose.includes('dividend')) {
                eventType = 'DIVIDEND'
                impact = 'HIGH'
              } else if (purpose.includes('split') || purpose.includes('sub-division')) {
                eventType = 'SPLIT'
                impact = 'HIGH'
              } else if (purpose.includes('bonus')) {
                eventType = 'BONUS'
                impact = 'HIGH'
              } else if (purpose.includes('agm') || purpose.includes('annual general')) {
                eventType = 'AGM'
              } else if (purpose.includes('egm') || purpose.includes('extraordinary')) {
                eventType = 'EGM'
              } else if (purpose.includes('buyback')) {
                eventType = 'BUYBACK'
                impact = 'HIGH'
              } else if (purpose.includes('right')) {
                eventType = 'RIGHTS'
              } else if (purpose.includes('fund raising') || purpose.includes('preferential')) {
                eventType = 'OTHER'
                impact = 'LOW'
              }
              
              return {
                id: `nse-bm-${item.symbol || i}-${item.date || Date.now()}`,
                symbol: item.symbol || 'UNKNOWN',
                companyName: item.company || item.symbol || 'Unknown Company',
                eventType,
                eventDate: parseIndianDate(item.date),
                details: {
                  description: item.bm_desc || item.purpose || 'Board Meeting',
                  quarter: purpose.includes('q3') ? 'Q3' : purpose.includes('q2') ? 'Q2' : purpose.includes('q1') ? 'Q1' : purpose.includes('q4') ? 'Q4' : undefined
                },
                impact,
                source: 'NSE',
                createdAt: new Date(),
                updatedAt: new Date()
              }
            })
            
            // Filter to only include relevant events (skip fund raising, etc.)
            const relevantEvents = events.filter(e => 
              e.eventType !== 'OTHER' || e.impact === 'HIGH'
            )
            
            resolve(relevantEvents)
          } else {
            resolve([])
          }
        } catch (e) {
          console.log('⚠️ Failed to parse NSE board meetings:', e)
          resolve([])
        }
      })
    })
    
    req.on('error', (err) => {
      clearTimeout(timeout)
      console.log('⚠️ NSE board meetings error:', err.message)
      resolve([])
    })
  })
}

/**
 * Fetch corporate actions (dividends, splits, bonuses) from NSE
 */
async function fetchNSECorporateActions(): Promise<CorporateEvent[]> {
  return new Promise((resolve) => {
    const today = new Date()
    const nextMonth = new Date(today.getTime() + 45 * 24 * 60 * 60 * 1000)
    
    const formatNSEDate = (d: Date) => {
      const day = d.getDate().toString().padStart(2, '0')
      const month = (d.getMonth() + 1).toString().padStart(2, '0')
      const year = d.getFullYear()
      return `${day}-${month}-${year}`
    }
    
    const url = `https://www.nseindia.com/api/corporates-corporateActions?index=equities&from_date=${formatNSEDate(today)}&to_date=${formatNSEDate(nextMonth)}`
    
    const timeout = setTimeout(() => {
      console.log('⚠️ NSE corporate actions request timed out')
      resolve([])
    }, 8000)
    
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.nseindia.com/'
      }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        clearTimeout(timeout)
        try {
          const json = JSON.parse(data)
          if (Array.isArray(json) && json.length > 0) {
            console.log(`📊 NSE Corporate Actions: ${json.length} actions found`)
            
            // Filter out government securities (GS series)
            const equityActions = json.filter((item: any) => 
              item.series === 'EQ' || item.series === 'BE' || item.series === 'SM'
            )
            
            const events: CorporateEvent[] = equityActions.slice(0, 50).map((item: any, i: number) => {
              const subject = (item.subject || '').toLowerCase()
              let eventType: CorporateEvent['eventType'] = 'DIVIDEND'
              let impact: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM'
              
              if (subject.includes('split') || subject.includes('sub-division')) {
                eventType = 'SPLIT'
                impact = 'HIGH'
              } else if (subject.includes('bonus')) {
                eventType = 'BONUS'
                impact = 'HIGH'
              } else if (subject.includes('buyback')) {
                eventType = 'BUYBACK'
                impact = 'HIGH'
              } else if (subject.includes('right')) {
                eventType = 'RIGHTS'
                impact = 'MEDIUM'
              } else if (subject.includes('dividend') || subject.includes('interim') || subject.includes('final')) {
                eventType = 'DIVIDEND'
                impact = 'MEDIUM'
              }
              
              return {
                id: `nse-ca-${item.symbol || i}-${item.exDate || Date.now()}`,
                symbol: item.symbol || 'UNKNOWN',
                companyName: item.comp || item.symbol || 'Unknown Company',
                eventType,
                eventDate: parseIndianDate(item.exDate),
                details: {
                  description: item.subject || 'Corporate Action',
                  exDate: parseIndianDate(item.exDate),
                  recordDate: parseIndianDate(item.recDate),
                  ratio: subject.includes('split') || subject.includes('bonus') 
                    ? item.subject.match(/\d+[:\-]\d+/)?.[0] 
                    : undefined
                },
                impact,
                source: 'NSE',
                createdAt: new Date(),
                updatedAt: new Date()
              }
            })
            
            resolve(events)
          } else {
            resolve([])
          }
        } catch (e) {
          console.log('⚠️ Failed to parse NSE corporate actions:', e)
          resolve([])
        }
      })
    })
    
    req.on('error', (err) => {
      clearTimeout(timeout)
      console.log('⚠️ NSE corporate actions error:', err.message)
      resolve([])
    })
  })
}

/**
 * Parse Indian date format (DD/MM/YYYY or DD-MMM-YYYY) to ISO
 */
function parseIndianDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().split('T')[0]
  
  try {
    // Already ISO format
    if (dateStr.includes('-') && dateStr.length === 10) {
      return dateStr
    }
    
    // DD/MM/YYYY format
    if (dateStr.includes('/')) {
      const [day, month, year] = dateStr.split('/')
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    }
    
    // DD-MMM-YYYY format
    const months: Record<string, string> = {
      'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
      'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
      'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
    }
    
    const parts = dateStr.toLowerCase().split('-')
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0')
      const month = months[parts[1].substring(0, 3)] || '01'
      const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2]
      return `${year}-${month}-${day}`
    }
    
    return new Date(dateStr).toISOString().split('T')[0]
  } catch {
    return new Date().toISOString().split('T')[0]
  }
}

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserIdCompat()
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    console.log('\n📅 === EVENT CALENDAR API CALLED ===')
    
    const searchParams = request.nextUrl.searchParams
    const symbol = searchParams.get('symbol')
    const watchlist = searchParams.get('watchlist')
    const refresh = searchParams.get('refresh') === 'true'
    
    // Check cache (unless refresh requested)
    const now = Date.now()
    if (!refresh && cachedEvents && (now - cacheTimestamp) < CACHE_DURATION) {
      console.log('✅ Using cached event data')
      let events = cachedEvents
      
      // Filter if needed
      if (symbol) {
        events = events.filter(e => e.symbol === symbol.toUpperCase())
      }
      if (watchlist) {
        const symbols = watchlist.split(',').map(s => s.trim().toUpperCase())
        events = filterWatchlistEvents(events, symbols)
      }
      
      const categorized = categorizeEvents(events)
      return NextResponse.json({
        success: true,
        cached: true,
        ...categorized,
        todayAlerts: getTodayAlerts(events)
      })
    }
    
    // Fetch fresh data
    console.log('📊 Fetching corporate events from BSE...')
    
    const [nseBoardMeetings, nseCorporateActions] = await Promise.all([
      fetchNSEBoardMeetings(),
      fetchNSECorporateActions()
    ])
    
    console.log(`✅ NSE Board Meetings: ${nseBoardMeetings.length}`)
    console.log(`✅ NSE Corporate Actions: ${nseCorporateActions.length}`)
    
    // Combine all events
    let allEvents = [...nseBoardMeetings, ...nseCorporateActions]
    
    // If no real data, use sample data
    if (allEvents.length === 0) {
      console.log('⚠️ Using sample events (BSE data unavailable)')
      allEvents = generateSampleEvents()
    }
    
    // Remove duplicates by symbol + date + type
    const seen = new Set<string>()
    allEvents = allEvents.filter(e => {
      const key = `${e.symbol}-${e.eventDate}-${e.eventType}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    
    // Sort by date
    allEvents.sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime())
    
    // Update cache
    cachedEvents = allEvents
    cacheTimestamp = now
    
    console.log(`✅ Total events: ${allEvents.length}`)
    
    // Filter if requested
    let filteredEvents = allEvents
    if (symbol) {
      filteredEvents = allEvents.filter(e => e.symbol === symbol.toUpperCase())
    }
    if (watchlist) {
      const symbols = watchlist.split(',').map(s => s.trim().toUpperCase())
      filteredEvents = filterWatchlistEvents(allEvents, symbols)
    }
    
    // Categorize
    const categorized = categorizeEvents(filteredEvents)
    
    // Add enriched data for UI
    const enrichedEvents = filteredEvents.map(e => ({
      ...e,
      emoji: getEventEmoji(e.eventType),
      color: getEventColor(e.eventType)
    }))
    
    return NextResponse.json({
      success: true,
      cached: false,
      
      // Categorized views
      ...categorized,
      
      // All events (enriched)
      allEvents: enrichedEvents,
      
      // Today's important alerts
      todayAlerts: getTodayAlerts(filteredEvents),
      
      // Metadata
      totalEvents: filteredEvents.length,
      dataSource: nseBoardMeetings.length > 0 || nseCorporateActions.length > 0 ? 'NSE' : 'Sample Data'
    })
    
  } catch (error: any) {
    console.error('❌ Event calendar error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch corporate events',
      details: error.message
    }, { status: 500 })
  }
}
