/**
 * Los datos del Tablero Comercial: cómo se llama cada uno, quién lo llena y
 * si el CRM ya lo sabe.
 *
 * Los nombres son los de la plantilla de la Dirección, letra por letra: es lo
 * que el equipo ya conoce y lo que la Dirección va a buscar en la pantalla.
 *
 * ============================================================================
 * DE DÓNDE SALE CADA DATO
 * ============================================================================
 *
 *   manual       Lo escribe el área. El CRM no tiene forma de saberlo: la
 *                pauta, el alcance, las reseñas de Google.
 *
 *   crm          Sale solo del CRM. Si el área escribe un número, manda el
 *                del área (por ejemplo, un lead que llegó por teléfono y no
 *                quedó en el CRM), y la pantalla lo marca como corregido.
 *
 *   referencia   Lo escribe el área, y al lado se muestra lo que dice el CRM
 *                como ayuda. Es para los montos de venta: la plantilla cuenta
 *                «matrícula + 1ª cuota», y el CRM guarda el valor del
 *                programa. Hasta que la Dirección confirme qué se cuenta, el
 *                número del CRM no puede pasar solo al Tablero.
 */

export type Origen = "manual" | "crm" | "referencia";
export type Formato = "numero" | "dinero" | "decimal" | "porcentaje";

export interface Campo {
  /** La clave guardada: «mk.pauta_meta». */
  clave: string;
  /** El encabezado de la plantilla. */
  nombre: string;
  formato: Formato;
  origen: Origen;
}

/** Los nueve canales de la plantilla. Los tres primeros son de pauta. */
export const CANALES_TABLERO = [
  { clave: "meta", nombre: "Meta (FB/IG)", pauta: true },
  { clave: "tiktok", nombre: "TikTok", pauta: true },
  { clave: "google", nombre: "Google", pauta: true },
  { clave: "organico", nombre: "Redes orgánicas / WhatsApp", pauta: false },
  { clave: "colegios", nombre: "Colegios y ferias", pauta: false },
  { clave: "alianzas", nombre: "Alianzas y empresas", pauta: false },
  { clave: "clases", nombre: "Clases muestra / open house", pauta: false },
  { clave: "referidos", nombre: "Referidos y exalumnos", pauta: false },
  { clave: "recontacto", nombre: "Recontacto base de datos", pauta: false },
] as const;

export type ClaveCanal = (typeof CANALES_TABLERO)[number]["clave"];

/** «MK semanal»: lo que llena el Director de Marketing, en el orden de la plantilla. */
export const CAMPOS_MK: readonly Campo[] = [
  { clave: "mk.pauta_meta", nombre: "Pauta Meta (FB/IG) $", formato: "dinero", origen: "manual" },
  { clave: "mk.pauta_tiktok", nombre: "Pauta TikTok $", formato: "dinero", origen: "manual" },
  { clave: "mk.pauta_google", nombre: "Pauta Google $", formato: "dinero", origen: "manual" },
  { clave: "mk.pauta_otros", nombre: "Otros (influencers, impresos) $", formato: "dinero", origen: "manual" },
  { clave: "mk.alcance", nombre: "Alcance (personas)", formato: "numero", origen: "manual" },
  { clave: "mk.seguidores", nombre: "Seguidores nuevos (todas las redes)", formato: "numero", origen: "manual" },
  { clave: "mk.publicaciones", nombre: "Publicaciones hechas", formato: "numero", origen: "manual" },
  { clave: "mk.visitas_colegios", nombre: "Visitas a colegios / ferias hechas", formato: "numero", origen: "manual" },
  { clave: "mk.clases_muestra", nombre: "Clases muestra / open house hechas", formato: "numero", origen: "manual" },
  ...CANALES_TABLERO.map((c) => ({
    clave: `mk.leads_${c.clave}`,
    nombre: `Leads ${c.nombre}`,
    formato: "numero" as const,
    origen: "crm" as const,
  })),
  { clave: "mk.resenas", nombre: "Reseñas nuevas Google", formato: "numero", origen: "manual" },
  { clave: "mk.calificacion", nombre: "Calificación Google (al domingo)", formato: "decimal", origen: "manual" },
];

/** «Ventas semanal»: lo que llena la Gerente de Ventas, en el orden de la plantilla. */
export const CAMPOS_VENTAS: readonly Campo[] = [
  { clave: "ventas.contactados_24h", nombre: "Leads contactados en menos de 24 h", formato: "numero", origen: "crm" },
  { clave: "ventas.contactados", nombre: "Leads contactados (total)", formato: "numero", origen: "crm" },
  { clave: "ventas.citas", nombre: "Citas / visitas / clases muestra", formato: "numero", origen: "crm" },
  ...CANALES_TABLERO.map((c, i) => ({
    clave: `ventas.inscritos_${c.clave}`,
    nombre: i === 0 ? `Inscritos que vinieron de ${c.nombre}` : `De ${c.nombre}`,
    formato: "numero" as const,
    origen: "crm" as const,
  })),
  { clave: "ventas.cursos_cortos", nombre: "Cursos cortos vendidos", formato: "numero", origen: "crm" },
  { clave: "ventas.cotizaciones_corp", nombre: "Cotizaciones corporativas enviadas", formato: "numero", origen: "manual" },
  { clave: "ventas.contratos_corp", nombre: "Contratos corporativos cerrados", formato: "numero", origen: "manual" },
  { clave: "ventas.cobrado_nuevos", nombre: "Cobrado a alumnos nuevos $ (matrícula + 1ª cuota)", formato: "dinero", origen: "referencia" },
  { clave: "ventas.cursos_cortos_monto", nombre: "Cursos cortos $", formato: "dinero", origen: "referencia" },
  { clave: "ventas.corporativo_monto", nombre: "Corporativo $", formato: "dinero", origen: "manual" },
  { clave: "ventas.descuentos", nombre: "Descuentos y becas otorgados $", formato: "dinero", origen: "manual" },
];

/** «Actividad de ventas»: por persona y por semana. */
export const CAMPOS_ACTIVIDAD: readonly Campo[] = [
  { clave: "llamadas", nombre: "Llamadas hechas", formato: "numero", origen: "referencia" },
  { clave: "mensajes", nombre: "Mensajes / WhatsApp de seguimiento", formato: "numero", origen: "crm" },
  { clave: "recontactos", nombre: "Leads viejos recontactados", formato: "numero", origen: "manual" },
  { clave: "citas_agendadas", nombre: "Citas agendadas", formato: "numero", origen: "crm" },
  { clave: "citas_realizadas", nombre: "Citas / visitas realizadas", formato: "numero", origen: "crm" },
  { clave: "salidas_campo", nombre: "Salidas de campo (empresas, colegios, calle)", formato: "numero", origen: "manual" },
  { clave: "eventos", nombre: "Eventos o clases muestra atendidos", formato: "numero", origen: "manual" },
  { clave: "ventas_cerradas", nombre: "Ventas cerradas (#)", formato: "numero", origen: "crm" },
];

/** «Ventas por persona»: el cierre del mes. Las columnas de la plantilla, tal cual. */
export const CAMPOS_VENTAS_PERSONA: readonly Campo[] = [
  { clave: "diplomados", nombre: "Diplomados vendidos (#)", formato: "numero", origen: "crm" },
  { clave: "dipl_6m_completos", nombre: "Diplomados 6 meses pagados completos (#)", formato: "numero", origen: "manual" },
  { clave: "dipl_12_18_completos", nombre: "Diplomados 12–18 meses pagados completos (#)", formato: "numero", origen: "manual" },
  { clave: "cursos_cortos", nombre: "Cursos cortos vendidos (#)", formato: "numero", origen: "crm" },
  { clave: "lpc_3_5", nombre: "Les Petits Chef 3–5 sesiones (#)", formato: "numero", origen: "manual" },
  { clave: "lpc_6", nombre: "Les Petits Chef 6 sesiones (#)", formato: "numero", origen: "manual" },
  { clave: "supreme_completo", nombre: "Le Supreme Diplome pago completo $", formato: "dinero", origen: "manual" },
  { clave: "supreme_parcial", nombre: "Le Supreme Diplome pago parcial (#)", formato: "numero", origen: "manual" },
  { clave: "certif_completa", nombre: "Certificación internacional completa (#)", formato: "numero", origen: "manual" },
  { clave: "certif_modulo", nombre: "Certificación por módulo (#)", formato: "numero", origen: "manual" },
  { clave: "clases_personalizadas", nombre: "Clases personalizadas $", formato: "dinero", origen: "manual" },
  { clave: "dark_kitchen", nombre: "Dark Kitchen $", formato: "dinero", origen: "manual" },
  { clave: "ger_diplomados", nombre: "SOLO GERENTE: venta de diplomados $", formato: "dinero", origen: "manual" },
  { clave: "ger_cursos", nombre: "SOLO GERENTE: cursos cortos y especializaciones $", formato: "dinero", origen: "manual" },
  { clave: "ger_eventos", nombre: "SOLO GERENTE: otros eventos $", formato: "dinero", origen: "manual" },
  { clave: "ger_pagados_completos", nombre: "SOLO GERENTE: cursos o diplomados pagados completos $", formato: "dinero", origen: "manual" },
];

/** Los tipos de acción del plan, como en la lista de la plantilla. */
export const TIPOS_DE_ACCION = [
  "Evento / open house",
  "Clase muestra",
  "Visita a colegio o universidad",
  "Feria",
  "Alianza con empresa",
  "Activación en calle",
  "Recontacto de base de datos",
  "Campaña de pauta",
  "Contenido orgánico / redes",
  "Corporativo / licitación",
  "Otro",
] as const;

export const ESTADOS_DE_ACCION = ["Planificada", "Hecha", "Reprogramada", "Cancelada"] as const;

/** Las metas del mes (tabla 1 de «Metas»). */
export const METAS_DEL_MES = [
  { clave: "venta_nueva", nombre: "META DE VENTA NUEVA $ (la define Dirección)", formato: "dinero" },
  { clave: "leads", nombre: "Meta de leads", formato: "numero" },
  { clave: "presupuesto_pauta", nombre: "Presupuesto de pauta $", formato: "dinero" },
] as const;

/** Las metas fijas (tabla 2 de «Metas»). `sentido`: mín. = hay que llegar; máx. = no pasarse. */
export const METAS_FIJAS = [
  { clave: "cursos_cortos", nombre: "Cursos cortos vendidos al mes (mín.)", formato: "numero", sentido: "min" },
  { clave: "contratos_corp", nombre: "Contratos corporativos al mes (mín.)", formato: "numero", sentido: "min" },
  { clave: "contactados_24h", nombre: "Leads contactados en menos de 24 h (mín.)", formato: "porcentaje", sentido: "min" },
  { clave: "descuentos_pct", nombre: "Descuentos como % de lo vendido (máx.)", formato: "porcentaje", sentido: "max" },
  { clave: "conversion", nombre: "Conversión lead → inscrito (mín.)", formato: "porcentaje", sentido: "min" },
  { clave: "costo_por_inscrito", nombre: "Costo de pauta por inscrito (máx. $)", formato: "dinero", sentido: "max" },
  { clave: "costo_por_lead", nombre: "Costo por lead (máx. $)", formato: "dinero", sentido: "max" },
  { clave: "retorno_pauta", nombre: "Retorno de la pauta: venta ÷ inversión (mín.)", formato: "decimal", sentido: "min" },
  { clave: "seguidores", nombre: "Seguidores nuevos al mes (mín.)", formato: "numero", sentido: "min" },
  { clave: "publicaciones", nombre: "Publicaciones al mes (mín.)", formato: "numero", sentido: "min" },
  { clave: "resenas", nombre: "Reseñas nuevas en Google al mes (mín.)", formato: "numero", sentido: "min" },
  { clave: "calificacion", nombre: "Calificación en Google (mín.)", formato: "decimal", sentido: "min" },
  { clave: "acciones_a_tiempo", nombre: "Acciones del plan ejecutadas a tiempo (mín. %)", formato: "porcentaje", sentido: "min" },
  { clave: "acciones_sin_pauta", nombre: "Acciones de MK sin pauta planificadas al mes (mín.)", formato: "numero", sentido: "min" },
  { clave: "citas", nombre: "Citas / visitas realizadas al mes (mín.)", formato: "numero", sentido: "min" },
  { clave: "salidas_campo", nombre: "Salidas de campo de Ventas al mes (mín.)", formato: "numero", sentido: "min" },
  { clave: "llamadas", nombre: "Llamadas y seguimientos al mes (mín.)", formato: "numero", sentido: "min" },
  { clave: "leads_sin_pauta_pct", nombre: "Leads de canales sin pauta (mín. % del total)", formato: "porcentaje", sentido: "min" },
] as const;

/** Las hojas que llevan comentario del área, y quién lo escribe. */
export const HOJAS_CON_COMENTARIO = [
  { hoja: "mk", nombre: "Marketing" },
  { hoja: "ventas", nombre: "Ventas" },
  { hoja: "grupos", nombre: "Grupos en venta" },
  { hoja: "acciones", nombre: "Plan de acciones" },
  { hoja: "actividad", nombre: "Actividad de ventas" },
  { hoja: "ventas_persona", nombre: "Ventas por persona" },
  { hoja: "direccion", nombre: "Dirección" },
] as const;
