import "server-only";

import { CAL_EVENTS, TIPOS } from "@/data/calendario";
import { PROGRAMAS } from "@/data/programas";
import { VENDEDORES } from "@/data/vendedores";
import { getServerClient } from "@/lib/supabase/server";
import type {
  CanalEvento,
  EstadoEvento,
  EventoCalendario,
  Programa,
  ProgramaTipo,
  TipoEvento,
  Vendedor,
} from "@/lib/types";

/**
 * Reference data behind the CRM: the sales team, the programme catalogue, the
 * activity types and the calendar. Each loader falls back to the bundled seed
 * set, so an unconfigured or empty database still renders a usable CRM.
 */

export interface Catalog {
  vendedores: Vendedor[];
  programas: Programa[];
  tipos: TipoEvento[];
  eventos: EventoCalendario[];
}

const num = (v: unknown, fallback = 0): number => {
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : fallback;
};

const str = (v: unknown, fallback = ""): string =>
  v == null ? fallback : String(v);

const PROGRAMA_TIPOS: readonly ProgramaTipo[] = [
  "Diplomado",
  "Curso corto",
  "Certificación",
];

const CANALES: readonly CanalEvento[] = [
  "Presencial",
  "Llamada",
  "WhatsApp",
  "Meet",
];

const ESTADOS: readonly EstadoEvento[] = [
  "Pendiente",
  "Realizado",
  "No se presentó",
  "Reagendado",
];

type Row = Record<string, unknown>;

/**
 * Load everything in one round trip.
 *
 * A table that errors or comes back empty falls back independently, so a
 * missing `eventos` table does not cost you the programme catalogue.
 */
export async function fetchCatalog(): Promise<Catalog> {
  const supabase = getServerClient();
  const fallback: Catalog = {
    vendedores: [...VENDEDORES],
    programas: [...PROGRAMAS],
    tipos: [...TIPOS],
    eventos: [...CAL_EVENTS],
  };

  if (!supabase) return fallback;

  const [vend, prog, tipos, eventos] = await Promise.all([
    supabase.from("vendedores").select("*").order("nombre"),
    supabase.from("programas").select("*").order("nombre"),
    supabase.from("tipos_evento").select("*").order("orden"),
    supabase.from("eventos").select("*").order("dia_idx"),
  ]);

  const rows = (r: { data: unknown; error: unknown }): Row[] =>
    r.error || !Array.isArray(r.data) ? [] : (r.data as Row[]);

  const vendRows = rows(vend);
  const progRows = rows(prog);
  const tipoRows = rows(tipos);
  const eventoRows = rows(eventos);

  // Activity types drive the event mapping below, so resolve them first.
  const resolvedTipos: TipoEvento[] = tipoRows.length
    ? tipoRows.map((r) => ({
        label: str(r.label),
        code: str(r.codigo),
        color: str(r.color, "#6B665F"),
        dur: num(r.duracion_min, 30),
      }))
    : fallback.tipos;

  return {
    vendedores: vendRows.length
      ? vendRows.map((r) => ({
          name: str(r.nombre),
          role: str(r.rol),
          email: str(r.email),
          tel: str(r.tel),
          meta: num(r.meta),
          since: str(r.desde),
        }))
      : fallback.vendedores,

    programas: progRows.length
      ? progRows.map((r) => {
          const tipo = str(r.tipo) as ProgramaTipo;
          return {
            nombre: str(r.nombre),
            tipo: PROGRAMA_TIPOS.includes(tipo) ? tipo : "Curso corto",
            duracion: str(r.duracion),
            precio: num(r.precio),
            cuposLlenos: num(r.cupos_llenos),
            cuposTotal: num(r.cupos_total),
            inicio: str(r.inicio),
          };
        })
      : fallback.programas,

    tipos: resolvedTipos,

    eventos: eventoRows.length
      ? eventoRows.flatMap((r) => {
          const t = num(r.tipo_id, -1);
          // Drop events pointing at an activity type we do not know about
          // rather than rendering a badge with no colour or duration.
          if (t < 0 || t >= resolvedTipos.length) return [];

          const canal = str(r.canal) as CanalEvento;
          const estado = str(r.estado) as EstadoEvento;
          return [
            {
              id: str(r.id),
              idx: num(r.dia_idx, 1),
              h: num(r.hora, 9),
              t,
              lead: str(r.lead_id),
              vend: str(r.vendedor),
              canal: CANALES.includes(canal) ? canal : "Llamada",
              estado: ESTADOS.includes(estado) ? estado : "Pendiente",
              ...(r.next_text ? { nextText: str(r.next_text) } : {}),
            },
          ];
        })
      : fallback.eventos,
  };
}
