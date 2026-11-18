"use server";

/**
 * Lo que la pantalla del Tablero Comercial lee y guarda.
 *
 * Todo pasa por la sesión de quien mira: las políticas de la base deciden qué
 * ve y qué puede llenar cada persona (ver la migración
 * `20261125120000_tablero_comercial.sql`). Acá no se repite esa decisión; se
 * traduce el rechazo a algo que se entienda.
 */

import { getServerClient, getUser } from "@/lib/supabase/server";
import type { ClaveMarca } from "@/lib/marcas";
import { traerTodo } from "@/lib/supabase/paginar";
import {
  CAMPOS_ACTIVIDAD,
  CAMPOS_MK,
  CAMPOS_VENTAS,
  CAMPOS_VENTAS_PERSONA,
  ESTADOS_DE_ACCION,
  HOJAS_CON_COMENTARIO,
  METAS_DEL_MES,
  METAS_FIJAS,
} from "@/lib/tablero/campos";
import { lunesDe, mesDe, sumarDias, semanasDelMes } from "@/lib/tablero/semanas";
import type { ActionResult } from "@/app/actions";

export interface FilaSemanal { lunes: string; campo: string; valor: number }
export interface FilaActividadGuardada { lunes: string; vendedorId: number; campo: string; valor: number }
export interface FilaMeta { mes: string | null; clave: string; valor: number }

export interface GrupoGuardado {
  id: number;
  programa: string;
  grupo: string;
  dias: string | null;
  horario: string | null;
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

export interface AccionGuardada {
  id: number;
  tipo: string;
  accion: string;
  responsable: "MK" | "Ventas";
  persona: string | null;
  fecha: string | null;
  estado: string;
  costo: number | null;
  leadsEsperados: number | null;
  leadsObtenidos: number | null;
  inscritos: number | null;
  venta: number | null;
}

export interface DatosTablero {
  /** Desde qué lunes y hasta qué domingo vino todo. */
  desde: string;
  hasta: string;
  semanal: FilaSemanal[];
  crmSemanal: FilaSemanal[];
  metas: FilaMeta[];
  grupos: GrupoGuardado[];
  acciones: AccionGuardada[];
  actividad: FilaActividadGuardada[];
  crmActividad: FilaActividadGuardada[];
  ventasPersona: { vendedorId: number; campo: string; valor: number }[];
  crmVentasPersona: { vendedorId: number; campo: string; valor: number }[];
  comentarios: { hoja: string; texto: string; actualizadoEn: string }[];
  vendedores: { id: number; nombre: string; activo: boolean }[];
  /** Las tablas todavía no existen: falta correr la migración. */
  faltaMigracion: boolean;
  error: string | null;
}

type Fila = Record<string, unknown>;
const num = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));
const txt = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
const dia = (v: unknown): string | null => (v == null ? null : String(v).slice(0, 10));

const VACIO: Omit<DatosTablero, "desde" | "hasta" | "faltaMigracion" | "error"> = {
  semanal: [], crmSemanal: [], metas: [], grupos: [], acciones: [], actividad: [], crmActividad: [],
  ventasPersona: [], crmVentasPersona: [], comentarios: [], vendedores: [],
};

const faltaLaTabla = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === "PGRST205" || e.code === "42P01" || e.code === "PGRST202" || /does not exist|Could not find/i.test(e.message ?? ""));

/** El rechazo de la base, dicho para quien lo lee. */
function explicar(e: { code?: string; message?: string } | null | undefined): string {
  if (!e) return "No se pudo guardar.";
  if (e.code === "42501" || /row-level security|permission denied/i.test(e.message ?? "")) {
    return "No tienes permiso para llenar esta parte del Tablero. Lo habilita Dirección en Usuarios y Roles.";
  }
  if (faltaLaTabla(e)) return "Falta instalar el Tablero Comercial en la base (migración 20261125120000_tablero_comercial.sql).";
  return e.message ?? "No se pudo guardar.";
}

/**
 * Todo lo que hace falta para dibujar el Tablero de un mes: ese mes, los doce
 * anteriores (para la Evolución y para comparar con el mismo mes del año
 * pasado) y la actividad y metas que correspondan.
 */
export async function cargarTablero(mes: string, marca?: ClaveMarca): Promise<DatosTablero> {
  // `marca`: sólo «Ambas marcas» de crm-peñagroup la pasa, para leer cada
  // Tablero con la sesión que la persona tiene en esa marca. Sin ella, la del
  // pedido, como siempre.
  const supabase = await getServerClient(marca);
  const primerMes = (() => {
    const [a, m] = mes.split("-").map(Number);
    return `${a - 1}-${String(m).padStart(2, "0")}-01`;
  })();
  const desde = semanasDelMes(primerMes)[0] ?? lunesDe(primerMes);
  const ultimas = semanasDelMes(mesDe(mes));
  const hasta = sumarDias(ultimas[ultimas.length - 1] ?? lunesDe(mes), 6);

  const base = { desde, hasta, ...VACIO };
  if (!supabase) return { ...base, faltaMigracion: false, error: "Sesión no válida. Vuelve a iniciar sesión." };

  const [semanal, crm, metas, grupos, acciones, actividad, crmAct, ventasPer, crmVentasPer, comentarios, vendedores] =
    await Promise.all([
      traerTodo<Fila>((conTotal) =>
        supabase.from("tablero_semanal").select("semana, campo, valor", conTotal ? { count: "exact" } : undefined)
          .gte("semana", desde).lte("semana", hasta).order("semana").order("campo")),
      traerTodo<Fila>((conTotal) =>
        supabase.rpc("tablero_crm_semanal", { p_desde: desde, p_hasta: hasta }, conTotal ? { count: "exact" } : undefined)
          .order("semana").order("campo")),
      supabase.from("tablero_metas").select("mes, clave, valor"),
      supabase.from("tablero_grupos").select("*").eq("activo", true).order("inicio").order("grupo"),
      traerTodo<Fila>((conTotal) =>
        supabase.from("tablero_acciones").select("*", conTotal ? { count: "exact" } : undefined)
          .or(`fecha.is.null,fecha.gte.${desde}`).order("fecha").order("id")),
      traerTodo<Fila>((conTotal) =>
        supabase.from("tablero_actividad").select("semana, vendedor_id, campo, valor", conTotal ? { count: "exact" } : undefined)
          .gte("semana", desde).lte("semana", hasta).order("semana").order("vendedor_id").order("campo")),
      traerTodo<Fila>((conTotal) =>
        supabase.rpc("tablero_crm_actividad", { p_desde: desde, p_hasta: hasta }, conTotal ? { count: "exact" } : undefined)
          .order("semana").order("vendedor_id").order("campo")),
      supabase.from("tablero_ventas_persona").select("vendedor_id, campo, valor").eq("mes", mesDe(mes)),
      supabase.rpc("tablero_crm_ventas_persona", { p_mes: mesDe(mes) }),
      supabase.from("tablero_comentarios").select("hoja, texto, actualizado_en").eq("mes", mesDe(mes)),
      supabase.from("vendedores").select("id, nombre, activo").order("nombre"),
    ]);

  const errores = [semanal.error, metas.error?.message, grupos.error?.message, actividad.error, comentarios.error?.message].filter(Boolean);
  if ([metas.error, grupos.error, comentarios.error].some(faltaLaTabla) || /does not exist|Could not find/i.test(String(semanal.error ?? ""))) {
    return { ...base, faltaMigracion: true, error: null };
  }
  // Lo del CRM puede faltar (la segunda migración) sin que se caiga el resto.
  const sinCrm = crm.error || crmAct.error || crmVentasPer.error;

  return {
    desde,
    hasta,
    semanal: semanal.data.map((r) => ({ lunes: dia(r.semana)!, campo: String(r.campo), valor: Number(r.valor) })).filter((r) => r.valor != null && !Number.isNaN(r.valor)),
    crmSemanal: crm.error ? [] : crm.data.map((r) => ({ lunes: dia(r.semana)!, campo: String(r.campo), valor: Number(r.valor) })),
    metas: ((metas.data ?? []) as Fila[]).filter((r) => r.valor != null).map((r) => ({ mes: dia(r.mes), clave: String(r.clave), valor: Number(r.valor) })),
    grupos: ((grupos.data ?? []) as Fila[]).map((r) => ({
      id: Number(r.id),
      programa: String(r.programa ?? ""),
      grupo: String(r.grupo ?? ""),
      dias: txt(r.dias),
      horario: txt(r.horario),
      duracionMeses: num(r.duracion_meses),
      inicio: dia(r.inicio),
      matricula1: num(r.matricula_1),
      matricula2: num(r.matricula_2),
      mensualidad: num(r.mensualidad),
      graduacion: num(r.graduacion),
      mensualidadPreventa: num(r.mensualidad_preventa),
      cupo: num(r.cupo),
      reservas: num(r.reservas),
      inscritos: num(r.inscritos),
    })),
    acciones: acciones.data.map((r) => ({
      id: Number(r.id),
      tipo: String(r.tipo ?? ""),
      accion: String(r.accion ?? ""),
      responsable: r.responsable === "Ventas" ? "Ventas" : "MK",
      persona: txt(r.persona),
      fecha: dia(r.fecha),
      estado: String(r.estado ?? "Planificada"),
      costo: num(r.costo),
      leadsEsperados: num(r.leads_esperados),
      leadsObtenidos: num(r.leads_obtenidos),
      inscritos: num(r.inscritos),
      venta: num(r.venta),
    })),
    actividad: actividad.data.map((r) => ({ lunes: dia(r.semana)!, vendedorId: Number(r.vendedor_id), campo: String(r.campo), valor: Number(r.valor) })),
    crmActividad: crmAct.error ? [] : crmAct.data.map((r) => ({ lunes: dia(r.semana)!, vendedorId: Number(r.vendedor_id), campo: String(r.campo), valor: Number(r.valor) })),
    ventasPersona: ((ventasPer.data ?? []) as Fila[]).map((r) => ({ vendedorId: Number(r.vendedor_id), campo: String(r.campo), valor: Number(r.valor) })),
    crmVentasPersona: crmVentasPer.error ? [] : ((crmVentasPer.data ?? []) as Fila[]).map((r) => ({ vendedorId: Number(r.vendedor_id), campo: String(r.campo), valor: Number(r.valor) })),
    comentarios: ((comentarios.data ?? []) as Fila[]).map((r) => ({ hoja: String(r.hoja), texto: String(r.texto ?? ""), actualizadoEn: String(r.actualizado_en ?? "") })),
    vendedores: ((vendedores.data ?? []) as Fila[]).map((r) => ({ id: Number(r.id), nombre: String(r.nombre ?? ""), activo: r.activo !== false })),
    faltaMigracion: false,
    error: errores.length ? String(errores[0]) : sinCrm ? "No se pudieron leer los datos del CRM; se muestra sólo lo cargado a mano." : null,
  };
}

// ------------------------------------------------------------------ guardar

const CAMPOS_SEMANALES = new Set([...CAMPOS_MK, ...CAMPOS_VENTAS].map((c) => c.clave));
const CAMPOS_DE_ACTIVIDAD = new Set(CAMPOS_ACTIVIDAD.map((c) => c.clave));
const CAMPOS_DE_VENTAS_PERSONA = new Set([...CAMPOS_VENTAS_PERSONA.map((c) => c.clave), "es_gerente"]);
const CLAVES_DE_METAS = new Set<string>([...METAS_DEL_MES, ...METAS_FIJAS].map((m) => m.clave));
const HOJAS = new Set<string>(HOJAS_CON_COMENTARIO.map((h) => h.hoja));

const esLunes = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) && lunesDe(iso) === iso;
const esMes = (iso: string) => /^\d{4}-\d{2}-01$/.test(iso);
const valorValido = (v: number | null) => v === null || Number.isFinite(v);

async function sesion() {
  const supabase = await getServerClient();
  const user = supabase ? await getUser() : null;
  return { supabase, uid: user?.id ?? null };
}

/** Un dato de MK o Ventas de una semana. `null` lo borra («todavía no se cargó»). */
export async function guardarSemanal(lunes: string, campo: string, valor: number | null): Promise<ActionResult> {
  if (!esLunes(lunes) || !CAMPOS_SEMANALES.has(campo) || !valorValido(valor)) return { ok: false, error: "Dato no válido." };
  const { supabase, uid } = await sesion();
  if (!supabase) return { ok: false, error: "Sesión no válida." };
  const { error } = valor === null
    ? await supabase.from("tablero_semanal").delete().eq("semana", lunes).eq("campo", campo)
    : await supabase.from("tablero_semanal").upsert(
        { semana: lunes, campo, valor, actualizado_por: uid, actualizado_en: new Date().toISOString() },
        { onConflict: "semana,campo" },
      );
  return error ? { ok: false, error: explicar(error) } : { ok: true, error: null };
}

/** Una meta. Con `mes`, la de ese mes; sin `mes`, la fija. */
export async function guardarMeta(mes: string | null, clave: string, valor: number | null): Promise<ActionResult> {
  if ((mes !== null && !esMes(mes)) || !CLAVES_DE_METAS.has(clave) || !valorValido(valor)) return { ok: false, error: "Dato no válido." };
  const { supabase, uid } = await sesion();
  if (!supabase) return { ok: false, error: "Sesión no válida." };
  // Los índices únicos son parciales (con mes / sin mes), así que se borra y
  // se vuelve a escribir en vez de un upsert.
  const borrar = supabase.from("tablero_metas").delete().eq("clave", clave);
  const { error: e1 } = mes === null ? await borrar.is("mes", null) : await borrar.eq("mes", mes);
  if (e1) return { ok: false, error: explicar(e1) };
  if (valor === null) return { ok: true, error: null };
  const { error } = await supabase.from("tablero_metas").insert({ mes, clave, valor, actualizado_por: uid });
  return error ? { ok: false, error: explicar(error) } : { ok: true, error: null };
}

/** Un dato de actividad de una persona en una semana. */
export async function guardarActividad(lunes: string, vendedorId: number, campo: string, valor: number | null): Promise<ActionResult> {
  if (!esLunes(lunes) || !CAMPOS_DE_ACTIVIDAD.has(campo) || !Number.isInteger(vendedorId) || !valorValido(valor)) {
    return { ok: false, error: "Dato no válido." };
  }
  const { supabase, uid } = await sesion();
  if (!supabase) return { ok: false, error: "Sesión no válida." };
  const { error } = valor === null
    ? await supabase.from("tablero_actividad").delete().eq("semana", lunes).eq("vendedor_id", vendedorId).eq("campo", campo)
    : await supabase.from("tablero_actividad").upsert(
        { semana: lunes, vendedor_id: vendedorId, campo, valor, actualizado_por: uid, actualizado_en: new Date().toISOString() },
        { onConflict: "semana,vendedor_id,campo" },
      );
  return error ? { ok: false, error: explicar(error) } : { ok: true, error: null };
}

/** Un dato del cierre del mes de una persona. */
export async function guardarVentasPersona(mes: string, vendedorId: number, campo: string, valor: number | null): Promise<ActionResult> {
  if (!esMes(mes) || !CAMPOS_DE_VENTAS_PERSONA.has(campo) || !Number.isInteger(vendedorId) || !valorValido(valor)) {
    return { ok: false, error: "Dato no válido." };
  }
  const { supabase, uid } = await sesion();
  if (!supabase) return { ok: false, error: "Sesión no válida." };
  const { error } = valor === null
    ? await supabase.from("tablero_ventas_persona").delete().eq("mes", mes).eq("vendedor_id", vendedorId).eq("campo", campo)
    : await supabase.from("tablero_ventas_persona").upsert(
        { mes, vendedor_id: vendedorId, campo, valor, actualizado_por: uid, actualizado_en: new Date().toISOString() },
        { onConflict: "mes,vendedor_id,campo" },
      );
  return error ? { ok: false, error: explicar(error) } : { ok: true, error: null };
}

/** El comentario de un área sobre su hoja, para ese mes. */
export async function guardarComentario(mes: string, hoja: string, texto: string): Promise<ActionResult> {
  if (!esMes(mes) || !HOJAS.has(hoja) || texto.length > 4000) return { ok: false, error: "Dato no válido." };
  const { supabase, uid } = await sesion();
  if (!supabase) return { ok: false, error: "Sesión no válida." };
  const { error } = await supabase.from("tablero_comentarios").upsert(
    { mes, hoja, texto: texto.trim(), actualizado_por: uid, actualizado_en: new Date().toISOString() },
    { onConflict: "mes,hoja" },
  );
  return error ? { ok: false, error: explicar(error) } : { ok: true, error: null };
}

/** Un grupo en venta: nuevo (sin id) o cambiado. */
export async function guardarGrupo(g: Omit<GrupoGuardado, "id"> & { id?: number }): Promise<ActionResult & { id?: number }> {
  if (!g.programa.trim() || !g.grupo.trim()) return { ok: false, error: "Falta el programa o el nombre del grupo." };
  const { supabase, uid } = await sesion();
  if (!supabase) return { ok: false, error: "Sesión no válida." };
  const fila = {
    programa: g.programa.trim(), grupo: g.grupo.trim(), dias: g.dias, horario: g.horario,
    duracion_meses: g.duracionMeses, inicio: g.inicio, matricula_1: g.matricula1, matricula_2: g.matricula2,
    mensualidad: g.mensualidad, graduacion: g.graduacion, mensualidad_preventa: g.mensualidadPreventa,
    cupo: g.cupo, reservas: g.reservas, inscritos: g.inscritos,
    actualizado_por: uid, actualizado_en: new Date().toISOString(),
  };
  const r = g.id
    ? await supabase.from("tablero_grupos").update(fila).eq("id", g.id).select("id").single()
    : await supabase.from("tablero_grupos").insert(fila).select("id").single();
  return r.error ? { ok: false, error: explicar(r.error) } : { ok: true, error: null, id: Number(r.data?.id) };
}

/** Saca un grupo de la lista (queda guardado, sin mostrarse). */
export async function quitarGrupo(id: number): Promise<ActionResult> {
  const { supabase, uid } = await sesion();
  if (!supabase) return { ok: false, error: "Sesión no válida." };
  const { error } = await supabase.from("tablero_grupos").update({ activo: false, actualizado_por: uid }).eq("id", id);
  return error ? { ok: false, error: explicar(error) } : { ok: true, error: null };
}

/** Una acción del plan: nueva (sin id) o cambiada. */
export async function guardarAccion(a: Omit<AccionGuardada, "id"> & { id?: number }): Promise<ActionResult & { id?: number }> {
  if (!a.accion.trim() || !a.tipo) return { ok: false, error: "Falta decir qué acción es." };
  if (!(ESTADOS_DE_ACCION as readonly string[]).includes(a.estado)) return { ok: false, error: "Estado no válido." };
  const { supabase, uid } = await sesion();
  if (!supabase) return { ok: false, error: "Sesión no válida." };
  const fila = {
    tipo: a.tipo, accion: a.accion.trim(), responsable: a.responsable, persona: a.persona, fecha: a.fecha,
    estado: a.estado, costo: a.costo, leads_esperados: a.leadsEsperados, leads_obtenidos: a.leadsObtenidos,
    inscritos: a.inscritos, venta: a.venta, actualizado_por: uid, actualizado_en: new Date().toISOString(),
  };
  const r = a.id
    ? await supabase.from("tablero_acciones").update(fila).eq("id", a.id).select("id").single()
    : await supabase.from("tablero_acciones").insert({ ...fila, creado_por: uid }).select("id").single();
  return r.error ? { ok: false, error: explicar(r.error) } : { ok: true, error: null, id: Number(r.data?.id) };
}

export async function borrarAccion(id: number): Promise<ActionResult> {
  const { supabase } = await sesion();
  if (!supabase) return { ok: false, error: "Sesión no válida." };
  const { error } = await supabase.from("tablero_acciones").delete().eq("id", id);
  return error ? { ok: false, error: explicar(error) } : { ok: true, error: null };
}
