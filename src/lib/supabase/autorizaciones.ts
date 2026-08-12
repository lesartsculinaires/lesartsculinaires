import "server-only";

import { getServerClient } from "@/lib/supabase/server";
import type { Autorizacion, EstadoAutorizacion } from "@/lib/types";

export interface ResultadoAutorizaciones {
  data: Autorizacion[];
  /** La tabla todavía no existe. */
  faltaMigracion: boolean;
  error: string | null;
}

/**
 * Las autorizaciones, primero las pendientes.
 *
 * El orden lo decide la pantalla, no la consulta: lo que importa arriba es lo
 * que espera decisión, y eso no coincide con ningún orden de columna.
 */
export async function fetchAutorizaciones(): Promise<ResultadoAutorizaciones> {
  const vacio = { data: [] as Autorizacion[], faltaMigracion: false, error: null };

  const supabase = await getServerClient();
  if (!supabase) return vacio;

  const { data, error } = await supabase
    .from("autorizaciones")
    .select("id, nombre, descripcion, estado, solicitado_por, solicitado_en, resuelto_por, resuelto_en, comentario")
    .order("solicitado_en", { ascending: false })
    .limit(500);

  if (error) {
    if (error.code === "PGRST205") return { ...vacio, faltaMigracion: true };
    return { ...vacio, error: error.message };
  }

  return {
    data: (data ?? []).map((r) => ({
      id: Number(r.id),
      nombre: String(r.nombre ?? ""),
      descripcion: String(r.descripcion ?? ""),
      estado: String(r.estado ?? "pendiente") as EstadoAutorizacion,
      solicitadoPor: r.solicitado_por ? String(r.solicitado_por) : null,
      solicitadoEn: String(r.solicitado_en),
      resueltoPor: r.resuelto_por ? String(r.resuelto_por) : null,
      resueltoEn: r.resuelto_en ? String(r.resuelto_en) : null,
      comentario: r.comentario ? String(r.comentario) : null,
    })),
    faltaMigracion: false,
    error: null,
  };
}
