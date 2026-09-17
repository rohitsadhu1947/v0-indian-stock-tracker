import { create } from 'zustand'
import type { MomentumScanResult } from '@/lib/momentum-scanner'
import type { MarketCloseAnalysis } from '@/lib/pattern-analysis'
import { isMarketHours } from '@/lib/intraday-utils'

type MarketStatus = ReturnType<typeof isMarketHours>

interface MarketStore {
  // Market status
  marketStatus: MarketStatus

  // Market Dashboard
  marketDashboard: any
  isFetchingMarketDashboard: boolean

  // Market Close Analysis
  marketCloseAnalysis: MarketCloseAnalysis | null
  isAnalyzingClose: boolean

  // Momentum Scanner
  momentumScanResult: MomentumScanResult | null
  isScanningMomentum: boolean
  momentumCapital: number
  momentumMaxPositions: number
  momentumMinScore: number
  customStocksInput: string
  isQuickScan: boolean

  // Universe Scanner
  universeScans: any[]
  isScanningUniverse: boolean
  scanResults: any[]
  selectedSector: string
  minVolume: number
  minGapPercent: number
  scanProgress: number

  // Setters
  setMarketStatus: (status: MarketStatus) => void
  setMarketDashboard: (dashboard: any) => void
  setIsFetchingMarketDashboard: (fetching: boolean) => void
  setMarketCloseAnalysis: (analysis: MarketCloseAnalysis | null) => void
  setIsAnalyzingClose: (analyzing: boolean) => void
  setMomentumScanResult: (result: MomentumScanResult | null) => void
  setIsScanningMomentum: (scanning: boolean) => void
  setMomentumCapital: (capital: number) => void
  setMomentumMaxPositions: (max: number) => void
  setMomentumMinScore: (min: number) => void
  setCustomStocksInput: (input: string) => void
  setIsQuickScan: (quick: boolean) => void
  setUniverseScans: (scans: any[]) => void
  setIsScanningUniverse: (scanning: boolean) => void
  setScanResults: (results: any[]) => void
  setSelectedSector: (sector: string) => void
  setMinVolume: (volume: number) => void
  setMinGapPercent: (percent: number) => void
  setScanProgress: (progress: number) => void
}

export const useMarketStore = create<MarketStore>()((set) => ({
  marketStatus: isMarketHours(),

  marketDashboard: null,
  isFetchingMarketDashboard: false,

  marketCloseAnalysis: null,
  isAnalyzingClose: false,

  momentumScanResult: null,
  isScanningMomentum: false,
  momentumCapital: 300000,
  momentumMaxPositions: 5,
  momentumMinScore: 45,
  customStocksInput: '',
  isQuickScan: true,

  universeScans: [],
  isScanningUniverse: false,
  scanResults: [],
  selectedSector: 'All',
  minVolume: 100000,
  minGapPercent: 0.5,
  scanProgress: 0,

  setMarketStatus: (status) => set({ marketStatus: status }),
  setMarketDashboard: (dashboard) => set({ marketDashboard: dashboard }),
  setIsFetchingMarketDashboard: (fetching) => set({ isFetchingMarketDashboard: fetching }),
  setMarketCloseAnalysis: (analysis) => set({ marketCloseAnalysis: analysis }),
  setIsAnalyzingClose: (analyzing) => set({ isAnalyzingClose: analyzing }),
  setMomentumScanResult: (result) => set({ momentumScanResult: result }),
  setIsScanningMomentum: (scanning) => set({ isScanningMomentum: scanning }),
  setMomentumCapital: (capital) => set({ momentumCapital: capital }),
  setMomentumMaxPositions: (max) => set({ momentumMaxPositions: max }),
  setMomentumMinScore: (min) => set({ momentumMinScore: min }),
  setCustomStocksInput: (input) => set({ customStocksInput: input }),
  setIsQuickScan: (quick) => set({ isQuickScan: quick }),
  setUniverseScans: (scans) => set({ universeScans: scans }),
  setIsScanningUniverse: (scanning) => set({ isScanningUniverse: scanning }),
  setScanResults: (results) => set({ scanResults: results }),
  setSelectedSector: (sector) => set({ selectedSector: sector }),
  setMinVolume: (volume) => set({ minVolume: volume }),
  setMinGapPercent: (percent) => set({ minGapPercent: percent }),
  setScanProgress: (progress) => set({ scanProgress: progress }),
}))
