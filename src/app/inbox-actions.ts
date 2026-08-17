"use server";

import { revalidatePath } from "next/cache";

import { getServerClient, getUser } from "@/lib/supabase/server";
import { enviarMensaje as enviarPorChatwoot, hayChatwoot } from "@/lib/chatwoot/enviar";
import { enviarTexto as enviarPorMeta, hayWhatsapp } from "@/lib/whatsapp/enviar";
import type { ActionResult } from "@/app/actions";

const SIN_SESION: ActionResult = {
  ok: false,
  error: "Sesión no válida. Volvé a iniciar sesión.",
};

/** Por dónde puede salir un mensaje hoy. */
export type Salida = "chatwoot" | "meta" | "ninguna";

export const salidaDisponible = async (): Promise<Salida> =>
  hayChatwoot() ? "chatwoot" : hayWhatsapp() ? "meta" : "ninguna";

/**
 * Responde por WhatsApp, por el camino que esté disponible.
 *
 * Durante la mudanza los dos caminos conviven: las conversaciones que nacieron
 * en Chatwoot tienen su id y se responden por ahí; las que entren después de
 * cortar van derecho a Meta. Elegir por conversación y no por configuración
 * global es lo que permite hacer el cambio un sábado sin dejar hilos viejos
 * sin poder contestar.
 *
 * El orden importa: primero sale el mensaje y sólo después se guarda. Al
 * revés, un fallo de envío dejaría en la bandeja una respuesta que el cliente
 * nunca recibió, y quien atiende creería que ya contestó.
 */
export async function responderConversacion(
  conversacionId: number,
  texto: string,
  privado = false,
): Promise<ActionResult> {
  const cuerpo = texto.trim();
  if (!cuerpo) return { ok: true, error: null };

  const supabase = await getServerClient();
  const user = await getUser();
  if (!supabase || !user) return SIN_SESION;

  const { data: conv, error } = await supabase
    .from("conversaciones")
    .select("id, telefono, chatwoot_id")
    .eq("id", conversacionId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!conv) return { ok: false, error: "No se encontró la conversación." };

  // Por Chatwoot cuando la conversación vino de ahí y el token sigue puesto.
  if (conv.chatwoot_id && hayChatwoot()) {
    const r = await enviarPorChatwoot(Number(conv.chatwoot_id), cuerpo, privado);
    if (!r.ok) return { ok: false, error: r.error };
    // No se guarda acá: Chatwoot lo devuelve por su webhook con su id, y
    // guardarlo en los dos lados lo duplicaría.
    revalidatePath("/");
    return { ok: true, error: null };
  }

  if (!hayWhatsapp()) {
    return {
      ok: false,
      error: conv.chatwoot_id
        ? "Esta conversación venía de Chatwoot y ya no hay token para responderle. Configurá WhatsApp directo para poder contestar."
        : "WhatsApp no está configurado en el servidor.",
    };
  }

  // Una nota interna no se manda a nadie: es del equipo. Por la vía directa no
  // existe ese concepto en WhatsApp, así que se guarda y no se envía.
  if (privado) return await guardarNotaInterna(supabase, conversacionId, cuerpo, user.id);

  const envio = await enviarPorMeta(String(conv.telefono), cuerpo);
  if (!envio.ok) return { ok: false, error: envio.error };

  const { error: errGuardar } = await supabase.from("mensajes").insert({
    conversacion_id: conversacionId,
    wa_id: envio.waId,
    direccion: "saliente",
    tipo: "text",
    texto: cuerpo,
    estado: "enviado",
    enviado_por: user.id,
  });

  // Si llega acá el mensaje ya salió. Que falle el registro es molesto, pero
  // decir «no se envió» sería mentir y llevaría a mandarlo dos veces.
  if (errGuardar) {
    return { ok: false, error: `Se envió, pero no se pudo guardar en la ficha: ${errGuardar.message}` };
  }

  await supabase
    .from("conversaciones")
    .update({
      ultimo_texto: cuerpo.slice(0, 200),
      ultimo_mensaje_en: new Date().toISOString(),
      sin_leer: 0,
    })
    .eq("id", conversacionId);

  revalidatePath("/");
  return { ok: true, error: null };
}

/** Nota que sólo ve el equipo. No sale a WhatsApp. */
async function guardarNotaInterna(
  supabase: NonNullable<Awaited<ReturnType<typeof getServerClient>>>,
  conversacionId: number,
  texto: string,
  autorId: string,
): Promise<ActionResult> {
  const { error } = await supabase.from("mensajes").insert({
    conversacion_id: conversacionId,
    direccion: "saliente",
    tipo: "text",
    texto,
    privado: true,
    enviado_por: autorId,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/");
  return { ok: true, error: null };
}
