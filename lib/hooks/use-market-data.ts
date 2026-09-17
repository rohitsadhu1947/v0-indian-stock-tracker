'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useMarketStore } from '@/lib/stores/market-store'
import { useAuthStore } from '@/lib/stores/auth-store'
import { isMarketHours } from '@/lib/intraday-utils'

/**
 * Auto-refreshes market dashboard during market hours.
 * Polls every `intervalMs` while the market is open and user is authenticated.
 */
export function useMarketDataRefresh(intervalMs = 5 * 60 * 1000) {
  const { authStatus } = useAuthStore()
  const setMarketStatus = useMarketStore((s) => s.setMarketStatus)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const tick = useCallback(() => {
    setMarketStatus(isMarketHours())
  }, [setMarketStatus])

  useEffect(() => {
    if (!authStatus.authenticated) return

    // Update market status immediately and then on interval
    tick()
    timerRef.current = setInterval(tick, intervalMs)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [authStatus.authenticated, intervalMs, tick])
}
