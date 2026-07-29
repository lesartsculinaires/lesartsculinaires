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
