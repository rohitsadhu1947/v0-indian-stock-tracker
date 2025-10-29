import postgres from 'postgres'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const sql = postgres(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL, {
  max: 1
})

try {
  console.log('🔍 Checking database status...\n')
  
  // Check users
  const usersResult = await sql`SELECT id, kite_user_id, name, email, last_login FROM users ORDER BY id DESC LIMIT 5`
  console.log('👥 Users:')
  console.table(usersResult)
  
  // Check sessions
  const sessionsResult = await sql`SELECT id, user_id, expires_at FROM sessions WHERE expires_at > NOW() ORDER BY id DESC LIMIT 5`
  console.log('\n🔑 Active Sessions:')
  console.table(sessionsResult)
  
  // Check watchlists
  const watchlistResult = await sql`SELECT w.id, w.user_id, w.symbol, w.exchange, w.added_at, u.kite_user_id 
                                     FROM watchlists w 
                                     JOIN users u ON w.user_id = u.id 
                                     ORDER BY w.id DESC LIMIT 10`
  console.log('\n📊 Watchlists:')
  if (watchlistResult.length === 0) {
    console.log('  ❌ No watchlist entries found!')
  } else {
    console.table(watchlistResult)
  }
  
  // Check positions (skip for now due to column name mismatch)
  console.log('\n💼 Positions: (skipped - needs schema sync)')
  
  // Check cache stats
  const quotesCount = await sql`SELECT COUNT(*) as count FROM stock_quotes`
  const histCount = await sql`SELECT COUNT(*) as count FROM historical_data`
  console.log('\n📦 Cache Stats:')
  console.log(`  Stock Quotes: ${quotesCount[0].count}`)
  console.log(`  Historical Data: ${histCount[0].count}`)
  
  // Check recent cache activity
  const recentQuotes = await sql`SELECT symbol, exchange, timestamp FROM stock_quotes ORDER BY timestamp DESC LIMIT 5`
  console.log('\n📈 Recent Cached Quotes:')
  console.table(recentQuotes)
  
} catch (error) {
  console.error('❌ Error:', error)
  process.exit(1)
} finally {
  await sql.end()
}

