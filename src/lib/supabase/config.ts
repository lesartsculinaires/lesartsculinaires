import { MODO_UNIFICADO, MARCA_FIJA, type ClaveMarca } from "@/lib/marcas";

/**
 * A qué Supabase se conecta cada marca (12/11/2026).
 *
 * Son los dos valores públicos —la URL y la llave anónima—, que también usa el
 * navegador. Por eso cada uno se escribe con su nombre completo: Next sólo
 * mete en el navegador las `NEXT_PUBLIC_*` que aparecen escritas tal cual.
 *
 *   sitio de una marca   NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY, como siempre
 *   CRM unificado        NEXT_PUBLIC_LAC_SUPABASE_URL / _ANON_KEY
 *                        NEXT_PUBLIC_HC_SUPABASE_URL / _ANON_KEY
 *
 * La llave de servicio, que es secreta, se lee aparte con `env()` de
 * `@/lib/marca/servidor`.
 */
interface Publico {
  url: string;
  anon: string;
}

const DE_UNA_MARCA: Publico = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
};

const POR_MARCA: Record<ClaveMarca, Publico> = {
  lac: {
    url: process.env.NEXT_PUBLIC_LAC_SUPABASE_URL ?? "",
    anon: process.env.NEXT_PUBLIC_LAC_SUPABASE_ANON_KEY ?? "",
  },
  hc: {
    url: process.env.NEXT_PUBLIC_HC_SUPABASE_URL ?? "",
    anon: process.env.NEXT_PUBLIC_HC_SUPABASE_ANON_KEY ?? "",
  },
};

/** La URL y la llave anónima de una marca. */
export function supabasePublico(marca: ClaveMarca = MARCA_FIJA): Publico {
  return MODO_UNIFICADO ? POR_MARCA[marca] : DE_UNA_MARCA;
}

/** True when both values are present and the client can be constructed. */
export const isSupabaseConfigured = (marca: ClaveMarca = MARCA_FIJA): boolean => {
  const { url, anon } = supabasePublico(marca);
  return Boolean(url && anon);
};
