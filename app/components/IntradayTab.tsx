'use client'

import React, { memo, useEffect } from 'react'
import {
  calculateVWAP,
  generateIntradaySignal,
  checkExitSignal,
  calculatePnL,
  detectGap,
  isMarketHours,
  type Position,
  type IntradaySignal,
  type IntradayCandle,
} from '@/lib/intraday-utils'
import { fetchStockQuote } from '@/lib/stock-fetcher'
import { generateTradingSignal } from '@/lib/market-utils'
import { usePositionsStore } from '@/lib/stores/positions-store'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useWatchlistStore } from '@/lib/stores/watchlist-store'
import { useMarketStore } from '@/lib/stores/market-store'
import { useUIStore } from '@/lib/stores/ui-store'

export default memo(function IntradayTab() {
  // ── Store state ──────────────────────────────────────────────────────────
  const {
    intradayPositions, setIntradayPositions,
    intradaySignals, setIntradaySignals,
    totalPnL, setTotalPnL,
    intradayWatchlist, setIntradayWatchlist,
    intradayStockInput, setIntradayStockInput,
    exitSignals, setExitSignals,
    autoRefreshIntraday, setAutoRefreshIntraday,
    autoRefreshInterval, setAutoRefreshInterval,
    isDemoData, setIsDemoData,
    screenerLevel, setScreenerLevel,
    orbRanges, setOrbRanges,
    orbSignals, setOrbSignals,
    isCapturingORB, setIsCapturingORB,
    orbWatchlist,
    orbAutoMonitoring, setOrbAutoMonitoring,
    orbNextScanTime, setOrbNextScanTime,
    orbScanInterval,
    tradeWatch, setTradeWatch,
    entryAlerts, setEntryAlerts,
    isMonitoringWatch, setIsMonitoringWatch,
    watchMonitorInterval, setWatchMonitorInterval,
    isPaperMode,
    isExecutingTrade,
    manualEntrySymbol, setManualEntrySymbol,
    manualEntryPrice, setManualEntryPrice,
    manualEntryQuantity, setManualEntryQuantity,
    manualEntryType, setManualEntryType,
    addToPnL,
  } = usePositionsStore()

  const { authStatus, setAuthStatus } = useAuthStore()
  const { watchlist } = useWatchlistStore()
  const { marketStatus, setMarketStatus, momentumCapital } = useMarketStore()
  const { isLoading, setIsLoading } = useUIStore()

  // ── Helpers ───────────────────────────────────────────────────────────────
  // Access momentumCapital for ORB trade sizing
  const momentumCap = momentumCapital

  // ── useEffects ────────────────────────────────────────────────────────────
  // Auto-refresh positions
  useEffect(() => {
    if (!autoRefreshIntraday || intradayPositions.length === 0 || !authStatus.authenticated) return
    const id = setInterval(() => monitorPositions(), autoRefreshInterval * 1000)
    monitorPositions()
    return () => clearInterval(id)
  }, [autoRefreshIntraday, autoRefreshInterval, intradayPositions.length, authStatus.authenticated]) // eslint-disable-line

  // Auto-monitor trade watch
  useEffect(() => {
    if (!isMonitoringWatch || tradeWatch.length === 0 || !authStatus.authenticated) return
    const id = setInterval(() => monitorTradeWatch(), watchMonitorInterval * 1000)
    monitorTradeWatch()
    return () => clearInterval(id)
  }, [isMonitoringWatch, watchMonitorInterval, tradeWatch.length, authStatus.authenticated]) // eslint-disable-line

  // ORB auto-monitoring
  useEffect(() => {
    if (!orbAutoMonitoring) return
    const now = new Date()
    const h = now.getHours(); const m = now.getMinutes()
    if (h < 9 || h >= 15 || (h === 15 && m >= 30)) { setOrbAutoMonitoring(false); return }
    const id = setInterval(async () => {
      const n = new Date(); const nh = n.getHours(); const nm = n.getMinutes()
      if (nh < 9 || nh >= 15 || (nh === 15 && nm >= 30)) { setOrbAutoMonitoring(false); clearInterval(id); return }
      if (Object.keys(orbRanges).length === 0 && nh >= 9 && (nh > 9 || nm >= 30)) await captureOpeningRange()
      if (Object.keys(orbRanges).length > 0) {
        await scanORBBreakouts(true)
        const next = new Date(); next.setMinutes(next.getMinutes() + orbScanInterval); setOrbNextScanTime(next)
      }
    }, orbScanInterval * 60 * 1000)
    const next = new Date(); next.setMinutes(next.getMinutes() + orbScanInterval); setOrbNextScanTime(next)
    return () => clearInterval(id)
  }, [orbAutoMonitoring, orbScanInterval, orbRanges]) // eslint-disable-line

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Save intraday watchlist to localStorage
  useEffect(() => {
    localStorage.setItem('intradayWatchlist', JSON.stringify(intradayWatchlist))
  }, [intradayWatchlist])

  // ── Functions ─────────────────────────────────────────────────────────────
  function sendNotification(title: string, body: string) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico', badge: '/favicon.ico', requireInteraction: true })
    }
  }

  function addToIntradayWatchlist(symbol: string) {
    const s = symbol.toUpperCase().trim()
    if (!s) { alert('⚠️ Please enter a stock symbol'); return }
    if (intradayWatchlist.includes(s)) { alert(`⚠️ ${s} is already in your intraday watchlist`); return }
    setIntradayWatchlist([...intradayWatchlist, s])
    setIntradayStockInput('')
    alert(`✅ ${s} added to intraday watchlist`)
  }

  function removeFromIntradayWatchlist(symbol: string) {
    setIntradayWatchlist(intradayWatchlist.filter(s => s !== symbol))
  }

  function bulkAddToIntradayWatchlist() {
    const newStocks = watchlist.filter(s => !intradayWatchlist.includes(s))
    if (newStocks.length === 0) { alert('⚠️ All main watchlist stocks are already in intraday watchlist'); return }
    setIntradayWatchlist([...intradayWatchlist, ...newStocks])
    alert(`✅ Added ${newStocks.length} stocks from main watchlist: ${newStocks.join(', ')}`)
  }

  function clearIntradayWatchlist() {
    if (intradayWatchlist.length === 0) { alert('⚠️ Intraday watchlist is already empty'); return }
    if (confirm(`Clear all ${intradayWatchlist.length} stocks from intraday watchlist?`)) {
      setIntradayWatchlist([])
      alert('✅ Intraday watchlist cleared')
    }
  }

  async function runMorningScreener() {
    if (!authStatus.authenticated) { alert('⚠️ Please login first!'); return }
    const today = new Date().getDay()
    if (today === 0 || today === 6) { alert('⚠️ Market is closed on weekends!'); return }
    setIsLoading(true); setIsDemoData(false)
    const signals: IntradaySignal[] = []
    let authError = false
    for (const symbol of intradayWatchlist) {
      try {
        const data = await fetchStockQuote(symbol)
        if (!data) { if (!authStatus.authenticated) { authError = true; break } continue }
        const intradayRes = await fetch(`/api/market-data/intraday?instrument_token=${data.instrumentToken}&interval=5minute`)
        if (!intradayRes.ok) continue
        const intradayData = await intradayRes.json()
        const candles: IntradayCandle[] = intradayData.data.map((d: any) => ({ timestamp: new Date(d.date), open: d.open, high: d.high, low: d.low, close: d.close, volume: d.volume }))
        if (candles.length === 0) continue
        const yesterdayClose = data.prices[1] || data.current
        const gap = detectGap(yesterdayClose, candles[0].open)
        const rsi = data.prices.length >= 14 ? parseFloat(generateTradingSignal(data.current, data.prices, data.volumes).indicators.rsi) : 50
        const marketOpen = new Date(); marketOpen.setHours(9, 15, 0, 0)
        const signal = generateIntradaySignal(symbol, candles, data.current, rsi, marketOpen, screenerLevel)
        if (signal) {
          signals.push({ ...signal, reasons: [...signal.reasons, gap.hasGap ? `${gap.gapType.replace('_', ' ')}: ${gap.gapPercent > 0 ? '+' : ''}${gap.gapPercent.toFixed(2)}%` : ''].filter(Boolean) })
        }
        await new Promise(r => setTimeout(r, 500))
      } catch (err) { console.error(`Error screening ${symbol}:`, err) }
    }
    signals.sort((a, b) => b.strength - a.strength)
    setIntradaySignals(signals)
    setIsLoading(false)
    if (authError) { alert('❌ Session expired! Please login again.'); setAuthStatus({ authenticated: false, user: null }) }
    else if (signals.length === 0) { alert(`ℹ️ No signals found\n\nScreened ${intradayWatchlist.length} stocks with ${screenerLevel} criteria.`) }
  }

  function runDemoScreener() {
    setIsLoading(true); setIsDemoData(true)
    setTimeout(() => {
      const mockSignals: IntradaySignal[] = [
        { symbol: 'RELIANCE', signal_type: 'BUY', strength: 5, entry_price: 2845.50, target: 2916.63, stop_loss: 2817.05, reasons: ['Momentum: +0.85%', 'Volume: 2.8x avg', 'RSI: 58 (Good range)', 'Above VWAP (₹2,840.20)', 'Support at ₹2,815.00', 'GAP UP: +1.2%'], risk_reward: 2.5, position_size_suggested: 35 },
        { symbol: 'TCS', signal_type: 'BUY', strength: 4, entry_price: 3850.75, target: 3947.02, stop_loss: 3812.24, reasons: ['Momentum: +0.65%', 'Volume: 2.2x avg', 'RSI: 62 (Good range)', 'Above VWAP (₹3,845.30)', 'Support at ₹3,810.00'], risk_reward: 2.5, position_size_suggested: 26 },
        { symbol: 'INFY', signal_type: 'SELL', strength: 3, entry_price: 1456.30, target: 1420.10, stop_loss: 1470.92, reasons: ['Momentum: -0.72%', 'Volume: 2.5x avg', 'RSI: 68 (Near overbought)', 'Below VWAP (₹1,460.50)', 'GAP DOWN: -0.8%'], risk_reward: 2.5, position_size_suggested: 68 },
        { symbol: 'HDFCBANK', signal_type: 'BUY', strength: 5, entry_price: 1642.80, target: 1683.87, stop_loss: 1626.37, reasons: ['Momentum: +0.95%', 'Volume: 3.1x avg', 'RSI: 55 (Good range)', 'Above VWAP (₹1,638.50)', 'Support at ₹1,625.00', 'GAP UP: +1.5%'], risk_reward: 2.5, position_size_suggested: 61 },
        { symbol: 'ICICIBANK', signal_type: 'BUY', strength: 4, entry_price: 1089.20, target: 1116.44, stop_loss: 1078.31, reasons: ['Momentum: +0.55%', 'Volume: 2.6x avg', 'RSI: 60 (Good range)', 'Above VWAP (₹1,086.75)', 'Support at ₹1,077.00'], risk_reward: 2.5, position_size_suggested: 92 },
      ]
      setIntradaySignals(mockSignals); setIsLoading(false)
    }, 2000)
  }

  async function enterPosition(symbol: string, entryPrice: number, quantity: number, type: 'BUY' | 'SELL') {
    const { exchange } = useWatchlistStore.getState()
    const newPosition: Position = {
      symbol, type, entry_price: entryPrice, quantity, entry_time: new Date(),
      target: type === 'BUY' ? entryPrice * 1.025 : entryPrice * 0.975,
      stop_loss: type === 'BUY' ? entryPrice * 0.99 : entryPrice * 1.01,
      current_price: entryPrice, pnl: 0, pnl_percent: 0, status: 'open',
    }
    if (authStatus.authenticated) {
      try {
        const res = await fetch('/api/positions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol, exchange, entryPrice, quantity, positionType: type, stopLoss: newPosition.stop_loss, target: newPosition.target }) })
        const result = await res.json()
        if (result.success) (newPosition as any)._dbId = result.position.id
      } catch (err) { console.error('Error saving position:', err) }
    }
    setIntradayPositions([...intradayPositions, newPosition])
    alert(`✅ ${type} position entered: ${quantity} shares of ${symbol} at ₹${entryPrice}`)
  }

  function handleManualEntry() {
    const symbol = manualEntrySymbol.toUpperCase().trim()
    const price = parseFloat(manualEntryPrice)
    const quantity = parseInt(manualEntryQuantity)
    if (!symbol) { alert('⚠️ Please enter a stock symbol'); return }
    if (isNaN(price) || price <= 0) { alert('⚠️ Please enter a valid entry price'); return }
    if (isNaN(quantity) || quantity <= 0) { alert('⚠️ Please enter a valid quantity'); return }
    if (intradayPositions.some(p => p.symbol === symbol)) { alert(`⚠️ You already have an open position in ${symbol}`); return }
    enterPosition(symbol, price, quantity, manualEntryType)
    setManualEntrySymbol(''); setManualEntryPrice(''); setManualEntryQuantity(''); setManualEntryType('BUY')
  }

  async function exitPosition(symbol: string) {
    const position = intradayPositions.find(p => p.symbol === symbol)
    if (!position) return
    const pnl = position.pnl || 0
    if (authStatus.authenticated && (position as any)._dbId) {
      try {
        const res = await fetch(`/api/positions?id=${(position as any)._dbId}`, { method: 'DELETE' })
        const result = await res.json()
        if (!result.success) console.error('Failed to close position:', result.error)
      } catch (err) { console.error('Error closing position:', err) }
    }
    setIntradayPositions(intradayPositions.filter(p => p.symbol !== symbol))
    addToPnL(Number(pnl))
    alert(`✅ Position closed: ${symbol}\nP&L: ₹${pnl.toFixed(2)} (${((pnl / (position.entry_price * position.quantity)) * 100).toFixed(2)}%)`)
  }

  async function updatePositionPrices() {
    if (intradayPositions.length === 0) { alert('⚠️ No positions to update'); return }
    setIsLoading(true)
    try {
      const updated = await Promise.all(intradayPositions.map(async (pos) => {
        try {
          const data = await fetchStockQuote(pos.symbol)
          if (data) {
            const pnl = pos.type === 'BUY' ? (data.current - pos.entry_price) * pos.quantity : (pos.entry_price - data.current) * pos.quantity
            return { ...pos, current_price: data.current, pnl: Number(pnl), pnl_percent: Number((pnl / (pos.entry_price * pos.quantity)) * 100) }
          }
          return pos
        } catch { return pos }
      }))
      setIntradayPositions(updated)
      setTotalPnL(updated.reduce((s, p) => s + Number(p.pnl || 0), 0))
      alert('✅ Prices updated successfully!')
    } catch { alert('❌ Failed to update prices.') } finally { setIsLoading(false) }
  }

  async function monitorPositions() {
    if (intradayPositions.length === 0) return
    try {
      const newExitSignals: Record<string, any> = {}
      const updated = await Promise.all(intradayPositions.map(async (pos) => {
        try {
          const data = await fetchStockQuote(pos.symbol)
          if (data) {
            const pnl = pos.type === 'BUY' ? (data.current - pos.entry_price) * pos.quantity : (pos.entry_price - data.current) * pos.quantity
            const pnlPercent = (pnl / (pos.entry_price * pos.quantity)) * 100
            const upd = { ...pos, current_price: data.current, pnl: Number(pnl), pnl_percent: Number(pnlPercent) }
            const exitCheck = checkExitSignal(upd, data.current, new Date())
            if (exitCheck.shouldExit) {
              const sig = { shouldExit: true, reason: exitCheck.reason, strength: exitCheck.reason.includes('Stop Loss') || exitCheck.reason.includes('Time Stop') ? 5 : 3, reasons: [exitCheck.reason], pnl }
              newExitSignals[pos.symbol] = sig
              if (sig.strength >= 4) sendNotification(`🚨 EXIT SIGNAL: ${pos.symbol}`, `${exitCheck.reason} | P&L: ₹${pnl.toFixed(2)}`)
            }
            return upd
          }
          return pos
        } catch { return pos }
      }))
      setIntradayPositions(updated)
      setExitSignals(newExitSignals)
      setTotalPnL(updated.reduce((s, p) => s + Number(p.pnl || 0), 0))
    } catch (err) { console.error('Error monitoring positions:', err) }
  }

  function addMockPositions() {
    const mock: Position[] = [
      { symbol: 'RELIANCE', type: 'BUY', entry_price: 2830.50, quantity: 10, entry_time: new Date(Date.now() - 1000*60*45), target: 2901.26, stop_loss: 2802.20, current_price: 2858.20, pnl: 277.00, pnl_percent: 0.98, status: 'open' },
      { symbol: 'HDFCBANK', type: 'BUY', entry_price: 1635.80, quantity: 15, entry_time: new Date(Date.now() - 1000*60*30), target: 1676.69, stop_loss: 1619.44, current_price: 1648.50, pnl: 190.50, pnl_percent: 0.78, status: 'open' },
    ]
    setIntradayPositions(mock); setTotalPnL(467.50)
    alert('✅ Added 2 mock positions (RELIANCE & HDFCBANK)')
  }

  function clearAllPositions() {
    if (intradayPositions.length === 0) { alert('⚠️ No open positions'); return }
    if (confirm(`Close all ${intradayPositions.length} positions?`)) {
      const finalPnL = intradayPositions.reduce((s, p) => s + (p.pnl || 0), 0)
      addToPnL(Number(finalPnL)); setIntradayPositions([])
      alert(`✅ All positions closed\nTotal P&L: ₹${finalPnL.toFixed(2)}`)
    }
  }

  async function captureOpeningRange() {
    const now = new Date(); const h = now.getHours(); const m = now.getMinutes()
    if (h < 9 || (h === 9 && m < 30)) { alert('⚠️ Opening Range can only be captured after 9:30 AM'); return }
    if (h >= 11) { alert('⚠️ Too late to capture Opening Range'); return }
    setIsCapturingORB(true); setIsLoading(true)
    try {
      const ranges: Record<string, any> = {}
      const marketOpen = new Date(now); marketOpen.setHours(9, 15, 0, 0)
      const rangeEnd = new Date(now); rangeEnd.setHours(9, 30, 0, 0)
      let success = 0, fail = 0
      for (const symbol of orbWatchlist) {
        try {
          const data = await fetchStockQuote(symbol)
          if (!data) { fail++; continue }
          const res = await fetch(`/api/market-data/intraday?instrument_token=${data.instrumentToken}&interval=5minute`)
          if (!res.ok) { fail++; continue }
          const d = await res.json()
          const candles = d.data.map((c: any) => ({ timestamp: new Date(c.date), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }))
          const orb = candles.filter((c: any) => c.timestamp >= marketOpen && c.timestamp <= rangeEnd)
          if (orb.length === 0) { fail++; continue }
          const orbHigh = Math.max(...orb.map((c: any) => c.high))
          const orbLow = Math.min(...orb.map((c: any) => c.low))
          const orbOpen = orb[0].open
          ranges[symbol] = { high: orbHigh, low: orbLow, open: orbOpen, current: data.current, rangeSize: orbHigh - orbLow, rangePercent: parseFloat(((orbHigh - orbLow) / orbOpen * 100).toFixed(2)), candleCount: orb.length, rangeCaptured: true, timestamp: now, capturedAt: now.toLocaleTimeString() }
          success++
          await new Promise(r => setTimeout(r, 200))
        } catch (err) { console.error(`ORB error ${symbol}:`, err); fail++ }
      }
      setOrbRanges(ranges)
      alert(`✅ Opening Range Captured!\n\nSuccess: ${success} stocks\nFailed: ${fail} stocks`)
    } catch (err) { console.error('Error capturing ORB:', err); alert('❌ Failed to capture opening range.') }
    finally { setIsLoading(false); setIsCapturingORB(true) }
  }

  async function scanORBBreakouts(silent = false) {
    if (Object.keys(orbRanges).length === 0) { if (!silent) alert('⚠️ Please capture Opening Range first'); return }
    setIsLoading(true)
    try {
      const signals: any[] = []
      await Promise.all(Object.keys(orbRanges).map(async (symbol) => {
        try {
          const range = orbRanges[symbol]
          const data = await fetchStockQuote(symbol)
          if (data) {
            const cp = data.current; const vol = data.volume || 0; const avgVol = (vol / 2) || 1
            if (cp > range.high * 1.001) {
              const sz = range.high - range.low; const tgt = cp + sz * 1.5; const sl = range.high - sz * 0.3
              signals.push({ symbol, signal_type: 'BUY', strategy: 'ORB Bullish Breakout', entry_price: cp, target: tgt, stop_loss: sl, orb_high: range.high, orb_low: range.low, breakout_type: 'ABOVE HIGH', range_size: sz, current_price: cp, strength: vol > avgVol * 1.5 ? 5 : 4, reasons: [`Broke above ORB High (₹${range.high.toFixed(2)})`, `Current: ₹${cp.toFixed(2)}`, `Range: ₹${sz.toFixed(2)}`, vol > avgVol * 1.5 ? 'Strong Volume' : 'Moderate Volume', `Target: ₹${tgt.toFixed(2)}`, `Risk: ₹${(cp - sl).toFixed(2)}`], risk_reward: (tgt - cp) / (cp - sl) })
            } else if (cp < range.low * 0.999) {
              const sz = range.high - range.low; const tgt = cp - sz * 1.5; const sl = range.low + sz * 0.3
              signals.push({ symbol, signal_type: 'SELL', strategy: 'ORB Bearish Breakdown', entry_price: cp, target: tgt, stop_loss: sl, orb_high: range.high, orb_low: range.low, breakout_type: 'BELOW LOW', range_size: sz, current_price: cp, strength: vol > avgVol * 1.5 ? 5 : 4, reasons: [`Broke below ORB Low (₹${range.low.toFixed(2)})`, `Current: ₹${cp.toFixed(2)}`, `Range: ₹${sz.toFixed(2)}`, vol > avgVol * 1.5 ? 'Strong Volume' : 'Moderate Volume', `Target: ₹${tgt.toFixed(2)}`, `Risk: ₹${(sl - cp).toFixed(2)}`], risk_reward: (cp - tgt) / (sl - cp) })
            }
          }
        } catch (err) { console.error(`ORB scan error ${symbol}:`, err) }
      }))
      setOrbSignals(signals)
      if (!silent) {
        if (signals.length === 0) alert('📊 No ORB breakouts detected yet.')
        else alert(`🚀 Found ${signals.length} ORB Breakout Signal(s)!`)
      }
    } catch (err) { console.error('Error scanning ORB:', err); if (!silent) alert('❌ Failed to scan breakouts.') }
    finally { setIsLoading(false) }
  }

  function resetORB() {
    setOrbRanges({}); setOrbSignals([]); setIsCapturingORB(false); setOrbAutoMonitoring(false); setOrbNextScanTime(null)
    alert('✅ ORB data reset. Ready for new trading day!')
  }

  function toggleOrbAutoMonitoring() {
    if (!orbAutoMonitoring) {
      setOrbAutoMonitoring(true)
      if (Object.keys(orbRanges).length === 0) {
        const now = new Date(); const h = now.getHours(); const m = now.getMinutes()
        if (h >= 9 && (h < 11 || (h === 11 && m === 0))) {
          if (h > 9 || m >= 30) captureOpeningRange()
        }
      } else { scanORBBreakouts(true) }
    } else { setOrbAutoMonitoring(false); setOrbNextScanTime(null) }
  }

  function addToTradeWatch(symbol: string, source: string = 'manual', initialData?: any) {
    if (tradeWatch.some(w => w.symbol === symbol)) { alert(`⚠️ ${symbol} is already in Trade Watch`); return }
    if (intradayPositions.some(p => p.symbol === symbol)) { alert(`⚠️ ${symbol} is already in your open positions`); return }
    const item = { symbol, addedAt: new Date(), addedFrom: source, currentPrice: initialData?.entry_price || initialData?.current_price || 0, addedPrice: initialData?.entry_price || initialData?.current_price || 0, targetPrice: initialData?.target || 0, stopLoss: initialData?.stop_loss || 0, expectedType: initialData?.signal_type || 'BUY', conditions: { momentum: false, volume: false, rsi: false, vwap: false, support: false }, conditionsMet: 0, lastChecked: new Date() }
    setTradeWatch([...tradeWatch, item])
    alert(`✅ ${symbol} added to Trade Watch!`)
  }

  function removeFromTradeWatch(symbol: string) {
    setTradeWatch(tradeWatch.filter(w => w.symbol !== symbol))
    setEntryAlerts(entryAlerts.filter(a => a.symbol !== symbol))
  }

  function clearTradeWatch() {
    if (confirm(`Clear all ${tradeWatch.length} stocks from Trade Watch?`)) {
      setTradeWatch([]); setEntryAlerts([]); alert('✅ Trade Watch cleared')
    }
  }

  function analyzeEntryConditions(symbol: string, data: any, watchItem: any) {
    const conditions = { momentum: false, volume: false, rsi: false, vwap: false, support: false }
    const reasons: string[] = []
    let conditionsMet = 0
    const priceChange = ((data.current - data.open) / data.open) * 100
    if (watchItem.expectedType === 'BUY' && priceChange > 0.3) { conditions.momentum = true; conditionsMet++; reasons.push(`✅ Momentum: +${priceChange.toFixed(2)}%`) }
    else if (watchItem.expectedType === 'SELL' && priceChange < -0.3) { conditions.momentum = true; conditionsMet++; reasons.push(`✅ Momentum: ${priceChange.toFixed(2)}%`) }
    else { reasons.push(`⏳ Momentum: ${priceChange.toFixed(2)}% (waiting)`) }
    if (data.volume > 0) { conditions.volume = true; conditionsMet++; reasons.push('✅ Volume: Active') } else { reasons.push('⏳ Volume: Low') }
    const estimatedRSI = 50 + priceChange * 2
    if (estimatedRSI >= 45 && estimatedRSI <= 65) { conditions.rsi = true; conditionsMet++; reasons.push(`✅ RSI: ~${Math.round(estimatedRSI)} (Good range)`) } else { reasons.push(`⏳ RSI: ~${Math.round(estimatedRSI)} (waiting)`) }
    const estimatedVWAP = (data.open + data.current) / 2
    if (Math.abs(data.current - estimatedVWAP) / estimatedVWAP < 0.005) { conditions.vwap = true; conditionsMet++; reasons.push(`✅ Near VWAP (₹${estimatedVWAP.toFixed(2)})`) } else { reasons.push(`⏳ Away from VWAP (₹${estimatedVWAP.toFixed(2)})`) }
    const nearSupport = Math.abs(data.current - data.dayLow) / data.dayLow < 0.01
    const nearResistance = Math.abs(data.current - data.dayHigh) / data.dayHigh < 0.01
    if ((watchItem.expectedType === 'BUY' && nearSupport) || (watchItem.expectedType === 'SELL' && nearResistance)) { conditions.support = true; conditionsMet++; reasons.push(`✅ At key level (₹${data.current.toFixed(2)})`) } else { reasons.push('⏳ Not at key level yet') }
    const target = watchItem.expectedType === 'BUY' ? data.current * 1.025 : data.current * 0.975
    const stopLoss = watchItem.expectedType === 'BUY' ? data.current * 0.99 : data.current * 1.01
    return { conditions, conditionsMet, reasons, signalType: watchItem.expectedType, target, stopLoss }
  }

  async function monitorTradeWatch() {
    if (tradeWatch.length === 0) return
    try {
      const newAlerts: any[] = []
      const updated = await Promise.all(tradeWatch.map(async (w) => {
        try {
          const data = await fetchStockQuote(w.symbol)
          if (data) {
            const u = { ...w, currentPrice: data.current, priceChange: ((data.current - w.addedPrice) / w.addedPrice) * 100, lastChecked: new Date() }
            const analysis = analyzeEntryConditions(w.symbol, data, w)
            u.conditions = analysis.conditions; u.conditionsMet = analysis.conditionsMet
            if (analysis.conditionsMet >= 4 && !entryAlerts.some(a => a.symbol === w.symbol)) {
              newAlerts.push({ symbol: w.symbol, type: analysis.signalType, entry_price: data.current, target: analysis.target, stop_loss: analysis.stopLoss, conditions: analysis.conditions, conditionsMet: analysis.conditionsMet, reasons: analysis.reasons, strength: analysis.conditionsMet, timestamp: new Date(), risk_reward: (analysis.target - data.current) / (data.current - analysis.stopLoss) })
              sendNotification(`🚨 PERFECT ENTRY: ${w.symbol}`, `${analysis.conditionsMet}/5 conditions met! Entry: ₹${data.current.toFixed(2)}`)
            }
            return u
          }
          return w
        } catch { return w }
      }))
      setTradeWatch(updated)
      if (newAlerts.length > 0) setEntryAlerts([...entryAlerts, ...newAlerts])
    } catch (err) { console.error('Error monitoring Trade Watch:', err) }
  }

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Market Status Banner */}
      {(() => {
        const today = new Date().getDay()
        const isWeekend = today === 0 || today === 6
        if (isWeekend) {
          return (
            <div className="alert warning" style={{ background: 'rgba(255, 69, 0, 0.2)', border: '1px solid rgba(255, 69, 0, 0.5)' }}>
              <strong>🚫 Market Closed - {today === 0 ? 'Sunday' : 'Saturday'}</strong>
              <p style={{ marginTop: '10px', fontSize: '0.9em' }}>The intraday screener only works on trading days (Monday-Friday, 9:00 AM - 3:30 PM).<br />Come back on Monday to use the Morning Screener!</p>
            </div>
          )
        }
        return (
          <div className="alert" style={{ background: marketStatus.isOpen ? 'rgba(0, 255, 100, 0.2)' : 'rgba(255, 193, 7, 0.2)', border: `1px solid ${marketStatus.isOpen ? 'rgba(0, 255, 100, 0.5)' : 'rgba(255, 193, 7, 0.5)'}` }}>
            <strong>🕐 Market Status:</strong> {marketStatus.phase.toUpperCase().replace('_', ' ')}
            {marketStatus.minutesToOpen && ` - Opens in ${marketStatus.minutesToOpen} minutes`}
            {marketStatus.minutesToClose && ` - Closes in ${Math.floor(marketStatus.minutesToClose / 60)}h ${marketStatus.minutesToClose % 60}m`}
          </div>
        )
      })()}

      {/* Morning Screener Section */}
      <div className="strategy-info">
        <h3>🌅 Morning Screener (9:00-9:30 AM)</h3>
        <p><strong>Gap Up/Down:</strong> Stocks with significant overnight moves</p>
        <p><strong>High Volume:</strong> Stocks with volume {'>'} 2x average</p>
        <p><strong>Breakout Candidates:</strong> Strong momentum in first 15 minutes</p>
        <div style={{ marginTop: '15px', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
          <div style={{ marginBottom: '8px', fontSize: '0.9em', fontWeight: 'bold' }}>Select Risk Level:</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['CONSERVATIVE', 'MODERATE', 'AGGRESSIVE'] as const).map(level => {
              const colors: Record<string, { active: string; border: string; color: string; emoji: string; label: string }> = {
                CONSERVATIVE: { active: 'linear-gradient(135deg, #00ff64 0%, #00cc50 100%)', border: '#00ff64', color: '#000', emoji: '⭐⭐⭐⭐⭐', label: '(5/5 conditions)' },
                MODERATE: { active: 'linear-gradient(135deg, #ffa500 0%, #ff8c00 100%)', border: '#ffa500', color: '#000', emoji: '⭐⭐⭐', label: '(3-4/5 conditions)' },
                AGGRESSIVE: { active: 'linear-gradient(135deg, #ff0064 0%, #cc0050 100%)', border: '#ff0064', color: '#fff', emoji: '⭐', label: '(2+/5 conditions)' },
              }
              const c = colors[level]
              return (
                <button key={level} onClick={() => setScreenerLevel(level)} style={{ flex: 1, padding: '8px', fontSize: '0.85em', background: screenerLevel === level ? c.active : `rgba(${level === 'CONSERVATIVE' ? '0, 255, 100' : level === 'MODERATE' ? '255, 165, 0' : '255, 0, 100'}, 0.1)`, border: screenerLevel === level ? `2px solid ${c.border}` : `1px solid rgba(${level === 'CONSERVATIVE' ? '0, 255, 100' : level === 'MODERATE' ? '255, 165, 0' : '255, 0, 100'}, 0.3)`, color: screenerLevel === level ? c.color : '#fff', fontWeight: screenerLevel === level ? 'bold' : 'normal' }}>
                  {c.emoji}<br />{level}<br />{c.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Intraday Watchlist Manager */}
      <div className="controls" style={{ marginBottom: '20px' }}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Intraday Watchlist: ({intradayWatchlist.length} stocks)</label>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <input type="text" value={intradayStockInput} onChange={e => setIntradayStockInput(e.target.value.toUpperCase())} onKeyPress={e => { if (e.key === 'Enter') addToIntradayWatchlist(intradayStockInput) }} placeholder="Enter symbol (e.g., WIPRO)" style={{ flex: 1, padding: '10px 12px', background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '6px', color: '#fff', fontSize: '14px' }} />
            <button onClick={() => addToIntradayWatchlist(intradayStockInput)} disabled={!intradayStockInput.trim()} style={{ padding: '10px 20px', fontSize: '14px', whiteSpace: 'nowrap' }}>➕ Add</button>
            <button onClick={bulkAddToIntradayWatchlist} style={{ padding: '10px 15px', fontSize: '14px', whiteSpace: 'nowrap', background: 'rgba(79, 172, 254, 0.2)', border: '1px solid rgba(79, 172, 254, 0.5)' }} title="Import all stocks from main watchlist">📥 Import</button>
            <button onClick={clearIntradayWatchlist} disabled={intradayWatchlist.length === 0} style={{ padding: '10px 15px', fontSize: '14px', whiteSpace: 'nowrap', background: 'rgba(255, 0, 100, 0.2)', border: '1px solid rgba(255, 0, 100, 0.5)' }} title="Clear all stocks from intraday watchlist">🗑️ Clear</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '10px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px', minHeight: '50px' }}>
            {intradayWatchlist.length === 0 ? (
              <p style={{ margin: 0, color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.9em', padding: '5px' }}>No stocks in intraday watchlist. Add some above or import from main watchlist.</p>
            ) : (
              intradayWatchlist.map(symbol => (
                <span key={symbol} style={{ padding: '6px 12px', background: 'rgba(255, 165, 0, 0.2)', border: '1px solid rgba(255, 165, 0, 0.5)', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9em' }}>
                  {symbol}
                  <button onClick={() => removeFromIntradayWatchlist(symbol)} style={{ background: 'none', border: 'none', color: '#ff0064', cursor: 'pointer', padding: '0', fontSize: '16px', lineHeight: '1' }} title={`Remove ${symbol}`}>✕</button>
                </span>
              ))
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={runMorningScreener} disabled={isLoading || !authStatus.authenticated || new Date().getDay() === 0 || new Date().getDay() === 6} style={{ flex: 1, fontSize: '16px', padding: '15px' }}>
            {isLoading ? '🔍 Screening...' : (new Date().getDay() === 0 || new Date().getDay() === 6) ? '🚫 Market Closed (Weekend)' : '🚀 Run Morning Screener'}
          </button>
          <button onClick={runDemoScreener} disabled={isLoading} style={{ flex: 1, fontSize: '16px', padding: '15px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: '2px solid rgba(102, 126, 234, 0.5)' }}>
            {isLoading ? '🎬 Loading Demo...' : '🎭 Demo Mode (Test UI)'}
          </button>
        </div>

        {(new Date().getDay() === 0 || new Date().getDay() === 6) && (
          <div style={{ marginTop: '10px', padding: '12px', background: 'rgba(102, 126, 234, 0.1)', border: '1px solid rgba(102, 126, 234, 0.3)', borderRadius: '8px', textAlign: 'center' }}>
            <p style={{ color: 'rgba(255, 193, 7, 1)', fontSize: '0.9em', margin: 0, marginBottom: '5px' }}>💡 <strong>Market Closed:</strong> The screener will work on Monday morning when the market opens!</p>
            <p style={{ color: 'rgba(102, 126, 234, 1)', fontSize: '0.85em', margin: 0 }}>🎭 Try <strong>Demo Mode</strong> to see how the screener results will look!</p>
          </div>
        )}
      </div>

      {/* Intraday Signals Results */}
      <div className="screener-results">
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
          <h3 style={{ margin: 0 }}>📊 Intraday Entry Signals</h3>
          {isDemoData && (
            <span style={{ padding: '6px 12px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: '1px solid rgba(102, 126, 234, 0.5)', borderRadius: '6px', fontSize: '0.75em', fontWeight: 'bold', letterSpacing: '0.5px' }}>🎭 DEMO DATA</span>
          )}
        </div>
        {intradaySignals.length === 0 ? (
          <p>{isLoading ? 'Analyzing stocks for intraday opportunities...' : 'Click "Run Morning Screener" to find intraday trading opportunities'}</p>
        ) : (
          <div style={{ display: 'grid', gap: '20px' }}>
            {intradaySignals.map((signal, idx) => {
              const sc = signal.signal_type === 'BUY' ? { bg: 'rgba(0, 255, 100, 0.1)', border: '#00ff64', text: '#00ff64' } : { bg: 'rgba(255, 0, 100, 0.1)', border: '#ff0064', text: '#ff0064' }
              const rc = signal.risk_level === 'CONSERVATIVE' ? { bg: '#00ff64', text: '#000' } : signal.risk_level === 'MODERATE' ? { bg: '#ffa500', text: '#000' } : { bg: '#ff0064', text: '#fff' }
              return (
                <div key={idx} className="card" style={{ background: sc.bg, border: `2px solid ${sc.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <div>
                      <h2 style={{ fontSize: '1.8em', margin: 0, color: sc.text }}>{signal.symbol}</h2>
                      <div style={{ fontSize: '1.3em', fontWeight: 'bold', marginTop: '5px' }}>₹{signal.entry_price.toFixed(2)}</div>
                      {signal.risk_level && (
                        <div style={{ marginTop: '8px', padding: '4px 10px', background: rc.bg, color: rc.text, borderRadius: '6px', fontSize: '0.75em', fontWeight: 'bold', display: 'inline-block' }}>
                          {signal.risk_level} • {signal.conditions_met}/{signal.total_conditions} conditions
                        </div>
                      )}
                    </div>
                    <div style={{ padding: '10px 20px', background: sc.border, color: '#000', borderRadius: '8px', fontWeight: 'bold', fontSize: '1.2em' }}>{signal.signal_type}</div>
                  </div>
                  <div style={{ marginBottom: '15px' }}>
                    <div style={{ fontSize: '0.9em', color: 'rgba(255,255,255,0.7)', marginBottom: '5px' }}>Signal Strength:</div>
                    <div className="signal-strength">
                      {Array(5).fill('').map((_, i) => <div key={i} className={`strength-bar ${i < signal.strength ? 'filled' : ''}`} style={{ background: i < signal.strength ? sc.border : 'rgba(255,255,255,0.1)' }} />)}
                    </div>
                  </div>
                  <div className="indicators">
                    <div className="indicator"><div className="indicator-label">🎯 Target</div><div className="indicator-value" style={{ color: '#00ff64' }}>₹{signal.target.toFixed(2)}</div><div style={{ fontSize: '0.8em', color: 'rgba(255,255,255,0.6)' }}>+{((signal.target - signal.entry_price) / signal.entry_price * 100).toFixed(2)}%</div></div>
                    <div className="indicator"><div className="indicator-label">🛑 Stop Loss</div><div className="indicator-value" style={{ color: '#ff0064' }}>₹{signal.stop_loss.toFixed(2)}</div><div style={{ fontSize: '0.8em', color: 'rgba(255,255,255,0.6)' }}>-{((signal.entry_price - signal.stop_loss) / signal.entry_price * 100).toFixed(2)}%</div></div>
                    <div className="indicator"><div className="indicator-label">⚖️ Risk:Reward</div><div className="indicator-value">1:{signal.risk_reward.toFixed(2)}</div></div>
                    <div className="indicator"><div className="indicator-label">📦 Position Size</div><div className="indicator-value">{signal.position_size_suggested} shares</div></div>
                  </div>
                  <div style={{ marginTop: '15px', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.85em', color: 'rgba(255,255,255,0.7)', marginBottom: '8px' }}>✓ Entry Reasons:</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {signal.reasons.map((r, i) => <div key={i} style={{ fontSize: '0.9em' }}>• {r}</div>)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                    <button onClick={() => addToTradeWatch(signal.symbol, 'Morning Screener', signal)} style={{ flex: 1, padding: '12px', fontSize: '1em', fontWeight: 'bold', background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', border: '2px solid rgba(79, 172, 254, 0.5)', color: '#000' }}>👁️ Add to Watch</button>
                    <button onClick={() => { const { setWatchlist, watchlist: wl } = useWatchlistStore.getState(); if (!wl.includes(signal.symbol)) setWatchlist([...wl, signal.symbol]) }} style={{ flex: 1, padding: '12px', fontSize: '1em', fontWeight: 'bold' }}>📊 Add to List</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Info Box */}
      <div style={{ marginTop: '20px', padding: '15px', background: 'rgba(79, 172, 254, 0.1)', border: '1px solid rgba(79, 172, 254, 0.3)', borderRadius: '10px' }}>
        <h4 style={{ marginBottom: '10px' }}>📚 How to Use Morning Screener:</h4>
        <ol style={{ marginLeft: '20px', lineHeight: '1.8' }}>
          <li><strong>Best Time:</strong> Run between 9:00-9:30 AM for pre-market analysis</li>
          <li><strong>Entry Conditions:</strong> All 5 conditions must match (Momentum, Volume, RSI, VWAP, Support)</li>
          <li><strong>Risk Management:</strong> Always use suggested stop-loss and targets</li>
          <li><strong>Position Sizing:</strong> Follow the suggested position size (1% risk per trade)</li>
          <li><strong>Exit Strategy:</strong> Exit at target (2-3%), stop-loss (0.5-1%), or 3:00 PM</li>
        </ol>
      </div>

      {/* ORB Scanner */}
      <div style={{ marginTop: '40px', borderTop: '2px solid rgba(255, 193, 7, 0.3)', paddingTop: '30px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <h2 style={{ fontSize: '1.8em', marginBottom: '8px' }}>🎯 Opening Range Breakout (ORB)</h2>
            <p style={{ color: 'rgba(255, 255, 255, 0.7)', margin: 0, fontSize: '0.95em' }}>Capture first 15 minutes (9:15-9:30 AM) and detect breakouts for high-probability trades</p>
          </div>
          <button onClick={resetORB} disabled={Object.keys(orbRanges).length === 0} style={{ padding: '10px 20px', fontSize: '0.9em', background: 'rgba(255, 193, 7, 0.2)', border: '1px solid rgba(255, 193, 7, 0.5)', borderRadius: '8px', cursor: Object.keys(orbRanges).length === 0 ? 'not-allowed' : 'pointer', opacity: Object.keys(orbRanges).length === 0 ? 0.5 : 1 }}>🔄 Reset ORB</button>
        </div>

        <div style={{ padding: '25px', background: 'linear-gradient(135deg, rgba(255, 193, 7, 0.15) 0%, rgba(255, 152, 0, 0.1) 100%)', border: '2px solid rgba(255, 193, 7, 0.4)', borderRadius: '12px', marginBottom: '25px' }}>
          <h3 style={{ marginBottom: '15px', fontSize: '1.3em' }}>{isCapturingORB ? '✅ ORB Captured - Monitoring for Breakouts' : '📊 Step 1: Capture Opening Range'}</h3>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={captureOpeningRange} disabled={isLoading || isCapturingORB} style={{ flex: 1, minWidth: '200px', padding: '14px 20px', fontSize: '16px', fontWeight: 'bold', background: isCapturingORB ? 'rgba(0, 255, 100, 0.2)' : 'linear-gradient(135deg, #ffa500 0%, #ff8c00 100%)', border: isCapturingORB ? '2px solid #00ff64' : '2px solid rgba(255, 193, 7, 0.5)', color: isCapturingORB ? '#00ff64' : '#000', borderRadius: '8px', cursor: (isLoading || isCapturingORB) ? 'not-allowed' : 'pointer', opacity: (isLoading || isCapturingORB) ? 0.6 : 1 }}>
              {isLoading ? '⏳ Capturing...' : isCapturingORB ? '✅ ORB Captured' : '📊 Capture ORB (9:15-9:30 AM)'}
            </button>
            <button onClick={() => scanORBBreakouts()} disabled={!isCapturingORB || isLoading} style={{ flex: 1, minWidth: '200px', padding: '14px 20px', fontSize: '16px', fontWeight: 'bold', background: (!isCapturingORB || isLoading) ? 'rgba(255, 255, 255, 0.1)' : 'linear-gradient(135deg, #00ff64 0%, #00cc50 100%)', border: (!isCapturingORB || isLoading) ? '1px solid rgba(255, 255, 255, 0.2)' : '2px solid #00ff64', color: (!isCapturingORB || isLoading) ? 'rgba(255, 255, 255, 0.5)' : '#000', borderRadius: '8px', cursor: (!isCapturingORB || isLoading) ? 'not-allowed' : 'pointer' }}>
              {isLoading ? '⏳ Scanning...' : '🚀 Scan for Breakouts'}
            </button>
            <button onClick={toggleOrbAutoMonitoring} disabled={!isCapturingORB} style={{ flex: 1, minWidth: '220px', padding: '14px 20px', fontSize: '16px', fontWeight: 'bold', background: !isCapturingORB ? 'rgba(255, 255, 255, 0.1)' : orbAutoMonitoring ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: !isCapturingORB ? '1px solid rgba(255, 255, 255, 0.2)' : orbAutoMonitoring ? '2px solid #10B981' : '2px solid #667eea', color: !isCapturingORB ? 'rgba(255, 255, 255, 0.5)' : '#fff', borderRadius: '8px', cursor: !isCapturingORB ? 'not-allowed' : 'pointer', boxShadow: orbAutoMonitoring && isCapturingORB ? '0 4px 15px rgba(16, 185, 129, 0.4)' : 'none', transition: 'all 0.3s ease' }}>
              {orbAutoMonitoring ? '⏸️ Stop Auto-Scan' : '🤖 Auto-Scan Every 5min'}
            </button>
          </div>
          {orbAutoMonitoring && orbNextScanTime && (
            <div style={{ marginTop: '15px', padding: '12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', fontSize: '0.9em', color: '#10B981', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.2em' }}>⏰</span>
              <span><strong>Auto-Monitoring Active</strong> - Next scan at {orbNextScanTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          )}
          <div style={{ marginTop: '15px', fontSize: '0.9em', color: 'rgba(255, 255, 255, 0.8)' }}>
            <strong>Monitoring:</strong> {orbWatchlist.join(', ')}
          </div>
        </div>

        {Object.keys(orbRanges).length > 0 && (
          <div style={{ marginBottom: '25px' }}>
            <h3 style={{ marginBottom: '15px', fontSize: '1.2em' }}>📏 Opening Ranges (9:15-9:30 AM)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px' }}>
              {Object.entries(orbRanges).map(([symbol, range]) => (
                <div key={symbol} style={{ padding: '15px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '10px' }}>
                  <h4 style={{ marginBottom: '10px', fontSize: '1.1em' }}>{symbol}</h4>
                  <div style={{ fontSize: '0.9em', lineHeight: '1.8' }}>
                    <div>🔼 High: <strong style={{ color: '#00ff64' }}>₹{range.high.toFixed(2)}</strong></div>
                    <div>🔽 Low: <strong style={{ color: '#ff0064' }}>₹{range.low.toFixed(2)}</strong></div>
                    <div>📊 Range: ₹{(range.high - range.low).toFixed(2)}</div>
                    <div style={{ fontSize: '0.85em', color: 'rgba(255, 255, 255, 0.6)', marginTop: '5px' }}>{range.timestamp.toLocaleTimeString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {orbSignals.length > 0 ? (
          <div>
            <h3 style={{ marginBottom: '15px', fontSize: '1.2em', color: '#ffa500' }}>🚀 ORB Breakout Signals ({orbSignals.length})</h3>
            <div style={{ display: 'grid', gap: '20px' }}>
              {orbSignals.map((signal, idx) => {
                const sc = signal.signal_type === 'BUY' ? { bg: 'rgba(0, 255, 100, 0.1)', border: '#00ff64', text: '#00ff64' } : { bg: 'rgba(255, 0, 100, 0.1)', border: '#ff0064', text: '#ff0064' }
                return (
                  <div key={idx} className="card" style={{ background: sc.bg, border: `2px solid ${sc.border}`, position: 'relative' }}>
                    <div style={{ position: 'absolute', top: '15px', right: '15px', padding: '8px 16px', background: sc.border, color: '#000', borderRadius: '8px', fontSize: '0.9em', fontWeight: 'bold' }}>{signal.signal_type}</div>
                    <div style={{ marginBottom: '15px' }}>
                      <h2 style={{ fontSize: '2em', margin: 0, marginBottom: '5px' }}>{signal.symbol}</h2>
                      <div style={{ fontSize: '1.1em', color: 'rgba(255, 255, 255, 0.8)', fontWeight: 'bold' }}>{signal.strategy}</div>
                      <div style={{ fontSize: '0.9em', color: 'rgba(255, 255, 255, 0.6)', marginTop: '5px' }}>Breakout: {signal.breakout_type}</div>
                    </div>
                    <div className="indicators">
                      <div className="indicator"><div className="indicator-label">💰 Entry</div><div className="indicator-value">₹{signal.entry_price.toFixed(2)}</div></div>
                      <div className="indicator"><div className="indicator-label">🎯 Target</div><div className="indicator-value" style={{ color: '#00ff64' }}>₹{signal.target.toFixed(2)}</div><div style={{ fontSize: '0.8em', color: 'rgba(255, 255, 255, 0.6)' }}>+{(Math.abs(signal.target - signal.entry_price) / signal.entry_price * 100).toFixed(2)}%</div></div>
                      <div className="indicator"><div className="indicator-label">🛑 Stop Loss</div><div className="indicator-value" style={{ color: '#ff0064' }}>₹{signal.stop_loss.toFixed(2)}</div><div style={{ fontSize: '0.8em', color: 'rgba(255, 255, 255, 0.6)' }}>-{(Math.abs(signal.entry_price - signal.stop_loss) / signal.entry_price * 100).toFixed(2)}%</div></div>
                      <div className="indicator"><div className="indicator-label">⚖️ Risk:Reward</div><div className="indicator-value">1:{signal.risk_reward.toFixed(2)}</div></div>
                    </div>
                    <div style={{ marginTop: '15px', marginBottom: '15px' }}>
                      <div style={{ fontSize: '0.9em', marginBottom: '5px', color: 'rgba(255, 255, 255, 0.7)' }}>Signal Strength: {signal.strength}/5</div>
                      <div className="signal-strength">{Array(5).fill('').map((_, i) => <div key={i} className={`strength-bar ${i < signal.strength ? 'filled' : ''}`} style={{ background: i < signal.strength ? sc.border : 'rgba(255,255,255,0.1)' }} />)}</div>
                    </div>
                    <div style={{ padding: '15px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '10px', marginBottom: '15px' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '0.95em' }}>📏 ORB Levels:</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.9em' }}>
                        <div>ORB High: ₹{signal.orb_high.toFixed(2)}</div>
                        <div>ORB Low: ₹{signal.orb_low.toFixed(2)}</div>
                        <div>Range Size: ₹{signal.range_size.toFixed(2)}</div>
                        <div>Breakout: {signal.breakout_type}</div>
                      </div>
                    </div>
                    <div style={{ padding: '15px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '10px', marginBottom: '15px' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Why this signal:</div>
                      <div style={{ lineHeight: '1.8' }}>{signal.reasons.map((r: string, i: number) => <div key={i} style={{ fontSize: '0.9em' }}>• {r}</div>)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                      <button onClick={async () => {
                          const posSize = Math.max(1, Math.floor((momentumCap * 0.02) / Math.abs(signal.entry_price - signal.stop_loss)))
                          try {
                            const res = await fetch('/api/positions/paper', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                symbol: signal.symbol,
                                exchange: 'NSE',
                                positionType: signal.signal_type === 'BUY' ? 'LONG' : 'SHORT',
                                entryPrice: signal.entry_price,
                                quantity: posSize,
                                stopLoss: signal.stop_loss,
                                target1: signal.target,
                                target2: signal.target,
                                capitalRequired: posSize * signal.entry_price,
                                riskAmount: posSize * Math.abs(signal.entry_price - signal.stop_loss),
                                strategy: 'ORB',
                                momentumScore: signal.strength * 20,
                                confidence: signal.strength * 20,
                                reasons: signal.reasons,
                                tradeType: 'ORB',
                                notes: `ORB ${signal.breakout_type} breakout`
                              })
                            })
                            if (res.ok) {
                              alert(`✅ ORB paper trade executed!\n${signal.symbol} ${signal.signal_type} @ ₹${signal.entry_price}`)
                            } else {
                              const err = await res.json()
                              alert(`❌ Failed: ${err.error}`)
                            }
                          } catch (e: any) {
                            alert(`❌ Error: ${e.message}`)
                          }
                        }} disabled={isExecutingTrade || !isPaperMode} style={{ flex: 2, padding: '16px', fontSize: '1.1em', fontWeight: 'bold', background: isPaperMode ? (isExecutingTrade ? '#666' : `linear-gradient(135deg, ${sc.border} 0%, ${signal.signal_type === 'BUY' ? '#10B981' : '#EF4444'} 100%)`) : 'rgba(100, 100, 100, 0.3)', border: isPaperMode ? 'none' : '2px solid #666', color: '#fff', borderRadius: '10px', cursor: isPaperMode ? (isExecutingTrade ? 'wait' : 'pointer') : 'not-allowed', opacity: (isExecutingTrade || !isPaperMode) ? 0.5 : 1, transition: 'all 0.3s ease' }}>
                        {isExecutingTrade ? '⏳ Executing...' : `⚡ Execute ${signal.signal_type} Trade`}
                      </button>
                      <button onClick={() => addToTradeWatch(signal.symbol, 'ORB Scanner', signal)} style={{ flex: 1, padding: '14px', fontSize: '0.95em', fontWeight: 'bold', background: 'rgba(79, 172, 254, 0.15)', border: '2px solid rgba(79, 172, 254, 0.5)', color: '#4facfe', borderRadius: '8px', cursor: 'pointer' }}>👁️ Watch</button>
                    </div>
                    {!isPaperMode && (<div style={{ marginTop: '10px', padding: '10px', background: 'rgba(255, 193, 7, 0.1)', border: '1px solid rgba(255, 193, 7, 0.3)', borderRadius: '6px', fontSize: '0.85em', color: '#FFC107', textAlign: 'center' }}>⚠️ Enable Paper Mode to execute trades</div>)}
                  </div>
                )
              })}
            </div>
          </div>
        ) : isCapturingORB ? (
          <div style={{ padding: '30px', textAlign: 'center', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '12px', border: '1px dashed rgba(255, 255, 255, 0.2)' }}>
            <div style={{ fontSize: '2.5em', marginBottom: '15px' }}>📊</div>
            <h3>ORB Captured - Monitoring for Breakouts</h3>
            <p style={{ color: 'rgba(255, 255, 255, 0.6)', marginBottom: '20px' }}>Click "🚀 Scan for Breakouts" to check if any stock has broken out of the opening range.</p>
          </div>
        ) : null}

        <div style={{ marginTop: '25px', padding: '15px', background: 'rgba(255, 193, 7, 0.1)', border: '1px solid rgba(255, 193, 7, 0.3)', borderRadius: '10px' }}>
          <h4 style={{ marginBottom: '10px' }}>📚 How to Use ORB Scanner:</h4>
          <ol style={{ marginLeft: '20px', lineHeight: '1.8' }}>
            <li><strong>9:15-9:30 AM:</strong> Click "📊 Capture ORB" during first 15 minutes</li>
            <li><strong>9:30+ AM:</strong> Click "🚀 Scan for Breakouts" every 5-10 minutes</li>
            <li><strong>Entry:</strong> Enter when price breaks above High (BUY) or below Low (SELL)</li>
            <li><strong>Target:</strong> 1.5x the opening range size</li>
            <li><strong>Stop-Loss:</strong> Below breakout level (30% of range)</li>
            <li><strong>Best Results:</strong> Trending days, high volume stocks, clear breakouts</li>
          </ol>
        </div>
      </div>

      {/* Trade Watch Section */}
      <div style={{ marginTop: '40px', borderTop: '2px solid rgba(79, 172, 254, 0.3)', paddingTop: '30px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <h2 style={{ fontSize: '1.8em', marginBottom: '8px' }}>👁️ Trade Watch - Smart Monitor</h2>
            <p style={{ color: 'rgba(255, 255, 255, 0.7)', margin: 0, fontSize: '0.95em' }}>Add interesting stocks here - system monitors continuously and alerts when perfect entry conditions appear</p>
          </div>
          <button onClick={clearTradeWatch} disabled={tradeWatch.length === 0} style={{ padding: '10px 20px', fontSize: '0.9em', background: 'rgba(255, 0, 100, 0.2)', border: '1px solid rgba(255, 0, 100, 0.5)', borderRadius: '8px', cursor: tradeWatch.length === 0 ? 'not-allowed' : 'pointer', opacity: tradeWatch.length === 0 ? 0.5 : 1 }}>🗑️ Clear All</button>
        </div>

        <div style={{ padding: '25px', background: 'linear-gradient(135deg, rgba(79, 172, 254, 0.15) 0%, rgba(99, 102, 241, 0.1) 100%)', border: '2px solid rgba(79, 172, 254, 0.4)', borderRadius: '12px', marginBottom: '25px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={isMonitoringWatch} onChange={e => setIsMonitoringWatch(e.target.checked)} disabled={tradeWatch.length === 0} style={{ width: '18px', height: '18px', cursor: tradeWatch.length === 0 ? 'not-allowed' : 'pointer' }} />
              <span style={{ fontWeight: 'bold', fontSize: '15px' }}>👁️ Auto-Monitor for Entry Signals</span>
            </label>
            {isMonitoringWatch && (
              <>
                <div style={{ height: '20px', width: '1px', background: 'rgba(255, 255, 255, 0.3)' }} />
                <div>
                  <label style={{ marginRight: '8px', fontSize: '14px' }}>Check Every:</label>
                  <select value={watchMonitorInterval} onChange={e => setWatchMonitorInterval(Number(e.target.value))} style={{ padding: '6px 12px', background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.3)', borderRadius: '6px', color: '#fff', fontSize: '14px', cursor: 'pointer' }}>
                    <option value={60} style={{ background: '#1a1a1a' }}>1 minute</option>
                    <option value={120} style={{ background: '#1a1a1a' }}>2 minutes</option>
                    <option value={180} style={{ background: '#1a1a1a' }}>3 minutes</option>
                    <option value={300} style={{ background: '#1a1a1a' }}>5 minutes</option>
                  </select>
                </div>
                <div style={{ height: '20px', width: '1px', background: 'rgba(255, 255, 255, 0.3)' }} />
                <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.8)' }}>✅ Monitoring {tradeWatch.length} stock{tradeWatch.length !== 1 ? 's' : ''} - Will alert on perfect entry</div>
              </>
            )}
          </div>
          {!isMonitoringWatch && tradeWatch.length > 0 && (<div style={{ marginTop: '10px', fontSize: '13px', color: 'rgba(255, 255, 255, 0.6)' }}>💡 Enable monitoring to get alerts when entry conditions become perfect (4-5/5 conditions met)</div>)}
          {tradeWatch.length === 0 && (<div style={{ marginTop: '10px', fontSize: '13px', color: 'rgba(255, 255, 255, 0.6)' }}>💡 Add stocks from Morning Screener or ORB signals using "📊 Add to Watch" button</div>)}
        </div>

        {entryAlerts.length > 0 && (
          <div style={{ marginBottom: '25px' }}>
            <h3 style={{ marginBottom: '15px', fontSize: '1.3em', color: '#00ff64' }}>🚨 PERFECT ENTRY OPPORTUNITIES ({entryAlerts.length})</h3>
            <div style={{ display: 'grid', gap: '20px' }}>
              {entryAlerts.map((alertItem, idx) => {
                const sc = alertItem.type === 'BUY' ? { bg: 'rgba(0, 255, 100, 0.2)', border: '#00ff64', text: '#00ff64' } : { bg: 'rgba(255, 0, 100, 0.2)', border: '#ff0064', text: '#ff0064' }
                return (
                  <div key={idx} className="card" style={{ background: sc.bg, border: `3px solid ${sc.border}`, position: 'relative', animation: 'pulse 2s ease-in-out infinite' }}>
                    <div style={{ position: 'absolute', top: '15px', right: '15px', padding: '10px 20px', background: sc.border, color: '#000', borderRadius: '8px', fontSize: '1em', fontWeight: 'bold', animation: 'flash 1s ease-in-out infinite' }}>🚨 {alertItem.type} NOW!</div>
                    <div style={{ marginBottom: '15px' }}>
                      <h2 style={{ fontSize: '2.2em', margin: 0, marginBottom: '5px' }}>{alertItem.symbol}</h2>
                      <div style={{ fontSize: '1.2em', color: sc.text, fontWeight: 'bold' }}>✅ ALL CONDITIONS MET - PERFECT ENTRY!</div>
                      <div style={{ fontSize: '0.9em', color: 'rgba(255, 255, 255, 0.6)', marginTop: '5px' }}>{alertItem.timestamp.toLocaleTimeString()}</div>
                    </div>
                    <div className="indicators">
                      <div className="indicator"><div className="indicator-label">💰 Entry NOW</div><div className="indicator-value" style={{ color: sc.text }}>₹{alertItem.entry_price.toFixed(2)}</div></div>
                      <div className="indicator"><div className="indicator-label">🎯 Target</div><div className="indicator-value" style={{ color: '#00ff64' }}>₹{alertItem.target.toFixed(2)}</div><div style={{ fontSize: '0.8em', color: 'rgba(255, 255, 255, 0.6)' }}>+{((alertItem.target - alertItem.entry_price) / alertItem.entry_price * 100).toFixed(2)}%</div></div>
                      <div className="indicator"><div className="indicator-label">🛑 Stop Loss</div><div className="indicator-value" style={{ color: '#ff0064' }}>₹{alertItem.stop_loss.toFixed(2)}</div><div style={{ fontSize: '0.8em', color: 'rgba(255, 255, 255, 0.6)' }}>-{((alertItem.entry_price - alertItem.stop_loss) / alertItem.entry_price * 100).toFixed(2)}%</div></div>
                      <div className="indicator"><div className="indicator-label">⚖️ Risk:Reward</div><div className="indicator-value">1:{alertItem.risk_reward.toFixed(2)}</div></div>
                    </div>
                    <div style={{ padding: '15px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '10px', marginTop: '15px', marginBottom: '15px' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '10px', fontSize: '1em' }}>✅ {alertItem.conditionsMet}/5 Conditions Met:</div>
                      <div style={{ lineHeight: '1.8' }}>{alertItem.reasons.map((r: string, i: number) => <div key={i} style={{ fontSize: '0.95em' }}>{r}</div>)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={() => { setManualEntrySymbol(alertItem.symbol); setManualEntryPrice(alertItem.entry_price.toString()); setManualEntryQuantity(''); setManualEntryType(alertItem.type as 'BUY' | 'SELL'); removeFromTradeWatch(alertItem.symbol); alert(`✅ Pre-filled entry form!\n\nScroll to "Add Position Manually" and enter quantity.`) }} style={{ flex: 1, padding: '16px', fontSize: '1.2em', fontWeight: 'bold', background: sc.border, color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>🚀 ENTER NOW ({alertItem.type})</button>
                      <button onClick={() => setEntryAlerts(entryAlerts.filter((_, i) => i !== idx))} style={{ padding: '16px 20px', fontSize: '1em', background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.3)', borderRadius: '8px', cursor: 'pointer' }}>✖️</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {tradeWatch.length > 0 ? (
          <div>
            <h3 style={{ marginBottom: '15px', fontSize: '1.2em' }}>📊 Watching ({tradeWatch.length})</h3>
            <div style={{ display: 'grid', gap: '15px' }}>
              {tradeWatch.map((w, idx) => {
                const priceChangeColor = w.priceChange >= 0 ? '#00ff64' : '#ff0064'
                const pct = (w.conditionsMet / 5) * 100
                return (
                  <div key={idx} style={{ padding: '20px', background: 'rgba(255, 255, 255, 0.05)', border: `2px solid ${pct >= 80 ? '#00ff64' : 'rgba(255, 255, 255, 0.2)'}`, borderRadius: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
                      <div>
                        <h3 style={{ fontSize: '1.5em', margin: 0, marginBottom: '5px' }}>{w.symbol}</h3>
                        <div style={{ fontSize: '0.85em', color: 'rgba(255, 255, 255, 0.6)' }}>Added from: {w.addedFrom} • Expected: {w.expectedType}</div>
                      </div>
                      <button onClick={() => removeFromTradeWatch(w.symbol)} style={{ padding: '8px 16px', fontSize: '0.9em', background: 'rgba(255, 0, 100, 0.2)', border: '1px solid rgba(255, 0, 100, 0.5)', borderRadius: '6px', cursor: 'pointer' }}>✖️ Remove</button>
                    </div>
                    <div style={{ marginBottom: '15px' }}>
                      <div style={{ fontSize: '1.8em', fontWeight: 'bold' }}>₹{w.currentPrice.toFixed(2)}</div>
                      <div style={{ fontSize: '0.95em', color: priceChangeColor }}>{w.priceChange >= 0 ? '+' : ''}{w.priceChange?.toFixed(2)}% from add price</div>
                    </div>
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                        <span style={{ fontSize: '0.9em', fontWeight: 'bold' }}>Entry Conditions: {w.conditionsMet}/5</span>
                        <span style={{ fontSize: '0.9em', color: pct >= 80 ? '#00ff64' : 'rgba(255, 255, 255, 0.7)' }}>{pct.toFixed(0)}%</span>
                      </div>
                      <div style={{ width: '100%', height: '10px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '5px', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: pct >= 80 ? '#00ff64' : '#4facfe', transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', fontSize: '0.85em' }}>
                      {(['momentum', 'volume', 'rsi', 'vwap', 'support'] as const).map(k => (
                        <div key={k} style={{ textAlign: 'center', color: w.conditions?.[k] ? '#00ff64' : 'rgba(255, 255, 255, 0.5)' }}>
                          {w.conditions?.[k] ? '✅' : '⏳'} {k.charAt(0).toUpperCase() + k.slice(1)}
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: '10px', fontSize: '0.8em', color: 'rgba(255, 255, 255, 0.5)' }}>Last checked: {w.lastChecked?.toLocaleTimeString()}</div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div style={{ padding: '40px', textAlign: 'center', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '12px', border: '1px dashed rgba(255, 255, 255, 0.2)' }}>
            <div style={{ fontSize: '3em', marginBottom: '15px' }}>👁️</div>
            <h3 style={{ marginBottom: '10px' }}>No Stocks in Trade Watch</h3>
            <p style={{ color: 'rgba(255, 255, 255, 0.6)', marginBottom: '20px', maxWidth: '600px', margin: '0 auto 20px' }}>Add stocks from Morning Screener or ORB signals that you're interested in but not ready to enter yet. System will monitor them and alert you when ALL entry conditions become perfect!</p>
          </div>
        )}

        <div style={{ marginTop: '25px', padding: '15px', background: 'rgba(79, 172, 254, 0.1)', border: '1px solid rgba(79, 172, 254, 0.3)', borderRadius: '10px' }}>
          <h4 style={{ marginBottom: '10px' }}>📚 How Trade Watch Works:</h4>
          <ol style={{ marginLeft: '20px', lineHeight: '1.8' }}>
            <li><strong>Morning:</strong> Run screeners → See interesting stocks → Click "📊 Add to Watch"</li>
            <li><strong>Auto-Monitor:</strong> System checks every 1-5 minutes for perfect entry conditions</li>
            <li><strong>Entry Conditions:</strong> Momentum, Volume, RSI, VWAP, Support (needs 4-5/5)</li>
            <li><strong>Alert:</strong> When conditions met → 🚨 Flashing card appears + browser notification</li>
            <li><strong>Enter:</strong> One-click to pre-fill entry form → Add quantity → Execute!</li>
            <li><strong>Benefits:</strong> No manual checking, never miss perfect entries, focus on your work!</li>
          </ol>
        </div>
      </div>

      {/* Position Tracking Section */}
      <div style={{ marginTop: '40px', borderTop: '2px solid rgba(255, 255, 255, 0.1)', paddingTop: '30px' }}>
        <h2 style={{ fontSize: '1.8em', marginBottom: '20px' }}>📊 Position Tracking</h2>
        <div style={{ padding: '20px', background: totalPnL >= 0 ? 'linear-gradient(135deg, rgba(0, 255, 100, 0.2) 0%, rgba(0, 200, 80, 0.1) 100%)' : 'linear-gradient(135deg, rgba(255, 0, 100, 0.2) 0%, rgba(200, 0, 80, 0.1) 100%)', border: `2px solid ${totalPnL >= 0 ? '#00ff64' : '#ff0064'}`, borderRadius: '12px', marginBottom: '25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.9em', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '5px' }}>Today's Total P&L</div>
            <div style={{ fontSize: '2.2em', fontWeight: 'bold', color: totalPnL >= 0 ? '#00ff64' : '#ff0064' }}>{totalPnL >= 0 ? '+' : ''}₹{Number(totalPnL).toFixed(2)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.9em', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '5px' }}>Open Positions</div>
            <div style={{ fontSize: '1.8em', fontWeight: 'bold' }}>{intradayPositions.length}</div>
          </div>
        </div>

        {/* Manual Entry Form */}
        <div style={{ padding: '20px', background: 'rgba(79, 172, 254, 0.1)', border: '1px solid rgba(79, 172, 254, 0.3)', borderRadius: '12px', marginBottom: '25px' }}>
          <h4 style={{ marginBottom: '15px', fontSize: '1.1em' }}>📝 Enter Position Manually</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: '10px', alignItems: 'end' }}>
            <div><label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9em' }}>Symbol</label><input type="text" value={manualEntrySymbol} onChange={e => setManualEntrySymbol(e.target.value.toUpperCase())} placeholder="e.g., RELIANCE" style={{ width: '100%', padding: '10px', background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '6px', color: '#fff', fontSize: '14px' }} /></div>
            <div><label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9em' }}>Entry Price</label><input type="number" step="0.01" value={manualEntryPrice} onChange={e => setManualEntryPrice(e.target.value)} placeholder="₹" style={{ width: '100%', padding: '10px', background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '6px', color: '#fff', fontSize: '14px' }} /></div>
            <div><label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9em' }}>Quantity</label><input type="number" value={manualEntryQuantity} onChange={e => setManualEntryQuantity(e.target.value)} placeholder="Qty" style={{ width: '100%', padding: '10px', background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '6px', color: '#fff', fontSize: '14px' }} /></div>
            <div><label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9em' }}>Type</label><select value={manualEntryType} onChange={e => setManualEntryType(e.target.value as 'BUY' | 'SELL')} style={{ width: '100%', padding: '10px', background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '6px', color: '#fff', fontSize: '14px' }}><option value="BUY" style={{ background: '#1a1a1a' }}>BUY</option><option value="SELL" style={{ background: '#1a1a1a' }}>SELL</option></select></div>
            <button onClick={handleManualEntry} disabled={!manualEntrySymbol || !manualEntryPrice || !manualEntryQuantity} style={{ padding: '10px 20px', fontSize: '14px', fontWeight: 'bold', background: manualEntryType === 'BUY' ? 'linear-gradient(135deg, #00ff64 0%, #00cc50 100%)' : 'linear-gradient(135deg, #ff0064 0%, #cc0050 100%)', border: 'none', borderRadius: '6px', color: '#000', cursor: !manualEntrySymbol || !manualEntryPrice || !manualEntryQuantity ? 'not-allowed' : 'pointer', opacity: !manualEntrySymbol || !manualEntryPrice || !manualEntryQuantity ? 0.5 : 1 }}>{manualEntryType === 'BUY' ? '📈 BUY' : '📉 SELL'}</button>
          </div>
        </div>

        {/* Auto-Refresh Controls */}
        <div style={{ padding: '20px', background: 'rgba(79, 172, 254, 0.1)', border: '2px solid rgba(79, 172, 254, 0.3)', borderRadius: '12px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={autoRefreshIntraday} onChange={e => setAutoRefreshIntraday(e.target.checked)} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
              <span style={{ fontWeight: 'bold', fontSize: '15px' }}>🤖 Auto-Monitor Positions</span>
            </label>
            {autoRefreshIntraday && (
              <>
                <div style={{ height: '20px', width: '1px', background: 'rgba(255, 255, 255, 0.3)' }} />
                <div>
                  <label style={{ marginRight: '8px', fontSize: '14px' }}>Update Every:</label>
                  <select value={autoRefreshInterval} onChange={e => setAutoRefreshInterval(Number(e.target.value))} style={{ padding: '6px 12px', background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.3)', borderRadius: '6px', color: '#fff', fontSize: '14px', cursor: 'pointer' }}>
                    <option value={30} style={{ background: '#1a1a1a' }}>30 seconds</option>
                    <option value={60} style={{ background: '#1a1a1a' }}>1 minute</option>
                    <option value={120} style={{ background: '#1a1a1a' }}>2 minutes</option>
                    <option value={300} style={{ background: '#1a1a1a' }}>5 minutes</option>
                  </select>
                </div>
                <div style={{ height: '20px', width: '1px', background: 'rgba(255, 255, 255, 0.3)' }} />
                <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.8)' }}>✅ Monitoring active - Exit signals will show automatically</div>
              </>
            )}
          </div>
          {!autoRefreshIntraday && (<div style={{ marginTop: '10px', fontSize: '13px', color: 'rgba(255, 255, 255, 0.6)' }}>💡 Enable to get real-time exit alerts based on targets, stop-loss, and momentum shifts</div>)}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '25px' }}>
          <button onClick={addMockPositions} disabled={intradayPositions.length > 0} style={{ flex: 1, padding: '12px', fontSize: '15px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: '2px solid rgba(102, 126, 234, 0.5)' }}>🎭 Add Mock Positions (Test)</button>
          <button onClick={updatePositionPrices} disabled={intradayPositions.length === 0 || !authStatus.authenticated || isLoading} style={{ flex: 1, padding: '12px', fontSize: '15px', background: 'rgba(79, 172, 254, 0.2)', border: '1px solid rgba(79, 172, 254, 0.5)', opacity: (intradayPositions.length === 0 || !authStatus.authenticated || isLoading) ? 0.5 : 1 }}>{isLoading ? '⏳ Updating...' : '🔄 Update Prices'}</button>
          <button onClick={clearAllPositions} disabled={intradayPositions.length === 0} style={{ flex: 1, padding: '12px', fontSize: '15px', background: 'rgba(255, 0, 100, 0.2)', border: '1px solid rgba(255, 0, 100, 0.5)' }}>🗑️ Close All</button>
        </div>

        {intradayPositions.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '12px', border: '1px dashed rgba(255, 255, 255, 0.2)' }}>
            <div style={{ fontSize: '3em', marginBottom: '15px' }}>📊</div>
            <h3 style={{ marginBottom: '10px' }}>No Open Positions</h3>
            <p style={{ color: 'rgba(255, 255, 255, 0.6)', marginBottom: '20px' }}>Add mock positions to see the tracker in action, or enter real trades when the market opens.</p>
            <button onClick={addMockPositions} style={{ padding: '12px 24px', fontSize: '15px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: '2px solid rgba(102, 126, 234, 0.5)' }}>🎭 Try Demo Positions</button>
          </div>
        ) : (
          <table className="screener-table" style={{ width: '100%' }}>
            <thead><tr><th>Type</th><th>Symbol</th><th>Entry Price</th><th>Current Price</th><th>Qty</th><th>Total Value</th><th>P&L</th><th>Time</th><th>Action</th></tr></thead>
            <tbody>
              {intradayPositions.map((position, idx) => {
                const pnlValue = Number(position.pnl || 0)
                const pnlPercent = Number(position.pnl_percent || 0)
                const timeHeld = Math.floor((Date.now() - position.entry_time.getTime()) / 1000 / 60)
                const exitSignal = exitSignals[position.symbol]
                return (
                  <React.Fragment key={idx}>
                    <tr>
                      <td><span style={{ padding: '4px 10px', background: position.type === 'BUY' ? '#00ff64' : '#ff0064', color: '#000', borderRadius: '6px', fontSize: '0.85em', fontWeight: 'bold', display: 'inline-block' }}>{position.type}</span></td>
                      <td><strong>{position.symbol}</strong></td>
                      <td>₹{position.entry_price.toFixed(2)}</td>
                      <td>₹{position.current_price.toFixed(2)}</td>
                      <td>{position.quantity}</td>
                      <td>₹{(position.current_price * position.quantity).toFixed(2)}</td>
                      <td className={pnlValue >= 0 ? 'positive' : 'negative'}><strong>{pnlValue >= 0 ? '+' : ''}₹{pnlValue.toFixed(2)}</strong><br /><span style={{ fontSize: '0.85em' }}>({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%)</span></td>
                      <td style={{ fontSize: '0.9em' }}>{timeHeld}m ago</td>
                      <td><button onClick={() => exitPosition(position.symbol)} style={{ padding: '6px 12px', fontSize: '0.9em', fontWeight: 'bold', background: pnlValue >= 0 ? '#00ff64' : '#ff0064', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Close</button></td>
                    </tr>
                    {exitSignal && (
                      <tr style={{ background: exitSignal.strength >= 4 ? 'rgba(255, 0, 100, 0.2)' : 'rgba(255, 193, 7, 0.2)', borderLeft: `4px solid ${exitSignal.strength >= 4 ? '#ff0064' : '#ffc107'}` }}>
                        <td colSpan={9} style={{ padding: '15px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <div style={{ fontSize: '1.5em' }}>{exitSignal.strength >= 4 ? '🚨' : '⚠️'}</div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 'bold', marginBottom: '5px', fontSize: '1.05em' }}>{exitSignal.strength >= 4 ? '🚨 STRONG EXIT SIGNAL' : '⚠️ Consider Exit'}</div>
                              <div style={{ fontSize: '0.9em', color: 'rgba(255, 255, 255, 0.8)' }}>{exitSignal.reasons.join(' • ')}</div>
                            </div>
                            <button onClick={() => exitPosition(position.symbol)} style={{ padding: '10px 20px', fontSize: '0.95em', fontWeight: 'bold', background: exitSignal.strength >= 4 ? '#ff0064' : '#ffc107', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}>{exitSignal.strength >= 4 ? '🚨 EXIT NOW' : '⚠️ EXIT POSITION'}</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: '25px', padding: '15px', background: 'rgba(255, 193, 7, 0.1)', border: '1px solid rgba(255, 193, 7, 0.3)', borderRadius: '10px' }}>
          <h4 style={{ marginBottom: '10px' }}>💡 Position Tracking Tips:</h4>
          <ul style={{ marginLeft: '20px', lineHeight: '1.8' }}>
            <li><strong>Update Prices:</strong> Click "Update Prices" to fetch live P&L</li>
            <li><strong>Auto-refresh:</strong> Coming in next update (every 30 seconds)</li>
            <li><strong>Exit Strategy:</strong> Close positions at target or stop-loss</li>
            <li><strong>End of Day:</strong> All positions should be closed by 3:15 PM</li>
          </ul>
        </div>
      </div>
    </div>
  )
})
