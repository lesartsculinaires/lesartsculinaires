"use server";

import { revalidatePath } from "next/cache";

import { normalizarTexto } from "@/lib/duplicados";
import { getServerClient, getUser } from "@/lib/supabase/server";
import type { Etiqueta } from "@/lib/types";

/**
 * Etiquetas de la bandeja.
 *
 * Son para lo que el pipeline no dice: «pidió beca», «no contesta», «pago
 * pendiente». La etapa y el estado de la venta NO se copian acá —la bandeja
 * los muestra de la oportunidad misma— justamente para que no puedan decir
 * cosas distintas.
 *
 * Crear puede cualquiera: se etiqueta en medio de una conversación y pedir
 * permiso para anotar «no contesta» no tendría sentido. Renombrar y borrar es
 * de dirección, porque eso cambia lo que ya está puesto en conversaciones
 * ajenas.
 */

export interface ResultadoEtiqueta {
  ok: boolean;
  error: string | null;
  /** La etiqueta recién creada, para poder ponerla sin recargar. */
  etiqueta?: Etiqueta;
}

const SIN_SESION = { ok: false, error: "Sesión no válida. Volvé a iniciar sesión." } as const;

/** 42P01 / PGRST205: la tabla no existe todavía; falta correr la migración. */
const faltaTabla = (codigo: string | undefined) =>
  codigo === "42P01" || codigo === "PGRST205";

const FALTA_MIGRACION =
  "Falta correr la migración 20260830120000_etiquetas.sql en Supabase.";

/**
 * El mensaje de un error de Supabase, sin quedarse nunca en blanco.
 *
 * Cuando la tabla no existe, PostgREST contesta un cuerpo vacío: sin código y
 * sin mensaje. Devolver ese `undefined` hacía que el botón no hiciera nada
 * visible —ni error ni etiqueta— y no había forma de saber que faltaba la
 * migración. Por eso el vacío también se trata como tabla faltante: es la
 * única causa conocida de que Supabase conteste así.
 */
function explicar(error: { code?: string; message?: string } | null): string {
  if (!error) return FALTA_MIGRACION;
  if (faltaTabla(error.code)) return FALTA_MIGRACION;
  if (!error.message) return FALTA_MIGRACION;
  return error.message;
}

export async function listarEtiquetas(): Promise<{
  etiquetas: Etiqueta[];
  faltaMigracion: boolean;
}> {
  const supabase = await getServerClient();
  if (!supabase) return { etiquetas: [], faltaMigracion: false };

  const { data, error } = await supabase
    .from("etiquetas")
    .select("id, nombre, color, activa")
    .order("nombre");

  if (error) return { etiquetas: [], faltaMigracion: faltaTabla(error.code) };

  return {
    etiquetas: (data ?? []).map((e) => ({
      id: Number(e.id),
      nombre: String(e.nombre),
      color: String(e.color ?? "#6B665F"),
      activa: e.activa !== false,
    })),
    faltaMigracion: false,
  };
}

export async function crearEtiqueta(
  nombre: string,
  color: string,
): Promise<ResultadoEtiqueta> {
  const supabase = await getServerClient();
  if (!supabase) return SIN_SESION;

  const limpio = nombre.trim();
  if (!limpio) return { ok: false, error: "Ponele un nombre a la etiqueta." };
  if (limpio.length > 40) return { ok: false, error: "El nombre es demasiado largo." };

  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return { ok: false, error: "El color no tiene una forma válida." };
  }

  // La base ya rechaza el nombre repetido sin distinguir mayúsculas; esto es
  // para poder decir con cuál choca en vez de mostrar un error de Postgres.
  const { data: existentes } = await supabase.from("etiquetas").select("nombre");
  const igual = (existentes ?? []).find(
    (e) => normalizarTexto(String(e.nombre)) === normalizarTexto(limpio),
  );
  if (igual) return { ok: false, error: `Ya existe la etiqueta «${String(igual.nombre)}».` };

  const { data, error } = await supabase
    .from("etiquetas")
    .insert({ nombre: limpio, color })
    .select("id, nombre, color, activa")
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, error: "Ya existe una etiqueta con ese nombre." };
    return { ok: false, error: explicar(error) };
  }

  // Sin error y sin fila: pasa cuando la tabla no existe y PostgREST contesta
  // un cuerpo vacío. Sin esto el botón se quedaba mudo.
  if (!data) return { ok: false, error: FALTA_MIGRACION };

  revalidatePath("/");
  return {
    ok: true,
    error: null,
    etiqueta: {
      id: Number(data.id),
      nombre: String(data.nombre),
      color: String(data.color),
      activa: data.activa !== false,
    },
  };
}

/** Renombrar o recolorear. Sólo dirección, y la base lo hace cumplir aparte. */
export async function editarEtiqueta(
  id: number,
  cambios: { nombre?: string; color?: string; activa?: boolean },
): Promise<ResultadoEtiqueta> {
  const supabase = await getServerClient();
  if (!supabase) return SIN_SESION;

  const { data: esAdmin } = await supabase.rpc("es_admin");
  if (esAdmin !== true) {
    return { ok: false, error: "Sólo dirección puede cambiar las etiquetas." };
  }

  const patch: Record<string, unknown> = {};
  if (cambios.nombre != null) {
    const limpio = cambios.nombre.trim();
    if (!limpio) return { ok: false, error: "El nombre no puede quedar vacío." };
    patch.nombre = limpio;
  }
  if (cambios.color != null) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(cambios.color)) {
      return { ok: false, error: "El color no tiene una forma válida." };
    }
    patch.color = cambios.color;
  }
  if (cambios.activa != null) patch.activa = cambios.activa;

  if (Object.keys(patch).length === 0) return { ok: true, error: null };

  const { error } = await supabase.from("etiquetas").update(patch).eq("id", id);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Ya existe una etiqueta con ese nombre." };
    if (error.code === "42501") {
      return { ok: false, error: "Sólo dirección puede cambiar las etiquetas." };
    }
    return { ok: false, error: explicar(error) };
  }

  revalidatePath("/");
  return { ok: true, error: null };
}

/**
 * Borra la etiqueta de todas partes.
 *
 * Se saca de las conversaciones donde estaba —eso lo hace el `on delete
 * cascade`— así que no queda nada colgando. Es de dirección porque le cambia
 * la vista a todo el equipo, no sólo a quien la borra.
 */
export async function borrarEtiqueta(id: number): Promise<ResultadoEtiqueta> {
  const supabase = await getServerClient();
  if (!supabase) return SIN_SESION;

  const { data: esAdmin } = await supabase.rpc("es_admin");
  if (esAdmin !== true) {
    return { ok: false, error: "Sólo dirección puede borrar etiquetas." };
  }

  const { error } = await supabase.from("etiquetas").delete().eq("id", id);
  if (error) {
    if (error.code === "42501") {
      return { ok: false, error: "Sólo dirección puede borrar etiquetas." };
    }
    return { ok: false, error: explicar(error) };
  }

  revalidatePath("/");
  return { ok: true, error: null };
}

/** Pone o saca una etiqueta de una conversación. Cualquiera del equipo. */
export async function marcarConversacion(
  conversacionId: number,
  etiquetaId: number,
  puesta: boolean,
): Promise<ResultadoEtiqueta> {
  const supabase = await getServerClient();
  if (!supabase) return SIN_SESION;

  if (puesta) {
    // Queda quién la puso: en un hilo con cuatro etiquetas, saber quién anotó
    // «no contesta» es la mitad de la información.
    const user = await getUser();
    const { error } = await supabase
      .from("conversacion_etiquetas")
      .upsert(
        {
          conversacion_id: conversacionId,
          etiqueta_id: etiquetaId,
          puesta_por: user?.id ?? null,
        },
        { onConflict: "conversacion_id,etiqueta_id" },
      );
    if (error) return { ok: false, error: explicar(error) };
  } else {
    const { error } = await supabase
      .from("conversacion_etiquetas")
      .delete()
      .eq("conversacion_id", conversacionId)
      .eq("etiqueta_id", etiquetaId);
    if (error) return { ok: false, error: explicar(error) };
  }

  revalidatePath("/");
  return { ok: true, error: null };
}
