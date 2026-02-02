-- =============================================
-- ClawdBump Database Migration Script
-- =============================================
-- Run this ONLY if you have existing tables and need to add missing columns
-- This script is SAFE to run multiple times (uses IF NOT EXISTS)
--
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql
-- =============================================

-- =============================================
-- 1. TELEGRAM USER MAPPINGS MIGRATIONS
-- =============================================
-- Add privy_user_id column if not exists (for Privy DID storage)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'telegram_user_mappings' AND column_name = 'privy_user_id'
  ) THEN
    ALTER TABLE telegram_user_mappings ADD COLUMN privy_user_id TEXT;
    RAISE NOTICE 'Added privy_user_id column to telegram_user_mappings';
  END IF;
END $$;

-- Add is_active column if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'telegram_user_mappings' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE telegram_user_mappings ADD COLUMN is_active BOOLEAN DEFAULT true;
    RAISE NOTICE 'Added is_active column to telegram_user_mappings';
  END IF;
END $$;

-- Add last_login_at column if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'telegram_user_mappings' AND column_name = 'last_login_at'
  ) THEN
    ALTER TABLE telegram_user_mappings ADD COLUMN last_login_at TIMESTAMPTZ DEFAULT NOW();
    RAISE NOTICE 'Added last_login_at column to telegram_user_mappings';
  END IF;
END $$;

-- Add updated_at column if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'telegram_user_mappings' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE telegram_user_mappings ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    RAISE NOTICE 'Added updated_at column to telegram_user_mappings';
  END IF;
END $$;

-- Create index on privy_user_id if not exists
CREATE INDEX IF NOT EXISTS idx_telegram_user_mappings_privy_user_id 
ON telegram_user_mappings(privy_user_id);

-- =============================================
-- 2. BOT SESSIONS MIGRATIONS
-- =============================================
-- Add amount_usd column if not exists (stores USD amount per bump)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bot_sessions' AND column_name = 'amount_usd'
  ) THEN
    ALTER TABLE bot_sessions ADD COLUMN amount_usd TEXT;
    RAISE NOTICE 'Added amount_usd column to bot_sessions';
  END IF;
END $$;

-- Add interval_seconds column if not exists (stores bump interval)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bot_sessions' AND column_name = 'interval_seconds'
  ) THEN
    ALTER TABLE bot_sessions ADD COLUMN interval_seconds INTEGER DEFAULT 60;
    RAISE NOTICE 'Added interval_seconds column to bot_sessions';
  END IF;
END $$;

-- Add updated_at column if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bot_sessions' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE bot_sessions ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    RAISE NOTICE 'Added updated_at column to bot_sessions';
  END IF;
END $$;

-- =============================================
-- 3. USER CREDITS MIGRATIONS
-- =============================================
-- Add last_updated column if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_credits' AND column_name = 'last_updated'
  ) THEN
    ALTER TABLE user_credits ADD COLUMN last_updated TIMESTAMPTZ DEFAULT NOW();
    RAISE NOTICE 'Added last_updated column to user_credits';
  END IF;
END $$;

-- =============================================
-- 4. BOT WALLET CREDITS MIGRATIONS
-- =============================================
-- Add updated_at column if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bot_wallet_credits' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE bot_wallet_credits ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    RAISE NOTICE 'Added updated_at column to bot_wallet_credits';
  END IF;
END $$;

-- =============================================
-- 5. BOT LOGS MIGRATIONS
-- =============================================
-- Add request_id column if not exists (for debugging 0x API)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bot_logs' AND column_name = 'request_id'
  ) THEN
    ALTER TABLE bot_logs ADD COLUMN request_id TEXT;
    RAISE NOTICE 'Added request_id column to bot_logs';
  END IF;
END $$;

-- =============================================
-- 6. CREATE OR REPLACE TRIGGERS
-- =============================================
-- Function to update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for telegram_user_mappings
DROP TRIGGER IF EXISTS update_telegram_user_mappings_updated_at ON telegram_user_mappings;
CREATE TRIGGER update_telegram_user_mappings_updated_at
  BEFORE UPDATE ON telegram_user_mappings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for bot_wallet_credits
DROP TRIGGER IF EXISTS update_bot_wallet_credits_updated_at ON bot_wallet_credits;
CREATE TRIGGER update_bot_wallet_credits_updated_at
  BEFORE UPDATE ON bot_wallet_credits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for bot_sessions
DROP TRIGGER IF EXISTS update_bot_sessions_updated_at ON bot_sessions;
CREATE TRIGGER update_bot_sessions_updated_at
  BEFORE UPDATE ON bot_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- 7. VERIFY MIGRATION
-- =============================================
-- This query shows all columns in each table
SELECT 
  table_name,
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name IN (
  'telegram_user_mappings',
  'user_credits',
  'wallets_data',
  'bot_wallet_credits',
  'bot_sessions',
  'bot_logs'
)
ORDER BY table_name, ordinal_position;

-- =============================================
-- MIGRATION COMPLETE
-- =============================================
-- If you see this message, migration ran successfully
SELECT 'ClawdBump database migration completed successfully!' AS status;
