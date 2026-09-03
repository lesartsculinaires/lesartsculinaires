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

/*
 * Acá vivía `crearLeadDesdeConversacion`, y se fue por lo que NO hacía.
 *
 * Se llamaba «crear lead» y creaba nada más la fila de `clientes`. Un cliente
 * sin oportunidad no aparece en Clientes, ni en el Pipeline, ni en el tablero
 * —esas pantallas listan oportunidades—, así que la persona quedaba existiendo
 * sólo en la bandeja: justo el estado que después hacía que «Ver ficha» no
 * tuviera ficha que abrir.
 *
 * No la llamaba nadie, lo que evitó que hiciera daño, y ese es el motivo de
 * borrarla y no de dejarla: la próxima pantalla que necesitara esto la habría
 * encontrado por el nombre y habría heredado el hueco.
 *
 * Lo que hace falta está en `abrirLeadDelHilo`, en `inbox-actions.ts`, que
 * crea las dos cosas por el mismo camino que el resto del CRM.
 */
