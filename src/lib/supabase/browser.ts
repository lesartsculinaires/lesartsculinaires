"use client";

import { createBrowserClient } from "@supabase/ssr";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

/** Browser client, used only for the sign-in and sign-out flows. */
export const getBrowserClient = () =>
  createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
