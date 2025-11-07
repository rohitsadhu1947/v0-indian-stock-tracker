/**
 * Fix Kite User Script
 * Properly configure your Kite account as master admin
 * 
 * Usage: npx tsx db/fix-kite-user.ts your@email.com
 */
import postgres from 'postgres'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function fixKiteUser(newEmail: string) {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL not found')
  }

  const sql = postgres(databaseUrl, { max: 1 })

  try {
    console.log('\n╔═══════════════════════════════════════════════════════════╗')
    console.log('║   🔧 FIXING KITE USER - Master Admin Setup              ║')
    console.log('╚═══════════════════════════════════════════════════════════╝\n')

    // 1. Find Kite user (ID: 3 or by kite_user_id)
    console.log('1️⃣  Finding your Kite user...\n')
    
    let [kiteUser] = await sql`
      SELECT * FROM users WHERE id = 3
    `

    if (!kiteUser) {
      // Try to find by kite_user_id
      [kiteUser] = await sql`
        SELECT * FROM users WHERE kite_user_id IS NOT NULL LIMIT 1
      `
    }

    if (!kiteUser) {
      console.log('❌ No Kite user found! Creating new master admin...\n')
      
      // Create new master admin
      const [newUser] = await sql`
        INSERT INTO users (
          email,
          password_hash,
          kite_user_id,
          role,
          status
        ) VALUES (
          ${newEmail},
          'kite_auth_only',
          'pending',
          'admin',
          'active'
        )
        RETURNING *
      `
      
      kiteUser = newUser
      console.log('✅ Created new master admin user!\n')
    }

    console.log('Found user ID:', kiteUser.id)
    console.log('Current email:', kiteUser.email)
    console.log('Current role:', kiteUser.role)
    console.log('Current status:', kiteUser.status)

    // 2. Update user record
    console.log('\n2️⃣  Updating user record...\n')
    
    const [updatedUser] = await sql`
      UPDATE users
      SET
        email = ${newEmail},
        role = 'admin',
        status = 'active',
        password_hash = COALESCE(password_hash, 'kite_auth_only')
      WHERE id = ${kiteUser.id}
      RETURNING *
    `

    console.log('✅ User updated!')
    console.log('   Email:', updatedUser.email)
    console.log('   Role:', updatedUser.role)
    console.log('   Status:', updatedUser.status)

    // 3. Ensure permissions exist
    console.log('\n3️⃣  Setting up permissions...\n')
    
    const [existingPerms] = await sql`
      SELECT * FROM user_permissions WHERE user_id = ${kiteUser.id}
    `

    if (existingPerms) {
      // Update existing
      await sql`
        UPDATE user_permissions
        SET
          can_view_signals = true,
          can_view_positions = true,
          can_paper_trade = true,
          can_view_research = true,
          can_run_backtests = true,
          can_add_custom_stocks = true,
          can_view_market_dashboard = true,
          can_manage_users = true,
          visible_tabs = '["tradenow", "research", "positions", "backtest", "market", "settings", "admin"]'::jsonb,
          max_paper_positions = 999,
          max_backtests_per_day = 999,
          max_custom_stocks = 999
        WHERE user_id = ${kiteUser.id}
      `
      console.log('✅ Updated existing permissions to FULL ACCESS')
    } else {
      // Create new
      await sql`
        INSERT INTO user_permissions (
          user_id,
          can_view_signals,
          can_view_positions,
          can_paper_trade,
          can_view_research,
          can_run_backtests,
          can_add_custom_stocks,
          can_view_market_dashboard,
          can_manage_users,
          visible_tabs,
          max_paper_positions,
          max_backtests_per_day,
          max_custom_stocks
        ) VALUES (
          ${kiteUser.id},
          true, true, true, true, true, true, true, true,
          '["tradenow", "research", "positions", "backtest", "market", "settings", "admin"]'::jsonb,
          999, 999, 999
        )
      `
      console.log('✅ Created new permissions with FULL ACCESS')
    }

    // 4. Show final state
    console.log('\n4️⃣  Final Configuration:\n')
    
    const [finalUser] = await sql`
      SELECT 
        u.id,
        u.email,
        u.kite_user_id,
        u.role,
        u.status,
        u.master_kite_token IS NOT NULL as has_kite_token,
        up.can_manage_users,
        up.can_paper_trade,
        up.visible_tabs
      FROM users u
      LEFT JOIN user_permissions up ON u.id = up.user_id
      WHERE u.id = ${kiteUser.id}
    `

    console.table([finalUser])

    console.log('\n╔═══════════════════════════════════════════════════════════╗')
    console.log('║   ✅ KITE USER FIXED!                                    ║')
    console.log('╚═══════════════════════════════════════════════════════════╝\n')
    
    console.log('✅ User ID:', finalUser.id)
    console.log('✅ Email:', finalUser.email)
    console.log('✅ Role: admin (full access)')
    console.log('✅ Permissions: All enabled')
    console.log('✅ Visible tabs:', finalUser.visible_tabs)
    
    console.log('\n🎯 Next Steps:')
    console.log('  1. Login via Kite Connect')
    console.log('  2. Your token will be stored as master_kite_token')
    console.log('  3. All users will use YOUR token for market data')
    console.log('  4. Admin button will show for you\n')

  } finally {
    await sql.end()
  }
}

const newEmail = process.argv[2]

if (!newEmail || !newEmail.includes('@')) {
  console.log('\n❌ Usage: npx tsx db/fix-kite-user.ts your@email.com')
  console.log('\nExample: npx tsx db/fix-kite-user.ts rohit@example.com\n')
  process.exit(1)
}

fixKiteUser(newEmail)

