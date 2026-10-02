import "server-only";

import { getAdminClient } from "@/lib/supabase/admin";

/**
 * Con qué cuenta de Meta habla el CRM, y de dónde salen esas credenciales.
 *
 * ============================================================================
 * POR QUÉ ESTO TIENE QUE EXISTIR
 * ============================================================================
 *
 * Hasta ahora la respuesta estaba en las variables del servidor: un token de
 * Instagram, un id de Página, y listo. Eso alcanza mientras el CRM atienda UNA
 * sola cuenta —la de la escuela— y mientras conectarla sea algo que hace una
 * persona editando Netlify.
 *
 * Deja de alcanzar por dos motivos a la vez:
 *
 *   LA REVISIÓN DE META   Para aprobar `instagram_manage_messages`, Meta manda
 *                         a alguien a probar el producto, y ese revisor conecta
 *                         SU PROPIA cuenta de Instagram. Si el CRM sólo sabe
 *                         hablar con la cuenta que está en las variables, el
 *                         revisor conecta la suya, se escribe un mensaje, y el
 *                         CRM intenta contestarle con el token de la escuela.
 *                         Meta rechaza, y con razón: esa Página no es suya.
 *
 *   ROTAR UN TOKEN        Hoy cambiar un token es editar Netlify y volver a
 *                         desplegar. Con esto es apretar un botón.
 *
 * ============================================================================
 * CÓMO SE ELIGE LA CUENTA, QUE ES LA PARTE QUE IMPORTA
 * ============================================================================
 *
 * Por A QUIÉN LE ESCRIBIERON. Cada mensaje entrante de Meta trae `recipient.id`
 * —la cuenta nuestra que lo recibió— y eso ya se venía guardando en
 * `mensajes.payload` desde antes, sin que nadie lo usara. Así que la pregunta
 * «¿con qué token contesto este hilo?» se contesta con un dato que ya está.
 *
 * Elegir por canal, en cambio, estaría mal de una forma que no se nota hasta
 * que es tarde: mientras el revisor tuviera su cuenta conectada, TODAS las
 * respuestas de Instagram saldrían con su token, incluidas las de los clientes
 * de la escuela. Una conexión temporal de un desconocido no puede secuestrar la
 * operación.
 *
 * ============================================================================
 * LAS VARIABLES SIGUEN SIENDO EL PISO
 * ============================================================================
 *
 * Si no hay ninguna cuenta conectada que corresponda, se usan las variables del
 * servidor, exactamente como antes. Esto AGREGA una forma de conectar; no
 * reemplaza la que ya funciona. El día que se despliegue sin ninguna fila en la
 * tabla, el CRM se comporta igual que ayer.
 */

/** Los dos canales de Meta que se conectan por aquí. */
export type CanalConectable = "instagram" | "messenger";

/** El id que `canales` le da a cada uno. Es catálogo viejo y no se toca. */
const ID_DE_CANAL: Record<CanalConectable, number> = {
  instagram: 1,
  messenger: 10,
};

export interface Credencial {
  /** El token con el que se habla con Meta. NUNCA sale del servidor. */
  token: string;
  /** La Página, que es a quien Meta le reconoce la mensajería. */
  pageId: string;
  pageNombre: string | null;
  /** La cuenta de Instagram ligada, cuando la hay. */
  igId: string | null;
  /** De dónde salió: una conexión guardada o las variables del servidor. */
  origen: "conectada" | "variables";
}

/** Lo que se le puede mostrar a una pantalla: todo menos el token. */
export interface CredencialVisible {
  id: number;
  canal: CanalConectable;
  pageId: string;
  pageNombre: string | null;
  igId: string | null;
  igUsuario: string | null;
  activo: boolean;
  conectadaEn: string | null;
}

const texto = (v: unknown): string | null => {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? null : s;
};

/** Las variables del servidor, que son el piso de siempre. */
function deLasVariables(canal: CanalConectable): Credencial | null {
  /*
   * Las dos comparten token y Página a propósito.
   *
   * Con Facebook Login, la mensajería de Instagram sale por el token y el id de
   * la PÁGINA, no por los de Instagram. Por eso `INSTAGRAM_ACCOUNT_ID` guarda
   * un id de Página aunque el nombre diga otra cosa, y por eso Messenger se cae
   * a las mismas variables. Está explicado en `instagram/enviar.ts`.
   */
  const token =
    canal === "messenger"
      ? texto(process.env.MESSENGER_TOKEN) ?? texto(process.env.INSTAGRAM_TOKEN)
      : texto(process.env.INSTAGRAM_TOKEN);

  const pagina =
    canal === "messenger"
      ? texto(process.env.MESSENGER_PAGE_ID) ?? texto(process.env.INSTAGRAM_ACCOUNT_ID)
      : texto(process.env.INSTAGRAM_ACCOUNT_ID);

  if (!token || !pagina) return null;

  return { token, pageId: pagina, pageNombre: null, igId: null, origen: "variables" };
}

/**
 * Con qué credenciales se habla por este canal con esta cuenta nuestra.
 *
 * `cuentaId` es el `recipient.id` del mensaje entrante: la Página o la cuenta
 * de Instagram que lo recibió. Sin él —un hilo que abrimos nosotros, o uno
 * viejo sin payload— se usan las variables, que es lo que corresponde: lo que
 * abrimos nosotros salió de la cuenta de la escuela.
 *
 * Nunca lanza. Si la tabla no existe todavía, o la consulta falla, se contesta
 * con las variables: una conexión guardada es una mejora, y que falle no puede
 * dejar al CRM sin poder contestarle a nadie.
 */
export async function credencialDe(
  canal: CanalConectable,
  cuentaId?: string | null,
): Promise<Credencial | null> {
  const piso = deLasVariables(canal);
  const quien = texto(cuentaId);
  if (!quien) return piso;

  try {
    const admin = getAdminClient();
    if (!admin) return piso;

    /*
     * Se busca por los dos identificadores.
     *
     * Meta usa el de la Página para Messenger y, según por dónde entre, el de
     * la Página o el de Instagram para Instagram. Guardamos los dos al conectar
     * justamente para no tener que adivinar cuál manda.
     */
    const { data } = await admin
      .from("canal_credenciales")
      .select("page_id, page_nombre, ig_business_account_id, access_token")
      .eq("canal_id", ID_DE_CANAL[canal])
      .eq("activo", true)
      .or(`page_id.eq.${quien},ig_business_account_id.eq.${quien}`)
      .order("actualizado_en", { ascending: false })
      .limit(1)
      .maybeSingle();

    const token = texto(data?.access_token);
    const pageId = texto(data?.page_id);
    if (!token || !pageId) return piso;

    return {
      token,
      pageId,
      pageNombre: texto(data?.page_nombre),
      igId: texto(data?.ig_business_account_id),
      origen: "conectada",
    };
  } catch {
    return piso;
  }
}

/**
 * Qué cuenta nuestra recibió los mensajes de esta conversación.
 *
 * Sale de `mensajes.payload`, donde el webhook ya venía guardando la carga de
 * cada entrante. `recipient.id` es nuestro lado de la conversación.
 *
 * Se mira el entrante MÁS RECIENTE y no el primero: si una Página se reconecta
 * o se cambia, lo que vale para contestar hoy es por dónde entró lo último.
 */
export async function cuentaDeLaConversacion(
  conversacionId: number | null | undefined,
): Promise<string | null> {
  if (conversacionId == null) return null;

  try {
    const admin = getAdminClient();
    if (!admin) return null;

    const { data } = await admin
      .from("mensajes")
      .select("payload")
      .eq("conversacion_id", conversacionId)
      .eq("direccion", "entrante")
      .not("payload", "is", null)
      .order("creado_en", { ascending: false })
      .limit(1)
      .maybeSingle();

    const carga = (data?.payload ?? null) as Record<string, unknown> | null;
    const destinatario = (carga?.recipient ?? null) as Record<string, unknown> | null;
    return texto(destinatario?.id);
  } catch {
    return null;
  }
}

/** Guarda —o actualiza— una cuenta conectada. Devuelve si pudo. */
export async function guardarCredencial(datos: {
  canal: CanalConectable;
  pageId: string;
  pageNombre: string | null;
  igId: string | null;
  igUsuario: string | null;
  token: string;
  quien: string | null;
}): Promise<{ ok: boolean; error: string | null }> {
  const admin = getAdminClient();
  if (!admin) return { ok: false, error: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor." };

  const fila = {
    canal_id: ID_DE_CANAL[datos.canal],
    page_id: datos.pageId,
    page_nombre: datos.pageNombre,
    ig_business_account_id: datos.igId,
    access_token: datos.token,
    token_tipo: "page",
    activo: true,
    autorizado_por: datos.quien,
    actualizado_en: new Date().toISOString(),
  };

  /*
   * Conectar dos veces la misma Página ACTUALIZA, no duplica.
   *
   * Pasa siempre: alguien reconecta porque el token venció. Sin esto quedarían
   * dos filas activas para la misma cuenta y la de arriba sería cuestión de
   * suerte, que es la peor forma de elegir un token.
   */
  const { data: yaEsta } = await admin
    .from("canal_credenciales")
    .select("id")
    .eq("canal_id", fila.canal_id)
    .eq("page_id", datos.pageId)
    .limit(1)
    .maybeSingle();

  const { error } = yaEsta?.id
    ? await admin.from("canal_credenciales").update(fila).eq("id", Number(yaEsta.id))
    : await admin.from("canal_credenciales").insert(fila);

  return error ? { ok: false, error: error.message } : { ok: true, error: null };
}

/**
 * Las cuentas conectadas, SIN el token.
 *
 * Lo que se dibuja en pantalla no necesita el token y no puede tenerlo: viaja
 * al navegador y queda en la memoria de esa pestaña. Se seleccionan las
 * columnas una por una en vez de `*` para que agregar una columna secreta
 * mañana no la publique sola.
 */
export async function credencialesConectadas(): Promise<CredencialVisible[]> {
  try {
    const admin = getAdminClient();
    if (!admin) return [];

    const { data } = await admin
      .from("canal_credenciales")
      .select("id, canal_id, page_id, page_nombre, ig_business_account_id, activo, actualizado_en")
      .order("actualizado_en", { ascending: false });

    return ((data ?? []) as Record<string, unknown>[]).map((f) => ({
      id: Number(f.id),
      canal: Number(f.canal_id) === ID_DE_CANAL.messenger ? "messenger" : "instagram",
      pageId: String(f.page_id ?? ""),
      pageNombre: texto(f.page_nombre),
      igId: texto(f.ig_business_account_id),
      // El @usuario no tiene columna propia en esta tabla, que es anterior a
      // esto. Se muestra el id, y el nombre de la Página alcanza para reconocer
      // la cuenta.
      igUsuario: null,
      activo: f.activo !== false,
      conectadaEn: texto(f.actualizado_en),
    }));
  } catch {
    return [];
  }
}

/** Apaga una conexión sin borrarla, para no perder el registro de qué hubo. */
export async function desconectar(id: number): Promise<{ ok: boolean; error: string | null }> {
  const admin = getAdminClient();
  if (!admin) return { ok: false, error: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor." };

  const { error } = await admin
    .from("canal_credenciales")
    .update({ activo: false, actualizado_en: new Date().toISOString() })
    .eq("id", id);

  return error ? { ok: false, error: error.message } : { ok: true, error: null };
}
