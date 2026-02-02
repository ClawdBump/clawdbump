-- ============================================
-- FarBump - Bot Wallet Credits Optimization (FIXED)
-- ============================================
-- Optimize bot_wallet_credits table to have only 1 row per bot_wallet_address
-- Remove distributed_amount_wei column (not effective)
-- Use only weth_balance_wei for credit tracking
-- ============================================

-- Step 0: Remove NOT NULL constraint from distributed_amount_wei (if exists)
-- This is needed before we can safely drop the column
ALTER TABLE bot_wallet_credits
ALTER COLUMN distributed_amount_wei DROP NOT NULL;

-- Step 1: Update NULL values to 0 for safe migration
UPDATE bot_wallet_credits
SET distributed_amount_wei = 0
WHERE distributed_amount_wei IS NULL;

UPDATE bot_wallet_credits
SET weth_balance_wei = 0
WHERE weth_balance_wei IS NULL;

-- Step 2: Merge duplicate records (sum weth_balance_wei for each bot_wallet_address)
-- Create temporary table with aggregated data
CREATE TEMP TABLE bot_wallet_credits_temp AS
SELECT 
  user_address,
  bot_wallet_address,
  SUM(COALESCE(weth_balance_wei, distributed_amount_wei, 0))::NUMERIC(78, 0) AS weth_balance_wei,
  MAX(tx_hash) AS tx_hash, -- Keep most recent tx_hash
  MIN(created_at) AS created_at -- Keep earliest created_at
FROM bot_wallet_credits
GROUP BY user_address, bot_wallet_address;

-- Step 3: Delete all existing records
DELETE FROM bot_wallet_credits;

-- Step 4: Insert merged records back
INSERT INTO bot_wallet_credits (user_address, bot_wallet_address, weth_balance_wei, tx_hash, created_at)
SELECT 
  user_address,
  bot_wallet_address,
  weth_balance_wei,
  tx_hash,
  created_at
FROM bot_wallet_credits_temp;

-- Step 5: Drop temporary table
DROP TABLE bot_wallet_credits_temp;

-- Step 6: Drop column distributed_amount_wei (if exists)
ALTER TABLE bot_wallet_credits
DROP COLUMN IF EXISTS distributed_amount_wei;

-- Step 7: Add unique constraint on (user_address, bot_wallet_address)
-- This ensures only 1 row per bot wallet
ALTER TABLE bot_wallet_credits
DROP CONSTRAINT IF EXISTS bot_wallet_credits_unique_user_bot;

ALTER TABLE bot_wallet_credits
ADD CONSTRAINT bot_wallet_credits_unique_user_bot 
UNIQUE (user_address, bot_wallet_address);

-- Step 8: Update indexes for better performance
DROP INDEX IF EXISTS idx_bot_credits_user_address;
DROP INDEX IF EXISTS idx_bot_credits_bot_wallet;
DROP INDEX IF EXISTS idx_bot_credits_user_created;

CREATE INDEX IF NOT EXISTS idx_bot_credits_user_address 
  ON bot_wallet_credits(user_address);

CREATE INDEX IF NOT EXISTS idx_bot_credits_bot_wallet 
  ON bot_wallet_credits(bot_wallet_address);

CREATE INDEX IF NOT EXISTS idx_bot_credits_user_bot 
  ON bot_wallet_credits(user_address, bot_wallet_address);

-- Step 9: Update function to use weth_balance_wei only
CREATE OR REPLACE FUNCTION get_total_bot_wallet_credits(p_user_address TEXT)
RETURNS NUMERIC(78, 0)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  total_credits NUMERIC(78, 0);
BEGIN
  SELECT COALESCE(SUM(weth_balance_wei), 0)
  INTO total_credits
  FROM bot_wallet_credits
  WHERE user_address = LOWER(p_user_address);
  
  RETURN total_credits;
END;
$$;

-- Step 10: Update comments
COMMENT ON TABLE bot_wallet_credits IS 'Tracks WETH credits distributed to bot wallets. Only 1 row per bot_wallet_address. Uses weth_balance_wei as the single source of truth for credit balance.';
COMMENT ON COLUMN bot_wallet_credits.weth_balance_wei IS 'WETH balance in wei (1:1 with ETH). This is the only column used for credit tracking.';
COMMENT ON COLUMN bot_wallet_credits.user_address IS 'Main user Smart Wallet address';
COMMENT ON COLUMN bot_wallet_credits.bot_wallet_address IS 'Bot Smart Account address (unique per user_address)';
COMMENT ON CONSTRAINT bot_wallet_credits_unique_user_bot ON bot_wallet_credits IS 'Ensures only 1 row per (user_address, bot_wallet_address) combination';

-- ============================================
-- Migration Complete!
-- ============================================
-- Changes:
--   1. Removed NOT NULL constraint from distributed_amount_wei
--   2. Updated NULL values to 0 for safe migration
--   3. Merged duplicate records (summed weth_balance_wei)
--   4. Removed distributed_amount_wei column
--   5. Added unique constraint on (user_address, bot_wallet_address)
--   6. Updated indexes for better performance
--   7. Updated get_total_bot_wallet_credits function to use weth_balance_wei only
-- 
-- Result:
--   - Only 1 row per bot_wallet_address
--   - Only weth_balance_wei column for credit tracking
--   - Simpler queries (no grouping needed)
--   - Better performance
-- ============================================

