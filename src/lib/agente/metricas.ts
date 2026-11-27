/**
 * La métrica de Mathieu, el agente IA (27/11/2026).
 *
 * Lo que devuelve `agente_metricas(p_mes)` en la base de LAC, leído a tipos.
 * El mismo archivo vive en el CRM y en el sitio de Dirección: si se cambia
 * uno, se cambia el otro.
 */

export interface SemanaMathieu {
  /** Lunes de la semana (YYYY-MM-DD). Las semanas se cortan al mes. */
  lunes: string;
  mensajes: number;
  chats: number;
  cambios: number;
}

export interface MesMathieu {
  mes: string;
  mensajes: number;
  chats: number;
  cambios: number;
}

export interface CambioDeRespuesta {
  situacion: string;
  textoAgente: string;
  respuestaDeseada: string;
  estado: "activo" | "desactivado";
  en: string;
  quien: string | null;
}

export interface MetricasMathieu {
  mes: string;
  /** Mensajes que contestó Mathieu en el mes (no cuenta notas internas). */
  mensajes: number;
  /** Chats donde contestó. */
  chats: number;
  /** Alertas que dejó al equipo («el cliente necesita atención»). */
  alertas: number;
  /** Cambios de respuesta hechos en el mes para entrenarlo. */
  cambios: number;
  /** Cambios que Mathieu está usando hoy, de cualquier mes. */
  cambiosActivos: number;
  semanas: SemanaMathieu[];
  meses: MesMathieu[];
  /** Los últimos cambios, del más nuevo al más viejo (hasta 8). */
  ultimos: CambioDeRespuesta[];
}

type Fila = Record<string, unknown>;
const n = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const lista = (v: unknown): Fila[] => (Array.isArray(v) ? (v as Fila[]) : []);

export function leerMetricasMathieu(d: unknown): MetricasMathieu | null {
  if (!d || typeof d !== "object") return null;
  const x = d as Fila;
  return {
    mes: String(x.mes ?? "").slice(0, 10),
    mensajes: n(x.mensajes),
    chats: n(x.chats),
    alertas: n(x.alertas),
    cambios: n(x.cambios),
    cambiosActivos: n(x.cambios_activos),
    semanas: lista(x.semanas).map((s) => ({
      lunes: String(s.lunes ?? "").slice(0, 10),
      mensajes: n(s.mensajes),
      chats: n(s.chats),
      cambios: n(s.cambios),
    })),
    meses: lista(x.meses).map((m) => ({
      mes: String(m.mes ?? "").slice(0, 10),
      mensajes: n(m.mensajes),
      chats: n(m.chats),
      cambios: n(m.cambios),
    })),
    ultimos: lista(x.ultimos).map((c) => ({
      situacion: String(c.situacion ?? ""),
      textoAgente: String(c.texto_agente ?? ""),
      respuestaDeseada: String(c.respuesta_deseada ?? ""),
      estado: c.estado === "desactivado" ? "desactivado" : "activo",
      en: String(c.en ?? ""),
      quien: c.quien ? String(c.quien) : null,
    })),
  };
}

/** Mensajes por chat, con un decimal. 0 si no hubo chats. */
export function mensajesPorChat(m: MetricasMathieu): number {
  return m.chats ? Math.round((m.mensajes / m.chats) * 10) / 10 : 0;
}
