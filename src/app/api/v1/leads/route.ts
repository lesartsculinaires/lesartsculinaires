import { NextResponse, type NextRequest } from "next/server";

import { abrir, cuerpo, decimal, entero, falla, manejar, ok, texto } from "@/lib/api/http";
import { resolver } from "@/lib/api/catalogos";
import { altaLead } from "@/lib/crm/altaLead";

/** Nunca cachear: son datos que cambian a cada rato. */
export const dynamic = "force-dynamic";

/**
 * Leads: dar de alta y consultar.
 *
 * Pasa por la misma función que el formulario de la pantalla
 * (`@/lib/crm/altaLead`), no por un `insert` propio. Un alta son cuatro pasos
 * —buscar repetidos, crear la persona, asignarle el código CRM-XXXX, crear la
 * oportunidad— y si la automatización se saltara alguno, un lead cargado por
 * n8n quedaría distinto de uno cargado a mano.
 */

/**
 * POST /api/v1/leads — dar de alta.
 *
 * Cuerpo mínimo:
 *
 *     { "nombre": "Ana Pérez", "telefono": "7100-0001" }
 *
 * Los catálogos aceptan el id o el nombre: `"programa": "Diplomado en Cocina"`
 * y `"programa": 3` hacen lo mismo. Ver GET /api/v1/catalogos.
 */
export const POST = manejar(async (req: NextRequest) => {
  const paso = abrir(req.headers);
  if (paso instanceof NextResponse) return paso;
  const { supabase, identidad } = paso;

  const datos = await cuerpo(req);
  if (!datos) {
    return falla(400, "cuerpo_invalido", "El cuerpo tiene que ser un objeto JSON.");
  }

  const nombre = texto(datos.nombre);
  if (!nombre) {
    return falla(400, "falta_nombre", "Falta «nombre», que es el único campo obligatorio.");
  }

  // Los nombres alternativos son los que usa quien arma el flujo sin mirar
  // esta documentación: «asesor» y «vendedor» son la misma persona, y
  // discutirlo por un 400 no le sirve a nadie.
  const [vendedor, producto, territorio, canal, etapa, estado] = await Promise.all([
    resolver(supabase, "vendedores", datos.asesor ?? datos.vendedor ?? datos.vendedor_id),
    resolver(supabase, "productos", datos.programa ?? datos.producto ?? datos.producto_id),
    resolver(supabase, "territorios", datos.sede ?? datos.territorio ?? datos.territorio_id),
    resolver(supabase, "canales", datos.canal ?? datos.canal_id),
    resolver(supabase, "etapas", datos.etapa ?? datos.etapa_id),
    resolver(supabase, "estados", datos.estado ?? datos.estado_id),
  ]);

  // Se juntan todos los errores de catálogo en una sola respuesta. Devolver el
  // primero haría falta corregir, reintentar, y descubrir el segundo.
  const problemas = [vendedor, producto, territorio, canal, etapa, estado]
    .map((r) => r.error)
    .filter((e): e is string => e != null);

  if (problemas.length > 0) {
    return falla(400, "catalogo_desconocido", problemas.join(" · "), { detalles: problemas });
  }

  const r = await altaLead(
    supabase,
    {
      nombre,
      telefono: texto(datos.telefono),
      correo: texto(datos.correo ?? datos.email),
      vendedor_id: vendedor.id,
      producto_id: producto.id,
      territorio_id: territorio.id,
      canal_id: canal.id,
      etapa_id: etapa.id,
      estado_id: estado.id,
      // Sin fecha, hoy. Un formulario que llega es un lead de hoy, y pedirle
      // la fecha a n8n sólo agrega una forma de equivocarse.
      fecha_registro: texto(datos.fecha_registro) ?? new Date().toISOString().slice(0, 10),
      fecha_cierre: texto(datos.fecha_cierre),
      valor_oportunidad: decimal(datos.valor_oportunidad ?? datos.valor),
      descuento_promocion: texto(datos.descuento_promocion ?? datos.promocion),
    },
    // Por defecto NO se fuerza: si Meta reenvía el mismo formulario, o la
    // persona llenó dos veces, se contesta 409 con a quién ya pertenece en vez
    // de duplicar la ficha. Mandar `"forzar": true` crea igual.
    datos.forzar === true,
  );

  if (!r.ok) {
    if (r.coincidencias?.length) {
      return falla(409, "duplicado", r.error ?? "Ya existe un contacto con estos datos.", {
        coincidencias: r.coincidencias,
      });
    }
    return falla(422, "no_se_pudo_crear", r.error ?? "No se pudo crear el lead.");
  }

  console.info(`[api] lead ${r.codigo} creado por ${identidad.nombre}`);

  return ok(
    {
      ok: true,
      codigo: r.codigo,
      cliente_id: r.clienteId,
      oportunidad_id: r.oportunidadId,
    },
    201,
  );
});

/**
 * GET /api/v1/leads — consultar, para que el asistente tenga contexto.
 *
 * Parámetros, todos opcionales:
 *   `codigo`    una oportunidad puntual, "CRM-0581"
 *   `telefono`  o `correo`, para saber si alguien ya está cargado
 *   `asesor`    id o nombre
 *   `desde`     fecha ISO; sólo lo registrado de ahí en adelante
 *   `limite`    hasta 200, por defecto 50
 */
export const GET = manejar(async (req: NextRequest) => {
  const paso = abrir(req.headers);
  if (paso instanceof NextResponse) return paso;
  const { supabase } = paso;

  const q = req.nextUrl.searchParams;

  // Se lee de `vw_pipeline`, la misma vista que alimenta las pantallas, así
  // que lo que ve el asistente es lo que ve el asesor: los nombres ya
  // resueltos y no un montón de ids sueltos.
  let consulta = supabase
    .from("vw_pipeline")
    .select("*")
    .order("created_at", { ascending: false });

  const codigo = texto(q.get("codigo"));
  if (codigo) consulta = consulta.eq("codigo", codigo);

  const correo = texto(q.get("correo"));
  if (correo) consulta = consulta.ilike("correo", correo);

  // El teléfono se guarda con guiones y espacios, así que se busca por los
  // últimos 8 dígitos —el largo de un número salvadoreño— en vez de por el
  // texto completo, que casi nunca coincide carácter por carácter.
  const telefono = texto(q.get("telefono"));
  if (telefono) {
    const digitos = telefono.replace(/\D/g, "").slice(-8);
    if (digitos.length === 8) {
      consulta = consulta.like("telefono", `%${digitos.slice(0, 4)}%${digitos.slice(4)}%`);
    }
  }

  if (q.get("asesor")) {
    const v = await resolver(supabase, "vendedores", q.get("asesor"));
    if (v.error) return falla(400, "catalogo_desconocido", v.error);
    if (v.id != null) consulta = consulta.eq("vendedor_id", v.id);
  }

  const desde = texto(q.get("desde"));
  if (desde) consulta = consulta.gte("fecha_registro", desde);

  const limite = Math.min(Math.max(entero(q.get("limite")) ?? 50, 1), 200);

  const { data, error } = await consulta.limit(limite);
  if (error) return falla(502, "error_base", error.message);

  return ok({ ok: true, total: data?.length ?? 0, leads: data ?? [] });
});
