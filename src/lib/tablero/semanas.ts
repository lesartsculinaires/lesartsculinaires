/**
 * Las semanas del Tablero Comercial y a qué mes suma cada una.
 *
 * La regla es la de la plantilla de la Dirección: la semana va de lunes a
 * domingo, se nombra por su lunes, y una semana que empieza en un mes y
 * termina en el siguiente suma al mes donde cae el JUEVES. Así cada semana
 * suma entera a un solo mes y ningún mes queda con medias semanas.
 *
 * Las fechas viajan como texto «AAAA-MM-DD» y se calculan en UTC: son días de
 * calendario, no instantes, y con la hora local una semana podía correrse un
 * día según la zona del navegador.
 */

const DIA_MS = 86_400_000;

const aFecha = (iso: string): Date => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const aIso = (d: Date): string => d.toISOString().slice(0, 10);

/** Suma días a una fecha «AAAA-MM-DD». */
export const sumarDias = (iso: string, dias: number): string =>
  aIso(new Date(aFecha(iso).getTime() + dias * DIA_MS));

/** El lunes de la semana de esa fecha. */
export function lunesDe(iso: string): string {
  const d = aFecha(iso);
  // getUTCDay: domingo 0 … sábado 6. El lunes queda 0 días atrás, el domingo 6.
  const atras = (d.getUTCDay() + 6) % 7;
  return sumarDias(iso, -atras);
}

/** El primer día del mes de esa fecha: «2026-11-01». */
export const mesDe = (iso: string): string => `${iso.slice(0, 7)}-01`;

/** El mes al que suma una semana: el de su jueves. */
export const mesDeLaSemana = (lunes: string): string => mesDe(sumarDias(lunes, 3));

/** El domingo con que termina la semana. */
export const domingoDe = (lunes: string): string => sumarDias(lunes, 6);

/** Los lunes de las semanas que suman a ese mes, en orden. */
export function semanasDelMes(mes: string): string[] {
  const primero = mesDe(mes);
  // La primera semana que suma es la que tiene su jueves en el mes: arranca
  // como mucho tres días antes del día 1.
  let lunes = lunesDe(sumarDias(primero, 3));
  if (mesDeLaSemana(lunes) !== primero) lunes = sumarDias(lunes, 7);
  const semanas: string[] = [];
  while (mesDeLaSemana(lunes) === primero) {
    semanas.push(lunes);
    lunes = sumarDias(lunes, 7);
  }
  return semanas;
}

/** El mes anterior y el mismo mes del año pasado, para comparar. */
export function mesAnterior(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 1 ? `${a - 1}-12-01` : `${a}-${String(m - 1).padStart(2, "0")}-01`;
}

export const mismoMesAnioPasado = (mes: string): string =>
  `${Number(mes.slice(0, 4)) - 1}${mes.slice(4, 7)}-01`;

/** ¿Ya terminó la semana? Lo está cuando su domingo es anterior a hoy. */
export const semanaTerminada = (lunes: string, hoy: string): boolean => domingoDe(lunes) < hoy;

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** «noviembre 2026». */
export const nombreDelMes = (mes: string): string =>
  `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;

/** «2 nov – 8 nov». */
export function nombreDeLaSemana(lunes: string): string {
  const corto = (iso: string) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1].slice(0, 3)}`;
  return `${corto(lunes)} – ${corto(domingoDe(lunes))}`;
}
