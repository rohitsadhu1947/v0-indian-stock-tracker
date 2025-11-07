/**
 * Database Audit Script
 * Check and fix your Kite user data
 */
import postgres from 'postgres'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function auditDatabase() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL not found')
  }

  const sql = postgres(databaseUrl, { max: 1 })

  try {
    console.log('\n╔═══════════════════════════════════════════════════════════╗')
    console.log('║   📊 DATABASE AUDIT - Checking Your Kite User           ║')
    console.log('╚═══════════════════════════════════════════════════════════╝\n')

    // 1. Check your Kite user
    console.log('1️⃣  Checking Kite user (ID: 3)...\n')
    const [kiteUser] = await sql`
      SELECT 
        id,
        email,
        kite_user_id,
        role,
        status,
        master_kite_token,
        master_kite_user_id,
        created_at,
        last_login
      FROM users
      WHERE id = 3
    `

    if (!kiteUser) {
      console.log('❌ Kite user not found! Looking for any Kite users...\n')
      const allUsers = await sql`
        SELECT id, email, kite_user_id, role, status
        FROM users
        ORDER BY id
      `
      console.table(allUsers)
      return
    }

    console.log('✅ Found your Kite user:\n')
    console.table([kiteUser])

    // 2. Check permissions
    console.log('\n2️⃣  Checking permissions...\n')
    const [perms] = await sql`
      SELECT *
      FROM user_permissions
      WHERE user_id = 3
    `

    if (!perms) {
      console.log('❌ No permissions found! Will create them.\n')
    } else {
      console.log('✅ Permissions exist:\n')
      console.log('   can_manage_users:', perms.can_manage_users)
      console.log('   can_view_signals:', perms.can_view_signals)
      console.log('   can_paper_trade:', perms.can_paper_trade)
      console.log('   visible_tabs:', perms.visible_tabs)
    }

    // 3. Issues to fix
    console.log('\n3️⃣  Issues Found:\n')
    const issues = []

    if (kiteUser.email.includes('@kite.trade') || kiteUser.email.includes('kite.trade')) {
      issues.push('❌ Email is in weird format: ' + kiteUser.email)
    }

    if (kiteUser.role !== 'admin') {
      issues.push('❌ Role is not admin: ' + kiteUser.role)
    }

    if (kiteUser.status !== 'active') {
      issues.push('❌ Status is not active: ' + kiteUser.status)
    }

    if (!perms) {
      issues.push('❌ No permissions record')
    }

    if (issues.length === 0) {
      console.log('✅ No issues found! User is properly configured.\n')
    } else {
      console.log('Found ' + issues.length + ' issue(s):\n')
      issues.forEach(issue => console.log('  ' + issue))
    }

    // 4. Recommend fixes
    console.log('\n4️⃣  Recommended Fixes:\n')
    
    if (issues.length > 0) {
      console.log('Run the fix script with your desired email:')
      console.log('  npx tsx db/fix-kite-user.ts your@email.com\n')
    } else {
      console.log('✅ No fixes needed! User is ready.\n')
    }

    // 5. Show all users
    console.log('5️⃣  All users in database:\n')
    const allUsers = await sql`
      SELECT 
        u.id,
        u.email,
        u.kite_user_id,
        u.role,
        u.status,
        CASE WHEN up.id IS NOT NULL THEN 'Yes' ELSE 'No' END as has_permissions
      FROM users u
      LEFT JOIN user_permissions up ON u.id = up.user_id
      ORDER BY u.id
    `
    console.table(allUsers)

  } finally {
    await sql.end()
  }
}

auditDatabase()

