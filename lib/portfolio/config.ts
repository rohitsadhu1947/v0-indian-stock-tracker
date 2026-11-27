/**
 * Portfolio engine configuration: the Monthly Plan's three modes and the
 * rules they share.
 *
 * Each mode is a strategy that went through the research harness
 * (scripts/research/run.ts) unchanged; `researchKey` names its result in
 * research/results/summary.json, which is where every performance figure the
 * app shows for it comes from.
 */
import type { FactorId } from './factors'

export type RiskMode = 'growth' | 'balanced' | 'defensive'

export interface ModeDefinition {
  id: RiskMode
  label: string
  /** Stocks are ranked on the average of their percentile ranks on these. */
  factors: FactorId[]
  /** Backtest of exactly this mode, without and with the trend filter. */
  researchKey: string
  researchKeyWithTrendFilter: string
  description: string
}

export const MODES: Record<RiskMode, ModeDefinition> = {
  growth: {
    id: 'growth',
    label: 'Growth',
    factors: ['momentum'],
    researchKey: 'momentum-buffer-sectorcap',
    researchKeyWithTrendFilter: 'momentum-buffer-sectorcap-trend',
    description: 'Momentum: the 20 stocks with the strongest risk-adjusted 12-month trend. Highest return in the backtest, and falls of about half the portfolio.',
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    factors: ['momentum', 'lowVolatility'],
    researchKey: 'momentum-lowvol-buffer-sectorcap',
    researchKeyWithTrendFilter: 'momentum-lowvol-buffer-sectorcap-trend',
    description: 'Stocks that are both trending and steady. Lower return than Growth, with much smaller falls. Lagged in the 2020-21 boom.',
  },
  defensive: {
    id: 'defensive',
    label: 'Defensive',
    factors: ['lowVolatility'],
    researchKey: 'low-volatility-buffer-sectorcap',
    researchKeyWithTrendFilter: 'low-volatility-buffer-sectorcap-trend',
    description: 'The 20 steadiest stocks. Lowest return of the three and the smallest falls; trails badly when the market runs up.',
  },
}

export const DEFAULT_MODE: RiskMode = 'balanced'

/** Selection rules shared by every mode, as backtested. */
export const PORTFOLIO_RULES = {
  /** Positions held, at equal weight. */
  topN: 20,
  /** A holding is kept until its rank falls below this. */
  exitRank: 60,
  /** The most traded NSE stocks the ranking draws from. */
  universeSize: 500,
  /**
   * At most this many holdings from one sector (lib/portfolio/sectors.ts).
   * In the backtests it lowered concentration and slightly raised returns in
   * every mode. A stock whose sector is not known is not limited.
   */
  maxPerSector: 4,
}

/** Kite instrument tokens for the indices the engine reads. */
export const INDEX_INSTRUMENTS = {
  NIFTY_50: { token: 256265, quoteKey: 'NSE:NIFTY 50', barSymbol: 'IDX:NIFTY 50' },
  NIFTY_200: { token: 264457, quoteKey: 'NSE:NIFTY 200', barSymbol: 'IDX:NIFTY 200' },
  MOMENTUM_50: { token: 409609, quoteKey: 'NSE:NIFTY500MOMENTM50', barSymbol: 'IDX:NIFTY500MOMENTM50' },
  LOWVOL_50: { token: 417801, quoteKey: 'NSE:NIFTY500 LOWVOL50', barSymbol: 'IDX:NIFTY500 LOWVOL50' },
  VALUE_50: { token: 409353, quoteKey: 'NSE:NIFTY500 VALUE 50', barSymbol: 'IDX:NIFTY500 VALUE 50' },
} as const

/** Windows for momentum, volatility and the liquidity screen (trading days). */
export const STOCK_MOMENTUM = {
  topN: PORTFOLIO_RULES.topN,
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

/**
 * Funds the plan can keep part of the book in, to soften falls. They moved
 * differently from shares in testing (research/results/funds.json). The bond
 * fund tested there, LICNETFGSC, trades too little to use, so the plan holds
 * LTGILTBEES, which tracks the same kind of bonds.
 */
export const PLAN_FUNDS = [
  { symbol: 'GOLDBEES', label: 'Gold fund' },
  { symbol: 'LTGILTBEES', label: 'Government bond fund' },
  { symbol: 'MON100', label: 'US Nasdaq 100 fund' },
] as const

/** The shares of the book the page offers for the funds, as fractions. */
export const FUND_SHARES = [0, 0.1, 0.2, 0.3, 0.4, 0.5]

/** The nearest offered share to a number given as a percent (30) or left out. */
export function parseFundShare(value: string | number | null | undefined): number | undefined {
  if (value == null || value === '') return undefined
  const n = Number(value) / 100
  return FUND_SHARES.find(s => Math.abs(s - n) < 0.001)
}
