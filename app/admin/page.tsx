'use client'

/**
 * Admin Dashboard
 *
 * Features:
 * - User Management: View, create, suspend/activate users
 * - Broker Connections: Connect/disconnect market data providers (Kite, Groww, etc.)
 */

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

interface User {
  id: number
  email: string
  name: string | null
  role: string
  status: string
  kiteUserId: string | null
  createdAt: string
  lastLogin: string | null
}

interface BrokerConnection {
  id: number
  brokerId: string
  displayName: string | null
  brokerUserId: string | null
  isActive: boolean
  isPrimary: boolean
  lastConnected: string | null
  tokenExpiry: string | null
  createdAt: string
}

interface AvailableBroker {
  brokerId: string
  displayName: string
  supportsOAuth: boolean
  description: string
}

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-black">
        <div className="text-white text-lg">Loading admin dashboard...</div>
      </div>
    }>
      <AdminDashboard />
    </Suspense>
  )
}

function AdminDashboard() {
  const searchParams = useSearchParams()
  const initialTab = searchParams.get('tab') === 'brokers' ? 'brokers' : 'users'

  const [activeTab, setActiveTab] = useState<'users' | 'brokers'>(initialTab)
  const [users, setUsers] = useState<User[]>([])
  const [brokerConnections, setBrokerConnections] = useState<BrokerConnection[]>([])
  const [availableBrokers, setAvailableBrokers] = useState<AvailableBroker[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    name: '',
    role: 'viewer' as 'admin' | 'viewer' | 'trader' | 'custom',
  })
  const [creating, setCreating] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  // Check authentication
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/session')
        if (!res.ok) {
          setError('Not authenticated. Please login first.')
          setLoading(false)
          return
        }
        const data = await res.json()

        if (!data.authenticated) {
          setError('Not authenticated. Please login first.')
          setLoading(false)
          return
        }

        if (data.user.role !== 'admin') {
          setError('Access denied. Admin role required.')
          setLoading(false)
          return
        }

        setIsAuthenticated(true)
        setIsAdmin(true)
        fetchUsers()
        fetchBrokerConnections()
      } catch (err: any) {
        setError('Authentication check failed: ' + err.message)
        setLoading(false)
      }
    }
    checkAuth()
  }, [])

  async function fetchUsers() {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/users')
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to fetch users')
      }
      const data = await res.json()
      setUsers(data.users)
      setError('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function fetchBrokerConnections() {
    try {
      const res = await fetch('/api/admin/brokers')
      if (!res.ok) return
      const data = await res.json()
      setBrokerConnections(data.connections || [])
      setAvailableBrokers(data.availableBrokers || [])
    } catch (err: any) {
      console.error('Failed to fetch broker connections:', err)
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setCreating(true)

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create user')
      }

      setNewUser({ email: '', password: '', name: '', role: 'viewer' })
      setShowCreateModal(false)
      await fetchUsers()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleToggleStatus(userId: number, currentStatus: string) {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active'

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update user')
      }

      await fetchUsers()
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function handleConnectBroker(brokerId: string) {
    try {
      setError('')
      const res = await fetch('/api/admin/brokers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brokerId }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to initiate broker connection')
      }

      if (data.action === 'redirect' && data.url) {
        // Redirect to broker OAuth
        window.location.href = data.url
      }
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function handleDisconnectBroker(connectionId: number) {
    try {
      setError('')
      const res = await fetch('/api/admin/brokers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to disconnect broker')
      }

      await fetchBrokerConnections()
    } catch (err: any) {
      setError(err.message)
    }
  }

  function getRoleBadgeColor(role: string) {
    switch (role) {
      case 'admin': return 'bg-purple-600 text-white'
      case 'trader': return 'bg-blue-600 text-white'
      case 'viewer': return 'bg-gray-600 text-white'
      default: return 'bg-yellow-600 text-white'
    }
  }

  function getStatusBadgeColor(status: string) {
    switch (status) {
      case 'active': return 'bg-green-600 text-white'
      case 'suspended': return 'bg-red-600 text-white'
      case 'pending': return 'bg-yellow-600 text-white'
      default: return 'bg-gray-600 text-white'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Admin Dashboard</h1>
            <p className="text-gray-400">Manage users and broker connections</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => (window.location.href = '/')}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              Back to App
            </button>
            {isAdmin && activeTab === 'users' && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                + Create User
              </button>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6 bg-gray-900 rounded-lg p-1 w-fit">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-6 py-2 rounded-md transition-colors font-medium ${
              activeTab === 'users'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Users
          </button>
          <button
            onClick={() => setActiveTab('brokers')}
            className={`px-6 py-2 rounded-md transition-colors font-medium ${
              activeTab === 'brokers'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Broker Connections
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-lg">
            <div className="text-red-200 font-semibold mb-2">Error</div>
            <div className="text-red-300">{error}</div>
            {!isAuthenticated && (
              <div className="mt-4">
                <button
                  onClick={() => (window.location.href = '/login')}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  Go to Login
                </button>
              </div>
            )}
          </div>
        )}

        {/* Loading State */}
        {loading && !error && (
          <div className="text-center py-12">
            <div className="text-white text-lg">Loading...</div>
          </div>
        )}

        {/* =============================== */}
        {/* USERS TAB */}
        {/* =============================== */}
        {activeTab === 'users' && !loading && isAdmin && (
          <>
            {users.length > 0 ? (
              <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-900">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">User</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Role</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Last Login</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {users.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-750">
                        <td className="px-6 py-4">
                          <div>
                            <div className="text-white font-medium">{user.email}</div>
                            {user.name && <div className="text-gray-400 text-sm">{user.name}</div>}
                            {user.kiteUserId && (
                              <div className="text-gray-500 text-xs">Kite: {user.kiteUserId}</div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getRoleBadgeColor(user.role)}`}>
                            {user.role.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(user.status)}`}>
                            {user.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-400 text-sm">
                          {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button
                            onClick={() => handleToggleStatus(user.id, user.status)}
                            className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                              user.status === 'active'
                                ? 'bg-red-600 hover:bg-red-700 text-white'
                                : 'bg-green-600 hover:bg-green-700 text-white'
                            }`}
                          >
                            {user.status === 'active' ? 'Suspend' : 'Activate'}
                          </button>
                          <button
                            onClick={() => (window.location.href = `/?view_user_id=${user.id}`)}
                            className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                          >
                            View Positions
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 bg-gray-800 rounded-lg border border-gray-700">
                <p className="text-gray-400">No users found</p>
              </div>
            )}
          </>
        )}

        {/* =============================== */}
        {/* BROKER CONNECTIONS TAB */}
        {/* =============================== */}
        {activeTab === 'brokers' && !loading && isAdmin && (
          <div className="space-y-6">
            {/* Active Connections */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Active Connections</h2>

              {brokerConnections.filter((c) => c.isActive).length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-lg mb-2">No broker connections</p>
                  <p className="text-sm">Connect a broker below to enable live market data</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {brokerConnections
                    .filter((c) => c.isActive)
                    .map((conn) => (
                      <div
                        key={conn.id}
                        className="flex items-center justify-between bg-gray-900 rounded-lg p-4 border border-gray-700"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-orange-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                            {conn.brokerId === 'kite' ? 'K' : conn.brokerId.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-white font-medium">
                              {conn.displayName || conn.brokerId}
                              {conn.isPrimary && (
                                <span className="ml-2 text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">
                                  PRIMARY
                                </span>
                              )}
                            </div>
                            <div className="text-gray-400 text-sm">
                              User: {conn.brokerUserId || 'N/A'}
                              {conn.lastConnected && (
                                <span className="ml-3">
                                  Connected: {new Date(conn.lastConnected).toLocaleString()}
                                </span>
                              )}
                            </div>
                            {conn.tokenExpiry && (
                              <div className="text-gray-500 text-xs">
                                Token expires: {new Date(conn.tokenExpiry).toLocaleString()}
                                {new Date(conn.tokenExpiry) < new Date() && (
                                  <span className="ml-2 text-red-400">EXPIRED</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {conn.brokerId === 'kite' && (
                            <button
                              onClick={() => handleConnectBroker('kite')}
                              className="px-3 py-1 text-xs bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors"
                            >
                              Refresh Token
                            </button>
                          )}
                          <button
                            onClick={() => handleDisconnectBroker(conn.id)}
                            className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                          >
                            Disconnect
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Available Brokers */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Available Brokers</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {availableBrokers.map((broker) => {
                  const isConnected = brokerConnections.some(
                    (c) => c.brokerId === broker.brokerId && c.isActive
                  )
                  return (
                    <div
                      key={broker.brokerId}
                      className="bg-gray-900 rounded-lg p-4 border border-gray-700"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-white font-medium">{broker.displayName}</div>
                          <div className="text-gray-400 text-sm mt-1">{broker.description}</div>
                        </div>
                        <button
                          onClick={() => handleConnectBroker(broker.brokerId)}
                          className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                            isConnected
                              ? 'bg-green-600 hover:bg-green-700 text-white'
                              : 'bg-blue-600 hover:bg-blue-700 text-white'
                          }`}
                        >
                          {isConnected ? 'Reconnect' : 'Connect'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full border border-gray-700">
            <h2 className="text-2xl font-bold text-white mb-6">Create New User</h2>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Email *</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Password *</label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  minLength={8}
                />
                <p className="text-xs text-gray-500 mt-1">Min 8 chars, 1 uppercase, 1 lowercase, 1 number</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Name (optional)</label>
                <input
                  type="text"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Role *</label>
                <select
                  value={newUser.role}
                  onChange={(e) =>
                    setNewUser({ ...newUser, role: e.target.value as 'admin' | 'viewer' | 'trader' | 'custom' })
                  }
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="viewer">Viewer (read-only)</option>
                  <option value="trader">Trader (paper trading)</option>
                  <option value="admin">Admin (full access)</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  disabled={creating}
                >
                  {creating ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
