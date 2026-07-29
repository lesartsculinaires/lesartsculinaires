import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  isSupabaseConfigured,
} from "@/lib/supabase/config";

/**
 * Server-side Supabase client.
 *
 * Returns null when the environment is not configured; callers treat that as
 * "use the seed data" rather than an error. Sessions are not persisted here —
 * each request builds its own client.
 */
export function getServerClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
