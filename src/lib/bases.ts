/**
 * Agrupación de las oportunidades por la carga que las trajo.
 *
 * Hay dos fuentes. Las importaciones registradas traen nombre de archivo y
 * autor. Todo lo que entró antes de que existiera ese registro —o a mano, una
 * por una— no tiene encabezado, así que se agrupa por el día en que se creó:
 * es la única señal disponible, y alcanza para encontrar las filas.
 */

import type { Importacion, Oportunidad } from "@/lib/types";

export interface Base {
  /** `imp:12` para una importación registrada, `dia:2026-07-29` si no. */
  clave: string;
  /** Nombre del archivo, o la fecha cuando no hay registro. */
  titulo: string;
  /** Día en que entró, ISO. */
  fecha: string | null;
  /** Momento exacto, cuando se conoce. */
  momento: string | null;
  registrada: boolean;
  oportunidades: Oportunidad[];
  /** Filas que el registro dice haber cargado; puede diferir de las vivas. */
  filasDeclaradas: number | null;
}

/** "2026-07-29T17:36:47Z" → "2026-07-29". */
const soloDia = (iso: string | null): string | null =>
  iso ? iso.slice(0, 10) : null;

/**
 * Arma la lista de bases, de la más reciente a la más vieja.
 *
 * Las importaciones registradas se listan aunque hayan quedado sin filas
 * vivas: si alguien borró los clientes que trajo una base, el hecho de que
 * esa base se subió sigue siendo información.
 */
export function agruparBases(
  oportunidades: readonly Oportunidad[],
  importaciones: readonly Importacion[],
): Base[] {
  const porImportacion = new Map<number, Oportunidad[]>();
  const sueltas: Oportunidad[] = [];

  for (const o of oportunidades) {
    if (o.importacionId != null) {
      const lista = porImportacion.get(o.importacionId) ?? [];
      lista.push(o);
      porImportacion.set(o.importacionId, lista);
    } else {
      sueltas.push(o);
    }
  }

  const bases: Base[] = importaciones.map((imp) => ({
    clave: `imp:${imp.id}`,
    titulo: imp.archivo,
    fecha: soloDia(imp.creadoEn),
    momento: imp.creadoEn,
    registrada: true,
    oportunidades: porImportacion.get(imp.id) ?? [],
    filasDeclaradas: imp.filas,
  }));

  // Lo que no pertenece a ninguna importación, por día de creación.
  const porDia = new Map<string, Oportunidad[]>();
  for (const o of sueltas) {
    const dia = soloDia(o.creadoEn) ?? "sin-fecha";
    const lista = porDia.get(dia) ?? [];
    lista.push(o);
    porDia.set(dia, lista);
  }

  for (const [dia, lista] of porDia) {
    bases.push({
      clave: `dia:${dia}`,
      titulo:
        dia === "sin-fecha"
          ? "Carga sin fecha registrada"
          : `Carga del ${dia.split("-").reverse().join("/")}`,
      fecha: dia === "sin-fecha" ? null : dia,
      // El momento más temprano del grupo representa la carga.
      momento: lista.reduce<string | null>(
        (min, o) => (o.creadoEn && (!min || o.creadoEn < min) ? o.creadoEn : min),
        null,
      ),
      registrada: false,
      oportunidades: lista,
      filasDeclaradas: null,
    });
  }

  return bases.sort((a, b) => (b.momento ?? "").localeCompare(a.momento ?? ""));
}

/** Totales de una base, para su fila en la tabla. */
export function resumirBase(b: Base): {
  clientes: number;
  ganados: number;
  cerrado: number;
} {
  const clientes = new Set(b.oportunidades.map((o) => o.clienteId)).size;
  return {
    clientes,
    ganados: b.oportunidades.filter((o) => o.estado === "Ganado").length,
    cerrado: b.oportunidades.reduce((a, o) => a + (o.cerrada ?? 0), 0),
  };
}
