import { ESTADOS_ABIERTOS } from "@/data/taxonomia";
import { money } from "@/lib/format";
import { openTone } from "@/lib/theme";
import type { Cliente } from "@/lib/types";

/** Leads still carrying live pipeline value. */
export const isOpen = (c: Cliente): boolean =>
  ESTADOS_ABIERTOS.includes(c.estado);

/**
 * Revenue booked against a lead. Falls back to the opportunity value when a won
 * deal has no explicit closed amount.
 */
export const wonAmount = (c: Cliente): number =>
  c.estado === "Ganado" ? c.cerrada || c.valor || 0 : 0;

/** Closed revenue for one month of `Cliente.mes`. */
export const monthWon = (list: readonly Cliente[], mes: string): number =>
  list
    .filter((c) => c.mes === mes && c.estado === "Ganado")
    .reduce((a, c) => a + (c.cerrada ?? 0), 0);

export const pipelineValue = (list: readonly Cliente[]): number =>
  list.filter(isOpen).reduce((a, c) => a + (c.valor || 0), 0);

export interface GroupedBar {
  label: string;
  count: string;
  value: string;
  /** Width % of the solid "won" segment. */
  wonPct: number;
  /** Width % of the lighter "still open" segment. */
  openPct: number;
}

/**
 * Aggregate leads by one field, ranked by total opportunity value.
 * Bar widths are relative to the largest group, not to the grand total.
 */
export function groupBars(
  list: readonly Cliente[],
  key: keyof Cliente,
  limit = 20,
): GroupedBar[] {
  const map = new Map<string, { n: number; val: number; w: number }>();
  for (const c of list) {
    const k = String(c[key]);
    const g = map.get(k) ?? { n: 0, val: 0, w: 0 };
    g.n += 1;
    g.val += c.valor || 0;
    g.w += wonAmount(c);
    map.set(k, g);
  }

  const rows = [...map.entries()]
    .sort((a, b) => b[1].val - a[1].val)
    .slice(0, limit);
  const max = Math.max(...rows.map((r) => r[1].val), 1);

  return rows.map(([label, g]) => ({
    label,
    count: g.n === 1 ? "1 lead" : `${g.n} leads`,
    value: money(g.val),
    wonPct: (g.w / max) * 100,
    openPct: ((g.val - g.w) / max) * 100,
  }));
}

/** Shared renderer input for the split won/open bar. */
export const barSegments = (bar: GroupedBar, accent: string) => [
  { width: `${bar.wonPct}%`, background: accent },
  { width: `${bar.openPct}%`, background: openTone(accent) },
];
