import { describe, expect, it } from 'vitest'
import { parseCorporateAction, rightsPriceFactor, statedPriceFactor } from '../market-data/corporate-actions'

// Every string below is a real PURPOSE value from NSE's Bc files.
describe('parseCorporateAction', () => {
  it.each([
    ['FV SPLIT RS.10 TO RS.2', 10, 2],
    ['FV SPLIT RS.10 TO RE.1', 10, 1],
    ['FV SPLIT RS.2/- TO RE.1/-', 2, 1],
    ['FV SPLIT RS.10/- TO RS.5/', 10, 5],
    ['FVSPLT FRM RS 10 TO RS 2', 10, 2],
    ['CONSOLIDATION RE1 TO RS10', 1, 10],
    ['CNSLDATN RE 1 TO RS 10', 1, 10],
    ['CNSLDATNRE1 TO RS10', 1, 10],
    ['DIV-RS 2/FV-SPTLRS10TORS2', 10, 2],
    ['SUB DIV FRM RS 10 TO RS 2', 10, 2],
  ])('reads the face value change in "%s"', (text, from, to) => {
    expect(parseCorporateAction(text).split).toEqual({ from, to })
  })

  it.each([
    ['BONUS 4:1', 4, 1],
    ['BONUS 1: 2', 1, 2],
    ['BON1:1/FV SPL RS.10TORE.1', 1, 1],
    ['DIV-RS.5.50 PR SH/BON-1:1', 1, 1],
    ['BONUS @ 1:1', 1, 1],
    ['BONUS: 1:4', 1, 4],
    ['BONUS ISSUE 1 : 1', 1, 1],
  ])('reads the bonus ratio in "%s"', (text, newShares, perHeld) => {
    expect(parseCorporateAction(text).bonus).toEqual({ newShares, perHeld })
  })

  it.each([
    ['BON 1:1/FV SPL RS.5TORE.1', 0.5 * 0.2],
    ['AGM/BON 2:1/SPL RS10TORE1', (1 / 3) * 0.1],
    ['BONS1:1/FV SPLT RS5TO RE1', 0.5 * 0.2],
    ['FV SPL-RS10TORS5/BON-2:1', 0.5 * (1 / 3)],
    ['BON 1:1/SPL RS10 TO RS2', 0.5 * 0.2],
  ])('combines bonus and split in "%s"', (text, factor) => {
    expect(statedPriceFactor(parseCorporateAction(text))).toBeCloseTo(factor, 10)
  })

  it.each([
    ['DIVIDEND-RS.5/- PER SHARE', 5],
    ['AGM/DIV-RS.3.50 PER SHARE', 3.5],
    ['AGM/DIV-RE.0.60 PER SHARE', 0.6],
    ['AGM/DIV.RE.1/-PER SHARE', 1],
    ['DIVIDEND RS0.50 PER SHARE', 0.5],
    ['DIV - RE 0.125 PER SH', 0.125],
    ['INTDIV - RS 11.25 PER SH', 11.25],
    ['DIV- FIN RS.3.50+SPL RS.2', 5.5],
    ['AGM/DIV-FIN 8.75+SPL 0.75', 9.5],
    ['3RD INT DIV-RS.2/- PR SHR', 2],
    ['DIV RS 1.40 / BONUS 1:1', 1.4],
    ['INT DIV-RS3/SPLT-RS5TORS2', 3],
  ])('reads the dividend in "%s"', (text, amount) => {
    expect(parseCorporateAction(text).dividend).toEqual({ amount })
  })

  it('leaves the dividend amount unknown when the text has none', () => {
    expect(parseCorporateAction('2ND INTERIM DIVIDEND').dividend).toEqual({ amount: null })
    expect(parseCorporateAction('INT DIV/SPLIT- RS.5TORS.2').dividend).toEqual({ amount: null })
  })

  it('does not read a special dividend as a split', () => {
    const a = parseCorporateAction('DIV-FIN RS.5+SPL RS.10')
    expect(a.split).toBeUndefined()
    expect(a.dividend).toEqual({ amount: 15 })
    for (const text of ['INTDIV- RS 8 SPLDV RS 67', 'DIV - RS 8/SPLDV - RS 15', 'AGM/DIV-FIN 2.50/SPL-2.50']) {
      expect(parseCorporateAction(text).restructure, text).toBe(false)
      expect(parseCorporateAction(text).split, text).toBeUndefined()
    }
    expect(parseCorporateAction('INTDIV- RS 8 SPLDV RS 67').dividend).toEqual({ amount: 75 })
  })

  it('reads rights issues with and without a premium', () => {
    expect(parseCorporateAction('RIGHTS 1:10 @PRM RS 95/-').rights).toEqual({ newShares: 1, perHeld: 10, premium: 95 })
    expect(parseCorporateAction('RIGHTS-3:5@PRIUM RS.93').rights).toEqual({ newShares: 3, perHeld: 5, premium: 93 })
    expect(parseCorporateAction('RIGHTS2:1@PREUM RS 39.50').rights).toEqual({ newShares: 2, perHeld: 1, premium: 39.5 })
    expect(parseCorporateAction('RIGHTS 613:399').rights).toEqual({ newShares: 613, perHeld: 399, premium: null })
  })

  it('marks actions whose ratio is not in the text', () => {
    for (const text of ['DEMERGER', 'SCHEME OF ARRANGEMENT', 'SCHEME OF DEMERGER', 'CAPITAL REDUCTION',
      'SCH OF AGMT-BONUS DEB 6:1', 'BONUS 1 DVR : 10 EQ SHARE', 'FV SPLT FRM RS 10/- TO RS',
      'AGM/DIV-RS 29.50/BONUS', 'CAP REDN/CONSOLIDATION']) {
      const a = parseCorporateAction(text)
      expect(a.restructure, text).toBe(true)
      expect(statedPriceFactor(a), text).toBeNull()
    }
  })

  it('ignores meetings and book closures', () => {
    const a = parseCorporateAction('Annual General Meeting')
    expect(a).toEqual({ restructure: false })
  })
})

describe('rightsPriceFactor', () => {
  it('is the theoretical ex-rights price over the cum-rights close', () => {
    // 1 new share at 95 for every 10 held at 200: (10*200 + 95) / 11 = 190.45
    const a = parseCorporateAction('RIGHTS 1:10 @PRM RS 95/-')
    expect(rightsPriceFactor(a, 200)).toBeCloseTo(190.4545 / 200, 4)
  })

  it('is null when the issue is not at a discount or has no price', () => {
    expect(rightsPriceFactor(parseCorporateAction('RIGHTS 1:10 @PRM RS 95/-'), 90)).toBeNull()
    expect(rightsPriceFactor(parseCorporateAction('RIGHTS 613:399'), 100)).toBeNull()
  })
})
