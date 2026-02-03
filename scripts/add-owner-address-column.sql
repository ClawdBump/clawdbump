-- =============================================
-- Add owner_address column to telegram_user_mappings
-- =============================================
-- This column stores the EOA address (embedded wallet) that owns the Privy Smart Account
-- This is needed for backend transaction execution without user approval

ALTER TABLE telegram_user_mappings
ADD COLUMN IF NOT EXISTS owner_address TEXT;

-- Index for fast lookup by owner_address
CREATE INDEX IF NOT EXISTS idx_telegram_user_mappings_owner_address 
ON telegram_user_mappings(owner_address);

-- Add comment to column
COMMENT ON COLUMN telegram_user_mappings.owner_address IS 'EOA address (embedded wallet) that owns the Privy Smart Account. Used for backend transaction execution.';

