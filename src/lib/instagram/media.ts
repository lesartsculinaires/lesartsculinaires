import "server-only";

import { TOPE_BYTES, type ResultadoMedia } from "@/lib/whatsapp/media";

/**
 * Traer el archivo de un mensaje de Instagram.
 *
 * ============================================================================
 * ES MÁS SIMPLE QUE EN WHATSAPP, Y MÁS URGENTE
 * ============================================================================
 *
 * En WhatsApp hay que hacer dos llamadas: con el id se pide una dirección y con
 * la dirección se piden los bytes, las dos con el token. En Instagram la
 * dirección ya viene en el webhook, así que es una sola llamada y SIN token:
 * la URL viene firmada.
 *
 * Lo que se gana en pasos se paga en plazo. La dirección de WhatsApp sirve
 * mientras el archivo exista, que son treinta días. La de Instagram viene
 * firmada con vencimiento corto —minutos— así que esto hay que llamarlo
 * mientras se atiende el webhook, no después. Guardar la URL en la base para
 * bajarla más tarde no funcionaría: para cuando alguien abriera el hilo, el
 * enlace ya estaría vencido y la foto sería un 403.
 *
 * ============================================================================
 * Y POR ESO NO LLEVA EL TOKEN
 * ============================================================================
 *
 * La firma va en la propia dirección. Mandarle además el token de la escuela a
 * un dominio que sale de una carga externa sería regalarle la credencial a
 * cualquiera que lograra colar una URL en el webhook. La firma del webhook hace
 * improbable que eso pase; no mandar el token hace que no importe si pasa.
 */

/** El techo es el mismo que el del bucket. Se reusa el de WhatsApp. */
export { TOPE_BYTES } from "@/lib/whatsapp/media";

/**
 * Baja el adjunto de la dirección que mandó Meta.
 *
 * Nunca lanza: quien lo llama es el webhook, que tiene que contestarle 200 a
 * Meta pase lo que pase. Un archivo que no se pudo traer se reporta y el
 * mensaje se guarda igual, diciendo por qué falta.
 */
export async function bajarAdjuntoIg(
  url: string,
  senal?: AbortSignal,
): Promise<ResultadoMedia> {
  try {
    const r = await fetch(url, { signal: senal });

    if (!r.ok) {
      return {
        ok: false,
        error:
          r.status === 403 || r.status === 401
            ? "El enlace del archivo ya venció. Instagram los firma por unos minutos."
            : `No se pudo bajar el archivo (${r.status}).`,
      };
    }

    /*
     * El tamaño, antes de traérselo si se puede.
     *
     * Un video de Instagram puede pesar decenas de megas y el webhook tiene
     * segundos para contestar. Cuando la cabecera viene, se corta acá sin
     * gastar la transferencia; cuando no viene, se comprueba después, que es lo
     * único que queda.
     */
    const declarado = Number(r.headers.get("content-length"));
    if (Number.isFinite(declarado) && declarado > TOPE_BYTES) {
      return { ok: false, error: `El archivo pesa más de ${TOPE_BYTES / 1024 / 1024} MB.` };
    }

    const bytes = await r.arrayBuffer();
    if (bytes.byteLength > TOPE_BYTES) {
      return { ok: false, error: `El archivo pesa más de ${TOPE_BYTES / 1024 / 1024} MB.` };
    }

    return {
      ok: true,
      archivo: {
        bytes,
        mime: r.headers.get("content-type")?.split(";")[0].trim() || "application/octet-stream",
      },
    };
  } catch (e) {
    const causa = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `No se pudo traer el archivo: ${causa}` };
  }
}

/**
 * Dónde se guarda dentro del bucket.
 *
 * Mismo bucket que WhatsApp pero otra carpeta —`ig/` en vez de `wa/`— para que
 * se pueda mirar, contar o limpiar lo de un canal sin tocar lo del otro.
 *
 * El nombre lo pone el `mid` de Meta, que ya es único y no viene del cliente.
 * Se le sacan los caracteres que no son de una ruta: un `mid` trae `=` y `_`
 * de base64, y aunque hoy no traiga barras, dejar que un valor externo arme una
 * ruta es cómo se sale de una carpeta.
 */
export function rutaMediaIg(conversacionId: number, mid: string, mime: string): string {
  const limpio = mid.replace(/[^A-Za-z0-9_-]/g, "") || String(Date.now());
  return `ig/${conversacionId}/${limpio}${extensionDe(mime)}`;
}

/** La extensión que le corresponde al tipo, para que se abra bien al bajarla. */
function extensionDe(mime: string): string {
  const tabla: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "audio/mp4": ".m4a",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "application/pdf": ".pdf",
  };
  return tabla[mime.split(";")[0].trim()] ?? "";
}
