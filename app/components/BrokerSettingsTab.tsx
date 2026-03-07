'use client'

import React, { useState, useEffect } from 'react'

interface BrokerConnection {
  id: number
  brokerId: string
  displayName: string
  brokerUserId: string | null
  isActive: boolean
  isPrimary: boolean
  lastConnected: string | null
  tokenExpiry: string | null
}

interface AvailableBroker {
  brokerId: string
  displayName: string
  description: string
  supportsOAuth: boolean
  supportsFormLogin: boolean
  hasApi: boolean
  formFields?: Array<{
    key: string
    label: string
    type: string
    placeholder: string
    required: boolean
  }>
}

export default function BrokerSettingsTab() {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [connections, setConnections] = useState<BrokerConnection[]>([])
  const [availableBrokers, setAvailableBrokers] = useState<AvailableBroker[]>([])
  const [connectingBroker, setConnectingBroker] = useState<string | null>(null)
  const [disconnectingBroker, setDisconnectingBroker] = useState<number | null>(null)

  // Form state for form-based brokers (Angel One, etc.)
  const [formState, setFormState] = useState<Record<string, string>>({})
  const [showFormFor, setShowFormFor] = useState<string | null>(null)

  useEffect(() => {
    loadBrokerData()

    // Check for broker=connected in URL (redirect from OAuth)
    const params = new URLSearchParams(window.location.search)
    if (params.get('broker') === 'connected') {
      setSuccess('Broker connected successfully!')
      // Clean up URL
      const url = new URL(window.location.href)
      url.searchParams.delete('broker')
      window.history.replaceState({}, '', url.toString())
    }
  }, [])

  const loadBrokerData = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await fetch('/api/user/brokers')
      const data = await response.json()

      if (data.success) {
        setConnections(data.connections || [])
        setAvailableBrokers(data.availableBrokers || [])
      } else {
        setError(data.error || 'Failed to load broker settings')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect to server')
    } finally {
      setIsLoading(false)
    }
  }

  const handleConnect = async (brokerId: string) => {
    const broker = availableBrokers.find(b => b.brokerId === brokerId)
    if (!broker) return

    // For form-based brokers, show the form
    if (broker.supportsFormLogin) {
      setShowFormFor(brokerId)
      setFormState({})
      return
    }

    // For OAuth brokers, redirect
    if (broker.supportsOAuth) {
      try {
        setConnectingBroker(brokerId)
        setError(null)
        const response = await fetch('/api/user/brokers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brokerId })
        })
        const data = await response.json()

        if (data.success && data.url) {
          window.location.href = data.url
        } else {
          setError(data.error || `Failed to connect ${broker.displayName}`)
          setConnectingBroker(null)
        }
      } catch (err: any) {
        setError(err.message)
        setConnectingBroker(null)
      }
      return
    }

    // For no-API brokers, just record preference
    if (!broker.hasApi) {
      try {
        setConnectingBroker(brokerId)
        setError(null)
        const response = await fetch('/api/user/brokers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brokerId })
        })
        const data = await response.json()
        if (data.success) {
          setSuccess(`${broker.displayName} selected. You'll use admin's market data.`)
          await loadBrokerData()
        } else {
          setError(data.error || 'Failed to save preference')
        }
      } catch (err: any) {
        setError(err.message)
      } finally {
        setConnectingBroker(null)
      }
      return
    }
  }

  const handleFormSubmit = async (brokerId: string) => {
    try {
      setConnectingBroker(brokerId)
      setError(null)
      const response = await fetch('/api/user/brokers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brokerId, credentials: formState })
      })
      const data = await response.json()
      if (data.success) {
        setSuccess(`${availableBrokers.find(b => b.brokerId === brokerId)?.displayName} connected!`)
        setShowFormFor(null)
        setFormState({})
        await loadBrokerData()
      } else {
        setError(data.error || 'Connection failed')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setConnectingBroker(null)
    }
  }

  const handleDisconnect = async (connectionId: number) => {
    if (!confirm('Are you sure you want to disconnect this broker?')) return

    try {
      setDisconnectingBroker(connectionId)
      setError(null)
      const response = await fetch('/api/user/brokers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId })
      })
      const data = await response.json()
      if (data.success) {
        setSuccess('Broker disconnected')
        await loadBrokerData()
      } else {
        setError(data.error || 'Failed to disconnect')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setDisconnectingBroker(null)
    }
  }

  const isTokenExpired = (expiry: string | null) => {
    if (!expiry) return false
    return new Date(expiry) < new Date()
  }

  const getConnectionStatus = (conn: BrokerConnection) => {
    if (!conn.isActive) return { label: 'Disconnected', color: '#6B7280', icon: '⚫' }
    if (isTokenExpired(conn.tokenExpiry)) return { label: 'Token Expired', color: '#F59E0B', icon: '🟡' }
    return { label: 'Connected', color: '#10B981', icon: '🟢' }
  }

  if (isLoading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#fff' }}>
        <div style={{ fontSize: '1.2em', opacity: 0.7 }}>Loading broker settings...</div>
      </div>
    )
  }

  // Group brokers: with API vs without API
  const apiBrokers = availableBrokers.filter(b => b.hasApi)
  const noApiBrokers = availableBrokers.filter(b => !b.hasApi)

  // Which brokers are already connected?
  const connectedBrokerIds = new Set(connections.filter(c => c.isActive).map(c => c.brokerId))

  return (
    <div style={{ color: '#fff' }}>

      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.2)',
          border: '1px solid #EF4444',
          color: '#EF4444',
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          {error}
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
          {success}
        </div>
      )}

      {/* Active Connections */}
      {connections.filter(c => c.isActive).length > 0 && (
        <div style={{
          background: 'rgba(0, 0, 0, 0.4)',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '24px',
          border: '2px solid rgba(16, 185, 129, 0.3)'
        }}>
          <h2 style={{ fontSize: '1.3em', marginBottom: '15px', marginTop: 0 }}>
            Your Connected Brokers
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {connections.filter(c => c.isActive).map(conn => {
              const status = getConnectionStatus(conn)
              return (
                <div key={conn.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '16px',
                  background: 'rgba(0, 0, 0, 0.3)',
                  borderRadius: '8px',
                  border: `1px solid ${status.color}40`
                }}>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '1.1em', marginBottom: '4px' }}>
                      {conn.displayName}
                    </div>
                    <div style={{ fontSize: '0.85em', opacity: 0.7 }}>
                      {status.icon} {status.label}
                      {conn.brokerUserId && ` \u00b7 ID: ${conn.brokerUserId}`}
                      {conn.lastConnected && ` \u00b7 Last: ${new Date(conn.lastConnected).toLocaleDateString()}`}
                    </div>
                    {isTokenExpired(conn.tokenExpiry) && (
                      <div style={{ fontSize: '0.8em', color: '#F59E0B', marginTop: '4px' }}>
                        Token expired. Click "Reconnect" to refresh.
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {isTokenExpired(conn.tokenExpiry) && (
                      <button
                        onClick={() => handleConnect(conn.brokerId)}
                        disabled={connectingBroker === conn.brokerId}
                        style={{
                          padding: '8px 16px',
                          background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                          border: 'none',
                          color: '#fff',
                          borderRadius: '6px',
                          cursor: connectingBroker === conn.brokerId ? 'not-allowed' : 'pointer',
                          fontWeight: 'bold',
                          fontSize: '0.85em',
                          opacity: connectingBroker === conn.brokerId ? 0.5 : 1
                        }}
                      >
                        {connectingBroker === conn.brokerId ? 'Reconnecting...' : 'Reconnect'}
                      </button>
                    )}
                    <button
                      onClick={() => handleDisconnect(conn.id)}
                      disabled={disconnectingBroker === conn.id}
                      style={{
                        padding: '8px 16px',
                        background: 'rgba(239, 68, 68, 0.2)',
                        border: '1px solid #EF4444',
                        color: '#fff',
                        borderRadius: '6px',
                        cursor: disconnectingBroker === conn.id ? 'not-allowed' : 'pointer',
                        fontSize: '0.85em',
                        opacity: disconnectingBroker === conn.id ? 0.5 : 1
                      }}
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* No Connection Notice */}
      {connections.filter(c => c.isActive).length === 0 && (
        <div style={{
          background: 'rgba(59, 130, 246, 0.1)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '24px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '2em', marginBottom: '8px' }}>📊</div>
          <h3 style={{ margin: '0 0 8px 0' }}>No Broker Connected</h3>
          <p style={{ opacity: 0.7, margin: 0, fontSize: '0.9em' }}>
            You're currently using admin's market data feed. Connect your own broker below for a direct connection.
          </p>
        </div>
      )}

      {/* Available Brokers with API */}
      <div style={{
        background: 'rgba(0, 0, 0, 0.4)',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '24px',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        <h2 style={{ fontSize: '1.3em', marginBottom: '6px', marginTop: 0 }}>
          Available Brokers
        </h2>
        <p style={{ opacity: 0.6, fontSize: '0.85em', marginBottom: '16px' }}>
          Connect your trading account to get direct market data access.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {apiBrokers.map(broker => {
            const isConnected = connectedBrokerIds.has(broker.brokerId)
            const isConnecting = connectingBroker === broker.brokerId

            return (
              <div key={broker.brokerId}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '14px 16px',
                  background: isConnected ? 'rgba(16, 185, 129, 0.08)' : 'rgba(0, 0, 0, 0.2)',
                  borderRadius: '8px',
                  border: isConnected ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>
                      {broker.displayName}
                      {isConnected && <span style={{ color: '#10B981', marginLeft: '8px', fontSize: '0.85em' }}>Connected</span>}
                    </div>
                    <div style={{ fontSize: '0.82em', opacity: 0.6 }}>
                      {broker.description}
                    </div>
                    <div style={{ fontSize: '0.75em', opacity: 0.4, marginTop: '2px' }}>
                      {broker.supportsOAuth ? 'OAuth login' : 'API Key + credentials'}
                    </div>
                  </div>
                  {!isConnected && (
                    <button
                      onClick={() => handleConnect(broker.brokerId)}
                      disabled={isConnecting}
                      style={{
                        padding: '8px 20px',
                        background: isConnecting ? 'rgba(107, 114, 128, 0.3)' : 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                        border: 'none',
                        color: '#fff',
                        borderRadius: '6px',
                        cursor: isConnecting ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold',
                        fontSize: '0.85em',
                        whiteSpace: 'nowrap',
                        opacity: isConnecting ? 0.5 : 1
                      }}
                    >
                      {isConnecting ? 'Connecting...' : 'Connect'}
                    </button>
                  )}
                </div>

                {/* Form-based login fields */}
                {showFormFor === broker.brokerId && broker.formFields && (
                  <div style={{
                    padding: '16px',
                    background: 'rgba(59, 130, 246, 0.05)',
                    borderRadius: '0 0 8px 8px',
                    borderTop: 'none',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                    marginTop: '-4px'
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {broker.formFields.map(field => (
                        <div key={field.key}>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85em', fontWeight: 'bold' }}>
                            {field.label} {field.required && <span style={{ color: '#EF4444' }}>*</span>}
                          </label>
                          <input
                            type={field.type === 'password' ? 'password' : 'text'}
                            placeholder={field.placeholder}
                            value={formState[field.key] || ''}
                            onChange={(e) => setFormState({ ...formState, [field.key]: e.target.value })}
                            style={{
                              width: '100%',
                              padding: '10px',
                              background: 'rgba(0, 0, 0, 0.4)',
                              border: '1px solid rgba(255, 255, 255, 0.2)',
                              borderRadius: '6px',
                              color: '#fff',
                              fontSize: '0.9em'
                            }}
                          />
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                      <button
                        onClick={() => handleFormSubmit(broker.brokerId)}
                        disabled={isConnecting}
                        style={{
                          padding: '10px 20px',
                          background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                          border: 'none',
                          color: '#fff',
                          borderRadius: '6px',
                          cursor: isConnecting ? 'not-allowed' : 'pointer',
                          fontWeight: 'bold',
                          fontSize: '0.9em',
                          opacity: isConnecting ? 0.5 : 1
                        }}
                      >
                        {isConnecting ? 'Connecting...' : 'Connect'}
                      </button>
                      <button
                        onClick={() => { setShowFormFor(null); setFormState({}) }}
                        style={{
                          padding: '10px 20px',
                          background: 'rgba(107, 114, 128, 0.2)',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          color: '#fff',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.9em'
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* No-API Brokers */}
      {noApiBrokers.length > 0 && (
        <div style={{
          background: 'rgba(0, 0, 0, 0.4)',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <h2 style={{ fontSize: '1.3em', marginBottom: '6px', marginTop: 0 }}>
            Other Brokers
          </h2>
          <p style={{ opacity: 0.6, fontSize: '0.85em', marginBottom: '16px' }}>
            These brokers don't have public APIs. Market data will be provided by the admin's broker connection.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {noApiBrokers.map(broker => {
              const isSelected = connectedBrokerIds.has(broker.brokerId)

              return (
                <div key={broker.brokerId} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  background: isSelected ? 'rgba(168, 85, 247, 0.08)' : 'rgba(0, 0, 0, 0.2)',
                  borderRadius: '8px',
                  border: isSelected ? '1px solid rgba(168, 85, 247, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)'
                }}>
                  <div>
                    <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>
                      {broker.displayName}
                      {isSelected && <span style={{ color: '#A855F7', marginLeft: '8px', fontSize: '0.85em' }}>Selected</span>}
                    </div>
                    <div style={{ fontSize: '0.82em', opacity: 0.5 }}>
                      {broker.description}
                    </div>
                  </div>
                  {!isSelected && (
                    <button
                      onClick={() => handleConnect(broker.brokerId)}
                      disabled={connectingBroker === broker.brokerId}
                      style={{
                        padding: '6px 14px',
                        background: 'rgba(168, 85, 247, 0.2)',
                        border: '1px solid rgba(168, 85, 247, 0.4)',
                        color: '#fff',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.82em',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      Select
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
