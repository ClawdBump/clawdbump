-- ============================================
-- FarBump - WETH Migration for Credit Distribution
-- ============================================
-- Adds WETH balance tracking to bot_wallet_credits table
-- This migration enables the system to track WETH distributions
-- while maintaining backward compatibility with existing ETH-based records
-- ============================================

-- Add weth_balance_wei column to bot_wallet_credits table
-- This column stores WETH balance (1:1 with ETH, but explicitly tracked as WETH)
-- For existing records, this will be NULL initially
ALTER TABLE bot_wallet_credits 
ADD COLUMN IF NOT EXISTS weth_balance_wei NUMERIC(78, 0);

-- For existing records, set weth_balance_wei = distributed_amount_wei
-- This ensures backward compatibility (existing ETH credits are treated as WETH)
UPDATE bot_wallet_credits 
SET weth_balance_wei = distributed_amount_wei 
WHERE weth_balance_wei IS NULL;

-- Add comment to explain the column
COMMENT ON COLUMN bot_wallet_credits.weth_balance_wei IS 'WETH balance in wei (1:1 with ETH). Bot wallets now hold WETH instead of Native ETH for gasless transactions.';

-- ============================================
-- Update function to include WETH balance
-- ============================================
-- Update get_total_bot_wallet_credits to sum both ETH and WETH
-- Total Credit = Native ETH (distributed_amount_wei) + WETH (weth_balance_wei)
CREATE OR REPLACE FUNCTION get_total_bot_wallet_credits(p_user_address TEXT)
RETURNS NUMERIC(78, 0)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  total_credits NUMERIC(78, 0);
BEGIN
  SELECT COALESCE(
    SUM(COALESCE(weth_balance_wei, distributed_amount_wei, 0)), 
    0
  )
  INTO total_credits
  FROM bot_wallet_credits
  WHERE user_address = LOWER(p_user_address);
  
  RETURN total_credits;
END;
$$;

COMMENT ON FUNCTION get_total_bot_wallet_credits IS 'Returns total credits (ETH + WETH) distributed to bot wallets for a user (in wei). Uses weth_balance_wei if available, otherwise falls back to distributed_amount_wei for backward compatibility.';

-- ============================================
-- Migration Complete!
-- ============================================
-- Changes:
--   1. Added weth_balance_wei column to bot_wallet_credits
--   2. Migrated existing records (set weth_balance_wei = distributed_amount_wei)
--   3. Updated get_total_bot_wallet_credits function to include WETH balance
-- 
-- Note: 
--   - distributed_amount_wei: Original ETH amount (maintained for backward compatibility)
--   - weth_balance_wei: WETH balance (1:1 with ETH, explicitly tracked as WETH)
--   - Total Credit = Native ETH + WETH (both are 1:1 equivalent)
-- ============================================

