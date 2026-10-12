import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ¿Este webhook de Meta le interesa al bot de carnets de n8n?
 *
 * ----------------------------------------------------------------------------
 * POR QUÉ ESTE FILTRO VIVE ACÁ Y NO EN n8n
 * ----------------------------------------------------------------------------
 *
 * n8n cobra la ejecución en el instante en que el nodo Webhook recibe el HTTP,
 * antes de evaluar cualquier IF. Un nodo que descarte el mensaje deja el flujo
 * más limpio pero no ahorra ni una ejecución: lo único que las ahorra es que
 * la petición nunca salga de acá.
 *
 * Y sin filtro sale muchísimo. Cada mensaje que manda un asesor desde la
 * bandeja genera avisos de estado —`sent`, `delivered`, `read`— y cada uno de
 * esos es otro webhook. Entre eso y las conversaciones de ventas, el plan de
 * n8n se consume en días con tráfico que no tiene nada que ver con carnets.
 *
 * ----------------------------------------------------------------------------
 * MANTENER EN SINCRONÍA CON n8n
 * ----------------------------------------------------------------------------
 *
 * El nodo `Decidir accion` del workflow revalida con su propia lista de
 * disparadores. Su lista es más amplia que ésta a propósito, así que todo lo
 * que sale de acá allá se atiende. Si algún día se agrega un disparador acá,
 * hay que agregarlo también allá: si no, n8n recibiría un mensaje que después
 * ignora y el estudiante se queda sin respuesta del bot y sin respuesta de
 * ventas, porque el hilo ya se desvió.
 */

/** Minutos que un chat sigue saliendo a n8n después de un disparador. */
const VENTANA_MINUTOS = 20;

/**
 * Minúsculas, sin acentos, un solo espacio.
 *
 * Así «VER CARNET», «Ver  Carnét» y «ver carnet» son lo mismo. Sin esto se
 * perderían mensajes por una tilde, que es justo el error que más comete
 * alguien escribiendo desde el teléfono.
 */
function normalizar(texto: unknown): string {
  return String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const DISPARADORES: RegExp[] = [
  /\bver\s+(mi\s+)?carnet\b/, // «ver carnet», «ver mi carnet»
  /\bcarnet\s+de\s+estudiante\b/, // «quiero el carnet de estudiante»
  /\bdescargar\s+(mi\s+)?carnet\b/, // «descargar carnet»
  /^carnet$/, // el mensaje es sólo esa palabra
];

/**
 * El código de estudiante: LAC, dígitos, guion y año.
 *
 * Se busca dentro del texto en vez de exigir que sea el mensaje entero, para
 * que «mi código es LAC3013-2026» también entre. Tolera espacios porque el
 * teclado del teléfono los mete solo.
 */
const RE_CODIGO = /\blac\s?\d+\s?-\s?\d{4}\b/;

/** El botón que manda el propio bot, que no pasa por las expresiones. */
const BOTON_DEL_BOT = "btn_carnet";

export function esMensajeDeCarnet(texto: unknown): boolean {
  const t = normalizar(texto);
  if (!t) return false;
  if (t === BOTON_DEL_BOT) return true;
  return DISPARADORES.some((re) => re.test(t)) || RE_CODIGO.test(t);
}

/**
 * El texto de un mensaje de Meta, si es de un tipo que puede traer disparador.
 *
 * Audio, imagen, ubicación, contactos y documentos devuelven `null`: no hay
 * nada que leer ahí y reenviarlos sería gastar ejecuciones por nada.
 */
function textoDelMensaje(msg: Record<string, unknown>): string | null {
  // El payload llega crudo de Meta, así que el campo es `type` y no el `tipo`
  // que usa el resto del CRM.
  const tipo = msg.type;

  if (tipo === "text") {
    const text = msg.text as { body?: unknown } | undefined;
    return typeof text?.body === "string" ? text.body : "";
  }

  if (tipo === "interactive") {
    const i = msg.interactive as
      | { button_reply?: { id?: unknown }; list_reply?: { id?: unknown } }
      | undefined;
    const id = i?.button_reply?.id ?? i?.list_reply?.id;
    return typeof id === "string" ? id : "";
  }

  if (tipo === "button") {
    const b = msg.button as { payload?: unknown } | undefined;
    return typeof b?.payload === "string" ? b.payload : "";
  }

  return null;
}

/** Los `value` de cada `change` del payload, sin asumir que viene uno solo. */
function valoresDelPayload(payload: unknown): Record<string, unknown>[] {
  const entradas = (payload as { entry?: unknown })?.entry;
  if (!Array.isArray(entradas)) return [];

  const valores: Record<string, unknown>[] = [];
  for (const entrada of entradas) {
    const cambios = (entrada as { changes?: unknown })?.changes;
    if (!Array.isArray(cambios)) continue;
    for (const cambio of cambios) {
      const valor = (cambio as { value?: unknown })?.value;
      if (valor && typeof valor === "object") valores.push(valor as Record<string, unknown>);
    }
  }
  return valores;
}

// ── Ventana de seguimiento ───────────────────────────────────────────────────
//
// Después de un disparador, todo lo que escriba ESE chat sigue saliendo a n8n
// por 20 minutos. Es lo que permite el ida y vuelta de la verificación: el
// estudiante responde «LAC3013-2026» y luego los 4 dígitos del DUI, y ninguno
// de los dos es un disparador por sí solo.
//
// Cada mensaje dentro de la ventana la renueva, así una verificación que se
// pausó un rato no se corta a media conversación.
//
// La ventana vive en Supabase y no en memoria porque las funciones de Netlify
// arrancan en frío: una variable del proceso se perdería entre un mensaje y el
// siguiente, que es exactamente cuando hace falta.

async function ventanaActiva(supabase: SupabaseClient, telefono: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("n8n_ventana_carnet")
    .select("expira_en")
    .eq("telefono", telefono)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data) && new Date(data!.expira_en as string) > new Date();
}

async function abrirVentana(supabase: SupabaseClient, telefono: string): Promise<void> {
  const expira = new Date(Date.now() + VENTANA_MINUTOS * 60_000).toISOString();
  await supabase.from("n8n_ventana_carnet").upsert({ telefono, expira_en: expira });
}

// ── Decisión ─────────────────────────────────────────────────────────────────

export type Decision = { reenviar: boolean; motivo: string };

/**
 * Decide si este payload sale hacia n8n, y de paso abre o renueva la ventana.
 *
 * Si Supabase falla, un disparador sale igual —se detecta leyendo el texto, sin
 * tocar la base— pero un mensaje suelto no: sin poder consultar la ventana no
 * hay forma de saber si pertenece a una conversación de carnet, y ante la duda
 * se prefiere que el bot pierda un mensaje antes que inundar n8n.
 */
export async function decidirReenvio(
  supabase: SupabaseClient,
  payload: unknown,
): Promise<Decision> {
  const valores = valoresDelPayload(payload);
  if (valores.length === 0) return { reenviar: false, motivo: "payload sin cambios" };

  // Avisos de estado: nunca salen, y se cortan antes que nada.
  //
  // Son la razón de ser de este filtro. Un solo mensaje saliente genera
  // `sent`, `delivered` y `read`, tres webhooks que no le dicen nada al bot.
  if (valores.every((v) => Array.isArray(v.statuses))) {
    return { reenviar: false, motivo: "aviso de estado" };
  }

  const mensajes: Record<string, unknown>[] = [];
  for (const valor of valores) {
    if (Array.isArray(valor.messages)) {
      for (const m of valor.messages) {
        if (m && typeof m === "object") mensajes.push(m as Record<string, unknown>);
      }
    }
  }

  if (mensajes.length === 0) return { reenviar: false, motivo: "sin mensajes de usuario" };

  // Meta puede mandar varios mensajes en un mismo webhook. Basta con que uno
  // sea de carnet: el payload va entero y n8n se queda con el que le sirve.
  let hayDisparador = false;
  let hayLegible = false;
  let telefono = "";

  for (const msg of mensajes) {
    const texto = textoDelMensaje(msg);
    if (texto === null) continue;

    hayLegible = true;
    if (typeof msg.from === "string" && !telefono) telefono = msg.from;
    if (esMensajeDeCarnet(texto)) hayDisparador = true;
  }

  if (!hayLegible) return { reenviar: false, motivo: "ningún mensaje con texto" };
  if (!telefono) return { reenviar: false, motivo: "mensaje sin remitente" };

  if (hayDisparador) {
    // La ventana es best-effort: que no se pueda anotar no justifica dejar al
    // estudiante sin su carnet. Lo peor que pasa es que el siguiente mensaje
    // suelto de ese chat no salga.
    try {
      await abrirVentana(supabase, telefono);
    } catch {
      // Se ignora a propósito; el motivo queda en el registro de quien llama.
    }
    return { reenviar: true, motivo: "disparador" };
  }

  try {
    if (await ventanaActiva(supabase, telefono)) {
      await abrirVentana(supabase, telefono).catch(() => {});
      return { reenviar: true, motivo: "dentro de la ventana" };
    }
  } catch {
    return { reenviar: false, motivo: "no se pudo consultar la ventana" };
  }

  return { reenviar: false, motivo: "no es de carnet" };
}
