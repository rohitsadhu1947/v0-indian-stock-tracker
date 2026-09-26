import { getBrokerManager, type BrokerClient } from '@/lib/broker'
import { MODES, DEFAULT_MODE, type RiskMode } from '@/lib/portfolio/config'

export function parseMode(value: string | null | undefined): RiskMode {
  return value && value in MODES ? (value as RiskMode) : DEFAULT_MODE
}

export function parseCapital(value: string | number | null | undefined): number | undefined {
  const n = Number(value)
  return Number.isFinite(n) && n >= 10000 && n <= 1e9 ? n : undefined
}

/** The user's broker client, or null when no usable (unexpired) token exists. */
export async function brokerClientFor(userId: number): Promise<BrokerClient | null> {
  try {
    const manager = await getBrokerManager(userId)
    return manager.hasConnection() ? manager.getClient() : null
  } catch {
    return null
  }
}
