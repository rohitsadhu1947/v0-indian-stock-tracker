'use client'

import React, { useState } from 'react'
import EventCalendar from './EventCalendar'
import FinancialsUpload from './FinancialsUpload'

/**
 * Data Tab
 * Central hub for:
 * - Earnings Calendar (upcoming corporate events)
 * - Financial Data Upload (quarterly/annual financials)
 * - Earnings Analyzer (coming soon)
 */
export default function DataTab() {
  const [activeSection, setActiveSection] = useState<'calendar' | 'upload' | 'analyzer'>('calendar')

  return (
    <div style={{
      minHeight: '600px',
      background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
      padding: '30px',
      borderRadius: '20px'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <div>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '1.8em' }}>
            📁 Data Hub
          </h2>
          <p style={{ margin: 0, opacity: 0.8, fontSize: '0.95em' }}>
            Earnings calendar, financial data upload, and analysis tools
          </p>
        </div>
      </div>

      {/* Section Tabs */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '24px',
        flexWrap: 'wrap'
      }}>
        <SectionButton 
          active={activeSection === 'calendar'}
          onClick={() => setActiveSection('calendar')}
          icon="📅"
          label="Earnings Calendar"
        />
        <SectionButton 
          active={activeSection === 'upload'}
          onClick={() => setActiveSection('upload')}
          icon="📤"
          label="Upload Financials"
        />
        <SectionButton 
          active={activeSection === 'analyzer'}
          onClick={() => setActiveSection('analyzer')}
          icon="🔬"
          label="Earnings Analyzer"
          badge="Soon"
        />
      </div>

      {/* Content */}
      {activeSection === 'calendar' && (
        <div>
          <div style={{
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '20px'
          }}>
            <h3 style={{ margin: '0 0 12px 0' }}>📅 Upcoming Corporate Events</h3>
            <p style={{ margin: 0, opacity: 0.8, fontSize: '0.9em' }}>
              Track earnings announcements, dividends, splits, and other corporate actions.
              Use this to prioritize which stocks need financial data uploaded.
            </p>
          </div>
          <EventCalendar />
        </div>
      )}

      {activeSection === 'upload' && (
        <div>
          <div style={{
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '20px'
          }}>
            <h3 style={{ margin: '0 0 12px 0' }}>📤 Upload Financial Data</h3>
            <p style={{ margin: 0, opacity: 0.8, fontSize: '0.9em' }}>
              Upload quarterly and annual financial data for stocks. This data is used 
              for earnings analysis and historical comparison.
            </p>
            <div style={{
              marginTop: '12px',
              padding: '12px',
              background: 'rgba(251, 191, 36, 0.15)',
              borderRadius: '8px',
              border: '1px solid rgba(251, 191, 36, 0.3)',
              fontSize: '0.9em'
            }}>
              💡 <strong>Priority:</strong> Upload data for stocks with earnings this week first!
              Check the Calendar tab to see upcoming announcements.
            </div>
          </div>
          <FinancialsUpload />
        </div>
      )}

      {activeSection === 'analyzer' && (
        <div>
          <div style={{
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '16px',
            padding: '40px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '4em', marginBottom: '16px' }}>🔬</div>
            <h3 style={{ margin: '0 0 12px 0' }}>Earnings Analyzer</h3>
            <p style={{ margin: '0 0 20px 0', opacity: 0.8 }}>
              Coming soon! This will analyze stocks before and after earnings:
            </p>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
              textAlign: 'left',
              maxWidth: '600px',
              margin: '0 auto'
            }}>
              <FeatureCard 
                icon="📈"
                title="Pre-Earnings"
                items={[
                  '3-month price trend',
                  'Historical earnings comparison',
                  'Analyst expectations',
                  'Sector performance'
                ]}
              />
              <FeatureCard 
                icon="📊"
                title="Post-Earnings"
                items={[
                  'Result vs expectations',
                  'YoY/QoQ growth',
                  'Beat/Miss analysis',
                  'Trading signals'
                ]}
              />
            </div>
            <p style={{ marginTop: '24px', opacity: 0.6, fontSize: '0.9em' }}>
              Upload financial data first to enable this feature
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function SectionButton({ 
  active, 
  onClick, 
  icon, 
  label, 
  badge 
}: { 
  active: boolean
  onClick: () => void
  icon: string
  label: string
  badge?: string
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '12px 20px',
        background: active 
          ? 'rgba(255, 255, 255, 0.2)' 
          : 'rgba(0, 0, 0, 0.2)',
        border: active 
          ? '2px solid rgba(255, 255, 255, 0.4)' 
          : '2px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        cursor: 'pointer',
        fontSize: '1em',
        fontWeight: active ? 'bold' : 'normal',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        transition: 'all 0.2s ease'
      }}
    >
      <span>{icon}</span>
      <span>{label}</span>
      {badge && (
        <span style={{
          fontSize: '0.7em',
          padding: '2px 6px',
          background: 'rgba(251, 191, 36, 0.3)',
          borderRadius: '4px',
          color: '#FCD34D'
        }}>
          {badge}
        </span>
      )}
    </button>
  )
}

function FeatureCard({ icon, title, items }: { icon: string, title: string, items: string[] }) {
  return (
    <div style={{
      background: 'rgba(0, 0, 0, 0.2)',
      borderRadius: '12px',
      padding: '16px'
    }}>
      <div style={{ fontSize: '1.5em', marginBottom: '8px' }}>{icon}</div>
      <h4 style={{ margin: '0 0 8px 0', fontSize: '1em' }}>{title}</h4>
      <ul style={{ 
        margin: 0, 
        paddingLeft: '16px', 
        fontSize: '0.85em',
        opacity: 0.8 
      }}>
        {items.map((item, i) => (
          <li key={i} style={{ marginBottom: '4px' }}>{item}</li>
        ))}
      </ul>
    </div>
  )
}
