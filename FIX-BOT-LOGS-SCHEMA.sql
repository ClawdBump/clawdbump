-- ============================================
-- Fix bot_logs table schema
-- Ensure all required columns exist for proper logging
-- ============================================
-- Run this in Supabase SQL Editor to fix the schema

-- Add missing columns if they don't exist
ALTER TABLE bot_logs 
ADD COLUMN IF NOT EXISTS wallet_address TEXT;

ALTER TABLE bot_logs 
ADD COLUMN IF NOT EXISTS token_address TEXT;

ALTER TABLE bot_logs 
ADD COLUMN IF NOT EXISTS amount_wei TEXT;

ALTER TABLE bot_logs 
ADD COLUMN IF NOT EXISTS error_details JSONB;

-- Ensure action column exists (should already exist)
ALTER TABLE bot_logs 
ADD COLUMN IF NOT EXISTS action TEXT;

-- Ensure status column exists (should already exist)
ALTER TABLE bot_logs 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

-- Ensure message column exists (should already exist)
ALTER TABLE bot_logs 
ADD COLUMN IF NOT EXISTS message TEXT;

-- Ensure timestamp column exists (use created_at if timestamp doesn't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bot_logs' AND column_name = 'timestamp'
  ) THEN
    -- If timestamp doesn't exist, check if created_at exists and rename it
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'bot_logs' AND column_name = 'created_at'
    ) THEN
      ALTER TABLE bot_logs RENAME COLUMN created_at TO timestamp;
    ELSE
      ALTER TABLE bot_logs ADD COLUMN timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
  END IF;
END $$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_bot_logs_wallet_address ON bot_logs(wallet_address);
CREATE INDEX IF NOT EXISTS idx_bot_logs_token_address ON bot_logs(token_address);
CREATE INDEX IF NOT EXISTS idx_bot_logs_action ON bot_logs(action);
CREATE INDEX IF NOT EXISTS idx_bot_logs_status ON bot_logs(status);

-- ============================================
-- Schema Fix Complete!
-- ============================================
-- Added columns:
--   - wallet_address: Bot wallet address used for swap
--   - token_address: Target token address
--   - amount_wei: Amount in wei
--   - error_details: JSONB for error details
--   - action: Action type (swap_executing, swap_success, etc.)
--   - status: Status (pending, success, error, etc.)
--   - message: Log message
--   - timestamp: Timestamp (renamed from created_at if needed)
-- ============================================

