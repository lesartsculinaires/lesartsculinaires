import { NextResponse, type NextRequest } from "next/server";

import { abrir, cuerpo, entero, falla, manejar, ok, texto } from "@/lib/api/http";
import { resolver } from "@/lib/api/catalogos";

export const dynamic = "force-dynamic";

const CANALES = ["Presencial", "Llamada", "WhatsApp", "Meet"] as const;
const ESTADOS = ["Pendiente", "Realizado", "No se presentó", "Reagendado"] as const;

/**
 * Eventos: los seguimientos agendados de cada oportunidad.
 *
 * Es la «tarea» del CRM. Un evento es siempre de una oportunidad —una llamada
 * a alguien, no una llamada suelta— y por eso hay que decir a cuál: por su
 * código («CRM-0581»), que es lo que se ve en pantalla, o por su id.
 */

/**
 * POST /api/v1/eventos — agendar un seguimiento.
 *
 *     {
 *       "codigo": "CRM-0581",
 *       "tipo": "Llamada",
 *       "inicia_en": "2026-08-20T15:00:00-06:00",
 *       "canal": "WhatsApp",
 *       "proxima_accion": "Confirmar si le sirve el horario de sábado"
 *     }
 */
export const POST = manejar(async (req: NextRequest) => {
  const paso = abrir(req.headers);
  if (paso instanceof NextResponse) return paso;
  const { supabase, identidad } = paso;

  const datos = await cuerpo(req);
  if (!datos) {
    return falla(400, "cuerpo_invalido", "El cuerpo tiene que ser un objeto JSON.");
  }

  // --------------------------------------------------- de qué oportunidad es
  let oportunidadId = entero(datos.oportunidad_id);
  const codigo = texto(datos.codigo);

  if (oportunidadId == null && codigo) {
    const { data } = await supabase
      .from("oportunidades")
      .select("id")
      .eq("codigo", codigo)
      .maybeSingle();

    if (!data) {
      return falla(404, "sin_oportunidad", `No existe la oportunidad ${codigo}.`);
    }
    oportunidadId = Number((data as { id: number }).id);
  }

  if (oportunidadId == null) {
    return falla(
      400,
      "falta_oportunidad",
      "Hay que decir a qué oportunidad pertenece: «codigo» (CRM-0581) o «oportunidad_id».",
    );
  }

  // --------------------------------------------------------------- el cuándo
  const inicia = texto(datos.inicia_en ?? datos.cuando);
  if (!inicia) {
    return falla(400, "falta_fecha", "Falta «inicia_en» con la fecha y hora del seguimiento.");
  }

  const cuando = new Date(inicia);
  if (Number.isNaN(cuando.getTime())) {
    return falla(
      400,
      "fecha_invalida",
      `No se entiende «${inicia}». Usá formato ISO: 2026-08-20T15:00:00-06:00`,
    );
  }

  // --------------------------------------------------------------- el resto
  const tipo = await resolver(supabase, "tipos_evento", datos.tipo ?? datos.tipo_id);
  if (tipo.error) return falla(400, "catalogo_desconocido", tipo.error);
  if (tipo.id == null) {
    return falla(400, "falta_tipo", "Falta «tipo» (por ejemplo «Llamada»). Ver GET /api/v1/catalogos.");
  }

  const vendedor = await resolver(
    supabase,
    "vendedores",
    datos.asesor ?? datos.vendedor ?? datos.vendedor_id,
  );
  if (vendedor.error) return falla(400, "catalogo_desconocido", vendedor.error);

  const canal = texto(datos.canal) ?? "Llamada";
  if (!CANALES.includes(canal as (typeof CANALES)[number])) {
    return falla(400, "canal_invalido", `«canal» tiene que ser uno de: ${CANALES.join(", ")}`);
  }

  const estado = texto(datos.estado) ?? "Pendiente";
  if (!ESTADOS.includes(estado as (typeof ESTADOS)[number])) {
    return falla(400, "estado_invalido", `«estado» tiene que ser uno de: ${ESTADOS.join(", ")}`);
  }

  // Sin asesor propio, el del evento es el de la oportunidad: agendar un
  // seguimiento sin dueño lo deja fuera de la agenda de todos.
  let asesorId = vendedor.id;
  if (asesorId == null) {
    const { data } = await supabase
      .from("oportunidades")
      .select("vendedor_id")
      .eq("id", oportunidadId)
      .maybeSingle();
    const v = (data as { vendedor_id: number | null } | null)?.vendedor_id;
    asesorId = v == null ? null : Number(v);
  }

  const { data: creado, error } = await supabase
    .from("eventos")
    .insert({
      oportunidad_id: oportunidadId,
      tipo_id: tipo.id,
      vendedor_id: asesorId,
      inicia_en: cuando.toISOString(),
      duracion_min: entero(datos.duracion_min) ?? 30,
      canal,
      estado,
      resultado: texto(datos.resultado),
      proxima_accion: texto(datos.proxima_accion ?? datos.nota),
    })
    .select("id")
    .single();

  if (error) return falla(422, "no_se_pudo_crear", error.message);

  console.info(`[api] evento en oportunidad ${oportunidadId} creado por ${identidad.nombre}`);

  return ok({ ok: true, id: Number((creado as { id: number }).id) }, 201);
});

/**
 * GET /api/v1/eventos — qué hay agendado.
 *
 * Parámetros: `codigo` u `oportunidad_id`, `asesor`, `desde`, `hasta`,
 * `estado`, `limite` (hasta 200, por defecto 50).
 */
export const GET = manejar(async (req: NextRequest) => {
  const paso = abrir(req.headers);
  if (paso instanceof NextResponse) return paso;
  const { supabase } = paso;

  const q = req.nextUrl.searchParams;

  let consulta = supabase
    .from("eventos")
    .select(
      "id, oportunidad_id, tipo_id, vendedor_id, inicia_en, duracion_min, canal, estado, resultado, proxima_accion",
    )
    .order("inicia_en", { ascending: true });

  const codigo = texto(q.get("codigo"));
  const oportunidadId = entero(q.get("oportunidad_id"));

  if (oportunidadId != null) {
    consulta = consulta.eq("oportunidad_id", oportunidadId);
  } else if (codigo) {
    const { data } = await supabase
      .from("oportunidades")
      .select("id")
      .eq("codigo", codigo)
      .maybeSingle();
    if (!data) return falla(404, "sin_oportunidad", `No existe la oportunidad ${codigo}.`);
    consulta = consulta.eq("oportunidad_id", Number((data as { id: number }).id));
  }

  if (q.get("asesor")) {
    const v = await resolver(supabase, "vendedores", q.get("asesor"));
    if (v.error) return falla(400, "catalogo_desconocido", v.error);
    if (v.id != null) consulta = consulta.eq("vendedor_id", v.id);
  }

  const desde = texto(q.get("desde"));
  if (desde) consulta = consulta.gte("inicia_en", desde);

  const hasta = texto(q.get("hasta"));
  if (hasta) consulta = consulta.lte("inicia_en", hasta);

  const estado = texto(q.get("estado"));
  if (estado) consulta = consulta.eq("estado", estado);

  const limite = Math.min(Math.max(entero(q.get("limite")) ?? 50, 1), 200);

  const { data, error } = await consulta.limit(limite);
  if (error) return falla(502, "error_base", error.message);

  return ok({ ok: true, total: data?.length ?? 0, eventos: data ?? [] });
});
