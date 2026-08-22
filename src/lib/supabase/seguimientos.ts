import "server-only";

import { getServerClient } from "@/lib/supabase/server";
import type { Seguimiento } from "@/lib/seguimientos";

/**
 * Las filas llegan sin tipar: `vw_seguimientos` es una vista y supabase-js no
 * tiene su forma. Se leen campo por campo, como en el resto de las consultas.
 */
type Row = Record<string, unknown>;

/**
 * Los seguimientos pendientes que puede ver quien está mirando.
 *
 * No hace falta filtrar por asesor: `vw_seguimientos` es `security_invoker` y
 * se apoya en la política de la ficha, así que la base ya manda nada más los
 * que corresponden. Un asesor recibe los suyos; la gerencia, los del equipo.
 *
 * Los atendidos se dejan afuera desde la consulta. Se guardan —sirven para
 * saber si alguien está dando seguimiento de verdad— pero son filas que se
 * acumulan para siempre y no tiene sentido mandarlas por la red en cada
 * refresco para descartarlas del otro lado.
 */
export interface Seguimientos {
  data: Seguimiento[];
  /** La tabla no existe todavía: falta correr la migración. */
  faltaMigracion: boolean;
}

/** Cuántos se traen. Un tope alto, pero tope al fin. */
const TOPE = 400;

export async function fetchSeguimientos(): Promise<Seguimientos> {
  const vacio: Seguimientos = { data: [], faltaMigracion: false };

  const supabase = await getServerClient();
  if (!supabase) return vacio;

  const { data, error } = await supabase
    .from("vw_seguimientos")
    .select(
      "id, oportunidad_id, tipo, detalle, proxima, dia_del_mes, dia_hasta, " +
        "codigo, cliente, telefono, vendedor_id, vendedor, producto",
    )
    .is("hecho_en", null)
    .order("proxima", { ascending: true })
    .limit(TOPE);

  if (error) {
    // PGRST205 es «la vista no está en el esquema»: falta la migración, no es
    // una falla. Cualquier otro problema se trata como «no hay ninguno», que
    // es lo mismo que pasaba antes de que esto existiera.
    return { ...vacio, faltaMigracion: error.code === "PGRST205" };
  }

  return {
    data: ((data ?? []) as unknown as Row[]).map((r) => ({
      id: Number(r.id),
      oportunidadId: Number(r.oportunidad_id),
      tipo: r.tipo === "cierre" ? "cierre" : "pago",
      detalle: String(r.detalle ?? ""),
      proxima: String(r.proxima),
      diaDelMes: r.dia_del_mes == null ? null : Number(r.dia_del_mes),
      diaHasta: r.dia_hasta == null ? null : Number(r.dia_hasta),
      codigo: String(r.codigo ?? ""),
      cliente: String(r.cliente ?? ""),
      telefono: r.telefono ? String(r.telefono) : null,
      vendedorId: r.vendedor_id == null ? null : Number(r.vendedor_id),
      vendedor: r.vendedor ? String(r.vendedor) : null,
      producto: r.producto ? String(r.producto) : null,
    })),
    faltaMigracion: false,
  };
}
