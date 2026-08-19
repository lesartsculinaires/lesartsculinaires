import "server-only";

/**
 * Traer de Meta el archivo de un mensaje.
 *
 * Meta no manda el archivo en el webhook: manda un id. Con ese id se pide una
 * dirección temporal, y recién esa dirección devuelve los bytes —las dos
 * llamadas con el token, porque las dos son privadas.
 *
 * POR QUÉ SE BAJA APENAS LLEGA Y NO CUANDO ALGUIEN ABRE EL HILO
 *
 * Meta borra los archivos a los treinta días. Si se esperara a que alguien
 * mire la conversación, la captura de una transferencia de hace dos meses ya
 * no existiría, y es justo la que después hace falta para probar un pago.
 */

const VERSION = "v21.0";

/** Techo de tamaño, alineado con el del bucket de adjuntos. */
export const TOPE_BYTES = 15 * 1024 * 1024;

export interface ArchivoBajado {
  bytes: ArrayBuffer;
  mime: string;
}

export type ResultadoMedia =
  | { ok: true; archivo: ArchivoBajado }
  | { ok: false; error: string };

/**
 * Baja un archivo por su id.
 *
 * Nunca lanza: quien lo llama es el webhook, que tiene que contestarle 200 a
 * Meta pase lo que pase. Un archivo que no se pudo traer se reporta y el
 * mensaje se guarda igual, con su texto y su tipo.
 */
export async function bajarMedia(
  mediaId: string,
  senal?: AbortSignal,
): Promise<ResultadoMedia> {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) return { ok: false, error: "Falta WHATSAPP_TOKEN en el servidor." };

  try {
    const meta = await fetch(`https://graph.facebook.com/${VERSION}/${mediaId}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: senal,
    });

    if (!meta.ok) {
      return { ok: false, error: `Meta no dio la dirección del archivo (${meta.status}).` };
    }

    const datos = (await meta.json().catch(() => null)) as
      | { url?: string; mime_type?: string; file_size?: number }
      | null;

    const url = datos?.url;
    if (!url) return { ok: false, error: "Meta no devolvió una dirección." };

    // Se mira el tamaño antes de bajarlo: no tiene sentido traerse 80 MB de
    // video para descubrir después que no entra en el bucket.
    if (typeof datos.file_size === "number" && datos.file_size > TOPE_BYTES) {
      return { ok: false, error: `El archivo pesa más de ${TOPE_BYTES / 1024 / 1024} MB.` };
    }

    // La dirección es de un dominio de Meta y también pide el token.
    const archivo = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      signal: senal,
    });

    if (!archivo.ok) {
      return { ok: false, error: `No se pudo bajar el archivo (${archivo.status}).` };
    }

    const bytes = await archivo.arrayBuffer();
    if (bytes.byteLength > TOPE_BYTES) {
      return { ok: false, error: `El archivo pesa más de ${TOPE_BYTES / 1024 / 1024} MB.` };
    }

    return {
      ok: true,
      archivo: {
        bytes,
        mime:
          datos.mime_type ??
          archivo.headers.get("content-type") ??
          "application/octet-stream",
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
 * Va por conversación para que se pueda mirar lo de un contacto sin recorrer
 * todo, y el nombre lo pone el id de Meta, que ya es único y no viene del
 * cliente: un `filename` de un documento podría traer barras o `..` y salirse
 * de su carpeta.
 */
export function rutaMedia(conversacionId: number, mediaId: string, mime: string): string {
  return `wa/${conversacionId}/${mediaId}${extensionDe(mime)}`;
}

/** La extensión que le corresponde al tipo, para que se abra bien al bajarla. */
function extensionDe(mime: string): string {
  const tabla: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/3gpp": ".3gp",
    "audio/ogg": ".ogg",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/amr": ".amr",
    "application/pdf": ".pdf",
  };
  // El mime de Meta a veces trae parámetros: «audio/ogg; codecs=opus».
  return tabla[mime.split(";")[0].trim()] ?? "";
}
