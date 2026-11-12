import { describe, expect, it } from 'vitest'
import {
  continuity, parseArchiveDate, parseBoardMeetings, parseCorporateActionsFile, parseDeliveryFile, parseLegacyBhavcopy, parseMarketCapFile,
  parsePriceFile, parseSymbolChanges,
} from '../market-data/nse-parse'
import { applyAdjustments, factorFromGap, resolveEvents, resolveUnannounced, type RawPriceBar } from '../market-data/adjust'
import { parseEtfList, securityKind } from '../market-data/classify'
import { SymbolMap } from '../market-data/series'
import { lastAtOrBefore, monthEnds, universeAsOf, type LiquidityInput } from '../market-data/universe'

const PD_HEADER = 'MKT,SERIES,SYMBOL,SECURITY,PREV_CL_PR,OPEN_PRICE,HIGH_PRICE,LOW_PRICE,CLOSE_PRICE,NET_TRDVAL,NET_TRDQTY,IND_SEC,CORP_IND,TRADES,HI_52_WK,LO_52_WK'

// Rows are copied from real NSE files
describe('parsePriceFile', () => {
  it('reads an equity row', () => {
    const { equities } = parsePriceFile([PD_HEADER,
      'N,EQ,IRCTC,INDIAN RAIL TOUR CORP LTD,      4189.50,      4250.50,      4334.80,      4033.75,      4130.15,              22223413210.70,5358793,N, ,512531,      6396.30,      1290.05',
    ].join('\n'))
    expect(equities).toEqual([{
      symbol: 'IRCTC', name: 'INDIAN RAIL TOUR CORP LTD', series: 'EQ', prevClose: 4189.5, open: 4250.5, high: 4334.8, low: 4033.75,
      close: 4130.15, volume: 5358793, value: 22223413210.7, trades: 512531,
    }])
  })

  it('reads rows that end with a stray comma (2010, 2015-16 files)', () => {
    const { equities } = parsePriceFile('N,EQ,ACC,ACC LIMITED,891.35,891.2,902,880.55,892.8,355616003.00,397267.00,Y, ,13117.00,1020.00,568.60,\r\n')
    expect(equities[0]).toMatchObject({ symbol: 'ACC', open: 891.2, close: 892.8, volume: 397267, value: 355616003 })
  })

  it('reads a security name that contains a comma', () => {
    const { equities } = parsePriceFile('N,EQ,XYZ,XYZ INDUSTRIES, LTD,100,101,102,99,101.5,5000000,50000,Y, ,400,150,80')
    expect(equities[0]).toMatchObject({ symbol: 'XYZ', prevClose: 100, close: 101.5, volume: 50000 })
  })

  it('separates index rows and skips non-equity series', () => {
    const { equities, indices } = parsePriceFile([PD_HEADER,
      'Y, , ,Nifty 50,     18268.40,     18295.85,     18342.05,     18167.90,     18210.95,705793127792.85,2456691695,Y, ,22758768,     18604.45,     11535.45',
      'N,E1,RELIANCEP1,RELIANCE RS.5 PPD UP,      2016.15,      2015.00,      2034.45,      1978.00,      1987.60,               1713606769.55,853872,N, ,9479,      2111.20,      1388.25',
      'N,GB,SGBJUN28,2.5%GOLDBONDS2028SR-III,14925.83,15044.00,14925.83,15040.00,15040.00,689144.59,46,N, ,15,15100,9000',
    ].join('\n'))
    expect(equities).toEqual([])
    expect(indices).toEqual([{ name: 'Nifty 50', open: 18295.85, high: 18342.05, low: 18167.9, close: 18210.95 }])
  })

  it('keeps the series that traded more when a symbol appears twice', () => {
    const { equities } = parsePriceFile([
      'N,BE,ABC,ABC LTD,10,10,10,10,10,1000,100,N, ,5,12,8',
      'N,EQ,ABC,ABC LTD,10,10,11,10,11,900000,90000,N, ,500,12,8',
    ].join('\n'))
    expect(equities).toHaveLength(1)
    expect(equities[0]).toMatchObject({ series: 'EQ', close: 11 })
  })
})

describe('other NSE files', () => {
  it('reads corporate actions in both date formats, once each', () => {
    const rows = parseCorporateActionsFile([
      'SERIES,SYMBOL,SECURITY,RECORD_DT,BC_STRT_DT,BC_END_DT,EX_DT,ND_STRT_DT,ND_END_DT,PURPOSE',
      'BE,IRCTC,Indian Rail Tour Corp Ltd,29/10/2021, , ,28/10/2021, , ,FVSPLT FRM RS 10 TO RS 2 ',
      'EQ,IRCTC,Indian Rail Tour Corp Ltd,29/10/2021, , ,28/10/2021, , ,FVSPLT FRM RS 10 TO RS 2 ',
      'EQ,AARTECH,Aartech Solonics Limited,2026-09-22,,,2026-09-22,,,DIV - RE 0.125 PER SH',
      'NC,1065NFL27,Sec Re NCD 10.65% Sr.IV,2026-09-28,,,2026-09-28,,,INTEREST PAYMENT',
    ].join('\r\n'))
    expect(rows).toEqual([
      { symbol: 'IRCTC', exDate: '2021-10-28', purpose: 'FVSPLT FRM RS 10 TO RS 2' },
      { symbol: 'AARTECH', exDate: '2026-09-22', purpose: 'DIV - RE 0.125 PER SH' },
    ])
    expect(parseArchiveDate('31/12/2009')).toBe('2009-12-31')
    expect(parseArchiveDate(' ')).toBeNull()
  })

  it('reads delivery quantities', () => {
    const rows = parseDeliveryFile([
      'Security Wise Delivery Position - Compulsory Rolling Settlement',
      '10,MTO,02012012,116070724,0001495',
      '20,1,20MICRONS,EQ,70533,2548,3.61',
      '20,2,1003SFIL28,NX,379,227,59.89',
    ].join('\n'))
    expect(rows).toEqual([{ symbol: '20MICRONS', series: 'EQ', tradedQty: 70533, deliveredQty: 2548 }])
  })

  it('reads shares outstanding from the market cap file', () => {
    const rows = parseMarketCapFile('25 SEP 2026,20MICRONS,EQ,20 MICRONS LTD           ,Listed    ,25 SEP 2026,               5.00,          35286502,            217.60,     7677637105.15 ')
    expect(rows).toEqual([{ symbol: '20MICRONS', faceValue: 5, shares: 35286502, marketCap: 7677637105.15 }])
  })

  it('reads board meetings and marks the ones for results', () => {
    const rows = parseBoardMeetings([
      'COMPANY NAME    SYMBOL     : BM DATE    : BM PURPOSE ',
      'Coal India Limited    COALINDIA : 12-NOV-2021 : Financial Results To consider and approve the financial results for the period ended September 30, 2021',
      'MIC Electronics Limited    MIC : 16-May-2015 : To consResults/Otherssider Audited Financial Results for the fourth quarter',
      'Super Spinning Mills Ltd    SUPERSPIN  : 25-JAN-2010 :Unaudited Financial Results for the qtr ended Dec 31, 2009',
      'Punjab & Sind Bank PSB : 29-SEP-2026 : Fund Raising To consider Fund Raising',
    ].join('\n'))
    expect(rows).toEqual([
      { symbol: 'COALINDIA', date: '2021-11-12', results: true },
      { symbol: 'MIC', date: '2015-05-16', results: true },
      { symbol: 'SUPERSPIN', date: '2010-01-25', results: true },
      { symbol: 'PSB', date: '2026-09-29', results: false },
    ])
  })

  it('reads symbol changes', () => {
    expect(parseSymbolChanges('NAME OF THE COMPANY,OLD SYMBOL,NEW SYMBOL,EFFECTIVE DATE\nInfosys Limited,INFOSYSTCH,INFY,29-JUN-2011'))
      .toEqual([{ oldSymbol: 'INFOSYSTCH', newSymbol: 'INFY', effectiveDate: '2011-06-29' }])
  })
})

describe('SymbolMap', () => {
  const map = new SymbolMap([
    { old_symbol: 'INFOSYSTCH', new_symbol: 'INFY', effective_date: 20110629 },
    { old_symbol: 'A', new_symbol: 'B', effective_date: 20120101 },
    { old_symbol: 'B', new_symbol: 'C', effective_date: 20150101 },
  ])

  it('follows a chain of renames to the current symbol', () => {
    expect(map.canonical('INFOSYSTCH', 20100104)).toBe('INFY')
    expect(map.canonical('A', 20110101)).toBe('C')
    expect(map.canonical('INFY', 20200101)).toBe('INFY')
  })

  it('does not follow a rename that happened before the bar (symbol reused later)', () => {
    expect(map.canonical('A', 20180101)).toBe('A')
  })
})

/** Flat bars at `price`, one per day from 1 Jan 2020, with overrides by index. */
function series(prices: Array<number | [open: number, close: number]>): RawPriceBar[] {
  return prices.map((p, i) => {
    const [open, close] = Array.isArray(p) ? p : [p, p]
    return { date: 20200101 + i, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 1000, value: close * 1000 }
  })
}

describe('resolveEvents', () => {
  it('applies a split the price confirms and rescales earlier bars', () => {
    const bars = series([100, 100, [20.5, 21], 21])
    const events = resolveEvents(bars, new Map([[20200103, ['FV SPLIT RS.10 TO RS.2']]]))
    expect(events).toMatchObject([{ exDate: 20200103, status: 'confirmed', priceFactor: 0.2, shareFactor: 0.2 }])

    const adj = applyAdjustments(bars, events)
    expect(adj.map(b => b.close)).toEqual([20, 20, 21, 21])
    expect(adj.map(b => b.volume)).toEqual([5000, 5000, 1000, 1000])
    expect(adj[0].value).toBe(bars[0].value) // rupee turnover is unaffected
  })

  it('rejects a stated ratio the price contradicts and leaves the series alone', () => {
    const bars = series([100, 100, 101, 100])
    const events = resolveEvents(bars, new Map([[20200103, ['BONUS 1:1']]]))
    expect(events).toMatchObject([{ status: 'rejected', priceFactor: 1 }])
    expect(applyAdjustments(bars, events).map(b => b.close)).toEqual([100, 100, 101, 100])
  })

  it('finds the real ex-date when the file is off by a session', () => {
    const bars = series([100, 100, 100, [50, 51], 51])
    const events = resolveEvents(bars, new Map([[20200103, ['BONUS 1:1']]]))
    expect(events).toMatchObject([{ exDate: 20200104, status: 'confirmed', priceFactor: 0.5 }])
  })

  it('applies a postponed action once when NSE lists it under both ex-dates', () => {
    // Inox Wind, May 2024: 3:1 bonus listed for the 17th, then moved to the 24th
    const bars = series([600, 600, 600, 600, 600, [160, 165], 165])
    const events = resolveEvents(bars, new Map([[20200102, ['BONUS 3:1']], [20200106, ['BONUS 3:1']]]))
    expect(events).toHaveLength(1)
    expect(applyAdjustments(bars, events).map(b => b.close)).toEqual([150, 150, 150, 150, 150, 165, 165])
  })

  it('adjusts a rights issue by the theoretical ex-rights price when the price agrees', () => {
    // 1 new share at 95 for every 10 held at 200: ex-rights price 190.45
    const bars = series([200, 200, [190, 190], 190])
    const [event] = resolveEvents(bars, new Map([[20200103, ['RIGHTS 1:10 @PRM RS 95/-']]]))
    expect(event.priceFactor).toBeCloseTo(190.4545 / 200, 4)
  })

  it('uses the actual fall for a rights issue at par, where the premium understates the issue price', () => {
    // California Software, Jan 2025: "RIGHTS 3:1 @ PRM RS 0/-" implies 0.25; the price went to 0.60
    const bars = series([22.87, 22.87, [13.63, 13.88], 14])
    const [event] = resolveEvents(bars, new Map([[20200103, ['RIGHTS 3:1 @ PRM RS 0/-']]]))
    expect(event.priceFactor).toBeCloseTo(13.63 / 22.87, 10)
  })

  it('takes a demerger ratio from the ex-date open', () => {
    const bars = series([200, 200, [130, 128], 128])
    const events = resolveEvents(bars, new Map([[20200103, ['SCHEME OF ARRANGEMENT']]]))
    expect(events).toMatchObject([{ status: 'inferred', priceFactor: 0.65 }])
    expect(applyAdjustments(bars, events)[0].close).toBeCloseTo(130, 10)
  })

  it('ignores a scheme of arrangement that did not move the price', () => {
    const bars = series([200, 200, [198, 199], 199])
    expect(resolveEvents(bars, new Map([[20200103, ['SCHEME OF ARRANGEMENT']]]))).toEqual([])
  })

  it('keeps an ordinary dividend out of the price series but in total return', () => {
    const bars = series([100, 100, [99, 99], 99])
    const events = resolveEvents(bars, new Map([[20200103, ['DIVIDEND-RE.1/- PER SHARE']]]))
    expect(events).toMatchObject([{ status: 'dividend', priceFactor: 1, dividend: 1 }])
    const adj = applyAdjustments(bars, events)
    expect(adj[0].close).toBe(100)
    expect(adj[0].totalReturnFactor).toBeCloseTo(0.99, 10)
    expect(adj[2].totalReturnFactor).toBe(1)
  })

  it('treats a very large special dividend as a price adjustment', () => {
    const bars = series([75, 75, [45, 46], 46])
    const events = resolveEvents(bars, new Map([[20200103, ['SPL INTDIV RS 30 PERSHARE', 'SPECIAL INTERIM DIVIDEND']]]))
    expect(events).toMatchObject([{ status: 'confirmed', dividend: 0 }])
    expect(events[0].priceFactor).toBeCloseTo(0.6, 10)
  })

  it('does not double count a dividend listed as a part and as the combined figure', () => {
    // SWELECTES, July 2012: "FIN RS3+INT RS120" is 123 in total, also listed as "RS.3/-"
    const bars = series([250, 250, [130, 128], 128])
    const events = resolveEvents(bars, new Map([[20200103, ['AGM/DIV-FIN RS3+INT RS120', 'AGM/DIV-RS.3/- PER SHARE']]]))
    expect(events[0].priceFactor).toBeCloseTo(1 - 123 / 250, 10)
  })

  it('adds up dividends listed separately for one ex-date', () => {
    const bars = series([100, 100, [93, 93], 93])
    const events = resolveEvents(bars, new Map([[20200103, ['DIVIDEND RS 2 PER SHARE', 'SPL DIV RS 5 PER SHARE']]]))
    expect(events[0].priceFactor).toBeCloseTo(0.93, 10)
  })

  it('uses the corrected figure when a dividend was listed wrongly first', () => {
    // SICAGEN, July 2017: listed as Rs 6, then corrected to Re 0.60, on a Rs 40 stock
    const bars = series([40, 40, [39.9, 39.9], 39.9])
    const events = resolveEvents(bars, new Map([[20200103, ['AGM/DIV-RS 6 PER SHARE', 'AGM/DIV-RE 0.60 PER SHARE']]]))
    expect(events).toMatchObject([{ status: 'dividend', priceFactor: 1, dividend: 0.6 }])
  })

  it('drops a dividend figure that cannot be right', () => {
    const bars = series([100, 100, 100, 100])
    expect(resolveEvents(bars, new Map([[20200103, ['DIVIDEND-RS.250 PER SHARE']]]))).toEqual([])
    expect(resolveEvents(bars, new Map([[20200103, ['DIVIDEND-RS.40 PER SHARE']]]))).toEqual([])
  })

  it('skips actions dated before the first bar', () => {
    expect(resolveEvents(series([100, 100]), new Map([[20191201, ['BONUS 1:1']]]))).toEqual([])
  })
})

describe('continuity', () => {
  const bar = (symbol: string, prevClose: number) =>
    ({ symbol, series: 'EQ', prevClose, open: 1, high: 1, low: 1, close: 1, volume: 0, value: 0, trades: 0 })

  it('is the share of stated previous closes that match the stored session', () => {
    const stored = new Map([['A', 100], ['B', 50], ['C', 20]])
    expect(continuity([bar('A', 100), bar('B', 50), bar('C', 20), bar('NEW', 9)], stored)).toBe(1)
    expect(continuity([bar('A', 131), bar('B', 50.4), bar('C', 20)], stored)).toBeCloseTo(1 / 3, 10)
  })

  it('reads the older price file and drops rows for another day', () => {
    const text = [
      'SYMBOL,SERIES,OPEN,HIGH,LOW,CLOSE,LAST,PREVCLOSE,TOTTRDQTY,TOTTRDVAL,TIMESTAMP,TOTALTRADES,ISIN,',
      'RELIANCE,EQ,913,919.55,906.4,911.15,911.5,909.75,4342815,3964649169.65,02-JAN-2018,63346,INE002A01018,',
      'TCS,EQ,2660,2669.6,2620.2,2631.2,2631,2645.6,960145,2535800011,03-JAN-2018,46813,INE467B01029,',
    ].join('\n')
    expect(parseLegacyBhavcopy(text, '2018-01-02')).toEqual([{
      symbol: 'RELIANCE', series: 'EQ', prevClose: 909.75, open: 913, high: 919.55, low: 906.4, close: 911.15,
      volume: 4342815, value: 3964649169.65, trades: 63346,
    }])
  })
})

describe('resolveUnannounced', () => {
  const adjacent = () => true

  it('adjusts an unannounced split when the stock traded the previous session', () => {
    // Shriram Finance, 10 Jan 2025: 1:5 split missing from NSE's file
    const bars = series([2800, 2800, [563, 560], 560])
    const { inferred, flagged } = resolveUnannounced(bars, [], adjacent)
    expect(flagged).toEqual([])
    expect(inferred).toMatchObject([{ exDate: 20200103, status: 'inferred', priceFactor: 0.2, shareFactor: 0.2 }])
    expect(applyAdjustments(bars, inferred)[0].close).toBeCloseTo(560, 10)
  })

  it('uses the move itself when it is not a split ratio, leaving volume alone', () => {
    const { inferred } = resolveUnannounced(series([100, 100, [45, 45]]), [], adjacent)
    expect(inferred).toMatchObject([{ priceFactor: 0.45, shareFactor: 1 }])
  })

  it('leaves a jump after a suspension alone and flags it', () => {
    const bars = series([100, 100, [220, 220]])
    const { inferred, flagged } = resolveUnannounced(bars, [], i => i !== 2)
    expect(inferred).toEqual([])
    expect(flagged).toEqual([{ date: 20200103, gap: 2.2 }])
  })

  it('does not touch a gap an announced action already explains', () => {
    const bars = series([100, 100, [50, 50], 50])
    const events = resolveEvents(bars, new Map([[20200103, ['BONUS 1:1']]]))
    expect(resolveUnannounced(bars, events, adjacent)).toEqual({ inferred: [], flagged: [] })
  })

  it('ignores a freak opening print that reverses by the close', () => {
    // Petronet, 30 Nov 2011: opened at 135 against a 164.65 close, closed at 164.90
    expect(resolveUnannounced(series([165, 165, [90, 164.9], 165]), [], adjacent)).toEqual({ inferred: [], flagged: [] })
  })

  it('ignores ordinary moves and penny stocks, where one tick is a large move', () => {
    expect(resolveUnannounced(series([100, [81, 81], [97, 97]]), [], adjacent).inferred).toEqual([])
    expect(resolveUnannounced(series([0.1, [0.05, 0.05], [0.1, 0.1]]), [], adjacent).inferred).toEqual([])
    expect(factorFromGap(1.2)).toBeNull()
  })
})

describe('securityKind', () => {
  const listed = parseEtfList('Symbol,Underlying Asset,SecurityName\nBBNPPGOLD,Gold,BARODABNP - BBNPPGOLD\n')

  it.each([
    ['NIFTYBEES', 'NIP IND ETF NIFTY BEES'],
    ['GOLDBEES', 'GOLDMAN SACHS GOLD EXCHA'],
    ['ALPL30IETF', 'ICICIPRAMC - ICICIALPLV'],
    ['KOTAKGOLD', 'KOTAK GOLD ETF'],
    ['NIFETF', 'ICICIPRAMC NIFETF'],
    ['M50', 'MOST SHARES M50 ETF'],
    ['SETFNIF50', 'SBI-ETF NIFTY 50'],
    ['BBNPPGOLD', 'BARODABNP - BBNPPGOLD'],
  ])('%s (%s) is a fund', (symbol, name) => {
    expect(securityKind(symbol, name, listed)).toBe('fund')
  })

  it.each([
    ['FIRSTCRY', 'BRAINBEES SOLUTIONS LTD'],
    ['JETFREIGHT', 'JET FREIGHT LOGISTICS LTD'],
    ['PNBGILTS', 'PNB GILTS LIMITED'],
    ['SENCO', 'SENCO GOLD LIMITED'],
    ['HDFCAMC', 'HDFC ASSET MANAGEMENT CO'],
    ['SBIFUNDS', 'SBI FUNDS MANAGEMENT LTD'],
    ['TATAMTRDVR', 'TATA MOTORS DVR A ORDY'],
  ])('%s (%s) is a company', (symbol, name) => {
    expect(securityKind(symbol, name, listed)).toBe('stock')
  })

  it('recognises rights entitlements by symbol', () => {
    expect(securityKind('KDDL-RE', 'KDDL LIMITED', listed)).toBe('rights')
    expect(securityKind('BHANDA-RE2', undefined, listed)).toBe('rights')
  })
})
