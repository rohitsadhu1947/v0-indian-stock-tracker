/**
 * Apply one SQL file from db/migrations/manual to the database in .env.local.
 *
 *   npx tsx --env-file=.env.local scripts/apply-migration.ts 0007_monthly_signals.sql
 *
 * The files are written to be safe to re-run (CREATE ... IF NOT EXISTS).
 */
import postgres from 'postgres'
import { readFileSync } from 'fs'

async function main() {
  const file = process.argv[2]
  if (!file || file.includes('/')) throw new Error('Usage: apply-migration.ts <file name in db/migrations/manual>')
  const text = readFileSync(`db/migrations/manual/${file}`, 'utf8')
  const sql = postgres(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!, { ssl: 'require', max: 1, onnotice: () => {} })
  await sql.unsafe(text)
  await sql.end()
  console.log(`Applied ${file}`)
}

main().catch(err => {
  console.error(err.message)
  process.exit(1)
})
