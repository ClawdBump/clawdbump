-- ============================================
-- FarBump Bot System - Database Schema
-- ============================================
-- Copy and paste this entire file into Supabase SQL Editor
-- ============================================

-- 1. Create user_bot_wallets table
CREATE TABLE IF NOT EXISTS user_bot_wallets (
  id BIGSERIAL PRIMARY KEY,
  user_address TEXT NOT NULL UNIQUE, -- Smart Wallet address from Privy
  wallets_data JSONB NOT NULL, -- Encrypted private keys and Smart Wallet addresses
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_bot_wallets_user_address ON user_bot_wallets(user_address);

-- 2. Create bot_logs table for activity tracking
CREATE TABLE IF NOT EXISTS bot_logs (
  id BIGSERIAL PRIMARY KEY,
  user_address TEXT NOT NULL,
  wallet_address TEXT NOT NULL, -- Bot Smart Wallet address used
  tx_hash TEXT,
  token_address TEXT NOT NULL,
  amount_wei TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed')),
  message TEXT,
  error_details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bot_logs_user_address ON bot_logs(user_address);
CREATE INDEX IF NOT EXISTS idx_bot_logs_wallet_address ON bot_logs(wallet_address);
CREATE INDEX IF NOT EXISTS idx_bot_logs_status ON bot_logs(status);
CREATE INDEX IF NOT EXISTS idx_bot_logs_created_at ON bot_logs(created_at DESC);

-- 3. Create bot_sessions table to track active bot sessions
CREATE TABLE IF NOT EXISTS bot_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_address TEXT NOT NULL,
  token_address TEXT NOT NULL,
  buy_amount_per_bump_wei TEXT NOT NULL,
  total_sessions INTEGER NOT NULL DEFAULT 1,
  current_session INTEGER NOT NULL DEFAULT 0,
  wallet_rotation_index INTEGER NOT NULL DEFAULT 0, -- Round robin index (0-4)
  status TEXT NOT NULL CHECK (status IN ('running', 'paused', 'stopped', 'completed')) DEFAULT 'stopped',
  started_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for active sessions
CREATE INDEX IF NOT EXISTS idx_bot_sessions_user_address ON bot_sessions(user_address);
CREATE INDEX IF NOT EXISTS idx_bot_sessions_status ON bot_sessions(status);
CREATE INDEX IF NOT EXISTS idx_bot_sessions_active ON bot_sessions(user_address, status) WHERE status = 'running';

-- 4. Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for user_bot_wallets
DROP TRIGGER IF EXISTS update_user_bot_wallets_updated_at ON user_bot_wallets;
CREATE TRIGGER update_user_bot_wallets_updated_at
  BEFORE UPDATE ON user_bot_wallets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for bot_sessions
DROP TRIGGER IF EXISTS update_bot_sessions_updated_at ON bot_sessions;
CREATE TRIGGER update_bot_sessions_updated_at
  BEFORE UPDATE ON bot_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 5. RLS Policies (allow public read, server-side write)
ALTER TABLE user_bot_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_sessions ENABLE ROW LEVEL SECURITY;

-- Allow public read (filtering by user_address in application code)
DROP POLICY IF EXISTS "Users can view own bot wallets" ON user_bot_wallets;
CREATE POLICY "Users can view own bot wallets"
  ON user_bot_wallets
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can view own bot logs" ON bot_logs;
CREATE POLICY "Users can view own bot logs"
  ON bot_logs
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can view own bot sessions" ON bot_sessions;
CREATE POLICY "Users can view own bot sessions"
  ON bot_sessions
  FOR SELECT
  USING (true);

-- ============================================
-- Setup Complete!
-- ============================================
-- Tables created:
--   - user_bot_wallets: Stores encrypted private keys and Smart Wallet addresses
--   - bot_logs: Activity log for all bot transactions
--   - bot_sessions: Track active bot sessions and configuration
-- 
-- Features:
--   - Automatic updated_at timestamp updates
--   - Indexes for fast queries
--   - RLS policies for security (public read, server-side write)
-- ============================================










