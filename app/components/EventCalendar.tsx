'use client'

import { useState, useEffect } from 'react'

interface CorporateEvent {
  id: string
  symbol: string
  companyName: string
  eventType: string
  eventDate: string
  details: any
  impact: string
  source: string
  emoji?: string
  color?: string
}

interface EventData {
  success: boolean
  today: CorporateEvent[]
  thisWeek: CorporateEvent[]
  nextWeek: CorporateEvent[]
  thisMonth: CorporateEvent[]
  upcomingEarnings: CorporateEvent[]
  upcomingDividends: CorporateEvent[]
  upcomingActions: CorporateEvent[]
  todayAlerts: CorporateEvent[]
  stats: {
    totalEvents: number
    earningsThisWeek: number
    dividendsThisMonth: number
  }
  dataSource: string
  cached: boolean
}

export default function EventCalendar() {
  const [data, setData] = useState<EventData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'week' | 'earnings' | 'dividends' | 'actions'>('week')

  const fetchEvents = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch('/api/market/events')
      const result = await response.json()
      
      if (result.success) {
        setData(result)
      } else {
        setError(result.error || 'Failed to fetch events')
      }
    } catch (err: any) {
      setError(err.message || 'Network error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEvents()
  }, [])

  const getEventEmoji = (type: string): string => {
    const emojis: Record<string, string> = {
      'EARNINGS': '📊',
      'DIVIDEND': '💰',
      'SPLIT': '✂️',
      'BONUS': '🎁',
      'AGM': '🏛️',
      'EGM': '📋',
      'RIGHTS': '📜',
      'BUYBACK': '🔄',
      'BOARD_MEETING': '👔'
    }
    return emojis[type] || '📅'
  }

  const getEventColor = (type: string): string => {
    const colors: Record<string, string> = {
      'EARNINGS': '#3B82F6',
      'DIVIDEND': '#10B981',
      'SPLIT': '#8B5CF6',
      'BONUS': '#F59E0B',
      'AGM': '#6366F1',
      'EGM': '#6366F1',
      'RIGHTS': '#EC4899',
      'BUYBACK': '#14B8A6',
      'BOARD_MEETING': '#64748B'
    }
    return colors[type] || '#94A3B8'
  }

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    const today = new Date()
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000)
    
    if (date.toDateString() === today.toDateString()) return 'Today'
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
    
    return date.toLocaleDateString('en-IN', { 
      weekday: 'short', 
      day: 'numeric', 
      month: 'short' 
    })
  }

  if (loading && !data) {
    return (
      <div style={{
        background: 'rgba(0, 0, 0, 0.3)',
        borderRadius: '16px',
        padding: '20px',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.5em' }}>📅</span>
          <span style={{ color: 'rgba(255,255,255,0.7)' }}>Loading event calendar...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        background: 'rgba(239, 68, 68, 0.15)',
        borderRadius: '16px',
        padding: '20px',
        marginBottom: '20px'
      }}>
        <span style={{ color: '#EF4444' }}>⚠️ {error}</span>
      </div>
    )
  }

  if (!data) return null

  const renderEventList = (events: CorporateEvent[]) => {
    if (events.length === 0) {
      return (
        <div style={{ 
          textAlign: 'center', 
          padding: '30px', 
          opacity: 0.5 
        }}>
          No events found
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {events.slice(0, 10).map((event) => (
          <div 
            key={event.id}
            style={{
              background: 'rgba(0,0,0,0.2)',
              borderRadius: '12px',
              padding: '15px',
              borderLeft: `4px solid ${event.color || getEventColor(event.eventType)}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start'
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                <span>{event.emoji || getEventEmoji(event.eventType)}</span>
                <span style={{ fontWeight: 'bold' }}>{event.symbol}</span>
                <span style={{
                  background: `${event.color || getEventColor(event.eventType)}30`,
                  color: event.color || getEventColor(event.eventType),
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '0.75em'
                }}>
                  {event.eventType.replace('_', ' ')}
                </span>
                {event.impact === 'HIGH' && (
                  <span style={{
                    background: 'rgba(239, 68, 68, 0.2)',
                    color: '#EF4444',
                    padding: '2px 6px',
                    borderRadius: '8px',
                    fontSize: '0.7em'
                  }}>
                    HIGH IMPACT
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.85em', opacity: 0.8 }}>
                {event.companyName}
              </div>
              {event.details?.description && (
                <div style={{ fontSize: '0.8em', opacity: 0.6, marginTop: '4px' }}>
                  {event.details.description}
                </div>
              )}
            </div>
            <div style={{ 
              textAlign: 'right',
              minWidth: '80px'
            }}>
              <div style={{ 
                fontWeight: 'bold',
                color: formatDate(event.eventDate) === 'Today' ? '#F59E0B' : 'inherit'
              }}>
                {formatDate(event.eventDate)}
              </div>
              <div style={{ fontSize: '0.75em', opacity: 0.6 }}>
                {event.source}
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  const tabs = [
    { id: 'week', label: '📆 This Week', count: data.thisWeek.length },
    { id: 'earnings', label: '📊 Earnings', count: data.upcomingEarnings.length },
    { id: 'dividends', label: '💰 Dividends', count: data.upcomingDividends.length },
    { id: 'actions', label: '🎁 Actions', count: data.upcomingActions.length },
  ]

  return (
    <div style={{
      background: 'rgba(0, 0, 0, 0.3)',
      borderRadius: '16px',
      padding: '20px',
      marginBottom: '20px'
    }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.3em' }}>📅 Event Calendar</h3>
          <div style={{ fontSize: '0.85em', opacity: 0.7 }}>
            {data.stats.totalEvents} upcoming events • {data.stats.earningsThisWeek} earnings this week
          </div>
        </div>
        <button
          onClick={fetchEvents}
          disabled={loading}
          style={{
            background: 'rgba(59, 130, 246, 0.2)',
            border: '1px solid rgba(59, 130, 246, 0.5)',
            borderRadius: '8px',
            padding: '8px 16px',
            color: '#3B82F6',
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.5 : 1
          }}
        >
          🔄 Refresh
        </button>
      </div>

      {/* Today Alerts */}
      {data.todayAlerts.length > 0 && (
        <div style={{
          background: 'rgba(245, 158, 11, 0.15)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: '12px',
          padding: '15px',
          marginBottom: '20px'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '10px', color: '#F59E0B' }}>
            ⚡ TODAY'S EVENTS
          </div>
          {data.todayAlerts.map(event => (
            <div key={event.id} style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px',
              marginBottom: '8px'
            }}>
              <span>{getEventEmoji(event.eventType)}</span>
              <span style={{ fontWeight: 'bold' }}>{event.symbol}</span>
              <span style={{ opacity: 0.8 }}>{event.details?.description || event.eventType}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ 
        display: 'flex', 
        gap: '5px', 
        marginBottom: '15px',
        overflowX: 'auto'
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              background: activeTab === tab.id ? 'rgba(59, 130, 246, 0.3)' : 'rgba(0,0,0,0.2)',
              border: activeTab === tab.id ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid transparent',
              borderRadius: '8px',
              padding: '10px 15px',
              color: activeTab === tab.id ? '#60A5FA' : 'rgba(255,255,255,0.7)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontSize: '0.9em'
            }}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Event List */}
      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {activeTab === 'week' && renderEventList(data.thisWeek)}
        {activeTab === 'earnings' && renderEventList(data.upcomingEarnings)}
        {activeTab === 'dividends' && renderEventList(data.upcomingDividends)}
        {activeTab === 'actions' && renderEventList(data.upcomingActions)}
      </div>

      {/* Footer */}
      <div style={{ 
        marginTop: '15px',
        paddingTop: '10px',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '0.75em',
        opacity: 0.6
      }}>
        <span>Source: {data.dataSource}</span>
        <span>{data.cached ? '📦 Cached' : '🔄 Fresh'}</span>
      </div>
    </div>
  )
}
