import type { Oportunidad } from "@/lib/types";

/**
 * Los leads que se están enfriando.
 *
 * ============================================================================
 * DE DÓNDE SALE ESTA PANTALLA
 * ============================================================================
 *
 * La escuela preguntó si existía la regla de «pasados los 15 días desde que
 * entró un lead, si no se le dio seguimiento, se genera un recordatorio y se
 * asigna al azar a una asesora». No existía: lo que hay son los recordatorios
 * de la reserva —quince días desde el anticipo— y los que salen de lo que se
 * escribe en las notas.
 *
 * Antes de construirla se miró la base, porque el número cambiaba el diseño:
 * de 979 leads vivos, 410 llevaban más de quince días sin que nadie los
 * tocara, y NINGUNO de esos 410 estaba sin asesora. O sea:
 *
 *   · Un recordatorio por cada uno habría hecho una lista de 410 renglones.
 *     Una lista de 410 no se lee: se ignora entera, y con ella se ignoran los
 *     tres que sí importaban esa semana.
 *
 *   · Y el reparto al azar no habría movido nada, porque todos ya tienen
 *     dueña. El problema no es que estén sin asignar; es que están asignados
 *     y quietos.
 *
 * Así que en vez de un recordatorio por lead, una pantalla: la cartera fría,
 * ordenada por cuánto lleva enfriándose y filtrable por asesora. Se pidió así
 * después de plantearlo.
 *
 * ============================================================================
 * TODO ESTO ES CÁLCULO PURO
 * ============================================================================
 *
 * Sobre las oportunidades que ya están en pantalla, igual que los
 * recordatorios de la reserva. No hay una consulta aparte, y eso trae gratis
 * lo que importa: una asesora ve sólo sus leads fríos porque la base ya le
 * manda nada más los suyos, y la gerencia ve los del equipo por el mismo
 * motivo. Nadie tuvo que escribir esa regla dos veces.
 */

/**
 * Cuántos días sin que nadie lo toque para considerarlo frío.
 *
 * Quince, que es el número que dijo la escuela y el mismo plazo que ya usa el
 * recordatorio de la reserva. No es casualidad que coincidan: es cuánto dura
 * la memoria de una conversación de venta en este negocio.
 */
export const DIAS_PARA_ENFRIARSE = 15;

/** A partir de cuántos días deja de ser «hay que llamarlo» y pasa a «se perdió». */
const MUY_FRIO = 45;

export type Temperatura =
  /** Entre quince y cuarenta y cinco días. Todavía se recupera con una llamada. */
  | "frio"
  /** Más de cuarenta y cinco. Ya es otra conversación, no un seguimiento. */
  | "helado";

export interface LeadFrio {
  oportunidad: Oportunidad;
  /** Días enteros desde el último rastro de alguien ocupándose. */
  dias: number;
  temperatura: Temperatura;
}

/**
 * Cuántos días pasaron desde que alguien tocó este lead.
 *
 * Días de calendario y no de veinticuatro horas, igual que en los
 * recordatorios: para quien mira la lista, «ayer» es ayer aunque hayan pasado
 * treinta horas.
 *
 * Devuelve null si no se sabe cuándo fue. No es lo mismo que «hace mucho»: sin
 * el dato no se puede afirmar nada, y meterlo en la lista de fríos sería
 * inventar. La vista `vw_ultimo_toque` siempre trae algo —cae en la fecha de
 * alta— así que esto sólo pasa con la migración sin correr.
 */
export function diasSinTocar(
  ultimoToque: string | null,
  ahora: number = Date.now(),
): number | null {
  if (!ultimoToque) return null;
  const cuando = new Date(ultimoToque);
  if (Number.isNaN(cuando.getTime())) return null;

  const aDia = (d: Date) =>
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());

  const dias = Math.floor((aDia(new Date(ahora)) - aDia(cuando)) / 86_400_000);
  // Una fecha en el futuro —reloj torcido, dato cargado a mano— es cero días,
  // no un número negativo que después ordena la lista al revés.
  return Math.max(0, dias);
}

/** ¿Este lead todavía está vivo? Los cerrados no se enfrían: terminaron. */
const sigueVivo = (o: Oportunidad): boolean =>
  o.estado !== "Ganado" && o.estado !== "Perdido";

/**
 * La cartera fría, ordenada por lo que más lleva esperando.
 *
 * De más frío a menos, y no al revés, porque la lista se lee de arriba hacia
 * abajo y se abandona a la mitad: arriba tiene que estar lo que más urge.
 */
export function friosDe(
  oportunidades: readonly Oportunidad[],
  ahora: number = Date.now(),
): LeadFrio[] {
  const salida: LeadFrio[] = [];

  for (const o of oportunidades) {
    if (!sigueVivo(o)) continue;

    const dias = diasSinTocar(o.ultimoToque ?? null, ahora);
    if (dias == null || dias < DIAS_PARA_ENFRIARSE) continue;

    salida.push({
      oportunidad: o,
      dias,
      temperatura: dias >= MUY_FRIO ? "helado" : "frio",
    });
  }

  return salida.sort((a, b) => b.dias - a.dias);
}

/** Cómo se lee la espera: «17 días», «2 meses». */
export function comoSeLeeLaEspera(dias: number): string {
  if (dias < 45) return dias === 1 ? "1 día" : `${dias} días`;
  const meses = Math.round(dias / 30);
  return meses === 1 ? "1 mes" : `${meses} meses`;
}
