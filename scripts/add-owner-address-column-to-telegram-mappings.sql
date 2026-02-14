-- =============================================
-- Migration: Add owner_address column to telegram_user_mappings
-- =============================================
-- This migration adds the owner_address column to store the owner/EOA address
-- from Coinbase CDP Bot Wallets

-- Add owner_address column if it doesn't exist
ALTER TABLE telegram_user_mappings 
ADD COLUMN IF NOT EXISTS owner_address TEXT;

-- Create index on owner_address for fast lookups
CREATE INDEX IF NOT EXISTS idx_telegram_user_mappings_owner_address 
ON telegram_user_mappings(owner_address);

-- Add comment to document the column
COMMENT ON COLUMN telegram_user_mappings.owner_address IS 'Owner/EOA address from Coinbase CDP Bot Wallets';

-- Verification query - check the updated table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'telegram_user_mappings'
ORDER BY ordinal_position;
