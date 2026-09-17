/**
 * /api/market-data/historical — broker-agnostic alias for /api/kite/historical
 * New canonical path. The /api/kite/historical route still works for backward compatibility.
 */
export { GET } from '@/app/api/kite/historical/route'
