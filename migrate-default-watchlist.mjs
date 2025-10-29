/**
 * Migration Script: Save Default Watchlist to Database
 * This saves the default stocks to the watchlist table for the authenticated user
 */

import postgres from 'postgres'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const sql = postgres(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL, {
  max: 1
})

// Default watchlist from the app
const DEFAULT_WATCHLIST = [
  'RELIANCE',
  'TCS',
  'INFY',
  'HDFCBANK',
  'ICICIBANK',
  'HINDUNILVR',
  'ITC',
  'SBIN',
  'BHARTIARTL',
  'KOTAKBANK',
  'LT',
  'AXISBANK',
  'ASIANPAINT',
  'MARUTI',
  'TITAN',
  'BAJFINANCE',
  'TATASTEEL',
  'SUNPHARMA',
  'WIPRO',
  'HCLTECH'
]

try {
  console.log('🔄 Migrating default watchlist to database...\n')
  
  // Get the user
  const users = await sql`SELECT id, kite_user_id FROM users WHERE kite_user_id = 'QUG191' LIMIT 1`
  
  if (users.length === 0) {
    console.error('❌ User not found!')
    process.exit(1)
  }
  
  const user = users[0]
  console.log(`✅ Found user: ${user.kite_user_id} (ID: ${user.id})`)
  
  // Check if watchlist already has entries
  const existing = await sql`SELECT COUNT(*) as count FROM watchlists WHERE user_id = ${user.id}`
  
  if (existing[0].count > 0) {
    console.log(`\n⚠️  User already has ${existing[0].count} watchlist entries. Skip migration? (y/n)`)
    console.log('   Run this script manually if you want to proceed.\n')
    process.exit(0)
  }
  
  // Insert all stocks
  console.log(`\n📝 Adding ${DEFAULT_WATCHLIST.length} stocks to watchlist...\n`)
  
  let successCount = 0
  let failCount = 0
  
  for (const symbol of DEFAULT_WATCHLIST) {
    try {
      await sql`
        INSERT INTO watchlists (user_id, symbol, exchange, added_at)
        VALUES (${user.id}, ${symbol}, 'NSE', NOW())
      `
      console.log(`  ✅ Added: ${symbol}`)
      successCount++
    } catch (error) {
      console.error(`  ❌ Failed: ${symbol} -`, error.message)
      failCount++
    }
  }
  
  console.log(`\n📊 Summary:`)
  console.log(`  ✅ Successfully added: ${successCount} stocks`)
  console.log(`  ❌ Failed: ${failCount} stocks`)
  
  // Verify
  const final = await sql`SELECT COUNT(*) as count FROM watchlists WHERE user_id = ${user.id}`
  console.log(`\n📈 Total watchlist entries now: ${final[0].count}`)
  
  console.log('\n✅ Migration complete! Refresh your browser to see the persisted watchlist.')
  
} catch (error) {
  console.error('\n❌ Migration failed:', error)
  process.exit(1)
} finally {
  await sql.end()
}

