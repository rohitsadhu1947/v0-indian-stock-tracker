'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/lib/stores/auth-store'
import { api } from '@/lib/api-client'

/**
 * Checks session status on mount and populates the auth store.
 * Call once at the top of the app (e.g. in page.tsx or a layout component).
 */
export function useAuthInit() {
  const { setAuthStatus, setUserRole, setAuthLoading } = useAuthStore()

  useEffect(() => {
    async function check() {
      try {
        const data = await api.get<{ authenticated: boolean; user: { userId: string } | null; role?: string }>(
          '/api/auth/me'
        )
        setAuthStatus({ authenticated: data.authenticated, user: data.user })
        setUserRole(data.role ?? null)
      } catch {
        setAuthStatus({ authenticated: false, user: null })
        setUserRole(null)
      } finally {
        setAuthLoading(false)
      }
    }
    check()
  }, [setAuthStatus, setUserRole, setAuthLoading])
}

/** Convenience selector — returns just the auth state. */
export function useAuth() {
  return useAuthStore((state) => ({
    authStatus: state.authStatus,
    userRole: state.userRole,
    authLoading: state.authLoading,
    isLoggingOut: state.isLoggingOut,
    brokerExpired: state.brokerExpired,
  }))
}
