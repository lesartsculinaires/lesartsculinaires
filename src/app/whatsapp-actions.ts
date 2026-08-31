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

/**
 * Deja de contar los no leídos al abrir la conversación.
 *
 * Apaga también la marca de «pendiente» puesta a mano: abrir el hilo es
 * atenderlo, y dejar el punto encendido sobre una conversación que está a la
 * vista lo volvería un adorno que nadie apaga.
 */
export async function marcarLeida(conversacionId: number): Promise<ActionResult> {
  const supabase = await getServerClient();
  if (!supabase) return SIN_SESION;

  const { error } = await supabase
    .from("conversaciones")
    .update({ sin_leer: 0, no_leida: false })
    .eq("id", conversacionId);

  if (error) {
    // 42703: falta `no_leida`, o sea la migración de las marcas. Se reintenta
    // con lo de siempre: sin esto, no haber corrido una migración opcional
    // rompería abrir cualquier conversación, que es la bandeja entera.
    if (error.code === "42703") {
      const { error: e2 } = await supabase
        .from("conversaciones")
        .update({ sin_leer: 0 })
        .eq("id", conversacionId);
      if (e2) return { ok: false, error: e2.message };
      revalidatePath("/");
      return { ok: true, error: null };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath("/");
  return { ok: true, error: null };
}

/** Lo que se puede marcar en un hilo sin que WhatsApp se entere. */
export type Marca = "no_leida" | "fijada" | "silenciada";

const COMO_SE_LLAMA: Record<Marca, string> = {
  no_leida: "dejar pendiente una conversación",
  fijada: "fijar una conversación",
  silenciada: "silenciar una conversación",
};

/**
 * Pone o quita una marca de la bandeja.
 *
 * Las tres son del CRM y de nadie más: no viajan a WhatsApp, el cliente no se
 * entera y no gastan nada de la API de Meta.
 *
 * `no_leida` tiene una vuelta más. Marcarla sin poner `sin_leer` en uno sería
 * encender un punto que el próximo refresco no sabría contar: el número rojo
 * de la barra suma mensajes, no hilos. Se le pone un uno para que la
 * conversación pese lo mismo que un mensaje sin abrir, que es lo que la
 * persona quiso decir al marcarla.
 */
export async function marcar(
  conversacionId: number,
  marca: Marca,
  puesta: boolean,
): Promise<ActionResult> {
  const supabase = await getServerClient();
  if (!supabase) return SIN_SESION;

  const cambio: Record<string, unknown> = { [marca]: puesta };

  if (marca === "no_leida") {
    if (!puesta) {
      cambio.sin_leer = 0;
    } else {
      /*
       * Un uno, salvo que ya hubiera más.
       *
       * Poner uno a secas parece inofensivo y borra información: un hilo con
       * cinco mensajes sin abrir que alguien marca pendiente pasaría a decir
       * «1», y esos cuatro no vuelven. Se lee lo que hay y se respeta.
       */
      const { data } = await supabase
        .from("conversaciones")
        .select("sin_leer")
        .eq("id", conversacionId)
        .maybeSingle();

      cambio.sin_leer = Math.max(Number(data?.sin_leer ?? 0), 1);
    }
  }

  const { error } = await supabase
    .from("conversaciones")
    .update(cambio)
    .eq("id", conversacionId);

  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") {
      return {
        ok: false,
        error:
          `Para ${COMO_SE_LLAMA[marca]} falta correr ` +
          "supabase/migrations/20261011120000_bandeja_marcas.sql en Supabase → SQL Editor.",
      };
    }
    return { ok: false, error: error.message };
  }

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
