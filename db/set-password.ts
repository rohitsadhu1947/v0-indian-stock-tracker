/**
 * Script to set password for existing user
 * Usage: npx tsx db/set-password.ts <email> <password>
 */
import postgres from 'postgres'
import bcrypt from 'bcrypt'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function setPassword(email: string, password: string) {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL not found')
  }

  const sql = postgres(databaseUrl, { max: 1 })

  try {
    // Check password requirements
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters')
    }
    if (!/[A-Z]/.test(password)) {
      throw new Error('Password must contain at least one uppercase letter')
    }
    if (!/[a-z]/.test(password)) {
      throw new Error('Password must contain at least one lowercase letter')
    }
    if (!/[0-9]/.test(password)) {
      throw new Error('Password must contain at least one number')
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10)

    // Update user
    const result = await sql`
      UPDATE users 
      SET password_hash = ${passwordHash}
      WHERE email = ${email}
      RETURNING id, email, role
    `

    if (result.length === 0) {
      console.log(`\n❌ User not found: ${email}`)
      console.log('\nAvailable users:')
      const users = await sql`SELECT id, email, role FROM users`
      console.table(users)
      return
    }

    console.log(`\n✅ Password updated for user:`)
    console.table(result)
    console.log(`\n🔐 You can now login with:`)
    console.log(`   Email: ${email}`)
    console.log(`   Password: ${password}`)
  } finally {
    await sql.end()
  }
}

const email = process.argv[2]
const password = process.argv[3]

if (!email || !password) {
  console.log('\n❌ Usage: npx tsx db/set-password.ts <email> <password>')
  console.log('\nExample: npx tsx db/set-password.ts test@example.com MyPassword123')
  process.exit(1)
}

setPassword(email, password)

