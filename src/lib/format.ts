/**
 * USD with thousands separators; blank values render as an em dash.
 * Whole amounts stay whole; cents always show both digits ($4,891.80).
 */
export const money = (n: number | null | undefined): string => {
  if (n == null) return "—";
  const v = Number(n);
  const decimals = Number.isInteger(v) ? 0 : 2;
  return (
    "$" +
    v.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
};

/** Compact money for chart labels: 1750 → "$1.8k". */
export const moneyShort = (n: number): string =>
  n >= 1000 ? "$" + Math.round(n / 100) / 10 + "k" : "$" + Math.round(n);

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const MESES_CORTOS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

/**
 * Parse an ISO date as a plain calendar date.
 *
 * `new Date("2026-07-08")` is parsed as UTC midnight, which lands on the
 * previous day in any negative-offset timezone — El Salvador is UTC-6, so
 * every date would render one day early. Splitting the string avoids that.
 */
export const parseISO = (iso: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

/** ISO date → "08/07/26". */
export const fechaCorta = (iso: string): string => {
  const d = parseISO(iso);
  if (!d) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
};

/** ISO date → "Julio 2026". */
export const mesLargo = (iso: string): string => {
  const d = parseISO(iso);
  return d ? `${MESES[d.getMonth()]} ${d.getFullYear()}` : "—";
};

/** ISO date → "Jul". */
export const mesCorto = (iso: string): string => {
  const d = parseISO(iso);
  return d ? MESES_CORTOS[d.getMonth()] : "—";
};

/** ISO date → "8 jul". */
export const diaMes = (iso: string): string => {
  const d = parseISO(iso);
  return d ? `${d.getDate()} ${MESES_CORTOS[d.getMonth()].toLowerCase()}` : "—";
};

/** ISO timestamp → "9:30". */
export const horaDe = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** "1 lead" / "4 leads". */
export const leadCount = (n: number): string =>
  n === 1 ? "1 lead" : `${n} leads`;

/** "1 evento" / "3 eventos". */
export const eventCount = (n: number): string =>
  n === 1 ? "1 evento" : `${n} eventos`;

/**
 * «hace 5 min», «ayer 14:30», «12/08/26 09:15».
 *
 * Lo reciente en relativo y lo viejo con fecha: para una nota de hace un rato
 * lo que se quiere saber es cuánto hace, y para una de hace meses, cuándo fue.
 */
export function cuando(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const minutos = Math.floor((Date.now() - d.getTime()) / 60000);
  const hora = d.toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit", hour12: false });

  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  if (minutos < 60 * 8) return `hace ${Math.floor(minutos / 60)} h`;

  const hoy = new Date();
  const mismoDia = d.toDateString() === hoy.toDateString();
  if (mismoDia) return `hoy ${hora}`;

  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === ayer.toDateString()) return `ayer ${hora}`;

  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)} ${hora}`;
}

/**
 * Cuándo pasó algo, con la hora exacta siempre a la vista.
 *
 * `cuando()` sola dice «hace 2 h», que se lee de un vistazo pero no sirve para
 * lo que hay que poder afirmar: a qué hora se generó un link, cuándo se movió
 * un monto. Acá van las dos cosas mientras el dato es reciente, y sólo la
 * fecha cuando ya pasó a ser historia, donde el relativo no aporta nada.
 */
export function cuandoConHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const p = (n: number) => String(n).padStart(2, "0");
  const exacta = `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)} ${p(d.getHours())}:${p(d.getMinutes())}`;

  const relativo = cuando(iso);
  // Pasadas unas horas `cuando()` ya devuelve la fecha; repetirla sería decir
  // dos veces lo mismo.
  return relativo.startsWith("hace") || relativo === "recién"
    ? `${relativo} · ${exacta}`
    : exacta;
}
