import "server-only";

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
): Promise<ResultadoEnvio> {
  const token = process.env.WHATSAPP_TOKEN;
  const numero = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !numero) {
    return { ok: false, waId: null, error: "WhatsApp no está configurado en el servidor." };
  }

  // Los huecos van todos juntos en el componente BODY, en el orden de {{1}},
  // {{2}}… Una plantilla sin huecos no lleva `components` en absoluto: mandarlo
  // vacío hace que Meta la rechace.
  const componentes =
    valores.length > 0
      ? [
          {
            type: "body",
            parameters: valores.map((v) => ({ type: "text", text: v })),
          },
        ]
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
