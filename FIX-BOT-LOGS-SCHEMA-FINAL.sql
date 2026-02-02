-- ============================================
-- Fix bot_logs table schema - Final Version
-- Ensure all required columns exist for proper logging
-- ============================================
-- Run this in Supabase SQL Editor to fix the schema

-- 1. Tambahkan semua kolom identitas & detail (satu per satu karena PostgreSQL)
ALTER TABLE bot_logs 
ADD COLUMN IF NOT EXISTS user_address TEXT;

ALTER TABLE bot_logs 
ADD COLUMN IF NOT EXISTS wallet_address TEXT;

ALTER TABLE bot_logs 
ADD COLUMN IF NOT EXISTS token_address TEXT;

ALTER TABLE bot_logs 
ADD COLUMN IF NOT EXISTS amount_wei TEXT;

ALTER TABLE bot_logs 
ADD COLUMN IF NOT EXISTS tx_hash TEXT;

ALTER TABLE bot_logs 
ADD COLUMN IF NOT EXISTS action TEXT;

ALTER TABLE bot_logs 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

ALTER TABLE bot_logs 
ADD COLUMN IF NOT EXISTS message TEXT;

ALTER TABLE bot_logs 
ADD COLUMN IF NOT EXISTS error_details JSONB;

-- 2. Sinkronisasi Waktu (Gunakan created_at sebagai standar Supabase)
-- Pastikan created_at ada (untuk kompatibilitas dengan code yang menggunakan created_at)
ALTER TABLE bot_logs 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Pastikan timestamp juga ada (untuk kompatibilitas dengan code yang menggunakan timestamp)
ALTER TABLE bot_logs 
ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ DEFAULT NOW();

-- 3. Update trigger untuk sync created_at dan timestamp
-- Jika created_at diupdate, sync ke timestamp juga
CREATE OR REPLACE FUNCTION sync_bot_logs_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  -- Sync created_at and timestamp
  IF NEW.created_at IS NOT NULL AND (NEW.timestamp IS NULL OR NEW.timestamp != NEW.created_at) THEN
    NEW.timestamp = NEW.created_at;
  ELSIF NEW.timestamp IS NOT NULL AND (NEW.created_at IS NULL OR NEW.created_at != NEW.timestamp) THEN
    NEW.created_at = NEW.timestamp;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_bot_logs_timestamps_trigger ON bot_logs;
CREATE TRIGGER sync_bot_logs_timestamps_trigger
  BEFORE INSERT OR UPDATE ON bot_logs
  FOR EACH ROW
  EXECUTE FUNCTION sync_bot_logs_timestamps();

-- 4. Keamanan RLS (Wajib)
ALTER TABLE bot_logs ENABLE ROW LEVEL SECURITY;

-- Policy untuk public read (filtering by user_address di application code)
DROP POLICY IF EXISTS "Public read logs" ON bot_logs;
CREATE POLICY "Public read logs" 
  ON bot_logs 
  FOR SELECT 
  TO public 
  USING (true);

-- Note: Service role tidak perlu policy karena service_role otomatis bypass RLS
-- Jika perlu policy untuk service_role, gunakan:
-- CREATE POLICY "Service role access logs" 
--   ON bot_logs 
--   FOR ALL 
--   TO service_role 
--   USING (true) 
--   WITH CHECK (true);

-- 5. Performa - Indexes
CREATE INDEX IF NOT EXISTS idx_bot_logs_user_address ON bot_logs(user_address);
CREATE INDEX IF NOT EXISTS idx_bot_logs_wallet_address ON bot_logs(wallet_address);
CREATE INDEX IF NOT EXISTS idx_bot_logs_token_address ON bot_logs(token_address);
CREATE INDEX IF NOT EXISTS idx_bot_logs_action ON bot_logs(action);
CREATE INDEX IF NOT EXISTS idx_bot_logs_status ON bot_logs(status);
CREATE INDEX IF NOT EXISTS idx_bot_logs_created_at ON bot_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_logs_timestamp ON bot_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_bot_logs_user_created ON bot_logs(user_address, created_at DESC);

-- ============================================
-- Schema Fix Complete!
-- ============================================
-- Columns added:
--   - user_address: User's main wallet address
--   - wallet_address: Bot wallet address used for swap
--   - token_address: Target token address
--   - amount_wei: Amount in wei
--   - tx_hash: Transaction hash
--   - action: Action type (swap_executing, swap_success, etc.)
--   - status: Status (pending, success, error, warning, info)
--   - message: Log message
--   - error_details: JSONB for error details
--   - created_at: Timestamp (Supabase standard)
--   - timestamp: Timestamp (alternative, synced with created_at)
-- 
-- Features:
--   - RLS enabled with public read access
--   - Indexes for performance
--   - Auto-sync between created_at and timestamp
-- ============================================

