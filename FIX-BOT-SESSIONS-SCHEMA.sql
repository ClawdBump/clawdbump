-- ============================================
-- Fix bot_sessions table schema
-- Add missing columns: amount_usd and interval_seconds
-- ============================================
-- Run this in Supabase SQL Editor to fix the schema mismatch

-- Add amount_usd column if it doesn't exist
ALTER TABLE bot_sessions 
ADD COLUMN IF NOT EXISTS amount_usd TEXT;

-- Add interval_seconds column if it doesn't exist
ALTER TABLE bot_sessions 
ADD COLUMN IF NOT EXISTS interval_seconds INTEGER;

-- Update existing rows to have default values if needed
UPDATE bot_sessions 
SET amount_usd = '0.01' 
WHERE amount_usd IS NULL;

UPDATE bot_sessions 
SET interval_seconds = 60 
WHERE interval_seconds IS NULL;

-- Add NOT NULL constraint after setting defaults (if needed)
-- Note: Only add NOT NULL if you're sure all rows have values
-- ALTER TABLE bot_sessions ALTER COLUMN amount_usd SET NOT NULL;
-- ALTER TABLE bot_sessions ALTER COLUMN interval_seconds SET NOT NULL;

-- ============================================
-- Schema Fix Complete!
-- ============================================
-- Added columns:
--   - amount_usd: TEXT - USD amount per bump
--   - interval_seconds: INTEGER - Time between each bump in seconds
-- ============================================

