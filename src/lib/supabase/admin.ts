import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { env, marcaDelPedido } from "@/lib/marca/servidor";
import { supabasePublico } from "@/lib/supabase/config";

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
  const marca = marcaDelPedido();
  const { url } = supabasePublico(marca);
  const key = env("SUPABASE_SERVICE_ROLE_KEY", marca);
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const hayServiceRole = (): boolean =>
  Boolean(env("SUPABASE_SERVICE_ROLE_KEY"));
