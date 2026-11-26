/**
 * Quarterly results as the screener shows them, worked out from one earnings
 * row of the Drishti API. Pure functions.
 *
 * These figures describe the company. They have not been tested as a way to
 * pick stocks.
 */

export type Basis = 'consolidated' | 'standalone'

export interface QuarterResult {
  symbol: string
  /** Drishti's quarter key, like q2_27 for the second quarter of FY27. */
  quarter: string
  /** The label printed in the filing, like Q2FY27. */
  periodLabel: string | null
  filedAt: string
  basis: Basis
  /** Rupees crore. */
  revenueCr: number | null
  revenueYoyPct: number | null
  operatingProfitCr: number | null
  patCr: number | null
  patYoyPct: number | null
  /** Rupees a share for the quarter. */
  eps: number | null
  /** Earnings a share over the last four quarters, when the filing has the figures to work it out. */
  epsTtm: number | null
  summary: string | null
}

interface Metric {
  unit?: string | null
  current_period_value?: number | null
  yoy_percent?: number | null
  previous_year_value?: number | null
  previous_year_full_value?: number | null
  current_cumulative_value?: number | null
  previous_year_cumulative_value?: number | null
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** How many crore one unit of the filing's figures is. Null when the unit is not recognised. */
export function croreFactor(unit: string | null | undefined): number | null {
  const u = (unit ?? '').toLowerCase()
  if (/crore|\bcr\b/.test(u)) return 1
  if (/lakh|lac/.test(u)) return 0.01
  if (/million|\bmn\b/.test(u)) return 0.1
  if (/billion|\bbn\b/.test(u)) return 100
  if (/thousand|'000|000s/.test(u)) return 0.0001
  return null
}

function inCrore(m: Metric | undefined): number | null {
  const value = num(m?.current_period_value), factor = croreFactor(m?.unit)
  return value == null || factor == null ? null : value * factor
}

/** Growth on a year ago. Not meaningful when either figure is a loss or zero. */
function yoy(m: Metric | undefined): number | null {
  const now = num(m?.current_period_value), then = num(m?.previous_year_value)
  if (now != null && then != null) return now > 0 && then > 0 ? (now / then - 1) * 100 : null
  return now != null && now <= 0 ? null : num(m?.yoy_percent)
}

/**
 * Earnings a share over the last four quarters: last full year, plus this
 * year so far, minus the same months of last year. In the fourth quarter the
 * year so far is the full year, so the sum still holds.
 */
function trailingEps(m: Metric | undefined): number | null {
  const fullYear = num(m?.previous_year_full_value)
  const soFar = num(m?.current_cumulative_value), lastYearSoFar = num(m?.previous_year_cumulative_value)
  return fullYear == null || soFar == null || lastYearSoFar == null ? null : fullYear + soFar - lastYearSoFar
}

const hasFigures = (table: any) => num(table?.revenue?.current_period_value) != null || num(table?.pat?.current_period_value) != null

/**
 * Consolidated when the filing has it. The figures are read from the filing
 * by machine and are sometimes wrong: a group's sales cannot be far below
 * the parent company's own, so when they are, the standalone table is used.
 */
function chooseBasis(tables: any): Basis | null {
  const group = hasFigures(tables.consolidated), own = hasFigures(tables.standalone)
  if (!group) return own ? 'standalone' : null
  const groupSales = inCrore(tables.consolidated.revenue), ownSales = own ? inCrore(tables.standalone.revenue) : null
  return groupSales != null && ownSales != null && ownSales > 0 && groupSales < ownSales * 0.5 ? 'standalone' : 'consolidated'
}

/** One detailed earnings row into a result. Consolidated figures when the filing has them, else standalone. Null when it has neither. */
export function parseEarnings(row: any): QuarterResult | null {
  const tables = row?.earnings_table
  if (!row?.symbol || !row?.quarter || !row?.date || !tables) return null
  const basis = chooseBasis(tables)
  if (!basis) return null
  const t = tables[basis]
  return {
    symbol: String(row.symbol).toUpperCase(),
    quarter: row.quarter,
    periodLabel: t.current_period_label ?? null,
    filedAt: new Date(row.date).toISOString(),
    basis,
    revenueCr: inCrore(t.revenue),
    revenueYoyPct: yoy(t.revenue),
    operatingProfitCr: inCrore(t.operating_profit),
    patCr: inCrore(t.pat),
    patYoyPct: yoy(t.pat),
    eps: num(t.eps?.current_period_value),
    epsTtm: trailingEps(t.eps),
    summary: row.summary ?? null,
  }
}

export interface FundamentalFacts {
  quarter: string
  filedAt: string
  basis: Basis
  salesCr: number | null
  salesYoyPct: number | null
  profitCr: number | null
  profitYoyPct: number | null
  /** Operating profit as a share of sales, in percent. */
  marginPct: number | null
  /** Price against earnings a share over the last four quarters. Null when the company made a loss. */
  pe: number | null
  summary: string | null
}

/** What the screener shows for one stock at a price. */
export function fundamentalFacts(r: QuarterResult, close: number): FundamentalFacts {
  const margin = r.operatingProfitCr != null && r.revenueCr != null && r.revenueCr > 0 ? (r.operatingProfitCr / r.revenueCr) * 100 : null
  return {
    quarter: r.periodLabel ?? r.quarter,
    filedAt: r.filedAt,
    basis: r.basis,
    salesCr: r.revenueCr,
    salesYoyPct: r.revenueYoyPct,
    profitCr: r.patCr,
    profitYoyPct: r.patYoyPct,
    marginPct: margin,
    pe: r.epsTtm != null && r.epsTtm > 0 && close > 0 ? close / r.epsTtm : null,
    summary: r.summary,
  }
}

/** Quarter keys newest first, starting from the quarter a date falls in. q2_27 is July to September 2026. */
export function recentQuarters(now: Date, count: number): string[] {
  let year = now.getUTCFullYear(), month = now.getUTCMonth()   // 0 = January
  // Fiscal quarter of the date: April to June is q1 of the year ending next March
  let q = month >= 3 ? Math.floor((month - 3) / 3) + 1 : 4
  let fy = month >= 3 ? year + 1 : year
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    out.push(`q${q}_${String(fy % 100).padStart(2, '0')}`)
    q--
    if (q === 0) { q = 4; fy-- }
  }
  return out
}
