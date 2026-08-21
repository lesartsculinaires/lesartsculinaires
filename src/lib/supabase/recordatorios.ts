import { getServerClient } from "@/lib/supabase/server";

/**
 * Hasta cuándo pidió cada persona no ver cada aviso.
 *
 * Devuelve un mapa de id de oportunidad a fecha. Sólo trae los propios: la
 * política de la tabla filtra por quién pregunta, así que acá no hay que
 * repetir esa condición ni se puede escapar de ella.
 *
 * Los ya vencidos se dejan afuera desde la consulta. Podrían filtrarse en la
 * pantalla, pero son filas que crecen para siempre —cada «recordámelo mañana»
 * de cada asesor deja una— y no tiene sentido mandarlas por la red para
 * descartarlas del otro lado.
 */
export interface Pospuestos {
  /** id de oportunidad → hasta cuándo, en ISO. */
  data: Record<number, string>;
  /** La tabla no existe todavía: falta correr la migración. */
  faltaMigracion: boolean;
}

export async function fetchPospuestos(): Promise<Pospuestos> {
  const vacio: Pospuestos = { data: {}, faltaMigracion: false };

  const supabase = await getServerClient();
  if (!supabase) return vacio;

  const { data, error } = await supabase
    .from("recordatorios_pospuestos")
    .select("oportunidad_id, hasta")
    .gt("hasta", new Date().toISOString());

  if (error) {
    // PGRST205 es «la tabla no está en el esquema», no una falla de verdad.
    if (error.code === "PGRST205") return { ...vacio, faltaMigracion: true };
    // Cualquier otro problema se trata como «no hay ninguno pospuesto». Es la
    // opción segura: el peor caso es ver un aviso que se había pospuesto, y no
    // perderse uno.
    return vacio;
  }

  const mapa: Record<number, string> = {};
  for (const r of data ?? []) mapa[Number(r.oportunidad_id)] = String(r.hasta);
  return { data: mapa, faltaMigracion: false };
}
