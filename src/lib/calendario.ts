/**
 * Las cuentas del Calendario, aparte de la pantalla (12/11/2026).
 *
 * Todo en hora de El Salvador, que es UTC−6 todo el año (no tiene horario de
 * verano). Se hace a mano y no con la zona del navegador porque el CRM se abre
 * también desde computadoras con otra hora configurada, y antes una llamada de
 * las 7 p. m. caía en el día siguiente: se agrupaba por la fecha UTC del ISO.
 *
 * Las fechas de día van como texto «AAAA-MM-DD», que se compara y ordena sin
 * sorpresas; las horas, como minutos desde la medianoche.
 *
 * Se prueba en supabase/pruebas/calendario.test.mjs.
 */

/** El Salvador: seis horas detrás de UTC, sin horario de verano. */
const DESFASE_MIN = -6 * 60;

export const DIAS_CORTOS = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
export const DIAS_LETRA = ["D", "L", "M", "X", "J", "V", "S"];
export const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** Un ISO como reloj de El Salvador: se leen los campos con getUTC*. */
function relojSV(iso: string): Date | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + DESFASE_MIN * 60_000);
}

const dos = (n: number) => String(n).padStart(2, "0");

/** «AAAA-MM-DD» de un Date leído en UTC. */
function textoDeDia(d: Date): string {
  return `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}`;
}

/** El día de El Salvador en que cae un ISO. */
export function diaSV(iso: string): string {
  const d = relojSV(iso);
  return d ? textoDeDia(d) : "";
}

/** Minutos desde la medianoche de El Salvador. */
export function minutoSV(iso: string): number {
  const d = relojSV(iso);
  return d ? d.getUTCHours() * 60 + d.getUTCMinutes() : 0;
}

/** «9:30» / «14:05», en hora de El Salvador. */
export function horaSV(iso: string): string {
  const m = minutoSV(iso);
  return `${Math.floor(m / 60)}:${dos(m % 60)}`;
}

/** «9:30 – 10:00»: el horario de un evento, en hora de El Salvador. */
export function horarioDelEvento(iniciaEn: string, duracionMin: number): string {
  const fin = new Date(new Date(iniciaEn).getTime() + duracionMin * 60_000).toISOString();
  return `${horaSV(iniciaEn)} – ${horaSV(fin)}`;
}

/** «HH:MM» para un input type=time. */
export function horaInputSV(iso: string): string {
  const m = minutoSV(iso);
  return `${dos(Math.floor(m / 60))}:${dos(m % 60)}`;
}

/** Hoy en El Salvador. */
export function hoySV(ahora: Date = new Date()): string {
  return diaSV(ahora.toISOString());
}

/** De «AAAA-MM-DD» + «HH:MM» de El Salvador al ISO de verdad. */
export function isoDesdeSV(dia: string, hora: string): string {
  const [a, m, d] = dia.split("-").map(Number);
  const [h, mi] = hora.split(":").map(Number);
  const utc = Date.UTC(a, m - 1, d, h, mi) - DESFASE_MIN * 60_000;
  return new Date(utc).toISOString();
}

function aFecha(dia: string): Date {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

export function sumarDias(dia: string, n: number): string {
  const d = aFecha(dia);
  d.setUTCDate(d.getUTCDate() + n);
  return textoDeDia(d);
}

export function sumarMeses(dia: string, n: number): string {
  const d = aFecha(dia);
  const objetivo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  // Se queda en el mismo día si existe; si no (31 → febrero), el último.
  const ultimo = new Date(Date.UTC(objetivo.getUTCFullYear(), objetivo.getUTCMonth() + 1, 0)).getUTCDate();
  objetivo.setUTCDate(Math.min(d.getUTCDate(), ultimo));
  return textoDeDia(objetivo);
}

/** 0 = domingo. */
export function diaDeLaSemana(dia: string): number {
  return aFecha(dia).getUTCDay();
}

/** El domingo que empieza la semana de ese día, como en Google Calendar. */
export function inicioDeSemana(dia: string): string {
  return sumarDias(dia, -diaDeLaSemana(dia));
}

/** Los 7 días de la semana de ese día, de domingo a sábado. */
export function semanaDe(dia: string): string[] {
  const inicio = inicioDeSemana(dia);
  return Array.from({ length: 7 }, (_, i) => sumarDias(inicio, i));
}

/**
 * Las semanas que se dibujan para un mes: de domingo a sábado, empezando en
 * la semana del día 1 y terminando en la del último. Entre 4 y 6 renglones.
 */
export function grillaDelMes(dia: string): string[][] {
  const [a, m] = dia.split("-").map(Number);
  const primero = `${a}-${dos(m)}-01`;
  const ultimo = textoDeDia(new Date(Date.UTC(a, m, 0)));
  const semanas: string[][] = [];
  let inicio = inicioDeSemana(primero);
  while (inicio <= ultimo) {
    semanas.push(Array.from({ length: 7 }, (_, i) => sumarDias(inicio, i)));
    inicio = sumarDias(inicio, 7);
  }
  return semanas;
}

export const mismoMes = (a: string, b: string) => a.slice(0, 7) === b.slice(0, 7);
export const numeroDelDia = (dia: string) => Number(dia.slice(8, 10));
export const nombreDelMes = (dia: string) => MESES[Number(dia.slice(5, 7)) - 1];

/** «noviembre de 2026». */
export function tituloDelMes(dia: string): string {
  return `${nombreDelMes(dia)} de ${dia.slice(0, 4)}`;
}

/**
 * El título de la barra de arriba, según la vista: «noviembre de 2026»,
 * «8 – 14 de noviembre de 2026», «29 nov – 5 dic de 2026», «jueves, 12 de
 * noviembre de 2026».
 */
export function tituloDelRango(vista: Vista, dia: string): string {
  if (vista === "mes" || vista === "agenda") return tituloDelMes(dia);
  if (vista === "dia") {
    const nombre = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][diaDeLaSemana(dia)];
    return `${nombre}, ${numeroDelDia(dia)} de ${tituloDelMes(dia)}`;
  }
  const semana = semanaDe(dia);
  const a = semana[0];
  const b = semana[6];
  if (mismoMes(a, b)) return `${numeroDelDia(a)} – ${numeroDelDia(b)} de ${tituloDelMes(a)}`;
  const corto = (d: string) => `${numeroDelDia(d)} ${nombreDelMes(d).slice(0, 3)}`;
  return `${corto(a)} – ${corto(b)} de ${b.slice(0, 4)}`;
}

export type Vista = "dia" | "semana" | "mes" | "agenda";

/** Moverse con las flechas: un día, una semana o un mes según la vista. */
export function moverRango(vista: Vista, dia: string, paso: 1 | -1): string {
  if (vista === "dia") return sumarDias(dia, paso);
  if (vista === "semana") return sumarDias(dia, 7 * paso);
  return sumarMeses(dia, paso);
}

/** Lo mínimo de un evento para acomodarlo en una columna de horas. */
export interface EnLaColumna {
  id: number;
  iniciaEn: string;
  duracionMin: number;
}

export interface Acomodado {
  id: number;
  /** Minutos desde la medianoche. */
  desde: number;
  hasta: number;
  /** En qué carril cae y cuántos carriles hay en su grupo de cruces. */
  carril: number;
  carriles: number;
}

/**
 * Acomoda los eventos de un día en carriles, como Google Calendar: los que se
 * cruzan en el tiempo se ponen lado a lado, y cada grupo de cruces reparte el
 * ancho entre sus carriles. Un evento que termina justo cuando empieza otro no
 * se cruza con él.
 *
 * Los eventos muy cortos ocupan al menos 20 minutos en pantalla, para que se
 * puedan leer y tocar; para decidir los cruces cuenta ese mismo alto.
 */
export function acomodarDia(eventos: readonly EnLaColumna[], minimoMin = 20): Acomodado[] {
  const piezas = eventos
    .map((e) => {
      const desde = minutoSV(e.iniciaEn);
      const hasta = Math.min(24 * 60, desde + Math.max(e.duracionMin, minimoMin));
      return { id: e.id, desde, hasta, carril: 0, carriles: 1 };
    })
    .sort((a, b) => a.desde - b.desde || b.hasta - a.hasta || a.id - b.id);

  let grupo: typeof piezas = [];
  let finDelGrupo = -1;
  const cerrarGrupo = () => {
    const total = Math.max(1, ...grupo.map((p) => p.carril + 1));
    for (const p of grupo) p.carriles = total;
    grupo = [];
  };

  for (const p of piezas) {
    if (grupo.length && p.desde >= finDelGrupo) cerrarGrupo();
    // El primer carril libre: el que ya terminó cuando éste empieza.
    const ocupados = new Set(grupo.filter((g) => g.hasta > p.desde).map((g) => g.carril));
    let carril = 0;
    while (ocupados.has(carril)) carril++;
    p.carril = carril;
    grupo.push(p);
    finDelGrupo = Math.max(finDelGrupo, p.hasta);
  }
  if (grupo.length) cerrarGrupo();

  return piezas;
}

/** Redondea un minuto del día al cuarto de hora de abajo (para crear con un clic). */
export function alCuarto(minuto: number): number {
  return Math.max(0, Math.min(24 * 60 - 15, Math.floor(minuto / 15) * 15));
}

export const horaDeMinuto = (m: number) => `${dos(Math.floor(m / 60))}:${dos(m % 60)}`;

/** «9 a. m.», «12 p. m.», «3 p. m.»: las etiquetas de la columna de horas. */
export function etiquetaDeHora(h: number): string {
  if (h === 0) return "12 a. m.";
  if (h < 12) return `${h} a. m.`;
  if (h === 12) return "12 p. m.";
  return `${h - 12} p. m.`;
}
