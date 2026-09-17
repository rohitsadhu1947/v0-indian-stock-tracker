import { create } from 'zustand'
import type { Position, IntradaySignal } from '@/lib/intraday-utils'

interface PositionsStore {
  // Intraday positions
  intradayPositions: Position[]
  intradaySignals: IntradaySignal[]
  totalPnL: number
  intradayWatchlist: string[]
  intradayStockInput: string
  exitSignals: Record<string, any>
  autoRefreshIntraday: boolean
  autoRefreshInterval: number
  isDemoData: boolean
  screenerLevel: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE'

  // ORB state
  orbRanges: Record<string, { high: number; low: number; open: number; rangeCaptured: boolean; timestamp: Date }>
  orbSignals: any[]
  isCapturingORB: boolean
  orbWatchlist: string[]
  orbAutoMonitoring: boolean
  orbNextScanTime: Date | null
  orbScanInterval: number

  // Trade Watch
  tradeWatch: any[]
  entryAlerts: any[]
  isMonitoringWatch: boolean
  watchMonitorInterval: number

  // Paper trading
  isPaperMode: boolean
  paperPositions: any[]
  isLoadingPaperPositions: boolean
  isExecutingTrade: boolean
  analystReportsCache: Record<string, any[]>
  autoUpdateEnabled: boolean
  lastPnLUpdate: Date | null
  autoExitAlerts: any[]
  positionFilter: 'open' | 'closed' | 'all'

  // Manual entry form
  manualEntrySymbol: string
  manualEntryPrice: string
  manualEntryQuantity: string
  manualEntryType: 'BUY' | 'SELL'

  // Setters
  setIntradayPositions: (positions: Position[]) => void
  setIntradaySignals: (signals: IntradaySignal[]) => void
  setTotalPnL: (pnl: number) => void
  setIntradayWatchlist: (watchlist: string[]) => void
  setIntradayStockInput: (input: string) => void
  setExitSignals: (signals: Record<string, any>) => void
  setAutoRefreshIntraday: (enabled: boolean) => void
  setAutoRefreshInterval: (interval: number) => void
  setIsDemoData: (demo: boolean) => void
  setScreenerLevel: (level: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE') => void
  setOrbRanges: (ranges: Record<string, { high: number; low: number; open: number; rangeCaptured: boolean; timestamp: Date }>) => void
  setOrbSignals: (signals: any[]) => void
  setIsCapturingORB: (capturing: boolean) => void
  setOrbWatchlist: (watchlist: string[]) => void
  setOrbAutoMonitoring: (monitoring: boolean) => void
  setOrbNextScanTime: (time: Date | null) => void
  setOrbScanInterval: (interval: number) => void
  setTradeWatch: (watch: any[]) => void
  setEntryAlerts: (alerts: any[]) => void
  setIsMonitoringWatch: (monitoring: boolean) => void
  setWatchMonitorInterval: (interval: number) => void
  setIsPaperMode: (paper: boolean) => void
  setPaperPositions: (positions: any[]) => void
  setIsLoadingPaperPositions: (loading: boolean) => void
  setIsExecutingTrade: (executing: boolean) => void
  setAnalystReportsCache: (cache: Record<string, any[]>) => void
  setAutoUpdateEnabled: (enabled: boolean) => void
  setLastPnLUpdate: (date: Date | null) => void
  setAutoExitAlerts: (alerts: any[]) => void
  setPositionFilter: (filter: 'open' | 'closed' | 'all') => void
  setManualEntrySymbol: (symbol: string) => void
  setManualEntryPrice: (price: string) => void
  setManualEntryQuantity: (qty: string) => void
  setManualEntryType: (type: 'BUY' | 'SELL') => void
  /** Add pnl to current totalPnL atomically. */
  addToPnL: (pnl: number) => void
  /** Merge analyst reports for a symbol into the cache atomically. */
  mergeAnalystCache: (symbol: string, reports: any[]) => void
  /** Append auto-exit alerts atomically. */
  appendAutoExits: (exits: any[]) => void
  /** Add a symbol to intraday watchlist if not already present (atomic). */
  appendToIntradayWatchlist: (symbol: string) => void
}

const NIFTY_50_STOCKS = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
  'HINDUNILVR', 'ITC', 'SBIN', 'BHARTIARTL', 'KOTAKBANK',
  'LT', 'AXISBANK', 'ASIANPAINT', 'MARUTI', 'BAJFINANCE',
  'HCLTECH', 'WIPRO', 'ULTRACEMCO', 'NTPC', 'SUNPHARMA',
  'TITAN', 'NESTLEIND', 'POWERGRID', 'M&M', 'TATAMOTORS',
  'TECHM', 'BAJAJFINSV', 'ADANIPORTS', 'ONGC', 'TATASTEEL',
  'COALINDIA', 'JSWSTEEL', 'INDUSINDBK', 'SBILIFE', 'DRREDDY',
  'DIVISLAB', 'CIPLA', 'GRASIM', 'HINDALCO', 'BRITANNIA',
  'EICHERMOT', 'HEROMOTOCO', 'UPL', 'BPCL', 'SHREECEM',
  'TATACONSUM', 'APOLLOHOSP', 'ADANIENT', 'VEDL', 'BAJAJ-AUTO',
]

export const usePositionsStore = create<PositionsStore>()((set) => ({
  intradayPositions: [],
  intradaySignals: [],
  totalPnL: 0,
  intradayWatchlist: [],
  intradayStockInput: '',
  exitSignals: {},
  autoRefreshIntraday: false,
  autoRefreshInterval: 60,
  isDemoData: false,
  screenerLevel: 'MODERATE',

  orbRanges: {},
  orbSignals: [],
  isCapturingORB: false,
  orbWatchlist: NIFTY_50_STOCKS,
  orbAutoMonitoring: false,
  orbNextScanTime: null,
  orbScanInterval: 5,

  tradeWatch: [],
  entryAlerts: [],
  isMonitoringWatch: false,
  watchMonitorInterval: 120,

  isPaperMode: true,
  paperPositions: [],
  isLoadingPaperPositions: false,
  isExecutingTrade: false,
  analystReportsCache: {},
  autoUpdateEnabled: false,
  lastPnLUpdate: null,
  autoExitAlerts: [],
  positionFilter: 'open',

  manualEntrySymbol: '',
  manualEntryPrice: '',
  manualEntryQuantity: '',
  manualEntryType: 'BUY',

  setIntradayPositions: (positions) => set({ intradayPositions: positions }),
  setIntradaySignals: (signals) => set({ intradaySignals: signals }),
  setTotalPnL: (pnl) => set({ totalPnL: pnl }),
  setIntradayWatchlist: (watchlist) => set({ intradayWatchlist: watchlist }),
  setIntradayStockInput: (input) => set({ intradayStockInput: input }),
  setExitSignals: (signals) => set({ exitSignals: signals }),
  setAutoRefreshIntraday: (enabled) => set({ autoRefreshIntraday: enabled }),
  setAutoRefreshInterval: (interval) => set({ autoRefreshInterval: interval }),
  setIsDemoData: (demo) => set({ isDemoData: demo }),
  setScreenerLevel: (level) => set({ screenerLevel: level }),
  setOrbRanges: (ranges) => set({ orbRanges: ranges }),
  setOrbSignals: (signals) => set({ orbSignals: signals }),
  setIsCapturingORB: (capturing) => set({ isCapturingORB: capturing }),
  setOrbWatchlist: (watchlist) => set({ orbWatchlist: watchlist }),
  setOrbAutoMonitoring: (monitoring) => set({ orbAutoMonitoring: monitoring }),
  setOrbNextScanTime: (time) => set({ orbNextScanTime: time }),
  setOrbScanInterval: (interval) => set({ orbScanInterval: interval }),
  setTradeWatch: (watch) => set({ tradeWatch: watch }),
  setEntryAlerts: (alerts) => set({ entryAlerts: alerts }),
  setIsMonitoringWatch: (monitoring) => set({ isMonitoringWatch: monitoring }),
  setWatchMonitorInterval: (interval) => set({ watchMonitorInterval: interval }),
  setIsPaperMode: (paper) => set({ isPaperMode: paper }),
  setPaperPositions: (positions) => set({ paperPositions: positions }),
  setIsLoadingPaperPositions: (loading) => set({ isLoadingPaperPositions: loading }),
  setIsExecutingTrade: (executing) => set({ isExecutingTrade: executing }),
  setAnalystReportsCache: (cache) => set({ analystReportsCache: cache }),
  setAutoUpdateEnabled: (enabled) => set({ autoUpdateEnabled: enabled }),
  setLastPnLUpdate: (date) => set({ lastPnLUpdate: date }),
  setAutoExitAlerts: (alerts) => set({ autoExitAlerts: alerts }),
  setPositionFilter: (filter) => set({ positionFilter: filter }),
  setManualEntrySymbol: (symbol) => set({ manualEntrySymbol: symbol }),
  setManualEntryPrice: (price) => set({ manualEntryPrice: price }),
  setManualEntryQuantity: (qty) => set({ manualEntryQuantity: qty }),
  setManualEntryType: (type) => set({ manualEntryType: type }),
  addToPnL: (pnl) => set((state) => ({ totalPnL: state.totalPnL + pnl })),
  mergeAnalystCache: (symbol, reports) =>
    set((state) => ({ analystReportsCache: { ...state.analystReportsCache, [symbol]: reports } })),
  appendAutoExits: (exits) =>
    set((state) => ({ autoExitAlerts: [...state.autoExitAlerts, ...exits] })),
  appendToIntradayWatchlist: (symbol) =>
    set((state) =>
      state.intradayWatchlist.includes(symbol)
        ? {}
        : { intradayWatchlist: [...state.intradayWatchlist, symbol] }
    ),
}))
