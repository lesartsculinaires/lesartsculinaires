import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { SUPABASE_URL } from "@/lib/supabase/config";

/**
 * Service-role client, for the few operations the anon key cannot do —
 * today only creating and deleting auth accounts.
 *
 * This key bypasses Row Level Security entirely. It is read from a variable
 * WITHOUT the NEXT_PUBLIC_ prefix on purpose, so Next never inlines it into
 * the browser bundle, and every caller must check the signed-in user is an
 * administrator before reaching for it.
 */
export function getAdminClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) return null;

  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const hayServiceRole = (): boolean =>
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
