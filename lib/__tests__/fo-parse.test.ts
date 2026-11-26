import { describe, expect, it } from 'vitest'
import { expiryInt, parseBanList, parseFoFile, parseParticipantOi, summariseOptions } from '@/lib/research/fo-parse'

const OLD = `INSTRUMENT,SYMBOL,EXPIRY_DT,STRIKE_PR,OPTION_TYP,OPEN,HIGH,LOW,CLOSE,SETTLE_PR,CONTRACTS,VAL_INLAKH,OPEN_INT,CHG_IN_OI,TIMESTAMP,
FUTIDX,BANKNIFTY,29-Jan-2015,0,XX,18861.35,18929.95,18775,18904.2,18904.2,45538,214767.69,1960450,-3300,01-JAN-2015,
FUTSTK,RELIANCE,29-Jan-2015,0,XX,893.4,898.35,890.2,893.95,893.95,7140,15955,32980500,121250,01-JAN-2015,
FUTIVX,INDIAVIX,06-Jan-2015,0,XX,0,0,0,15,15,0,0,0,0,01-JAN-2015,
OPTSTK,RELIANCE,29-Jan-2015,900,CE,20,22,18,21,21,100,500,50000,1000,01-JAN-2015,
`
const NEW = `TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric,UndrlygPric,SttlmPric,OpnIntrst,ChngInOpnIntrst,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd,SsnId,NewBrdLotQty,Rmks,Rsvd1,Rsvd2,Rsvd3,Rsvd4
2026-11-25,2026-11-25,FO,NSE,STO,132610,,RELIANCE,,2026-12-29,2026-12-29,1110.00,PE,RELIANCE26DEC1110PE,0.60,0.80,0.60,0.70,0.70,0.85,1373.89,0.70,37000,9500,54,29990475.00,51,F1,500,,,,,
2026-11-25,2026-11-25,FO,NSE,STF,1,,RELIANCE,,2026-12-29,2026-12-29,,,RELIANCE26DECFUT,1370,1380,1365,1376,1376,1370,1373.89,1376,5000000,-20000,9000,6192000000.00,800,F1,500,,,,,
`

describe('expiryInt', () => {
  it('reads both date styles', () => {
    expect(expiryInt('29-Jan-2015')).toBe(20150129)
    expect(expiryInt('2026-12-29')).toBe(20261229)
    expect(expiryInt('soon')).toBeNull()
  })
})

describe('parseFoFile', () => {
  it('reads the old layout and skips other instruments', () => {
    const rows = parseFoFile(OLD)
    expect(rows.map(r => `${r.symbol}:${r.future ? 'F' : r.type}`)).toEqual(['BANKNIFTY:F', 'RELIANCE:F', 'RELIANCE:CE'])
    expect(rows[1]).toMatchObject({ index: false, expiry: 20150129, close: 893.95, contracts: 7140, value: 1595500000, oi: 32980500, chgOi: 121250 })
    expect(rows[0].index).toBe(true)
  })

  it('reads the new layout', () => {
    const [put, future] = parseFoFile(NEW)
    expect(put).toMatchObject({ future: false, type: 'PE', strike: 1110, expiry: 20261229, close: 0.7, oi: 37000, contracts: 54, value: 29990475 })
    expect(future).toMatchObject({ future: true, type: null, close: 1376, oi: 5000000, chgOi: -20000 })
  })

  it('refuses a file it does not recognise', () => {
    expect(() => parseFoFile('a,b,c\n1,2,3')).toThrow(/unknown layout/)
  })
})

const option = (expiry: number, strike: number, type: 'CE' | 'PE', oi: number, close: number, contracts = 10) =>
  ({ future: false, index: false, symbol: 'ABC', expiry, strike, type, open: close, high: close, low: close, close, settle: close, contracts, value: 0, oi, chgOi: 1 })

describe('summariseOptions', () => {
  const rows = [
    option(20260129, 90, 'CE', 100, 12), option(20260129, 90, 'PE', 500, 1),
    option(20260129, 100, 'CE', 300, 4), option(20260129, 100, 'PE', 300, 3),
    option(20260129, 110, 'CE', 600, 1), option(20260129, 110, 'PE', 50, 11),
    option(20260226, 100, 'CE', 1000, 8), option(20260226, 100, 'PE', 400, 7),
    option(20260101, 100, 'CE', 9999, 1),   // expired before the day: ignored
  ]
  const [day] = summariseOptions(rows, 20260115, () => 102)

  it('totals every live expiry and the nearest one', () => {
    expect(day.callOi).toBe(2000)
    expect(day.putOi).toBe(1250)
    expect(day.nearExpiry).toBe(20260129)
    expect(day.nearCallOi).toBe(1000)
    expect(day.nearPutOi).toBe(850)
    expect(day.callContracts).toBe(40)
  })

  it('finds the busiest strikes, max pain and the at-the-money pair', () => {
    expect(day.topCallStrike).toBe(110)
    expect(day.topPutStrike).toBe(90)
    // Settling at 100 costs buyers least: calls at 90 pay 1,000 and puts at 110 pay 500
    expect(day.maxPain).toBe(100)
    expect(day).toMatchObject({ atmStrike: 100, atmCall: 4, atmPut: 3 })
  })

  it('leaves the at-the-money pair empty without a reference price', () => {
    expect(summariseOptions(rows, 20260115, () => undefined)[0].atmStrike).toBeNull()
  })
})

describe('parseParticipantOi and parseBanList', () => {
  it('reads the four participant rows and skips the total', () => {
    const csv = `"Participant wise Open Interest",,,\nClient Type,Future Index Long,...\nClient,1,2,3,4,5,6,7,8,9,10,11,12,99,99\nFII,10,20,30,40,50,60,70,80,90,100,110,120,99,99\nTOTAL,1,1,1,1,1,1,1,1,1,1,1,1,1,1\n`
    const rows = parseParticipantOi(csv)
    expect(rows.map(r => r.client)).toEqual(['Client', 'FII'])
    expect(rows[1]).toMatchObject({ futIndexLong: 10, futIndexShort: 20, optStockPutShort: 120 })
  })

  it('reads the ban list', () => {
    expect(parseBanList('Securities in Ban For Trade Date 26-NOV-2026:\n1,APLAPOLLO\n2,M&M\n')).toEqual(['APLAPOLLO', 'M&M'])
    expect(parseBanList('Securities in Ban For Trade Date 26-NOV-2026: NIL\n')).toEqual([])
  })
})
