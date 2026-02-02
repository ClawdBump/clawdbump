-- ============================================
-- CDP Server Wallets V2 Migration
-- ============================================
-- This migration updates the wallets_data table to use CDP Server Wallets
-- instead of self-managed private keys

-- Step 1: Add new columns for CDP
ALTER TABLE wallets_data
ADD COLUMN IF NOT EXISTS coinbase_wallet_id TEXT,
ADD COLUMN IF NOT EXISTS chain TEXT DEFAULT 'base-mainnet';

-- Step 2: Make old columns optional (for backward compatibility during migration)
ALTER TABLE wallets_data
ALTER COLUMN owner_private_key DROP NOT NULL,
ALTER COLUMN owner_public_address DROP NOT NULL;

-- Step 3: Create index on coinbase_wallet_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_wallets_coinbase_wallet_id 
ON wallets_data(coinbase_wallet_id);

-- Step 4: Add comment explaining new structure
COMMENT ON COLUMN wallets_data.coinbase_wallet_id IS 'CDP Server Wallet ID (replaces owner_private_key)';
COMMENT ON COLUMN wallets_data.chain IS 'Network ID (e.g., base-mainnet, base-sepolia)';

-- ============================================
-- Migration Notes
-- ============================================
-- 
-- OLD STRUCTURE (Self-Managed):
-- - owner_private_key: Encrypted private key stored in database
-- - owner_public_address: EOA address derived from private key
-- - smart_account_address: Smart Account address calculated via CREATE2
-- 
-- NEW STRUCTURE (CDP Server Wallets):
-- - coinbase_wallet_id: CDP Wallet ID (e.g., "abc-123-def-456")
-- - smart_account_address: Default address from CDP wallet
-- - chain: Network ID (e.g., "base-mainnet")
-- - owner_private_key: NULL (not needed, CDP manages keys)
-- - owner_public_address: NULL (not needed, CDP manages keys)
-- 
-- BENEFITS:
-- - Private keys managed by Coinbase in secure AWS Nitro Enclaves
-- - Native gas sponsorship (no Paymaster allowlist issues)
-- - Simpler API (no manual encryption/decryption)
-- - Production-grade security
-- 
-- MIGRATION STEPS:
-- 1. Run this SQL to update schema
-- 2. Delete old wallet records (or keep for reference)
-- 3. Users regenerate wallets using new CDP system
-- 4. New wallets will have coinbase_wallet_id populated
-- 5. Old encryption logic can be removed from codebase
-- 
-- ============================================

-- Optional: Clean up old wallets (CAUTION: This deletes all existing bot wallets!)
-- Uncomment the line below if you want to start fresh
-- DELETE FROM wallets_data WHERE coinbase_wallet_id IS NULL;





