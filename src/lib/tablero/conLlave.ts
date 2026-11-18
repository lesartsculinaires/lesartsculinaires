import "server-only";

/**
 * Leer el Tablero Comercial de HC con la llave del sitio de Dirección
 * (traído de tablero-comercial, `src/lib/cargar.ts`).
 *
 * «Ambas marcas» de crm-peñagroup lee cada Tablero con la sesión que la
 * persona tiene en esa marca (`cargarTablero`). Dirección muchas veces no
 * tiene cuenta en HC: entonces, y sólo después de pasar la puerta de LAC
 * (`puede_ver_sitio_de_direccion()`), se lee HC como lo hace el sitio de
 * Dirección: `tablero_del_sitio()` con `HC_TABLERO_LLAVE`, que sólo abre el
 * Tablero (no es la llave de servicio). Sólo lee.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabasePublico } from "@/lib/supabase/config";
import { lunesDe, mesDe, semanasDelMes, sumarDias } from "@/lib/tablero/semanas";
import type { DatosTablero } from "@/app/tablero-actions";

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

/** Las filas tal como vienen de la base, de cualquiera de las dos formas de leer. */
interface Partes {
  semanal: Fila[]; crmSemanal: Fila[]; metas: Fila[]; grupos: Fila[]; acciones: Fila[]; actividad: Fila[];
  crmActividad: Fila[]; ventasPersona: Fila[]; crmVentasPersona: Fila[]; comentarios: Fila[]; vendedores: Fila[];
}

/** De filas a lo que usan las hojas. */
function traducir(p: Partes): Omit<DatosTablero, "desde" | "hasta" | "faltaMigracion" | "error"> {
  return {
    semanal: p.semanal.map((r) => ({ lunes: dia(r.semana)!, campo: String(r.campo), valor: Number(r.valor) })).filter((r) => !Number.isNaN(r.valor)),
    crmSemanal: p.crmSemanal.map((r) => ({ lunes: dia(r.semana)!, campo: String(r.campo), valor: Number(r.valor) })),
    metas: p.metas.filter((r) => r.valor != null).map((r) => ({ mes: dia(r.mes), clave: String(r.clave), valor: Number(r.valor) })),
    grupos: p.grupos.map((r) => ({
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
    acciones: p.acciones.map((r) => ({
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
    actividad: p.actividad.map((r) => ({ lunes: dia(r.semana)!, vendedorId: Number(r.vendedor_id), campo: String(r.campo), valor: Number(r.valor) })),
    crmActividad: p.crmActividad.map((r) => ({ lunes: dia(r.semana)!, vendedorId: Number(r.vendedor_id), campo: String(r.campo), valor: Number(r.valor) })),
    ventasPersona: p.ventasPersona.map((r) => ({ vendedorId: Number(r.vendedor_id), campo: String(r.campo), valor: Number(r.valor) })),
    crmVentasPersona: p.crmVentasPersona.map((r) => ({ vendedorId: Number(r.vendedor_id), campo: String(r.campo), valor: Number(r.valor) })),
    comentarios: p.comentarios.map((r) => ({ hoja: String(r.hoja), texto: String(r.texto ?? ""), actualizadoEn: String(r.actualizado_en ?? "") })),
    vendedores: p.vendedores.map((r) => ({ id: Number(r.id), nombre: String(r.nombre ?? ""), activo: r.activo !== false })),
  };
}

/** Lo mismo que el módulo del CRM: el mes elegido y los doce anteriores, de lunes a domingo. */
function rangoDe(mes: string) {
  const primerMes = (() => {
    const [a, m] = mes.split("-").map(Number);
    return `${a - 1}-${String(m).padStart(2, "0")}-01`;
  })();
  const desde = semanasDelMes(primerMes)[0] ?? lunesDe(primerMes);
  const ultimas = semanasDelMes(mesDe(mes));
  const hasta = sumarDias(ultimas[ultimas.length - 1] ?? lunesDe(mes), 6);
  return { desde, hasta };
}

/** HC, con la llave del sitio: todo junto en `tablero_del_sitio()`. */
export async function cargarConLlave(
  lectura: { cliente: SupabaseClient; llave: string } | null,
  mes: string,
): Promise<DatosTablero> {
  const { desde, hasta } = rangoDe(mes);
  const base = { desde, hasta, ...VACIO };
  if (!lectura) return { ...base, faltaMigracion: false, error: "Falta configurar la conexión con esta base." };

  try {
    const { data, error } = await lectura.cliente.rpc("tablero_del_sitio", {
      p_llave: lectura.llave, p_desde: desde, p_hasta: hasta, p_mes: mesDe(mes),
    });
    if (error) {
      if (faltaLaTabla(error)) return { ...base, faltaMigracion: true, error: null };
      if (error.code === "42501") return { ...base, faltaMigracion: false, error: "La llave del sitio no fue aceptada por la base." };
      return { ...base, faltaMigracion: false, error: `No se pudo leer la base: ${error.message}` };
    }
    const d = (data ?? {}) as Record<string, Fila[] | undefined>;
    const de = (k: string) => (Array.isArray(d[k]) ? d[k]! : []);
    return {
      desde,
      hasta,
      ...traducir({
        semanal: de("semanal"),
        crmSemanal: de("crm_semanal"),
        metas: de("metas"),
        grupos: de("grupos"),
        acciones: de("acciones"),
        actividad: de("actividad"),
        crmActividad: de("crm_actividad"),
        ventasPersona: de("ventas_persona"),
        crmVentasPersona: de("crm_ventas_persona"),
        comentarios: de("comentarios"),
        vendedores: de("vendedores"),
      }),
      faltaMigracion: false,
      error: null,
    };
  } catch (e) {
    return { ...base, faltaMigracion: false, error: e instanceof Error ? `No se pudo leer la base: ${e.message}` : "No se pudo leer la base." };
  }
}

/** HC sin sesión: el cliente anónimo y la llave del sitio, si están. */
export function lecturaHcConLlave(): { cliente: SupabaseClient; llave: string } | null {
  const llave = process.env.HC_TABLERO_LLAVE ?? "";
  const { url, anon } = supabasePublico("hc");
  if (!llave || !url || !anon) return null;
  const cliente = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { cliente, llave };
}
