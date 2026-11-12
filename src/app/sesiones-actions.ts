"use server";

import { cookies } from "next/headers";

import type { ActionResult } from "@/app/actions";
import { marcaDelPedido } from "@/lib/marca/servidor";
import { MODO_UNIFICADO, type ClaveMarca } from "@/lib/marcas";
import { getServerClient } from "@/lib/supabase/server";
import type { TipoDeDispositivo } from "@/lib/dispositivo";

/**
 * Las sesiones por dispositivo de crm-peñagroup (12/11/2026).
 *
 * Cada rol dice cuántas sesiones puede tener abiertas cada persona en
 * computadora, celular y tablet. Al entrar se anota la sesión (y la base
 * cierra la más vieja de ese tipo si se pasa del límite); la pantalla pregunta
 * de vez en cuando si la suya sigue abierta, y si la cerraron vuelve al inicio
 * de sesión diciendo por qué. Ver la migración 20261202120000_crm_unificado.
 *
 * Cuál es la sesión de este navegador se guarda en una galleta httpOnly, una
 * por marca: cada marca tiene su base y lleva su propia cuenta.
 *
 * Los sitios de una sola marca no anotan nada: estas acciones no hacen nada
 * fuera de crm-peñagroup. Y si la migración todavía no está, tampoco: nadie
 * queda afuera porque falte una tabla.
 */

const galletaDeSesion = (marca: ClaveMarca) => `crm.sesion.${marca}`;

const FALTA_MIGRACION = /does not exist|schema cache|PGRST202|42883/i;

export type EstadoDeSesion = "abierta" | "sin-registrar" | "otro_dispositivo" | "administrador" | "salio" | "cerrada";

/** Anota la sesión de este navegador. Se llama al entrar. */
export async function registrarDispositivo(
  tipo: TipoDeDispositivo,
  agente: string,
): Promise<ActionResult & { cerradas?: number }> {
  if (!MODO_UNIFICADO) return { ok: true, error: null };
  const supabase = await getServerClient();
  if (!supabase) return { ok: false, error: "Sin sesión." };

  const { data, error } = await supabase.rpc("registrar_sesion_crm", {
    p_tipo: tipo,
    p_agente: agente.slice(0, 120),
  });
  if (error) {
    if (FALTA_MIGRACION.test(`${error.code} ${error.message}`)) return { ok: true, error: null };
    return { ok: false, error: error.message };
  }
  const fila = (Array.isArray(data) ? data[0] : data) as { id?: string; cerradas?: number } | null;
  if (!fila?.id) return { ok: false, error: "No se pudo anotar la sesión." };

  (await cookies()).set(galletaDeSesion(marcaDelPedido()), fila.id, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  return { ok: true, error: null, cerradas: Number(fila.cerradas ?? 0) };
}

/** ¿Sigue abierta la sesión de este navegador? */
export async function estadoDeMiSesion(): Promise<EstadoDeSesion> {
  if (!MODO_UNIFICADO) return "abierta";
  const id = (await cookies()).get(galletaDeSesion(marcaDelPedido()))?.value;
  if (!id) return "sin-registrar";
  const supabase = await getServerClient();
  if (!supabase) return "abierta";

  const { data, error } = await supabase.rpc("estado_sesion_crm", { p_id: id });
  // Ante la duda —sin red, sin la migración— se sigue trabajando.
  if (error) return "abierta";
  if (data === "desconocida") return "sin-registrar";
  return (data as EstadoDeSesion) ?? "abierta";
}

/** Cierra la sesión de este navegador en la base (al salir). */
export async function cerrarMiDispositivo(): Promise<void> {
  if (!MODO_UNIFICADO) return;
  const almacen = await cookies();
  const nombre = galletaDeSesion(marcaDelPedido());
  const id = almacen.get(nombre)?.value;
  if (id) {
    try {
      const supabase = await getServerClient();
      await supabase?.rpc("cerrar_sesion_crm", { p_id: id });
    } catch {
      // Salir no puede depender de esto.
    }
  }
  for (const { name } of almacen.getAll()) {
    if (name.startsWith("crm.sesion.")) almacen.delete(name);
  }
}

export interface SesionDeDispositivo {
  id: string;
  usuarioId: string;
  tipo: TipoDeDispositivo;
  agente: string | null;
  creadaEn: string;
  vistaEn: string;
}

/** Administración: las sesiones abiertas de todos. */
export async function sesionesAbiertas(): Promise<{ sesiones: SesionDeDispositivo[]; error: string | null }> {
  const supabase = await getServerClient();
  if (!supabase) return { sesiones: [], error: "Sin sesión." };
  const { data, error } = await supabase
    .from("sesiones_crm")
    .select("id, usuario_id, tipo, agente, creada_en, vista_en")
    .is("cerrada_en", null)
    .order("vista_en", { ascending: false })
    .limit(500);
  if (error) {
    return { sesiones: [], error: FALTA_MIGRACION.test(`${error.code} ${error.message}`) ? null : error.message };
  }
  return {
    sesiones: (data ?? []).map((r) => ({
      id: String(r.id),
      usuarioId: String(r.usuario_id),
      tipo: r.tipo as TipoDeDispositivo,
      agente: r.agente ? String(r.agente) : null,
      creadaEn: String(r.creada_en),
      vistaEn: String(r.vista_en),
    })),
    error: null,
  };
}

/** Administración: cerrar la sesión de alguien (o la propia). */
export async function cerrarSesionDeDispositivo(id: string): Promise<ActionResult> {
  const supabase = await getServerClient();
  if (!supabase) return { ok: false, error: "Sin sesión." };
  const { error } = await supabase.rpc("cerrar_sesion_crm", { p_id: id });
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}
