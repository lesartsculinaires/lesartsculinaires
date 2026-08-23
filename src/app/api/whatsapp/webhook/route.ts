import { NextResponse, type NextRequest } from "next/server";

import { abrirOportunidad } from "@/lib/crm/altaLead";
import { sortear, yaEsLead } from "@/lib/reparto";
import { hoyEnSalvador } from "@/lib/seguimientos";
import { getAdminClient } from "@/lib/supabase/admin";
import { firmaValida } from "@/lib/whatsapp/firma";
import { bajarMedia, rutaMedia } from "@/lib/whatsapp/media";
import { leerWebhook, resumen, type MensajeEntrante } from "@/lib/whatsapp/mensajes";

/** Nunca cachear: cada llamada trae mensajes distintos. */
export const dynamic = "force-dynamic";

/**
 * Alta del webhook.
 *
 * Meta llama esta URL una vez, al configurarla, con un token que uno mismo
 * eligió y un desafío. Si el token coincide, hay que devolver el desafío tal
 * cual y en texto plano; cualquier otra cosa y Meta no acepta la URL.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const esperado = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!esperado) {
    return new NextResponse("Falta WHATSAPP_VERIFY_TOKEN en el servidor", { status: 500 });
  }

  if (q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === esperado) {
    return new NextResponse(q.get("hub.challenge") ?? "", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }

  return new NextResponse("Token de verificación incorrecto", { status: 403 });
}

/**
 * Mensajes entrantes.
 *
 * Dos cosas gobiernan el diseño de acá:
 *
 * 1. Se verifica la firma antes de mirar el contenido. La URL es pública, así
 *    que sin eso cualquiera podría inventar conversaciones enteras.
 *
 * 2. Se responde 200 salvo que la firma falle. Meta reintenta cuando recibe
 *    un error y, si insiste, desactiva el webhook; un mensaje raro que no
 *    supimos leer no vale perder la integración. Lo que falla queda en el
 *    registro del servidor, no en un reintento infinito.
 */
export async function POST(req: NextRequest) {
  const secreto = process.env.WHATSAPP_APP_SECRET;
  if (!secreto) {
    console.error("[whatsapp] falta WHATSAPP_APP_SECRET; se rechaza el webhook");
    return new NextResponse("sin configurar", { status: 500 });
  }

  // El cuerpo crudo, antes de parsear: la firma se calcula sobre estos bytes.
  const crudo = await req.text();

  if (!firmaValida(crudo, req.headers.get("x-hub-signature-256"), secreto)) {
    console.warn("[whatsapp] firma inválida; se descarta");
    return new NextResponse("firma inválida", { status: 401 });
  }

  let carga: unknown;
  try {
    carga = JSON.parse(crudo);
  } catch {
    return NextResponse.json({ ok: true, nota: "cuerpo ilegible" });
  }

  const supabase = getAdminClient();
  if (!supabase) {
    console.error("[whatsapp] falta SUPABASE_SERVICE_ROLE_KEY; el mensaje se pierde");
    return new NextResponse("sin configurar", { status: 500 });
  }

  const { mensajes, estados } = leerWebhook(carga);

  for (const m of mensajes) {
    try {
      await guardarEntrante(supabase, m);
    } catch (e) {
      // Un mensaje que no se pudo guardar no debe impedir los demás.
      console.error("[whatsapp] no se pudo guardar el mensaje", m.waId, e);
    }
  }

  for (const s of estados) {
    try {
      await supabase
        .from("mensajes")
        .update({ estado: s.estado, error: s.error })
        .eq("wa_id", s.waId);
    } catch (e) {
      console.error("[whatsapp] no se pudo actualizar el estado", s.waId, e);
    }
  }

  return NextResponse.json({ ok: true, recibidos: mensajes.length });
}

type Cliente = NonNullable<ReturnType<typeof getAdminClient>>;

/**
 * Guarda un entrante y deja la conversación al día.
 *
 * El cliente se crea solo: el asesor no
 * tiene que copiar nombre ni teléfono, sólo asignar a quién le toca. Para los
 * números equivocados y los proveedores está el botón «No era lead», que
 * borra la ficha creada y archiva.
 */
async function guardarEntrante(supabase: Cliente, m: MensajeEntrante) {
  // Si el número ya es de un cliente conocido, la conversación nace vinculada:
  // el trabajo manual es sólo para los desconocidos de verdad.
  const conversacion = await conversacionDe(supabase, m);
  if (!conversacion) return;

  // El archivo se trae antes de guardar el mensaje, no después: si Meta ya lo
  // borró o el token no alcanza, el mensaje queda guardado diciendo por qué
  // falta, que es lo que después permite entender un comprobante que no está.
  const archivo = m.media ? await guardarArchivo(supabase, conversacion, m) : null;

  const { error } = await supabase.from("mensajes").insert({
    conversacion_id: conversacion,
    wa_id: m.waId,
    direccion: "entrante",
    tipo: m.tipo,
    texto: m.texto,
    payload: m.crudo,
    creado_en: m.enviadoEn.toISOString(),
    media_ruta: archivo?.ruta ?? null,
    media_mime: archivo?.mime ?? null,
    media_nombre: m.media?.nombre ?? null,
    media_error: archivo?.error ?? null,
  });

  // 23505 es la restricción de unicidad sobre `wa_id`: este mensaje ya estaba
  // guardado y esto es un reintento de Meta. No es un error.
  if (error && error.code !== "23505") throw error;
  if (error) return;

  // El contador sube en la base, no en memoria: dos mensajes que llegan a la
  // vez se cuentan los dos.
  await supabase.rpc("marcar_mensaje_entrante", {
    p_conversacion: conversacion,
    p_texto: resumen(m.tipo, m.texto).slice(0, 200),
    p_cuando: m.enviadoEn.toISOString(),
  });

  await abrirLeadSiEsNuevo(supabase, conversacion);
}

/**
 * Si quien escribe todavía no es un lead, abrirle uno y sortearle asesor.
 *
 * ------------------------------------------------------------------------
 * CUÁNDO SÍ Y CUÁNDO NO
 * ------------------------------------------------------------------------
 *
 * Sólo cuando el cliente no tiene ninguna oportunidad. Las dos reglas de la
 * escuela caen de esa única condición:
 *
 *   Vuelve a escribir           ya tiene una abierta, no se abre otra, y sigue
 *                               siendo de quien lo venía atendiendo.
 *   Ex-alumno que vuelve        tiene las suyas cerradas, tampoco se abre otra.
 *                               Se lo atiende sobre su ficha, donde está lo que
 *                               ya cursó, y si hay venta nueva la abre una
 *                               persona mirando.
 *
 * ------------------------------------------------------------------------
 * SI ALGO FALLA, EL MENSAJE NO SE PIERDE
 * ------------------------------------------------------------------------
 *
 * Nada de acá lanza. El mensaje ya está guardado y la conversación abierta;
 * que no se haya podido crear el lead es un problema menor que se arregla con
 * un clic desde la bandeja, y tumbar el webhook por eso haría que Meta
 * reintentara y terminara desactivándolo.
 */
async function abrirLeadSiEsNuevo(supabase: Cliente, conversacionId: number) {
  try {
    const { data: conv } = await supabase
      .from("conversaciones")
      .select("cliente_id")
      .eq("id", conversacionId)
      .maybeSingle();

    const clienteId = conv?.cliente_id == null ? null : Number(conv.cliente_id);
    if (clienteId == null) return;

    const { count } = await supabase
      .from("oportunidades")
      .select("id", { count: "exact", head: true })
      .eq("cliente_id", clienteId);

    if (yaEsLead(count ?? 0)) return;

    const { data: gente } = await supabase.rpc("vendedores_para_reparto");
    const candidatos = ((gente ?? []) as { id: number; nombre: string }[]).map((v) => ({
      id: Number(v.id),
      nombre: String(v.nombre),
    }));

    // Sin nadie habilitado el lead entra igual, sin dueño. Un lead sin asignar
    // lo ve todo el equipo —así está escrita la política— y alguien lo agarra;
    // un lead que no se creó no lo ve nadie nunca.
    const quien = sortear(candidatos);

    const r = await abrirOportunidad(supabase, clienteId, {
      vendedor_id: quien?.id ?? null,
      producto_id: null,
      territorio_id: null,
      canal_id: await idDeCanalWhatsapp(supabase),
      etapa_id: await idDeEtapaProspectos(supabase),
      estado_id: null,
      fecha_registro: hoyEnSalvador(),
      fecha_cierre: null,
      valor_oportunidad: null,
      descuento_promocion: null,
    });

    if (!r.ok) {
      console.error("[whatsapp] no se pudo abrir el lead", r.error);
      return;
    }

    console.info(
      `[whatsapp] lead ${r.codigo} abierto para ${quien?.nombre ?? "nadie (sin asignar)"}`,
    );
  } catch (e) {
    console.error("[whatsapp] no se pudo abrir el lead", e);
  }
}

/**
 * El canal «Whatsapp» del catálogo.
 *
 * Se busca por nombre en vez de guardar el número: los catálogos se editan
 * desde Programas y Equipos, y un id escrito fijo en el código apuntaría a
 * otra cosa el día que alguien reordene la tabla. Si no está, el lead entra
 * sin canal en vez de no entrar.
 */
async function idDeCanalWhatsapp(supabase: Cliente): Promise<number | null> {
  const { data } = await supabase
    .from("canales")
    .select("id")
    .ilike("nombre", "whatsapp")
    .limit(1)
    .maybeSingle();
  return data ? Number(data.id) : null;
}

/** La primera etapa del embudo. Igual que arriba: por nombre, no por id. */
async function idDeEtapaProspectos(supabase: Cliente): Promise<number | null> {
  const { data } = await supabase
    .from("etapas")
    .select("id")
    .ilike("nombre", "prospectos")
    .limit(1)
    .maybeSingle();
  if (data) return Number(data.id);

  // Sin la etapa Prospectos —si no se corrió esa migración— se usa la primera
  // que haya, que es lo que un asesor esperaría ver.
  const { data: primera } = await supabase
    .from("etapas")
    .select("id")
    .order("orden", { ascending: true })
    .limit(1)
    .maybeSingle();
  return primera ? Number(primera.id) : null;
}

/** La conversación de este número, creándola si es la primera vez. */
async function conversacionDe(supabase: Cliente, m: MensajeEntrante): Promise<number | null> {
  const { data: existente } = await supabase
    .from("conversaciones")
    .select("id")
    .eq("telefono", m.telefono)
    .maybeSingle();

  if (existente) return Number(existente.id);

  const clienteId = await clienteDe(supabase, m);

  const { data: creada, error } = await supabase
    .from("conversaciones")
    .insert({
      telefono: m.telefono,
      nombre_perfil: m.nombrePerfil,
      cliente_id: clienteId,
    })
    .select("id")
    .single();

  // Dos mensajes del mismo número nuevo llegando a la vez: el segundo choca
  // con la restricción de unicidad y se queda con la que ganó.
  if (error?.code === "23505") {
    const { data: ya } = await supabase
      .from("conversaciones")
      .select("id")
      .eq("telefono", m.telefono)
      .maybeSingle();
    return ya ? Number(ya.id) : null;
  }
  if (error) throw error;

  return creada ? Number(creada.id) : null;
}

/**
 * El cliente de esta conversación: el que ya existe, o uno nuevo.
 *
 * Los teléfonos guardados no tienen código de país ni formato fijo, así que se
 * comparan por los últimos 8 dígitos, igual que la detección de duplicados del
 * resto del CRM. Un número que ya está en la base se vincula a su ficha en vez
 * de abrir otra.
 */
async function clienteDe(supabase: Cliente, m: MensajeEntrante): Promise<number | null> {
  if (m.telefono.length >= 8) {
    const { data: ya } = await supabase
      .from("clientes")
      .select("id")
      .like("telefono", `%${m.telefono.slice(-8)}`)
      .limit(1)
      .maybeSingle();
    if (ya) return Number(ya.id);
  }

  const { data: creado, error } = await supabase
    .from("clientes")
    .insert({
      // Sin nombre de perfil queda el teléfono, que es mejor que «Sin nombre»:
      // al menos se puede buscar y reconocer.
      nombre: m.nombrePerfil ?? (m.telefono || "Contacto de WhatsApp"),
      telefono: m.telefono || null,
    })
    .select("id")
    .single();

  if (error) {
    // Que falle el alta no debe perder el mensaje: la conversación se guarda
    // igual, sin cliente, y el asesor lo resuelve desde la bandeja.
    console.error("[whatsapp] no se pudo crear el cliente", error);
    return null;
  }
  return Number(creado.id);
}

/**
 * Baja el archivo de un mensaje y lo deja en el bucket.
 *
 * Nunca lanza y nunca demora de más: Meta espera un 200 y, si tarda, reintenta
 * el webhook entero —lo que traería el mismo mensaje otra vez—. Por eso hay un
 * límite de tiempo y por eso un fallo se devuelve como texto en vez de cortar
 * el guardado: el mensaje vale aunque su foto no haya llegado.
 */
async function guardarArchivo(
  supabase: Cliente,
  conversacionId: number,
  m: MensajeEntrante,
): Promise<{ ruta: string | null; mime: string | null; error: string | null }> {
  if (!m.media) return { ruta: null, mime: null, error: null };

  const corte = AbortSignal.timeout(SEGUNDOS_PARA_BAJAR * 1000);
  const bajado = await bajarMedia(m.media.id, corte);

  if (!bajado.ok) {
    console.error("[whatsapp] no se pudo bajar el archivo", m.waId, bajado.error);
    return { ruta: null, mime: m.media.mime, error: bajado.error };
  }

  const ruta = rutaMedia(conversacionId, m.media.id, bajado.archivo.mime);

  const { error } = await supabase.storage
    .from("whatsapp")
    .upload(ruta, bajado.archivo.bytes, {
      contentType: bajado.archivo.mime,
      // Si el webhook se reintenta, el archivo ya está: sobrescribirlo con el
      // mismo contenido es más simple que preguntar antes.
      upsert: true,
    });

  if (error) {
    console.error("[whatsapp] no se pudo guardar el archivo", m.waId, error.message);
    return { ruta: null, mime: bajado.archivo.mime, error: error.message };
  }

  return { ruta, mime: bajado.archivo.mime, error: null };
}

/**
 * Cuánto se espera por un archivo antes de soltarlo.
 *
 * Meta corta el webhook a los 20 segundos y reintenta. Un mensaje puede traer
 * más de un archivo, así que el techo por archivo tiene que dejar lugar para
 * eso y para lo demás que hace la función.
 */
const SEGUNDOS_PARA_BAJAR = 8;
