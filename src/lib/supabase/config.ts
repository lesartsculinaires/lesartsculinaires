/**
 * Supabase connection settings, read from the environment.
 *
 * The app is designed to run without these: when they are absent every data
 * call falls back to the seed records in `src/data`, so a missing `.env.local`
 * degrades to the demo dataset instead of an error page.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** True when both values are present and the client can be constructed. */
export const isSupabaseConfigured = (): boolean =>
  Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
