/** Date helpers for the research harness. Dates are integers, YYYYMMDD. */

export const isoDate = (d: number): string => {
  const s = String(d)
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

export const intDate = (iso: string): number => Number(iso.replaceAll('-', ''))

const epochDay = (d: number): number =>
  Date.UTC(Math.floor(d / 10000), Math.floor(d / 100) % 100 - 1, d % 100) / 86400000

export const daysBetween = (from: number, to: number): number => epochDay(to) - epochDay(from)

export const yearsBetween = (from: number, to: number): number => daysBetween(from, to) / 365.25

/** Indian financial year a date falls in, named by its starting year (1 Apr 2024 to 31 Mar 2025 is 2024). */
export const financialYear = (d: number): number => {
  const year = Math.floor(d / 10000)
  return Math.floor(d / 100) % 100 >= 4 ? year : year - 1
}

/** Index of the last element <= target in an ascending array, or -1. */
export function lastAtOrBefore(sorted: ArrayLike<number>, target: number): number {
  let lo = 0, hi = sorted.length - 1, ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid] <= target) { ans = mid; lo = mid + 1 } else hi = mid - 1
  }
  return ans
}
