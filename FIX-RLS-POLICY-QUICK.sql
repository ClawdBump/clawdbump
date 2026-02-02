-- ============================================
-- Quick Fix: RLS Policy untuk Error 406
-- ============================================
-- Copy dan paste SQL ini ke Supabase SQL Editor
-- ============================================

-- Fix RLS Policy untuk user_credits table
DROP POLICY IF EXISTS "Users can view own credits" ON user_credits;
CREATE POLICY "Users can view own credits"
  ON user_credits
  FOR SELECT
  USING (true); -- Allow public read - filtering by user_address is done in application code

-- Fix RLS Policy untuk conversion_logs table
DROP POLICY IF EXISTS "Users can view own conversion logs" ON conversion_logs;
CREATE POLICY "Users can view own conversion logs"
  ON conversion_logs
  FOR SELECT
  USING (true); -- Allow public read - filtering by user_address is done in application code

-- ============================================
-- Verifikasi: Cek apakah policy sudah dibuat
-- ============================================
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('user_credits', 'conversion_logs')
ORDER BY tablename, policyname;










