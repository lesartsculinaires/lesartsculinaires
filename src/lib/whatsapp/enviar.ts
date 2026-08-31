import "server-only";

import { componentesDe } from "@/lib/whatsapp/huecos";

import {
  TOPE_DOCUMENTO_BYTES,
  esDocumentoAceptado,
  tiposQueSePueden,
} from "@/lib/whatsapp/adjuntos";

/**
 * Envío por la API de Meta.
 *
 * El token vive sólo acá, en el servidor, y sin el prefijo `NEXT_PUBLIC_`: si
 * llegara al navegador, cualquiera que abriera el inspector podría mandar
 * mensajes desde el número de la escuela.
 */

const VERSION = "v21.0";

export interface ResultadoEnvio {
  ok: boolean;
  /** Id que le puso Meta al mensaje; sirve para seguirle el estado. */
  waId: string | null;
  error: string | null;
}

export const hayWhatsapp = (): boolean =>
  Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

export async function enviarTexto(
  telefono: string,
  texto: string,
): Promise<ResultadoEnvio> {
  const token = process.env.WHATSAPP_TOKEN;
  const numero = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !numero) {
    return { ok: false, waId: null, error: "WhatsApp no está configurado en el servidor." };
  }

  try {
    const r = await fetch(`https://graph.facebook.com/${VERSION}/${numero}/messages`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: telefono,
        type: "text",
        text: { preview_url: false, body: texto },
      }),
    });

    const cuerpo = (await r.json().catch(() => null)) as
      | { messages?: { id?: string }[]; error?: { message?: string; code?: number } }
      | null;

    if (!r.ok) {
      return { ok: false, waId: null, error: explicar(cuerpo?.error, r.status) };
    }

    return { ok: true, waId: cuerpo?.messages?.[0]?.id ?? null, error: null };
  } catch (e) {
    return {
      ok: false,
      waId: null,
      error: e instanceof Error ? e.message : "No se pudo contactar a WhatsApp.",
    };
  }
}

/**
 * Tope de Meta para una imagen. No es el nuestro: es el de ellos, y mandarles
 * algo más grande falla del otro lado.
 */
export const TOPE_IMAGEN_BYTES = 5 * 1024 * 1024;

/**
 * Manda un documento: un PDF, una planilla, una presentación.
 *
 * ------------------------------------------------------------------------
 * POR QUÉ UN ENLACE Y NO EL ARCHIVO
 * ------------------------------------------------------------------------
 *
 * Meta acepta las dos formas: subirle los bytes y quedarse con un id, o darle
 * una dirección y que él la busque. Antes se le subían los bytes, y eso
 * obligaba a que el archivo entero pasara por el servidor: entraba por la
 * petición, se guardaba en memoria y salía otra vez para Meta. Con 4 MB
 * andaba; con veinte o más no, porque la función tiene diez segundos para
 * contestar y decenas de megas de ida y vuelta no entran siempre en diez.
 *
 * Con el enlace el servidor no toca los bytes ni una vez. Le pasa a Meta una
 * dirección firmada del bucket y Meta la busca por su cuenta, así que mandar
 * veinte megas le cuesta lo mismo que mandar veinte kilos.
 *
 * Lo que se paga: durante los minutos que dura la firma, cualquiera que tenga
 * esa dirección puede bajar el archivo. Es una cadena larga e imposible de
 * adivinar, caduca sola y esto es lo que nosotros le mandamos al cliente —una
 * lista de precios, un temario—, no lo que el cliente nos manda a nosotros.
 * Los comprobantes que llegan siguen sin ser accesibles desde afuera.
 *
 * ------------------------------------------------------------------------
 *
 * `filename` es lo que distingue esto de una foto: sin eso el cliente recibe
 * la lista de precios llamada «document.pdf», que en su teléfono no se
 * distingue de nada.
 */
export async function enviarDocumento(
  telefono: string,
  archivo: { enlace: string; mime: string; nombre: string; bytes: number },
  pie: string,
): Promise<ResultadoEnvio> {
  if (!esDocumentoAceptado(archivo.mime)) {
    return {
      ok: false,
      waId: null,
      error: `WhatsApp no acepta este tipo de archivo. Se pueden mandar ${tiposQueSePueden()}.`,
    };
  }

  if (archivo.bytes > TOPE_DOCUMENTO_BYTES) {
    return {
      ok: false,
      waId: null,
      error:
        `El archivo pesa más de ${TOPE_DOCUMENTO_BYTES / 1024 / 1024} MB, que es el tope. ` +
        "Mandá una versión más liviana o pasale un enlace de descarga.",
    };
  }

  return mandar(telefono, {
    type: "document",
    document: {
      link: archivo.enlace,
      filename: archivo.nombre,
      ...(pie.trim() ? { caption: pie.trim() } : {}),
    },
  });
}

/**
 * Manda una foto.
 *
 * Mismo camino que el documento —un enlace firmado, no los bytes— con dos
 * diferencias: el tope es el de Meta para imágenes, más bajo que el de
 * documentos, y no lleva `filename`, que en una foto Meta rechaza.
 */
export async function enviarImagen(
  telefono: string,
  archivo: { enlace: string; mime: string; nombre: string; bytes: number },
  pie: string,
): Promise<ResultadoEnvio> {
  if (archivo.bytes > TOPE_IMAGEN_BYTES) {
    return {
      ok: false,
      waId: null,
      error: `WhatsApp no acepta imágenes de más de ${TOPE_IMAGEN_BYTES / 1024 / 1024} MB.`,
    };
  }

  return mandar(telefono, {
    type: "image",
    image: pie.trim()
      ? { link: archivo.enlace, caption: pie.trim() }
      : { link: archivo.enlace },
  });
}

/**
 * Le pasa a Meta un mensaje ya armado.
 *
 * Una sola llamada: antes eran dos —subir y después mandar— y el paso de subir
 * se fue con el cambio al enlace. Lo comparten la foto, el documento y
 * cualquier cosa que se agregue mañana; lo único que cada uno pone es su
 * pedazo del cuerpo.
 */
async function mandar(
  telefono: string,
  cuerpoDelMensaje: Record<string, unknown>,
): Promise<ResultadoEnvio> {
  const token = process.env.WHATSAPP_TOKEN;
  const numero = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !numero) {
    return { ok: false, waId: null, error: "WhatsApp no está configurado en el servidor." };
  }

  try {
    const r = await fetch(`https://graph.facebook.com/${VERSION}/${numero}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: telefono,
        ...cuerpoDelMensaje,
      }),
    });

    const cuerpo = (await r.json().catch(() => null)) as
      | { messages?: { id?: string }[]; error?: { message?: string; code?: number } }
      | null;

    if (!r.ok) return { ok: false, waId: null, error: explicar(cuerpo?.error, r.status) };

    return { ok: true, waId: cuerpo?.messages?.[0]?.id ?? null, error: null };
  } catch (e) {
    return {
      ok: false,
      waId: null,
      error: e instanceof Error ? e.message : "No se pudo contactar a WhatsApp.",
    };
  }
}

/**
 * Manda una plantilla aprobada.
 *
 * Es la única forma de escribirle a alguien cuando pasaron 24 horas desde su
 * último mensaje. Va aparte de `enviarTexto` porque el cuerpo que espera Meta
 * es otro: no se manda el texto sino el nombre de la plantilla, su idioma y
 * los valores que van en los huecos, en orden.
 */
export async function enviarPlantilla(
  telefono: string,
  nombre: string,
  idioma: string,
  valores: string[],
  /**
   * El cuerpo de la plantilla, para saber cómo marca sus huecos.
   *
   * Hace falta porque el formato de los parámetros depende de eso y no hay
   * otra manera de averiguarlo: `{{1}}` va como lista, `{{order_id}}` va con
   * el nombre al lado. Sin el cuerpo se cae a lo posicional, que es lo que
   * hacía antes.
   */
  cuerpo?: string | null,
): Promise<ResultadoEnvio> {
  const token = process.env.WHATSAPP_TOKEN;
  const numero = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !numero) {
    return { ok: false, waId: null, error: "WhatsApp no está configurado en el servidor." };
  }

  /*
   * Los huecos, con el formato que use ESTA plantilla.
   *
   * Antes se armaban acá a mano, siempre como lista posicional. Con una
   * plantilla que usa nombres —`{{order_id}}`, que es la que tiene cargada la
   * escuela— eso llegaba mal a Meta y el envío se rechazaba. Ahora lo decide
   * `componentesDe` mirando el cuerpo, que es el único lugar donde se sabe.
   *
   * `cuerpo` puede venir nulo cuando la plantilla se guardó antes de que se
   * sincronizara el texto; ahí se cae a lo de antes, que es lo que había.
   */
  const componentes = cuerpo
    ? componentesDe(cuerpo, valores)
    : valores.length > 0
      ? [{ type: "body", parameters: valores.map((v) => ({ type: "text", text: v })) }]
      : undefined;

  try {
    const r = await fetch(`https://graph.facebook.com/${VERSION}/${numero}/messages`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: telefono,
        type: "template",
        template: {
          name: nombre,
          language: { code: idioma },
          ...(componentes ? { components: componentes } : {}),
        },
      }),
    });

    const cuerpo = (await r.json().catch(() => null)) as
      | { messages?: { id?: string }[]; error?: { message?: string; code?: number } }
      | null;

    if (!r.ok) return { ok: false, waId: null, error: explicar(cuerpo?.error, r.status) };

    return { ok: true, waId: cuerpo?.messages?.[0]?.id ?? null, error: null };
  } catch (e) {
    return {
      ok: false,
      waId: null,
      error: e instanceof Error ? e.message : "No se pudo contactar a WhatsApp.",
    };
  }
}

/**
 * Traduce el error de Meta a algo accionable.
 *
 * El 131047 es el que más va a aparecer y el más confuso si se muestra crudo:
 * WhatsApp sólo deja escribir libremente durante 24 horas desde el último
 * mensaje de la persona. Pasado ese plazo hay que usar una plantilla
 * aprobada, y el mensaje de Meta no lo dice con esas palabras.
 */
function explicar(error: { message?: string; code?: number } | undefined, estado: number): string {
  if (error?.code === 131047) {
    return "Pasaron más de 24 horas desde el último mensaje de esta persona. WhatsApp ya no deja escribirle libremente; hay que esperar a que escriba o usar una plantilla aprobada.";
  }
  if (error?.code === 190 || estado === 401) {
    return "El token de WhatsApp venció o es inválido. Hay que renovarlo en Meta.";
  }
  if (error?.code === 131026) {
    return "Ese número no tiene WhatsApp o no puede recibir mensajes.";
  }
  // 132000/132001: la plantilla no existe con ese nombre e idioma, o los
  // valores que se mandaron no son los que espera.
  if (error?.code === 132001) {
    return "Meta no encuentra esa plantilla en ese idioma. Puede que la hayan borrado o cambiado; probá sincronizar.";
  }
  if (error?.code === 132000) {
    return "La plantilla espera otra cantidad de datos. Sincronizá las plantillas y volvé a intentar.";
  }
  return error?.message ?? `WhatsApp respondió con error ${estado}.`;
}
