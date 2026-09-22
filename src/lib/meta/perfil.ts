/**
 * El perfil de quien escribe por Instagram o por Messenger, y por qué a veces
 * no se puede averiguar.
 *
 * ============================================================================
 * POR QUÉ ESTE ARCHIVO EXISTE
 * ============================================================================
 *
 * En WhatsApp el nombre viene DENTRO del webhook. En Instagram y en Messenger
 * no viene nada: la carga trae el identificador de la persona y el texto. El
 * nombre hay que ir a pedirlo a Meta en una consulta aparte, y esa consulta
 * puede fallar por motivos que no tienen nada que ver con el mensaje —falta de
 * permisos, revisión de Meta sin aprobar, token vencido—.
 *
 * Durante un tiempo eso se resolvió devolviendo `null` y siguiendo. Está bien
 * que siga —el mensaje vale más que el nombre—, pero callarse POR QUÉ falló
 * dejó a la escuela mirando hilos titulados con diecisiete dígitos sin ninguna
 * forma de saber si era un problema de Meta, del token o del CRM.
 *
 * Así que ahora el motivo viaja junto al perfil: se registra en el servidor y
 * se puede mostrar en pantalla cuando alguien pregunta «¿y por qué sale el
 * número?». Un `motivo` no vacío significa exactamente eso: se preguntó y Meta
 * dijo que no.
 */

/** Lo que se sabe de una persona de Instagram o Messenger. */
export interface PerfilMeta {
  /** Su nombre visible, si Meta lo entrega. */
  nombre: string | null;
  /** Su @usuario. Messenger no lo entrega nunca y acá va `null`. */
  usuario: string | null;
  /**
   * Por qué no se pudo averiguar, en una línea que se le puede mostrar a
   * alguien que no es programador. `null` cuando la consulta salió bien, aunque
   * haya venido vacía.
   */
  motivo: string | null;
}

/** Un perfil vacío con su explicación. */
export const sinPerfil = (motivo: string | null): PerfilMeta => ({
  nombre: null,
  usuario: null,
  motivo,
});

/** Texto que no sirve como nombre: vacío, espacios, o directamente no es texto. */
export const limpio = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

/**
 * Traduce el error de Meta a una línea que explique qué hacer.
 *
 * ----------------------------------------------------------------------------
 * POR QUÉ SE TRADUCE Y NO SE MUESTRA CRUDO
 * ----------------------------------------------------------------------------
 *
 * Porque el crudo es «(#10) Application does not have permission for this
 * action», que le dice a quien lo lee que algo falló pero no que hay un trámite
 * pendiente en Meta y que no es culpa suya ni del CRM.
 *
 * Los códigos son los mismos que ya traduce el envío —ver `instagram/enviar.ts`,
 * `porQueFallo`—, pero el desenlace es otro: acá no se perdió un mensaje, sólo
 * un nombre, y la recomendación es distinta.
 *
 * El mensaje crudo se conserva al final. Cuando el código no es ninguno de los
 * conocidos, es lo único que hay para buscar.
 */
export function motivoDelPerfil(
  canal: string,
  estado: number,
  cuerpo: { error?: { code?: number; error_subcode?: number; message?: string } } | null,
): string {
  const error = cuerpo?.error;
  const crudo = limpio(error?.message);

  if (error?.code === 190) {
    return (
      `El token de ${canal} no sirve para consultar perfiles: está vencido o es de otra cuenta. ` +
      (crudo ?? "")
    ).trim();
  }

  if (error?.code === 10 || error?.code === 200 || error?.code === 3 || estado === 403) {
    return (
      `Meta todavía no le permite a la aplicación leer el nombre de quien escribe por ${canal}. ` +
      "Es el mismo permiso que falta para contestar: hasta que la aplicación pase a modo Live " +
      "con Acceso Avanzado, los hilos entran sin nombre. " +
      (crudo ?? "")
    ).trim();
  }

  if (error?.code === 100) {
    return (
      `Meta no reconoce a esa persona como alguien que le escribió a esta cuenta de ${canal}. ` +
      (crudo ?? "")
    ).trim();
  }

  return crudo ?? `${canal} respondió con error ${estado} al preguntar por el perfil.`;
}

/**
 * El nombre, buscándolo por la CONVERSACIÓN en vez de por la persona.
 *
 * ============================================================================
 * POR QUÉ HACE FALTA UN SEGUNDO CAMINO
 * ============================================================================
 *
 * El camino normal es preguntarle a Meta por la persona: `GET /{id}?fields=name`.
 * En Instagram eso funciona. En Messenger NO, y no por un permiso que se pueda
 * pedir: la Graph API contesta
 *
 *     (#100, subcódigo 33) Object with ID '…' does not exist, cannot be loaded
 *     due to missing permissions, or does not support this operation
 *
 * para un PSID que está escribiéndole a la Página en este mismo momento. El PSID
 * no es un objeto que se pueda leer suelto: sólo existe DENTRO de la
 * conversación con esa Página.
 *
 * Y por esa puerta el nombre sí se puede leer. Medido contra la Página de la
 * escuela el 22 de septiembre de 2026, con el mismo token que ya usa el CRM:
 *
 *     GET /{pagina}/conversations?platform=messenger
 *         &user_id={psid}&fields=participants
 *     → {"data":[{"participants":{"data":[
 *          {"name":"…","id":"{psid}"},
 *          {"name":"Les Arts Culinaires","id":"{pagina}"}]}}]}
 *
 * Una llamada, una conversación, el nombre adentro. Es lo que convierte los
 * hilos titulados con diecisiete dígitos en hilos con el nombre de la persona.
 *
 * ----------------------------------------------------------------------------
 * POR QUÉ SE FILTRA POR `id` Y NO SE DESCARTA «EL OTRO»
 * ----------------------------------------------------------------------------
 *
 * Porque quién es «el otro» cambia según la plataforma: en Messenger el
 * participante que no es la persona es la PÁGINA, y en Instagram es la CUENTA DE
 * INSTAGRAM, que es otro identificador. Buscar el que coincide con quien
 * escribió no depende de eso y no se puede equivocar de persona.
 */
export async function perfilPorConversacion(
  canal: string,
  base: string,
  token: string,
  pagina: string,
  plataforma: "messenger" | "instagram",
  quien: string,
): Promise<PerfilMeta> {
  const url =
    `${base}/${pagina}/conversations?platform=${plataforma}` +
    `&user_id=${encodeURIComponent(quien)}&fields=participants`;

  const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });

  const cuerpo = (await r.json().catch(() => null)) as {
    data?: { participants?: { data?: { id?: string; name?: string; username?: string }[] } }[];
    error?: { code?: number; message?: string };
  } | null;

  if (!r.ok) return sinPerfil(motivoDelPerfil(canal, r.status, cuerpo));

  const participantes = (cuerpo?.data ?? []).flatMap((c) => c.participants?.data ?? []);
  const suyo = participantes.find((p) => String(p?.id ?? "") === quien);

  if (!suyo) {
    /*
     * Sin conversación no hay nada que decir, y no es un error.
     *
     * Pasa cuando el hilo se borró del lado de Meta, y pasa también con los ecos
     * de un mensaje que mandó la escuela antes de que la persona contestara. El
     * mensaje ya está guardado; lo único que falta es el nombre.
     */
    return sinPerfil(null);
  }

  return { nombre: limpio(suyo.name), usuario: limpio(suyo.username), motivo: null };
}
