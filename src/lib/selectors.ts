import { money } from "@/lib/format";
import { openTone } from "@/lib/theme";
import type { Estado, Oportunidad, Tone } from "@/lib/types";

/** Live pipeline: anything not in a final state. */
export const estaAbierta = (o: Oportunidad): boolean => !o.esFinal;

export const esGanada = (o: Oportunidad): boolean => o.estado === "Ganado";

/** Revenue booked; falls back to the opportunity value when not recorded. */
export const montoGanado = (o: Oportunidad): number =>
  esGanada(o) ? (o.cerrada ?? o.valor ?? 0) : 0;

export const valorPipeline = (list: readonly Oportunidad[]): number =>
  list.filter(estaAbierta).reduce((a, o) => a + (o.valor ?? 0), 0);

export const totalCerrado = (list: readonly Oportunidad[]): number =>
  list.reduce((a, o) => a + (o.cerrada ?? 0), 0);

/** Closed revenue for one month, keyed by the view's `mes` column. */
export const cerradoEnMes = (list: readonly Oportunidad[], mes: string): number =>
  list.filter((o) => o.mes === mes).reduce((a, o) => a + (o.cerrada ?? 0), 0);

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
 * Aggregate opportunities by one text field, ranked by total value.
 * Bar widths are relative to the largest group, not to the grand total.
 */
export function groupBars(
  list: readonly Oportunidad[],
  key: "vendedor" | "canal" | "territorio" | "producto" | "etapa" | "estado",
  limit = 20,
): GroupedBar[] {
  const map = new Map<string, { n: number; val: number; won: number }>();
  for (const o of list) {
    const k = o[key];
    const g = map.get(k) ?? { n: 0, val: 0, won: 0 };
    g.n += 1;
    g.val += o.valor ?? 0;
    g.won += montoGanado(o);
    map.set(k, g);
  }

  // Rank by value, but keep groups that have leads yet no amounts recorded.
  const rows = [...map.entries()]
    .sort((a, b) => b[1].val - a[1].val || b[1].n - a[1].n)
    .slice(0, limit);
  const max = Math.max(...rows.map((r) => r[1].val), 1);

  return rows.map(([label, g]) => ({
    label,
    count: g.n === 1 ? "1 lead" : `${g.n} leads`,
    value: money(g.val || null),
    wonPct: (g.won / max) * 100,
    openPct: ((g.val - g.won) / max) * 100,
  }));
}

/** Colours for a status pill, resolved from the catalogue. */
export function estadoTone(nombre: string, accent: string): Tone {
  switch (nombre) {
    case "Ganado":
      return ["#2F6B4F", "#E6F0E9"];
    case "Perdido":
      return ["#B85042", "#F7EBE9"];
    case "Reserva":
      return ["#5A5EA6", "#EBECF7"];
    case "En pausa/inactivo":
      return ["#9C7118", "#F6EEDC"];
    case "Activo":
      return ["#0F6E7A", "#E2F0F1"];
    default:
      return [accent, openTone(accent)];
  }
}

/** The stage colour: won and lost read apart from the rest of the funnel. */
export const etapaTone = (nombre: string, accent: string): string =>
  nombre === "Cierre" ? "#2F6B4F" : accent;

/** True when this state means the deal was lost. */
export const esPerdida = (e: Estado): boolean =>
  e.esFinal && e.nombre === "Perdido";
