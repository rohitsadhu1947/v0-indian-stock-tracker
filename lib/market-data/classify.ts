/**
 * Tell ordinary shares from the other things NSE trades in the same series.
 * Exchange-traded funds (gold, silver, index, gilt) and rights entitlements
 * are not companies and must not enter a stock-selection universe.
 */
export type SecurityKind = 'stock' | 'fund' | 'rights'

/** Names NSE prints for fund units: "NIP IND ETF GOLD BEES", "ICICIPRAMC - ICICIAUTO", "UTI GOLD ETF". */
const FUND_NAME = /ETF\b|AMC\s*-|\bMF\s*-|\bNIFTY|SENSEX|\bGILT\b|^MOST SHARES|^R\*? ?SHARES|GOLD ETS|\bIWIN\b/i
const FUND_SYMBOL = /BEES$/
const RIGHTS_SYMBOL = /-RE\d*$/

/**
 * @param name latest security name from NSE's price file
 * @param listedFunds symbols in NSE's current ETF list (eq_etfseclist.csv)
 */
export function securityKind(symbol: string, name: string | undefined, listedFunds: ReadonlySet<string>): SecurityKind {
  if (RIGHTS_SYMBOL.test(symbol)) return 'rights'
  if (listedFunds.has(symbol) || FUND_SYMBOL.test(symbol) || (name != null && FUND_NAME.test(name))) return 'fund'
  return 'stock'
}

/** eq_etfseclist.csv: Symbol,Underlying Asset,SecurityName,... */
export function parseEtfList(text: string): Set<string> {
  return new Set(text.split(/\r?\n/).slice(1).map(line => line.split(',')[0].trim()).filter(Boolean))
}
