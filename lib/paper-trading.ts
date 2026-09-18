/**
 * Paper trading arithmetic — one source of truth for P&L and exit checks.
 *
 * Positions are stored with positionType 'BUY'/'LONG' or 'SELL'/'SHORT'.
 * Previously every route assumed long: P&L was current - entry and the stop
 * triggered on current <= stop, so every short was recorded backwards.
 */

export type PositionSide = 'LONG' | 'SHORT'

export type ExitReason = 'STOP_LOSS' | 'TARGET_1' | 'TARGET_2'

export interface ExitCheckInput {
  positionType: string
  entryPrice: number
  stopLoss?: number | null
  target1?: number | null
  target2?: number | null
}

/** Normalise the stored positionType to a side. Unknown values are treated as long. */
export function sideOf(positionType: string | null | undefined): PositionSide {
  const t = (positionType || '').trim().toUpperCase()
  return t === 'SHORT' || t === 'SELL' ? 'SHORT' : 'LONG'
}

/**
 * Realised/unrealised P&L for a position.
 * Long profits when price rises, short profits when price falls.
 */
export function calculatePnl(params: {
  positionType: string
  entryPrice: number
  currentPrice: number
  quantity: number
}): { pnl: number; pnlPercent: number } {
  const { entryPrice, currentPrice, quantity } = params
  if (!entryPrice || !isFinite(entryPrice)) return { pnl: 0, pnlPercent: 0 }

  const direction = sideOf(params.positionType) === 'SHORT' ? -1 : 1
  const priceChange = (currentPrice - entryPrice) * direction

  return {
    pnl: priceChange * quantity,
    pnlPercent: (priceChange / entryPrice) * 100,
  }
}

/**
 * Whether a position should be closed at `currentPrice`.
 *
 * Long:  stop below entry, targets above. Short: the mirror image.
 * Stop-loss is checked first so a bar that touches both is recorded as a loss
 * (conservative — we cannot see intrabar order from a single quote).
 */
export function checkExit(position: ExitCheckInput, currentPrice: number): ExitReason | null {
  const side = sideOf(position.positionType)
  const { stopLoss, target1, target2 } = position

  const hit = (level: number | null | undefined, kind: 'stop' | 'target'): boolean => {
    if (level == null || !isFinite(level)) return false
    // Long: stop is hit falling, target rising. Short: reversed.
    const triggersBelow = side === 'LONG' ? kind === 'stop' : kind === 'target'
    return triggersBelow ? currentPrice <= level : currentPrice >= level
  }

  if (hit(stopLoss, 'stop')) return 'STOP_LOSS'
  if (hit(target2, 'target')) return 'TARGET_2'
  if (hit(target1, 'target')) return 'TARGET_1'
  return null
}

/**
 * Sanity check on a signal before it becomes a position: levels must sit on the
 * correct side of entry, otherwise the position exits immediately on the next tick.
 */
export function validateLevels(position: ExitCheckInput): { valid: boolean; error?: string } {
  const side = sideOf(position.positionType)
  const { entryPrice, stopLoss, target1, target2 } = position

  if (!entryPrice || entryPrice <= 0) return { valid: false, error: 'Entry price must be positive' }

  const wrong = (level: number | null | undefined, mustBeBelow: boolean, name: string) => {
    if (level == null) return null
    if (level <= 0) return `${name} must be positive`
    if (mustBeBelow && level >= entryPrice) return `${name} (${level}) must be below entry (${entryPrice}) for a ${side} position`
    if (!mustBeBelow && level <= entryPrice) return `${name} (${level}) must be above entry (${entryPrice}) for a ${side} position`
    return null
  }

  const isLong = side === 'LONG'
  const error =
    wrong(stopLoss, isLong, 'Stop loss') ||
    wrong(target1, !isLong, 'Target 1') ||
    wrong(target2, !isLong, 'Target 2')

  return error ? { valid: false, error } : { valid: true }
}
