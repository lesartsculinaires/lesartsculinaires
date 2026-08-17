import { NextResponse, type NextRequest } from "next/server";

import { abrir, falla, manejar, ok } from "@/lib/api/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/asesores — quiénes reciben leads y a qué número avisarles.
 *
 * Es lo que necesita el flujo de n8n para repartir: sin esto tendría que
 * llevar la lista de asesores escrita a mano en el propio flujo, y el día que
 * entre alguien nuevo los leads le seguirían llegando a quien se fue.
 *
 * Por defecto sólo devuelve los activos. `?todos=1` trae también a los dados
 * de baja, para poder resolver el nombre de un lead viejo.
 */
export const GET = manejar(async (req: NextRequest) => {
  const paso = abrir(req.headers);
  if (paso instanceof NextResponse) return paso;
  const { supabase } = paso;

  const todos = req.nextUrl.searchParams.get("todos") === "1";

  let consulta = supabase
    .from("vendedores")
    .select("id, nombre, correo, telefono, activo")
    .order("nombre");

  if (!todos) consulta = consulta.eq("activo", true);

  const { data, error } = await consulta;

  if (error) {
    // 42703: la columna no existe todavía. Pasa entre que se publica esta
    // versión y se corre la migración; contestar el error crudo de Postgres
    // dejaría a quien arma el flujo sin saber qué hacer.
    if (error.code === "42703") {
      return falla(
        503,
        "falta_migracion",
        "Falta correr la migración 20260817120000_vendedores_telefono.sql en Supabase.",
      );
    }
    return falla(502, "error_base", error.message);
  }

  const asesores = (data ?? []).map((v) => ({
    id: Number(v.id),
    nombre: String(v.nombre ?? ""),
    correo: v.correo ? String(v.correo) : null,
    /** Formato internacional sin signos: 50371000001. Puede faltar. */
    whatsapp: v.telefono ? String(v.telefono) : null,
    activo: Boolean(v.activo),
  }));

  return ok({
    ok: true,
    total: asesores.length,
    // Se avisa cuántos no tienen número: un flujo que reparte por WhatsApp
    // falla en silencio con esos, y así se ve antes de que pase.
    sin_whatsapp: asesores.filter((a) => !a.whatsapp).length,
    asesores,
  });
});
