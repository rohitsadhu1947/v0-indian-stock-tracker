/**
 * Portfolio engine configuration: risk modes and the instruments behind them.
 *
 * Evidence for the modes comes from NSE's published factor indices
 * (point-in-time constituents, Jun 2013 to Sep 2026, price return),
 * see research/factor_indices.py on the research/factor-study branch.
 */

export type RiskMode = 'growth' | 'multifactor' | 'defensive'
export type Sleeve = 'momentum' | 'lowvol' | 'value'

interface PeriodStats { cagrPct: number; maxDrawdownPct: number }
interface ModeReference {
  /** Jun 2013 to Sep 2026. Pre-launch years of some indices are NSE back-calculations. */
  full: PeriodStats
  /** After NSE launched its momentum index: cannot have been fitted with hindsight. */
  since2020: PeriodStats
  since2022: PeriodStats
}

export interface ModeDefinition {
  id: RiskMode
  label: string
  /** Share of the invested book in each sleeve. */
  sleeves: Record<Sleeve, number>
  /** Historical reference, price return, before tax (not a forecast). */
  reference: ModeReference
  /** Same mode with the NIFTY 200 trend filter switched on. */
  referenceWithTrendFilter: ModeReference
  description: string
}

// Numbers from research/modes.py on NSE factor indices (price return, monthly rebalance, 0.225% cost per side).
export const MODES: Record<RiskMode, ModeDefinition> = {
  growth: {
    id: 'growth',
    label: 'Growth',
    sleeves: { momentum: 1, lowvol: 0, value: 0 },
    reference: {
      full: { cagrPct: 19.3, maxDrawdownPct: -38.0 },
      since2020: { cagrPct: 21.6, maxDrawdownPct: -31.1 },
      since2022: { cagrPct: 10.2, maxDrawdownPct: -31.1 },
    },
    referenceWithTrendFilter: {
      full: { cagrPct: 17.3, maxDrawdownPct: -23.2 },
      since2020: { cagrPct: 19.4, maxDrawdownPct: -22.8 },
      since2022: { cagrPct: 8.2, maxDrawdownPct: -22.8 },
    },
    description: 'Momentum only. Strongest long-run record, but no better than the broad market since 2022 and the deepest falls.',
  },
  multifactor: {
    id: 'multifactor',
    label: 'Multi-factor',
    sleeves: { momentum: 1 / 3, lowvol: 1 / 3, value: 1 / 3 },
    reference: {
      full: { cagrPct: 16.7, maxDrawdownPct: -43.7 },
      since2020: { cagrPct: 22.4, maxDrawdownPct: -22.8 },
      since2022: { cagrPct: 15.0, maxDrawdownPct: -22.8 },
    },
    referenceWithTrendFilter: {
      full: { cagrPct: 14.8, maxDrawdownPct: -22.7 },
      since2020: { cagrPct: 19.5, maxDrawdownPct: -16.9 },
      since2022: { cagrPct: 12.0, maxDrawdownPct: -16.9 },
    },
    description: 'Equal thirds momentum, low volatility and value. These lose in different years, so bad years are softer.',
  },
  defensive: {
    id: 'defensive',
    label: 'Defensive',
    sleeves: { momentum: 0, lowvol: 1, value: 0 },
    reference: {
      full: { cagrPct: 13.4, maxDrawdownPct: -27.8 },
      since2020: { cagrPct: 15.6, maxDrawdownPct: -15.4 },
      since2022: { cagrPct: 12.0, maxDrawdownPct: -15.4 },
    },
    referenceWithTrendFilter: {
      full: { cagrPct: 11.0, maxDrawdownPct: -15.1 },
      since2020: { cagrPct: 12.3, maxDrawdownPct: -15.1 },
      since2022: { cagrPct: 8.4, maxDrawdownPct: -12.7 },
    },
    description: 'Low volatility only. Lowest return, but it reduced losses in every period tested.',
  },
}

export const DEFAULT_MODE: RiskMode = 'multifactor'

/** Benchmarks shown next to the modes (same source and periods). */
export const BENCHMARK_REFERENCE = {
  nifty50: { full: { cagrPct: 10.8, maxDrawdownPct: -36.9 }, since2020: { cagrPct: 12.2, maxDrawdownPct: -17.0 }, since2022: { cagrPct: 5.7, maxDrawdownPct: -16.2 } },
  nifty500EqualWeight: { full: { cagrPct: 15.2, maxDrawdownPct: -56.5 }, since2020: { cagrPct: 21.3, maxDrawdownPct: -23.7 }, since2022: { cagrPct: 12.8, maxDrawdownPct: -23.7 } },
}

/** Kite instrument tokens for the indices the engine reads. */
export const INDEX_INSTRUMENTS = {
  NIFTY_50: { token: 256265, quoteKey: 'NSE:NIFTY 50', barSymbol: 'IDX:NIFTY 50' },
  NIFTY_200: { token: 264457, quoteKey: 'NSE:NIFTY 200', barSymbol: 'IDX:NIFTY 200' },
  MOMENTUM_50: { token: 409609, quoteKey: 'NSE:NIFTY500MOMENTM50', barSymbol: 'IDX:NIFTY500MOMENTM50' },
  LOWVOL_50: { token: 417801, quoteKey: 'NSE:NIFTY500 LOWVOL50', barSymbol: 'IDX:NIFTY500 LOWVOL50' },
  VALUE_50: { token: 409353, quoteKey: 'NSE:NIFTY500 VALUE 50', barSymbol: 'IDX:NIFTY500 VALUE 50' },
} as const

/**
 * Exchange-traded funds that implement each sleeve in the core book.
 * Filled only after checking on live data that the fund tracks the index and
 * trades enough volume. `null` means "not yet verified": the plan then shows
 * the sleeve as a target weight without buy/sell orders.
 */
export const SLEEVE_FUNDS: Record<Sleeve | 'cash', string | null> = {
  momentum: null,
  lowvol: null,
  value: null,
  cash: null,
}

/** Stock-momentum sleeve (paper) settings, matching research/research.py. */
export const STOCK_MOMENTUM = {
  topN: 20,
  lookbackDays: 252,
  skipDays: 21,
  volWindowDays: 252,
  liquidityWindowDays: 60,
  minTradedValueCr: 10,
}

/** Trades smaller than this are skipped (brokerage/DP make tiny trades uneconomic). */
export const MIN_TRADE_VALUE = 2000

/**
 * A holding that stays in the portfolio is only resized when it has drifted
 * more than this fraction from its target value. Exits and new entries always
 * trade in full.
 */
export const RESIZE_BAND = 0.2
