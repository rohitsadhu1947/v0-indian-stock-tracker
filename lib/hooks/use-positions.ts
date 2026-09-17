'use client'

import { useCallback } from 'react'
import { usePositionsStore } from '@/lib/stores/positions-store'
import { useAuthStore } from '@/lib/stores/auth-store'
import { api } from '@/lib/api-client'

/**
 * Returns a function that reloads paper positions from the DB.
 * The caller decides when to invoke it (e.g. on mount, after a trade).
 */
export function useLoadPaperPositions() {
  const { authStatus } = useAuthStore()
  const { setPaperPositions, setIsLoadingPaperPositions } = usePositionsStore()

  return useCallback(async () => {
    if (!authStatus.authenticated) return
    setIsLoadingPaperPositions(true)
    try {
      const data = await api.get<{ success: boolean; positions: any[] }>('/api/positions/paper')
      if (data.success) {
        setPaperPositions(data.positions)
      }
    } catch {
      // swallow — caller handles errors if needed
    } finally {
      setIsLoadingPaperPositions(false)
    }
  }, [authStatus.authenticated, setPaperPositions, setIsLoadingPaperPositions])
}

/**
 * Returns a function that reloads intraday positions from the DB.
 */
export function useLoadIntradayPositions() {
  const { authStatus } = useAuthStore()
  const { setIntradayPositions, setTotalPnL } = usePositionsStore()

  return useCallback(async () => {
    if (!authStatus.authenticated) return
    try {
      const data = await api.get<{ success: boolean; positions: any[] }>('/api/positions')
      if (data.success && data.positions.length > 0) {
        const loaded = data.positions.map((pos: any) => ({
          symbol: pos.symbol,
          type: pos.positionType,
          entry_price: pos.entryPrice,
          current_price: pos.currentPrice,
          quantity: pos.quantity,
          entry_time: new Date(pos.entryTime),
          target: pos.target,
          stop_loss: pos.stopLoss,
          pnl: pos.pnl,
          pnl_percent: pos.pnlPercent,
          status: 'open' as const,
          _dbId: pos.id,
        }))
        setIntradayPositions(loaded)
        const total = loaded.reduce((sum: number, p: any) => sum + Number(p.pnl || 0), 0)
        setTotalPnL(total)
      }
    } catch {
      // swallow
    }
  }, [authStatus.authenticated, setIntradayPositions, setTotalPnL])
}
