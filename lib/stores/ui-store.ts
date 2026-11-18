import { create } from 'zustand'
import type { FundamentalData, FundamentalScore } from '@/lib/fundamentals-utils'

export type ActiveTab =
  | 'plan'
  | 'screen'
  | 'stockcheck'
  | 'fundamentals'
  | 'market'
  | 'papertrades'
  | 'research'
  | 'settings'
  | 'admin'
  | 'data'
  | 'portfolio'

interface UIStore {
  activeTab: ActiveTab
  isLoading: boolean
  error: string | null

  // News
  stockNews: any[]
  marketNews: any[]
  isFetchingNews: boolean
  newsTab: 'stock' | 'market' | 'multi'
  stockSentiment: any
  marketSentiment: any
  multiLayerNews: any

  // Combined Intelligence

  // Fundamentals
  fundamentalData: FundamentalData | null
  fundamentalScore: FundamentalScore | null
  fundamentalSymbol: string
  fundamentalExchange: 'NSE' | 'BSE'
  isFetchingFundamentals: boolean

  // Setters
  setActiveTab: (tab: ActiveTab) => void
  setIsLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setStockNews: (news: any[]) => void
  setMarketNews: (news: any[]) => void
  setIsFetchingNews: (fetching: boolean) => void
  setNewsTab: (tab: 'stock' | 'market' | 'multi') => void
  setStockSentiment: (sentiment: any) => void
  setMarketSentiment: (sentiment: any) => void
  setMultiLayerNews: (news: any) => void
  setFundamentalData: (data: FundamentalData | null) => void
  setFundamentalScore: (score: FundamentalScore | null) => void
  setFundamentalSymbol: (symbol: string) => void
  setFundamentalExchange: (exchange: 'NSE' | 'BSE') => void
  setIsFetchingFundamentals: (fetching: boolean) => void
}

export const useUIStore = create<UIStore>()((set) => ({
  activeTab: 'plan',
  isLoading: false,
  error: null,

  stockNews: [],
  marketNews: [],
  isFetchingNews: false,
  newsTab: 'multi',
  stockSentiment: null,
  marketSentiment: null,
  multiLayerNews: null,


  fundamentalData: null,
  fundamentalScore: null,
  fundamentalSymbol: '',
  fundamentalExchange: 'NSE',
  isFetchingFundamentals: false,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  setStockNews: (news) => set({ stockNews: news }),
  setMarketNews: (news) => set({ marketNews: news }),
  setIsFetchingNews: (fetching) => set({ isFetchingNews: fetching }),
  setNewsTab: (tab) => set({ newsTab: tab }),
  setStockSentiment: (sentiment) => set({ stockSentiment: sentiment }),
  setMarketSentiment: (sentiment) => set({ marketSentiment: sentiment }),
  setMultiLayerNews: (news) => set({ multiLayerNews: news }),
  setFundamentalData: (data) => set({ fundamentalData: data }),
  setFundamentalScore: (score) => set({ fundamentalScore: score }),
  setFundamentalSymbol: (symbol) => set({ fundamentalSymbol: symbol }),
  setFundamentalExchange: (exchange) => set({ fundamentalExchange: exchange }),
  setIsFetchingFundamentals: (fetching) => set({ isFetchingFundamentals: fetching }),
}))
