import type {
  CanalEvento,
  EstadoEvento,
  EventoCalendario,
  TipoEvento,
} from "@/lib/types";

/** Event types. Index into this array is what `EventoCalendario.t` stores. */
export const TIPOS: readonly TipoEvento[] = [
  { label: "Llamada / videollamada", code: "LL", color: "#2F6FA8", dur: 30 },
  { label: "Visita o tour al campus", code: "TC", color: "#B85042", dur: 60 },
  { label: "Clase muestra o demo", code: "CM", color: "#8A5AA8", dur: 120 },
  { label: "Envío de propuesta", code: "PR", color: "#0F6E7A", dur: 15 },
  { label: "Seguimiento", code: "SG", color: "#6B665F", dur: 20 },
  { label: "Recordatorio de pago", code: "PG", color: "#9C7118", dur: 15 },
  { label: "Reactivación a 6 meses", code: "RE", color: "#2F6B4F", dur: 20 },
];

export const CANALES_EV: readonly CanalEvento[] = [
  "Presencial",
  "Llamada",
  "WhatsApp",
  "Meet",
];

export const ESTADOS_EV: readonly EstadoEvento[] = [
  "Pendiente",
  "Realizado",
  "No se presentó",
  "Reagendado",
];

/** Rows of the Semana/Día time grid. */
export const CAL_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19] as const;

export const DOW = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"] as const;

/** Today, as a day index in the 1–62 window (28 = 28 jul 2026). */
export const TODAY = 28;

/** Height in px of one hour row in the time grid. */
export const HOUR_ROW = 52;

export const CAL_EVENTS: readonly EventoCalendario[] = [
  { id: "EV-01", idx: 24, h: 10, t: 0, lead: "LA-0412", vend: "Karla Menjívar", canal: "Llamada", estado: "Realizado" },
  { id: "EV-02", idx: 24, h: 15, t: 3, lead: "LA-0411", vend: "Rodrigo Solís", canal: "Meet", estado: "Realizado" },
  { id: "EV-03", idx: 27, h: 9.5, t: 1, lead: "LA-0408", vend: "Rodrigo Solís", canal: "Presencial", estado: "Realizado" },
  { id: "EV-04", idx: 27, h: 14, t: 0, lead: "LA-0407", vend: "Andrea Pineda", canal: "WhatsApp", estado: "No se presentó" },
  { id: "EV-05", idx: 27, h: 16, t: 5, lead: "LA-0413", vend: "Andrea Pineda", canal: "Llamada", estado: "Realizado" },
  { id: "EV-06", idx: 28, h: 9, t: 4, lead: "LA-0410", vend: "Karla Menjívar", canal: "WhatsApp", estado: "Pendiente" },
  { id: "EV-07", idx: 28, h: 10.5, t: 1, lead: "LA-0409", vend: "Andrea Pineda", canal: "Presencial", estado: "Pendiente" },
  { id: "EV-08", idx: 28, h: 12, t: 0, lead: "LA-0414", vend: "Karla Menjívar", canal: "Llamada", estado: "Pendiente" },
  { id: "EV-09", idx: 28, h: 14, t: 2, lead: "LA-0411", vend: "Rodrigo Solís", canal: "Presencial", estado: "Pendiente" },
  { id: "EV-10", idx: 28, h: 16.5, t: 5, lead: "LA-0405", vend: "Rodrigo Solís", canal: "Llamada", estado: "Pendiente" },
  { id: "EV-11", idx: 28, h: 17.5, t: 6, lead: "LA-0402", vend: "Karla Menjívar", canal: "WhatsApp", estado: "Pendiente" },
  { id: "EV-12", idx: 29, h: 9, t: 3, lead: "LA-0409", vend: "Andrea Pineda", canal: "Meet", estado: "Pendiente" },
  { id: "EV-13", idx: 29, h: 11, t: 0, lead: "LA-0404", vend: "Karla Menjívar", canal: "Llamada", estado: "Pendiente" },
  { id: "EV-14", idx: 29, h: 15, t: 1, lead: "LA-0414", vend: "Karla Menjívar", canal: "Presencial", estado: "Pendiente" },
  { id: "EV-15", idx: 30, h: 10, t: 2, lead: "LA-0407", vend: "Andrea Pineda", canal: "Presencial", estado: "Pendiente" },
  { id: "EV-16", idx: 30, h: 14.5, t: 4, lead: "LA-0413", vend: "Andrea Pineda", canal: "WhatsApp", estado: "Pendiente" },
  { id: "EV-17", idx: 31, h: 9.5, t: 5, lead: "LA-0405", vend: "Rodrigo Solís", canal: "Llamada", estado: "Pendiente" },
  { id: "EV-18", idx: 31, h: 11.5, t: 6, lead: "LA-0401", vend: "Andrea Pineda", canal: "WhatsApp", estado: "Pendiente" },
  { id: "EV-19", idx: 31, h: 16, t: 0, lead: "LA-0410", vend: "Karla Menjívar", canal: "Meet", estado: "Pendiente" },
  { id: "EV-20", idx: 34, h: 10, t: 1, lead: "LA-0408", vend: "Rodrigo Solís", canal: "Presencial", estado: "Pendiente" },
  { id: "EV-21", idx: 35, h: 15, t: 3, lead: "LA-0403", vend: "Karla Menjívar", canal: "Meet", estado: "Pendiente" },
];

/** Academic milestones shown in the month grid, keyed by day of July. */
export const ACAD: Record<number, string> = {
  3: "Inicia Les Petits Chefs",
  15: "Examen final Pastelería",
  24: "Graduación Cocina",
  31: "Cierre de reservas ciclo agosto",
};

/** Offsets offered when scheduling the mandatory next action. */
export const NEXT_WHEN = [
  ["Hoy", 0],
  ["Mañana", 1],
  ["En 3 días", 3],
  ["En 7 días", 7],
] as const;

export type CalView = "Mes" | "Semana" | "Día" | "Agenda" | "Equipo";

export const CAL_VIEWS: readonly CalView[] = [
  "Mes",
  "Semana",
  "Día",
  "Agenda",
  "Equipo",
];
