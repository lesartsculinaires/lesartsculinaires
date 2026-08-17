"use server";

import { revalidatePath } from "next/cache";

import { getServerClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/server";
import { enviarTexto } from "@/lib/whatsapp/enviar";
import type { ActionResult } from "@/app/actions";

const SIN_SESION: ActionResult = {
  ok: false,
  error: "Sesión no válida. Volvé a iniciar sesión.",
};

/**
 * Responde por WhatsApp y deja copia en la conversación.
 *
 * El orden importa: primero se manda a Meta y sólo después se guarda. Al
 * revés, un fallo de envío dejaría en la bandeja un mensaje que la persona
 * nunca recibió, y quien atiende creería que ya contestó.
 */
export async function responder(
  conversacionId: number,
  texto: string,
): Promise<ActionResult> {
  const cuerpo = texto.trim();
  if (!cuerpo) return { ok: true, error: null };

  const supabase = await getServerClient();
  const user = await getUser();
  if (!supabase || !user) return SIN_SESION;

  const { data: conv, error: errConv } = await supabase
    .from("conversaciones")
    .select("id, telefono")
    .eq("id", conversacionId)
    .maybeSingle();

  if (errConv) return { ok: false, error: errConv.message };
  if (!conv) return { ok: false, error: "No se encontró la conversación." };

  const envio = await enviarTexto(String(conv.telefono), cuerpo);
  if (!envio.ok) return { ok: false, error: envio.error };

  const { error } = await supabase.from("mensajes").insert({
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
  if (error) {
    return { ok: false, error: `Se envió, pero no se pudo guardar en la ficha: ${error.message}` };
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

/** Deja de contar los no leídos al abrir la conversación. */
export async function marcarLeida(conversacionId: number): Promise<ActionResult> {
  const supabase = await getServerClient();
  if (!supabase) return SIN_SESION;

  const { error } = await supabase
    .from("conversaciones")
    .update({ sin_leer: 0 })
    .eq("id", conversacionId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/");
  return { ok: true, error: null };
}

export async function archivar(
  conversacionId: number,
  archivada: boolean,
): Promise<ActionResult> {
  const supabase = await getServerClient();
  if (!supabase) return SIN_SESION;

  const { error } = await supabase
    .from("conversaciones")
    .update({ archivada })
    .eq("id", conversacionId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/");
  return { ok: true, error: null };
}

export interface ResultadoLead extends ActionResult {
  clienteId: number | null;
}

/**
 * Convierte una conversación en cliente del CRM.
 *
 * Esto es lo que el webhook deliberadamente no hace solo. Acá hay una persona
 * que leyó el mensaje y decidió que es un lead de verdad, no un número
 * equivocado ni un proveedor.
 *
 * Si el teléfono ya está en la base se vincula al cliente existente en vez de
 * crear otro: la conversación se le suma a su ficha, que es justo lo que se
 * quiere y no un duplicado.
 */
export async function crearLeadDesdeConversacion(
  conversacionId: number,
  nombre: string,
): Promise<ResultadoLead> {
  const limpio = nombre.trim();
  if (!limpio) {
    return { ok: false, error: "Poné un nombre para el cliente.", clienteId: null };
  }

  const supabase = await getServerClient();
  if (!supabase) return { ...SIN_SESION, clienteId: null };

  const { data: conv, error: errConv } = await supabase
    .from("conversaciones")
    .select("id, telefono, cliente_id")
    .eq("id", conversacionId)
    .maybeSingle();

  if (errConv) return { ok: false, error: errConv.message, clienteId: null };
  if (!conv) return { ok: false, error: "No se encontró la conversación.", clienteId: null };
  if (conv.cliente_id) {
    return { ok: true, error: null, clienteId: Number(conv.cliente_id) };
  }

  const telefono = String(conv.telefono);

  // Mismo criterio que el resto del CRM: los últimos 8 dígitos, porque los
  // teléfonos guardados no tienen un formato uniforme.
  const { data: yaEsta } = await supabase
    .from("clientes")
    .select("id")
    .like("telefono", `%${telefono.slice(-8)}`)
    .limit(1)
    .maybeSingle();

  let clienteId = yaEsta ? Number(yaEsta.id) : null;

  if (clienteId == null) {
    const { data: creado, error } = await supabase
      .from("clientes")
      .insert({ nombre: limpio, telefono })
      .select("id")
      .single();

    if (error) return { ok: false, error: error.message, clienteId: null };
    clienteId = Number(creado.id);
  }

  const { error: errVinculo } = await supabase
    .from("conversaciones")
    .update({ cliente_id: clienteId })
    .eq("id", conversacionId);

  if (errVinculo) return { ok: false, error: errVinculo.message, clienteId: null };

  revalidatePath("/");
  return { ok: true, error: null, clienteId };
}
