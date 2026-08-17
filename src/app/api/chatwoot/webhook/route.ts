import { NextResponse, type NextRequest } from "next/server";

import { getAdminClient } from "@/lib/supabase/admin";
import { verificarFirma } from "@/lib/chatwoot/firma";
import { leerEstado, leerMensaje, resumen, type MensajeChatwoot } from "@/lib/chatwoot/eventos";

export const dynamic = "force-dynamic";

/**
 * Mensajes que llegan desde Chatwoot.
 *
 * Chatwoot sigue siendo el puente con Meta; esta ruta sólo escucha. Dos
 * reglas gobiernan el diseño:
 *
 * 1. Se verifica la firma antes de mirar el contenido. La URL es pública, así
 *    que sin eso cualquiera podría inventar conversaciones y meter clientes
 *    falsos en la base.
 *
 * 2. Se responde 200 salvo que la firma falle. Chatwoot reintenta ante un
 *    error y termina desactivando el webhook; un evento raro que no supimos
 *    leer no vale perder la integración. Lo que falla queda en el registro
 *    del servidor.
 */
export async function POST(req: NextRequest) {
  const secreto = process.env.CHATWOOT_WEBHOOK_SECRET;
  if (!secreto) {
    console.error("[chatwoot] falta CHATWOOT_WEBHOOK_SECRET; se rechaza");
    return new NextResponse("sin configurar", { status: 500 });
  }

  // El cuerpo crudo, antes de parsear: la firma se calcula sobre estos bytes.
  const crudo = await req.text();

  const firma = verificarFirma(
    crudo,
    req.headers.get("x-chatwoot-signature"),
    req.headers.get("x-chatwoot-timestamp"),
    secreto,
  );

  if (!firma.ok) {
    console.warn("[chatwoot] firma rechazada:", firma.motivo);
    return new NextResponse(`firma inválida (${firma.motivo})`, { status: 401 });
  }

  let carga: unknown;
  try {
    carga = JSON.parse(crudo);
  } catch {
    return NextResponse.json({ ok: true, nota: "cuerpo ilegible" });
  }

  const supabase = getAdminClient();
  if (!supabase) {
    console.error("[chatwoot] falta SUPABASE_SERVICE_ROLE_KEY; el mensaje se pierde");
    return new NextResponse("sin configurar", { status: 500 });
  }

  try {
    const cambio = leerEstado(carga);
    if (cambio) {
      await supabase
        .from("conversaciones")
        .update({ estado: cambio.estado })
        .eq("chatwoot_id", cambio.conversacionId);
      return NextResponse.json({ ok: true, tipo: "estado" });
    }

    const m = leerMensaje(carga);
    if (!m) return NextResponse.json({ ok: true, nota: "evento ignorado" });

    await guardar(supabase, m);
    return NextResponse.json({ ok: true, tipo: "mensaje" });
  } catch (e) {
    console.error("[chatwoot] no se pudo procesar el evento", e);
    // 200 igual: ver arriba.
    return NextResponse.json({ ok: true, nota: "error registrado" });
  }
}

type Cliente = NonNullable<ReturnType<typeof getAdminClient>>;

async function guardar(supabase: Cliente, m: MensajeChatwoot) {
  const conversacionId = await conversacionDe(supabase, m);
  if (conversacionId == null) return;

  const { error } = await supabase.from("mensajes").insert({
    conversacion_id: conversacionId,
    chatwoot_id: m.chatwootId,
    direccion: m.direccion,
    tipo: m.tipo,
    texto: m.texto,
    privado: m.privado,
    payload: null,
    creado_en: m.creadoEn.toISOString(),
  });

  // 23505 es la unicidad sobre `chatwoot_id`: ya estaba guardado y esto es un
  // reintento. No es un error.
  if (error && error.code !== "23505") throw error;
  if (error) return;

  // Las notas internas no cuentan como mensaje sin leer del cliente ni deben
  // aparecer como lo último que dijo: son del equipo.
  if (m.privado) return;

  if (m.direccion === "entrante") {
    await supabase.rpc("marcar_mensaje_entrante", {
      p_conversacion: conversacionId,
      p_texto: resumen(m.tipo, m.texto).slice(0, 200),
      p_cuando: m.creadoEn.toISOString(),
    });
  } else {
    // Un saliente puso al día la conversación pero no suma sin leer: lo
    // escribió el equipo, no el cliente.
    await supabase
      .from("conversaciones")
      .update({
        ultimo_texto: resumen(m.tipo, m.texto).slice(0, 200),
        ultimo_mensaje_en: m.creadoEn.toISOString(),
        sin_leer: 0,
      })
      .eq("id", conversacionId);
  }
}

/**
 * La conversación en el CRM, creándola si es la primera vez.
 *
 * Acá vive la decisión que pidió la escuela: **el cliente se crea solo**. El
 * asesor no tiene que copiar nombre ni teléfono; lo único que le queda es
 * asignar a quién le toca, y por eso `vendedor_id` nace nulo.
 *
 * Sobre los duplicados: si el teléfono ya está en la base se vincula a esa
 * ficha en vez de abrir otra. Se comparan los últimos 8 dígitos, igual que en
 * el resto del CRM, porque los teléfonos guardados no tienen un formato
 * uniforme y muchos vienen sin código de país.
 */
async function conversacionDe(supabase: Cliente, m: MensajeChatwoot): Promise<number | null> {
  const { data: existente } = await supabase
    .from("conversaciones")
    .select("id")
    .eq("chatwoot_id", m.conversacionId)
    .maybeSingle();

  if (existente) return Number(existente.id);

  const clienteId = await clienteDe(supabase, m);

  const { data: creada, error } = await supabase
    .from("conversaciones")
    .insert({
      // Sin teléfono no hay con qué distinguir; se usa el id de Chatwoot para
      // que la columna única no choque entre conversaciones anónimas.
      telefono: m.telefono || `chatwoot:${m.conversacionId}`,
      nombre_perfil: m.nombre,
      cliente_id: clienteId,
      chatwoot_id: m.conversacionId,
      chatwoot_contacto_id: m.contactoId,
      inbox_id: m.inboxId,
      estado: m.estadoConversacion ?? "open",
    })
    .select("id")
    .single();

  // Dos mensajes de la misma conversación nueva llegando a la vez: el segundo
  // choca y se queda con la que ganó.
  if (error?.code === "23505") {
    const { data: ya } = await supabase
      .from("conversaciones")
      .select("id")
      .eq("chatwoot_id", m.conversacionId)
      .maybeSingle();
    return ya ? Number(ya.id) : null;
  }
  if (error) throw error;

  return creada ? Number(creada.id) : null;
}

/** El cliente de esta conversación: el que ya existe, o uno nuevo. */
async function clienteDe(supabase: Cliente, m: MensajeChatwoot): Promise<number | null> {
  if (m.telefono.length >= 8) {
    const { data: ya } = await supabase
      .from("clientes")
      .select("id")
      .like("telefono", `%${m.telefono.slice(-8)}`)
      .limit(1)
      .maybeSingle();
    if (ya) return Number(ya.id);
  }

  // Un mensaje saliente que abre conversación es el equipo escribiendo
  // primero; no hay lead nuevo que registrar.
  if (m.direccion !== "entrante") return null;

  const { data: creado, error } = await supabase
    .from("clientes")
    .insert({
      // Sin nombre de perfil queda el teléfono, que es mejor que «Sin nombre»:
      // al menos se puede buscar y reconocer.
      nombre: m.nombre ?? (m.telefono || "Contacto de WhatsApp"),
      telefono: m.telefono || null,
      correo: m.correo,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[chatwoot] no se pudo crear el cliente", error);
    return null;
  }
  return Number(creado.id);
}
