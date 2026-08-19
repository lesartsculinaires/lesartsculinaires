"use server";

import { revalidatePath } from "next/cache";

import { getServerClient } from "@/lib/supabase/server";

/**
 * Los cursos y diplomados que un cliente ya hizo.
 *
 * Cuelgan del cliente y no de la oportunidad: lo que se quiere saber es qué
 * cursó esta persona, no qué se le vendió en un trato puntual. Si tiene tres
 * oportunidades abiertas, su historial es el mismo en las tres.
 */

export interface CursoRealizado {
  id: number;
  /** Del catálogo, si el programa todavía se dicta. */
  productoId: number | null;
  /** Lo que se muestra: el nombre del catálogo o el escrito a mano. */
  nombre: string;
  iniciaEn: string | null;
  terminaEn: string | null;
}

export interface ResultadoCursos {
  ok: boolean;
  error: string | null;
  cursos: CursoRealizado[];
  /** La migración todavía no se corrió. */
  faltaMigracion: boolean;
}

const VACIO: ResultadoCursos = { ok: true, error: null, cursos: [], faltaMigracion: false };

export async function listarCursos(clienteId: number): Promise<ResultadoCursos> {
  const supabase = await getServerClient();
  if (!supabase) {
    return { ...VACIO, ok: false, error: "Sesión no válida. Volvé a iniciar sesión." };
  }

  // El nombre del catálogo viene por la relación, que acá sí se puede: las dos
  // tablas están en `public` y PostgREST conoce la clave foránea.
  const { data, error } = await supabase
    .from("cursos_realizados")
    .select("id, producto_id, nombre, inicia_en, termina_en, productos(nombre)")
    .eq("cliente_id", clienteId)
    // Lo más reciente primero. Los que no tienen fecha van al final: son los
    // viejos de los que sólo se sabe que se hicieron.
    .order("inicia_en", { ascending: false, nullsFirst: false });

  if (error) {
    if (error.code === "PGRST205") return { ...VACIO, faltaMigracion: true };
    return { ...VACIO, ok: false, error: error.message };
  }

  return {
    ...VACIO,
    cursos: (data ?? []).map((c) => {
      const delCatalogo = (c.productos as { nombre?: string } | null)?.nombre;
      return {
        id: Number(c.id),
        productoId: c.producto_id == null ? null : Number(c.producto_id),
        // El del catálogo manda: si el programa se renombró, la ficha muestra
        // el nombre de hoy y no el que tenía cuando se cargó.
        nombre: String(delCatalogo || c.nombre || ""),
        iniciaEn: c.inicia_en ? String(c.inicia_en) : null,
        terminaEn: c.termina_en ? String(c.termina_en) : null,
      };
    }),
  };
}

export interface NuevoCurso {
  clienteId: number;
  /** Del catálogo. Null cuando se escribió el nombre a mano. */
  productoId: number | null;
  nombre: string | null;
  iniciaEn: string | null;
  terminaEn: string | null;
}

export async function agregarCurso(
  c: NuevoCurso,
): Promise<{ ok: boolean; error: string | null }> {
  const supabase = await getServerClient();
  if (!supabase) return { ok: false, error: "Sesión no válida. Volvé a iniciar sesión." };

  const nombre = (c.nombre ?? "").trim();
  if (c.productoId == null && !nombre) {
    return { ok: false, error: "Elegí un programa o escribí el nombre del curso." };
  }

  // La base también lo comprueba; acá se atrapa antes para poder decirlo con
  // palabras en vez de devolver el nombre de una restricción.
  if (c.iniciaEn && c.terminaEn && c.terminaEn < c.iniciaEn) {
    return { ok: false, error: "La fecha de fin es anterior a la de inicio." };
  }

  const { data: { user } = { user: null } } = await supabase.auth.getUser();

  const { error } = await supabase.from("cursos_realizados").insert({
    cliente_id: c.clienteId,
    producto_id: c.productoId,
    // Con programa del catálogo no se guarda el texto: sería una copia que
    // envejece sola en cuanto alguien renombre el programa.
    nombre: c.productoId == null ? nombre : null,
    inicia_en: c.iniciaEn,
    termina_en: c.terminaEn,
    creado_por: user?.id ?? null,
  });

  if (error) {
    if (error.code === "PGRST205") {
      return {
        ok: false,
        error: "Falta correr la migración 20260826120000_cursos_realizados.sql en Supabase.",
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/");
  return { ok: true, error: null };
}

export async function quitarCurso(id: number): Promise<{ ok: boolean; error: string | null }> {
  const supabase = await getServerClient();
  if (!supabase) return { ok: false, error: "Sesión no válida. Volvé a iniciar sesión." };

  const { error } = await supabase.from("cursos_realizados").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  return { ok: true, error: null };
}
