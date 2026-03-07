/**
 * /api/market-data/quote — broker-agnostic alias for /api/kite/quote
 * New canonical path. The /api/kite/quote route still works for backward compatibility.
 */
export { GET } from '@/app/api/kite/quote/route'
