import { ESTADOS, ETAPAS } from "@/data/taxonomia";
import type { Cliente, ClientePatch, Estado, Etapa } from "@/lib/types";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  ADAPT THIS BLOCK TO YOUR TABLE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `TABLE` is the table the CSV was imported into, and `COLUMNS` maps each
 * field of the app's `Cliente` type to the column that holds it. If your
 * sheet used different headers — "telefono" instead of "tel", "email"
 * instead of "correo" — change the right-hand side here and nothing else in
 * the codebase needs to move.
 */
export const TABLE = "leads";

export const COLUMNS: Record<keyof Cliente, string> = {
  id: "id",
  fecha: "fecha",
  mes: "mes",
  vendedor: "vendedor",
  nombre: "nombre",
  producto: "producto",
  territorio: "territorio",
  canal: "canal",
  etapa: "etapa",
  estado: "estado",
  valor: "valor",
  cerrada: "cerrada",
  descuento: "descuento",
  tel: "tel",
  correo: "correo",
};

/** Column the app filters and updates by. Must be unique in the table. */
export const ID_COLUMN = COLUMNS.id;

/** Comma-separated select list, aliased back to the app's field names. */
export const SELECT_LIST = (Object.entries(COLUMNS) as [keyof Cliente, string][])
  .map(([field, column]) => (field === column ? field : `${field}:${column}`))
  .join(", ");

const str = (v: unknown, fallback = ""): string =>
  v == null ? fallback : String(v);

const num = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  // CSV imports often land as text like "$1,750" — strip anything non-numeric.
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const nullableNum = (v: unknown): number | null => {
  if (v == null || v === "" || v === "—") return null;
  const n = num(v);
  return n === 0 && String(v).trim() !== "0" ? null : n;
};

/** Keep unknown values from breaking the pills and the funnel maths. */
const asEtapa = (v: unknown): Etapa => {
  const s = str(v);
  return (ETAPAS as readonly string[]).includes(s) ? (s as Etapa) : "Nuevo lead";
};

const asEstado = (v: unknown): Estado => {
  const s = str(v);
  return (ESTADOS as readonly string[]).includes(s) ? (s as Estado) : "Activo";
};

/** One database row (already aliased by SELECT_LIST) → a `Cliente`. */
export function toCliente(row: Record<string, unknown>): Cliente {
  return {
    id: str(row.id),
    fecha: str(row.fecha),
    mes: str(row.mes),
    vendedor: str(row.vendedor, "Sin asignar"),
    nombre: str(row.nombre),
    producto: str(row.producto),
    territorio: str(row.territorio),
    canal: str(row.canal),
    etapa: asEtapa(row.etapa),
    estado: asEstado(row.estado),
    valor: num(row.valor),
    cerrada: nullableNum(row.cerrada),
    descuento: str(row.descuento, "—"),
    tel: str(row.tel),
    correo: str(row.correo),
  };
}

/** A `Cliente` patch → a row payload keyed by the real column names. */
export function toRow(patch: ClientePatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(patch)) {
    const column = COLUMNS[field as keyof Cliente];
    if (column) row[column] = value;
  }
  return row;
}
