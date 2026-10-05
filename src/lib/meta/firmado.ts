import "server-only";

import crypto from "node:crypto";

/**
 * El `signed_request` con el que Facebook firma sus avisos de cuenta.
 *
 * ============================================================================
 * NO ES LA MISMA FIRMA QUE LA DE LOS WEBHOOKS
 * ============================================================================
 *
 * Los webhooks de mensajes llegan con `x-hub-signature-256` en la cabecera.
 * Esto llega con un `signed_request` en el CUERPO, que es el formato viejo de
 * Facebook: dos trozos en base64url separados por un punto —la firma y el
 * contenido— y la firma es un HMAC del SEGUNDO TROZO TAL COMO VIENE, antes de
 * decodificarlo. Decodificar primero y firmar el JSON da otra cosa y no valida
 * nunca.
 *
 * Vive aparte de la ruta por dos razones: un archivo de ruta de Next sólo puede
 * exportar sus verbos —exportar otra cosa rompe la compilación—, y porque ésta
 * es la parte donde un error no se nota hasta que alguien lo aprovecha, así que
 * tiene que poder probarse sin levantar un servidor.
 */

/** base64url → Buffer, que es lo que usa Facebook en `signed_request`. */
const deBase64Url = (s: string): Buffer => Buffer.from(s, "base64url");

export interface Firmado {
  ok: boolean;
  userId: string | null;
  error: string | null;
}

/**
 * Abre el `signed_request` y comprueba que lo firmó quien dice.
 *
 * Exportada para poder probarla sin levantar un servidor: es la parte donde un
 * error no se nota hasta que alguien lo aprovecha.
 */
export function leerFirmado(crudo: string | null, secreto: string | undefined): Firmado {
  if (!secreto) return { ok: false, userId: null, error: "falta el App Secret en el servidor" };
  if (!crudo) return { ok: false, userId: null, error: "llegó sin signed_request" };

  const partes = crudo.split(".");
  if (partes.length !== 2) return { ok: false, userId: null, error: "signed_request mal formado" };

  const [firma, contenido] = partes;

  const esperada = crypto.createHmac("sha256", secreto).update(contenido).digest();
  const vino = deBase64Url(firma);

  /*
   * Comparación de tiempo constante.
   *
   * Con `===` el tiempo que tarda en contestar depende de cuántos bytes
   * coincidieron, y eso deja adivinar la firma byte por byte. La comprobación
   * de longitud va antes porque `timingSafeEqual` lanza si no coinciden.
   */
  if (vino.length !== esperada.length || !crypto.timingSafeEqual(vino, esperada)) {
    return { ok: false, userId: null, error: "firma inválida" };
  }

  try {
    const datos = JSON.parse(deBase64Url(contenido).toString("utf8")) as Record<string, unknown>;
    const userId = datos.user_id == null ? null : String(datos.user_id).trim();
    if (!userId) return { ok: false, userId: null, error: "el contenido no trae user_id" };
    return { ok: true, userId, error: null };
  } catch {
    return { ok: false, userId: null, error: "el contenido no es JSON" };
  }
}
