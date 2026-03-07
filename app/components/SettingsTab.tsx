'use client'

import React, { useState } from 'react'
import BrokerSettingsTab from './BrokerSettingsTab'
import TelegramSettingsTab from './TelegramSettingsTab'

type SettingsSubTab = 'brokers' | 'telegram'

export default function SettingsTab() {
  const [activeSubTab, setActiveSubTab] = useState<SettingsSubTab>('brokers')

  const subTabs: Array<{ key: SettingsSubTab; label: string; icon: string }> = [
    { key: 'brokers', label: 'Broker Connections', icon: '🔗' },
    { key: 'telegram', label: 'Telegram Alerts', icon: '📱' },
  ]

  return (
    <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto', color: '#fff' }}>
      <h1 style={{ fontSize: '2.2em', marginBottom: '8px' }}>Settings</h1>
      <p style={{ opacity: 0.6, marginBottom: '24px', fontSize: '0.9em' }}>
        Manage your broker connections and notification preferences.
      </p>

      {/* Sub-tab navigation */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '24px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        paddingBottom: '12px'
      }}>
        {subTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveSubTab(tab.key)}
            style={{
              padding: '10px 20px',
              background: activeSubTab === tab.key
                ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                : 'rgba(255, 255, 255, 0.05)',
              border: activeSubTab === tab.key
                ? '1px solid rgba(102, 126, 234, 0.5)'
                : '1px solid rgba(255, 255, 255, 0.1)',
              color: '#fff',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: activeSubTab === tab.key ? 'bold' : 'normal',
              fontSize: '0.95em',
              transition: 'all 0.2s ease'
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      {activeSubTab === 'brokers' && <BrokerSettingsTab />}
      {activeSubTab === 'telegram' && <TelegramSettingsTab />}
    </div>
  )
}
