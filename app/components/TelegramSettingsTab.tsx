'use client'

import React, { useState, useEffect } from 'react'

export default function TelegramSettingsTab() {
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  
  const [enabled, setEnabled] = useState(false)
  const [connected, setConnected] = useState(false)
  const [botToken, setBotToken] = useState('')
  const [chatId, setChatId] = useState('')
  
  const [alertPreferences, setAlertPreferences] = useState({
    targetHits: true,
    stopLossHits: true,
    dailySummary: true,
  })

  // Load settings on mount
  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/settings/telegram')
      const data = await response.json()
      
      if (data.success) {
        setEnabled(data.preferences.enabled)
        setConnected(data.preferences.connected)
        setBotToken(data.preferences.botToken)
        setChatId(data.preferences.chatId)
        setAlertPreferences(data.preferences.alertPreferences)
      } else {
        setError('Failed to load settings')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleConnect = async () => {
    if (!botToken.trim()) {
      setError('Please enter a bot token')
      return
    }

    try {
      setIsSaving(true)
      setError(null)
      setSuccess(null)
      
      const response = await fetch('/api/settings/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'connect',
          botToken: botToken.trim()
        })
      })

      const data = await response.json()
      
      if (data.success) {
        setConnected(true)
        setEnabled(true)
        setChatId(data.chatId)
        setSuccess(data.message)
      } else {
        setError(data.error || 'Connection failed')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect Telegram?')) {
      return
    }

    try {
      setIsSaving(true)
      setError(null)
      setSuccess(null)
      
      const response = await fetch('/api/settings/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'disconnect'
        })
      })

      const data = await response.json()
      
      if (data.success) {
        setConnected(false)
        setEnabled(false)
        setBotToken('')
        setChatId('')
        setSuccess(data.message)
      } else {
        setError(data.error || 'Disconnect failed')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleEnabled = async () => {
    if (!connected) {
      setError('Please connect your bot first')
      return
    }

    try {
      setIsSaving(true)
      setError(null)
      
      const response = await fetch('/api/settings/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle',
          enabled: !enabled
        })
      })

      const data = await response.json()
      
      if (data.success) {
        setEnabled(data.enabled)
        setSuccess(data.message)
      } else {
        setError(data.error || 'Toggle failed')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleUpdatePreferences = async () => {
    try {
      setIsSaving(true)
      setError(null)
      setSuccess(null)
      
      const response = await fetch('/api/settings/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_preferences',
          alertPreferences
        })
      })

      const data = await response.json()
      
      if (data.success) {
        setSuccess(data.message)
      } else {
        setError(data.error || 'Update failed')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#fff' }}>
        <div style={{ fontSize: '1.2em', opacity: 0.7 }}>⏳ Loading settings...</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', color: '#fff' }}>
      <h1 style={{ fontSize: '2.5em', marginBottom: '10px' }}>⚙️ Telegram Settings</h1>
      <p style={{ opacity: 0.7, marginBottom: '30px' }}>
        Get real-time trading alerts via Telegram. Never miss a target hit or stop-loss!
      </p>

      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.2)',
          border: '1px solid #EF4444',
          color: '#EF4444',
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          ❌ {error}
        </div>
      )}

      {success && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.2)',
          border: '1px solid #10B981',
          color: '#10B981',
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          ✅ {success}
        </div>
      )}

      {/* Connection Status */}
      <div style={{
        background: 'rgba(0, 0, 0, 0.4)',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '30px',
        border: connected ? '2px solid #10B981' : '2px solid #6B7280'
      }}>
        <h2 style={{ fontSize: '1.5em', marginBottom: '15px' }}>
          {connected ? '🟢 Connected' : '🔴 Not Connected'}
        </h2>
        
        {connected ? (
          <div>
            <p style={{ opacity: 0.8, marginBottom: '15px' }}>
              Your Telegram bot is connected and ready to send alerts!
            </p>
            <p style={{ fontSize: '0.9em', opacity: 0.6, marginBottom: '15px' }}>
              Chat ID: <code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>{chatId}</code>
            </p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={handleToggleEnabled}
                disabled={isSaving}
                style={{
                  padding: '12px 20px',
                  background: enabled ? 'rgba(239, 68, 68, 0.2)' : 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                  border: enabled ? '1px solid #EF4444' : 'none',
                  color: '#fff',
                  borderRadius: '8px',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  opacity: isSaving ? 0.5 : 1
                }}
              >
                {enabled ? '🔕 Disable Alerts' : '🔔 Enable Alerts'}
              </button>
              <button
                onClick={handleDisconnect}
                disabled={isSaving}
                style={{
                  padding: '12px 20px',
                  background: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid #EF4444',
                  color: '#fff',
                  borderRadius: '8px',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  opacity: isSaving ? 0.5 : 1
                }}
              >
                🔌 Disconnect
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p style={{ opacity: 0.8, marginBottom: '20px' }}>
              Connect your Telegram bot to receive real-time trading alerts.
            </p>
            
            {/* Setup Instructions */}
            <div style={{
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid #3B82F6',
              borderRadius: '8px',
              padding: '15px',
              marginBottom: '20px',
              fontSize: '0.9em'
            }}>
              <h3 style={{ marginTop: 0, marginBottom: '10px', color: '#3B82F6' }}>📱 Setup Instructions:</h3>
              <ol style={{ marginLeft: '20px', lineHeight: '1.6' }}>
                <li>Open Telegram and search for <code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>@BotFather</code></li>
                <li>Send <code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>/newbot</code> to create a new bot</li>
                <li>Follow the instructions and copy your bot token</li>
                <li>Start a chat with your new bot and send any message (like "/start")</li>
                <li>Paste the bot token below and click "Connect"</li>
              </ol>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                Bot Token:
              </label>
              <input
                type="text"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '1em'
                }}
              />
            </div>

            <button
              onClick={handleConnect}
              disabled={isSaving || !botToken.trim()}
              style={{
                padding: '12px 24px',
                background: botToken.trim() ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)' : 'rgba(107, 114, 128, 0.3)',
                border: 'none',
                color: '#fff',
                borderRadius: '8px',
                cursor: (isSaving || !botToken.trim()) ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                fontSize: '1.1em',
                opacity: (isSaving || !botToken.trim()) ? 0.5 : 1
              }}
            >
              {isSaving ? '⏳ Connecting...' : '🔗 Connect Telegram'}
            </button>
          </div>
        )}
      </div>

      {/* Alert Preferences */}
      {connected && (
        <div style={{
          background: 'rgba(0, 0, 0, 0.4)',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <h2 style={{ fontSize: '1.5em', marginBottom: '15px' }}>🔔 Alert Preferences</h2>
          <p style={{ opacity: 0.7, marginBottom: '20px', fontSize: '0.9em' }}>
            Choose which types of alerts you want to receive.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px' }}>
            {Object.entries({
              targetHits: { label: '✅ Target Hits', desc: 'Alert when your positions hit target prices' },
              stopLossHits: { label: '❌ Stop-Loss Hits', desc: 'Alert when positions hit stop-loss (urgent!)' },
              dailySummary: { label: '📊 Daily Summary', desc: 'End-of-day P&L report and statistics' }
            }).map(([key, { label, desc }]) => (
              <label
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  cursor: 'pointer',
                  padding: '12px',
                  background: alertPreferences[key as keyof typeof alertPreferences] ? 'rgba(16, 185, 129, 0.1)' : 'rgba(0, 0, 0, 0.2)',
                  borderRadius: '8px',
                  border: '1px solid ' + (alertPreferences[key as keyof typeof alertPreferences] ? '#10B981' : 'rgba(255, 255, 255, 0.1)')
                }}
              >
                <input
                  type="checkbox"
                  checked={alertPreferences[key as keyof typeof alertPreferences]}
                  onChange={(e) => setAlertPreferences({ ...alertPreferences, [key]: e.target.checked })}
                  style={{
                    marginTop: '4px',
                    width: '18px',
                    height: '18px',
                    cursor: 'pointer'
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{label}</div>
                  <div style={{ fontSize: '0.85em', opacity: 0.7 }}>{desc}</div>
                </div>
              </label>
            ))}
          </div>

          <button
            onClick={handleUpdatePreferences}
            disabled={isSaving}
            style={{
              padding: '12px 24px',
              background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
              border: 'none',
              color: '#fff',
              borderRadius: '8px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              opacity: isSaving ? 0.5 : 1
            }}
          >
            {isSaving ? '⏳ Saving...' : '💾 Save Preferences'}
          </button>
        </div>
      )}

      {/* Test Alert Button */}
      {connected && enabled && (
        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <button
            onClick={async () => {
              try {
                const response = await fetch('/api/reports/daily-summary')
                const data = await response.json()
                if (data.success && data.telegramSent) {
                  setSuccess('Test summary sent! Check your Telegram.')
                } else {
                  setError('Failed to send test summary')
                }
              } catch (err: any) {
                setError(err.message)
              }
            }}
            style={{
              padding: '10px 20px',
              background: 'rgba(168, 85, 247, 0.2)',
              border: '1px solid #A855F7',
              color: '#fff',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.9em'
            }}
          >
            📱 Send Test Summary
          </button>
        </div>
      )}
    </div>
  )
}

