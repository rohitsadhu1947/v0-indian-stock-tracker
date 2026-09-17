import { create } from 'zustand'

export interface StockData {
  symbol: string
  name: string
  instrumentToken: number
  current: number
  change: number
  changePercent: number
  volume: number
  dayHigh: number
  dayLow: number
  open: number
  prices: number[]
  volumes: number[]
  timestamp: string
}

interface WatchlistStore {
  watchlist: string[]
  stockData: Record<string, StockData>
  stockInput: string
  exchange: string
  // Screener (deprecated but kept for compatibility)
  screenerResults: any[]
  activeSignals: any[]
  customScreenerStocks: string[]
  screenerInput: string
  screenerGroups: Record<string, string[]>
  activeScreenerGroup: string

  setWatchlist: (watchlist: string[]) => void
  setStockData: (data: Record<string, StockData>) => void
  updateStockData: (symbol: string, data: StockData) => void
  setStockInput: (input: string) => void
  setExchange: (exchange: string) => void
  setScreenerResults: (results: any[]) => void
  setActiveSignals: (signals: any[]) => void
  setCustomScreenerStocks: (stocks: string[]) => void
  setScreenerInput: (input: string) => void
  setScreenerGroups: (groups: Record<string, string[]>) => void
  setActiveScreenerGroup: (group: string) => void
  /** Append signals, keeping only the last maxLen entries. */
  appendActiveSignals: (signals: any[], maxLen?: number) => void
}

export const useWatchlistStore = create<WatchlistStore>()((set) => ({
  watchlist: [],
  stockData: {},
  stockInput: '',
  exchange: 'NSE',
  screenerResults: [],
  activeSignals: [],
  customScreenerStocks: [],
  screenerInput: '',
  screenerGroups: {
    'Popular Large Caps': ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'WIPRO', 'ITC', 'HINDUNILVR', 'BHARTIARTL', 'ASIANPAINT', 'MARUTI', 'TITAN', 'BAJFINANCE', 'TATASTEEL', 'SUNPHARMA'],
    'Custom': [],
  },
  activeScreenerGroup: 'Popular Large Caps',

  setWatchlist: (watchlist) => set({ watchlist }),
  setStockData: (data) => set({ stockData: data }),
  updateStockData: (symbol, data) =>
    set((state) => ({ stockData: { ...state.stockData, [symbol]: data } })),
  setStockInput: (input) => set({ stockInput: input }),
  setExchange: (exchange) => set({ exchange }),
  setScreenerResults: (results) => set({ screenerResults: results }),
  setActiveSignals: (signals) => set({ activeSignals: signals }),
  setCustomScreenerStocks: (stocks) => set({ customScreenerStocks: stocks }),
  setScreenerInput: (input) => set({ screenerInput: input }),
  setScreenerGroups: (groups) => set({ screenerGroups: groups }),
  setActiveScreenerGroup: (group) => set({ activeScreenerGroup: group }),
  appendActiveSignals: (signals, maxLen = 15) =>
    set((state) => ({ activeSignals: [...state.activeSignals, ...signals].slice(-maxLen) })),
}))
