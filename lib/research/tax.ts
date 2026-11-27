/**
 * Indian capital gains tax on listed shares, for backtests.
 *
 * Rules from July 2024, applied to the whole history so results answer "what
 * would this strategy keep under today's tax law":
 *   - held 12 months or less: short-term, 20%
 *   - held longer: long-term, 12.5% on gains above Rs 1.25 lakh a year
 *   - 4% cess on the tax
 *   - short-term losses set off against any gains; long-term losses only
 *     against long-term gains; unused losses carry forward 8 years
 * Lots are matched first-in first-out, as the tax department does.
 * Dividends (taxed at the investor's slab rate) are not modelled.
 */
import { daysBetween } from './dates'

export interface TaxRules {
  shortTermRate: number
  longTermRate: number
  longTermExemption: number
  cess: number
  carryForwardYears: number
}

export const INDIA_EQUITY_TAX: TaxRules = {
  shortTermRate: 0.2,
  longTermRate: 0.125,
  longTermExemption: 125000,
  cess: 0.04,
  carryForwardYears: 8,
}

/**
 * Gold funds and funds that hold foreign shares, listed on the exchange:
 * 12.5% when held over 12 months, with no exempt amount; otherwise the
 * investor's income tax rate, taken here as the top 30% slab.
 */
export const GOLD_AND_FOREIGN_FUND_TAX: TaxRules = { shortTermRate: 0.3, longTermRate: 0.125, longTermExemption: 0, cess: 0.04, carryForwardYears: 8 }

/** Bond funds: every gain is taxed at the investor's income tax rate, however long the fund was held. */
export const BOND_FUND_TAX: TaxRules = { shortTermRate: 0.3, longTermRate: 0.3, longTermExemption: 0, cess: 0.04, carryForwardYears: 8 }

export interface TaxGroup { applies: (symbol: string) => boolean; rules: TaxRules }

export interface Ledger {
  buy(symbol: string, units: number, cost: number, date: number): void
  sell(symbol: string, units: number, proceeds: number, date: number): number
  settleYear(year: number): YearTax
}

interface Lot { units: number; costPerUnit: number; date: number }
interface CarriedLoss { year: number; amount: number }

export interface YearTax {
  year: number
  shortTermGain: number   // net for the year, before set-off
  longTermGain: number
  tax: number
}

export class TaxLedger implements Ledger {
  private lots = new Map<string, Lot[]>()
  private shortTerm = 0
  private longTerm = 0
  private carriedShort: CarriedLoss[] = []
  private carriedLong: CarriedLoss[] = []

  constructor(private rules: TaxRules = INDIA_EQUITY_TAX) {}

  /** `cost` is the full amount paid, charges included. */
  buy(symbol: string, units: number, cost: number, date: number): void {
    const lots = this.lots.get(symbol) ?? []
    lots.push({ units, costPerUnit: cost / units, date })
    this.lots.set(symbol, lots)
  }

  /** `proceeds` is the amount received after charges. Returns the realised gain. */
  sell(symbol: string, units: number, proceeds: number, date: number): number {
    const lots = this.lots.get(symbol) ?? []
    const pricePerUnit = proceeds / units
    let remaining = units, gain = 0
    while (remaining > 1e-9 && lots.length) {
      const lot = lots[0]
      const take = Math.min(lot.units, remaining)
      const lotGain = take * (pricePerUnit - lot.costPerUnit)
      if (daysBetween(lot.date, date) > 365) this.longTerm += lotGain
      else this.shortTerm += lotGain
      gain += lotGain
      lot.units -= take
      remaining -= take
      if (lot.units <= 1e-9) lots.shift()
    }
    if (!lots.length) this.lots.delete(symbol)
    return gain
  }

  /** Close financial year `year`: apply set-offs, return the tax due and start a new year. */
  settleYear(year: number): YearTax {
    const r = this.rules
    const result: YearTax = { year, shortTermGain: this.shortTerm, longTermGain: this.longTerm, tax: 0 }
    let short = this.shortTerm, long = this.longTerm
    this.shortTerm = 0
    this.longTerm = 0

    // This year's short-term loss reduces this year's long-term gain
    if (short < 0 && long > 0) {
      const used = Math.min(-short, long)
      short += used
      long -= used
    }

    const live = (c: CarriedLoss) => year - c.year <= r.carryForwardYears && c.amount > 1e-9
    this.carriedShort = this.carriedShort.filter(live)
    this.carriedLong = this.carriedLong.filter(live)
    const absorb = (gain: number, losses: CarriedLoss[]): number => {
      for (const c of losses) {
        if (gain <= 0) break
        const used = Math.min(c.amount, gain)
        c.amount -= used
        gain -= used
      }
      return gain
    }
    if (short > 0) short = absorb(short, this.carriedShort)
    if (long > 0) long = absorb(absorb(long, this.carriedLong), this.carriedShort)

    if (short < 0) this.carriedShort.push({ year, amount: -short })
    if (long < 0) this.carriedLong.push({ year, amount: -long })

    const tax = Math.max(short, 0) * r.shortTermRate + Math.max(long - r.longTermExemption, 0) * r.longTermRate
    result.tax = tax * (1 + r.cess)
    return result
  }
}

/**
 * A ledger for a book that holds assets taxed under different rules. Each
 * group keeps its own gains and losses. A loss in one group is not set off
 * against a gain in another, which slightly overstates the tax.
 */
export class GroupedTaxLedger implements Ledger {
  private base: TaxLedger
  private others: Array<{ applies: (symbol: string) => boolean; ledger: TaxLedger }>

  constructor(rules: TaxRules, groups: TaxGroup[]) {
    this.base = new TaxLedger(rules)
    this.others = groups.map(g => ({ applies: g.applies, ledger: new TaxLedger(g.rules) }))
  }

  private of(symbol: string): TaxLedger {
    return this.others.find(o => o.applies(symbol))?.ledger ?? this.base
  }

  buy(symbol: string, units: number, cost: number, date: number): void { this.of(symbol).buy(symbol, units, cost, date) }
  sell(symbol: string, units: number, proceeds: number, date: number): number { return this.of(symbol).sell(symbol, units, proceeds, date) }

  settleYear(year: number): YearTax {
    const total: YearTax = { year, shortTermGain: 0, longTermGain: 0, tax: 0 }
    for (const ledger of [this.base, ...this.others.map(o => o.ledger)]) {
      const y = ledger.settleYear(year)
      total.shortTermGain += y.shortTermGain
      total.longTermGain += y.longTermGain
      total.tax += y.tax
    }
    return total
  }
}
