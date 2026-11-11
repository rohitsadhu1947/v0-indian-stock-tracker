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

interface Lot { units: number; costPerUnit: number; date: number }
interface CarriedLoss { year: number; amount: number }

export interface YearTax {
  year: number
  shortTermGain: number   // net for the year, before set-off
  longTermGain: number
  tax: number
}

export class TaxLedger {
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
