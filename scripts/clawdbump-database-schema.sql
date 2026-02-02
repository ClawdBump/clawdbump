-- =============================================
-- ClawdBump Database Schema for Supabase
-- =============================================
-- This SQL file creates all required tables for ClawdBump app
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql
--
-- Tables:
-- 1. telegram_user_mappings - Telegram user data & wallet associations
-- 2. user_credits - User credit balances (ETH/WETH deposits)
-- 3. wallets_data - CDP Bot Smart Wallets (5 per user)
-- 4. bot_wallet_credits - WETH credits distributed to bot wallets
-- 5. bot_sessions - Active bumping sessions
-- 6. bot_logs - Activity logs for debugging
-- =============================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- 1. TELEGRAM USER MAPPINGS
-- =============================================
-- Stores Telegram user data and wallet associations
-- Used for Telegram Mini App authentication
CREATE TABLE IF NOT EXISTS telegram_user_mappings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  telegram_id TEXT NOT NULL UNIQUE,
  telegram_username TEXT,
  first_name TEXT,
  last_name TEXT,
  photo_url TEXT,
  wallet_address TEXT, -- Privy Smart Wallet address
  privy_user_id TEXT, -- Privy DID (did:privy:xxx)
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by telegram_id
CREATE INDEX IF NOT EXISTS idx_telegram_user_mappings_telegram_id 
ON telegram_user_mappings(telegram_id);

-- Index for wallet_address lookup
CREATE INDEX IF NOT EXISTS idx_telegram_user_mappings_wallet_address 
ON telegram_user_mappings(wallet_address);

-- =============================================
-- 2. USER CREDITS
-- =============================================
-- Stores user credit balances (ETH/WETH deposits to Smart Account)
-- Credits are used to fund bot wallets for bumping
CREATE TABLE IF NOT EXISTS user_credits (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_address TEXT NOT NULL UNIQUE, -- Privy Smart Wallet address (lowercase)
  balance_wei TEXT NOT NULL DEFAULT '0', -- Credit balance in wei (WETH)
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by user_address
CREATE INDEX IF NOT EXISTS idx_user_credits_user_address 
ON user_credits(user_address);

-- =============================================
-- 3. WALLETS DATA (CDP Bot Smart Wallets)
-- =============================================
-- Stores 5 bot wallets per user created via Coinbase CDP SDK V2
-- Each wallet has a Smart Account (for transactions) and Owner Account (for signing)
CREATE TABLE IF NOT EXISTS wallets_data (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_address TEXT NOT NULL, -- Main user's Smart Wallet address (from Privy)
  smart_account_address TEXT NOT NULL, -- CDP Smart Account address
  owner_address TEXT NOT NULL, -- CDP Owner/EOA address (for signing)
  network TEXT DEFAULT 'base-mainnet',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fetching user's bot wallets
CREATE INDEX IF NOT EXISTS idx_wallets_data_user_address 
ON wallets_data(user_address);

-- Unique constraint: each smart_account_address should be unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallets_data_smart_account_unique 
ON wallets_data(smart_account_address);

-- =============================================
-- 4. BOT WALLET CREDITS
-- =============================================
-- Tracks WETH credits distributed to each bot wallet
-- Only 1 row per bot_wallet_address per user (UPSERT pattern)
CREATE TABLE IF NOT EXISTS bot_wallet_credits (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_address TEXT NOT NULL, -- Main user's Smart Wallet address
  bot_wallet_address TEXT NOT NULL, -- Bot's Smart Account address
  weth_balance_wei TEXT NOT NULL DEFAULT '0', -- WETH balance in wei
  tx_hash TEXT, -- Most recent distribution transaction hash
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint: 1 row per user + bot wallet combination
  UNIQUE(user_address, bot_wallet_address)
);

-- Index for fetching bot wallet credits by user
CREATE INDEX IF NOT EXISTS idx_bot_wallet_credits_user_address 
ON bot_wallet_credits(user_address);

-- Index for fetching by bot wallet address
CREATE INDEX IF NOT EXISTS idx_bot_wallet_credits_bot_wallet 
ON bot_wallet_credits(bot_wallet_address);

-- =============================================
-- 5. BOT SESSIONS
-- =============================================
-- Tracks active bumping sessions
-- Only 1 active session per user at a time
CREATE TABLE IF NOT EXISTS bot_sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_address TEXT NOT NULL, -- Main user's Smart Wallet address
  token_address TEXT NOT NULL, -- Target token to bump
  buy_amount_per_bump_wei TEXT NOT NULL, -- Amount in wei per bump
  amount_usd TEXT, -- Amount in USD per bump (stored for reference)
  interval_seconds INTEGER DEFAULT 60, -- Interval between bumps (2-600 seconds)
  total_sessions INTEGER DEFAULT 0, -- Deprecated: runs until stopped
  current_session INTEGER DEFAULT 0, -- Deprecated: runs until stopped
  wallet_rotation_index INTEGER DEFAULT 0, -- Current bot wallet index (0-4)
  status TEXT DEFAULT 'pending', -- 'pending', 'running', 'stopped', 'completed', 'failed'
  started_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fetching active sessions by user
CREATE INDEX IF NOT EXISTS idx_bot_sessions_user_address 
ON bot_sessions(user_address);

-- Index for fetching running sessions
CREATE INDEX IF NOT EXISTS idx_bot_sessions_status 
ON bot_sessions(status);

-- Composite index for user + status queries
CREATE INDEX IF NOT EXISTS idx_bot_sessions_user_status 
ON bot_sessions(user_address, status);

-- =============================================
-- 6. BOT LOGS
-- =============================================
-- Activity logs for debugging and monitoring
CREATE TABLE IF NOT EXISTS bot_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_id UUID REFERENCES bot_sessions(id) ON DELETE CASCADE,
  user_address TEXT NOT NULL,
  bot_wallet_address TEXT,
  action TEXT NOT NULL, -- 'swap_started', 'swap_completed', 'swap_failed', etc.
  status TEXT NOT NULL, -- 'success', 'error', 'pending'
  message TEXT,
  tx_hash TEXT,
  amount_wei TEXT,
  token_address TEXT,
  error_details TEXT,
  request_id TEXT, -- For debugging 0x API requests
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fetching logs by session
CREATE INDEX IF NOT EXISTS idx_bot_logs_session_id 
ON bot_logs(session_id);

-- Index for fetching logs by user
CREATE INDEX IF NOT EXISTS idx_bot_logs_user_address 
ON bot_logs(user_address);

-- Index for recent logs (ordered by time)
CREATE INDEX IF NOT EXISTS idx_bot_logs_created_at 
ON bot_logs(created_at DESC);

-- =============================================
-- RLS POLICIES (Row Level Security)
-- =============================================
-- Enable RLS on all tables for security
-- Note: API uses service_role key which bypasses RLS
-- These policies are for direct client access if needed

-- Enable RLS
ALTER TABLE telegram_user_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_wallet_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_logs ENABLE ROW LEVEL SECURITY;

-- Service role bypass policies (for API access)
-- These allow the service_role to perform all operations

CREATE POLICY "Service role full access on telegram_user_mappings" 
ON telegram_user_mappings FOR ALL 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Service role full access on user_credits" 
ON user_credits FOR ALL 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Service role full access on wallets_data" 
ON wallets_data FOR ALL 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Service role full access on bot_wallet_credits" 
ON bot_wallet_credits FOR ALL 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Service role full access on bot_sessions" 
ON bot_sessions FOR ALL 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Service role full access on bot_logs" 
ON bot_logs FOR ALL 
USING (true) 
WITH CHECK (true);

-- =============================================
-- TRIGGERS FOR updated_at COLUMNS
-- =============================================
-- Automatically update updated_at timestamp on row changes

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
-- VERIFICATION QUERIES
-- =============================================
-- Run these queries to verify the schema was created correctly

-- Check all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'telegram_user_mappings',
  'user_credits', 
  'wallets_data',
  'bot_wallet_credits',
  'bot_sessions',
  'bot_logs'
);

-- =============================================
-- SAMPLE DATA (Optional - for testing)
-- =============================================
-- Uncomment and run these to insert test data

-- INSERT INTO user_credits (user_address, balance_wei)
-- VALUES ('0x1234567890abcdef1234567890abcdef12345678', '1000000000000000000');

-- =============================================
-- END OF SCHEMA
-- =============================================
