import type { CSSProperties } from "react";

import { ACAD, DOW } from "@/data/calendario";
import { T, softer } from "@/lib/theme";
import type {
  Cliente,
  EstadoEvento,
  EventoCalendario,
  Programa,
  TipoEvento,
  Tone,
} from "@/lib/types";

/** An event joined to its lead, ready to render. */
export interface EventoVista extends EventoCalendario {
  leadName: string;
  programa: string;
  /** Minutes, taken from the event type. */
  dur: number;
}

export function enrich(
  e: EventoCalendario,
  clientes: readonly Cliente[],
  tipos: readonly TipoEvento[],
): EventoVista {
  const lead = clientes.find((c) => c.id === e.lead);
  return {
    ...e,
    leadName: lead ? lead.nombre : "Sin lead vinculado",
    programa: lead ? lead.producto : "—",
    dur: tipos[e.t]?.dur ?? 30,
  };
}

/**
 * The calendar runs on a flat day index over a two-month window:
 * 1 = 1 jul 2026 … 31 = 31 jul, 32 = 1 ago … 62 = 31 ago.
 * Everything below converts that index into something displayable.
 */

export const FIRST_JULY = 1;
export const FIRST_AUGUST = 32;
export const LAST_INDEX = 62;

/** Day index → calendar month (7 or 8) and day of month. */
export const md = (i: number): { m: number; d: number } =>
  i <= 31 ? { m: 7, d: i } : { m: 8, d: i - 31 };

/** Day index → position in DOW. 1 jul 2026 was a Wednesday, hence the +1. */
export const wd = (i: number): number => (i + 1) % 7;

export const dayLabel = (i: number): string =>
  `${md(i).d} ${md(i).m === 7 ? "jul" : "ago"}`;

export const dowLabel = (i: number): string => DOW[wd(i)];

/** Monday of the week containing `i`. */
export const weekStartOf = (i: number): number => i - wd(i);

/** Academic note for a day: a July milestone, or an August cohort start. */
export function acadOf(i: number, programas: readonly Programa[]): string {
  const { m, d } = md(i);
  if (m === 7) return ACAD[d] ?? "";
  const p = programas.find((x) => x.inicio === `${d} ago`);
  return p ? `Inicia ${p.nombre}` : "";
}

/** Pill colours for an event status; pending events take the area accent. */
export function estadoTone(e: EstadoEvento, accent: string): Tone {
  if (e === "Realizado") return ["#2F6B4F", "#E6F0E9"];
  if (e === "No se presentó") return ["#B85042", "#F7EBE9"];
  if (e === "Reagendado") return ["#9C7118", "#F6EEDC"];
  return [accent, softer(accent)];
}

/** Square colour-coded badge carrying the event type's two-letter code. */
export function badgeStyle(tipo: TipoEvento | undefined, size?: number): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: size ?? 20,
    height: size ?? 20,
    flexShrink: 0,
    borderRadius: 5,
    background: tipo?.color ?? "#6B665F",
    color: "#fff",
    fontSize: size ? 10.5 : 9.5,
    letterSpacing: "0.02em",
  };
}

/** Shared toolbar button styles. */
export const navBtnStyle: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 6,
  border: `1px solid ${T.border}`,
  background: T.surface,
  color: T.muted,
  fontSize: 14,
};

export const todayBtnStyle: CSSProperties = {
  height: 28,
  padding: "0 12px",
  fontSize: 12.5,
  borderRadius: 6,
  border: `1px solid ${T.border}`,
  background: T.surface,
  color: T.muted,
};
