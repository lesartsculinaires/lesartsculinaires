"use server";

import { getAdminClient } from "@/lib/supabase/admin";
import { getServerClient, getUser } from "@/lib/supabase/server";
import {
  avisarQueSeAtiende,
  colgar,
  contestar,
  hayLlamadas,
  marcar,
  pedirPermisoParaLlamar,
  rechazar,
} from "@/lib/whatsapp/llamar";
import type { ActionResult } from "@/app/actions";

/**
 * Contestar, rechazar, colgar y marcar.
 *
 * ============================================================================
 * EL AUDIO NO PASA POR ACÁ
 * ============================================================================
 *
 * Lo que va y viene por estas acciones es texto: el SDP que armó el navegador
 * y las órdenes para Meta. La voz va del navegador a Meta por WebRTC, directo,
 * sin tocar el servidor. Es lo que hace que esto entre en una función de
 * Netlify, que tiene diez segundos y no podría sostener una llamada de cinco
 * minutos.
 *
 * ============================================================================
 * TODO ESTO CORRE CONTRA UN RELOJ
 * ============================================================================
 *
 * Meta da entre 30 y 60 segundos desde que suena hasta que la da por no
 * contestada, y para cuando se llega acá ya se gastaron casi todos: el webhook,
 * la fila, el websocket, y una persona decidiendo si atiende. Por eso no hay
 * reintentos y por eso nada se hace «por las dudas»: lo que no sea
 * indispensable para que la voz salga, se hace después de colgar.
 */

const SIN_SESION: ActionResult = {
  ok: false,
  error: "Sesión no válida. Volvé a iniciar sesión.",
};

/** Si el servidor puede llamar hoy. Lo mira la bandeja para mostrar el botón. */
export const llamadasDisponibles = async (): Promise<boolean> => hayLlamadas();

export interface ResultadoContestar extends ActionResult {
  /**
   * `false` cuando la agarró otra persona primero. No es un error: es lo que
   * la pantalla necesita para decir «la atendió Katya» y soltar el micrófono
   * en vez de dejarlo abierto contra una llamada ajena.
   */
  conseguida: boolean;
}

/**
 * Contesta una llamada que está sonando.
 *
 * ----------------------------------------------------------------------------
 * PRIMERO SE LA GANA, DESPUÉS SE CONTESTA
 * ----------------------------------------------------------------------------
 *
 * Suena en las cinco pantallas del equipo y dos personas pueden apretar a la
 * vez. Si las dos le mandaran su respuesta de audio a Meta, una se quedaría
 * con el micrófono abierto contra una llamada que atendió otra, y del lado del
 * cliente el audio sale roto.
 *
 * El candado lo pone la base —`atender_llamada` sólo se lo da a la primera— y
 * recién con eso en la mano se le habla a Meta. Al revés no serviría: para
 * cuando la base dijera que no, el audio ya estaría saliendo.
 *
 * `sdp` es la respuesta que armó el navegador después de pedir el micrófono.
 */
export async function contestarLlamada(
  callId: string,
  sdp: string,
): Promise<ResultadoContestar> {
  const supabase = await getServerClient();
  const user = await getUser();
  if (!supabase || !user) return { ...SIN_SESION, conseguida: false };

  if (!sdp.trim()) {
    return {
      ok: false,
      conseguida: false,
      error: "No se pudo preparar el audio en este navegador.",
    };
  }

  const { data, error } = await supabase.rpc("atender_llamada", { p_call_id: callId });

  if (error) {
    if (faltaLaFuncion(error)) {
      return {
        ok: false,
        conseguida: false,
        error:
          "Falta correr 20261017120000_llamadas.sql en Supabase; sin eso las llamadas no se pueden atender.",
      };
    }
    return { ok: false, conseguida: false, error: error.message };
  }

  const fila = (Array.isArray(data) ? data[0] : data) as { conseguida?: boolean } | null;
  if (!fila?.conseguida) {
    return { ok: true, conseguida: false, error: null };
  }

  /*
   * El aviso previo es opcional y a propósito no se espera su resultado con
   * ansiedad: le da a Meta el camino del audio unos instantes antes que el
   * «accept», así no se pierden las dos primeras palabras del cliente. Si
   * falla, la llamada se contesta igual; gastar el plazo reintentando algo que
   * sólo mejora los primeros segundos sería cambiar una mejora por la llamada.
   */
  await avisarQueSeAtiende(callId, sdp).catch(() => null);

  const r = await contestar(callId, sdp);

  if (!r.ok) {
    // Se suelta el candado devolviendo la llamada a su estado final, para que
    // no quede una fila diciendo «contestando» para siempre y el teléfono
    // dejando de sonar en todas las pantallas sin que nadie esté hablando.
    await cerrar(callId, "fallida", null, r.error);
    return { ok: false, conseguida: true, error: r.error };
  }

  await marcarEnCurso(callId);
  return { ok: true, conseguida: true, error: null };
}

/** Rechaza una que está sonando. Del otro lado se ve como no atendida. */
export async function rechazarLlamada(callId: string): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return SIN_SESION;

  const r = await rechazar(callId);
  // Se anota rechazada aunque Meta no conteste: para el equipo la decisión ya
  // se tomó, y dejarla sonando en las demás pantallas sería peor que el error.
  await cerrar(callId, "rechazada", null, r.ok ? null : r.error);

  return { ok: r.ok, error: r.error };
}

/**
 * Cuelga.
 *
 * Sirve para las dos: una en curso y una que marcamos y todavía está sonando.
 * La duración se anota como la que informe Meta al terminar —llega por el
 * webhook— y no la que se contó en pantalla, que empieza antes de que haya
 * audio.
 */
export async function colgarLlamada(callId: string): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return SIN_SESION;

  const r = await colgar(callId);
  await cerrar(callId, "terminada", null, r.ok ? null : r.error);

  return { ok: r.ok, error: r.error };
}

export interface ResultadoMarcar extends ActionResult {
  callId: string | null;
  /**
   * `true` cuando lo único que falta es el permiso del cliente. Con esto la
   * pantalla ofrece el botón para pedírselo en vez de dejar un error seco.
   */
  faltaPermiso: boolean;
}

/**
 * Llama a alguien.
 *
 * ----------------------------------------------------------------------------
 * NO SE PUEDE LLAMAR A CUALQUIERA
 * ----------------------------------------------------------------------------
 *
 * WhatsApp exige que el cliente haya dado permiso antes. Sin permiso, Meta
 * rechaza la orden y del otro lado no suena nada. El permiso se le pide con
 * `pedirPermisoDeLlamada`, que le manda un mensaje con un botón.
 *
 * `sdp` es la oferta que armó el navegador después de pedir el micrófono. Se
 * arma antes de llamar acá, y no después, porque pedir el micrófono abre un
 * cartel del navegador que sólo aparece si lo dispara un clic de la persona.
 */
export async function llamarA(
  conversacionId: number,
  sdp: string,
): Promise<ResultadoMarcar> {
  const supabase = await getServerClient();
  const user = await getUser();
  if (!supabase || !user) return { ...SIN_SESION, callId: null, faltaPermiso: false };

  if (!sdp.trim()) {
    return {
      ok: false,
      callId: null,
      faltaPermiso: false,
      error: "No se pudo preparar el audio en este navegador.",
    };
  }

  const { data: conv } = await supabase
    .from("conversaciones")
    .select("telefono, vendedor_id, nombre_perfil")
    .eq("id", conversacionId)
    .maybeSingle();

  const telefono = conv?.telefono == null ? "" : String(conv.telefono);
  if (!telefono) {
    return {
      ok: false,
      callId: null,
      faltaPermiso: false,
      error: "No se encontró el teléfono de esta conversación.",
    };
  }

  const r = await marcar(telefono, sdp);

  if (!r.ok || !r.callId) {
    return {
      ok: false,
      callId: null,
      faltaPermiso: /permiso/i.test(r.error ?? ""),
      error: r.error ?? "WhatsApp no devolvió un identificador de llamada.",
    };
  }

  /*
   * La fila se escribe DESPUÉS de que Meta acepta, con el id que él devolvió.
   *
   * Al revés haría falta inventar un identificador y después corregirlo, y en
   * el medio la llamada aparecería en la pantalla de quien marcó como si ya
   * estuviera sonando cuando todavía puede fallar por permiso.
   *
   * Va con la clave de servicio porque la tabla no tiene política de alta a
   * propósito: si el navegador pudiera insertar filas, cualquiera con el
   * inspector abierto haría sonar el teléfono de todo el equipo con una
   * llamada que no existe.
   */
  const admin = getAdminClient();
  if (admin) {
    await admin
      .from("llamadas")
      .insert({
        call_id: r.callId,
        conversacion_id: conversacionId,
        telefono,
        // Igual que en las entrantes: copiados, para que la fila se entienda
        // sola sin depender de que quien la mire pueda ver el hilo.
        vendedor_id: conv?.vendedor_id ?? null,
        nombre: conv?.nombre_perfil ?? null,
        direccion: "saliente",
        estado: "sonando",
        // Suya desde el principio: nadie más tiene que ver sonar una llamada
        // que no va a atender, y quien la marcó ya la está atendiendo.
        atendida_por: user.id,
        atendida_en: new Date().toISOString(),
      })
      .then(null, () => null);
  }

  return { ok: true, callId: r.callId, faltaPermiso: false, error: null };
}

/**
 * Le manda al cliente la solicitud de permiso para llamarlo.
 *
 * Le llega como un mensaje con un botón. Mientras no lo acepte, llamarlo falla
 * del lado de Meta, así que este paso no es un trámite: es la única forma de
 * que la llamada llegue a sonar.
 *
 * Va por la puerta de los mensajes, así que le aplica la ventana de 24 horas
 * igual que a un texto: si hace mucho que la persona no escribe, esto también
 * falla, y el error lo dice.
 */
export async function pedirPermisoDeLlamada(conversacionId: number): Promise<ActionResult> {
  const supabase = await getServerClient();
  const user = await getUser();
  if (!supabase || !user) return SIN_SESION;

  const { data: conv } = await supabase
    .from("conversaciones")
    .select("telefono")
    .eq("id", conversacionId)
    .maybeSingle();

  const telefono = conv?.telefono == null ? "" : String(conv.telefono);
  if (!telefono) return { ok: false, error: "No se encontró el teléfono de esta conversación." };

  const r = await pedirPermisoParaLlamar(telefono);
  return { ok: r.ok, error: r.error };
}

/**
 * Deja anotado que ya hay audio.
 *
 * Separado de contestar porque son dos cosas distintas: Meta aceptó la
 * respuesta —eso lo dice el `accept`— y la llamada está en curso. Si esto
 * fallara, la llamada sigue andando igual: lo único que se pierde es el
 * rótulo, no la voz.
 */
async function marcarEnCurso(callId: string): Promise<void> {
  const supabase = await getServerClient();
  if (!supabase) return;
  await supabase
    .from("llamadas")
    .update({ estado: "en_curso" })
    .eq("call_id", callId)
    .eq("estado", "contestando")
    .then(null, () => null);
}

/**
 * Cierra la fila.
 *
 * Sólo hacia adelante: lo hace `cerrar_llamada`, que ignora las que ya están
 * cerradas. Meta manda los avisos desordenados, y sin eso una llamada que ya
 * terminó volvería a decir «sonando» y el teléfono sonaría de nuevo en todas
 * las pantallas.
 */
async function cerrar(
  callId: string,
  estado: string,
  duracion: number | null,
  motivo: string | null,
): Promise<void> {
  const supabase = await getServerClient();
  if (!supabase) return;
  await supabase
    .rpc("cerrar_llamada", {
      p_call_id: callId,
      p_estado: estado,
      p_duracion: duracion,
      p_motivo: motivo,
    })
    .then(null, () => null);
}

/** La base no conoce esa función: falta correr la migración. */
const faltaLaFuncion = (e: { code?: string; message?: string }): boolean =>
  e.code === "PGRST202" || /Could not find the function|does not exist/i.test(e.message ?? "");
