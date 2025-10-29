import postgres from 'postgres'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const sql = postgres(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL, {
  max: 1
})

try {
  console.log('🗑️  Dropping old cache tables...')
  await sql`DROP TABLE IF EXISTS stock_quotes CASCADE`
  await sql`DROP TABLE IF EXISTS historical_data CASCADE`
  
  console.log('✨ Creating new stock_quotes table...')
  await sql`
    CREATE TABLE stock_quotes (
      id SERIAL PRIMARY KEY,
      symbol TEXT NOT NULL,
      exchange TEXT NOT NULL,
      data JSONB NOT NULL,
      timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT stock_quotes_symbol_exchange_unique UNIQUE(symbol, exchange)
    )
  `
  await sql`CREATE INDEX stock_quotes_timestamp_idx ON stock_quotes(timestamp)`
  
  console.log('✨ Creating new historical_data table...')
  await sql`
    CREATE TABLE historical_data (
      id SERIAL PRIMARY KEY,
      symbol TEXT NOT NULL,
      interval TEXT NOT NULL,
      from_date TIMESTAMP NOT NULL,
      to_date TIMESTAMP NOT NULL,
      data JSONB NOT NULL,
      timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT historical_data_symbol_interval_unique UNIQUE(symbol, interval, from_date, to_date)
    )
  `
  await sql`CREATE INDEX historical_data_timestamp_idx ON historical_data(timestamp)`
  
  console.log('✅ Cache tables fixed successfully!')
  
} catch (error) {
  console.error('❌ Error:', error)
  process.exit(1)
} finally {
  await sql.end()
}

