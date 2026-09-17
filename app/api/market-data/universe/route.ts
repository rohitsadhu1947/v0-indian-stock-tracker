/**
 * /api/market-data/universe — broker-agnostic alias for /api/kite/universe
 * New canonical path. The /api/kite/universe route still works for backward compatibility.
 */
export { GET } from '@/app/api/kite/universe/route'
