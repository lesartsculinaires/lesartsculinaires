"use server";

import { randomBytes } from "node:crypto";

import { getServerClient } from "@/lib/supabase/server";

/**
 * Enlaces para pasarle una inscripción al área académica.
 *
 * El enlace es la llave: quien lo tenga ve esa inscripción sin cuenta ni
 * contraseña. Por eso el token se saca de `randomBytes` y no de `Math.random`,
 * que es predecible, y por eso vence solo.
 */

/** 24 bytes: 192 bits de azar, 32 caracteres en la URL. */
const BYTES_TOKEN = 24;

/** Cuánto vive un enlace nuevo. */
const DIAS = 30;

export interface ResultadoEnlace {
  ok: boolean;
  error: string | null;
  /** La dirección completa, lista para pegar en un chat. */
  url?: string;
  vence?: string;
  /** El enlace ya existía y se reutilizó, en vez de crear otro. */
  reutilizado?: boolean;
}

/**
 * El enlace de esta oportunidad: el que ya había, o uno nuevo.
 *
 * Se reutiliza mientras siga vivo. Crear uno por cada clic dejaría varios
 * enlaces buenos dando vueltas para la misma inscripción, y anular «el» enlace
 * dejaría de significar algo.
 */
export async function crearEnlacePago(oportunidadId: number): Promise<ResultadoEnlace> {
  const supabase = await getServerClient();
  if (!supabase) return { ok: false, error: "Sesión no válida. Volvé a iniciar sesión." };

  const { data: previo, error: errBuscar } = await supabase
    .from("enlaces_pago")
    .select("token, vence_en")
    .eq("oportunidad_id", oportunidadId)
    .eq("revocado", false)
    .gt("vence_en", new Date().toISOString())
    .order("creado_en", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (errBuscar) {
    if (errBuscar.code === "PGRST205") {
      return {
        ok: false,
        error: "Falta correr la migración 20260822120000_enlaces_pago.sql en Supabase.",
      };
    }
    return { ok: false, error: errBuscar.message };
  }

  if (previo) {
    return {
      ok: true,
      error: null,
      url: await direccion(String(previo.token)),
      vence: String(previo.vence_en),
      reutilizado: true,
    };
  }

  const { data: { user } = { user: null } } = await supabase.auth.getUser();
  const token = randomBytes(BYTES_TOKEN).toString("base64url");
  const vence = new Date(Date.now() + DIAS * 24 * 3600 * 1000).toISOString();

  const { error } = await supabase.from("enlaces_pago").insert({
    token,
    oportunidad_id: oportunidadId,
    creado_por: user?.id ?? null,
    vence_en: vence,
  });

  if (error) return { ok: false, error: error.message };

  return { ok: true, error: null, url: await direccion(token), vence, reutilizado: false };
}

/** Anula el enlace vivo de una oportunidad. El que ya se mandó deja de abrir. */
export async function anularEnlacePago(
  oportunidadId: number,
): Promise<{ ok: boolean; error: string | null }> {
  const supabase = await getServerClient();
  if (!supabase) return { ok: false, error: "Sesión no válida. Volvé a iniciar sesión." };

  const { error } = await supabase
    .from("enlaces_pago")
    .update({ revocado: true })
    .eq("oportunidad_id", oportunidadId)
    .eq("revocado", false);

  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

/**
 * La dirección completa del enlace.
 *
 * Se arma con la cabecera `host` de la petición y no con una variable fija: el
 * CRM se abre desde la dirección de Netlify y, en pruebas, desde localhost. Un
 * valor escrito a mano daría un enlace que no abre en el entorno equivocado, y
 * eso se descubre recién cuando alguien del otro lado lo intenta.
 */
async function direccion(token: string): Promise<string> {
  const { headers } = await import("next/headers");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const protocolo = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  return `${protocolo}://${host}/pago/${token}`;
}
