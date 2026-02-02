import { createClient } from '@supabase/supabase-js'

// CRITICAL: Initialize environment variables at top level to prevent "Cannot access before initialization" errors
// These are accessed inside functions, but initialized at module level for safety
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// Client-side Supabase client (uses anon key)
export function createSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
}

// Server-side Supabase client (uses service role key - bypasses RLS)
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


