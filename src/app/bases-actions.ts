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

export interface ResultadoNuevaBase {
  ok: boolean;
  error: string | null;
  /** El id de la base creada, para poder abrirla después. */
  importacionId: number | null;
  /** Cuántos leads quedaron dentro. */
  leads: number;
  /**
   * De esos, cuántos venían de OTRA base y se movieron.
   *
   * Se devuelve para poder decirlo después de hacerlo. Ver el comentario largo
   * de `crearBaseConLeads`: un lead pertenece a una sola base, así que armar
   * una nueva con leads que ya estaban en otra los saca de aquélla.
   */
  movidos: number;
}

/**
 * Arma una base nueva con los leads que se marcaron en Clientes.
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «Quiero que cuando se seleccionen clientes en el módulo de Clientes aparezca
 * un botón que diga "Crear base nueva" para poder crear una nueva base desde
 * el CRM y que aparezca en el módulo de Base.»
 *
 * Hasta ahora una base sólo podía nacer subiendo una planilla. Esto la deja
 * nacer de una selección: se filtra en Clientes —por programa, por asesora,
 * por mes, por etiqueta—, se marcan las filas y se agrupan con un nombre.
 *
 * ============================================================================
 * UN LEAD PERTENECE A UNA SOLA BASE, Y ESO TIENE UNA CONSECUENCIA
 * ============================================================================
 *
 * `oportunidades.importacion_id` es una sola columna. No es una decisión de
 * ahora: así entró el día que se registraron las importaciones, y es lo que
 * permite que la pregunta «¿de qué carga vino este lead?» tenga una respuesta
 * y no una lista.
 *
 * La consecuencia es que meter en una base nueva un lead que ya estaba en otra
 * lo SACA de aquélla. No hay forma de que esté en las dos, y la pantalla de
 * Bases mostraría a la vieja con menos filas de las que dice haber cargado.
 *
 * Por eso esto cuenta cuántos venían de otra base y lo devuelve. Quien aprieta
 * el botón lo ve antes —la ventana lo avisa— y lo vuelve a ver después, con el
 * número real. Hacerlo en silencio sería vaciar una base sin que nadie se
 * entere.
 *
 * ============================================================================
 * POR QUÉ NO SE TOCA `filas`
 * ============================================================================
 *
 * Se escribe una vez, al crear, y no se vuelve a tocar. `filas` es «cuántas
 * trajo esta carga», un dato histórico: la pantalla de Bases lo compara con
 * las que quedan vivas para poder decir «quedan 280 de 325». Mantenerlo
 * sincronizado lo convertiría en el mismo número dos veces y se perdería esa
 * comparación.
 */
export async function crearBaseConLeads(
  nombre: string,
  ids: readonly number[],
): Promise<ResultadoNuevaBase> {
  const vacio = { importacionId: null, leads: 0, movidos: 0 };

  const titulo = nombre.trim();
  if (!titulo) {
    return { ok: false, error: "Poné un nombre para la base.", ...vacio };
  }
  if (ids.length === 0) {
    return { ok: false, error: "No hay ningún lead marcado.", ...vacio };
  }

  const supabase = await getServerClient();
  if (!supabase) {
    return { ok: false, error: "Sesión no válida. Volvé a iniciar sesión.", ...vacio };
  }

  /*
   * Se leen los leads antes de escribir nada, y por dos motivos.
   *
   * El primero es contar los que venían de otra base, que es lo que después se
   * dice. El segundo es más importante: esta consulta pasa por RLS, así que
   * devuelve nada más los leads que esta persona puede ver. Si alguien manda
   * ids ajenos —la acción la puede invocar cualquiera con sesión— acá
   * desaparecen, y la base se arma con los suyos y nada más.
   */
  const { data: suyos, error: errLeer } = await supabase
    .from("oportunidades")
    .select("id, importacion_id")
    .in("id", [...ids]);

  if (errLeer) return { ok: false, error: errLeer.message, ...vacio };

  const visibles = (suyos ?? []) as { id: number; importacion_id: number | null }[];
  if (visibles.length === 0) {
    return { ok: false, error: "Ninguno de esos leads está disponible.", ...vacio };
  }

  const movidos = visibles.filter((o) => o.importacion_id != null).length;

  const { data: base, error: errBase } = await supabase
    .from("importaciones")
    .insert({ archivo: titulo, filas: visibles.length })
    .select("id")
    .single();

  if (errBase) {
    // PGRST205: la tabla no existe todavía.
    if (errBase.code === "PGRST205") {
      return {
        ok: false,
        error:
          "Falta correr la migración 20260731120000_bases_importadas.sql en Supabase.",
        ...vacio,
      };
    }
    return { ok: false, error: errBase.message, ...vacio };
  }

  const importacionId = Number((base as { id: number }).id);

  const { error: errMarcar } = await supabase
    .from("oportunidades")
    .update({ importacion_id: importacionId })
    .in(
      "id",
      visibles.map((o) => o.id),
    );

  if (errMarcar) {
    /*
     * Si los leads no se pudieron marcar, la base se deshace.
     *
     * Dejarla sería peor que no crearla: la pantalla de Bases la mostraría
     * diciendo que cargó N filas y sin ninguna, y nadie podría distinguirla de
     * una base cuyos leads alguien borró después.
     */
    await supabase.from("importaciones").delete().eq("id", importacionId);
    return { ok: false, error: errMarcar.message, ...vacio };
  }

  revalidatePath("/");
  return {
    ok: true,
    error: null,
    importacionId,
    leads: visibles.length,
    movidos,
  };
}
