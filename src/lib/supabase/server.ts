import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  isSupabaseConfigured,
} from "@/lib/supabase/config";

/**
 * Los errores que dan los relojes desfasados, no la sesión.
 *
 * ============================================================================
 * QUÉ ES «JWT ISSUED AT FUTURE»
 * ============================================================================
 *
 * Cada token que emite Supabase lleva adentro la hora en que se emitió (`iat`).
 * Quien lo recibe comprueba que esa hora no sea futura: un token emitido dentro
 * de un rato sería señal de que alguien lo fabricó.
 *
 * El problema es que quien emite y quien comprueba son dos máquinas distintas,
 * y sus relojes no están perfectamente sincronizados. Cuando el que comprueba
 * va un segundo atrasado, ve un token del futuro y lo rechaza —aunque sea
 * perfectamente válido—.
 *
 * Por eso la pantalla mostraba «0 oportunidades» con la bandeja llena de
 * conversaciones: se cayó la consulta que salió primero, no la sesión. Todas
 * las demás, un instante después, ya entraron.
 *
 * ============================================================================
 * POR QUÉ REINTENTAR ES EL ARREGLO Y NO UN PARCHE
 * ============================================================================
 *
 * Porque el desfase se cierra solo con el paso del tiempo. No hay nada que
 * corregir de este lado —los relojes son de Supabase— y no hay nada que
 * preguntarle al usuario: esperar medio segundo y volver a pedir es
 * exactamente lo que hace falta, y es lo que la persona hace a mano cuando
 * aprieta «Actualizar».
 *
 * Lo que NO se hace es ignorar el error ni aflojar la comprobación. Si después
 * de los reintentos sigue fallando, la respuesta pasa tal cual y la pantalla lo
 * dice: un desfase de más de tres segundos ya no es ruido, es algo roto.
 */
const RELOJ_DESFASADO = /issued at future|JWTIssuedAtFuture|not yet valid|nbf/i;

/** Cuánto esperar antes de cada reintento. Suma 2,8 s en el peor caso. */
const ESPERAS = [400, 800, 1600];

/**
 * `fetch` que reintenta cuando el rechazo es por un reloj desfasado.
 *
 * Sólo mira los rechazos de autorización: cualquier otro error pasa derecho, y
 * una respuesta buena ni se toca. El cuerpo se lee una sola vez y se devuelve
 * envuelto de nuevo, porque leerlo lo consume.
 */
const conReintentoDeReloj: typeof fetch = async (entrada, opciones) => {
  for (let intento = 0; ; intento += 1) {
    const respuesta = await fetch(entrada, opciones);

    // Lo normal: salió bien, o falló por algo que reintentar no arregla.
    if (respuesta.ok || respuesta.status < 400 || respuesta.status > 403) {
      return respuesta;
    }
    if (intento >= ESPERAS.length) return respuesta;

    const cuerpo = await respuesta.text();
    if (!RELOJ_DESFASADO.test(cuerpo)) {
      // No era el reloj. Se devuelve igual que vino, con su cuerpo intacto.
      return new Response(cuerpo, {
        status: respuesta.status,
        statusText: respuesta.statusText,
        headers: respuesta.headers,
      });
    }

    await new Promise((seguir) => setTimeout(seguir, ESPERAS[intento]));
  }
};

/**
 * Server-side Supabase client bound to the request's auth cookies.
 *
 * Every query runs as the signed-in user, so the `authenticated` RLS policies
 * apply. Without a session the database returns nothing — which is the point:
 * the anon key alone must not reach customer data.
 */
export async function getServerClient(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured()) return null;

  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { fetch: conReintentoDeReloj },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The middleware refreshes the session instead, so this is safe.
        }
      },
    },
  });
}

/** The signed-in user, or null. */
export async function getUser() {
  const supabase = await getServerClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}
