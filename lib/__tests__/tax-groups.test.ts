import { describe, expect, it } from 'vitest'
import { BOND_FUND_TAX, GOLD_AND_FOREIGN_FUND_TAX, GroupedTaxLedger, INDIA_EQUITY_TAX } from '@/lib/research/tax'

const ledger = () => new GroupedTaxLedger(INDIA_EQUITY_TAX, [
  { applies: s => s === 'GOLD', rules: GOLD_AND_FOREIGN_FUND_TAX },
  { applies: s => s === 'BOND', rules: BOND_FUND_TAX },
])

describe('GroupedTaxLedger', () => {
  it('taxes a gold fund at 12.5% after a year, with no exempt amount', () => {
    const l = ledger()
    l.buy('GOLD', 100, 100000, 20200101)
    l.sell('GOLD', 100, 200000, 20210601)
    expect(l.settleYear(2022).tax).toBeCloseTo(100000 * 0.125 * 1.04, 2)
  })

  it('taxes a gold fund sold within a year at 30%', () => {
    const l = ledger()
    l.buy('GOLD', 100, 100000, 20200101)
    l.sell('GOLD', 100, 200000, 20200601)
    expect(l.settleYear(2021).tax).toBeCloseTo(100000 * 0.3 * 1.04, 2)
  })

  it('taxes a bond fund at 30% however long it was held', () => {
    const l = ledger()
    l.buy('BOND', 100, 100000, 20200101)
    l.sell('BOND', 100, 150000, 20230601)
    expect(l.settleYear(2024).tax).toBeCloseTo(50000 * 0.3 * 1.04, 2)
  })

  it('keeps shares under the equity rules and adds the groups up', () => {
    const l = ledger()
    l.buy('TCS', 100, 100000, 20200101)
    l.sell('TCS', 100, 200000, 20210601)   // long-term gain of 1 lakh, under the exempt amount
    l.buy('GOLD', 100, 100000, 20200101)
    l.sell('GOLD', 100, 110000, 20210601)
    const y = l.settleYear(2022)
    expect(y.longTermGain).toBeCloseTo(110000, 2)
    expect(y.tax).toBeCloseTo(10000 * 0.125 * 1.04, 2)
  })
})
