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
 * ESTA LISTA ES LA DEL WORKFLOW, LETRA POR LETRA
 * ----------------------------------------------------------------------------
 *
 * El nodo `Decidir accion` compara el mensaje con su propia lista, y lo hace
 * por igualdad exacta sobre el texto en mayúsculas: lo que no está en esa
 * lista cae en `pasar_al_crm` y termina en «El bot no interviene», sin
 * respuesta.
 *
 * Por eso acá se repite esa lista tal cual y no una más amplia. Reconocer de
 * este lado algo que el workflow no reconoce sería lo peor de los dos mundos:
 * se gasta la ejecución igual y el estudiante no recibe nada, porque el bot lo
 * ignora y el asesor ve un mensaje que cree atendido.
 *
 * Si algún día se agrega un disparador, se agrega en los dos lados a la vez.
 */

/**
 * Minutos que un chat sigue saliendo a n8n después de un disparador.
 *
 * Son los mismos 15 que el workflow le da a la sesión (`sesionViva` en
 * `Decidir accion`). Si acá fuera más larga, los mensajes de ese rato de más
 * saldrían a gastar ejecuciones en un bot que ya volvió a pasárselos a ventas.
 */
const VENTANA_MINUTOS = 15;

/** Lo que despierta al bot. Es `PALABRAS_BOT` del nodo `Decidir accion`. */
const PALABRAS_BOT = [
  "VER CARNET",
  "VERCARNET",
  "VER MI CARNET",
  "CARNET",
  "CARNE",
  "MI CARNET",
  // El id del botón que manda el propio bot, que no es algo que alguien escriba.
  "BTN_CARNET",
];

/**
 * El código de estudiante, cuando llega solo y sin que nadie haya dicho
 * «Ver Carnet» antes.
 *
 * Va anclado —el mensaje ENTERO tiene que ser el código— porque así lo evalúa
 * el workflow. «Mi código es LAC3013-2026» no entra: allá tampoco entraría.
 */
const RE_CODIGO = /^LAC\s?\d+[-\s]?\d{4}$/i;

/**
 * Las palabras con las que el estudiante pide una persona.
 *
 * El workflow las manda a `pasar_al_crm`, o sea que no contesta. Acá además
 * cierran la ventana: es el punto en que la conversación vuelve a ser de
 * ventas, y seguir mandando a n8n lo que escriba después sería gastar
 * ejecuciones en mensajes que ya nadie va a atender del otro lado.
 */
const SALIDAS = ["SALIR", "ASESOR", "HUMANO", "AGENTE"];

/** El texto como lo compara el workflow: sin espacios al borde y en mayúsculas. */
function comoLoLeeN8n(texto: unknown): string {
  return String(texto ?? "").trim();
}

export function esMensajeDeCarnet(texto: unknown): boolean {
  const t = comoLoLeeN8n(texto);
  if (!t) return false;
  return PALABRAS_BOT.includes(t.toUpperCase()) || RE_CODIGO.test(t);
}

export function pideUnaPersona(texto: unknown): boolean {
  const t = comoLoLeeN8n(texto);
  return t !== "" && SALIDAS.includes(t.toUpperCase());
}

/**
 * El texto de un mensaje de Meta, si es de un tipo que puede traer disparador.
 *
 * Audio, imagen, ubicación, contactos y documentos devuelven `null`: no hay
 * nada que leer ahí y reenviarlos sería gastar ejecuciones por nada. El
 * workflow hace el mismo corte en `Normalizar mensaje`.
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
// por 15 minutos. Es lo que permite el ida y vuelta de la verificación: el
// estudiante responde «LAC3013-2026» y luego los 4 dígitos del DUI, y ninguno
// de los dos es un disparador por sí solo.
//
// Cada mensaje dentro de la ventana la renueva, igual que el workflow renueva
// el `updated_at` de la sesión en cada paso. Así una verificación que se pausó
// un rato no se corta a media conversación.
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

async function cerrarVentana(supabase: SupabaseClient, telefono: string): Promise<void> {
  await supabase.from("n8n_ventana_carnet").delete().eq("telefono", telefono);
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
  let pidenPersona = false;
  let telefono = "";

  for (const msg of mensajes) {
    const texto = textoDelMensaje(msg);
    if (texto === null) continue;

    hayLegible = true;
    if (typeof msg.from === "string" && !telefono) telefono = msg.from;
    if (esMensajeDeCarnet(texto)) hayDisparador = true;
    if (pideUnaPersona(texto)) pidenPersona = true;
  }

  if (!hayLegible) return { reenviar: false, motivo: "ningún mensaje con texto" };
  if (!telefono) return { reenviar: false, motivo: "mensaje sin remitente" };

  /*
   * «Asesor» gana sobre todo lo demás.
   *
   * Quien lo escribe está pidiendo una persona, y el workflow tampoco le
   * contestaría. Se cierra la ventana para que el resto de esa conversación
   * —que ya es de ventas— no siga saliendo.
   */
  if (pidenPersona && !hayDisparador) {
    await cerrarVentana(supabase, telefono).catch(() => {});
    return { reenviar: false, motivo: "pidió una persona" };
  }

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
