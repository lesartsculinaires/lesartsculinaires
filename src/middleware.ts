import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const URL_ENV = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY_ENV = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * Cuánto se espera a que Supabase diga quién es esta persona.
 *
 * ============================================================================
 * SIN ESTO, UN SUPABASE LENTO TIRA EL CRM ENTERO
 * ============================================================================
 *
 * Esta función corre en el borde, ANTES que cualquier página, y en cada
 * petición. Netlify le da un tiempo y después la mata con una pantalla suya:
 *
 *     This edge function has crashed — the edge function timed out
 *
 * que no dice nada de Supabase, ni de sesión, ni de qué hacer. La escuela la
 * vio en medio de una campaña, que es justo cuando el CRM está haciendo miles
 * de consultas contra el mismo Supabase: si la consulta de sesión se demora, la
 * espera acá era INFINITA y todo el mundo se quedaba sin CRM —no sólo quien
 * mandaba la campaña—.
 *
 * Tres segundos es muchísimo para esta pregunta: normalmente tarda entre 150 y
 * 400 milisegundos. Lo que cambia no es el caso bueno sino el malo: en vez de
 * esperar hasta que Netlify corte, se decide con lo que se sabe.
 */
const ESPERA_MS = 3000;

/** El mismo `fetch`, pero que se rinde en vez de colgarse. */
const conPlazo: typeof fetch = (entrada, init) =>
  fetch(entrada, { ...init, signal: AbortSignal.timeout(ESPERA_MS) });

/**
 * ¿Esta petición trae una sesión de Supabase?
 *
 * Mirar la galleta no dice si la sesión es VÁLIDA —eso sólo lo sabe Supabase—
 * pero sí distingue las dos situaciones que hay que tratar distinto cuando no
 * se pudo preguntar: alguien que nunca entró y alguien a quien no se le pudo
 * confirmar la sesión que ya tenía.
 */
const traeSesion = (request: NextRequest): boolean =>
  request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));

/**
 * Refreshes the auth session on every request and gates the app behind login.
 *
 * Supabase access tokens are short-lived; without this the session would expire
 * mid-session and Server Components would silently start seeing no rows.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Unconfigured deployments fall through to the login page, which explains
  // what is missing rather than throwing.
  if (!URL_ENV || !KEY_ENV) return response;

  const supabase = createServerClient(URL_ENV, KEY_ENV, {
    global: { fetch: conPlazo },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  /*
   * Se pregunta quién es, y se acepta no haber podido preguntar.
   *
   * ==========================================================================
   * QUÉ SE HACE CUANDO SUPABASE NO CONTESTA
   * ==========================================================================
   *
   * Depende de si la petición trae sesión, y son dos casos de verdad
   * distintos:
   *
   *   SIN GALLETA    No hay nada que verificar: no entró nadie. Va al login,
   *                  igual que siempre. No se está dejando pasar a nadie.
   *
   *   CON GALLETA    Alguien que YA estaba trabajando. Mandarlo al login sería
   *                  lo peor posible: el login también necesita Supabase, así
   *                  que lo echaríamos a una pantalla desde la que tampoco
   *                  puede volver a entrar, y encima perdiendo lo que estaba
   *                  haciendo. Se lo deja pasar.
   *
   * DEJAR PASAR NO ABRE NADA, y es la parte que importa: este archivo no es lo
   * que protege los datos. Lo que los protege son las políticas de la base
   * —que validan el token en cada consulta— y las comprobaciones de cada acción
   * del servidor. Una galleta inventada llega a ver el armazón del CRM y ni una
   * fila. Y si Supabase no contesta, tampoco hay filas para nadie.
   *
   * O sea: el que no verifica se queda sin datos igual, y el que sí tenía
   * sesión no pierde su trabajo por un tropiezo de treinta segundos.
   */
  let user = null;
  let huboRespuesta = true;

  try {
    const { data, error } = await supabase.auth.getUser();
    user = data.user;
    /*
     * Sólo cuenta como caída cuando NO hubo respuesta.
     *
     * Un token vencido SÍ es una respuesta —Supabase contesta con un código— y
     * tiene que mandar al login como siempre. Confundir las dos cosas sería
     * peor que el problema original: una sesión vencida no volvería a pedir
     * contraseña nunca. Por eso se mira si vino código de respuesta y no el
     * texto del error, que cambia con cada versión de la librería.
     */
    if (error && !error.status) huboRespuesta = false;
  } catch {
    huboRespuesta = false;
  }

  const { pathname } = request.nextUrl;
  const isLogin = pathname.startsWith("/login");

  // Supabase no contestó y esta persona ya venía trabajando: ver arriba.
  if (!user && !huboRespuesta && traeSesion(request)) return response;

  if (!user && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // A quien ya tiene sesión no se lo expulsa de la portada: necesita poder
  // llegar para cambiar de cuenta o cerrar sesión. La propia pantalla avisa
  // que la sesión está abierta y ofrece las dos salidas.

  return response;
}

export const config = {
  matcher: [
    // Everything except Next internals and static assets.
    //
    // `api/v1` queda afuera porque no entra con cookie de sesión sino con una
    // llave en la cabecera: pasar por acá lo redirigiría al login, y n8n
    // recibiría un 307 hacia una página HTML en vez de su JSON. Cada endpoint
    // comprueba la llave por su cuenta antes de tocar nada (`@/lib/api/http`).
    //
    // `registro` queda afuera porque es para el área académica, que no usa el
    // CRM y no tiene cuenta: pasando por acá el enlace los mandaría al login y
    // no serviría de nada. Lo que protege esa página no es la sesión sino el
    // token de la propia dirección, que se comprueba antes de mostrar nada.
    //
    // `pago` era el nombre viejo y sólo redirige; también tiene que quedar
    // afuera, o un enlace ya enviado moriría en el login en vez de llegar a su
    // redirección.
    //
    // `api/instagram` y `api/messenger` quedan afuera por lo mismo que
    // `api/whatsapp`: los llama Meta desde sus servidores, sin cookie de sesión
    // y sin nadie detrás. Pasando por acá recibirían un 307 al login, y Meta lo
    // leería como que la URL no contesta: primero no verificaría el webhook, y
    // después lo desactivaría. Lo que los protege no es la sesión sino la firma
    // del cuerpo, que cada ruta comprueba antes de mirar nada.
    //
    // ES EL PRIMER LUGAR DONDE HAY QUE ACORDARSE DE UN CANAL NUEVO. Al conectar
    // Messenger, todo lo demás estaba hecho y los mensajes seguían sin entrar:
    // llegaban acá y se iban al login. El síntoma es idéntico al de un webhook
    // mal configurado en Meta, así que se busca del lado equivocado.
    "/((?!api/v1|api/whatsapp|api/instagram|api/messenger|registro/|pago/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
