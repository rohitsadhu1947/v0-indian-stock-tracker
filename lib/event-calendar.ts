/**
 * 📅 EVENT CALENDAR
 * 
 * Tracks important corporate events that can move stock prices:
 * - Earnings announcements (quarterly results)
 * - Dividends (ex-date, record date, payment date)
 * - Stock splits and bonuses
 * - AGMs/EGMs
 * - Rights issues
 * - Buybacks
 * 
 * Why it matters:
 * - Earnings can cause 5-20% moves
 * - Ex-dividend dates affect price
 * - Splits often attract retail interest
 * - AGM dates may have announcements
 */

export type EventType = 
  | 'EARNINGS'
  | 'DIVIDEND'
  | 'SPLIT'
  | 'BONUS'
  | 'AGM'
  | 'EGM'
  | 'RIGHTS'
  | 'BUYBACK'
  | 'BOARD_MEETING'
  | 'OTHER'

export interface CorporateEvent {
  id: string
  symbol: string
  companyName: string
  eventType: EventType
  eventDate: string  // ISO date
  
  // Event-specific details
  details: {
    // For EARNINGS
    quarter?: string  // Q1, Q2, Q3, Q4
    fiscalYear?: string  // FY24, FY25
    expectedEPS?: number
    previousEPS?: number
    
    // For DIVIDEND
    dividendAmount?: number
    dividendType?: 'INTERIM' | 'FINAL' | 'SPECIAL'
    exDate?: string
    recordDate?: string
    paymentDate?: string
    
    // For SPLIT/BONUS
    ratio?: string  // "1:2" means 1 new for every 2 held
    
    // For AGM/EGM
    venue?: string
    time?: string
    
    // General
    description?: string
  }
  
  // Impact assessment
  impact: 'HIGH' | 'MEDIUM' | 'LOW'
  
  // Source
  source: string
  
  // Timestamps
  createdAt: Date
  updatedAt: Date
}

export interface EventCalendarData {
  // Events by timeframe
  today: CorporateEvent[]
  thisWeek: CorporateEvent[]
  nextWeek: CorporateEvent[]
  thisMonth: CorporateEvent[]
  
  // Events by type
  upcomingEarnings: CorporateEvent[]
  upcomingDividends: CorporateEvent[]
  upcomingActions: CorporateEvent[]  // Splits, bonuses, rights
  
  // Watchlist events (filtered by user's stocks)
  watchlistEvents: CorporateEvent[]
  
  // Statistics
  stats: {
    totalEvents: number
    earningsThisWeek: number
    dividendsThisMonth: number
  }
  
  // Metadata
  lastUpdated: Date
  dataSource: string
}

/**
 * Get event type emoji
 */
export function getEventEmoji(type: EventType): string {
  switch (type) {
    case 'EARNINGS': return '📊'
    case 'DIVIDEND': return '💰'
    case 'SPLIT': return '✂️'
    case 'BONUS': return '🎁'
    case 'AGM': return '🏛️'
    case 'EGM': return '📋'
    case 'RIGHTS': return '📜'
    case 'BUYBACK': return '🔄'
    case 'BOARD_MEETING': return '👔'
    default: return '📅'
  }
}

/**
 * Get event type color
 */
export function getEventColor(type: EventType): string {
  switch (type) {
    case 'EARNINGS': return '#3B82F6'      // Blue
    case 'DIVIDEND': return '#10B981'       // Green
    case 'SPLIT': return '#8B5CF6'          // Purple
    case 'BONUS': return '#F59E0B'          // Orange
    case 'AGM': return '#6366F1'            // Indigo
    case 'EGM': return '#6366F1'
    case 'RIGHTS': return '#EC4899'         // Pink
    case 'BUYBACK': return '#14B8A6'        // Teal
    case 'BOARD_MEETING': return '#64748B'  // Slate
    default: return '#94A3B8'
  }
}

/**
 * Get impact color
 */
export function getImpactColor(impact: 'HIGH' | 'MEDIUM' | 'LOW'): string {
  switch (impact) {
    case 'HIGH': return '#EF4444'
    case 'MEDIUM': return '#F59E0B'
    case 'LOW': return '#10B981'
  }
}

/**
 * Categorize events by timeframe
 */
export function categorizeEvents(events: CorporateEvent[]): EventCalendarData {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekEnd = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
  const nextWeekEnd = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  
  const todayEvents: CorporateEvent[] = []
  const thisWeekEvents: CorporateEvent[] = []
  const nextWeekEvents: CorporateEvent[] = []
  const thisMonthEvents: CorporateEvent[] = []
  
  for (const event of events) {
    const eventDate = new Date(event.eventDate)
    
    if (eventDate.toDateString() === today.toDateString()) {
      todayEvents.push(event)
    }
    
    if (eventDate >= today && eventDate < weekEnd) {
      thisWeekEvents.push(event)
    } else if (eventDate >= weekEnd && eventDate < nextWeekEnd) {
      nextWeekEvents.push(event)
    }
    
    if (eventDate >= today && eventDate <= monthEnd) {
      thisMonthEvents.push(event)
    }
  }
  
  // Sort by date
  const sortByDate = (a: CorporateEvent, b: CorporateEvent) => 
    new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime()
  
  return {
    today: todayEvents.sort(sortByDate),
    thisWeek: thisWeekEvents.sort(sortByDate),
    nextWeek: nextWeekEvents.sort(sortByDate),
    thisMonth: thisMonthEvents.sort(sortByDate),
    
    upcomingEarnings: events.filter(e => e.eventType === 'EARNINGS').sort(sortByDate),
    upcomingDividends: events.filter(e => e.eventType === 'DIVIDEND').sort(sortByDate),
    upcomingActions: events.filter(e => 
      ['SPLIT', 'BONUS', 'RIGHTS', 'BUYBACK'].includes(e.eventType)
    ).sort(sortByDate),
    
    watchlistEvents: [], // Will be populated if watchlist provided
    
    stats: {
      totalEvents: events.length,
      earningsThisWeek: thisWeekEvents.filter(e => e.eventType === 'EARNINGS').length,
      dividendsThisMonth: thisMonthEvents.filter(e => e.eventType === 'DIVIDEND').length
    },
    
    lastUpdated: new Date(),
    dataSource: 'BSE/NSE'
  }
}

/**
 * Filter events for watchlist stocks
 */
export function filterWatchlistEvents(
  events: CorporateEvent[], 
  watchlistSymbols: string[]
): CorporateEvent[] {
  return events.filter(e => watchlistSymbols.includes(e.symbol))
}

/**
 * Get events happening today that need attention
 */
export function getTodayAlerts(events: CorporateEvent[]): CorporateEvent[] {
  const today = new Date().toISOString().split('T')[0]
  return events.filter(e => 
    e.eventDate === today && 
    (e.impact === 'HIGH' || e.eventType === 'EARNINGS')
  )
}
