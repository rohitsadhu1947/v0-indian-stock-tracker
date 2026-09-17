/**
 * /api/market-data/intraday — broker-agnostic alias for /api/kite/intraday
 * New canonical path. The /api/kite/intraday route still works for backward compatibility.
 */
export { GET } from '@/app/api/kite/intraday/route'
