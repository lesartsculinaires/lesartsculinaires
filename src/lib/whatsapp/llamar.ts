import "server-only";

/**
 * Llamadas por la API de Meta.
 *
 * ============================================================================
 * QUÉ PASA POR ACÁ Y QUÉ NO
 * ============================================================================
 *
 * El audio NO. Meta habla WebRTC: la voz va del navegador de quien atiende a
 * Meta, y de Meta al teléfono del cliente, directo. Este archivo sólo pasa
 * papelitos —el SDP, con el que las dos puntas se ponen de acuerdo— y órdenes:
 * contestar, rechazar, colgar, marcar.
 *
 * Eso es lo que hace que la cosa sea posible en Netlify. Una función serverless
 * tiene diez segundos y no puede sostener un flujo de audio de cinco minutos;
 * pasar un texto de dos kilobytes y colgar, sí.
 *
 * ============================================================================
 * EL TOKEN VIVE ACÁ Y NADA MÁS
 * ============================================================================
 *
 * Sin prefijo `NEXT_PUBLIC_`, igual que en `enviar.ts`. Si llegara al
 * navegador, cualquiera que abriera el inspector podría llamar desde el número
 * de la escuela.
 */

/*
 * Más nueva que la de `enviar.ts`, a propósito.
 *
 * Las llamadas no existen en las versiones viejas de la API: contra la v21 el
 * endpoint `/calls` devuelve «unknown path». Los mensajes se quedan donde
 * están porque ahí no hace falta nada nuevo, y subir la versión de todo de
 * golpe sería cambiar el camino por el que hoy pasa la operación entera para
 * estrenar una función que todavía no se probó con un cliente real.
 */
const VERSION = "v23.0";

export interface ResultadoLlamada {
  ok: boolean;
  /** El id que le puso Meta. Sólo viene al marcar; en lo demás ya lo teníamos. */
  callId: string | null;
  error: string | null;
}

export const hayLlamadas = (): boolean =>
  Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

/**
 * Le manda una orden a Meta sobre una llamada.
 *
 * Todas las órdenes van al mismo sitio y cambian sólo en el `action`, así que
 * hay una sola función y no cinco casi iguales.
 *
 * ----------------------------------------------------------------------------
 * EL PLAZO
 * ----------------------------------------------------------------------------
 *
 * Desde que Meta avisa que entró una llamada hay entre 30 y 60 segundos para
 * contestarla. Ese presupuesto se gasta casi entero antes de llegar acá —el
 * webhook, la fila, el websocket, la persona decidiendo—, así que esta llamada
 * lleva un corte propio y corto: si Meta no contesta en cinco segundos, la
 * respuesta ya no va a servir de nada y es mejor decir que falló que dejar a
 * alguien con el teléfono en la oreja esperando.
 */
async function ordenar(
  cuerpo: Record<string, unknown>,
  queEs: string,
): Promise<ResultadoLlamada> {
  const token = process.env.WHATSAPP_TOKEN;
  const numero = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !numero) {
    return {
      ok: false,
      callId: null,
      error: "Las llamadas de WhatsApp no están configuradas en el servidor.",
    };
  }

  try {
    const r = await fetch(`https://graph.facebook.com/${VERSION}/${numero}/calls`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", ...cuerpo }),
      signal: AbortSignal.timeout(SEGUNDOS_DE_ESPERA * 1000),
    });

    const respuesta = (await r.json().catch(() => null)) as
      | { calls?: { id?: string }[]; error?: { message?: string; code?: number } }
      | null;

    if (!r.ok) {
      return { ok: false, callId: null, error: explicar(respuesta?.error, r.status) };
    }

    return { ok: true, callId: respuesta?.calls?.[0]?.id ?? null, error: null };
  } catch (e) {
    // Un corte por tiempo se ve igual que la red caída, y para quien está
    // esperando son lo mismo: la llamada no salió.
    const porTiempo = e instanceof Error && e.name === "TimeoutError";
    return {
      ok: false,
      callId: null,
      error: porTiempo
        ? `WhatsApp no respondió a tiempo al ${queEs}.`
        : e instanceof Error
          ? e.message
          : "No se pudo contactar a WhatsApp.",
    };
  }
}

/** Ver el comentario de `ordenar`. */
const SEGUNDOS_DE_ESPERA = 5;

/**
 * Contesta una llamada entrante.
 *
 * `sdp` es la respuesta que armó el navegador después de pedir el micrófono.
 * Sin ella no hay por dónde mandar el audio, así que Meta rechaza la orden.
 */
export const contestar = (callId: string, sdp: string): Promise<ResultadoLlamada> =>
  ordenar(
    { call_id: callId, action: "accept", session: { sdp_type: "answer", sdp } },
    "contestar",
  );

/**
 * Avisa que la vamos a atender, antes de atenderla.
 *
 * Le da a Meta la respuesta de audio unos instantes antes que el «accept», así
 * el camino de la voz ya está armado cuando la persona termina de apretar y no
 * se pierden las dos primeras palabras del cliente.
 *
 * Es opcional: si falla, se sigue igual con `contestar`. No vale gastar el
 * plazo reintentando algo que sólo mejora los primeros segundos.
 */
export const avisarQueSeAtiende = (callId: string, sdp: string): Promise<ResultadoLlamada> =>
  ordenar(
    { call_id: callId, action: "pre_accept", session: { sdp_type: "answer", sdp } },
    "preparar",
  );

/** Rechaza una llamada que está sonando. El cliente ve que no la atendimos. */
export const rechazar = (callId: string): Promise<ResultadoLlamada> =>
  ordenar({ call_id: callId, action: "reject" }, "rechazar");

/** Cuelga una que está en curso, o una que marcamos y todavía suena. */
export const colgar = (callId: string): Promise<ResultadoLlamada> =>
  ordenar({ call_id: callId, action: "terminate" }, "colgar");

/**
 * Marca a un cliente.
 *
 * ----------------------------------------------------------------------------
 * NO SE PUEDE LLAMAR A CUALQUIERA
 * ----------------------------------------------------------------------------
 *
 * WhatsApp exige que el cliente haya dado permiso antes. No es una formalidad:
 * sin permiso Meta rechaza la orden y no suena nada del otro lado. El permiso
 * se pide con `pedirPermisoParaLlamar`, que le manda al cliente un mensaje con
 * un botón, y dura lo que Meta diga.
 *
 * Por eso el error de permiso se explica con todas las letras más abajo, en vez
 * de mostrar el texto en inglés de Meta: es el que va a aparecer más seguido y
 * el que tiene un arreglo concreto.
 */
export const marcar = (telefono: string, sdp: string): Promise<ResultadoLlamada> =>
  ordenar(
    { to: telefono, action: "connect", session: { sdp_type: "offer", sdp } },
    "llamar",
  );

/**
 * Le pide al cliente permiso para llamarlo.
 *
 * Va por la puerta de los mensajes, no por la de las llamadas: para Meta es un
 * mensaje interactivo con un botón, y le llega al cliente como cualquier otro.
 * Eso quiere decir que se le aplica la ventana de 24 horas igual que a un
 * mensaje de texto, y de ahí el error que devuelve si hace mucho que no
 * escribe.
 */
export async function pedirPermisoParaLlamar(telefono: string): Promise<ResultadoLlamada> {
  const token = process.env.WHATSAPP_TOKEN;
  const numero = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !numero) {
    return { ok: false, callId: null, error: "WhatsApp no está configurado en el servidor." };
  }

  try {
    const r = await fetch(`https://graph.facebook.com/${VERSION}/${numero}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: telefono,
        type: "interactive",
        interactive: {
          type: "call_permission_request",
          /*
           * `action` es obligatorio y va vacío salvo el nombre.
           *
           * No sobra: sin él Meta rechaza el mensaje entero con
           * «violated JSON schema constraint 'required' for the JSON field
           * 'interactive' [...] missing: 'action'», y el error no dice cuál
           * de todos los campos falta. Lo descubrió la escuela apretando el
           * botón con un cliente real del otro lado.
           *
           * Repite el mismo texto que `type` porque así lo pide el esquema de
           * Meta para este tipo de mensaje interactivo; no es un error de
           * copiado.
           */
          action: { name: "call_permission_request" },
          body: {
            text:
              "Para poder explicarte el programa por llamada necesitamos tu permiso. " +
              "Si lo aceptás, te llamamos desde este mismo WhatsApp.",
          },
        },
      }),
      signal: AbortSignal.timeout(SEGUNDOS_DE_ESPERA * 1000),
    });

    const respuesta = (await r.json().catch(() => null)) as
      | { error?: { message?: string; code?: number } }
      | null;

    if (!r.ok) return { ok: false, callId: null, error: explicar(respuesta?.error, r.status) };
    return { ok: true, callId: null, error: null };
  } catch (e) {
    return {
      ok: false,
      callId: null,
      error: e instanceof Error ? e.message : "No se pudo contactar a WhatsApp.",
    };
  }
}

/**
 * Traduce el error de Meta a algo accionable.
 *
 * ----------------------------------------------------------------------------
 * POR QUÉ CASI TODO SE MIRA POR TEXTO Y NO POR CÓDIGO
 * ----------------------------------------------------------------------------
 *
 * Los códigos de los mensajes están documentados y se usan tal cual en
 * `enviar.ts`. Los de llamadas son nuevos y no los tengo comprobados contra el
 * número de la escuela, y un código mal mapeado es peor que ninguno: haría que
 * el CRM explicara con seguridad algo que no es, y quien lo lea va a buscar el
 * arreglo donde no está.
 *
 * Así que se traducen sólo los dos que sí están comprobados —el token vencido y
 * el número sin WhatsApp, que son los mismos de siempre— y el del permiso, que
 * se reconoce por el texto y es el que más va a aparecer. Lo demás pasa tal
 * como lo dice Meta, en su idioma, que es honesto: no sabemos más que eso.
 */
function explicar(
  error: { message?: string; code?: number } | undefined,
  estado: number,
): string {
  const dice = error?.message ?? "";

  if (error?.code === 190 || estado === 401) {
    return "El token de WhatsApp venció o es inválido. Hay que renovarlo en Meta.";
  }
  if (error?.code === 131026) {
    return "Ese número no tiene WhatsApp o no puede recibir llamadas.";
  }
  if (/permission/i.test(dice)) {
    return (
      "Este cliente todavía no dio permiso para que lo llamemos. " +
      "Mandale la solicitud de permiso desde el mismo botón y volvé a intentar cuando la acepte."
    );
  }
  if (/not enabled|not supported|business calling/i.test(dice)) {
    return (
      "Las llamadas no están habilitadas para este número en Meta. " +
      "Hay que activarlas en la configuración del número de WhatsApp Business."
    );
  }

  return dice || `WhatsApp respondió con error ${estado}.`;
}
