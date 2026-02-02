-- ============================================
-- Fix RLS Policy untuk Privy Authentication
-- ============================================
-- Problem: Original RLS policy uses auth.uid() which only works with Supabase Auth
-- Solution: Allow public read access, filtering is done in application code
-- ============================================

-- 1. Fix RLS Policy untuk user_credits table
-- Allow public read access (filtering by user_address is done in application code)
DROP POLICY IF EXISTS "Users can view own credits" ON user_credits;
CREATE POLICY "Users can view own credits"
  ON user_credits
  FOR SELECT
  USING (true); -- Allow public read - filtering by user_address is done in application code

-- 2. Fix RLS Policy untuk conversion_logs table
-- Allow public read access (filtering by user_address is done in application code)
DROP POLICY IF EXISTS "Users can view own conversion logs" ON conversion_logs;
CREATE POLICY "Users can view own conversion logs"
  ON conversion_logs
  FOR SELECT
  USING (true); -- Allow public read - filtering by user_address is done in application code

-- 3. Ensure increment_user_credit function is SECURITY DEFINER
-- This allows the function to bypass RLS when called from API route
CREATE OR REPLACE FUNCTION increment_user_credit(
  p_user_address TEXT,
  p_amount_wei TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER -- This allows bypassing RLS
AS $$
BEGIN
  INSERT INTO user_credits (user_address, balance_wei, last_updated)
  VALUES (LOWER(p_user_address), p_amount_wei::NUMERIC, NOW())
  ON CONFLICT (user_address)
  DO UPDATE SET
    balance_wei = user_credits.balance_wei + p_amount_wei::NUMERIC,
    last_updated = NOW();
END;
$$;

-- ============================================
-- Verification
-- ============================================
-- After running this script, verify:
-- 1. SELECT queries should work without 406 errors
-- 2. increment_user_credit function should work from API routes
-- 3. Filtering by user_address is handled in application code (use-credit-balance.ts)
-- ============================================










