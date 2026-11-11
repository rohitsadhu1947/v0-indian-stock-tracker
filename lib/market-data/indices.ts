/**
 * Indices kept in daily_bars, keyed by the names NSE's price file has used
 * for them over the years (NSE renamed its indices in 2013 and 2015).
 */
export const INDEX_SERIES: Array<{ barSymbol: string; names: string[] }> = [
  { barSymbol: 'IDX:NIFTY 50', names: ['Nifty 50', 'CNX Nifty', 'S&P CNX Nifty'] },
  { barSymbol: 'IDX:NIFTY NEXT 50', names: ['Nifty Next 50', 'CNX Nifty Junior'] },
  { barSymbol: 'IDX:NIFTY 200', names: ['Nifty 200', 'CNX 200'] },
  { barSymbol: 'IDX:NIFTY 500', names: ['Nifty 500', 'CNX 500', 'S&P CNX 500'] },
  { barSymbol: 'IDX:NIFTY MIDCAP 150', names: ['NIFTY MIDCAP 150'] },
  { barSymbol: 'IDX:NIFTY SMLCAP 250', names: ['NIFTY SMLCAP 250'] },
  { barSymbol: 'IDX:NIFTY500 EW', names: ['Nifty500 EW'] },
  { barSymbol: 'IDX:NIFTY500MOMENTM50', names: ['Nifty500Momentm50'] },
  { barSymbol: 'IDX:NIFTY500 LOWVOL50', names: ['Nifty500 LowVol50'] },
  { barSymbol: 'IDX:NIFTY500 VALUE 50', names: ['Nifty500 Value 50'] },
  { barSymbol: 'IDX:NIFTY500 QLTY50', names: ['Nifty500 Qlty50'] },
  { barSymbol: 'IDX:INDIA VIX', names: ['India VIX'] },
]

const BY_NAME = new Map(INDEX_SERIES.flatMap(s => s.names.map(n => [n.toLowerCase(), s.barSymbol] as const)))

/** daily_bars symbol for an index name from the price file, or null if not tracked. */
export function indexBarSymbol(name: string): string | null {
  return BY_NAME.get(name.trim().toLowerCase()) ?? null
}
