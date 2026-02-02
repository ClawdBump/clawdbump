-- =============================================
-- Add Native ETH Support to Bot Wallet Credits
-- =============================================
-- This migration adds native_eth_balance_wei column to track Native ETH
-- in addition to WETH balance for bot wallets.
-- 
-- Benefits:
-- - Bot wallets can receive Native ETH OR WETH distribution
-- - Swap can use Native ETH OR WETH (more flexible)
-- - No need to convert ETH to WETH every time (save gas)
-- - Total credit = native_eth_balance_wei + weth_balance_wei
--
-- Run this in Supabase SQL Editor

-- Add native_eth_balance_wei column to bot_wallet_credits
ALTER TABLE bot_wallet_credits
ADD COLUMN IF NOT EXISTS native_eth_balance_wei TEXT NOT NULL DEFAULT '0';

-- Add comment to explain the new column
COMMENT ON COLUMN bot_wallet_credits.native_eth_balance_wei IS 'Native ETH balance in wei (Base chain ETH, not WETH)';
COMMENT ON COLUMN bot_wallet_credits.weth_balance_wei IS 'WETH balance in wei (Wrapped ETH ERC20 token)';

-- Add index for efficient balance queries
CREATE INDEX IF NOT EXISTS idx_bot_wallet_credits_balances 
ON bot_wallet_credits(user_address, native_eth_balance_wei, weth_balance_wei);

-- Verify the migration
SELECT 
  column_name, 
  data_type, 
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'bot_wallet_credits'
  AND column_name IN ('native_eth_balance_wei', 'weth_balance_wei')
ORDER BY ordinal_position;

-- Show sample data with new column
SELECT 
  user_address,
  bot_wallet_address,
  native_eth_balance_wei,
  weth_balance_wei,
  created_at
FROM bot_wallet_credits
LIMIT 5;

