import { createClient } from '@supabase/supabase-js'

// CRITICAL: Initialize environment variables at top level to prevent "Cannot access before initialization" errors
// These are accessed inside functions, but initialized at module level for safety
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// Singleton instance for client-side Supabase client (uses anon key)
// CRITICAL: This is a singleton to prevent multiple GoTrueClient instances
// Multiple instances cause "Multiple GoTrueClient instances detected" warnings
// and can lead to undefined behavior when used concurrently
let supabaseClientInstance: ReturnType<typeof createClient> | null = null

// Client-side Supabase client (uses anon key)
// CRITICAL: Returns the same instance across all calls to prevent multiple GoTrueClient instances
export function createSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }

  // Return existing instance if available
  if (supabaseClientInstance) {
    return supabaseClientInstance
  }

  // Create instance only once
  supabaseClientInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  return supabaseClientInstance
}

// Server-side Supabase client (uses service role key - bypasses RLS)
// Note: Service client is NOT singleton because it's used on the server side
// where each request should have its own instance
export function createSupabaseServiceClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase service role key. Set SUPABASE_SERVICE_ROLE_KEY in environment variables.')
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}


