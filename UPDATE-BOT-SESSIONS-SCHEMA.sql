-- ============================================
-- Update bot_sessions table schema
-- Add interval_seconds and amount_usd columns
-- ============================================

-- Add interval_seconds column (in seconds: 2 to 600)
ALTER TABLE bot_sessions 
ADD COLUMN IF NOT EXISTS interval_seconds INTEGER NOT NULL DEFAULT 60;

-- Add amount_usd column (USD amount per bump)
ALTER TABLE bot_sessions 
ADD COLUMN IF NOT EXISTS amount_usd NUMERIC(18, 6) NOT NULL DEFAULT 0;

-- Add constraint: interval_seconds must be between 2 and 600 (2 seconds to 10 minutes)
ALTER TABLE bot_sessions 
DROP CONSTRAINT IF EXISTS check_interval_seconds;

ALTER TABLE bot_sessions 
ADD CONSTRAINT check_interval_seconds 
CHECK (interval_seconds >= 2 AND interval_seconds <= 600);

-- Update index for active sessions to include interval_seconds if needed
-- (The existing index is sufficient)

-- ============================================
-- Schema Update Complete!
-- ============================================
-- New columns:
--   - interval_seconds: INTEGER (2-600 seconds) - Time between each bump
--   - amount_usd: NUMERIC(18, 6) - USD amount per bump (for reference)
-- ============================================










