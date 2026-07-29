/** USD with thousands separators; blank values render as an em dash. */
export const money = (n: number | null | undefined | ""): string =>
  n == null || n === "" ? "—" : "$" + Number(n).toLocaleString("en-US");

/** Decimal hour → "9:30" / "14:00". */
export const hora = (h: number): string =>
  `${Math.floor(h)}:${h % 1 ? "30" : "00"}`;

/** "1 lead" / "4 leads". */
export const leadCount = (n: number): string =>
  n === 1 ? "1 lead" : `${n} leads`;

/** "1 evento" / "3 eventos". */
export const eventCount = (n: number): string =>
  n === 1 ? "1 evento" : `${n} eventos`;
