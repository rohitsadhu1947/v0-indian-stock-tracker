'use client'

/**
 * Login Page
 *
 * Email/password authentication only.
 * Broker connections (Kite, Groww, etc.) are managed in Admin settings.
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)

  // Check if already logged in (use unified session)
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/session')
        if (res.ok) {
          const data = await res.json()
          if (data.authenticated) {
            router.push('/')
          }
        }
      } catch (err) {
        // Not logged in, stay on this page
      } finally {
        setCheckingAuth(false)
      }
    }
    checkAuth()
  }, [router])

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Login failed')
        setLoading(false)
        return
      }

      // Success! Redirect to home (use window.location for full reload with fresh cookies)
      window.location.href = '/'
    } catch (err: any) {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-black">
        <div className="text-white text-lg">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-black p-4">
      <div className="w-full max-w-md">
        {/* Header with Money Smell Branding */}
        <div className="text-center mb-8">
          <div className="mb-6 flex justify-center">
            <div className="relative w-80 h-64 bg-gradient-to-br from-orange-600 via-orange-500 to-orange-700 rounded-lg shadow-2xl border-4 border-yellow-600 hover:scale-105 transition-transform duration-300 flex flex-col items-center justify-center p-6">
              <div className="text-8xl mb-4">🧔</div>
              <div className="text-white font-black text-4xl leading-tight tracking-wider mb-3" style={{ textShadow: '3px 3px 6px rgba(0,0,0,0.5)' }}>
                DO I SMELL<br/>MONEY?
              </div>
              <div className="text-5xl">💵</div>
            </div>
          </div>

          <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-500 to-yellow-600 mb-3 drop-shadow-lg">
            DO I SMELL MONEY?
          </h1>

          <h2 className="text-2xl font-semibold text-white mb-2">
            Vibe Trades
          </h2>

          <p className="text-gray-400 text-lg">
            Catch the vibe, stack the cash
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-gray-800 rounded-lg shadow-2xl p-8 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-6">Sign In</h3>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="your@email.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="********"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-gray-500 text-sm">
          <p>Protected by multi-user authentication</p>
          <p className="mt-1">
            Need access? Contact your administrator
          </p>
        </div>
      </div>
    </div>
  )
}
