import "server-only";

import { getServerClient } from "@/lib/supabase/server";
import type { Importacion } from "@/lib/types";

export interface ResultadoBases {
  data: Importacion[];
  /** La tabla de importaciones todavía no existe. */
  faltaMigracion: boolean;
  error: string | null;
}

/**
 * Bases registradas, de la más reciente a la más vieja.
 *
 * Que falte la tabla no es un error que deba romper la pantalla: el módulo
 * funciona igual agrupando por fecha de creación, y muestra el aviso de que
 * hay una migración pendiente.
 */
export async function fetchImportaciones(): Promise<ResultadoBases> {
  const vacio = { data: [] as Importacion[], faltaMigracion: false, error: null };

  const supabase = await getServerClient();
  if (!supabase) return vacio;

  const { data, error } = await supabase
    .from("importaciones")
    .select("id, archivo, filas, creado_por, creado_en")
    .order("creado_en", { ascending: false })
    .limit(500);

  if (error) {
    // PGRST205 es "la tabla no está en el esquema", no una falla real.
    if (error.code === "PGRST205") return { ...vacio, faltaMigracion: true };
    return { ...vacio, error: error.message };
  }

  return {
    data: (data ?? []).map((r) => ({
      id: Number(r.id),
      archivo: String(r.archivo ?? "sin nombre"),
      filas: Number(r.filas ?? 0),
      creadoEn: String(r.creado_en),
      creadoPor: r.creado_por ? String(r.creado_por) : null,
    })),
    faltaMigracion: false,
    error: null,
  };
}
