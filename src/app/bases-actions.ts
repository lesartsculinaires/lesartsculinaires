"use server";

import { revalidatePath } from "next/cache";

import { getServerClient } from "@/lib/supabase/server";

/**
 * Borrar una base subida por error, con las fichas que trajo.
 *
 * ==========================================================================
 * POR QUÉ TODO EL TRABAJO ESTÁ EN LA BASE Y NO ACÁ
 * ==========================================================================
 *
 * Porque son cuatro borrados encadenados —leads, contactos que quedan sin
 * nada, y el registro de la carga— y tienen que pasar juntos o no pasar. Hecho
 * desde acá, un corte de red a mitad de camino dejaría los leads borrados y
 * los contactos huérfanos, o la base sin leads y todavía en la lista. Una
 * función de Postgres es una transacción: o queda todo hecho o no queda nada.
 *
 * Y porque la comprobación del rol tiene que estar donde no se pueda saltar.
 * Una acción de servidor la puede invocar cualquiera con sesión; el `if` de
 * acá es para dar un mensaje que se entienda, el que manda es el de adentro
 * de la función.
 */

export interface Revision {
  ok: boolean;
  error: string | null;
  /** Leads que se irían con la base. */
  leads: number;
  /** Contactos que quedarían sin ningún lead y también se van. */
  contactos: number;
  /** De esos leads, cuántos ya tienen trabajo encima: cualquiera de los de abajo. */
  trabajados: number;
  conNotas: number;
  conDinero: number;
  /** Ganados o perdidos: alguien llegó hasta el final con esa persona. */
  conCierre: number;
  /**
   * Los que cuentan SÓLO por estar en una etapa distinta de la primera.
   *
   * Va aparte porque es el que suele explicar un número alarmante que no
   * alarma: una planilla puede traer su propia columna de etapa, y entonces
   * los trescientos leads entran directamente en «Contactado» sin que nadie
   * los haya tocado. Sin separarlo, el cartel decía «325 de 325 ya se
   * trabajaron» y ese aviso, encendido siempre, se aprende a ignorar.
   */
  conEtapa: number;
  /** La migración todavía no se corrió. */
  faltaMigracion: boolean;
}

const SIN_REVISION: Revision = {
  ok: true,
  error: null,
  leads: 0,
  contactos: 0,
  trabajados: 0,
  conNotas: 0,
  conDinero: 0,
  conCierre: 0,
  conEtapa: 0,
  faltaMigracion: false,
};

const faltaLaFuncion = (error: { code?: string; message?: string } | null): boolean =>
  error != null &&
  (error.code === "PGRST202" ||
    /Could not find the function|does not exist/i.test(error.message ?? ""));

/**
 * Qué se llevaría borrar esta base, antes de borrarla.
 *
 * Un «¿seguro?» sin números no es una confirmación: es un trámite que se
 * aprueba sin leer. Con «se van 326 leads y 326 contactos, 4 de ellos
 * trabajados», quien decide decide de verdad.
 */
export async function revisarBase(importacionId: number): Promise<Revision> {
  const supabase = await getServerClient();
  if (!supabase) {
    return { ...SIN_REVISION, ok: false, error: "Sesión no válida. Volvé a iniciar sesión." };
  }

  const { data, error } = await supabase
    .rpc("revisar_base", { p_id: importacionId })
    .maybeSingle();

  if (error) {
    if (faltaLaFuncion(error)) return { ...SIN_REVISION, faltaMigracion: true };
    return { ...SIN_REVISION, ok: false, error: error.message };
  }

  const f = (data ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (v == null ? 0 : Number(v));

  return {
    ...SIN_REVISION,
    leads: n(f.leads),
    contactos: n(f.contactos_solo),
    trabajados: n(f.trabajados),
    conNotas: n(f.con_notas),
    conDinero: n(f.con_dinero),
    // Las dos nuevas vienen de 20261013120000. Sin esa migración llegan
    // indefinidas y quedan en cero, que es lo que corresponde: el cartel
    // muestra el total y no el detalle, como antes.
    conCierre: n(f.con_cierre),
    conEtapa: n(f.con_etapa),
  };
}

export interface ResultadoBorrado {
  ok: boolean;
  error: string | null;
  /**
   * La base tiene leads trabajados y no se borró.
   *
   * Distinto de un error: no falló nada, hay algo que mirar. La pantalla
   * ofrece forzar; un error, no.
   */
  frenado?: boolean;
  leadsBorrados?: number;
  contactosBorrados?: number;
}

/**
 * Borra la base con todo lo suyo.
 *
 * `forzar` sólo cuando la persona ya vio cuántos leads trabajados se va a
 * llevar y dijo que sí igual. Nunca por omisión: el caso que esto resuelve es
 * una base subida dos veces, y ahí no hay nada trabajado que perder.
 */
export async function borrarBase(
  importacionId: number,
  forzar = false,
): Promise<ResultadoBorrado> {
  const supabase = await getServerClient();
  if (!supabase) return { ok: false, error: "Sesión no válida. Volvé a iniciar sesión." };

  // Para dar un «no te corresponde» que se entienda en vez del error crudo de
  // la función. El que manda es el de adentro.
  const { data: esAdmin } = await supabase.rpc("es_admin");
  if (esAdmin !== true) {
    return { ok: false, error: "Sólo dirección puede borrar una base." };
  }

  const { data, error } = await supabase
    .rpc("borrar_base", { p_id: importacionId, p_forzar: forzar })
    .maybeSingle();

  if (error) {
    if (faltaLaFuncion(error)) {
      return {
        ok: false,
        error:
          "Falta correr la migración 20261010120000_borrar_base_duplicada.sql en Supabase.",
      };
    }
    if (error.code === "42501") {
      return { ok: false, error: "Sólo dirección puede borrar una base." };
    }
    /*
     * «DELETE requires a WHERE clause».
     *
     * Lo tira la extensión `safeupdate` que Supabase deja encendida, y lo
     * causaba un `delete` sin `where` adentro de la primera versión de la
     * función. Se traduce porque el mensaje crudo, en inglés y hablando de
     * cláusulas SQL, no le dice nada a quien está tratando de borrar una base
     * repetida —y sobre todo no dice qué hacer—.
     */
    if (/requires a WHERE clause/i.test(error.message ?? "")) {
      return {
        ok: false,
        error:
          "Falta correr la migración 20261013120000_borrar_base_sin_tabla_temporal.sql " +
          "en Supabase → SQL Editor. Arregla justamente este error.",
      };
    }
    return { ok: false, error: error.message };
  }

  const f = (data ?? {}) as Record<string, unknown>;

  if (f.ok !== true) {
    return {
      ok: false,
      frenado: true,
      error: String(f.motivo ?? "No se pudo borrar la base."),
    };
  }

  revalidatePath("/");
  return {
    ok: true,
    error: null,
    leadsBorrados: Number(f.leads_borrados ?? 0),
    contactosBorrados: Number(f.contactos_borrados ?? 0),
  };
}
