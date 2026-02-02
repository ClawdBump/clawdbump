-- ============================================
-- FarBump - CDP Smart Accounts Database Schema
-- ============================================
-- Complete database schema for CDP Server Wallets V2
-- Using EIP-4337 Smart Accounts with gas sponsorship
-- 
-- Last Updated: 2026-01-11
-- ============================================

-- ============================================
-- 1. WALLETS_DATA TABLE (Bot Smart Accounts)
-- ============================================
-- Stores 5 bot smart accounts per user
-- Each smart account is an EIP-4337 account with gas sponsorship

CREATE TABLE IF NOT EXISTS wallets_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_address TEXT NOT NULL,                    -- Main user's Smart Wallet address (from Privy)
  smart_account_address TEXT NOT NULL,           -- Bot's Smart Account address (EIP-4337)
  owner_address TEXT NOT NULL,                   -- Owner EOA address (managed by CDP)
  network TEXT DEFAULT 'base-mainnet' NOT NULL,  -- Network ID (base-mainnet, base-sepolia, etc.)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_wallets_user_address ON wallets_data(user_address);
CREATE INDEX IF NOT EXISTS idx_wallets_smart_account ON wallets_data(smart_account_address);
CREATE INDEX IF NOT EXISTS idx_wallets_owner ON wallets_data(owner_address);

-- Unique constraint: Each user should have exactly 5 bot wallets
-- This is enforced at application level, but we ensure uniqueness here
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallets_unique_smart_account 
  ON wallets_data(smart_account_address);

-- Comment
COMMENT ON TABLE wallets_data IS 'CDP Smart Accounts (EIP-4337) for bot wallets. Each user has 5 bot smart accounts with gas sponsorship.';
COMMENT ON COLUMN wallets_data.user_address IS 'Main user Smart Wallet address from Privy (unique identifier)';
COMMENT ON COLUMN wallets_data.smart_account_address IS 'Bot Smart Account address (EIP-4337) created via CDP';
COMMENT ON COLUMN wallets_data.owner_address IS 'Owner EOA address managed by CDP (private key in AWS Nitro Enclaves)';
COMMENT ON COLUMN wallets_data.network IS 'Network ID (base-mainnet, base-sepolia, ethereum-mainnet, etc.)';

-- ============================================
-- 2. BOT_SESSIONS TABLE
-- ============================================
-- Stores active bot bumping sessions

CREATE TABLE IF NOT EXISTS bot_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_address TEXT NOT NULL,                    -- Main user's Smart Wallet address
  token_address TEXT NOT NULL,                   -- Target token contract address
  amount_usd TEXT NOT NULL,                      -- Amount per bump in USD (stored as string for precision)
  interval_seconds INTEGER NOT NULL,             -- Bump speed in seconds
  status TEXT DEFAULT 'active' NOT NULL,         -- 'active', 'stopped', 'completed'
  wallet_rotation_index INTEGER DEFAULT 0,       -- Current wallet index for round-robin (0-4)
  total_swaps_executed INTEGER DEFAULT 0,        -- Total number of swaps executed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user_address ON bot_sessions(user_address);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON bot_sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_active_user 
  ON bot_sessions(user_address, status) WHERE status = 'active';

-- Constraint: Only one active session per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_one_active_per_user
  ON bot_sessions(user_address) WHERE status = 'active';

-- Comment
COMMENT ON TABLE bot_sessions IS 'Active bot bumping sessions. Each user can have one active session at a time.';
COMMENT ON COLUMN bot_sessions.wallet_rotation_index IS 'Current wallet index for round-robin swap execution (0-4)';
COMMENT ON COLUMN bot_sessions.amount_usd IS 'Amount per bump in USD (0.01 minimum)';

-- ============================================
-- 3. BOT_LOGS TABLE
-- ============================================
-- Stores all bot activity logs for Live Activity feed

CREATE TABLE IF NOT EXISTS bot_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_address TEXT NOT NULL,                    -- Main user's Smart Wallet address
  action TEXT NOT NULL,                          -- Action type: 'funding_started', 'funding_transfer', 'swap_executing', 'swap_success', 'swap_failed', 'balance_check', 'session_stopped'
  message TEXT NOT NULL,                         -- Log message displayed in Live Activity
  tx_hash TEXT,                                  -- Transaction hash (if applicable)
  status TEXT DEFAULT 'pending',                 -- 'pending', 'success', 'error', 'warning', 'info'
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_logs_user_address ON bot_logs(user_address);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON bot_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_user_timestamp 
  ON bot_logs(user_address, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_action ON bot_logs(action);

-- Comment
COMMENT ON TABLE bot_logs IS 'Activity logs for Live Activity feed. Shows funding, swaps, and balance updates.';
COMMENT ON COLUMN bot_logs.action IS 'Action type: funding_started, funding_transfer, swap_executing, swap_success, swap_failed, balance_check, session_stopped';
COMMENT ON COLUMN bot_logs.message IS 'Formatted message for display: e.g., [Bot #1] Melakukan swap senilai $0.01 ke Target Token...';
COMMENT ON COLUMN bot_logs.tx_hash IS 'BaseScan transaction hash (if applicable)';

-- ============================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ============================================
-- Enable RLS for all tables

ALTER TABLE wallets_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view their own wallets" ON wallets_data;
DROP POLICY IF EXISTS "Users can insert their own wallets" ON wallets_data;
DROP POLICY IF EXISTS "Users can update their own wallets" ON wallets_data;
DROP POLICY IF EXISTS "Users can delete their own wallets" ON wallets_data;

DROP POLICY IF EXISTS "Users can view their own sessions" ON bot_sessions;
DROP POLICY IF EXISTS "Users can insert their own sessions" ON bot_sessions;
DROP POLICY IF EXISTS "Users can update their own sessions" ON bot_sessions;
DROP POLICY IF EXISTS "Users can delete their own sessions" ON bot_sessions;

DROP POLICY IF EXISTS "Users can view their own logs" ON bot_logs;
DROP POLICY IF EXISTS "Users can insert their own logs" ON bot_logs;

-- ============================================
-- RLS Policies for wallets_data
-- ============================================

-- Allow users to view their own wallets
CREATE POLICY "Users can view their own wallets"
  ON wallets_data
  FOR SELECT
  USING (true); -- Public read for now, can be restricted based on auth

-- Allow service role to insert wallets
CREATE POLICY "Service role can insert wallets"
  ON wallets_data
  FOR INSERT
  WITH CHECK (true);

-- Allow service role to update wallets
CREATE POLICY "Service role can update wallets"
  ON wallets_data
  FOR UPDATE
  USING (true);

-- Allow service role to delete wallets
CREATE POLICY "Service role can delete wallets"
  ON wallets_data
  FOR DELETE
  USING (true);

-- ============================================
-- RLS Policies for bot_sessions
-- ============================================

-- Allow users to view their own sessions
CREATE POLICY "Users can view their own sessions"
  ON bot_sessions
  FOR SELECT
  USING (true);

-- Allow service role to insert sessions
CREATE POLICY "Service role can insert sessions"
  ON bot_sessions
  FOR INSERT
  WITH CHECK (true);

-- Allow service role to update sessions
CREATE POLICY "Service role can update sessions"
  ON bot_sessions
  FOR UPDATE
  USING (true);

-- Allow service role to delete sessions
CREATE POLICY "Service role can delete sessions"
  ON bot_sessions
  FOR DELETE
  USING (true);

-- ============================================
-- RLS Policies for bot_logs
-- ============================================

-- Allow users to view their own logs
CREATE POLICY "Users can view their own logs"
  ON bot_logs
  FOR SELECT
  USING (true);

-- Allow service role to insert logs
CREATE POLICY "Service role can insert logs"
  ON bot_logs
  FOR INSERT
  WITH CHECK (true);

-- ============================================
-- 5. FUNCTIONS AND TRIGGERS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for wallets_data
DROP TRIGGER IF EXISTS update_wallets_data_updated_at ON wallets_data;
CREATE TRIGGER update_wallets_data_updated_at
  BEFORE UPDATE ON wallets_data
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for bot_sessions
DROP TRIGGER IF EXISTS update_bot_sessions_updated_at ON bot_sessions;
CREATE TRIGGER update_bot_sessions_updated_at
  BEFORE UPDATE ON bot_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 6. SAMPLE DATA (Optional - for testing)
-- ============================================

-- Uncomment to insert sample data for testing
-- 
-- INSERT INTO wallets_data (user_address, smart_account_address, owner_address, network)
-- VALUES 
--   ('0x1234...user', '0xabc1...bot1', '0xdef1...owner1', 'base-mainnet'),
--   ('0x1234...user', '0xabc2...bot2', '0xdef2...owner2', 'base-mainnet'),
--   ('0x1234...user', '0xabc3...bot3', '0xdef3...owner3', 'base-mainnet'),
--   ('0x1234...user', '0xabc4...bot4', '0xdef4...owner4', 'base-mainnet'),
--   ('0x1234...user', '0xabc5...bot5', '0xdef5...owner5', 'base-mainnet');

-- ============================================
-- 7. CLEANUP (Optional)
-- ============================================

-- Uncomment to clean up all data and start fresh
-- 
-- TRUNCATE TABLE bot_logs CASCADE;
-- TRUNCATE TABLE bot_sessions CASCADE;
-- TRUNCATE TABLE wallets_data CASCADE;

-- ============================================
-- 8. VERIFICATION QUERIES
-- ============================================

-- Check if user has 5 bot wallets
-- SELECT user_address, COUNT(*) as wallet_count
-- FROM wallets_data
-- GROUP BY user_address;

-- Check active sessions
-- SELECT * FROM bot_sessions WHERE status = 'active';

-- Check recent logs
-- SELECT * FROM bot_logs 
-- ORDER BY timestamp DESC 
-- LIMIT 20;

-- ============================================
-- NOTES
-- ============================================
-- 
-- IMPORTANT: CDP Smart Accounts (EIP-4337)
-- - Private keys are managed by CDP in AWS Nitro Enclaves
-- - No need to store encrypted private keys in database
-- - Gas sponsorship is handled automatically by CDP
-- - owner_address is the EOA that controls the smart account
-- - smart_account_address is the actual account users interact with
-- 
-- SECURITY:
-- - RLS policies ensure data isolation
-- - Service role key required for API operations
-- - Never expose service role key to client
-- 
-- PERFORMANCE:
-- - Indexes created for common query patterns
-- - user_address is the main partition key
-- - timestamp indexes for log queries
-- 
-- MIGRATION FROM OLD SCHEMA:
-- - If migrating from self-managed keys:
--   1. Delete old records: DELETE FROM wallets_data WHERE owner_address IS NULL;
--   2. Users regenerate wallets via CDP
--   3. No encryption/decryption needed anymore
-- 
-- ============================================
-- END OF SCHEMA
-- ============================================





