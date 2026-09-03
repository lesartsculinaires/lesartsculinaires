"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { abrirOportunidad, altaLead } from "@/lib/crm/altaLead";
import type { Coincidencia } from "@/lib/duplicados";
import { anotarSeguimientoDeNota } from "@/lib/crm/notaConSeguimiento";
import { getServerClient, getUser } from "@/lib/supabase/server";
import {
  BALDE_WHATSAPP,
  CARPETA_SALIENTE,
  esDocumentoAceptado,
  tiposQueSePueden,
} from "@/lib/whatsapp/adjuntos";
import {
  enviarAudio,
  enviarDocumento,
  enviarImagen,
  enviarReaccion,
  enviarTexto,
  hayWhatsapp,
} from "@/lib/whatsapp/enviar";
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

/**
 * Reacciona a un mensaje del hilo, o le saca la reacción.
 *
 * ============================================================================
 * PRIMERO META, DESPUÉS LA BASE
 * ============================================================================
 *
 * Igual que responder, y por lo mismo: si se guardara primero, un envío
 * fallido dejaría en pantalla un corazón que el cliente nunca vio. Acá importa
 * más de lo que parece, porque una reacción no se relee: la asesora la pone,
 * ve que quedó puesta, y da por hecho que del otro lado se enteró.
 *
 * ============================================================================
 * LO QUE NO SE PUEDE REACCIONAR, Y POR QUÉ
 * ============================================================================
 *
 *   UNA NOTA INTERNA      no existe en WhatsApp. No tiene a quién mandarle la
 *                         reacción y el cliente no la vio nunca.
 *
 *   UN MENSAJE SIN wa_id  un envío que falló, o algo guardado antes de que
 *                         hubiera integración. Meta identifica el mensaje por
 *                         ese id: sin él no hay a qué reaccionar.
 *
 * Y la ventana de 24 horas vale igual que para un mensaje: un 👍 sobre algo de
 * hace tres días lo rechaza Meta. Eso lo contesta el propio envío, con el
 * mismo texto que ya explica la ventana en el resto de la bandeja.
 */
export async function reaccionar(
  mensajeId: number,
  /** Null saca la que haya puesta. */
  emoji: string | null,
): Promise<ActionResult> {
  const supabase = await getServerClient();
  const user = await getUser();
  if (!supabase || !user) return SIN_SESION;

  if (!hayWhatsapp()) {
    return { ok: false, error: "WhatsApp no está configurado en el servidor." };
  }

  const { data: mensaje, error } = await supabase
    .from("mensajes")
    .select("id, wa_id, privado, conversacion_id, conversaciones(telefono)")
    .eq("id", mensajeId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!mensaje) return { ok: false, error: "No se encontró el mensaje." };

  if (mensaje.privado) {
    return {
      ok: false,
      error: "Una nota interna no existe en WhatsApp, así que no se le puede reaccionar.",
    };
  }

  const waId = mensaje.wa_id ? String(mensaje.wa_id) : null;
  if (!waId) {
    return {
      ok: false,
      error: "Ese mensaje no llegó a salir por WhatsApp, así que no hay a qué reaccionar.",
    };
  }

  // El teléfono viene anidado; PostgREST lo devuelve como objeto o como
  // arreglo de uno según la relación, así que se aceptan las dos formas.
  const anidado = (mensaje as { conversaciones?: unknown }).conversaciones;
  const conv = (Array.isArray(anidado) ? anidado[0] : anidado) as
    | { telefono?: string | number }
    | null
    | undefined;
  const telefono = conv?.telefono == null ? null : String(conv.telefono);

  if (!telefono) return { ok: false, error: "No se encontró la conversación del mensaje." };

  const envio = await enviarReaccion(telefono, waId, emoji);
  if (!envio.ok) return { ok: false, error: envio.error };

  /*
   * Borrar y volver a poner, no actualizar.
   *
   * WhatsApp admite una sola reacción por lado y por mensaje: cambiar un ❤️
   * por un 👍 no son dos reacciones sino una que cambió. Hacerlo en dos pasos
   * deja el índice único como única regla y no necesita una política de
   * update, que sería una puerta más sobre una tabla que no la precisa.
   */
  const { error: errBorrado } = await supabase
    .from("reacciones")
    .delete()
    .eq("mensaje_id", mensajeId)
    .eq("direccion", "saliente");

  if (errBorrado) return { ok: false, error: porQueNoSeGuardo(errBorrado) };

  if (emoji) {
    const { error: errAlta } = await supabase.from("reacciones").insert({
      mensaje_id: mensajeId,
      direccion: "saliente",
      emoji,
      puesta_por: user.id,
    });

    if (errAlta) return { ok: false, error: porQueNoSeGuardo(errAlta) };
  }

  revalidatePath("/");
  return { ok: true, error: null };
}

/**
 * Por qué no se pudo guardar la reacción.
 *
 * La reacción ya salió a WhatsApp cuando esto se llama, así que el texto tiene
 * que decir las dos cosas: que del otro lado sí se vio, y qué falta acá. Sin
 * eso, quien lo lea va a volver a apretar creyendo que no pasó nada.
 */
function porQueNoSeGuardo(e: { code?: string; message?: string }): string {
  if (
    e.code === "PGRST205" ||
    e.code === "42P01" ||
    /Could not find the table|does not exist/i.test(e.message ?? "")
  ) {
    return (
      "La reacción le llegó al cliente, pero no se puede guardar en el CRM: falta " +
      "correr supabase/migrations/20261012120000_reacciones.sql en Supabase → SQL Editor."
    );
  }
  return `La reacción se envió, pero no se pudo guardar: ${e.message ?? "error desconocido"}`;
}

/**
 * Nota que sólo ve el equipo. No sale a WhatsApp.
 *
 * ------------------------------------------------------------------------
 * ADEMÁS QUEDA EN LA FICHA
 * ------------------------------------------------------------------------
 *
 * Antes vivía sólo en el hilo de la bandeja. El problema es que el seguimiento
 * de un cliente se lee en su ficha, no en su chat: quien abría la ficha para
 * ver qué se había hablado no encontraba nada, y lo anotado en la bandeja se
 * perdía para todos los que no estuvieran mirando ese hilo.
 *
 * Así que la misma nota se escribe también en la bitácora del lead. Queda en
 * los dos lados a propósito: en el chat para no perder el contexto de la
 * conversación, y en la ficha porque es ahí donde se arma la historia.
 *
 * Y como pasa por la bitácora, hereda lo que ya sabe hacer: una nota interna
 * que diga «recuperación» o «seguimiento de pago» deja su recordatorio igual
 * que si se hubiera escrito desde la ficha. Antes eso no pasaba, y el asesor
 * que lo escribía en la bandeja se quedaba sin el aviso.
 */
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

  await copiarNotaALaFicha(supabase, conversacionId, texto, autorId);

  revalidatePath("/");
  return { ok: true, error: null };
}

/**
 * Copia la nota interna a la bitácora del lead de esa conversación.
 *
 * No lanza y no devuelve error. La nota ya está guardada en el hilo, que es lo
 * que la persona vino a hacer; que además no haya llegado a la ficha es un
 * problema menor y decirle «no se guardó» la llevaría a escribirla dos veces.
 *
 * Si la conversación todavía no tiene lead —un número desconocido que nadie
 * convirtió— no hay ficha donde ponerla, y no pasa nada: la nota queda en el
 * hilo hasta que alguien lo convierta.
 */
async function copiarNotaALaFicha(
  supabase: NonNullable<Awaited<ReturnType<typeof getServerClient>>>,
  conversacionId: number,
  texto: string,
  autorId: string,
): Promise<void> {
  try {
    const { data: conv } = await supabase
      .from("conversaciones")
      .select("cliente_id")
      .eq("id", conversacionId)
      .maybeSingle();

    const clienteId = conv?.cliente_id == null ? null : Number(conv.cliente_id);
    if (clienteId == null) return;

    /*
     * El lead más reciente de esa persona.
     *
     * Si tiene varios, la nota va al que se está trabajando ahora, que es el
     * último. Ponerla en todos llenaría de ruido las fichas viejas, y ponerla
     * en el más antiguo la escondería justo donde nadie mira.
     */
    const { data: op } = await supabase
      .from("oportunidades")
      .select("id")
      .eq("cliente_id", clienteId)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!op) return;

    const { data: guardada } = await supabase
      .from("oportunidad_notas")
      .insert({
        oportunidad_id: Number(op.id),
        nota: texto,
        // Se marca de dónde vino para poder distinguirla en la bitácora: una
        // nota escrita en el chat y una escrita en la ficha se leen igual, y
        // saber cuál es cuál ayuda a reconstruir qué pasó.
        origen: "inbox",
        autor_id: autorId,
      })
      .select("id")
      .maybeSingle();

    await anotarSeguimientoDeNota(
      supabase,
      Number(op.id),
      texto,
      guardada?.id == null ? null : Number(guardada.id),
      autorId,
    );
  } catch {
    // Ver arriba: la nota del hilo vale más que su copia.
  }
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
 * Con el alta automática van a entrar números equivocados y proveedores. Para
 * dirección, borra el cliente creado —sólo si no tiene oportunidades, para no
 * llevarse por delante trabajo real— y archiva la conversación.
 *
 * ------------------------------------------------------------------------
 * PARA QUIEN NO ES DIRECCIÓN, ARCHIVA Y LO DICE
 * ------------------------------------------------------------------------
 *
 * Borrar es de dirección, y la base lo hace cumplir. El problema era cómo se
 * veía desde acá: el borrado no falla, simplemente no toca ninguna fila, así
 * que sin esta comprobación la asesora apretaba el botón, recibía un «listo» y
 * el lead seguía en Prospectos. Un permiso que se niega en silencio se lee
 * como un error del sistema, y lo que hace la gente es apretar otra vez.
 *
 * Lo útil se hace igual: la conversación se archiva, que es lo que saca el
 * ruido de la bandeja. Lo que queda pendiente se nombra.
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

  const { data: esAdmin } = await supabase.rpc("es_admin");
  const puedeBorrar = esAdmin === true;

  if (puedeBorrar && conv?.cliente_id != null) {
    await borrarLeadIntacto(supabase, Number(conv.cliente_id));

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

  if (!puedeBorrar && conv?.cliente_id != null) {
    // `ok` en falso porque hay algo que la persona quería y no pasó. El texto
    // dice qué sí se hizo, para que no vuelva a intentarlo creyendo que falló
    // todo.
    return {
      ok: false,
      error:
        "La conversación quedó archivada, pero el lead sigue en el tablero: " +
        "borrarlo es de dirección. Pedile a dirección que lo elimine.",
    };
  }

  return { ok: true, error: null };
}

/**
 * Borra el lead que abrió el robot, si nadie lo tocó todavía.
 *
 * Hace falta desde que los leads de WhatsApp se crean solos: sin esto, cada
 * proveedor y cada número equivocado dejaría un lead en Prospectos para
 * siempre, y «No era lead» limpiaría la mitad del desorden que vino a limpiar.
 *
 * «Intacto» es la parte importante, y por eso son cinco condiciones y no una.
 * Si alguien ya lo movió de etapa, le anotó algo, le puso monto o cobró una
 * reserva, entonces no es un número equivocado: es trabajo de una persona, y
 * este botón no puede borrarlo. En la duda no se borra nada y queda el lead,
 * que se arregla mirando; lo contrario se arregla llamando a alguien para
 * preguntarle qué había escrito.
 */
async function borrarLeadIntacto(
  supabase: SupabaseClient,
  clienteId: number,
): Promise<void> {
  const { data: ops } = await supabase
    .from("oportunidades")
    .select("id, etapa_id, valor_oportunidad, venta_cerrada, reserva, estado_id")
    .eq("cliente_id", clienteId);

  if (!ops || ops.length !== 1) return;
  const o = ops[0] as Record<string, unknown>;

  const { data: prospectos } = await supabase
    .from("etapas")
    .select("id")
    .ilike("nombre", "prospectos")
    .limit(1)
    .maybeSingle();

  const enProspectos =
    prospectos != null && Number(o.etapa_id) === Number((prospectos as { id: number }).id);
  const sinPlata =
    !Number(o.valor_oportunidad) && !Number(o.venta_cerrada) && !Number(o.reserva);
  const sinEstado = o.estado_id == null;

  const { count: notas } = await supabase
    .from("oportunidad_notas")
    .select("id", { count: "exact", head: true })
    .eq("oportunidad_id", o.id);

  if (enProspectos && sinPlata && sinEstado && !notas) {
    await supabase.from("oportunidades").delete().eq("id", o.id);
  }
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
): Promise<ResultadoChat> {
  const supabase = await getServerClient();
  if (!supabase) return SIN_SESION;

  const r = await hiloPara(supabase, clienteId, telefono);
  if (r.ok) revalidatePath("/");
  return r;
}

export interface ResultadoChat {
  ok: boolean;
  error: string | null;
  conversacionId?: number;
  yaExistia?: boolean;
  /** Contactos que ya tienen ese número o ese nombre, cuando frenan el alta. */
  coincidencias?: Coincidencia[];
}

/**
 * Busca el hilo de ese número o lo abre.
 *
 * Está aparte porque lo usan las dos puertas: abrirle el chat a alguien que ya
 * está en la base, y darlo de alta y abrírselo de una. Si cada una lo hiciera
 * por su cuenta, una de las dos terminaría creando el segundo hilo de una
 * persona el día que alguien tocara sólo una.
 */
async function hiloPara(
  supabase: NonNullable<Awaited<ReturnType<typeof getServerClient>>>,
  clienteId: number,
  telefono: string,
): Promise<ResultadoChat> {
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

  return { ok: true, error: null, conversacionId: Number(creada.id), yaExistia: false };
}

/**
 * Da de alta a alguien que no está en la base y le abre el chat.
 *
 * POR QUÉ NO ES UN `insert` EN `clientes`
 *
 * El CRM lista oportunidades, no personas: Clientes, Pipeline, Dashboard y
 * todas las métricas salen de `vw_pipeline`. Un cliente sin oportunidad no
 * aparece en ninguna de esas pantallas —existiría sólo en la bandeja—, así que
 * el alta tiene que crear las dos cosas.
 *
 * Por eso se reusa `altaLead`, que es el mismo camino que usan la pantalla de
 * Clientes, la importación y la API de n8n: son cuatro pasos encadenados —
 * revisar duplicados, crear la persona, asignarle su código CRM, colgarle la
 * oportunidad— y hacerlos por separado acá dejaría la base distinta según por
 * dónde entró el lead. Ese es exactamente el problema que `altaLead` existe
 * para evitar.
 */
export async function altaYChat(
  datos: { nombre: string; telefono: string; correo: string | null; vendedorId: number | null },
  /** Dar de alta aunque se parezca a alguien que ya está. */
  forzar = false,
): Promise<ResultadoChat> {
  const supabase = await getServerClient();
  if (!supabase) return SIN_SESION;

  const numero = datos.telefono.replace(/\D/g, "");
  if (numero.length < 8 || numero.length > 15) {
    return { ok: false, error: "El número tiene que tener entre 8 y 15 dígitos, con código de país." };
  }

  const catalogo = await porDefecto(supabase);

  const alta = await altaLead(
    supabase,
    {
      nombre: datos.nombre,
      // Se guarda el número ya armado: es el que WhatsApp usa y el que va a
      // llegar en el webhook cuando esa persona conteste. Guardar el local
      // haría que su propio mensaje no encontrara su ficha.
      telefono: numero,
      correo: datos.correo,
      vendedor_id: datos.vendedorId,
      producto_id: null,
      territorio_id: null,
      canal_id: catalogo.canalId,
      etapa_id: catalogo.etapaId,
      estado_id: catalogo.estadoId,
      fecha_registro: new Date().toISOString().slice(0, 10),
      fecha_cierre: null,
      valor_oportunidad: null,
      descuento_promocion: null,
    },
    forzar,
  );

  if (!alta.ok || alta.clienteId == null) {
    return { ok: false, error: alta.error, coincidencias: alta.coincidencias };
  }

  const hilo = await hiloPara(supabase, alta.clienteId, numero);

  // El alta salió bien aunque el hilo falle: decir que no se creó nada haría
  // que se intentara otra vez y quedara la persona duplicada.
  if (!hilo.ok) {
    return {
      ok: false,
      error: `Se dio de alta a ${datos.nombre.trim()}, pero no se pudo abrir el chat: ${hilo.error}`,
    };
  }

  revalidatePath("/");
  return hilo;
}

/**
 * Los valores con que nace una oportunidad abierta desde la bandeja.
 *
 * Se resuelven por nombre y no por id fijo: los catálogos son datos y sus
 * números cambian entre instalaciones. Si alguno no está, queda en null, que
 * la ficha muestra como vacío y se completa después.
 */
async function porDefecto(
  supabase: NonNullable<Awaited<ReturnType<typeof getServerClient>>>,
): Promise<{ canalId: number | null; etapaId: number | null; estadoId: number | null }> {
  const [canales, etapas, estados] = await Promise.all([
    supabase.from("canales").select("id, nombre"),
    supabase.from("etapas").select("id, nombre, orden").order("orden"),
    supabase.from("estados").select("id, nombre, es_final").order("id"),
  ]);

  const porNombre = (filas: { id: unknown; nombre: unknown }[] | null, busca: string) =>
    filas?.find((f) => String(f.nombre).toLowerCase() === busca)?.id ?? null;

  return {
    // Entró por WhatsApp: es lo único que se sabe con certeza de este lead.
    canalId: Number(porNombre(canales.data, "whatsapp")) || null,
    // La primera etapa del embudo, sea cual sea su nombre.
    etapaId: etapas.data?.[0] ? Number(etapas.data[0].id) : null,
    // El primer estado que no cierra la oportunidad.
    estadoId: estados.data?.find((e) => e.es_final !== true)?.id
      ? Number(estados.data.find((e) => e.es_final !== true)!.id)
      : null,
  };
}

export interface ResultadoAbrirLead extends ActionResult {
  /** La oportunidad que quedó abierta. Es lo que la bandeja necesita para
   *  mostrar la ficha sin cambiar de pantalla. */
  oportunidadId: number | null;
}

/**
 * Le abre el lead a un hilo que tiene contacto pero no oportunidad.
 *
 * ============================================================================
 * POR QUÉ HACE FALTA UN BOTÓN PARA ESTO
 * ============================================================================
 *
 * El webhook abre el lead solo cuando entra el primer mensaje de un número
 * nuevo, y está escrito para no tumbarse si eso falla: guarda el mensaje,
 * abre la conversación y sigue. El comentario de ahí dice que el lead «se
 * arregla con un clic desde la bandeja». Ese clic no existía.
 *
 * Cuando falta, la persona queda a medio camino: aparece en la bandeja —la
 * conversación tiene su contacto— pero no en Clientes, ni en el Pipeline, ni
 * en el tablero, porque todas esas pantallas listan oportunidades. Hoy hay dos
 * así en la base de la escuela.
 *
 * Y era justo lo que se veía al apretar «Ver ficha»: no había ficha que abrir,
 * así que la bandeja saltaba a Clientes… donde esa persona tampoco está. El
 * hilo abierto se perdía y no se ganaba nada a cambio.
 *
 * ----------------------------------------------------------------------------
 * VOLVER A APRETARLO NO DUPLICA
 * ----------------------------------------------------------------------------
 *
 * Si el contacto ya tiene una oportunidad se devuelve ésa y no se escribe
 * nada. Dos asesoras mirando el mismo hilo pueden apretar a la vez y las dos
 * terminan en la misma ficha.
 */
export async function abrirLeadDelHilo(
  conversacionId: number,
): Promise<ResultadoAbrirLead> {
  const supabase = await getServerClient();
  if (!supabase) return { ...SIN_SESION, oportunidadId: null };

  const { data: conv, error: errConv } = await supabase
    .from("conversaciones")
    .select("id, telefono, nombre_perfil, cliente_id, vendedor_id")
    .eq("id", conversacionId)
    .maybeSingle();

  if (errConv) return { ok: false, error: errConv.message, oportunidadId: null };
  if (!conv) return { ok: false, error: "No se encontró la conversación.", oportunidadId: null };

  const telefono = String(conv.telefono ?? "");
  const nombre = (conv.nombre_perfil ? String(conv.nombre_perfil) : "").trim() || telefono;
  /*
   * De quién es el lead: de quien ya tiene el hilo.
   *
   * No se sortea. El reparto es para los que entran, y éste ya entró: si
   * alguien viene atendiendo la conversación, mandársela a otra persona al
   * abrirle el lead sería quitárselo sin avisar. Sin dueño, queda sin dueño,
   * que es lo que todo el equipo puede ver y agarrar.
   */
  const vendedorId = conv.vendedor_id == null ? null : Number(conv.vendedor_id);
  const catalogo = await porDefecto(supabase);
  const hoy = new Date().toISOString().slice(0, 10);

  /*
   * Sin contacto hay que resolverlo primero, y buscándolo antes de crearlo.
   *
   * El número es el dato que dice si esta persona ya está en el CRM, y se
   * compara por los últimos ocho dígitos porque los teléfonos guardados están
   * escritos de todas las formas —«7797-2598», «+503 7797 2598»,
   * «50377972598»—. Es el mismo criterio que usa el webhook.
   *
   * Encontrarla no es un problema a resolver: es el caso bueno. La
   * conversación se le cuelga a la ficha que ya tiene, en vez de abrirle una
   * segunda al lado.
   */
  let clienteId: number;

  if (conv.cliente_id != null) {
    clienteId = Number(conv.cliente_id);
  } else {
    const soloDigitos = telefono.replace(/\D/g, "");
    const { data: yaEsta } =
      soloDigitos.length >= 8
        ? await supabase
            .from("clientes")
            .select("id")
            .like("telefono", `%${soloDigitos.slice(-8)}`)
            .limit(1)
            .maybeSingle()
        : { data: null };

    if (yaEsta) {
      clienteId = Number(yaEsta.id);
    } else {
      /*
       * Y si no está, se crea por `altaLead` —el mismo camino del alta de
       * Clientes, de la importación y de la API—, que crea la persona y su
       * oportunidad juntas y le asigna el código CRM.
       *
       * Va forzado a propósito. La búsqueda por número de acá arriba ya
       * descartó que sea alguien que está; lo que `altaLead` frenaría a esta
       * altura es un tocayo, y dejar sin lead a una segunda «Karla» porque ya
       * hay una es peor que tener dos Karlas distintas, que es lo que son.
       */
      const alta = await altaLead(
        supabase,
        {
          nombre,
          telefono: soloDigitos,
          correo: null,
          vendedor_id: vendedorId,
          producto_id: null,
          territorio_id: null,
          canal_id: catalogo.canalId,
          etapa_id: catalogo.etapaId,
          estado_id: catalogo.estadoId,
          fecha_registro: hoy,
          fecha_cierre: null,
          valor_oportunidad: null,
          descuento_promocion: null,
        },
        true,
      );

      if (!alta.ok || alta.clienteId == null || alta.oportunidadId == null) {
        return { ok: false, error: alta.error, oportunidadId: null };
      }

      const { error: errVinculo } = await supabase
        .from("conversaciones")
        .update({ cliente_id: alta.clienteId })
        .eq("id", conversacionId);

      if (errVinculo) return { ok: false, error: errVinculo.message, oportunidadId: null };

      revalidatePath("/");
      return { ok: true, error: null, oportunidadId: alta.oportunidadId };
    }

    const { error: errVinculo } = await supabase
      .from("conversaciones")
      .update({ cliente_id: clienteId })
      .eq("id", conversacionId);

    if (errVinculo) return { ok: false, error: errVinculo.message, oportunidadId: null };
  }

  // La que ya tiene, si tiene. La más nueva, que es la que se está hablando.
  const { data: ya } = await supabase
    .from("oportunidades")
    .select("id")
    .eq("cliente_id", clienteId)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (ya) return { ok: true, error: null, oportunidadId: Number(ya.id) };

  const r = await abrirOportunidad(supabase, clienteId, {
    vendedor_id: vendedorId,
    producto_id: null,
    territorio_id: null,
    canal_id: catalogo.canalId,
    etapa_id: catalogo.etapaId,
    estado_id: catalogo.estadoId,
    fecha_registro: hoy,
    fecha_cierre: null,
    valor_oportunidad: null,
    descuento_promocion: null,
  });

  if (!r.ok || r.oportunidadId == null) {
    return { ok: false, error: r.error, oportunidadId: null };
  }

  revalidatePath("/");
  return { ok: true, error: null, oportunidadId: r.oportunidadId };
}

/** Lo que hace falta saber de un archivo ya subido al bucket. */
export interface ArchivoSubido {
  conversacionId: number;
  /** Ruta dentro del bucket, bajo «saliente/». La devolvió la subida. */
  ruta: string;
  nombre: string;
  mime: string;
  bytes: number;
  /** El mensaje que lo acompaña. Puede ir vacío. */
  pie: string;
}

/**
 * Manda por WhatsApp un archivo que el navegador ya subió al bucket.
 *
 * ------------------------------------------------------------------------
 * POR QUÉ LLEGA UNA RUTA Y NO EL ARCHIVO
 * ------------------------------------------------------------------------
 *
 * Porque el archivo no cabía. Antes venía adentro del formulario, y el cuerpo
 * de una petición a Netlify se corta en 6 MB: con eso el tope real eran 4, muy
 * por debajo de los 100 que acepta WhatsApp. Ahora el navegador sube derecho a
 * Supabase —que no pasa por Netlify— y acá llega nada más la ruta.
 *
 * De acá para adelante el servidor tampoco mueve los bytes: le firma a Meta
 * una dirección que caduca y Meta va a buscar el archivo solo. Por eso mandar
 * un archivo grande tarda lo mismo que uno chico, y por eso no hay riesgo de que la
 * función se pase de los diez segundos que tiene para contestar.
 *
 * ------------------------------------------------------------------------
 * SI ALGO FALLA, NO QUEDA BASURA
 * ------------------------------------------------------------------------
 *
 * El archivo ya está subido cuando esto empieza, así que cualquier salida por
 * error tiene que borrarlo. Son archivos de decenas de megas: los que se
 * dejaran tirados no los ve nadie y no los borra nadie.
 */
export async function enviarArchivo(datos: ArchivoSubido): Promise<ActionResult> {
  const supabase = await getServerClient();
  const user = await getUser();
  if (!supabase || !user) return SIN_SESION;

  const limpiar = async () => {
    await supabase.storage.from(BALDE_WHATSAPP).remove([datos.ruta]);
  };

  // La ruta la manda el navegador, así que no se le cree. La política de
  // Supabase ya impide escribir fuera de «saliente/», pero acá se comprueba
  // igual: esta ruta termina guardada en `mensajes.media_ruta`, y desde ahí se
  // firman enlaces. Sin esto, una ruta armada a mano serviría para hacer que
  // el CRM firme cualquier archivo del bucket, incluido lo que mandó un
  // cliente a otra conversación.
  if (!datos.ruta.startsWith(`${CARPETA_SALIENTE}/`)) {
    return { ok: false, error: "Ruta de archivo no válida." };
  }

  const esImagen = datos.mime.startsWith("image/");
  const esDocumento = esDocumentoAceptado(datos.mime);
  // Las notas de voz entran por la misma puerta que las fotos: se graban en el
  // navegador, se suben al bucket y el servidor sólo maneja la ruta. Lo que
  // cambia es qué se le manda a Meta y cómo queda escrito en el hilo.
  const esAudio = datos.mime.startsWith("audio/");

  if (!esImagen && !esDocumento && !esAudio) {
    await limpiar();
    return {
      ok: false,
      error: `WhatsApp no acepta este tipo de archivo. Se pueden mandar fotos, ${tiposQueSePueden()}.`,
    };
  }

  if (!hayWhatsapp()) {
    await limpiar();
    return { ok: false, error: "WhatsApp no está configurado en el servidor." };
  }

  const { data: conv } = await supabase
    .from("conversaciones")
    .select("id, telefono")
    .eq("id", datos.conversacionId)
    .maybeSingle();

  if (!conv) {
    await limpiar();
    return { ok: false, error: "No se encontró la conversación." };
  }

  /*
   * Cinco minutos, que es mucho más de lo que Meta tarda y mucho menos de lo
   * que dura un descuido. Meta busca el archivo mientras contesta la llamada
   * —un par de segundos—, así que la firma está viva apenas el rato necesario
   * y después la dirección no sirve más para nadie.
   */
  const { data: firmado, error: errFirma } = await supabase.storage
    .from(BALDE_WHATSAPP)
    .createSignedUrl(datos.ruta, 300);

  if (errFirma || !firmado?.signedUrl) {
    await limpiar();
    return { ok: false, error: `No se pudo preparar el archivo: ${errFirma?.message ?? "sin firma"}` };
  }

  const envio = esAudio
    ? // El audio va sin pie: Meta no lo acepta en este tipo de mensaje.
      await enviarAudio(String(conv.telefono), {
        enlace: firmado.signedUrl,
        mime: datos.mime,
        bytes: datos.bytes,
      })
    : await (esImagen ? enviarImagen : enviarDocumento)(
        String(conv.telefono),
        { enlace: firmado.signedUrl, mime: datos.mime, nombre: datos.nombre, bytes: datos.bytes },
        datos.pie,
      );

  if (!envio.ok) {
    await limpiar();
    return { ok: false, error: envio.error };
  }

  // El archivo se queda donde está: es la copia que el hilo muestra. Meta no
  // devuelve lo que uno mismo mandó, así que sin ella el mensaje saliente
  // quedaría como un hueco.
  const { error: errGuardar } = await supabase.from("mensajes").insert({
    conversacion_id: datos.conversacionId,
    wa_id: envio.waId,
    direccion: "saliente",
    // El mismo vocabulario que usa Meta en lo que entra, para que el hilo no
    // tenga que distinguir si el mensaje lo mandamos nosotros o el cliente.
    tipo: esAudio ? "audio" : esImagen ? "image" : "document",
    texto: esAudio ? null : datos.pie.trim() || null,
    estado: "enviado",
    enviado_por: user.id,
    media_ruta: datos.ruta,
    media_mime: datos.mime,
    media_nombre: datos.nombre,
  });

  // Acá el mensaje ya lo tiene el cliente. El archivo no se borra aunque la
  // fila haya fallado: es lo único que queda de lo que se mandó.
  if (errGuardar) {
    return {
      ok: false,
      error: `Se envió, pero no se pudo guardar en la ficha: ${errGuardar.message}`,
    };
  }

  await supabase
    .from("conversaciones")
    .update({
      // Sin pie, en la lista de chats se lee el nombre del archivo y no un
      // «Documento» a secas: entre cinco hilos, «Lista de precios.pdf» dice
      // cuál es cuál y la palabra sola no dice nada.
      ultimo_texto: (esAudio
        ? "Nota de voz"
        : datos.pie.trim() || (esImagen ? "Foto" : datos.nombre)
      ).slice(0, 200),
      ultimo_mensaje_en: new Date().toISOString(),
      sin_leer: 0,
    })
    .eq("id", datos.conversacionId);

  revalidatePath("/");
  return { ok: true, error: null };
}

/**
 * Guarda en la ficha del cliente una foto que llegó por WhatsApp.
 *
 * Es el paso que faltaba entre las dos mitades: la captura de una
 * transferencia llega al chat y ahí se queda, mientras la documentación del
 * cliente vive en los adjuntos de su oportunidad. Sin esto hay que bajar la
 * foto y volver a subirla a mano.
 *
 * Se copia y no se mueve: el hilo tiene que seguir mostrando lo que la persona
 * mandó, en el orden en que lo mandó. Son dos usos distintos del mismo archivo.
 */
export async function guardarEnFicha(
  mensajeId: number,
  oportunidadId: number,
): Promise<ActionResult> {
  const supabase = await getServerClient();
  const user = await getUser();
  if (!supabase || !user) return SIN_SESION;

  const { data: mensaje } = await supabase
    .from("mensajes")
    .select("id, media_ruta, media_mime, media_nombre, creado_en")
    .eq("id", mensajeId)
    .maybeSingle();

  if (!mensaje?.media_ruta) {
    return { ok: false, error: "Ese mensaje no tiene ningún archivo guardado." };
  }

  const { data: archivo, error: errBajar } = await supabase.storage
    .from("whatsapp")
    .download(String(mensaje.media_ruta));

  if (errBajar || !archivo) {
    return { ok: false, error: `No se pudo leer el archivo: ${errBajar?.message ?? "no está"}` };
  }

  const mime = mensaje.media_mime ? String(mensaje.media_mime) : "application/octet-stream";
  // Un nombre que diga de dónde salió: en la ficha, al lado de documentos que
  // alguien eligió y nombró, «foto de WhatsApp del 3 de marzo» ubica.
  const nombre = mensaje.media_nombre
    ? String(mensaje.media_nombre)
    : `WhatsApp ${new Date(String(mensaje.creado_en)).toLocaleDateString("es-SV")}${extensionDeMime(mime)}`;

  const ruta = `${oportunidadId}/${crypto.randomUUID()}${extensionDeMime(mime)}`;

  const { error: errSubir } = await supabase.storage
    .from("adjuntos")
    .upload(ruta, archivo, { contentType: mime });

  if (errSubir) return { ok: false, error: `No se pudo guardar en la ficha: ${errSubir.message}` };

  const { error } = await supabase.from("adjuntos").insert({
    oportunidad_id: oportunidadId,
    ruta,
    nombre: nombre.slice(0, 200),
    tipo_mime: mime,
    tamano_bytes: archivo.size,
    subido_por: user.id,
  });

  if (error) {
    // La fila no entró: el archivo suelto sería basura que nadie ve ni borra.
    await supabase.storage.from("adjuntos").remove([ruta]);
    return { ok: false, error: error.message };
  }

  revalidatePath("/");
  return { ok: true, error: null };
}

/** La extensión que le toca a un tipo, para que el archivo abra bien al bajarlo. */
function extensionDeMime(mime: string): string {
  const tabla: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.ms-powerpoint": ".ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "text/plain": ".txt",
  };
  return tabla[mime.split(";")[0].trim()] ?? "";
}
