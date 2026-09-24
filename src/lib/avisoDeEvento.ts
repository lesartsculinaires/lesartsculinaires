import type { Evento } from "@/lib/types";

/**
 * El aviso de que falta poco para una llamada agendada.
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «Cuando alguien agende una llamada en el calendario, que le avise unos diez
 *  minutos antes a la persona que lo hizo.»
 *
 * ============================================================================
 * A QUIÉN LE SALTA, Y POR QUÉ A LOS DOS
 * ============================================================================
 *
 * A quien tiene que atender la llamada —`vendedorId`— y a quien la agendó
 * —`creadoPor`—. Avisarle sólo al segundo, que es lo que dice la frase, deja
 * el agujero grande: si la jefa agenda una llamada para una asesora, la
 * asesora no se entera de su propia llamada. Y avisarle sólo al primero
 * ignoraría que quien la agendó quiere saber que está por pasar.
 *
 * Cuando son la misma persona —que es el caso normal— salta una sola vez,
 * porque esto devuelve eventos y no destinatarios.
 *
 * ============================================================================
 * LA VENTANA, Y POR QUÉ TIENE DOS BORDES
 * ============================================================================
 *
 * Desde diez minutos antes hasta que empieza. El borde de adelante es el que
 * pidieron; el de atrás existe porque sin él el aviso quedaría colgado toda la
 * tarde en pantalla, y un cartel que no se va deja de leerse.
 *
 * Hay un minuto de gracia después de la hora a propósito: el reloj corre cada
 * medio minuto, y sin ese margen una llamada de las 13:30 podría caer justo en
 * el hueco entre dos vueltas y no avisar nunca.
 *
 * Todo acá es cálculo puro: no toca la base, no sabe de navegadores y recibe
 * `ahora` en vez de leer el reloj. Eso es lo que deja probar «faltan once
 * minutos» y «faltan nueve» sin esperar dos minutos.
 */

/** Cuántos minutos antes avisa. Lo que pidió la escuela. */
export const MINUTOS_ANTES = 10;

/** Cuánto sigue avisando después de la hora, para no perderse el momento. */
const GRACIA_MIN = 1;

export interface AvisoDeEvento {
  evento: Evento;
  /** Minutos que faltan. Cero o negativo cuando ya empezó. */
  faltan: number;
}

/** Quién está mirando el CRM, para saber qué le toca. */
export interface Quien {
  vendedorId: number | null;
}

/**
 * ¿Este evento es de esta persona, para avisarle?
 *
 * Sin vendedor no hay nada que comparar: dirección entra al CRM sin ficha de
 * vendedor, y avisarle de todas las llamadas del equipo sería convertir el
 * aviso en ruido. Quien no tiene ficha no recibe avisos de agenda.
 */
export function meToca(evento: Evento, quien: Quien): boolean {
  if (quien.vendedorId == null) return false;
  return evento.vendedorId === quien.vendedorId || evento.creadoPor === quien.vendedorId;
}

/**
 * Los eventos que hay que avisar ahora mismo.
 *
 * Ordenados por hora: si se juntan dos, primero el que empieza antes.
 */
export function avisosDeAgenda(
  eventos: readonly Evento[],
  quien: Quien,
  ahora: Date,
): AvisoDeEvento[] {
  const salida: AvisoDeEvento[] = [];

  for (const evento of eventos) {
    // Lo que ya se atendió, se reagendó o no se presentó no es un pendiente.
    if (evento.estado !== "Pendiente") continue;
    if (!meToca(evento, quien)) continue;

    const faltan = minutosHasta(evento.iniciaEn, ahora);
    if (faltan === null) continue;
    if (faltan > MINUTOS_ANTES) continue;
    if (faltan < -GRACIA_MIN) continue;

    salida.push({ evento, faltan });
  }

  return salida.sort((a, b) => a.faltan - b.faltan);
}

/**
 * Cuántos minutos faltan, redondeando hacia arriba.
 *
 * Hacia arriba y no al más cercano: a falta de nueve minutos y medio tiene que
 * decir «en 10 minutos» y no «en 9». La persona lee el número para decidir si
 * le da tiempo de algo, y quedarse corto es el error que hace llegar tarde.
 *
 * Devuelve null si la fecha no se entiende, en vez de un número inventado.
 */
export function minutosHasta(iso: string, ahora: Date): number | null {
  const cuando = new Date(iso);
  if (Number.isNaN(cuando.getTime())) return null;
  return Math.ceil((cuando.getTime() - ahora.getTime()) / 60_000);
}

/**
 * Cómo se lee el tiempo que falta.
 *
 * En palabras y no en un número suelto, porque «0» no dice nada y «-1» dice
 * algo equivocado. Lo que necesita leer quien está haciendo otra cosa es si
 * tiene que levantarse ahora o en un rato.
 */
export function cuantoFalta(faltan: number): string {
  if (faltan <= 0) return "Es ahora";
  if (faltan === 1) return "En 1 minuto";
  return `En ${faltan} minutos`;
}

/**
 * La llave con la que se recuerda que este aviso ya se dio.
 *
 * Lleva la hora de inicio y no sólo el id: si alguien reagenda el evento para
 * más tarde, es un aviso nuevo y tiene que volver a saltar. Con el id solo,
 * mover una llamada de las 10 a las 15 la dejaba en silencio.
 */
export const llaveDelAviso = (evento: Evento): string =>
  `${evento.id}@${evento.iniciaEn}`;
