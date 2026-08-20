"use server";

import { revalidatePath } from "next/cache";

import { altaLead } from "@/lib/crm/altaLead";
import type { Coincidencia } from "@/lib/duplicados";
import { getServerClient, getUser } from "@/lib/supabase/server";
import {
  TOPE_IMAGEN_BYTES,
  enviarImagen,
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

/**
 * Manda una foto por WhatsApp.
 *
 * El archivo sí pasa por el servidor, a diferencia de los adjuntos de la ficha
 * —que el navegador sube directo a Supabase—, y no hay alternativa: Meta pide
 * el archivo con el token, y el token no puede salir del servidor. Por eso el
 * tope es el de Meta para imágenes, que además entra en el cuerpo que aceptan
 * las funciones de Netlify.
 *
 * Mismo orden que al responder con texto: primero sale, después se guarda. Al
 * revés, un fallo de envío dejaría en el hilo una foto que el cliente no
 * recibió.
 */
export async function enviarFoto(datos: FormData): Promise<ActionResult> {
  const archivo = datos.get("archivo");
  const conversacionId = Number(datos.get("conversacionId"));
  const pie = String(datos.get("pie") ?? "");

  if (!(archivo instanceof File)) return { ok: false, error: "No llegó ninguna foto." };
  if (!Number.isFinite(conversacionId)) return { ok: false, error: "Conversación no válida." };

  if (!archivo.type.startsWith("image/")) {
    return { ok: false, error: "Sólo se pueden mandar fotos por acá." };
  }
  if (archivo.size > TOPE_IMAGEN_BYTES) {
    return {
      ok: false,
      error: `WhatsApp no acepta imágenes de más de ${TOPE_IMAGEN_BYTES / 1024 / 1024} MB.`,
    };
  }

  const supabase = await getServerClient();
  const user = await getUser();
  if (!supabase || !user) return SIN_SESION;

  if (!hayWhatsapp()) {
    return { ok: false, error: "WhatsApp no está configurado en el servidor." };
  }

  const { data: conv } = await supabase
    .from("conversaciones")
    .select("id, telefono")
    .eq("id", conversacionId)
    .maybeSingle();

  if (!conv) return { ok: false, error: "No se encontró la conversación." };

  const bytes = await archivo.arrayBuffer();

  const envio = await enviarImagen(
    String(conv.telefono),
    { bytes, mime: archivo.type, nombre: archivo.name },
    pie,
  );

  if (!envio.ok) return { ok: false, error: envio.error };

  // Se guarda una copia en el balde para poder verla en el hilo. Meta no
  // devuelve la foto que uno mismo mandó, así que sin esta copia el mensaje
  // saliente quedaría como un hueco.
  let ruta: string | null = null;
  const nombreArchivo = `${crypto.randomUUID()}${extensionDeMime(archivo.type)}`;
  const { error: errSubir } = await supabase.storage
    .from("whatsapp")
    .upload(`wa/${conversacionId}/${nombreArchivo}`, bytes, { contentType: archivo.type });

  if (!errSubir) ruta = `wa/${conversacionId}/${nombreArchivo}`;

  const { error: errGuardar } = await supabase.from("mensajes").insert({
    conversacion_id: conversacionId,
    wa_id: envio.waId,
    direccion: "saliente",
    tipo: "image",
    texto: pie.trim() || null,
    estado: "enviado",
    enviado_por: user.id,
    media_ruta: ruta,
    media_mime: archivo.type,
    media_nombre: archivo.name,
  });

  if (errGuardar) {
    return {
      ok: false,
      error: `Se envió, pero no se pudo guardar en la ficha: ${errGuardar.message}`,
    };
  }

  await supabase
    .from("conversaciones")
    .update({
      ultimo_texto: (pie.trim() || "Foto").slice(0, 200),
      ultimo_mensaje_en: new Date().toISOString(),
      sin_leer: 0,
    })
    .eq("id", conversacionId);

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
  };
  return tabla[mime.split(";")[0].trim()] ?? "";
}
