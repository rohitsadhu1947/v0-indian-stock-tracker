-- Migration: Add Multi-User Authentication & RBAC
-- Created: 2025-11-03

-- ============================================
-- 1. UPDATE USERS TABLE
-- ============================================

-- Add new columns to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email TEXT UNIQUE NOT NULL DEFAULT 'placeholder@example.com',
  ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'viewer',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS master_kite_token TEXT,
  ADD COLUMN IF NOT EXISTS master_kite_user_id TEXT,
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);

-- Make kite_user_id nullable (was NOT NULL before)
ALTER TABLE users ALTER COLUMN kite_user_id DROP NOT NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);
CREATE INDEX IF NOT EXISTS users_status_idx ON users(status);

-- ============================================
-- 2. CREATE USER_PERMISSIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS user_permissions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Access Control
  can_view_signals BOOLEAN NOT NULL DEFAULT true,
  can_view_positions BOOLEAN NOT NULL DEFAULT false,
  can_paper_trade BOOLEAN NOT NULL DEFAULT true,
  can_view_research BOOLEAN NOT NULL DEFAULT true,
  can_run_backtests BOOLEAN NOT NULL DEFAULT false,
  can_add_custom_stocks BOOLEAN NOT NULL DEFAULT false,
  can_view_market_dashboard BOOLEAN NOT NULL DEFAULT true,
  can_manage_users BOOLEAN NOT NULL DEFAULT false,
  
  -- Visible Tabs
  visible_tabs JSONB DEFAULT '["tradenow", "research"]'::jsonb,
  
  -- Subscription
  subscription_tier TEXT NOT NULL DEFAULT 'free',
  subscription_expires_at TIMESTAMP,
  
  -- Limits
  max_paper_positions INTEGER NOT NULL DEFAULT 10,
  max_backtests_per_day INTEGER NOT NULL DEFAULT 3,
  max_custom_stocks INTEGER NOT NULL DEFAULT 5,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_permissions_user_id_idx ON user_permissions(user_id);

-- ============================================
-- 3. MIGRATE EXISTING DATA
-- ============================================

-- For existing user (if any), set them as admin
UPDATE users 
SET role = 'admin', 
    status = 'active'
WHERE id = (SELECT MIN(id) FROM users);

-- Create permissions for existing users
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
  subscription_tier
)
SELECT 
  id,
  true, -- can_view_signals
  true, -- can_view_positions
  true, -- can_paper_trade
  true, -- can_view_research
  true, -- can_run_backtests
  true, -- can_add_custom_stocks
  true, -- can_view_market_dashboard
  CASE WHEN role = 'admin' THEN true ELSE false END, -- can_manage_users
  '["tradenow", "research", "positions", "backtest", "market", "settings"]'::jsonb, -- visible_tabs
  'free' -- subscription_tier
FROM users
WHERE id NOT IN (SELECT user_id FROM user_permissions);

-- ============================================
-- 4. UPDATE METADATA
-- ============================================

-- Track migration
CREATE TABLE IF NOT EXISTS migrations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO migrations (name) VALUES ('0002_add_multi_user_auth');

-- ============================================
-- ROLLBACK SCRIPT (if needed)
-- ============================================

/*
-- To rollback this migration:

DROP TABLE IF EXISTS user_permissions CASCADE;
DROP TABLE IF EXISTS migrations CASCADE;

ALTER TABLE users 
  DROP COLUMN IF EXISTS email,
  DROP COLUMN IF EXISTS password_hash,
  DROP COLUMN IF EXISTS role,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS master_kite_token,
  DROP COLUMN IF EXISTS master_kite_user_id,
  DROP COLUMN IF EXISTS created_by;

ALTER TABLE users ALTER COLUMN kite_user_id SET NOT NULL;

DROP INDEX IF EXISTS users_email_idx;
DROP INDEX IF EXISTS users_role_idx;
DROP INDEX IF EXISTS users_status_idx;
*/

