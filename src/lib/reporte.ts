/**
 * El reporte del día y el del mes: qué pasó en el CRM, dicho para que lo lea
 * cualquier área.
 *
 * ============================================================================
 * LO QUE PIDIÓ LA ESCUELA (14 de octubre de 2026)
 * ============================================================================
 *
 * «Un botón que haga el reporte del día con toda la información que aparece
 * en el CRM, el por qué se pierden —detallado, lead por lead—, todos los
 * cursos y su información, y las viñetas. Digerible para marketing. Y otro con
 * el reporte del mes, más sintetizado. Digerible, comprensible y, sobre todo,
 * medible para todas las áreas.»
 *
 * MEDIBLE quiere decir tres cosas acá, y las tres están en cada número:
 *
 *   1. Contado igual que el Dashboard: los leads por fecha de registro, los
 *      ganados y perdidos por fecha de cierre. Si el reporte y el tablero
 *      dijeran cosas distintas, ninguno de los dos serviría.
 *   2. Comparado: cada indicador trae el del período anterior —ayer, o el mes
 *      pasado— y cuánto cambió. Un número solo no dice si es bueno o malo.
 *   3. Descargable: todo lo que se ve se baja para abrir en Excel.
 *
 * Este archivo no lee la base ni dibuja nada: recibe lo que trae
 * `datos_del_reporte` y devuelve el reporte armado. Así se prueba solo.
 */

import { variacion } from "@/lib/periodos";

export type TipoReporte = "dia" | "mes";

/** Un lead tal como lo devuelve `datos_del_reporte`. */
export interface LeadDelReporte {
  id: number;
  codigo: string;
  cliente: string;
  canal: string | null;
  producto: string | null;
  productoId: number | null;
  vendedor: string | null;
  territorio: string | null;
  etapa: string | null;
  estado: string | null;
  motivo: string | null;
  /** Fecha de registro, ISO. */
  registro: string;
  /** Fecha de cierre, ISO; null si sigue abierto. */
  cierre: string | null;
  valor: number | null;
  cerrada: number | null;
  programas: number[];
  etiquetas: number[];
  /**
   * Lo que el equipo escribió sobre el lead, sólo en los perdidos: los
   * comentarios de la ficha y las notas internas del Inbox, del más viejo al
   * más nuevo.
   */
  notas?: NotaDelLead[] | null;
  /** Quién lo pasó a Perdido y cuándo, según el historial. */
  perdidoPor?: { quien: string; fecha: string } | null;
  /** Lo que mandaba la base antes de 20261120: el último comentario. */
  nota?: string | null;
}

export interface NotaDelLead {
  /** Fecha y hora, ISO. */
  fecha: string;
  quien: string;
  texto: string;
  /** «ficha»: comentario en el lead; «inbox»: nota interna del chat. */
  donde: "ficha" | "inbox";
}

export interface DatosDelReporte {
  leads: LeadDelReporte[];
  mensajes: { quien: string; mensajes: number; conversaciones: number }[];
  conversaciones: number;
  movimientos: { quien: string; etapas: number; ganados: number; perdidos: number }[];
  notas: { quien: string; notas: number }[];
}

export interface ProgramaDelCatalogo {
  id: number;
  nombre: string;
  categoria: string;
  precio: number | null;
  horario: string | null;
  activo: boolean;
}

export interface EtiquetaDelCatalogo {
  id: number;
  nombre: string;
  color: string;
}

/** Desde incluido, hasta excluido, en fechas ISO (aaaa-mm-dd). */
export interface Rango {
  desde: string;
  hasta: string;
}

export interface Periodo extends Rango {
  tipo: TipoReporte;
  /** «Martes 14 de octubre de 2026», «Octubre 2026». */
  etiqueta: string;
  /** «ayer», «septiembre». Para «comparado con …». */
  anteriorDicho: string;
}

export interface Indicador {
  clave: string;
  nombre: string;
  /** Qué cuenta, en una línea, para quien no conoce el CRM. */
  explica: string;
  valor: number;
  anterior: number | null;
  /** En porcentaje; en los porcentajes, la diferencia en puntos. */
  cambio: number | null;
  formato: "numero" | "dinero" | "porcentaje";
}

export interface FilaCanal {
  canal: string;
  nuevos: number;
  porcentaje: number;
  ganados: number;
  perdidos: number;
}

export interface FilaPrograma {
  id: number | null;
  nombre: string;
  categoria: string;
  precio: number | null;
  horario: string | null;
  activo: boolean;
  interesados: number;
  ganados: number;
  perdidos: number;
  montoGanado: number;
}

export interface FilaAsesora {
  quien: string;
  nuevos: number;
  ganados: number;
  perdidos: number;
  conversaciones: number;
  mensajes: number;
  movimientos: number;
  seguimientos: number;
}

export interface FilaEtiqueta {
  nombre: string;
  color: string;
  leads: number;
}

export interface FilaMotivo {
  motivo: string;
  /** Los perdidos de este motivo, cada uno con sus notas. */
  detalle: FilaLead[];
  leads: number;
  porcentaje: number;
  /** El programa en que más se repite, para saber dónde mirar. */
  programaPrincipal: string | null;
  sinDecir: boolean;
}

export interface FilaSemana {
  etiqueta: string;
  nuevos: number;
  ganados: number;
  perdidos: number;
}

export interface FilaLead {
  codigo: string;
  cliente: string;
  registro: string;
  cierre: string | null;
  canal: string;
  programas: string;
  asesora: string;
  etapa: string;
  estado: string;
  etiquetas: string;
  motivo: string;
  /** Las notas de un perdido, ya con fecha y autora, en orden. */
  notas: { fecha: string; quien: string; texto: string; donde: "ficha" | "inbox" }[];
  /** «Estefany Gonzalez, 14/10/2026 3:05 p. m.», o vacío. */
  perdidoPor: string;
  /** Qué le pasó en el período: entró, se ganó, se perdió. */
  queTuvo: string;
}

export interface Reporte {
  periodo: Periodo;
  indicadores: Indicador[];
  conclusiones: string[];
  canales: FilaCanal[];
  programas: FilaPrograma[];
  asesoras: FilaAsesora[];
  etiquetas: FilaEtiqueta[];
  territorios: { territorio: string; nuevos: number; porcentaje: number }[];
  motivos: FilaMotivo[];
  perdidos: FilaLead[];
  leads: FilaLead[];
  semanas: FilaSemana[];
}

// --------------------------------------------------------------- períodos

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const iso = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
const fechaUTC = (s: string) => new Date(`${s}T00:00:00Z`);
const sumarDias = (s: string, n: number) => {
  const d = fechaUTC(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};

/** «14/10/2026 3:05 p. m.», en hora de El Salvador. */
export const fechaHora = (s: string): string =>
  new Date(s).toLocaleString("es-SV", {
    timeZone: "America/El_Salvador",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/**
 * Las notas de un perdido, sin repetir: una nota del Inbox que también quedó
 * en la ficha se muestra una sola vez.
 */
function notasDe(l: LeadDelReporte): FilaLead["notas"] {
  const crudas: NotaDelLead[] =
    l.notas ?? (l.nota ? [{ fecha: l.cierre ?? l.registro, quien: "", texto: l.nota, donde: "ficha" }] : []);
  const vistas = new Set<string>();
  const out: FilaLead["notas"] = [];
  for (const x of crudas) {
    const texto = (x.texto ?? "").trim();
    const clave = texto.toLowerCase().replace(/\s+/g, " ");
    if (!texto || vistas.has(clave)) continue;
    vistas.add(clave);
    out.push({ fecha: fechaHora(x.fecha), quien: x.quien ?? "", texto, donde: x.donde === "inbox" ? "inbox" : "ficha" });
  }
  return out;
}

/** Hoy en El Salvador, que es donde trabaja el equipo. */
export const hoyEnElSalvador = (ahora: Date = new Date()): string =>
  ahora.toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });

/**
 * El período que pide la dirección: `?dia=2026-10-14` o `?mes=2026-10`. Lo
 * que no se entiende cae en el día de hoy —un reporte vacío por un parámetro
 * mal escrito no le sirve a nadie—.
 */
export function periodoPedido(
  dia: string | undefined,
  mes: string | undefined,
  hoy: string = hoyEnElSalvador(),
): { actual: Periodo; anterior: Periodo } {
  if (mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    const [a, m] = mes.split("-").map(Number);
    const desde = `${mes}-01`;
    const hasta = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
    const pa = m === 1 ? a - 1 : a;
    const pm = m === 1 ? 12 : m - 1;
    const desdeAnt = `${pa}-${String(pm).padStart(2, "0")}-01`;
    return {
      actual: { tipo: "mes", desde, hasta, etiqueta: `${mayus(MESES[m - 1])} ${a}`, anteriorDicho: MESES[pm - 1] },
      anterior: { tipo: "mes", desde: desdeAnt, hasta: desde, etiqueta: `${mayus(MESES[pm - 1])} ${pa}`, anteriorDicho: "" },
    };
  }
  const elDia = dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) && !Number.isNaN(fechaUTC(dia).getTime()) ? dia : hoy;
  const d = fechaUTC(elDia);
  const etiqueta = `${mayus(DIAS[d.getUTCDay()])} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
  const ayer = sumarDias(elDia, -1);
  const da = fechaUTC(ayer);
  return {
    actual: { tipo: "dia", desde: elDia, hasta: sumarDias(elDia, 1), etiqueta, anteriorDicho: "el día anterior" },
    anterior: {
      tipo: "dia",
      desde: ayer,
      hasta: elDia,
      etiqueta: `${mayus(DIAS[da.getUTCDay()])} ${da.getUTCDate()} de ${MESES[da.getUTCMonth()]}`,
      anteriorDicho: "",
    },
  };
}

// ------------------------------------------------------------- la cuenta

const enRango = (fecha: string | null, r: Rango) => fecha != null && fecha >= r.desde && fecha < r.hasta;

/** Los mismos cortes que el Dashboard. Ver `periodos.ts`. */
export function cortes(leads: readonly LeadDelReporte[], r: Rango) {
  const nuevos = leads.filter((l) => enRango(l.registro, r));
  const cerroEn = (l: LeadDelReporte) => enRango(l.cierre ?? l.registro, r);
  const ganados = leads.filter((l) => l.estado === "Ganado" && cerroEn(l));
  const perdidos = leads.filter((l) => l.estado === "Perdido" && cerroEn(l));
  return { nuevos, ganados, perdidos };
}

const montoDe = (l: LeadDelReporte) => l.cerrada ?? l.valor ?? 0;
const pct = (parte: number, total: number) => (total ? Math.round((parte / total) * 100) : 0);
const suma = <T>(xs: readonly T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);

function totales(d: DatosDelReporte, r: Rango) {
  const { nuevos, ganados, perdidos } = cortes(d.leads, r);
  return {
    nuevos: nuevos.length,
    ganados: ganados.length,
    perdidos: perdidos.length,
    tasa: pct(ganados.length, nuevos.length),
    monto: suma(ganados, montoDe),
    conversaciones: d.conversaciones,
    mensajes: suma(d.mensajes, (m) => m.mensajes),
    seguimientos: suma(d.notas, (n) => n.notas),
    movimientos: suma(d.movimientos, (m) => m.etapas),
  };
}

const SIN = "Sin dato";

/** «1 lead», «2 leads»: un reporte para leer no puede decir «1 leads». */
const n = (cuantos: number, uno: string, varios: string) => `${cuantos} ${cuantos === 1 ? uno : varios}`;

export function armarReporte(
  periodo: Periodo,
  datos: DatosDelReporte,
  anteriores: DatosDelReporte | null,
  anterior: Periodo | null,
  catalogo: { programas: readonly ProgramaDelCatalogo[]; etiquetas: readonly EtiquetaDelCatalogo[] },
): Reporte {
  const { nuevos, ganados, perdidos } = cortes(datos.leads, periodo);
  const t = totales(datos, periodo);
  const a = anteriores && anterior ? totales(anteriores, anterior) : null;

  const ind = (
    clave: keyof typeof t,
    nombre: string,
    explica: string,
    formato: Indicador["formato"] = "numero",
  ): Indicador => {
    const valor = t[clave];
    const ant = a ? a[clave] : null;
    return {
      clave,
      nombre,
      explica,
      valor,
      anterior: ant,
      cambio: ant == null ? null : formato === "porcentaje" ? valor - ant : variacion(valor, ant),
      formato,
    };
  };

  const indicadores: Indicador[] = [
    ind("nuevos", "Leads nuevos", "Personas que entraron al CRM en el período."),
    ind("ganados", "Inscripciones ganadas", "Leads que se cerraron como ganados en el período."),
    ind("perdidos", "Leads perdidos", "Leads que se cerraron como perdidos en el período."),
    ind("tasa", "Tasa de cierre", "Ganados del período sobre leads nuevos del período.", "porcentaje"),
    ind("monto", "Monto de lo ganado", "Lo que suman las inscripciones ganadas.", "dinero"),
    ind("conversaciones", "Conversaciones contestadas", "Chats distintos que recibieron al menos una respuesta."),
    ind("mensajes", "Mensajes enviados", "Respuestas escritas por el equipo (sin notas internas)."),
    ind("seguimientos", "Seguimientos anotados", "Comentarios escritos en las fichas."),
    ind("movimientos", "Movimientos en el Pipeline", "Veces que una tarjeta cambió de columna."),
  ];

  // ----------------------------------------------------------- canales
  const porCanal = new Map<string, FilaCanal>();
  const filaCanal = (c: string | null) => {
    const k = c || SIN;
    let f = porCanal.get(k);
    if (!f) {
      f = { canal: k, nuevos: 0, porcentaje: 0, ganados: 0, perdidos: 0 };
      porCanal.set(k, f);
    }
    return f;
  };
  for (const l of nuevos) filaCanal(l.canal).nuevos += 1;
  for (const l of ganados) filaCanal(l.canal).ganados += 1;
  for (const l of perdidos) filaCanal(l.canal).perdidos += 1;
  const canales = [...porCanal.values()]
    .map((f) => ({ ...f, porcentaje: pct(f.nuevos, nuevos.length) }))
    .sort((x, y) => y.nuevos - x.nuevos || y.ganados - x.ganados);

  // ---------------------------------------------------------- programas
  const nombrePrograma = new Map(catalogo.programas.map((p) => [p.id, p.nombre]));
  const programas: FilaPrograma[] = catalogo.programas.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    categoria: p.categoria,
    precio: p.precio,
    horario: p.horario,
    activo: p.activo,
    interesados: nuevos.filter((l) => l.productoId === p.id || l.programas.includes(p.id)).length,
    ganados: ganados.filter((l) => l.productoId === p.id).length,
    perdidos: perdidos.filter((l) => l.productoId === p.id).length,
    montoGanado: suma(ganados.filter((l) => l.productoId === p.id), montoDe),
  }));
  const sinPrograma = {
    interesados: nuevos.filter((l) => l.productoId == null && l.programas.length === 0).length,
    ganados: ganados.filter((l) => l.productoId == null).length,
    perdidos: perdidos.filter((l) => l.productoId == null).length,
  };
  if (sinPrograma.interesados + sinPrograma.ganados + sinPrograma.perdidos > 0) {
    programas.push({
      id: null,
      nombre: "Sin programa elegido",
      categoria: "—",
      precio: null,
      horario: null,
      activo: true,
      ...sinPrograma,
      montoGanado: 0,
    });
  }
  /*
   * Todos los cursos, como se pidió, aunque no hayan tenido movimiento: un
   * curso que no aparece no se puede leer como «nadie preguntó». Los dados de
   * baja, sólo si tuvieron algo en el período.
   */
  const programasVisibles = programas
    .filter((p) => p.activo || p.interesados + p.ganados + p.perdidos > 0)
    .sort((x, y) => y.interesados - x.interesados || y.ganados - x.ganados || x.nombre.localeCompare(y.nombre));

  // ----------------------------------------------------------- asesoras
  const porQuien = new Map<string, FilaAsesora>();
  const filaQuien = (q: string | null) => {
    const k = q || "Sin asignar";
    let f = porQuien.get(k);
    if (!f) {
      f = { quien: k, nuevos: 0, ganados: 0, perdidos: 0, conversaciones: 0, mensajes: 0, movimientos: 0, seguimientos: 0 };
      porQuien.set(k, f);
    }
    return f;
  };
  for (const l of nuevos) filaQuien(l.vendedor).nuevos += 1;
  for (const l of ganados) filaQuien(l.vendedor).ganados += 1;
  for (const l of perdidos) filaQuien(l.vendedor).perdidos += 1;
  for (const m of datos.mensajes) {
    const f = filaQuien(m.quien);
    f.mensajes += m.mensajes;
    f.conversaciones += m.conversaciones;
  }
  for (const m of datos.movimientos) filaQuien(m.quien).movimientos += m.etapas;
  for (const n of datos.notas) filaQuien(n.quien).seguimientos += n.notas;
  const asesoras = [...porQuien.values()].sort(
    (x, y) => y.ganados - x.ganados || y.nuevos - x.nuevos || y.mensajes - x.mensajes,
  );

  // ---------------------------------------------------------- etiquetas
  const delPeriodo = [...new Map([...nuevos, ...ganados, ...perdidos].map((l) => [l.id, l])).values()];
  const etiquetas = catalogo.etiquetas
    .map((e) => ({ nombre: e.nombre, color: e.color, leads: delPeriodo.filter((l) => l.etiquetas.includes(e.id)).length }))
    .filter((e) => e.leads > 0)
    .sort((x, y) => y.leads - x.leads);
  const nombreEtiqueta = new Map(catalogo.etiquetas.map((e) => [e.id, e.nombre]));

  // -------------------------------------------------------- territorios
  const porTerritorio = new Map<string, number>();
  for (const l of nuevos) porTerritorio.set(l.territorio || SIN, (porTerritorio.get(l.territorio || SIN) ?? 0) + 1);
  const territorios = [...porTerritorio.entries()]
    .map(([territorio, n]) => ({ territorio, nuevos: n, porcentaje: pct(n, nuevos.length) }))
    .sort((x, y) => y.nuevos - x.nuevos);

  // ------------------------------------------------- por qué se pierden
  const porMotivo = new Map<string, LeadDelReporte[]>();
  for (const l of perdidos) {
    const k = l.motivo ?? "";
    porMotivo.set(k, [...(porMotivo.get(k) ?? []), l]);
  }
  const motivos: FilaMotivo[] = [...porMotivo.entries()]
    .map(([motivo, ls]) => {
      const cuenta = new Map<string, number>();
      for (const l of ls) if (l.producto) cuenta.set(l.producto, (cuenta.get(l.producto) ?? 0) + 1);
      const principal = [...cuenta.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
      return {
        motivo: motivo || "Sin motivo anotado",
        leads: ls.length,
        porcentaje: pct(ls.length, perdidos.length),
        programaPrincipal: principal,
        sinDecir: motivo === "",
        detalle: [] as FilaLead[],
      };
    })
    .sort((x, y) => (x.sinDecir !== y.sinDecir ? (x.sinDecir ? 1 : -1) : y.leads - x.leads));

  const fila = (l: LeadDelReporte): FilaLead => {
    const nombres = [l.productoId, ...l.programas]
      .filter((id, i, xs): id is number => id != null && xs.indexOf(id) === i)
      .map((id) => nombrePrograma.get(id) ?? "")
      .filter(Boolean);
    const que = [
      enRango(l.registro, periodo) ? "Entró" : null,
      l.estado === "Ganado" && enRango(l.cierre ?? l.registro, periodo) ? "Se ganó" : null,
      l.estado === "Perdido" && enRango(l.cierre ?? l.registro, periodo) ? "Se perdió" : null,
    ].filter(Boolean);
    return {
      codigo: l.codigo,
      cliente: l.cliente,
      registro: l.registro,
      cierre: l.cierre,
      canal: l.canal || SIN,
      programas: nombres.join(", ") || (l.producto ?? "—"),
      asesora: l.vendedor || "Sin asignar",
      etapa: l.etapa || "—",
      estado: l.estado || "—",
      etiquetas: l.etiquetas.map((id) => nombreEtiqueta.get(id)).filter(Boolean).join(", "),
      motivo: l.estado === "Perdido" ? l.motivo || "Sin motivo anotado" : "",
      notas: notasDe(l),
      perdidoPor: l.perdidoPor ? `${l.perdidoPor.quien}, ${fechaHora(l.perdidoPor.fecha)}` : "",
      queTuvo: que.join(" y ") || "—",
    };
  };

  for (const m of motivos) {
    m.detalle = (porMotivo.get(m.sinDecir ? "" : m.motivo) ?? []).map(fila);
  }

  // ------------------------------------------------------------- semanas
  const semanas: FilaSemana[] = [];
  if (periodo.tipo === "mes") {
    for (let ini = periodo.desde; ini < periodo.hasta; ini = sumarDias(ini, 7)) {
      const fin = sumarDias(ini, 7) < periodo.hasta ? sumarDias(ini, 7) : periodo.hasta;
      const c = cortes(datos.leads, { desde: ini, hasta: fin });
      const di = fechaUTC(ini).getUTCDate();
      const df = fechaUTC(sumarDias(fin, -1)).getUTCDate();
      semanas.push({ etiqueta: `Del ${di} al ${df}`, nuevos: c.nuevos.length, ganados: c.ganados.length, perdidos: c.perdidos.length });
    }
  }

  // -------------------------------------------------------- conclusiones
  const conclusiones: string[] = [];
  const cuando = periodo.tipo === "dia" ? "este día" : "este mes";
  if (nuevos.length === 0) conclusiones.push(`No entró ningún lead nuevo ${cuando}.`);
  else {
    const c = canales[0];
    conclusiones.push(`${nuevos.length === 1 ? "Entró" : "Entraron"} ${n(nuevos.length, "lead nuevo", "leads nuevos")}. El canal que más trajo fue ${c.canal}: ${c.nuevos} (${c.porcentaje} %).`);
    const p = programasVisibles.find((x) => x.interesados > 0 && x.id != null);
    if (p) conclusiones.push(`El programa por el que más preguntaron fue ${p.nombre}: ${n(p.interesados, "interesado", "interesados")}.`);
  }
  if (ganados.length > 0) {
    const tasa = t.tasa;
    const comp = a ? ` (${a.tasa} % ${periodo.anteriorDicho})` : "";
    conclusiones.push(`${ganados.length === 1 ? "Se ganó" : "Se ganaron"} ${n(ganados.length, "inscripción", "inscripciones")}; la tasa de cierre fue ${tasa} %${comp}.`);
  } else conclusiones.push(`No se ganó ninguna inscripción ${cuando}.`);
  if (perdidos.length > 0) {
    const m = motivos.find((x) => !x.sinDecir);
    const sin = motivos.find((x) => x.sinDecir);
    const conNotas = perdidos.filter((l) => notasDe(l).length > 0).length;
    if (m) conclusiones.push(`${perdidos.length === 1 ? "Se perdió" : "Se perdieron"} ${n(perdidos.length, "lead", "leads")}. El motivo principal: «${m.motivo}», ${m.leads} (${m.porcentaje} %)${m.programaPrincipal ? `, sobre todo en ${m.programaPrincipal}` : ""}.`);
    if (sin) conclusiones.push(`${sin.leads === 1 ? "1 de los perdidos no tiene" : `${sin.leads} de los perdidos no tienen`} motivo anotado: sin el motivo no se puede saber qué corregir.`);
    conclusiones.push(
      conNotas === perdidos.length
        ? `${perdidos.length === 1 ? "El perdido tiene" : "Todos los perdidos tienen"} notas de la asesora: están abajo, en «Por qué se pierden».`
        : `${conNotas} de ${n(perdidos.length, "perdido tiene", "perdidos tienen")} notas de la asesora (están abajo, en «Por qué se pierden»); ${perdidos.length - conNotas === 1 ? "1 no tiene" : `${perdidos.length - conNotas} no tienen`} ninguna.`,
    );
  }
  if (t.conversaciones > 0) conclusiones.push(`El equipo contestó ${n(t.conversaciones, "conversación", "conversaciones")} con ${n(t.mensajes, "mensaje", "mensajes")}.`);

  return {
    periodo,
    indicadores,
    conclusiones,
    canales,
    programas: programasVisibles,
    asesoras,
    etiquetas,
    territorios,
    motivos,
    perdidos: perdidos.map(fila),
    leads: periodo.tipo === "dia" ? delPeriodo.map(fila) : [],
    semanas,
  };
}

// ------------------------------------------------------------- para Excel

/**
 * El reporte en CSV para Excel en castellano: separado por punto y coma, con
 * BOM para que los acentos se vean, y una sección debajo de la otra.
 */
export function reporteACsv(r: Reporte): string {
  const celda = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const linea = (xs: unknown[]) => xs.map(celda).join(";");
  const out: string[] = [];
  const seccion = (titulo: string, encabezado: string[], filas: unknown[][]) => {
    out.push("", linea([titulo]), linea(encabezado), ...filas.map(linea));
  };

  out.push(linea([`Reporte ${r.periodo.tipo === "dia" ? "del día" : "del mes"}`, r.periodo.etiqueta]));
  seccion("Resumen", ["Indicador", "Valor", "Período anterior", "Cambio"], r.indicadores.map((i) => [
    i.nombre, i.valor, i.anterior ?? "", i.cambio == null ? "" : i.formato === "porcentaje" ? `${i.cambio} pts` : `${Math.round(i.cambio)} %`,
  ]));
  seccion("Conclusiones", ["Conclusión"], r.conclusiones.map((c) => [c]));
  seccion("Canales", ["Canal", "Leads nuevos", "% de los nuevos", "Ganados", "Perdidos"], r.canales.map((c) => [c.canal, c.nuevos, c.porcentaje, c.ganados, c.perdidos]));
  seccion("Programas", ["Programa", "Categoría", "Precio", "Horario", "Interesados", "Ganados", "Perdidos", "Monto ganado"], r.programas.map((p) => [p.nombre, p.categoria, p.precio ?? "", p.horario ?? "", p.interesados, p.ganados, p.perdidos, p.montoGanado]));
  seccion("Asesoras", ["Asesora", "Leads nuevos", "Ganados", "Perdidos", "Conversaciones contestadas", "Mensajes", "Movimientos", "Seguimientos"], r.asesoras.map((a) => [a.quien, a.nuevos, a.ganados, a.perdidos, a.conversaciones, a.mensajes, a.movimientos, a.seguimientos]));
  seccion("Etiquetas", ["Etiqueta", "Leads"], r.etiquetas.map((e) => [e.nombre, e.leads]));
  seccion("Territorios", ["Territorio", "Leads nuevos", "%"], r.territorios.map((t) => [t.territorio, t.nuevos, t.porcentaje]));
  seccion("Por qué se pierden", ["Motivo", "Leads", "%", "Programa donde más se repite"], r.motivos.map((m) => [m.motivo, m.leads, m.porcentaje, m.programaPrincipal ?? ""]));
  if (r.semanas.length) seccion("Por semana", ["Semana", "Leads nuevos", "Ganados", "Perdidos"], r.semanas.map((s) => [s.etiqueta, s.nuevos, s.ganados, s.perdidos]));
  const encLead = ["Código", "Cliente", "Qué pasó", "Registro", "Cierre", "Canal", "Programas", "Asesora", "Etapa", "Estado", "Etiquetas"];
  const filaLead = (l: FilaLead) => [l.codigo, l.cliente, l.queTuvo, l.registro, l.cierre ?? "", l.canal, l.programas, l.asesora, l.etapa, l.estado, l.etiquetas];
  const notasEnTexto = (l: FilaLead) =>
    l.notas.map((x) => `${x.fecha}${x.quien ? ` ${x.quien}` : ""}${x.donde === "inbox" ? " (Inbox)" : ""}: ${x.texto}`).join(" | ");
  seccion(
    "Leads perdidos, uno por uno",
    [...encLead, "Motivo de pérdida", "Pasado a Perdido por", "Notas de la asesora"],
    r.perdidos.map((l) => [...filaLead(l), l.motivo, l.perdidoPor, notasEnTexto(l)]),
  );
  if (r.leads.length) seccion("Todos los leads del día", encLead, r.leads.map(filaLead));
  return "﻿" + out.join("\r\n");
}
