import { NextResponse, type NextRequest } from "next/server";

import { getAdminClient } from "@/lib/supabase/admin";
import { firmaValida } from "@/lib/whatsapp/firma";
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
 * El cliente se crea solo, igual que por la vía de Chatwoot: el asesor no
 * tiene que copiar nombre ni teléfono, sólo asignar a quién le toca. Para los
 * números equivocados y los proveedores está el botón «No era lead», que
 * borra la ficha creada y archiva.
 */
async function guardarEntrante(supabase: Cliente, m: MensajeEntrante) {
  // Si el número ya es de un cliente conocido, la conversación nace vinculada:
  // el trabajo manual es sólo para los desconocidos de verdad.
  const conversacion = await conversacionDe(supabase, m);
  if (!conversacion) return;

  const { error } = await supabase.from("mensajes").insert({
    conversacion_id: conversacion,
    wa_id: m.waId,
    direccion: "entrante",
    tipo: m.tipo,
    texto: m.texto,
    payload: m.crudo,
    creado_en: m.enviadoEn.toISOString(),
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
