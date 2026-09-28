import "server-only";

import { baseDeGraph, VERSION_DE_GRAPH } from "@/lib/whatsapp/enviar";

/**
 * Subirle la imagen A Meta, en vez de pedirle que la vaya a buscar.
 *
 * ============================================================================
 * POR QUÉ SE DIO VUELTA EL CAMINO
 * ============================================================================
 *
 * Una plantilla con encabezado de imagen se puede mandar de dos maneras:
 *
 *   CON UNA DIRECCIÓN   `image: { link: "https://…" }`. Meta acepta el mensaje
 *                       y DESPUÉS va a bajar la imagen. Si no puede, el mensaje
 *                       ya salió y muere en el camino: en el hilo queda «No se
 *                       pudo entregar · Media upload error», que es lo que le
 *                       pasó a la escuela.
 *
 *   CON UN IDENTIFICADOR `image: { id: "…" }`. La imagen se le sube a Meta
 *                       ANTES, y el envío ya no depende de que Meta pueda
 *                       alcanzar ningún servidor.
 *
 * Se probaron las dos. Con dirección falló aun usando la imagen que Meta tenía
 * aprobada de esa misma plantilla: su propia dirección de CDN no la vuelve a
 * bajar. Y ahí se ve el problema de fondo del primer camino: que funcione
 * depende de algo que no controlamos —si Meta alcanza o no una dirección— y
 * cuando falla, falla tarde y en silencio.
 *
 * Por eso ahora siempre se sube primero. Cuesta una llamada de más por envío y
 * a cambio el fallo, si lo hay, pasa ANTES de mandarle nada a nadie y se puede
 * explicar.
 *
 * ============================================================================
 * CUÁNTO DURA
 * ============================================================================
 *
 * Meta guarda lo subido 30 días. No se guarda el identificador de una vez para
 * siempre: se sube en cada envío —una vez por tanda en el masivo, no una por
 * destinatario— y así no hay que llevar la cuenta de cuál venció.
 */

/** Lo que Meta acepta en el encabezado de una plantilla. */
const IMAGENES = ["image/jpeg", "image/png"];

/** El tope de Meta para la imagen de un encabezado. */
export const TOPE_ENCABEZADO_BYTES = 5 * 1024 * 1024;

export type Subida = { ok: true; id: string } | { ok: false; error: string };

/**
 * Sube una imagen y devuelve el identificador con que Meta la conoce.
 *
 * Nunca lanza: quien la llama está a punto de mandarle algo a un cliente y
 * necesita poder contarle a quien atiende qué pasó, no cortar con una
 * excepción.
 */
export async function subirImagenAMeta(bytes: ArrayBuffer, mime: string): Promise<Subida> {
  const token = process.env.WHATSAPP_TOKEN;
  const numero = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !numero) {
    return { ok: false, error: "WhatsApp no está configurado en el servidor." };
  }

  const tipo = IMAGENES.includes(mime) ? mime : "image/jpeg";

  if (bytes.byteLength === 0) {
    return { ok: false, error: "La imagen del encabezado llegó vacía." };
  }
  if (bytes.byteLength > TOPE_ENCABEZADO_BYTES) {
    const megas = (bytes.byteLength / 1024 / 1024).toFixed(1);
    return {
      ok: false,
      error: `La imagen del encabezado pesa ${megas} MB y Meta acepta hasta 5.`,
    };
  }

  /*
   * `messaging_product` va en el cuerpo y no es opcional: sin él Meta contesta
   * un error que habla de un parámetro que falta y no dice cuál.
   *
   * El nombre del archivo da igual —Meta no se lo muestra a nadie— pero tiene
   * que estar: sin nombre, algunos servidores no arman bien la parte del
   * formulario y el archivo llega vacío.
   */
  const formulario = new FormData();
  formulario.append("messaging_product", "whatsapp");
  formulario.append("type", tipo);
  formulario.append(
    "file",
    new Blob([bytes], { type: tipo }),
    tipo === "image/png" ? "encabezado.png" : "encabezado.jpg",
  );

  try {
    const r = await fetch(`${baseDeGraph()}/${VERSION_DE_GRAPH}/${numero}/media`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: formulario,
    });

    const cuerpo = (await r.json().catch(() => null)) as
      | { id?: string; error?: { message?: string; code?: number } }
      | null;

    if (!r.ok || !cuerpo?.id) {
      const dice = cuerpo?.error?.message ?? `Meta contestó ${r.status}`;
      return { ok: false, error: `No se pudo subirle la imagen a Meta: ${dice}` };
    }

    return { ok: true, id: cuerpo.id };
  } catch (e) {
    return {
      ok: false,
      error: `No se pudo subirle la imagen a Meta: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
