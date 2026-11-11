/**
 * Read NSE's corporate-action descriptions (the PURPOSE column of the Bc
 * file). The text is free-form, abbreviated and cut at 25 characters:
 *   "FV SPLIT RS.10 TO RS.2", "BONS1:1/FV SPLT RS5TO RE1",
 *   "AGM/DIV-FIN 8.75+SPL 0.75", "RIGHTS 1:10 @PRM RS 95/-", "DEMERGER"
 *
 * This only extracts what the text states. Whether the price actually moved
 * by that ratio on the ex-date is checked in adjust.ts.
 */

export interface ParsedAction {
  /** Face value change: split when to < from, consolidation when to > from. */
  split?: { from: number; to: number }
  /** `newShares` bonus shares for every `perHeld` held. */
  bonus?: { newShares: number; perHeld: number }
  /** `newShares` rights shares for every `perHeld` held, at face value + premium. */
  rights?: { newShares: number; perHeld: number; premium: number | null }
  /** Cash dividend per share; null when the text gives no rupee amount. */
  dividend?: { amount: number | null }
  /**
   * Demerger, scheme of arrangement, capital reduction, bonus debentures, or
   * a split/bonus whose ratio was cut off ("FV SPLT FRM RS 10/- TO RS"): the
   * text gives no ratio, so any adjustment must come from the price.
   */
  restructure: boolean
}

const NUM = String.raw`(\d+(?:\.\d+)?)`
const RUPEE = String.raw`(?:RS|RE)?\.?\s*`

// Includes the typos NSE's files contain ("FV-SPTLRS10TORS2")
const SPLIT_KEYWORD = /SPL|SPT|SUB\s*-?\s*DIV|CONSOL|CNSL|\bFV/
const FACE_VALUE_CHANGE = new RegExp(`${RUPEE}${NUM}\\s*(?:/-?)?\\s*TO\\s*${RUPEE}${NUM}(?:/-?)?`)
const BONUS = /BON[A-Z]*[\s@:-]*(?:ISSUE)?[\s@:-]*(\d+)\s*:\s*(\d+)/
const RIGHTS = /RIGHTS?[\s-]*(?:EQ)?\s*(\d+)\s*:\s*(\d+)/
const PREMIUM = new RegExp(`@\\s*PR[A-Z]*\\.?\\s*${RUPEE}${NUM}(?:/-?)?`)
const RESTRUCTURE = /DEMERG|ARRANG|AGMT|\bSCH|REDUCTION|AMALG|\bDVR\b|\bDEB|WRNT|WARRANT|\bNCD/
const RATIO_ACTION = /SPLIT|SPLT|SUB\s*-?\s*DIV|CONSOL|CNSL|\bBON(?:US)?\b/
const DIVIDEND = /DIV/
const ORDINAL = /\b\d+\s*(?:ST|ND|RD|TH)\b/g

export function parseCorporateAction(purpose: string): ParsedAction {
  let text = purpose.toUpperCase().replace(ORDINAL, ' ')
  const out: ParsedAction = { restructure: RESTRUCTURE.test(text) }

  if (SPLIT_KEYWORD.test(text)) {
    const m = text.match(FACE_VALUE_CHANGE)
    if (m) {
      const from = Number(m[1]), to = Number(m[2])
      if (from > 0 && to > 0 && from !== to) out.split = { from, to }
      text = text.replace(m[0], ' ')
    }
  }

  const bonus = text.match(BONUS)
  if (bonus) {
    const newShares = Number(bonus[1]), perHeld = Number(bonus[2])
    if (newShares > 0 && perHeld > 0) out.bonus = { newShares, perHeld }
    text = text.replace(bonus[0], ' ')
  }

  const rights = text.match(RIGHTS)
  if (rights) {
    const premium = text.match(PREMIUM)
    const newShares = Number(rights[1]), perHeld = Number(rights[2])
    if (newShares > 0 && perHeld > 0) {
      out.rights = { newShares, perHeld, premium: premium ? Number(premium[1]) : null }
    }
    text = text.replace(rights[0], ' ')
    if (premium) text = text.replace(premium[0], ' ')
  }

  // Names a split, consolidation or bonus but the ratio is missing or cut off
  if (!out.split && !out.bonus && RATIO_ACTION.test(purpose.toUpperCase())) out.restructure = true

  if (DIVIDEND.test(text)) {
    // "DIV-FIN RS.3.50+SPL RS.2" pays 5.50 in total. A percentage needs the
    // face value, which the text does not give, so the amount stays unknown.
    const amounts = text.includes('%') ? [] : [...text.matchAll(new RegExp(NUM, 'g'))].map(m => Number(m[1]))
    const total = amounts.reduce((a, b) => a + b, 0)
    out.dividend = { amount: total > 0 ? Math.round(total * 10000) / 10000 : null }
  }

  return out
}

/**
 * Price multiplier for bars BEFORE the ex-date implied by splits and bonuses
 * (1 share at Rs 10 face value split to Rs 2 gives 0.2). Null when the text
 * states neither.
 */
export function statedPriceFactor(a: ParsedAction): number | null {
  if (!a.split && !a.bonus) return null
  let f = 1
  if (a.split) f *= a.split.to / a.split.from
  if (a.bonus) f *= a.bonus.perHeld / (a.bonus.newShares + a.bonus.perHeld)
  return f
}

/**
 * Rights issues: the theoretical ex-rights price over the last cum-rights
 * close. Only meaningful when the issue price is below the market price.
 * The issue price is taken as the premium; face value is not in the text,
 * which understates the issue price slightly.
 */
export function rightsPriceFactor(a: ParsedAction, cumRightsClose: number): number | null {
  const r = a.rights
  if (!r || r.premium == null || !(cumRightsClose > 0) || r.premium >= cumRightsClose) return null
  return (r.perHeld * cumRightsClose + r.newShares * r.premium) / ((r.perHeld + r.newShares) * cumRightsClose)
}
