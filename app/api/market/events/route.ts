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

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Cache for 1 hour (corporate events don't change frequently)
let cachedEvents: CorporateEvent[] | null = null
let cacheTimestamp: number = 0
const CACHE_DURATION = 60 * 60 * 1000

/**
 * Fetch corporate announcements from BSE
 */
async function fetchBSEAnnouncements(): Promise<CorporateEvent[]> {
  return new Promise((resolve) => {
    const today = new Date()
    const nextMonth = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
    
    const formatDate = (d: Date) => d.toISOString().split('T')[0].split('-').reverse().join('/')
    
    // BSE Corporate Announcements API
    const url = `https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w?strCat=Board%20Meeting&strPrevDate=${formatDate(today)}&strScrip=&strSearch=P&strToDate=${formatDate(nextMonth)}&strType=C`
    
    const timeout = setTimeout(() => {
      console.log('⚠️ BSE announcements request timed out')
      resolve([])
    }, 5000)
    
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
        'Referer': 'https://www.bseindia.com/'
      }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        clearTimeout(timeout)
        try {
          const json = JSON.parse(data)
          if (json.Table && Array.isArray(json.Table)) {
            const events: CorporateEvent[] = json.Table.slice(0, 50).map((item: any, i: number) => {
              // Determine event type from purpose
              const purpose = (item.PURPOSE || item.Purpose || '').toLowerCase()
              let eventType: CorporateEvent['eventType'] = 'BOARD_MEETING'
              
              if (purpose.includes('dividend')) eventType = 'DIVIDEND'
              else if (purpose.includes('result') || purpose.includes('earning')) eventType = 'EARNINGS'
              else if (purpose.includes('split')) eventType = 'SPLIT'
              else if (purpose.includes('bonus')) eventType = 'BONUS'
              else if (purpose.includes('agm')) eventType = 'AGM'
              else if (purpose.includes('egm')) eventType = 'EGM'
              else if (purpose.includes('buyback')) eventType = 'BUYBACK'
              else if (purpose.includes('right')) eventType = 'RIGHTS'
              
              return {
                id: `bse-${item.SCRIP_CD || i}-${Date.now()}`,
                symbol: item.SCRIP_CD || item.scrip_cd || 'UNKNOWN',
                companyName: item.SLONGNAME || item.slongname || item.SCRIP_CD || 'Unknown Company',
                eventType,
                eventDate: parseIndianDate(item.NEWS_DT || item.Meeting_date || new Date().toISOString()),
                details: {
                  description: item.PURPOSE || item.Purpose || item.NEWSSUB || 'Corporate announcement'
                },
                impact: eventType === 'EARNINGS' || eventType === 'DIVIDEND' ? 'HIGH' : 'MEDIUM',
                source: 'BSE',
                createdAt: new Date(),
                updatedAt: new Date()
              }
            })
            resolve(events)
          } else {
            resolve([])
          }
        } catch (e) {
          console.log('⚠️ Failed to parse BSE announcements')
          resolve([])
        }
      })
    })
    
    req.on('error', () => {
      clearTimeout(timeout)
      resolve([])
    })
  })
}

/**
 * Fetch dividend calendar from BSE
 */
async function fetchBSEDividends(): Promise<CorporateEvent[]> {
  return new Promise((resolve) => {
    const today = new Date()
    const nextMonth = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
    
    const formatDate = (d: Date) => d.toISOString().split('T')[0].split('-').reverse().join('/')
    
    const url = `https://api.bseindia.com/BseIndiaAPI/api/DefaultData/w?Atea=&Atea1=&Atea2=&Atea3=&Atea4=&Atea5=&Atea6=&Atea7=&Atea8=&Atea9=&Atea10=&Type=Dividend&flag=0&ddlfromdate=${formatDate(today)}&ddltodate=${formatDate(nextMonth)}`
    
    const timeout = setTimeout(() => {
      resolve([])
    }, 5000)
    
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
        'Referer': 'https://www.bseindia.com/'
      }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        clearTimeout(timeout)
        try {
          const json = JSON.parse(data)
          if (json.Table && Array.isArray(json.Table)) {
            const events: CorporateEvent[] = json.Table.slice(0, 30).map((item: any, i: number) => ({
              id: `div-${item.scrip_cd || i}-${Date.now()}`,
              symbol: item.scrip_cd || 'UNKNOWN',
              companyName: item.long_name || item.scrip_cd || 'Unknown',
              eventType: 'DIVIDEND' as const,
              eventDate: parseIndianDate(item.ex_dt || new Date().toISOString()),
              details: {
                dividendAmount: parseFloat(item.Dividend || 0),
                exDate: parseIndianDate(item.ex_dt),
                recordDate: parseIndianDate(item.rec_dt),
                description: `Dividend: ₹${item.Dividend || 'N/A'} per share`
              },
              impact: 'MEDIUM' as const,
              source: 'BSE',
              createdAt: new Date(),
              updatedAt: new Date()
            }))
            resolve(events)
          } else {
            resolve([])
          }
        } catch (e) {
          resolve([])
        }
      })
    })
    
    req.on('error', () => {
      clearTimeout(timeout)
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
    
    const [bseAnnouncements, bseDividends] = await Promise.all([
      fetchBSEAnnouncements(),
      fetchBSEDividends()
    ])
    
    console.log(`✅ BSE Announcements: ${bseAnnouncements.length}`)
    console.log(`✅ BSE Dividends: ${bseDividends.length}`)
    
    // Combine all events
    let allEvents = [...bseAnnouncements, ...bseDividends]
    
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
      dataSource: bseAnnouncements.length > 0 || bseDividends.length > 0 ? 'BSE' : 'Sample Data'
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
