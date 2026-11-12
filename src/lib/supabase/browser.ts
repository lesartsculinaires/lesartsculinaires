"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { marcaEnElNavegador } from "@/lib/marca/navegador";
import type { ClaveMarca } from "@/lib/marcas";
import { supabasePublico } from "@/lib/supabase/config";

// Uno por marca: en el CRM unificado la página se recarga al cambiar de marca,
// pero así ni por error un cliente de una marca le habla a la otra base.
const clientes = new Map<ClaveMarca, SupabaseClient>();

/**
 * Cliente del navegador: sesión desde las cookies, y el websocket de los
 * cambios en vivo.
 *
 * Se guarda uno solo para toda la pestaña. Antes se construía uno nuevo en
 * cada llamada, que para entrar y salir daba igual; con los cambios en vivo
 * ya no, porque cada cliente abre su propio websocket y tendríamos varias
 * conexiones repitiendo el mismo aviso.
 */
export const getBrowserClient = (marca: ClaveMarca = marcaEnElNavegador()): SupabaseClient => {
  let cliente = clientes.get(marca);
  if (!cliente) {
    const { url, anon } = supabasePublico(marca);
    // `isSingleton: false`: @supabase/ssr guarda UN cliente en el navegador y
    // lo devuelve aunque se le pida otra URL. Con dos marcas eso haría que el
    // cliente «de HC» le hablara a la base de LAC. El Map de arriba ya evita
    // crear más de uno por marca.
    cliente = createBrowserClient(url, anon, { isSingleton: false });
    clientes.set(marca, cliente);
  }
  return cliente;
};
