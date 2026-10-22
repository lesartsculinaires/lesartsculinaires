/**
 * Aggregation by calendar period for the dashboard charts.
 *
 * Leads, amounts and open pipeline group by the month the opportunity was
 * *registered* (`o.mes`): each month reads as a cohort — "of the leads that
 * came in during July, this much is still open".
 *
 * GANADOS ARE THE EXCEPTION, since October 14, 2026: a sale counts in the
 * month it CLOSED (`fecha_cierre`). Counted by registration, Alexandra's
 * eight October sales showed as four, because four of those leads had come
 * in during September; the school reads «ganados de octubre» as «sales made
 * in October». The close date used to be empty almost everywhere, which is
 * why this read by registration; since September a trigger fills it on every
 * win (30 of 31 in September, 11 of 11 in October). A win without a close
 * date falls back to its registration month, so nothing is ever dropped.
 *
 * AND SO DOES ITS MONEY, since October 22, 2026: «venta cerrada» of a won
 * lead goes to its close month too. Before, the count of October's sales
 * included a September lead won on 22/10 (CRM-4542) but its amount stayed in
 * September, and the file showed «Mes: Septiembre». The monthly report
 * already counted it this way; now the Dashboard, Equipos, Evolución, the
 * Pipeline month filter and the file all agree with it.
 */

import { mesCorto, parseISO } from "@/lib/format";
import { esGanada, estaAbierta } from "@/lib/selectors";
import type { Oportunidad } from "@/lib/types";

export interface ResumenPeriodo {
  /** "2026-07" for a month, "2026" for a year. */
  clave: string;
  /** Axis label: "Jul 26" / "2026". */
  etiqueta: string;
  /** Header label: "Julio 2026" / "Año 2026". */
  etiquetaLarga: string;
  leads: number;
  ganados: number;
  /** Revenue booked. */
  cerrado: number;
  /** Value still open, i.e. not in a final state. */
  pipeline: number;
}

const MESES_LARGOS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const vacio = (
  clave: string,
  etiqueta: string,
  etiquetaLarga: string,
): ResumenPeriodo => ({
  clave,
  etiqueta,
  etiquetaLarga,
  leads: 0,
  ganados: 0,
  cerrado: 0,
  pipeline: 0,
});

/** Lo que va por mes de registro. Los ganados se suman aparte: ver arriba. */
function acumular(r: ResumenPeriodo, o: Oportunidad): void {
  r.leads += 1;
  if (!esGanada(o)) r.cerrado += o.cerrada ?? 0;
  if (estaAbierta(o)) r.pipeline += o.valor ?? 0;
}

/** Un ganado en el mes de su venta: se cuenta y se suma lo que dejó. */
function venta(r: ResumenPeriodo, o: Oportunidad): void {
  r.ganados += 1;
  r.cerrado += o.cerrada ?? 0;
}

/** "2026-07-01" → "2026-07". */
export const claveMes = (mesISO: string): string => mesISO.slice(0, 7);

/**
 * El mes en que se ganó un lead: el de su fecha de cierre, y si no la tiene,
 * el de registro. Null sólo si no tiene ninguna de las dos.
 */
export const mesDeLaVenta = (o: Oportunidad): string | null => {
  const crudo = o.fechaCierre || o.mes || o.fechaRegistro;
  return crudo ? claveMes(crudo) : null;
};

/**
 * El mes al que pertenece un lead en las listas y filtros: el de registro, y
 * si está ganado, el de su venta. Es el «Mes» de la ficha.
 */
export const mesDelLeadOVenta = (o: Oportunidad): string | null => {
  if (esGanada(o)) return mesDeLaVenta(o);
  const crudo = o.mes || o.fechaRegistro;
  return crudo ? claveMes(crudo) : null;
};

const etiquetasMes = (clave: string): [corta: string, larga: string] => {
  const iso = `${clave}-01`;
  const d = parseISO(iso);
  if (!d) return [clave, clave];
  const anio = d.getFullYear();
  return [
    `${mesCorto(iso)} ${String(anio).slice(2)}`,
    `${MESES_LARGOS[d.getMonth()]} ${anio}`,
  ];
};

/**
 * One entry per month, oldest first.
 *
 * Months with no activity between the first and the last are filled in with
 * zeros: a gap drawn as a missing bar reads as "no data", but a gap drawn as
 * a flat month reads as "nothing sold", which is what actually happened.
 */
export function porMes(list: readonly Oportunidad[]): ResumenPeriodo[] {
  const mapa = new Map<string, ResumenPeriodo>();
  const delMes = (clave: string): ResumenPeriodo => {
    let r = mapa.get(clave);
    if (!r) {
      const [corta, larga] = etiquetasMes(clave);
      r = vacio(clave, corta, larga);
      mapa.set(clave, r);
    }
    return r;
  };

  for (const o of list) {
    if (o.mes) acumular(delMes(claveMes(o.mes)), o);
    if (esGanada(o)) {
      const clave = mesDeLaVenta(o);
      if (clave) venta(delMes(clave), o);
    }
  }

  const claves = [...mapa.keys()].sort();
  if (claves.length === 0) return [];

  const salida: ResumenPeriodo[] = [];
  const fin = claves[claves.length - 1];
  const [y0, m0] = claves[0].split("-").map(Number);
  const cursor = new Date(y0, m0 - 1, 1);

  // Guard against a malformed date producing an unbounded loop.
  for (let i = 0; i < 600; i += 1) {
    const clave = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    const [corta, larga] = etiquetasMes(clave);
    salida.push(mapa.get(clave) ?? vacio(clave, corta, larga));
    if (clave === fin) break;
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return salida;
}

/** One entry per calendar year, oldest first. */
export function porAnio(list: readonly Oportunidad[]): ResumenPeriodo[] {
  const mapa = new Map<string, ResumenPeriodo>();
  const delAnio = (clave: string): ResumenPeriodo => {
    let r = mapa.get(clave);
    if (!r) {
      r = vacio(clave, clave, `Año ${clave}`);
      mapa.set(clave, r);
    }
    return r;
  };

  for (const o of list) {
    if (o.mes) acumular(delAnio(o.mes.slice(0, 4)), o);
    if (esGanada(o)) {
      const mes = mesDeLaVenta(o);
      if (mes) venta(delAnio(mes.slice(0, 4)), o);
    }
  }

  return [...mapa.values()].sort((a, b) => a.clave.localeCompare(b.clave));
}

export interface DiaResumen {
  dia: number;
  leads: number;
  cerrado: number;
}

/** Day-by-day breakdown inside one month, including days with no activity. */
export function porDia(
  list: readonly Oportunidad[],
  mesClave: string,
): DiaResumen[] {
  const [anio, mes] = mesClave.split("-").map(Number);
  if (!anio || !mes) return [];

  const dias = new Date(anio, mes, 0).getDate();
  const salida: DiaResumen[] = Array.from({ length: dias }, (_, i) => ({
    dia: i + 1,
    leads: 0,
    cerrado: 0,
  }));

  for (const o of list) {
    if (!o.fechaRegistro || o.fechaRegistro.slice(0, 7) !== mesClave) continue;
    const d = parseISO(o.fechaRegistro);
    if (!d) continue;
    const fila = salida[d.getDate() - 1];
    if (!fila) continue;
    fila.leads += 1;
    fila.cerrado += o.cerrada ?? 0;
  }

  return salida;
}

/**
 * Percentage change from one period to the next.
 *
 * Null when there is nothing to compare against: going from zero to any
 * number is not "+100%", it is a first sale, and printing a percentage there
 * would invent a trend that the data does not support.
 */
export function variacion(actual: number, previo: number): number | null {
  if (previo === 0) return null;
  return ((actual - previo) / previo) * 100;
}

/** Sum of a field across periods, for the "total" line under a chart. */
export const sumar = (
  periodos: readonly ResumenPeriodo[],
  campo: "leads" | "ganados" | "cerrado" | "pipeline",
): number => periodos.reduce((a, p) => a + p[campo], 0);
