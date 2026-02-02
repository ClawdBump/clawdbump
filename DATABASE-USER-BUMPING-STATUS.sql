-- ============================================
-- FarBump - User Bumping Status Table
-- ============================================
-- Tracks active bumping sessions for background worker
-- This table is used by the bumping-worker.ts to poll active users
-- ============================================

-- Create user_bumping_status table if it doesn't exist
CREATE TABLE IF NOT EXISTS user_bumping_status (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_address TEXT NOT NULL UNIQUE,              -- Main user's Smart Wallet address
  is_active BOOLEAN NOT NULL DEFAULT false,        -- Whether user's bumping is active
  interval_seconds INTEGER NOT NULL DEFAULT 60,    -- Bump interval in seconds (2-600)
  last_bump_at TIMESTAMP WITH TIME ZONE,           -- Last bump timestamp
  token_address TEXT,                              -- Target token address for bumping
  amount_usd TEXT,                                  -- Amount per bump in USD
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add columns to existing table if they don't exist (for migration)
DO $$ 
BEGIN
  -- Add is_active column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_bumping_status' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE user_bumping_status ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT false;
  END IF;

  -- Add interval_seconds column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_bumping_status' AND column_name = 'interval_seconds'
  ) THEN
    ALTER TABLE user_bumping_status ADD COLUMN interval_seconds INTEGER NOT NULL DEFAULT 60;
  END IF;

  -- Add last_bump_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_bumping_status' AND column_name = 'last_bump_at'
  ) THEN
    ALTER TABLE user_bumping_status ADD COLUMN last_bump_at TIMESTAMP WITH TIME ZONE;
  END IF;

  -- Add token_address column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_bumping_status' AND column_name = 'token_address'
  ) THEN
    ALTER TABLE user_bumping_status ADD COLUMN token_address TEXT;
  END IF;

  -- Add amount_usd column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_bumping_status' AND column_name = 'amount_usd'
  ) THEN
    ALTER TABLE user_bumping_status ADD COLUMN amount_usd TEXT;
  END IF;
END $$;

-- Add constraint: interval_seconds must be between 2 and 600 (2 seconds to 10 minutes)
ALTER TABLE user_bumping_status
DROP CONSTRAINT IF EXISTS check_interval_seconds;

ALTER TABLE user_bumping_status
ADD CONSTRAINT check_interval_seconds 
CHECK (interval_seconds >= 2 AND interval_seconds <= 600);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_bumping_status_user_address ON user_bumping_status(user_address);
CREATE INDEX IF NOT EXISTS idx_user_bumping_status_is_active ON user_bumping_status(is_active);
CREATE INDEX IF NOT EXISTS idx_user_bumping_status_active_users 
  ON user_bumping_status(user_address, is_active) WHERE is_active = true;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_bumping_status_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_user_bumping_status_updated_at ON user_bumping_status;
CREATE TRIGGER update_user_bumping_status_updated_at
  BEFORE UPDATE ON user_bumping_status
  FOR EACH ROW
  EXECUTE FUNCTION update_user_bumping_status_updated_at();

-- RLS Policies
ALTER TABLE user_bumping_status ENABLE ROW LEVEL SECURITY;

-- Allow public read (filtering by user_address in application code)
DROP POLICY IF EXISTS "Users can view own bumping status" ON user_bumping_status;
CREATE POLICY "Users can view own bumping status"
  ON user_bumping_status
  FOR SELECT
  USING (true);

-- Comments
COMMENT ON TABLE user_bumping_status IS 'Tracks active bumping sessions for background worker. Used by bumping-worker.ts to poll active users.';
COMMENT ON COLUMN user_bumping_status.is_active IS 'Whether user''s bumping is currently active (true = running, false = stopped)';
COMMENT ON COLUMN user_bumping_status.interval_seconds IS 'Bump interval in seconds (2-600, i.e., 2 seconds to 10 minutes)';
COMMENT ON COLUMN user_bumping_status.last_bump_at IS 'Timestamp of the last successful bump execution';
COMMENT ON COLUMN user_bumping_status.token_address IS 'Target token contract address for bumping';
COMMENT ON COLUMN user_bumping_status.amount_usd IS 'Amount per bump in USD (stored as string for precision)';

-- ============================================
-- Migration Complete!
-- ============================================
-- Table created/updated: user_bumping_status
-- Columns:
--   - id: UUID (Primary Key)
--   - user_address: TEXT (Unique, Main user's Smart Wallet address)
--   - is_active: BOOLEAN (Whether bumping is active)
--   - interval_seconds: INTEGER (Bump interval, 2-600 seconds)
--   - last_bump_at: TIMESTAMP (Last bump timestamp)
--   - token_address: TEXT (Target token address)
--   - amount_usd: TEXT (Amount per bump in USD)
--   - created_at: TIMESTAMP (Creation timestamp)
--   - updated_at: TIMESTAMP (Last update timestamp)
-- ============================================

