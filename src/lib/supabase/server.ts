import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SE_PASO, conTope } from "@/lib/conTope";
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
 * Cuánto puede tardar UNA consulta, reintentos incluidos.
 *
 * ============================================================================
 * SIN ESTO, UN SUPABASE FRÍO COLGABA LA PÁGINA PARA SIEMPRE
 * ============================================================================
 *
 * Acá no había ningún plazo. Mientras Supabase contesta en 150–400 ms eso no se
 * nota; cuando el proyecto se enfría y tarda doce segundos, la página se queda
 * esperando, Netlify la corta a mitad de camino y el navegador muestra:
 *
 *     Inactivity Timeout — Too much time has passed without sending any data
 *
 * Medido en el banco con Supabase a 12 s: la portada no contestó NUNCA —se
 * cortó la medición a los 70 segundos—.
 *
 * El plazo es para toda la consulta y no para cada intento, que es el error que
 * ya se cometió una vez en el middleware: acotando sólo cada intento, los
 * reintentos de más arriba se suman y el total vuelve a ser imprevisible.
 *
 * Ocho segundos: muchísimo para una consulta que normalmente tarda menos de
 * medio segundo, y por debajo del tope con que Netlify mata la función. Pasado
 * eso ya no hay página que salvar; lo que importa es fallar a tiempo y que la
 * pantalla lo pueda decir, en vez de morir en una pantalla de Netlify que no
 * explica nada.
 */
const PLAZO_MS = 8000;

/**
 * `fetch` que reintenta cuando el rechazo es por un reloj desfasado.
 *
 * Sólo mira los rechazos de autorización: cualquier otro error pasa derecho, y
 * una respuesta buena ni se toca. El cuerpo se lee una sola vez y se devuelve
 * envuelto de nuevo, porque leerlo lo consume.
 */
const conReintentoDeReloj: typeof fetch = async (entrada, opciones) => {
  const seAcaba = Date.now() + PLAZO_MS;

  for (let intento = 0; ; intento += 1) {
    const queda = seAcaba - Date.now();
    if (queda <= 0) throw new Error("Supabase no contestó a tiempo");

    /*
     * Si quien llama ya traía su propia señal, valen las dos: la primera que se
     * dispare corta. Pisarla con la nuestra desactivaría un `abortSignal()`
     * puesto a mano desde el código que llama.
     */
    const nuestra = AbortSignal.timeout(queda);
    const respuesta = await fetch(entrada, {
      ...opciones,
      signal: opciones?.signal ? AbortSignal.any([opciones.signal, nuestra]) : nuestra,
    });

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
 * Cuánto puede tardar «¿quién sos?», reintentos de la librería incluidos.
 *
 * ============================================================================
 * POR QUÉ ESTO VA APARTE DEL PLAZO DE LAS CONSULTAS
 * ============================================================================
 *
 * Porque `auth.getUser()` no es una consulta: cuando el token toca renovarse
 * llama por dentro a `_refreshAccessToken`, que reintenta solo hasta treinta
 * segundos y toma un `fetch` abortado como razón para reintentar. El plazo de
 * cada intento no lo frena —lo alimenta—.
 *
 * Medido en el banco con Supabase a 12 s: la portada tardaba 37 segundos en
 * contestar una redirección, con el plazo por consulta ya puesto. Netlify corta
 * mucho antes.
 *
 * Tres segundos: más que de sobra para una pregunta que en caliente tarda
 * menos de 300 ms.
 */
const TOPE_AUTH_MS = 3000;

/**
 * El mismo cliente, pero con `auth.getUser` acotado.
 *
 * ============================================================================
 * POR QUÉ ACÁ Y NO EN CADA LLAMADA
 * ============================================================================
 *
 * Porque hay diecisiete lugares que preguntan `auth.getUser()` —cada acción del
 * servidor comprueba quién es antes de tocar nada— y un tope que hay que
 * acordarse de poner en cada uno es un tope que falta en el próximo que se
 * escriba. Envolverlo donde se arma el cliente lo deja puesto para todos, y
 * para los que todavía no existen.
 *
 * Al vencerse contesta sin usuario: no se pudo confirmar quién es, así que no
 * se puede actuar como si se supiera, y las acciones del servidor niegan.
 *
 * ============================================================================
 * PERO «NO SE PUDO PREGUNTAR» NO ES «NO HAY SESIÓN», Y ACÁ SE DIJO QUE SÍ
 * ============================================================================
 *
 * Esto decía antes que al vencerse contestaba «lo mismo que contestaría
 * Supabase si no hubiera sesión», y que por lo tanto la pantalla mandaba al
 * login. Las dos mitades eran ciertas y juntas eran un desastre:
 *
 *     Supabase tarda más de tres segundos  →  getUser dice «no hay nadie»
 *                                          →  page.tsx manda al login
 *                                          →  la persona pierde lo que hacía
 *
 * Y con la sesión INTACTA: la pantalla de login le decía «ya tenés una sesión
 * abierta como …», que es exactamente lo que se vio en la captura.
 *
 * Pasó de verdad, y bastante: el 6 y el 7 de octubre de 2026 las dos asesoras
 * que más usan el CRM volvieron a entrar veinte y trece veces en un día. Tres
 * de esas veces en dos minutos, con tokens de segundos de vida —o sea que no
 * era vencimiento ni refresco: era esto—. Las cuentas de poco uso no lo
 * sufrieron, porque la lentitud llega con la carga.
 *
 * El middleware ya distinguía los dos casos y dejaba pasar a quien traía
 * galleta. Esta capa lo deshacía cinco milisegundos después.
 *
 * Ahora el vencimiento se marca con `SIN_RESPUESTA`, y quien necesite
 * distinguir pregunta con `quienEs()`. Los diecisiete lugares que sólo miran
 * `data.user` siguen negando igual, que para una escritura es lo correcto.
 */

/**
 * La marca de «no contestó a tiempo», para poder distinguirla de «no hay
 * sesión».
 *
 * Es un objeto único y se compara por identidad: el texto de un error cambia
 * con cada versión de la librería, y comparar textos es cómo se vuelve a
 * confundir una cosa con la otra.
 */
export const SIN_RESPUESTA = Object.assign(
  new Error("Supabase no contestó a tiempo al preguntar quién es"),
  { name: "SinRespuesta" },
);
function conTopeDeAuth(cliente: SupabaseClient): SupabaseClient {
  const original = cliente.auth.getUser.bind(cliente.auth);

  type Respuesta = Awaited<ReturnType<typeof original>>;

  cliente.auth.getUser = (async (jwt?: string) => {
    /*
     * Nunca rechaza: lo que pierde la carrera contra el reloj sigue corriendo,
     * y una promesa rechazada que ya nadie escucha tumba el render entero.
     */
    const pregunta: Promise<Respuesta | null> = original(jwt).catch(() => null);

    const contestó = await conTope(pregunta, TOPE_AUTH_MS);

    if (contestó !== SE_PASO && contestó !== null) return contestó;

    // El número faltaba en el texto —decía «no contestó en  ms»— y es el único
    // dato que vuelve útil esta línea cuando alguien la busca en el registro.
    console.warn(
      `[supabase] getUser no contestó en ${TOPE_AUTH_MS} ms: no se pudo confirmar la sesión`,
    );
    return {
      data: { user: null },
      error: SIN_RESPUESTA,
    } as unknown as Respuesta;
  }) as typeof cliente.auth.getUser;

  return cliente;
}

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

  return conTopeDeAuth(createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
  }));
}

/** The signed-in user, or null. */
export async function getUser() {
  const supabase = await getServerClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

/**
 * Quién es, DICIENDO ADEMÁS si se pudo preguntar.
 *
 * ============================================================================
 * PARA QUÉ HACE FALTA LA SEGUNDA MITAD
 * ============================================================================
 *
 * `getUser()` devuelve `null` en dos situaciones que no se parecen en nada:
 *
 *   NO HAY SESIÓN        La persona no entró, o su sesión venció. Hay que
 *                        mandarla al login: es lo que corresponde.
 *
 *   NO SE PUDO PREGUNTAR Supabase tardó más de lo que se le dio. La sesión
 *                        puede estar perfecta. Mandarla al login le hace
 *                        perder lo que estaba haciendo y le pide la contraseña
 *                        para volver a donde ya estaba.
 *
 * Quien sólo necesita negar —las acciones del servidor— puede seguir usando
 * `getUser()`: para una escritura, no poder confirmar es razón suficiente para
 * no escribir. Quien decide si echar a alguien de la pantalla tiene que usar
 * esto.
 */
export async function quienEs(): Promise<{
  user: Awaited<ReturnType<typeof getUser>>;
  /** Falso sólo cuando Supabase no contestó a tiempo. */
  respondio: boolean;
}> {
  const supabase = await getServerClient();
  // Sin configurar no es una caída pasajera: es un no definitivo.
  if (!supabase) return { user: null, respondio: true };

  const { data, error } = await supabase.auth.getUser();
  return { user: data.user ?? null, respondio: error !== SIN_RESPUESTA };
}
