/**
 * One-Time Admin Setup Script
 *
 * Sets an email and password on the existing admin account that was
 * originally created via Kite OAuth. After this, you can log in with
 * email + password on the new login page.
 *
 * Usage:
 *   npx tsx scripts/setup-admin-password.ts <email> <password>
 *
 * Example:
 *   npx tsx scripts/setup-admin-password.ts rohit@example.com MyStr0ngP@ss
 *
 * Requirements:
 *   - DATABASE_URL must be set (in .env.local or environment)
 *   - Password must be 8+ chars with uppercase + lowercase letters
 */

// Load env BEFORE any other imports (dynamic import below)
import dotenv from 'dotenv'
import { resolve } from 'path'
dotenv.config({ path: resolve(process.cwd(), '.env.local') })
dotenv.config({ path: resolve(process.cwd(), '.env') })

async function main() {
  const email = process.argv[2]
  const password = process.argv[3]

  if (!email || !password) {
    console.error('Usage: npx tsx scripts/setup-admin-password.ts <email> <password>')
    console.error('Example: npx tsx scripts/setup-admin-password.ts rohit@example.com MyStr0ngP@ss')
    process.exit(1)
  }

  // Validate password strength
  if (password.length < 8) {
    console.error('❌ Password must be at least 8 characters')
    process.exit(1)
  }
  if (!/[A-Z]/.test(password)) {
    console.error('❌ Password must contain at least one uppercase letter')
    process.exit(1)
  }
  if (!/[a-z]/.test(password)) {
    console.error('❌ Password must contain at least one lowercase letter')
    process.exit(1)
  }

  // Dynamic imports so dotenv loads first
  const bcrypt = await import('bcryptjs')
  const { db } = await import('../db')
  const { users } = await import('../db/schema')
  const { eq } = await import('drizzle-orm')

  const BCRYPT_ROUNDS = 12

  console.log('\n🔍 Looking for existing admin user...\n')

  // Find existing admin
  const allUsers = await db
    .select({
      id: users.id,
      email: users.email,
      kiteUserId: users.kiteUserId,
      role: users.role,
      status: users.status,
      name: users.name,
    })
    .from(users)
    .where(eq(users.role, 'admin'))

  if (allUsers.length === 0) {
    console.log('No admin user found. Listing all users:')
    const everyone = await db
      .select({ id: users.id, email: users.email, kiteUserId: users.kiteUserId, role: users.role })
      .from(users)
    console.table(everyone)
    console.error('\n❌ No admin user found. You may need to manually update the role in the DB.')
    process.exit(1)
  }

  const admin = allUsers[0]
  console.log('Found admin user:')
  console.log(`  ID:       ${admin.id}`)
  console.log(`  Email:    ${admin.email}`)
  console.log(`  Kite ID:  ${admin.kiteUserId || '(none)'}`)
  console.log(`  Name:     ${admin.name || '(not set)'}`)
  console.log(`  Status:   ${admin.status}`)

  // Hash the new password
  const passwordHash = await bcrypt.default.hash(password, BCRYPT_ROUNDS)

  // Update admin with new email + password
  await db
    .update(users)
    .set({
      email: email,
      passwordHash: passwordHash,
    })
    .where(eq(users.id, admin.id))

  console.log(`\n✅ Admin account updated!`)
  console.log(`   Email:    ${email}`)
  console.log(`   Password: (set successfully)`)
  console.log(`\nYou can now log in at /login with these credentials.`)
  console.log(`Then go to /admin?tab=brokers to connect your Kite account for market data.\n`)

  process.exit(0)
}

main().catch((err) => {
  console.error('❌ Error:', err)
  process.exit(1)
})
