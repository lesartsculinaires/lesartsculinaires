/**
 * Qué mes está mirando el tablero.
 *
 * ============================================================================
 * QUÉ PROBLEMA RESUELVE
 * ============================================================================
 *
 * Lo que pidió la escuela: «la idea es que cada mes se vea reflejado un nuevo
 * comienzo y poder comparar los datos de los meses anteriores y a futuro del
 * año [...] que cada mes pueda ver datos reales y actualizados».
 *
 * Hasta acá los cuatro números de arriba del tablero y los seis gráficos
 * contaban TODO el histórico, desde que existe el CRM. Con 79 oportunidades
 * cargadas decía «79» tanto el 1 de septiembre como el 30, y los cinco leads
 * que entraron en septiembre no aparecían en ningún lado. Un número que nunca
 * baja no sirve para saber cómo va el mes: sólo dice cuánto tiempo lleva
 * abierto el CRM.
 *
 * ============================================================================
 * EL MES ES EL DE REGISTRO DEL LEAD
 * ============================================================================
 *
 * Un lead pertenece al mes en que ENTRÓ, no al mes en que se cerró. Es la
 * misma regla que ya usaba «Evolución», y hay una razón concreta para no
 * cambiarla: `fecha_cierre` está vacía en casi todas las filas, así que
 * agrupar por ella escondería casi toda la plata.
 *
 * Lo que eso quiere decir al leerlo: «Agosto: 33 leads, $4.790» son los leads
 * que entraron en agosto y lo que esos leads dejaron —se hayan cerrado en
 * agosto o en septiembre—. Es una cohorte, no una caja mensual. La diferencia
 * importa cuando alguien pregunta «¿cuánto vendimos este mes?»: la respuesta
 * de acá es «cuánto dejaron los leads de este mes», que no es lo mismo, y por
 * eso la pantalla lo dice con todas las letras.
 */

import { claveMes } from "@/lib/periodos";
import type { Oportunidad } from "@/lib/types";

/** Todo el histórico, que es lo que el tablero mostraba siempre. */
export const TODO = "todo";

export interface Periodo {
  /** "2026-09" un mes, "2026" un año, "todo" el histórico. */
  clave: string;
  /** Cómo se lee: «Septiembre 2026», «Año 2026», «Todo el histórico». */
  etiqueta: string;
  /** Para el subtítulo: «septiembre», «2026», «desde que abrió el CRM». */
  cuando: string;
}

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const mesDe = (clave: string): Periodo => {
  const [anio, mes] = clave.split("-").map(Number);
  const nombre = MESES[(mes ?? 1) - 1] ?? clave;
  return { clave, etiqueta: `${nombre} ${anio}`, cuando: nombre.toLowerCase() };
};

const anioDe = (clave: string): Periodo => ({
  clave,
  etiqueta: `Año ${clave}`,
  cuando: clave,
});

const TODO_ENTERO: Periodo = {
  clave: TODO,
  etiqueta: "Todo el histórico",
  cuando: "desde que abrió el CRM",
};

/** "2026-09-03" → "2026-09". Acepta ya la fecha o el mes de la vista. */
const mesDelLead = (o: Oportunidad): string | null => {
  const crudo = o.mes || o.fechaRegistro;
  return crudo ? claveMes(crudo) : null;
};

/**
 * Los períodos que se pueden elegir, del más nuevo al más viejo.
 *
 * ----------------------------------------------------------------------------
 * EL MES EN CURSO ESTÁ SIEMPRE, AUNQUE ESTÉ VACÍO
 * ----------------------------------------------------------------------------
 *
 * Es lo que hace que el «nuevo comienzo» exista de verdad. Sin esto, el 1 de
 * octubre a las nueve de la mañana —sin ningún lead todavía— el tablero se
 * quedaría mostrando septiembre, y la escuela creería que octubre viene igual
 * de bien que el mes que acaba de terminar. Con el mes vacío en la lista, dice
 * «Octubre 2026: todavía no entró ningún lead», que es la verdad.
 *
 * Los meses futuros no se ofrecen: no se puede medir un mes que no pasó, y
 * llenar la lista de meses en cero hasta diciembre no agrega nada. Aparecen
 * solos, uno por mes, a medida que llegan.
 */
export function periodosDisponibles(
  list: readonly Oportunidad[],
  hoy: Date = new Date(),
): Periodo[] {
  const meses = new Set<string>();
  const anios = new Set<string>();

  for (const o of list) {
    const m = mesDelLead(o);
    if (!m) continue;
    meses.add(m);
    anios.add(m.slice(0, 4));
  }

  // El mes en curso y su año, siempre. Ver el comentario de arriba.
  const mesHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
  meses.add(mesHoy);
  anios.add(String(hoy.getFullYear()));

  const ordenados = [...meses].sort().reverse();
  const porAnio = [...anios].sort().reverse();

  return [...ordenados.map(mesDe), ...porAnio.map(anioDe), TODO_ENTERO];
}

/** ¿Este lead entra en el período elegido? */
export function enElPeriodo(o: Oportunidad, clave: string): boolean {
  if (clave === TODO) return true;
  const m = mesDelLead(o);
  if (!m) {
    /*
     * Un lead sin fecha de registro no cae en ningún mes.
     *
     * Se deja afuera a propósito, y no se mete en el mes en curso «para que no
     * se pierda»: sumarlo a un mes al que no pertenece inflaría ese mes con
     * algo que no pasó ahí, y la comparación con el mes anterior dejaría de
     * significar nada. En «Todo el histórico» sigue estando.
     */
    return false;
  }
  // Un año: "2026" contra "2026-09". Un mes: comparación directa.
  return clave.length === 4 ? m.slice(0, 4) === clave : m === clave;
}

export const recortar = (
  list: readonly Oportunidad[],
  clave: string,
): Oportunidad[] => (clave === TODO ? [...list] : list.filter((o) => enElPeriodo(o, clave)));

/**
 * Contra qué se compara.
 *
 * El mes anterior para un mes; el año anterior para un año. «Todo el
 * histórico» no se compara contra nada: no hay un «antes de todo».
 *
 * Devuelve el período aunque no tenga ni un lead —el mes anterior existió
 * igual— porque comparar contra un mes vacío es una comparación válida y con
 * información: si en agosto hubo 33 y en septiembre 5, eso hay que verlo.
 */
export function periodoAnterior(clave: string): Periodo | null {
  if (clave === TODO) return null;

  if (clave.length === 4) {
    const anio = Number(clave);
    return Number.isFinite(anio) ? anioDe(String(anio - 1)) : null;
  }

  const [anio, mes] = clave.split("-").map(Number);
  if (!Number.isFinite(anio) || !Number.isFinite(mes)) return null;

  const d = new Date(anio, mes - 2, 1);
  const previo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return mesDe(previo);
}

/**
 * Con cuál abrir.
 *
 * El mes en curso, que es el «nuevo comienzo» que pidió la escuela. No el
 * último mes CON DATOS: eso haría que el 1 de octubre siguiera mostrando
 * septiembre, y quien lo mire creería que está viendo el mes nuevo.
 */
export const periodoInicial = (hoy: Date = new Date()): string =>
  `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;

/** El texto de «no hay nada acá», que cambia según qué se esté mirando. */
export function comoSeExplicaElVacio(p: Periodo): string {
  if (p.clave === TODO) return "Todavía no hay ninguna oportunidad cargada.";
  if (p.clave.length === 4) return `Todavía no entró ningún lead en ${p.cuando}.`;
  return `Todavía no entró ningún lead en ${p.cuando}. Los meses anteriores se eligen arriba.`;
}

// ---------------------------------------------------------- la barra de filtros

/**
 * El mes como número: "2026-09" → 202609.
 *
 * La barra de filtros que comparten Clientes y Pipeline guarda cada filtro
 * como un número —es lo que le permite ir en la dirección del navegador y
 * contar cuántos hay puestos— así que el mes tiene que entrar como número o
 * habría que hacerle una excepción a toda esa maquinaria.
 *
 * El formato aaaamm ordena igual que la fecha, así que la lista sale ordenada
 * sola sin comparar textos.
 */
export const mesComoNumero = (clave: string): number =>
  Number(clave.replace("-", ""));

/** 202609 → "2026-09". */
export const mesDesdeNumero = (n: number): string =>
  `${String(n).slice(0, 4)}-${String(n).slice(4, 6)}`;

/**
 * Los meses que se pueden filtrar, del más nuevo al más viejo.
 *
 * Sólo meses, sin años ni «todo»: en la barra de filtros «todo» es no poner
 * el filtro, y un año se mira en el tablero, que es la pantalla que compara.
 */
export function mesesComoOpciones(
  list: readonly Oportunidad[],
  hoy: Date = new Date(),
): { id: number; nombre: string }[] {
  return periodosDisponibles(list, hoy)
    .filter((p) => /^\d{4}-\d{2}$/.test(p.clave))
    .map((p) => ({ id: mesComoNumero(p.clave), nombre: p.etiqueta }));
}

/** ¿Este lead entró en ese mes? `mes` viene en el formato aaaamm de la barra. */
export function esDelMes(o: Oportunidad, mes: number): boolean {
  const m = mesDelLead(o);
  return m != null && mesComoNumero(m) === mes;
}
