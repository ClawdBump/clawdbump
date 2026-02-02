-- ============================================
-- FarBump - Bot Wallet Credits Tracking
-- ============================================
-- Tracks distributed credits from main wallet to bot wallets
-- This ensures credit balance calculation includes both:
-- 1. Main wallet credit (from Convert $BUMP transactions)
-- 2. Bot wallet credits (from distribute function)
-- ============================================

-- Create bot_wallet_credits table to track distributed credits
CREATE TABLE IF NOT EXISTS bot_wallet_credits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_address TEXT NOT NULL,                    -- Main user's Smart Wallet address
  bot_wallet_address TEXT NOT NULL,               -- Bot Smart Account address
  distributed_amount_wei NUMERIC(78, 0) NOT NULL, -- Amount distributed in wei
  tx_hash TEXT,                                   -- Distribution transaction hash
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bot_credits_user_address ON bot_wallet_credits(user_address);
CREATE INDEX IF NOT EXISTS idx_bot_credits_bot_wallet ON bot_wallet_credits(bot_wallet_address);
CREATE INDEX IF NOT EXISTS idx_bot_credits_user_created ON bot_wallet_credits(user_address, created_at DESC);

-- RLS Policies
ALTER TABLE bot_wallet_credits ENABLE ROW LEVEL SECURITY;

-- Allow public read (filtering by user_address in application code)
DROP POLICY IF EXISTS "Users can view own bot wallet credits" ON bot_wallet_credits;
CREATE POLICY "Users can view own bot wallet credits"
  ON bot_wallet_credits
  FOR SELECT
  USING (true);

-- Comment
COMMENT ON TABLE bot_wallet_credits IS 'Tracks ETH credits distributed from main wallet to bot wallets. Used for calculating total credit balance.';
COMMENT ON COLUMN bot_wallet_credits.distributed_amount_wei IS 'Amount of ETH distributed in wei (from distribute function)';
COMMENT ON COLUMN bot_wallet_credits.tx_hash IS 'Transaction hash of the distribution transaction';

-- ============================================
-- Function to get total bot wallet credits for a user
-- ============================================
CREATE OR REPLACE FUNCTION get_total_bot_wallet_credits(p_user_address TEXT)
RETURNS NUMERIC(78, 0)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  total_credits NUMERIC(78, 0);
BEGIN
  SELECT COALESCE(SUM(distributed_amount_wei), 0)
  INTO total_credits
  FROM bot_wallet_credits
  WHERE user_address = LOWER(p_user_address);
  
  RETURN total_credits;
END;
$$;

COMMENT ON FUNCTION get_total_bot_wallet_credits IS 'Returns total ETH credits distributed to bot wallets for a user (in wei)';

-- ============================================
-- Setup Complete!
-- ============================================
-- Table created:
--   - bot_wallet_credits: Tracks distributed credits to bot wallets
-- 
-- Function created:
--   - get_total_bot_wallet_credits: Get total bot wallet credits for a user
-- ============================================

