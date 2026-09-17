import { create } from 'zustand'

interface AuthStatus {
  authenticated: boolean
  user: { userId: string } | null
}

interface AuthStore {
  authStatus: AuthStatus
  userRole: string | null
  authLoading: boolean
  isLoggingOut: boolean
  brokerExpired: boolean
  setAuthStatus: (status: AuthStatus) => void
  setUserRole: (role: string | null) => void
  setAuthLoading: (loading: boolean) => void
  setIsLoggingOut: (logging: boolean) => void
  setBrokerExpired: (expired: boolean) => void
}

export const useAuthStore = create<AuthStore>()((set) => ({
  authStatus: { authenticated: false, user: null },
  userRole: null,
  authLoading: true,
  isLoggingOut: false,
  brokerExpired: false,
  setAuthStatus: (status) => set({ authStatus: status }),
  setUserRole: (role) => set({ userRole: role }),
  setAuthLoading: (loading) => set({ authLoading: loading }),
  setIsLoggingOut: (logging) => set({ isLoggingOut: logging }),
  setBrokerExpired: (expired) => set({ brokerExpired: expired }),
}))
