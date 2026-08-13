"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

let cliente: SupabaseClient | null = null;

/**
 * Cliente del navegador: sesión desde las cookies, y el websocket de los
 * cambios en vivo.
 *
 * Se guarda uno solo para toda la pestaña. Antes se construía uno nuevo en
 * cada llamada, que para entrar y salir daba igual; con los cambios en vivo
 * ya no, porque cada cliente abre su propio websocket y tendríamos varias
 * conexiones repitiendo el mismo aviso.
 */
export const getBrowserClient = (): SupabaseClient => {
  cliente ??= createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return cliente;
};
