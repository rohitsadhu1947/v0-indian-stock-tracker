-- Safe migration that handles existing data
-- Run this manually or via psql

BEGIN;

-- Step 1: Add new columns with defaults (so existing rows work)
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS email TEXT DEFAULT 'temp@example.com',
  ADD COLUMN IF NOT EXISTS password_hash TEXT DEFAULT 'pending_setup',
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS master_kite_token TEXT,
  ADD COLUMN IF NOT EXISTS master_kite_user_id TEXT,
  ADD COLUMN IF NOT EXISTS created_by INTEGER;

-- Step 2: Make kite_user_id nullable
ALTER TABLE users ALTER COLUMN kite_user_id DROP NOT NULL;

-- Step 3: Update existing users with proper email (use kite_user_id as base)
UPDATE users 
SET email = CONCAT(kite_user_id, '@kite.local')
WHERE email = 'temp@example.com';

-- Step 4: Now add unique constraint (data is now valid)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_unique;
ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);

-- Step 5: Create indexes
CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);
CREATE INDEX IF NOT EXISTS users_kite_user_id_idx ON users(kite_user_id);
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);
CREATE INDEX IF NOT EXISTS users_status_idx ON users(status);

-- Step 6: Create user_permissions table
CREATE TABLE IF NOT EXISTS user_permissions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  can_view_signals BOOLEAN NOT NULL DEFAULT true,
  can_view_positions BOOLEAN NOT NULL DEFAULT false,
  can_paper_trade BOOLEAN NOT NULL DEFAULT true,
  can_view_research BOOLEAN NOT NULL DEFAULT true,
  can_run_backtests BOOLEAN NOT NULL DEFAULT false,
  can_add_custom_stocks BOOLEAN NOT NULL DEFAULT false,
  can_view_market_dashboard BOOLEAN NOT NULL DEFAULT true,
  can_manage_users BOOLEAN NOT NULL DEFAULT false,
  
  visible_tabs JSONB DEFAULT '["tradenow", "research", "positions", "backtest", "market", "settings"]'::jsonb,
  
  subscription_tier TEXT NOT NULL DEFAULT 'free',
  subscription_expires_at TIMESTAMP,
  
  max_paper_positions INTEGER NOT NULL DEFAULT 10,
  max_backtests_per_day INTEGER NOT NULL DEFAULT 3,
  max_custom_stocks INTEGER NOT NULL DEFAULT 5,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_permissions_user_id_idx ON user_permissions(user_id);

-- Step 7: Create permissions for existing users (full admin access)
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
  visible_tabs
)
SELECT 
  id,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  '["tradenow", "research", "positions", "backtest", "market", "settings"]'::jsonb
FROM users
WHERE id NOT IN (SELECT user_id FROM user_permissions);

COMMIT;

-- Verify migration
SELECT 
  u.id,
  u.email,
  u.role,
  u.status,
  CASE WHEN up.id IS NOT NULL THEN 'Yes' ELSE 'No' END as has_permissions
FROM users u
LEFT JOIN user_permissions up ON u.id = up.user_id;

