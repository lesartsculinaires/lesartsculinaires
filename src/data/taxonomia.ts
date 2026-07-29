import type { ColumnDef, Estado, Etapa, Tone } from "@/lib/types";

export const CANALES = [
  "Instagram",
  "Facebook",
  "WhatsApp",
  "TikTok",
  "Página web",
  "Ex alumnos",
  "Corporativo",
  "Referido",
  "Orgánico",
] as const;

/** Pipeline order. Index position drives the stage stepper in the client drawer. */
export const ETAPAS: readonly Etapa[] = [
  "Nuevo lead",
  "Asignado",
  "Calificación",
  "Propuesta",
  "Reserva de cupo",
  "Pago / cierre",
  "Ganado",
  "Perdido / dormido",
];

export const ETAPA_DESC: Record<Etapa, string> = {
  "Nuevo lead": "sin asignar",
  Asignado: "contacto inicial",
  Calificación: "¿aplica la oferta?",
  Propuesta: "oferta enviada",
  "Reserva de cupo": "cupo apartado",
  "Pago / cierre": "cobro en proceso",
  Ganado: "inscrito",
  "Perdido / dormido": "recordatorio a 6 meses",
};

/** The terminal stage, styled apart from the rest of the funnel. */
export const LOST: Etapa = "Perdido / dormido";

export const ESTADOS: readonly Estado[] = [
  "Activo",
  "Ganado",
  "Perdido",
  "En pausa",
  "Inactivo",
  "Reserva",
];

/** Estados that still count as live pipeline value. */
export const ESTADOS_ABIERTOS: readonly Estado[] = ["Activo", "En pausa", "Reserva"];

export const TERRITORIOS = [
  "Ahuachapán",
  "Santa Ana",
  "Sonsonate",
  "La Libertad",
  "San Salvador",
  "Chalatenango",
  "Cabañas",
  "La Paz",
  "Cuscatlán",
  "San Vicente",
  "Usulután",
] as const;

export const ESTADO_TONE: Record<Estado, Tone> = {
  Activo: ["#0F6E7A", "#E2F0F1"],
  Ganado: ["#2F6B4F", "#E6F0E9"],
  Perdido: ["#B85042", "#F7EBE9"],
  "En pausa": ["#9C7118", "#F6EEDC"],
  Inactivo: ["#75706A", "#EDEBE6"],
  Reserva: ["#5A5EA6", "#EBECF7"],
};

/** Table columns, in display order. Hidden ones are opt-in via the column picker. */
export const COLS: readonly ColumnDef[] = [
  { key: "id", label: "ID", kind: "mono", hiddenByDefault: false },
  { key: "fecha", label: "Fecha", kind: "mono", hiddenByDefault: false },
  { key: "mes", label: "Mes", kind: "", hiddenByDefault: true },
  { key: "vendedor", label: "Vendedor", kind: "", hiddenByDefault: false },
  { key: "nombre", label: "Nombre", kind: "name", hiddenByDefault: false },
  { key: "producto", label: "Producto / Servicio", kind: "", hiddenByDefault: false },
  { key: "territorio", label: "Territorio", kind: "", hiddenByDefault: false },
  { key: "canal", label: "Canal", kind: "", hiddenByDefault: false },
  { key: "etapa", label: "Etapa", kind: "pill", hiddenByDefault: false },
  { key: "estado", label: "Estado", kind: "pill", hiddenByDefault: false },
  { key: "valor", label: "Valor oportunidad", kind: "money", hiddenByDefault: false },
  { key: "cerrada", label: "Venta cerrada", kind: "money", hiddenByDefault: true },
  { key: "descuento", label: "Descuento / promoción", kind: "", hiddenByDefault: true },
  { key: "tel", label: "Teléfono", kind: "mono", hiddenByDefault: true },
  { key: "correo", label: "Correo", kind: "", hiddenByDefault: true },
];
