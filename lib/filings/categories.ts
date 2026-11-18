/** The kinds a company filing is sorted into. Kept free of server code so pages can use it. */
export type FilingCategory =
  | 'orders' | 'results' | 'deal' | 'capital' | 'rating' | 'regulatory' | 'management' | 'update' | 'routine'

export const CATEGORY_LABEL: Record<FilingCategory, string> = {
  orders: 'Order or contract',
  results: 'Results or board meeting outcome',
  deal: 'Acquisition, merger or sale',
  capital: 'Dividend, bonus, buyback or fund raising',
  rating: 'Credit rating',
  regulatory: 'Penalty, litigation or default',
  management: 'Senior resignation or auditor change',
  update: 'Press release or business update',
  routine: 'Routine',
}

/** Kinds worth a message: the ones that can change what a company is worth. */
export const MATERIAL: ReadonlySet<FilingCategory> = new Set(['orders', 'results', 'deal', 'capital', 'rating', 'regulatory', 'management'])
