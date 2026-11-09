/**
 * Los cálculos del Tablero Comercial: lo mismo que hacen las fórmulas de la
 * plantilla de la Dirección, escrito una vez y probado.
 *
 * Nada de acá toca la base ni la pantalla: recibe los datos ya leídos y
 * devuelve números. Así se puede probar fila por fila contra el Excel
 * (`supabase/pruebas/tablero.test.mjs`) y la pantalla y el sitio de la
 * Dirección calculan exactamente lo mismo.
 *
 * ============================================================================
 * VACÍO NO ES CERO
 * ============================================================================
 *
 * Como en la plantilla, un dato vacío quiere decir «todavía no se cargó» y se
 * devuelve `null`; un cero es un cero. La diferencia importa en todo: un KPI
 * sin datos no cuenta en el índice de cumplimiento, y uno en cero cuenta como
 * «No cumple».
 *
 * ============================================================================
 * LAS SEMANAS CARGADAS
 * ============================================================================
 *
 * A mitad de mes, las metas de volumen (venta, leads, seguidores…) se comparan
 * contra la parte proporcional a las semanas ya cargadas. Es la regla de la
 * plantilla, con una diferencia que trae el CRM:
 *
 *   Marketing   una semana está cargada cuando el Director escribió algo de
 *               ella. Como en el Excel.
 *
 *   Ventas      una semana está cargada cuando ya terminó, aunque la Gerente
 *               no haya escrito nada: los contactados, los inscritos y las
 *               citas los pone el CRM solo. Antes de terminar, cuenta si la
 *               Gerente ya cargó algo.
 */

import {
  CAMPOS_ACTIVIDAD,
  CAMPOS_MK,
  CAMPOS_VENTAS,
  CANALES_TABLERO,
  type Campo,
  type ClaveCanal,
} from "@/lib/tablero/campos";
import { mesDeLaSemana, semanaTerminada, semanasDelMes } from "@/lib/tablero/semanas";

export type Valores = Readonly<Record<string, number | null | undefined>>;

/** Una semana del Tablero: lo que escribieron las áreas y lo que dice el CRM. */
export interface SemanaDeDatos {
  lunes: string;
  manual: Valores;
  crm: Valores;
}

export interface Accion {
  tipo: string;
  accion: string;
  responsable: "MK" | "Ventas";
  fecha: string | null;
  estado: string;
  costo: number | null;
  leadsEsperados: number | null;
  leadsObtenidos: number | null;
  inscritos: number | null;
  venta: number | null;
}

/** La actividad de una persona en una semana. */
export interface FilaActividad {
  lunes: string;
  vendedorId: number;
  manual: Valores;
  crm: Valores;
}

const POR_CLAVE = new Map<string, Campo>(
  [...CAMPOS_MK, ...CAMPOS_VENTAS, ...CAMPOS_ACTIVIDAD].map((c) => [c.clave, c]),
);

const esNumero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * El valor de un campo: el que escribió el área o, si no escribió y el campo
 * sale del CRM, el del CRM. Los de «referencia» no toman el del CRM: ver
 * `campos.ts`.
 */
export function valorDe(datos: { manual: Valores; crm: Valores }, clave: string): number | null {
  const escrito = datos.manual[clave];
  if (esNumero(escrito)) return escrito;
  const campo = POR_CLAVE.get(clave);
  if (campo?.origen === "crm") {
    const delCrm = datos.crm[clave];
    if (esNumero(delCrm)) return delCrm;
  }
  return null;
}

/** ¿Lo escribió el área encima de lo que decía el CRM? Para marcarlo en pantalla. */
export const corregido = (datos: { manual: Valores; crm: Valores }, clave: string): boolean =>
  POR_CLAVE.get(clave)?.origen === "crm" && esNumero(datos.manual[clave]) && esNumero(datos.crm[clave]);

/** Suma de lo que hay; null si no hay nada. */
const sumar = (valores: readonly (number | null)[]): number | null => {
  const hay = valores.filter(esNumero);
  return hay.length ? hay.reduce((s, v) => s + v, 0) : null;
};

/** a ÷ b, o null si falta algo o b es cero. */
const dividir = (a: number | null, b: number | null): number | null =>
  a == null || b == null || b === 0 ? null : a / b;

const conCero = (v: number | null): number => v ?? 0;

/** ¿El Director de MK cargó algo de esa semana? */
export const semanaCargadaMk = (s: SemanaDeDatos): boolean =>
  CAMPOS_MK.some((c) => esNumero(s.manual[c.clave]));

/** ¿Cuenta como cargada para Ventas? Ver arriba. */
export const semanaCargadaVentas = (s: SemanaDeDatos, hoy: string): boolean =>
  semanaTerminada(s.lunes, hoy) || CAMPOS_VENTAS.some((c) => esNumero(s.manual[c.clave]));

// ------------------------------------------------------------- resumen del mes

export interface ResumenMes {
  mes: string;
  semanas: number;
  semanasMk: number;
  avanceMk: number | null;
  semanasVentas: number;
  avanceVentas: number | null;

  inversion: number | null;
  alcance: number | null;
  seguidores: number | null;
  publicaciones: number | null;
  visitasColegios: number | null;
  clasesMuestra: number | null;
  leads: number | null;
  leadsPorCanal: Record<ClaveCanal, number | null>;
  resenas: number | null;
  calificacion: number | null;

  contactados24h: number | null;
  contactados: number | null;
  citas: number | null;
  inscritos: number | null;
  inscritosPorCanal: Record<ClaveCanal, number | null>;
  cursosCortos: number | null;
  cotizacionesCorp: number | null;
  contratosCorp: number | null;
  cobradoNuevos: number | null;
  cursosCortosMonto: number | null;
  corporativoMonto: number | null;
  ventaNueva: number | null;
  descuentos: number | null;

  acciones: {
    mkDebian: number;
    mkHechas: number;
    mkSinPauta: number;
    ventasDebian: number;
    ventasHechas: number;
    leads: number | null;
    leadsEsperados: number | null;
    inscritos: number | null;
    costo: number | null;
    venta: number | null;
  };

  actividad: {
    filas: number;
    llamadas: number | null;
    mensajes: number | null;
    recontactos: number | null;
    citasAgendadas: number | null;
    citasRealizadas: number | null;
    salidasCampo: number | null;
    eventos: number | null;
    ventasCerradas: number | null;
  };
}

/**
 * Lo que la hoja «Resumen mensual» calcula para una empresa y un mes.
 *
 * `semanas` puede traer semanas de cualquier mes: se toman sólo las que suman
 * a éste. Las que falten (nadie cargó nada y el CRM no tiene nada) cuentan
 * como no cargadas.
 */
export function resumenDelMes(
  mes: string,
  semanas: readonly SemanaDeDatos[],
  acciones: readonly Accion[],
  actividad: readonly FilaActividad[],
  hoy: string,
): ResumenMes {
  const lunesDelMes = semanasDelMes(mes);
  const delMes = semanas.filter((s) => mesDeLaSemana(s.lunes) === mes);
  const cargadasMk = delMes.filter(semanaCargadaMk);
  // Una semana que ya terminó cuenta para Ventas aunque no tenga fila: el CRM
  // la cubre. Por eso se cuentan los lunes del mes y no las filas.
  const cargadasVentas = lunesDelMes.filter((lunes) => {
    const s = delMes.find((x) => x.lunes === lunes) ?? { lunes, manual: {}, crm: {} };
    return semanaCargadaVentas(s, hoy);
  });

  const hayMk = cargadasMk.length > 0;
  const hayVentas = cargadasVentas.length > 0;
  const total = (clave: string, sobre: readonly SemanaDeDatos[] = delMes) =>
    sumar(sobre.map((s) => valorDe(s, clave)));
  const deMk = (clave: string) => (hayMk ? conCero(total(clave)) : null);
  const deVentas = (clave: string) => (hayVentas ? conCero(total(clave)) : null);

  const leadsPorCanal = Object.fromEntries(
    CANALES_TABLERO.map((c) => [c.clave, total(`mk.leads_${c.clave}`)]),
  ) as Record<ClaveCanal, number | null>;
  const inscritosPorCanal = Object.fromEntries(
    CANALES_TABLERO.map((c) => [c.clave, hayVentas ? conCero(total(`ventas.inscritos_${c.clave}`)) : null]),
  ) as Record<ClaveCanal, number | null>;

  const inversion = hayMk
    ? conCero(sumar(["mk.pauta_meta", "mk.pauta_tiktok", "mk.pauta_google", "mk.pauta_otros"].map((c) => total(c))))
    : null;
  const leads = sumar(Object.values(leadsPorCanal));
  const calificaciones = cargadasMk.map((s) => valorDe(s, "mk.calificacion")).filter(esNumero);

  const cobradoNuevos = deVentas("ventas.cobrado_nuevos");
  const cursosCortosMonto = deVentas("ventas.cursos_cortos_monto");
  const corporativoMonto = deVentas("ventas.corporativo_monto");

  // ---------------------------------------------------------- plan de acciones
  const accionesDelMes = acciones.filter((a) => a.fecha && a.fecha.slice(0, 7) === mes.slice(0, 7));
  const debian = (r: Accion["responsable"]) =>
    accionesDelMes.filter((a) => a.responsable === r && a.estado !== "Cancelada" && a.fecha! <= hoy).length;
  const hechas = (r: Accion["responsable"]) =>
    accionesDelMes.filter((a) => a.responsable === r && a.estado === "Hecha").length;
  const hechasDelMes = accionesDelMes.filter((a) => a.estado === "Hecha");

  // ------------------------------------------------------------- la actividad
  const actividadDelMes = actividad.filter((f) => mesDeLaSemana(f.lunes) === mes);
  const filas = actividadDelMes.length;
  const deActividad = (clave: string) =>
    filas ? conCero(sumar(actividadDelMes.map((f) => valorDe(f, clave)))) : null;

  return {
    mes,
    semanas: lunesDelMes.length,
    semanasMk: cargadasMk.length,
    avanceMk: hayMk ? cargadasMk.length / lunesDelMes.length : null,
    semanasVentas: cargadasVentas.length,
    avanceVentas: hayVentas ? cargadasVentas.length / lunesDelMes.length : null,

    inversion,
    alcance: deMk("mk.alcance"),
    seguidores: deMk("mk.seguidores"),
    publicaciones: deMk("mk.publicaciones"),
    visitasColegios: deMk("mk.visitas_colegios"),
    clasesMuestra: deMk("mk.clases_muestra"),
    leads,
    leadsPorCanal,
    resenas: deMk("mk.resenas"),
    calificacion: calificaciones.length
      ? calificaciones.reduce((s, v) => s + v, 0) / calificaciones.length
      : null,

    contactados24h: deVentas("ventas.contactados_24h"),
    contactados: deVentas("ventas.contactados"),
    citas: deVentas("ventas.citas"),
    inscritos: hayVentas ? conCero(sumar(Object.values(inscritosPorCanal))) : null,
    inscritosPorCanal,
    cursosCortos: deVentas("ventas.cursos_cortos"),
    cotizacionesCorp: deVentas("ventas.cotizaciones_corp"),
    contratosCorp: deVentas("ventas.contratos_corp"),
    cobradoNuevos,
    cursosCortosMonto,
    corporativoMonto,
    ventaNueva: hayVentas ? conCero(cobradoNuevos) + conCero(cursosCortosMonto) + conCero(corporativoMonto) : null,
    descuentos: deVentas("ventas.descuentos"),

    acciones: {
      mkDebian: debian("MK"),
      mkHechas: hechas("MK"),
      mkSinPauta: accionesDelMes.filter(
        (a) => a.responsable === "MK" && a.estado !== "Cancelada" && a.tipo !== "Campaña de pauta",
      ).length,
      ventasDebian: debian("Ventas"),
      ventasHechas: hechas("Ventas"),
      leads: sumar(hechasDelMes.map((a) => a.leadsObtenidos)),
      leadsEsperados: sumar(hechasDelMes.map((a) => a.leadsEsperados)),
      inscritos: sumar(hechasDelMes.map((a) => a.inscritos)),
      costo: sumar(hechasDelMes.map((a) => a.costo)),
      venta: sumar(hechasDelMes.map((a) => a.venta)),
    },

    actividad: {
      filas,
      llamadas: deActividad("llamadas"),
      mensajes: deActividad("mensajes"),
      recontactos: deActividad("recontactos"),
      citasAgendadas: deActividad("citas_agendadas"),
      citasRealizadas: deActividad("citas_realizadas"),
      salidasCampo: deActividad("salidas_campo"),
      eventos: deActividad("eventos"),
      ventasCerradas: deActividad("ventas_cerradas"),
    },
  };
}

// ------------------------------------------------------------------- los KPIs

export type Responsable = "ventas" | "mk" | "compartido";
export type Sentido = "min" | "max";
export type Estado = "Cumple" | "Cerca" | "No cumple" | "Sin meta";

/** De dónde sale la meta de un KPI, y si se prorratea por semanas cargadas. */
interface FuenteDeMeta {
  /** Meta del mes (tabla 1) o fija (tabla 2). */
  tabla: "mes" | "fija";
  clave: string;
  /** Por el avance de quién se prorratea. Sin esto, la meta va entera. */
  prorrateo?: "mk" | "ventas";
  /** Decimales al redondear la meta prorrateada, como en la plantilla. */
  redondeo?: number;
}

export interface Kpi {
  clave: string;
  responsable: Responsable;
  nombre: string;
  sentido: Sentido;
  formato: "numero" | "dinero" | "decimal" | "porcentaje";
  comoSeMide: string;
  real: (r: ResumenMes) => number | null;
  meta: FuenteDeMeta;
}

/** Los 23 KPIs de cada empresa, en el orden de la «Radiografía del mes». */
export const KPIS: readonly Kpi[] = [
  {
    clave: "venta_nueva", responsable: "ventas", nombre: "Venta nueva $", sentido: "min", formato: "dinero",
    comoSeMide: "Nuevos + cursos cortos + corporativo vs meta del mes",
    real: (r) => r.ventaNueva,
    meta: { tabla: "mes", clave: "venta_nueva", prorrateo: "ventas", redondeo: 0 },
  },
  {
    clave: "cursos_cortos", responsable: "ventas", nombre: "Cursos cortos vendidos", sentido: "min", formato: "numero",
    comoSeMide: "Inscripciones pagadas a cursos cortos",
    real: (r) => r.cursosCortos,
    meta: { tabla: "fija", clave: "cursos_cortos", prorrateo: "ventas", redondeo: 1 },
  },
  {
    clave: "contratos_corp", responsable: "ventas", nombre: "Contratos corporativos", sentido: "min", formato: "numero",
    comoSeMide: "Contratos corporativos cerrados",
    real: (r) => r.contratosCorp,
    meta: { tabla: "fija", clave: "contratos_corp", prorrateo: "ventas", redondeo: 1 },
  },
  {
    clave: "acciones_ventas", responsable: "ventas", nombre: "Acciones de Ventas hechas a tiempo (% del plan)", sentido: "min", formato: "porcentaje",
    comoSeMide: "Hechas ÷ planificadas con fecha ya cumplida (Plan de acciones)",
    real: (r) => dividir(r.acciones.ventasHechas, r.acciones.ventasDebian),
    meta: { tabla: "fija", clave: "acciones_a_tiempo" },
  },
  {
    clave: "citas", responsable: "ventas", nombre: "Citas / visitas realizadas", sentido: "min", formato: "numero",
    comoSeMide: "Suma de la Actividad de ventas",
    real: (r) => r.actividad.citasRealizadas,
    meta: { tabla: "fija", clave: "citas", prorrateo: "ventas", redondeo: 1 },
  },
  {
    clave: "salidas_campo", responsable: "ventas", nombre: "Salidas de campo", sentido: "min", formato: "numero",
    comoSeMide: "Empresas, colegios, calle (Actividad de ventas)",
    real: (r) => r.actividad.salidasCampo,
    meta: { tabla: "fija", clave: "salidas_campo", prorrateo: "ventas", redondeo: 1 },
  },
  {
    clave: "llamadas", responsable: "ventas", nombre: "Llamadas y seguimientos", sentido: "min", formato: "numero",
    comoSeMide: "Llamadas + mensajes + recontactos",
    real: (r) =>
      r.actividad.filas
        ? conCero(r.actividad.llamadas) + conCero(r.actividad.mensajes) + conCero(r.actividad.recontactos)
        : null,
    meta: { tabla: "fija", clave: "llamadas", prorrateo: "ventas", redondeo: 1 },
  },
  {
    clave: "contactados_24h", responsable: "ventas", nombre: "Leads contactados en < 24 h", sentido: "min", formato: "porcentaje",
    comoSeMide: "Contactados <24 h ÷ leads que entregó MK",
    real: (r) => dividir(r.contactados24h, r.leads),
    meta: { tabla: "fija", clave: "contactados_24h" },
  },
  {
    clave: "descuentos", responsable: "ventas", nombre: "Descuentos (% de lo vendido)", sentido: "max", formato: "porcentaje",
    comoSeMide: "Descuentos ÷ (venta nueva + descuentos)",
    real: (r) => (r.descuentos == null ? null : dividir(r.descuentos, conCero(r.ventaNueva) + r.descuentos)),
    meta: { tabla: "fija", clave: "descuentos_pct" },
  },
  {
    clave: "acciones_mk", responsable: "mk", nombre: "Acciones de MK hechas a tiempo (% del plan)", sentido: "min", formato: "porcentaje",
    comoSeMide: "Hechas ÷ planificadas con fecha ya cumplida (Plan de acciones)",
    real: (r) => dividir(r.acciones.mkHechas, r.acciones.mkDebian),
    meta: { tabla: "fija", clave: "acciones_a_tiempo" },
  },
  {
    clave: "acciones_sin_pauta", responsable: "mk", nombre: "Acciones de MK sin pauta planificadas", sentido: "min", formato: "numero",
    comoSeMide: "Colegios, ferias, eventos, alianzas, calle… (Plan de acciones)",
    real: (r) => (r.acciones.mkSinPauta === 0 && r.semanasMk === 0 ? null : r.acciones.mkSinPauta),
    meta: { tabla: "fija", clave: "acciones_sin_pauta" },
  },
  {
    clave: "leads", responsable: "mk", nombre: "Leads generados", sentido: "min", formato: "numero",
    comoSeMide: "Suma de leads por canal",
    real: (r) => r.leads,
    meta: { tabla: "mes", clave: "leads", prorrateo: "mk", redondeo: 1 },
  },
  {
    clave: "leads_sin_pauta", responsable: "mk", nombre: "Leads de canales sin pauta (% del total)", sentido: "min", formato: "porcentaje",
    comoSeMide: "Leads de colegios, alianzas, eventos, referidos, orgánico y base ÷ total",
    real: (r) =>
      r.leads
        ? (r.leads - conCero(r.leadsPorCanal.meta) - conCero(r.leadsPorCanal.tiktok) - conCero(r.leadsPorCanal.google)) / r.leads
        : null,
    meta: { tabla: "fija", clave: "leads_sin_pauta_pct" },
  },
  {
    clave: "costo_por_lead", responsable: "mk", nombre: "Costo por lead $", sentido: "max", formato: "dinero",
    comoSeMide: "Inversión en pauta ÷ leads",
    real: (r) => dividir(r.inversion, r.leads),
    meta: { tabla: "fija", clave: "costo_por_lead" },
  },
  {
    clave: "inversion", responsable: "mk", nombre: "Inversión en pauta vs presupuesto $", sentido: "max", formato: "dinero",
    comoSeMide: "Suma de pauta de todos los canales",
    real: (r) => r.inversion,
    meta: { tabla: "mes", clave: "presupuesto_pauta", prorrateo: "mk", redondeo: 0 },
  },
  {
    clave: "seguidores", responsable: "mk", nombre: "Seguidores nuevos", sentido: "min", formato: "numero",
    comoSeMide: "Todas las redes",
    real: (r) => r.seguidores,
    meta: { tabla: "fija", clave: "seguidores", prorrateo: "mk", redondeo: 1 },
  },
  {
    clave: "publicaciones", responsable: "mk", nombre: "Publicaciones", sentido: "min", formato: "numero",
    comoSeMide: "Publicaciones hechas",
    real: (r) => r.publicaciones,
    meta: { tabla: "fija", clave: "publicaciones", prorrateo: "mk", redondeo: 1 },
  },
  {
    clave: "resenas", responsable: "mk", nombre: "Reseñas nuevas en Google", sentido: "min", formato: "numero",
    comoSeMide: "Reseñas nuevas",
    real: (r) => r.resenas,
    meta: { tabla: "fija", clave: "resenas", prorrateo: "mk", redondeo: 1 },
  },
  {
    clave: "calificacion", responsable: "mk", nombre: "Calificación en Google", sentido: "min", formato: "decimal",
    comoSeMide: "Promedio de la calificación semanal",
    real: (r) => r.calificacion,
    meta: { tabla: "fija", clave: "calificacion" },
  },
  {
    clave: "conversion", responsable: "compartido", nombre: "Conversión lead → inscrito", sentido: "min", formato: "porcentaje",
    comoSeMide: "Inscritos (Ventas) ÷ leads (MK)",
    real: (r) => dividir(r.inscritos, r.leads),
    meta: { tabla: "fija", clave: "conversion" },
  },
  {
    clave: "costo_por_inscrito", responsable: "compartido", nombre: "Costo de pauta por inscrito $", sentido: "max", formato: "dinero",
    comoSeMide: "Inversión (MK) ÷ inscritos (Ventas)",
    real: (r) => dividir(r.inversion, r.inscritos),
    meta: { tabla: "fija", clave: "costo_por_inscrito" },
  },
  {
    clave: "retorno_pauta", responsable: "compartido", nombre: "Retorno de la pauta", sentido: "min", formato: "decimal",
    comoSeMide: "Venta nueva (Ventas) ÷ inversión (MK)",
    real: (r) => dividir(r.ventaNueva, r.inversion),
    meta: { tabla: "fija", clave: "retorno_pauta" },
  },
  {
    // La plantilla le pone la misma meta que al retorno de la pauta.
    clave: "retorno_acciones", responsable: "compartido", nombre: "Retorno de las acciones del plan", sentido: "min", formato: "decimal",
    comoSeMide: "Venta generada ÷ costo de las acciones hechas",
    real: (r) => dividir(r.acciones.venta, r.acciones.costo),
    meta: { tabla: "fija", clave: "retorno_pauta" },
  },
];

/** Las metas guardadas: las del mes por mes y clave, y las fijas por clave. */
export interface Metas {
  delMes: Readonly<Record<string, Readonly<Record<string, number | null>>>>;
  fijas: Readonly<Record<string, number | null>>;
}

const redondear = (v: number, decimales: number) => {
  const f = 10 ** decimales;
  return Math.round(v * f) / f;
};

/** La meta de un KPI para ese mes, ya prorrateada por las semanas cargadas. */
export function metaDe(kpi: Kpi, r: ResumenMes, metas: Metas): number | null {
  const base =
    kpi.meta.tabla === "mes" ? metas.delMes[r.mes]?.[kpi.meta.clave] : metas.fijas[kpi.meta.clave];
  if (!esNumero(base)) return null;
  if (!kpi.meta.prorrateo) return base;
  const avance = kpi.meta.prorrateo === "mk" ? r.avanceMk : r.avanceVentas;
  return redondear(base * (avance ?? 1), kpi.meta.redondeo ?? 0);
}

/** El semáforo. Cerca = a menos de 10% de la meta. */
export function estadoDe(real: number | null, meta: number | null, sentido: Sentido): Estado | null {
  if (real == null) return null;
  if (meta == null) return "Sin meta";
  if (sentido === "min") {
    if (real >= meta) return "Cumple";
    if (meta > 0 && real >= 0.9 * meta) return "Cerca";
    return "No cumple";
  }
  if (real <= meta) return "Cumple";
  if (real <= 1.1 * meta) return "Cerca";
  return "No cumple";
}

/** El % de cumplimiento, con tope de 150% como en la plantilla. */
export function cumplimientoDe(real: number | null, meta: number | null, sentido: Sentido): number | null {
  if (real == null || meta == null) return null;
  if (sentido === "min") return meta <= 0 ? (real >= meta ? 1 : 0) : Math.min(1.5, real / meta);
  return real <= 0 ? 1 : Math.min(1.5, meta / real);
}

export interface KpiDelMes {
  kpi: Kpi;
  real: number | null;
  meta: number | null;
  estado: Estado | null;
  cumplimiento: number | null;
  /** El real del mes anterior, y si mejoró (según el sentido: en un máx., bajar es mejorar). */
  anterior: number | null;
  mejoro: boolean | null;
}

/** La «Radiografía del mes» de una empresa. */
export function kpisDelMes(r: ResumenMes, metas: Metas, anterior?: ResumenMes | null): KpiDelMes[] {
  return KPIS.map((kpi) => {
    const real = kpi.real(r);
    const meta = metaDe(kpi, r, metas);
    const antes = anterior ? kpi.real(anterior) : null;
    return {
      kpi,
      real,
      meta,
      estado: estadoDe(real, meta, kpi.sentido),
      cumplimiento: cumplimientoDe(real, meta, kpi.sentido),
      anterior: antes,
      mejoro:
        real == null || antes == null || real === antes
          ? null
          : kpi.sentido === "min" ? real > antes : real < antes,
    };
  });
}

/**
 * El índice de cumplimiento: de los KPIs con meta y con datos, qué parte llegó
 * a la meta. «Sin meta» y sin datos no cuentan. Null si no hay ninguno.
 */
export function indiceDe(kpis: readonly KpiDelMes[], responsable?: Responsable): number | null {
  const contados = kpis.filter(
    (k) => (!responsable || k.kpi.responsable === responsable) &&
      (k.estado === "Cumple" || k.estado === "Cerca" || k.estado === "No cumple"),
  );
  if (!contados.length) return null;
  return contados.filter((k) => k.estado === "Cumple").length / contados.length;
}

// ------------------------------------------------- ¿cuánto falta vender este mes?

export interface FaltaVender {
  meta: number | null;
  lograda: number | null;
  falta: number | null;
  cubierta: boolean;
  porcentaje: number | null;
  semanasQuedan: number;
  porSemana: number | null;
}

/** El primer bloque del Tablero. La meta va entera: es la del mes completo. */
export function faltaVender(r: ResumenMes, metas: Metas): FaltaVender {
  const meta = metas.delMes[r.mes]?.venta_nueva;
  const semanasQuedan = r.semanas - r.semanasVentas;
  if (!esNumero(meta)) {
    return { meta: null, lograda: r.ventaNueva, falta: null, cubierta: false, porcentaje: null, semanasQuedan, porSemana: null };
  }
  const lograda = conCero(r.ventaNueva);
  const cubierta = lograda >= meta;
  const falta = cubierta ? 0 : meta - lograda;
  return {
    meta,
    lograda: r.ventaNueva,
    falta,
    cubierta,
    porcentaje: r.ventaNueva == null ? null : meta === 0 ? 1 : lograda / meta,
    semanasQuedan,
    porSemana: semanasQuedan > 0 && !cubierta ? falta / semanasQuedan : null,
  };
}

/** La «Lectura» del cuadre MK ↔ Ventas. */
export function lecturaDelCuadre(r: ResumenMes): string {
  if (r.leads == null) return "Falta el registro de MK";
  if (r.contactados == null) return "Falta el registro de Ventas";
  const sinContactar = r.leads - r.contactados;
  if (sinContactar < 0) return "Revisar: Ventas reporta más contactos que leads de MK";
  if (sinContactar > 0) return `${sinContactar} leads sin contactar: se pierde la inversión de MK`;
  return "Todos los leads fueron trabajados";
}

// ------------------------------------------------------------ grupos en venta

export interface Grupo {
  programa: string;
  grupo: string;
  duracionMeses: number | null;
  inicio: string | null;
  matricula1: number | null;
  matricula2: number | null;
  mensualidad: number | null;
  graduacion: number | null;
  mensualidadPreventa: number | null;
  cupo: number | null;
  reservas: number | null;
  inscritos: number | null;
}

export interface GrupoCalculado {
  valorTotal: number;
  ocupados: number;
  faltan: number | null;
  lleno: number | null;
  diasParaInicio: number | null;
  aportaHoy: number;
  conCupoLleno: number;
  matriculasPorCobrar: number | null;
  alerta: string;
}

const diasEntre = (desde: string, hasta: string) =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);

/** Las columnas calculadas de «Grupos en venta». */
export function calcularGrupo(g: Grupo, hoy: string): GrupoCalculado {
  const ocupados = conCero(g.reservas) + conCero(g.inscritos);
  const faltan = g.cupo == null ? null : Math.max(0, g.cupo - ocupados);
  const lleno = g.cupo ? ocupados / g.cupo : null;
  const diasParaInicio = g.inicio ? diasEntre(hoy, g.inicio) : null;
  const preventa = conCero(g.mensualidadPreventa) > 0 ? conCero(g.mensualidadPreventa) : conCero(g.mensualidad);

  let alerta = "";
  if (lleno != null) {
    if (diasParaInicio != null && diasParaInicio < 0) alerta = "Ya inició";
    else if (lleno >= 1) alerta = "Lleno";
    else if (diasParaInicio != null && diasParaInicio <= 30 && lleno < 0.6) alerta = "URGENTE: menos de 60% a un mes";
    else if (diasParaInicio != null && diasParaInicio <= 60 && lleno < 0.3) alerta = "En riesgo: menos de 30% a dos meses";
    else alerta = "En venta";
  }

  return {
    valorTotal:
      conCero(g.matricula1) + conCero(g.matricula2) + conCero(g.mensualidad) * conCero(g.duracionMeses) + conCero(g.graduacion),
    ocupados,
    faltan,
    lleno,
    diasParaInicio,
    aportaHoy: conCero(g.reservas) * preventa + conCero(g.inscritos) * conCero(g.mensualidad),
    conCupoLleno: conCero(g.cupo) * preventa,
    matriculasPorCobrar: faltan == null ? null : faltan * conCero(g.matricula1),
    alerta,
  };
}

/** La «Lectura» de una acción del plan. */
export function lecturaDeAccion(a: Accion, hoy: string): string {
  if (!a.accion) return "";
  if (a.estado === "Cancelada") return "Cancelada";
  if (a.estado !== "Hecha") return a.fecha && a.fecha < hoy ? "ATRASADA: ya pasó la fecha" : "Pendiente";
  if (a.leadsObtenidos == null) return "Falta anotar resultados";
  if (!a.leadsEsperados) return "Hecha";
  return a.leadsObtenidos / a.leadsEsperados >= 1 ? "Cumplió lo esperado" : "Bajo lo esperado";
}
