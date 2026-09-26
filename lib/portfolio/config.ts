/**
 * Portfolio engine configuration: risk modes and the instruments behind them.
 *
 * Evidence for the modes comes from NSE's published factor indices
 * (point-in-time constituents, Jun 2013 to Sep 2026, price return),
 * see research/factor_indices.py on the research/factor-study branch.
 */

export type RiskMode = 'aggressive' | 'balanced' | 'defensive'

export interface ModeDefinition {
  id: RiskMode
  label: string
  /** Share of the invested book in each sleeve. */
  sleeves: { momentum: number; lowvol: number }
  /** Move the whole book to cash when NIFTY 200 closes below its 200-day average. */
  trendFilter: boolean
  /** Historical reference from the NSE factor-index study (not a forecast). */
  reference: { cagrPct: number; maxDrawdownPct: number; volPct: number }
  description: string
}

export const MODES: Record<RiskMode, ModeDefinition> = {
  aggressive: {
    id: 'aggressive',
    label: 'Aggressive',
    sleeves: { momentum: 1, lowvol: 0 },
    trendFilter: false,
    reference: { cagrPct: 19.3, maxDrawdownPct: -38.0, volPct: 20.7 },
    description: '100% momentum. Highest long-run return, deepest falls (2018 -11.6%, 2022 -8.3%, 2025 -7.9%).',
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    sleeves: { momentum: 0.5, lowvol: 0.5 },
    trendFilter: false,
    reference: { cagrPct: 16.5, maxDrawdownPct: -31.6, volPct: 16.5 },
    description: '50% momentum, 50% low volatility. The two tend to lose in different years.',
  },
  defensive: {
    id: 'defensive',
    label: 'Defensive',
    sleeves: { momentum: 0.5, lowvol: 0.5 },
    trendFilter: true,
    reference: { cagrPct: 14.2, maxDrawdownPct: -16.3, volPct: 12.4 },
    description: 'Balanced, but moves to cash while NIFTY 200 is below its 200-day average.',
  },
}

export const DEFAULT_MODE: RiskMode = 'balanced'

/** Kite instrument tokens for the indices the engine reads. */
export const INDEX_INSTRUMENTS = {
  NIFTY_50: { token: 256265, quoteKey: 'NSE:NIFTY 50', barSymbol: 'IDX:NIFTY 50' },
  NIFTY_200: { token: 264457, quoteKey: 'NSE:NIFTY 200', barSymbol: 'IDX:NIFTY 200' },
  MOMENTUM_50: { token: 409609, quoteKey: 'NSE:NIFTY500MOMENTM50', barSymbol: 'IDX:NIFTY500MOMENTM50' },
  LOWVOL_50: { token: 417801, quoteKey: 'NSE:NIFTY500 LOWVOL50', barSymbol: 'IDX:NIFTY500 LOWVOL50' },
} as const

/**
 * Exchange-traded funds that implement each sleeve in the core book.
 * Filled only after checking on live data that the fund tracks the index and
 * trades enough volume. `null` means "not yet verified": the plan then shows
 * the sleeve as a target weight without buy/sell orders.
 */
export const SLEEVE_FUNDS: Record<'momentum' | 'lowvol' | 'cash', string | null> = {
  momentum: null,
  lowvol: null,
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
