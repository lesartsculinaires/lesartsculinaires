/**
 * Las piezas del diálogo de conexión de Meta, aparte de las rutas.
 *
 * Viven acá —y no dentro de la ruta— porque son las que una prueba quiere mirar
 * sin levantar un servidor: que la dirección del diálogo lleve el `config_id`,
 * que pida los permisos que son, y que el canje no se arme si falta el secreto.
 */

export const APP_ID = (process.env.NEXT_PUBLIC_FACEBOOK_APP_ID ?? "").trim();

/**
 * La configuración de «Facebook Login for Business».
 *
 * Es lo que el panel de Meta llama «Embed URL» o «configuración de inicio de
 * sesión»: un paquete con los permisos y los activos que se le van a pedir a
 * quien conecte. Mandando `config_id` el diálogo le ofrece a la persona elegir
 * su Página y su cuenta de Instagram, que es exactamente el paso que el revisor
 * de Meta tiene que poder hacer.
 */
export const CONFIG_ID = (process.env.NEXT_PUBLIC_FACEBOOK_CONFIG_ID ?? "").trim();

/** El secreto de la app, para canjear el código. Nunca sale del servidor. */
export const secretoDeLaApp = (): string =>
  (process.env.INSTAGRAM_APP_SECRET ?? process.env.WHATSAPP_APP_SECRET ?? "").trim();

/** Con qué versión se habla. La misma que usa el resto del CRM. */
export const VERSION = "v21.0";

/**
 * A dónde se le habla a Meta, con el mismo desvío que el resto del CRM.
 *
 * ----------------------------------------------------------------------------
 * POR QUÉ SÓLO SE ACEPTA UNA DIRECCIÓN LOCAL
 * ----------------------------------------------------------------------------
 *
 * Porque por acá viaja el SECRETO DE LA APP, que es con lo que se canjea el
 * código. Una variable que redirija a dónde se manda es una variable que, mal
 * puesta, le entrega esa credencial a otro servidor —y con el secreto de la app
 * se pueden emitir tokens en nombre de la escuela—.
 *
 * Aceptar sólo `127.0.0.1` o `localhost` cierra eso: el destino tiene que ser la
 * misma máquina donde ya corre el CRM. Cualquier otro valor se ignora en
 * silencio y se usa el de Meta, que es lo correcto en producción.
 *
 * Existe por lo mismo que existe `INSTAGRAM_GRAPH_URL`: sin esto, conectar una
 * cuenta sería el único camino del CRM imposible de probar sin una cuenta real.
 */
const local = (): string | null => {
  const propuesta = (process.env.FACEBOOK_GRAPH_URL ?? "").trim();
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(propuesta) ? propuesta : null;
};

const GRAPH = (): string => local() ?? "https://graph.facebook.com";
const WWW = (): string => local() ?? "https://www.facebook.com";

/**
 * Los permisos que se piden.
 *
 * ----------------------------------------------------------------------------
 * POR QUÉ ESTOS Y NO MÁS
 * ----------------------------------------------------------------------------
 *
 * Porque cada permiso de más es una pregunta más en la revisión de Meta y una
 * casilla más que quien conecta tiene que aceptar. Son los cuatro que hacen
 * falta para leer y contestar mensajes, ni uno más:
 *
 *   pages_show_list            ver qué Páginas administra, para elegir una.
 *   pages_manage_metadata      suscribir esa Página al webhook. Sin esto se
 *                              conecta y no entra ningún mensaje.
 *   pages_messaging            contestar por Messenger.
 *   instagram_basic            leer la cuenta de Instagram ligada y su @usuario.
 *   instagram_manage_messages  leer y contestar los mensajes directos.
 *
 * Cuando se manda `config_id`, Meta usa los permisos de ESA configuración y
 * esta lista queda de respaldo para cuando no hay configuración armada.
 */
export const PERMISOS = [
  "pages_show_list",
  "pages_manage_metadata",
  "pages_messaging",
  "instagram_basic",
  "instagram_manage_messages",
];

/** Los campos del webhook a los que se suscribe la Página al conectarse. */
export const CAMPOS_WEBHOOK = [
  "messages",
  "messaging_postbacks",
  "message_echoes",
  "message_reads",
  "messaging_referrals",
  "messaging_optins",
];

/** El nombre de la galleta donde viaja el `state`. */
export const nombreDeLaGalleta = (): string => "lac_meta_state";

/**
 * La dirección del diálogo de Meta.
 *
 * Con `config_id` cuando lo hay —es el camino de «Facebook Login for Business»,
 * el que deja elegir Página y cuenta de Instagram— y con la lista de permisos
 * cuando no, que es el inicio de sesión clásico y sirve para probar.
 */
export function dialogoDeMeta(opciones: {
  vuelta: string;
  state: string;
  permisos: string[];
}): string {
  const p = new URLSearchParams({
    client_id: APP_ID,
    redirect_uri: opciones.vuelta,
    state: opciones.state,
    response_type: "code",
  });

  if (CONFIG_ID) p.set("config_id", CONFIG_ID);
  else p.set("scope", opciones.permisos.join(","));

  return `${WWW()}/${VERSION}/dialog/oauth?${p.toString()}`;
}

/** Dónde se canjea el código por un token de usuario. */
export function canjeDelCodigo(opciones: { vuelta: string; codigo: string }): string {
  const p = new URLSearchParams({
    client_id: APP_ID,
    client_secret: secretoDeLaApp(),
    redirect_uri: opciones.vuelta,
    code: opciones.codigo,
  });
  return `${GRAPH()}/${VERSION}/oauth/access_token?${p.toString()}`;
}

/**
 * Dónde se piden las Páginas que administra, con su token y su Instagram.
 *
 * El token que devuelve `/me/accounts` es el DE LA PÁGINA, que es el que sirve
 * para mensajería y el que se guarda. El de usuario se usa para esta consulta y
 * se tira: dura menos y no habilita mensajería.
 */
export function laspaginasDe(tokenDeUsuario: string): string {
  const p = new URLSearchParams({
    fields: "id,name,access_token,instagram_business_account{id,username}",
    limit: "50",
    access_token: tokenDeUsuario,
  });
  return `${GRAPH()}/${VERSION}/me/accounts?${p.toString()}`;
}

/** Dónde se suscribe una Página al webhook de la app. */
export function suscribirPagina(pageId: string): string {
  return `${GRAPH()}/${VERSION}/${encodeURIComponent(pageId)}/subscribed_apps`;
}

export interface PaginaDeMeta {
  id: string;
  nombre: string | null;
  token: string;
  igId: string | null;
  igUsuario: string | null;
}

/** Lee la respuesta de `/me/accounts` sin confiar en su forma. */
export function leerPaginas(carga: unknown): PaginaDeMeta[] {
  const raiz = (carga ?? {}) as Record<string, unknown>;
  const lista = Array.isArray(raiz.data) ? raiz.data : [];

  const dicho = (v: unknown): string | null => {
    const s = v == null ? "" : String(v).trim();
    return s === "" ? null : s;
  };

  const salida: PaginaDeMeta[] = [];
  for (const cruda of lista) {
    const p = (cruda ?? {}) as Record<string, unknown>;
    const id = dicho(p.id);
    const token = dicho(p.access_token);
    // Sin id o sin token no sirve para nada: no se puede ni identificar ni
    // hablar. Se descarta en vez de guardar una fila a medias.
    if (!id || !token) continue;

    const ig = (p.instagram_business_account ?? null) as Record<string, unknown> | null;

    salida.push({
      id,
      nombre: dicho(p.name),
      token,
      igId: dicho(ig?.id),
      igUsuario: dicho(ig?.username),
    });
  }
  return salida;
}

/**
 * La dirección pública de este CRM, vista desde afuera.
 *
 * ============================================================================
 * POR QUÉ NO ALCANZA CON `req.url`
 * ============================================================================
 *
 * Porque detrás de un proxy —Netlify lo es— la petición llega con el nombre
 * interno, y `req.url` puede decir `localhost`. Eso rompe la conexión de una
 * forma difícil de diagnosticar: la `redirect_uri` que se le manda a Meta al
 * empezar y la que se le manda al canjear tienen que ser IDÉNTICAS entre sí y
 * estar registradas en el panel. Si una dice `localhost`, Meta contesta
 * «redirect_uri mismatch» y no explica cuál de las dos está mal.
 *
 * Los encabezados `x-forwarded-*` son los que traen el nombre real. Se usan
 * cuando están y se cae a la dirección de la petición cuando no, que es el caso
 * de una máquina sin proxy delante.
 */
export function direccionPublica(req: {
  headers: { get(nombre: string): string | null };
  url: string;
}): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const protocolo = req.headers.get("x-forwarded-proto");

  if (host) {
    // Con varios proxies encadenados el encabezado puede traer una lista.
    const primero = host.split(",")[0].trim();
    const esquema = (protocolo ?? "").split(",")[0].trim() || (primero.startsWith("localhost") || primero.startsWith("127.") ? "http" : "https");
    return `${esquema}://${primero}`;
  }

  return new URL(req.url).origin;
}

/** La vuelta del diálogo, que es la que hay que registrar en Meta. */
export const laVuelta = (req: { headers: { get(n: string): string | null }; url: string }): string =>
  `${direccionPublica(req)}/api/meta/conectar/volver`;
