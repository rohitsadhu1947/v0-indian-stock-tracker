/**
 * /api/market-data/instruments — broker-agnostic alias for /api/kite/instruments
 * New canonical path. The /api/kite/instruments route still works for backward compatibility.
 */
export { GET } from '@/app/api/kite/instruments/route'
