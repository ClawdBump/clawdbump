-- ============================================
-- Telegram Integration with ClawdBumpbot
-- ============================================
-- This schema stores Telegram ID mapping for users who login via Telegram
-- Bot Telegram (ClawdBumpbot) can check if a user has logged in via Telegram
-- ============================================

-- Create telegram_user_mappings table
CREATE TABLE IF NOT EXISTS telegram_user_mappings (
  id BIGSERIAL PRIMARY KEY,
  telegram_id TEXT NOT NULL UNIQUE, -- Telegram user ID (from Privy)
  telegram_username TEXT, -- Telegram username (optional)
  privy_user_id TEXT NOT NULL, -- Privy user ID (DID)
  wallet_address TEXT NOT NULL, -- Smart Wallet address from Privy
  first_name TEXT, -- Telegram first name
  last_name TEXT, -- Telegram last name
  photo_url TEXT, -- Telegram profile photo URL
  is_active BOOLEAN NOT NULL DEFAULT true, -- Whether the mapping is active
  last_login_at TIMESTAMPTZ, -- Last time user logged in via Telegram
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_telegram_user_mappings_telegram_id ON telegram_user_mappings(telegram_id);
CREATE INDEX IF NOT EXISTS idx_telegram_user_mappings_wallet_address ON telegram_user_mappings(wallet_address);
CREATE INDEX IF NOT EXISTS idx_telegram_user_mappings_privy_user_id ON telegram_user_mappings(privy_user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_user_mappings_is_active ON telegram_user_mappings(is_active);

-- Enable RLS (Row Level Security)
ALTER TABLE telegram_user_mappings ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow service role to read/write (for API routes)
CREATE POLICY "Service role can manage telegram_user_mappings"
  ON telegram_user_mappings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- RLS Policy: Allow users to read their own mapping (optional, for future use)
CREATE POLICY "Users can read their own telegram mapping"
  ON telegram_user_mappings
  FOR SELECT
  USING (true); -- Allow read for now, can be restricted later if needed

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_telegram_user_mappings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_telegram_user_mappings_updated_at
  BEFORE UPDATE ON telegram_user_mappings
  FOR EACH ROW
  EXECUTE FUNCTION update_telegram_user_mappings_updated_at();

-- ============================================
-- Example Queries
-- ============================================

-- Check if a Telegram user has logged in
-- SELECT * FROM telegram_user_mappings WHERE telegram_id = '123456789' AND is_active = true;

-- Get wallet address for a Telegram user
-- SELECT wallet_address FROM telegram_user_mappings WHERE telegram_id = '123456789' AND is_active = true;

-- Get Telegram ID for a wallet address
-- SELECT telegram_id, telegram_username FROM telegram_user_mappings WHERE wallet_address = '0x...' AND is_active = true;

-- Update last login time
-- UPDATE telegram_user_mappings SET last_login_at = NOW() WHERE telegram_id = '123456789';

