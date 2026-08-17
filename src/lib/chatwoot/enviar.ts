import "server-only";

/**
 * Respuestas hacia Chatwoot, que las hace llegar por WhatsApp.
 *
 * El token vive sólo en el servidor y sin el prefijo `NEXT_PUBLIC_`: en el
 * navegador, cualquiera que abriera el inspector podría escribirle a los
 * clientes desde el número de la escuela.
 */

export interface ResultadoEnvio {
  ok: boolean;
  /** Id del mensaje en Chatwoot, para casarlo con el webhook que vuelve. */
  chatwootId: number | null;
  error: string | null;
}

const base = () => (process.env.CHATWOOT_URL ?? "https://app.chatwoot.com").replace(/\/+$/, "");
const cuenta = () => process.env.CHATWOOT_ACCOUNT_ID ?? "";
const token = () => process.env.CHATWOOT_TOKEN ?? "";

export const hayChatwoot = (): boolean => Boolean(cuenta() && token());

/**
 * Manda un mensaje en una conversación.
 *
 * `privado` lo convierte en nota interna: queda en el hilo para el equipo y
 * el cliente no la recibe. Es lo que en Chatwoot se ve como nota privada.
 */
export async function enviarMensaje(
  conversacionId: number,
  contenido: string,
  privado = false,
): Promise<ResultadoEnvio> {
  if (!hayChatwoot()) {
    return { ok: false, chatwootId: null, error: "Chatwoot no está configurado en el servidor." };
  }

  const url = `${base()}/api/v1/accounts/${cuenta()}/conversations/${conversacionId}/messages`;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { api_access_token: token(), "content-type": "application/json" },
      body: JSON.stringify({
        content: contenido,
        message_type: "outgoing",
        private: privado,
      }),
    });

    const cuerpo = (await r.json().catch(() => null)) as { id?: number; message?: string } | null;

    if (!r.ok) return { ok: false, chatwootId: null, error: explicar(r.status, cuerpo?.message) };

    return { ok: true, chatwootId: typeof cuerpo?.id === "number" ? cuerpo.id : null, error: null };
  } catch (e) {
    return {
      ok: false,
      chatwootId: null,
      error: e instanceof Error ? e.message : "No se pudo contactar a Chatwoot.",
    };
  }
}

/** Cambia el estado de la conversación: open / pending / resolved. */
export async function cambiarEstado(
  conversacionId: number,
  estado: "open" | "pending" | "resolved",
): Promise<ResultadoEnvio> {
  if (!hayChatwoot()) {
    return { ok: false, chatwootId: null, error: "Chatwoot no está configurado en el servidor." };
  }

  const url = `${base()}/api/v1/accounts/${cuenta()}/conversations/${conversacionId}/toggle_status`;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { api_access_token: token(), "content-type": "application/json" },
      body: JSON.stringify({ status: estado }),
    });
    if (!r.ok) return { ok: false, chatwootId: null, error: explicar(r.status) };
    return { ok: true, chatwootId: null, error: null };
  } catch (e) {
    return {
      ok: false,
      chatwootId: null,
      error: e instanceof Error ? e.message : "No se pudo contactar a Chatwoot.",
    };
  }
}

/**
 * Traduce el error a algo accionable.
 *
 * El 401 y el 404 son los que más van a aparecer al configurar, y crudos no
 * dicen qué revisar.
 */
function explicar(estado: number, mensaje?: string): string {
  if (estado === 401 || estado === 403) {
    return "Chatwoot rechazó el token. Revisá CHATWOOT_TOKEN en Netlify: tiene que ser el token de acceso de un agente con permiso en esa bandeja.";
  }
  if (estado === 404) {
    return "Chatwoot no encontró la conversación o la cuenta. Revisá CHATWOOT_ACCOUNT_ID.";
  }
  if (estado === 429) {
    return "Chatwoot está limitando por exceso de peticiones. Esperá un momento y reintentá.";
  }
  return mensaje ?? `Chatwoot respondió con error ${estado}.`;
}
