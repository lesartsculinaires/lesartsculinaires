import "server-only";

import { getServerClient } from "@/lib/supabase/server";
import type { Valor } from "@/lib/envios";

/** El `select` se arma como texto, así que las filas llegan sin tipar. */
type Fila = Record<string, unknown>;

/** Un envío masivo con su resultado ya contado. */
export interface Envio {
  id: number;
  nombre: string;
  plantillaNombre: string | null;
  cuerpo: string | null;
  valores: Valor[];
  estado: string;
  creadoEn: string;
  empezadoEn: string | null;
  terminadoEn: string | null;
  /** Cuántos destinatarios tiene en total. */
  total: number;
  pendientes: number;
  enviados: number;
  entregados: number;
  leidos: number;
  respondieron: number;
  fallidos: number;
  omitidos: number;
}

export interface ResultadoEnvios {
  envios: Envio[];
  /** La tabla todavía no existe: falta correr la migración. */
  faltaMigracion: boolean;
  error: string | null;
}

const VACIO: ResultadoEnvios = { envios: [], faltaMigracion: false, error: null };

/**
 * Los envíos, con sus números.
 *
 * ============================================================================
 * LOS ESTADOS SE ACUMULAN HACIA ATRÁS
 * ============================================================================
 *
 * Un destinatario tiene UN estado, el más avanzado al que llegó: quien
 * contestó está en «respondio» y ya no en «entregado». Contar las filas de
 * cada estado y mostrarlas así diría que de trescientos entregados hay dos,
 * porque los otros doscientos noventa y ocho avanzaron.
 *
 * Por eso cada número incluye a los que pasaron de largo: «entregados» son los
 * que llegaron al teléfono, hayan sido leídos o contestados después. Es lo que
 * quiere decir la palabra, y es la única forma de que el embudo baje en vez de
 * dar saltos.
 */
export async function fetchEnvios(): Promise<ResultadoEnvios> {
  const supabase = await getServerClient();
  if (!supabase) return VACIO;

  const { data: filas, error } = await supabase
    .from("envios")
    .select(
      "id, nombre, plantilla_nombre, cuerpo, valores, estado, creado_en, empezado_en, terminado_en",
    )
    .order("creado_en", { ascending: false })
    .limit(100);

  if (error) {
    if (error.code === "PGRST205") return { ...VACIO, faltaMigracion: true };
    return { ...VACIO, error: error.message };
  }

  const ids = ((filas ?? []) as unknown as Fila[]).map((e) => Number(e.id));
  if (ids.length === 0) return VACIO;

  const { data: dest, error: errDest } = await supabase
    .from("envio_destinatarios")
    .select("envio_id, estado")
    .in("envio_id", ids)
    .limit(50000);

  if (errDest) return { ...VACIO, error: errDest.message };

  const cuenta = new Map<number, Record<string, number>>();
  for (const d of (dest ?? []) as unknown as Fila[]) {
    const id = Number(d.envio_id);
    const suyos = cuenta.get(id) ?? {};
    const estado = String(d.estado);
    suyos[estado] = (suyos[estado] ?? 0) + 1;
    cuenta.set(id, suyos);
  }

  return {
    envios: ((filas ?? []) as unknown as Fila[]).map((e) => {
      const c = cuenta.get(Number(e.id)) ?? {};
      const n = (k: string) => c[k] ?? 0;

      // Cada uno incluye a los que avanzaron más: ver la explicación de arriba.
      const respondieron = n("respondio");
      const leidos = n("leido") + respondieron;
      const entregados = n("entregado") + leidos;
      const enviados = n("enviado") + entregados;

      return {
        id: Number(e.id),
        nombre: String(e.nombre),
        plantillaNombre: e.plantilla_nombre ? String(e.plantilla_nombre) : null,
        cuerpo: e.cuerpo ? String(e.cuerpo) : null,
        valores: Array.isArray(e.valores) ? (e.valores as Valor[]) : [],
        estado: String(e.estado),
        creadoEn: String(e.creado_en),
        empezadoEn: e.empezado_en ? String(e.empezado_en) : null,
        terminadoEn: e.terminado_en ? String(e.terminado_en) : null,
        total: Object.values(c).reduce((a, b) => a + b, 0),
        pendientes: n("pendiente"),
        enviados,
        entregados,
        leidos,
        respondieron,
        fallidos: n("fallido"),
        omitidos: n("omitido"),
      };
    }),
    faltaMigracion: false,
    error: null,
  };
}
