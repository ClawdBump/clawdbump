-- ============================================
-- FarBump Credit System - Database Schema
-- ============================================
-- Copy and paste this entire file into Supabase SQL Editor
-- ============================================

-- 1. Create user_credits table
CREATE TABLE IF NOT EXISTS user_credits (
  user_address TEXT PRIMARY KEY,
  balance_wei NUMERIC(78, 0) NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index untuk performa query
CREATE INDEX IF NOT EXISTS idx_user_credits_last_updated ON user_credits(last_updated);

-- RLS Policy (Row Level Security)
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public read access (wallet address-based, not auth.uid())
-- Since we use wallet addresses instead of Supabase Auth, we allow public SELECT
-- Users can only query their own address via .eq() filter in application code
DROP POLICY IF EXISTS "Users can view own credits" ON user_credits;
CREATE POLICY "Users can view own credits"
  ON user_credits
  FOR SELECT
  USING (true); -- Allow public read - filtering by user_address is done in application code

-- 2. Create conversion_logs table
CREATE TABLE IF NOT EXISTS conversion_logs (
  id BIGSERIAL PRIMARY KEY,
  user_address TEXT NOT NULL,
  tx_hash TEXT NOT NULL UNIQUE,
  amount_bump TEXT NOT NULL,
  amount_bump_wei TEXT NOT NULL,
  eth_credit_wei TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index untuk performa query
CREATE INDEX IF NOT EXISTS idx_conversion_logs_user_address ON conversion_logs(user_address);
CREATE INDEX IF NOT EXISTS idx_conversion_logs_tx_hash ON conversion_logs(tx_hash);
CREATE INDEX IF NOT EXISTS idx_conversion_logs_created_at ON conversion_logs(created_at DESC);

-- RLS Policy
ALTER TABLE conversion_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public read access (wallet address-based, not auth.uid())
-- Since we use wallet addresses instead of Supabase Auth, we allow public SELECT
-- Users can only query their own address via .eq() filter in application code
DROP POLICY IF EXISTS "Users can view own conversion logs" ON conversion_logs;
CREATE POLICY "Users can view own conversion logs"
  ON conversion_logs
  FOR SELECT
  USING (true); -- Allow public read - filtering by user_address is done in application code

-- 3. Create function untuk Atomic Increment
CREATE OR REPLACE FUNCTION increment_user_credit(
  p_user_address TEXT,
  p_amount_wei TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO user_credits (user_address, balance_wei, last_updated)
  VALUES (LOWER(p_user_address), p_amount_wei::NUMERIC, NOW())
  ON CONFLICT (user_address)
  DO UPDATE SET
    balance_wei = user_credits.balance_wei + p_amount_wei::NUMERIC,
    last_updated = NOW();
END;
$$;

-- ============================================
-- Setup Complete!
-- ============================================
-- Tables created:
--   - user_credits: Stores user credit balances
--   - conversion_logs: Audit log for conversions
-- 
-- Function created:
--   - increment_user_credit: Atomic increment function
-- ============================================
