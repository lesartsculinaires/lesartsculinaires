/**
 * Domain types for the Les Arts Culinaires CRM.
 *
 * `Cliente` mirrors one row of the leads sheet: every field is a flat scalar so
 * a CSV upload can be mapped column-for-column onto this shape without any
 * restructuring. Keep it that way — see `src/data/clientes.ts`.
 */

export type Etapa =
  | "Nuevo lead"
  | "Asignado"
  | "Calificación"
  | "Propuesta"
  | "Reserva de cupo"
  | "Pago / cierre"
  | "Ganado"
  | "Perdido / dormido";

export type Estado =
  | "Activo"
  | "Ganado"
  | "Perdido"
  | "En pausa"
  | "Inactivo"
  | "Reserva";

export interface Cliente {
  id: string;
  /** dd/mm/yy, as it arrives from the sheet. */
  fecha: string;
  mes: string;
  vendedor: string;
  nombre: string;
  producto: string;
  territorio: string;
  canal: string;
  etapa: Etapa;
  estado: Estado;
  /** Opportunity value in USD. */
  valor: number;
  /** Closed amount in USD; null until the deal is won. */
  cerrada: number | null;
  descuento: string;
  tel: string;
  correo: string;
}

/** Any subset of a client's editable fields, used for in-session edits. */
export type ClientePatch = Partial<Omit<Cliente, "id">>;

export type ColumnKind = "mono" | "money" | "pill" | "name" | "";

export interface ColumnDef {
  key: keyof Cliente;
  label: string;
  kind: ColumnKind;
  /** Hidden until the user enables it in the column picker. */
  hiddenByDefault: boolean;
}

export interface Vendedor {
  name: string;
  role: string;
  email: string;
  tel: string;
  /** Monthly sales target in USD. */
  meta: number;
  since: string;
}

export type ProgramaTipo = "Diplomado" | "Curso corto" | "Certificación";

export interface Programa {
  nombre: string;
  tipo: ProgramaTipo;
  duracion: string;
  precio: number;
  cuposLlenos: number;
  cuposTotal: number;
  inicio: string;
}

/** Event type: label, two-letter badge code, badge colour, default minutes. */
export interface TipoEvento {
  label: string;
  code: string;
  color: string;
  dur: number;
}

export type EstadoEvento =
  | "Pendiente"
  | "Realizado"
  | "No se presentó"
  | "Reagendado";

export type CanalEvento = "Presencial" | "Llamada" | "WhatsApp" | "Meet";

export interface EventoCalendario {
  id: string;
  /** Day index across the two-month window: 1 = 1 jul … 62 = 31 ago. */
  idx: number;
  /** Start hour as a decimal; 9.5 means 09:30. */
  h: number;
  /** Index into TIPOS. */
  t: number;
  /** Client id this event belongs to. */
  lead: string;
  vend: string;
  canal: CanalEvento;
  estado: EstadoEvento;
  /** Set when the event is closed with a scheduled next action. */
  nextText?: string;
}

export type EventoPatch = Partial<Omit<EventoCalendario, "id">>;

/** Foreground / background pair for a status pill. */
export type Tone = readonly [fg: string, bg: string];
