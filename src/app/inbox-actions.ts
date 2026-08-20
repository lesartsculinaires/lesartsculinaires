"use server";

import { revalidatePath } from "next/cache";

import { getServerClient, getUser } from "@/lib/supabase/server";
import { enviarTexto, hayWhatsapp } from "@/lib/whatsapp/enviar";
import type { ActionResult } from "@/app/actions";

/**
 * La bandeja: responder, asignar y cerrar.
 *
 * El CRM habla con Meta directamente. Hubo un tiempo en que podía salir por
 * Chatwoot, mientras se evaluaba dejarlo de puente; esa rama ya no está, y con
 * ella se fue la única razón por la que responder tenía que preguntarse por
 * dónde mandar el mensaje.
 */

const SIN_SESION: ActionResult = {
  ok: false,
  error: "Sesión no válida. Volvé a iniciar sesión.",
};

/** Si el servidor puede mandar mensajes hoy. */
export const salidaDisponible = async (): Promise<boolean> => hayWhatsapp();

/**
 * Responde por WhatsApp.
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

  // Una nota interna no se manda a nadie: es del equipo. Se resuelve antes de
  // buscar la conversación entera porque no necesita el teléfono ni que
  // WhatsApp esté configurado.
  if (privado) return await guardarNotaInterna(supabase, conversacionId, cuerpo, user.id);

  if (!hayWhatsapp()) {
    return { ok: false, error: "WhatsApp no está configurado en el servidor." };
  }

  const { data: conv, error } = await supabase
    .from("conversaciones")
    .select("id, telefono")
    .eq("id", conversacionId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!conv) return { ok: false, error: "No se encontró la conversación." };

  const envio = await enviarTexto(String(conv.telefono), cuerpo);
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
    return {
      ok: false,
      error: `Se envió, pero no se pudo guardar en la ficha: ${errGuardar.message}`,
    };
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

/**
 * Abrir, poner en pendiente o resolver.
 *
 * Los tres nombres vienen de cuando la bandeja se reflejaba en Chatwoot. Se
 * quedan porque describen bien el trabajo —hay hilos abiertos, hilos esperando
 * algo y hilos terminados— y renombrarlos obligaría a migrar las filas que ya
 * están guardadas con esos valores.
 */
export async function resolver(
  conversacionId: number,
  estado: "open" | "pending" | "resolved",
): Promise<ActionResult> {
  const supabase = await getServerClient();
  if (!supabase) return SIN_SESION;

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

/**
 * Los enlaces para ver las fotos y documentos de un hilo.
 *
 * El bucket es privado, así que cada archivo se sirve con una dirección
 * firmada que caduca. Se piden todas juntas al abrir la conversación: firmar
 * de a una sería un viaje por cada foto, y un hilo con diez comprobantes
 * tardaría en abrirse.
 *
 * No se firman al cargar la bandeja entera porque serían cientos de firmas
 * para archivos que nadie va a mirar, y caducarían antes de que alguien
 * llegue a ese hilo.
 */
export async function urlsDeMedia(rutas: string[]): Promise<Record<string, string>> {
  if (rutas.length === 0) return {};

  const supabase = await getServerClient();
  if (!supabase) return {};

  const { data } = await supabase.storage
    .from("whatsapp")
    .createSignedUrls(rutas, VIGENCIA_MEDIA_S);

  const porRuta: Record<string, string> = {};
  for (const f of data ?? []) {
    if (f.path && f.signedUrl) porRuta[f.path] = f.signedUrl;
  }
  return porRuta;
}

/**
 * Una hora. Alcanza de sobra para mirar un hilo y no deja una dirección viva
 * dando vueltas si alguien la copia de la barra del navegador.
 */
const VIGENCIA_MEDIA_S = 60 * 60;

/**
 * Abre un chat con alguien que ya está en la base.
 *
 * Es «buscar o crear»: si ese número ya tiene conversación se devuelve la que
 * hay, y si no se abre una. Nunca dos para la misma persona —eso partiría su
 * historia en dos hilos y el asesor leería la mitad.
 *
 * NO manda ningún mensaje. Sólo deja el hilo abierto y listo. Lo que se pueda
 * escribir ahí lo decide WhatsApp: si esa persona nunca escribió, la única
 * salida es una plantilla aprobada, y la bandeja lo dice.
 *
 * El número llega ya armado desde la pantalla, no se saca acá del cliente: la
 * conversión de «7100-2233» a internacional es una suposición, y quien abre el
 * chat tiene que haberla visto antes de que se escriba a nadie.
 */
export async function abrirChat(
  clienteId: number,
  telefono: string,
): Promise<{ ok: boolean; error: string | null; conversacionId?: number; yaExistia?: boolean }> {
  const supabase = await getServerClient();
  if (!supabase) return SIN_SESION;

  const numero = telefono.replace(/\D/g, "");
  if (numero.length < 8 || numero.length > 15) {
    return { ok: false, error: "El número tiene que tener entre 8 y 15 dígitos, con código de país." };
  }

  const { data: existente, error: errBuscar } = await supabase
    .from("conversaciones")
    .select("id")
    .eq("telefono", numero)
    .maybeSingle();

  if (errBuscar) return { ok: false, error: errBuscar.message };

  if (existente) {
    // Si la conversación estaba archivada o suelta, se la trae de vuelta y se
    // la vincula: abrir un chat con alguien es querer atenderlo ahora.
    await supabase
      .from("conversaciones")
      .update({ archivada: false, cliente_id: clienteId })
      .eq("id", Number(existente.id));

    revalidatePath("/");
    return { ok: true, error: null, conversacionId: Number(existente.id), yaExistia: true };
  }

  const { data: cliente } = await supabase
    .from("clientes")
    .select("nombre")
    .eq("id", clienteId)
    .maybeSingle();

  const { data: creada, error } = await supabase
    .from("conversaciones")
    .insert({
      telefono: numero,
      // El nombre del CRM, no el del perfil de WhatsApp: todavía no lo sabemos
      // porque esa persona nunca escribió. Cuando escriba, el webhook lo pisa.
      nombre_perfil: cliente?.nombre ? String(cliente.nombre) : null,
      cliente_id: clienteId,
      ultimo_mensaje_en: new Date().toISOString(),
      sin_leer: 0,
    })
    .select("id")
    .single();

  if (error) {
    // 23505: alguien lo abrió al mismo tiempo desde otra sesión.
    if (error.code === "23505") {
      const { data: ya } = await supabase
        .from("conversaciones")
        .select("id")
        .eq("telefono", numero)
        .maybeSingle();
      if (ya) return { ok: true, error: null, conversacionId: Number(ya.id), yaExistia: true };
    }
    // 42501: falta la política que deja abrir chats desde el CRM. Sin esto el
    // asesor leería el error crudo de Postgres, que no dice qué hacer.
    if (error.code === "42501") {
      return {
        ok: false,
        error: "Falta correr la migración 20260901120000_abrir_chat.sql en Supabase.",
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/");
  return { ok: true, error: null, conversacionId: Number(creada.id), yaExistia: false };
}
