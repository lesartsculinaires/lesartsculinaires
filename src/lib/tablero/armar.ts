/**
 * De las filas que vienen de la base a lo que calculan las hojas.
 *
 * Es lo mismo que hace el módulo del CRM dentro de `TableroComercial.tsx`
 * (con `useMemo`), escrito como función para poder armarlo dos veces —una por
 * empresa— y usarlo igual en la hoja conjunta y en las de cada empresa.
 */

import {
  resumenDelMes,
  type Accion,
  type FilaActividad,
  type Metas,
  type ResumenMes,
  type SemanaDeDatos,
} from "@/lib/tablero/calculos";
import { mesAnterior } from "@/lib/tablero/semanas";
import type { DatosTablero } from "@/app/tablero-actions";

export interface Armado {
  semanas: Map<string, SemanaDeDatos>;
  acciones: Accion[];
  actividad: FilaActividad[];
  metas: Metas;
  /** Los 13 meses, del más viejo al elegido. */
  meses: string[];
  resumenes: Map<string, ResumenMes>;
}

export const mesesHasta = (mes: string, cuantos: number): string[] => {
  const lista = [mes];
  while (lista.length < cuantos) lista.unshift(mesAnterior(lista[0]));
  return lista;
};

export function armar(datos: DatosTablero, mes: string, hoy: string): Armado {
  const semanas = new Map<string, { lunes: string; manual: Record<string, number>; crm: Record<string, number> }>();
  const semana = (lunes: string) => {
    let s = semanas.get(lunes);
    if (!s) {
      s = { lunes, manual: {}, crm: {} };
      semanas.set(lunes, s);
    }
    return s;
  };
  for (const r of datos.semanal) semana(r.lunes).manual[r.campo] = r.valor;
  for (const r of datos.crmSemanal) semana(r.lunes).crm[r.campo] = r.valor;

  const filas = new Map<string, { lunes: string; vendedorId: number; manual: Record<string, number>; crm: Record<string, number> }>();
  const fila = (lunes: string, vendedorId: number) => {
    const k = `${lunes}|${vendedorId}`;
    let f = filas.get(k);
    if (!f) {
      f = { lunes, vendedorId, manual: {}, crm: {} };
      filas.set(k, f);
    }
    return f;
  };
  for (const r of datos.actividad) fila(r.lunes, r.vendedorId).manual[r.campo] = r.valor;
  for (const r of datos.crmActividad) fila(r.lunes, r.vendedorId).crm[r.campo] = r.valor;
  const actividad = [...filas.values()];

  const delMes: Record<string, Record<string, number>> = {};
  const fijas: Record<string, number> = {};
  for (const r of datos.metas) {
    if (r.mes) (delMes[r.mes] ??= {})[r.clave] = r.valor;
    else fijas[r.clave] = r.valor;
  }

  const acciones: Accion[] = datos.acciones.map((a) => ({ ...a }));
  const meses = mesesHasta(mes, 13);
  const lista = [...semanas.values()];
  const resumenes = new Map(meses.map((m) => [m, resumenDelMes(m, lista, acciones, actividad, hoy)]));

  return { semanas, acciones, actividad, metas: { delMes, fijas }, meses, resumenes };
}
