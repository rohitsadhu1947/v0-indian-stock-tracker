/**
 * Reads NSE's daily F&O file (every future and option contract) in both of
 * its layouts, and sums a day's options into one row per underlying.
 * Pure functions.
 *
 * In both layouts open interest is in shares, volume is in contracts and
 * value is the notional rupees traded.
 */

export interface FoRow {
  future: boolean
  /** True for index contracts (NIFTY, BANKNIFTY), false for stocks. */
  index: boolean
  symbol: string
  /** YYYYMMDD. */
  expiry: number
  strike: number
  /** Null for futures. */
  type: 'CE' | 'PE' | null
  open: number
  high: number
  low: number
  close: number
  settle: number
  contracts: number
  value: number
  oi: number
  chgOi: number
}

const MONTHS: Record<string, string> = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' }

/** "29-Jan-2015" or "2026-12-29" to 20150129. Null when it is neither. */
export function expiryInt(text: string): number | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (iso) return Number(iso[1] + iso[2] + iso[3])
  const old = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(text)
  const month = old && MONTHS[old[2].toUpperCase()]
  return old && month ? Number(old[3] + month + old[1].padStart(2, '0')) : null
}

const KIND: Record<string, { future: boolean; index: boolean }> = {
  FUTIDX: { future: true, index: true }, FUTSTK: { future: true, index: false },
  OPTIDX: { future: false, index: true }, OPTSTK: { future: false, index: false },
  IDF: { future: true, index: true }, STF: { future: true, index: false },
  IDO: { future: false, index: true }, STO: { future: false, index: false },
}
const OPTION_TYPE: Record<string, 'CE' | 'PE'> = { CE: 'CE', CA: 'CE', PE: 'PE', PA: 'PE' }

/** Every index and stock future and option in one day's file. Other instruments are skipped. */
export function parseFoFile(csv: string): FoRow[] {
  const lines = csv.split(/\r?\n/)
  const header = lines[0].split(',').map(h => h.trim())
  const at = (name: string) => header.indexOf(name)
  const modern = at('FinInstrmTp') >= 0
  const col = modern
    ? { kind: at('FinInstrmTp'), symbol: at('TckrSymb'), expiry: at('XpryDt'), strike: at('StrkPric'), type: at('OptnTp'), open: at('OpnPric'), high: at('HghPric'), low: at('LwPric'), close: at('ClsPric'), settle: at('SttlmPric'), contracts: at('TtlTradgVol'), value: at('TtlTrfVal'), oi: at('OpnIntrst'), chgOi: at('ChngInOpnIntrst') }
    : { kind: at('INSTRUMENT'), symbol: at('SYMBOL'), expiry: at('EXPIRY_DT'), strike: at('STRIKE_PR'), type: at('OPTION_TYP'), open: at('OPEN'), high: at('HIGH'), low: at('LOW'), close: at('CLOSE'), settle: at('SETTLE_PR'), contracts: at('CONTRACTS'), value: at('VAL_INLAKH'), oi: at('OPEN_INT'), chgOi: at('CHG_IN_OI') }
  if (Object.values(col).some(i => i < 0)) throw new Error(`F&O file has an unknown layout: ${lines[0].slice(0, 120)}`)
  const valueScale = modern ? 1 : 1e5

  const rows: FoRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const f = lines[i].split(',')
    const kind = KIND[f[col.kind]?.trim()]
    if (!kind) continue
    const expiry = expiryInt(f[col.expiry].trim())
    const type = kind.future ? null : OPTION_TYPE[f[col.type].trim()]
    if (expiry == null || type === undefined) continue
    rows.push({
      ...kind, symbol: f[col.symbol].trim(), expiry, strike: kind.future ? 0 : Number(f[col.strike]), type,
      open: Number(f[col.open]), high: Number(f[col.high]), low: Number(f[col.low]), close: Number(f[col.close]), settle: Number(f[col.settle]),
      contracts: Number(f[col.contracts]), value: Number(f[col.value]) * valueScale, oi: Number(f[col.oi]), chgOi: Number(f[col.chgOi]),
    })
  }
  return rows
}

export interface OptionsDay {
  symbol: string
  index: boolean
  /** Totals across every expiry. */
  callOi: number
  putOi: number
  callChgOi: number
  putChgOi: number
  callContracts: number
  putContracts: number
  /** The nearest expiry on or after the day, and its totals. */
  nearExpiry: number
  nearCallOi: number
  nearPutOi: number
  nearCallContracts: number
  nearPutContracts: number
  /** Strike at which option buyers of the nearest expiry lose the most in total. Null when it has no open interest. */
  maxPain: number | null
  /** Strikes holding the most call and the most put open interest in the nearest expiry. */
  topCallStrike: number | null
  topPutStrike: number | null
  /** Strike nearest the reference price that has both a call and a put, and their closing prices. */
  atmStrike: number | null
  atmCall: number | null
  atmPut: number | null
}

/**
 * One row per underlying from a day's option contracts. `reference` gives the
 * price to find the at-the-money strike with (the nearest future's close).
 */
export function summariseOptions(rows: FoRow[], date: number, reference: (symbol: string) => number | undefined): OptionsDay[] {
  const bySymbol = new Map<string, FoRow[]>()
  for (const r of rows) {
    if (r.future || r.expiry < date) continue
    const list = bySymbol.get(r.symbol)
    if (list) list.push(r); else bySymbol.set(r.symbol, [r])
  }
  const out: OptionsDay[] = []
  for (const [symbol, list] of bySymbol) {
    let nearExpiry = Infinity
    for (const r of list) if (r.expiry < nearExpiry) nearExpiry = r.expiry
    const day: OptionsDay = {
      symbol, index: list[0].index, callOi: 0, putOi: 0, callChgOi: 0, putChgOi: 0, callContracts: 0, putContracts: 0,
      nearExpiry, nearCallOi: 0, nearPutOi: 0, nearCallContracts: 0, nearPutContracts: 0,
      maxPain: null, topCallStrike: null, topPutStrike: null, atmStrike: null, atmCall: null, atmPut: null,
    }
    const strikes = new Map<number, { callOi: number; putOi: number; call: number | null; put: number | null }>()
    for (const r of list) {
      const call = r.type === 'CE'
      if (call) { day.callOi += r.oi; day.callChgOi += r.chgOi; day.callContracts += r.contracts }
      else { day.putOi += r.oi; day.putChgOi += r.chgOi; day.putContracts += r.contracts }
      if (r.expiry !== nearExpiry) continue
      if (call) { day.nearCallOi += r.oi; day.nearCallContracts += r.contracts }
      else { day.nearPutOi += r.oi; day.nearPutContracts += r.contracts }
      const s = strikes.get(r.strike) ?? { callOi: 0, putOi: 0, call: null, put: null }
      if (call) { s.callOi += r.oi; s.call = r.close } else { s.putOi += r.oi; s.put = r.close }
      strikes.set(r.strike, s)
    }
    const sorted = [...strikes.entries()].sort((a, b) => a[0] - b[0])

    let topCall = 0, topPut = 0
    for (const [strike, s] of sorted) {
      if (s.callOi > topCall) { topCall = s.callOi; day.topCallStrike = strike }
      if (s.putOi > topPut) { topPut = s.putOi; day.topPutStrike = strike }
    }
    if (day.nearCallOi + day.nearPutOi > 0) {
      let least = Infinity
      for (const [settleAt] of sorted) {
        let paid = 0
        for (const [strike, s] of sorted) paid += s.callOi * Math.max(0, settleAt - strike) + s.putOi * Math.max(0, strike - settleAt)
        if (paid < least) { least = paid; day.maxPain = settleAt }
      }
    }
    const price = reference(symbol)
    if (price && price > 0) {
      let gap = Infinity
      for (const [strike, s] of sorted) {
        if (s.call == null || s.put == null || !(s.call > 0) || !(s.put > 0)) continue
        if (Math.abs(strike - price) < gap) { gap = Math.abs(strike - price); day.atmStrike = strike; day.atmCall = s.call; day.atmPut = s.put }
      }
    }
    out.push(day)
  }
  return out
}

export interface ParticipantRow {
  /** Client (retail and others), DII, FII or Pro (proprietary desks). */
  client: string
  /** Contracts, in the order the file lists them. */
  futIndexLong: number; futIndexShort: number; futStockLong: number; futStockShort: number
  optIndexCallLong: number; optIndexPutLong: number; optIndexCallShort: number; optIndexPutShort: number
  optStockCallLong: number; optStockPutLong: number; optStockCallShort: number; optStockPutShort: number
}

/** Open interest by participant type from NSE's daily file. */
export function parseParticipantOi(csv: string): ParticipantRow[] {
  const out: ParticipantRow[] = []
  for (const line of csv.split(/\r?\n/)) {
    const f = line.split(',').map(x => x.trim())
    if (!['Client', 'DII', 'FII', 'Pro'].includes(f[0]) || f.length < 13) continue
    const n = f.slice(1, 13).map(Number)
    if (n.some(x => !Number.isFinite(x))) continue
    out.push({
      client: f[0], futIndexLong: n[0], futIndexShort: n[1], futStockLong: n[2], futStockShort: n[3],
      optIndexCallLong: n[4], optIndexPutLong: n[5], optIndexCallShort: n[6], optIndexPutShort: n[7],
      optStockCallLong: n[8], optStockPutLong: n[9], optStockCallShort: n[10], optStockPutShort: n[11],
    })
  }
  return out
}

/** Symbols in the F&O ban list file. */
export function parseBanList(csv: string): string[] {
  return csv.split(/\r?\n/).map(line => /^\s*\d+\s*,\s*([A-Z0-9&-]+)\s*$/.exec(line)?.[1]).filter((s): s is string => !!s)
}
