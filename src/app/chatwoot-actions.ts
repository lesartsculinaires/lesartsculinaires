"use server";

import { revalidatePath } from "next/cache";

import { getServerClient, getUser } from "@/lib/supabase/server";
import { cambiarEstado, enviarMensaje } from "@/lib/chatwoot/enviar";
import type { ActionResult } from "@/app/actions";

const SIN_SESION: ActionResult = {
  ok: false,
  error: "Sesión no válida. Volvé a iniciar sesión.",
};

/**
 * Responde por WhatsApp a través de Chatwoot.
 *
 * El orden importa: primero sale el mensaje y sólo después se guarda. Al
 * revés, un fallo de envío dejaría en la bandeja una respuesta que el cliente
 * nunca recibió, y quien atiende creería que ya contestó.
 *
 * No se guarda acá el mensaje: Chatwoot lo devuelve por el webhook y ahí
 * entra, con su id. Guardarlo en los dos lados lo duplicaría.
 */
export async function responderChatwoot(
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
    .select("id, chatwoot_id")
    .eq("id", conversacionId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!conv?.chatwoot_id) {
    return { ok: false, error: "Esta conversación no está enlazada con Chatwoot." };
  }

  const envio = await enviarMensaje(Number(conv.chatwoot_id), cuerpo, privado);
  if (!envio.ok) return { ok: false, error: envio.error };

  revalidatePath("/");
  return { ok: true, error: null };
}

/**
 * Asigna la conversación a un vendedor.
 *
 * Es la única acción manual que le queda al asesor: los datos del cliente ya
 * entraron solos. Si la conversación tiene un cliente vinculado, la asignación
 * también se aplica a sus oportunidades abiertas, para que el pipeline y la
 * bandeja no digan cosas distintas sobre quién lleva a esa persona.
 */
export async function asignar(
  conversacionId: number,
  vendedorId: number | null,
): Promise<ActionResult> {
  const supabase = await getServerClient();
  if (!supabase) return SIN_SESION;

  const { data: conv, error: errConv } = await supabase
    .from("conversaciones")
    .select("id, cliente_id")
    .eq("id", conversacionId)
    .maybeSingle();

  if (errConv) return { ok: false, error: errConv.message };

  const { error } = await supabase
    .from("conversaciones")
    .update({ vendedor_id: vendedorId })
    .eq("id", conversacionId);

  if (error) return { ok: false, error: error.message };

  if (conv?.cliente_id != null && vendedorId != null) {
    const { error: errOps } = await supabase
      .from("oportunidades")
      .update({ vendedor_id: vendedorId })
      .eq("cliente_id", conv.cliente_id)
      .is("fecha_cierre", null);

    // Que falle esto no invalida la asignación de la conversación, que es lo
    // que el asesor pidió; se avisa sin deshacer.
    if (errOps) {
      return {
        ok: false,
        error: `Se asignó la conversación, pero no sus oportunidades: ${errOps.message}`,
      };
    }
  }

  revalidatePath("/");
  return { ok: true, error: null };
}

/** Abrir, poner en pendiente o resolver. Se refleja también en Chatwoot. */
export async function resolver(
  conversacionId: number,
  estado: "open" | "pending" | "resolved",
): Promise<ActionResult> {
  const supabase = await getServerClient();
  if (!supabase) return SIN_SESION;

  const { data: conv } = await supabase
    .from("conversaciones")
    .select("id, chatwoot_id")
    .eq("id", conversacionId)
    .maybeSingle();

  if (conv?.chatwoot_id) {
    const r = await cambiarEstado(Number(conv.chatwoot_id), estado);
    if (!r.ok) return { ok: false, error: r.error };
  }

  const { error } = await supabase
    .from("conversaciones")
    .update({ estado })
    .eq("id", conversacionId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  return { ok: true, error: null };
}

/**
 * Marca que el contacto no era un lead.
 *
 * Con el alta automática van a entrar números equivocados y proveedores.
 * Borra el cliente creado —sólo si no tiene oportunidades, para no llevarse
 * por delante trabajo real— y archiva la conversación.
 */
export async function noEraLead(conversacionId: number): Promise<ActionResult> {
  const supabase = await getServerClient();
  if (!supabase) return SIN_SESION;

  const { data: conv, error } = await supabase
    .from("conversaciones")
    .select("id, cliente_id")
    .eq("id", conversacionId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };

  if (conv?.cliente_id != null) {
    const { count } = await supabase
      .from("oportunidades")
      .select("id", { count: "exact", head: true })
      .eq("cliente_id", conv.cliente_id);

    if (!count) {
      await supabase.from("conversaciones").update({ cliente_id: null }).eq("id", conversacionId);
      await supabase.from("clientes").delete().eq("id", conv.cliente_id);
    }
  }

  const { error: errArch } = await supabase
    .from("conversaciones")
    .update({ archivada: true })
    .eq("id", conversacionId);

  if (errArch) return { ok: false, error: errArch.message };

  revalidatePath("/");
  return { ok: true, error: null };
}
