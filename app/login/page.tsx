'use client'

/**
 * Login Page
 * 
 * Handles both:
 * - Email/password authentication (new multi-user system)
 * - Legacy Kite Connect authentication (backward compatibility)
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'email' | 'kite'>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)

  // Check if already logged in (use unified session)
  useEffect(() => {
    async function checkAuth() {
      try {
        // Use unified session endpoint
        const res = await fetch('/api/auth/session')
        if (res.ok) {
          const data = await res.json()
          if (data.authenticated) {
            // Already logged in, redirect to home
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

  const handleKiteLogin = () => {
    // Redirect to Kite Connect OAuth
    window.location.href = '/api/auth/kite/login'
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
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            ⚡ Vibe Trades
          </h1>
          <p className="text-gray-400">
            Catch the vibe, stack the cash 💸
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-gray-800 rounded-lg shadow-2xl p-8 border border-gray-700">
          {/* Mode Toggle */}
          <div className="flex gap-2 mb-6 bg-gray-900 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setMode('email')}
              className={`flex-1 py-2 px-4 rounded-md transition-colors ${
                mode === 'email'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Email Login
            </button>
            <button
              type="button"
              onClick={() => setMode('kite')}
              className={`flex-1 py-2 px-4 rounded-md transition-colors ${
                mode === 'kite'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Kite Connect
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">
              {error}
            </div>
          )}

          {/* Email Login Form */}
          {mode === 'email' && (
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
                  placeholder="••••••••"
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
          )}

          {/* Kite Login */}
          {mode === 'kite' && (
            <div className="space-y-4">
              <p className="text-gray-400 text-sm mb-4">
                Connect with your Zerodha Kite account to access live market
                data.
              </p>

              <button
                type="button"
                onClick={handleKiteLogin}
                disabled={loading}
                className="w-full py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <span>🔐</span>
                <span>Login with Kite Connect</span>
              </button>

              <p className="text-xs text-gray-500 text-center">
                You'll be redirected to Zerodha for secure authentication
              </p>
            </div>
          )}
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

