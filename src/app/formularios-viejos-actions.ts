"use server";

import { revalidatePath } from "next/cache";

import { completarConFormulario } from "@/lib/crm/completarConFormulario";
import { leerFormulario } from "@/lib/crm/formularioDeAnuncio";
import { getAdminClient } from "@/lib/supabase/admin";
import { getServerClient, getUser } from "@/lib/supabase/server";

/**
 * Completar las fichas de los leads de pauta que entraron antes del arreglo.
 *
 * ============================================================================
 * POR QUÉ UN BOTÓN Y NO UN SQL
 * ============================================================================
 *
 * Se intentó tres veces con un archivo para pegar en el editor SQL del panel y
 * lo rechazó las tres, cortando el texto en lugares distintos —con funciones,
 * con bloques etiquetados y con tablas temporales—. Ninguna versión tenía un
 * problema de Postgres: las tres corrían bien con psql. El que decide es ese
 * editor, y no sigue ni los bloques ni las sentencias.
 *
 * Pero el motivo de fondo para hacerlo acá es mejor que ése, y era cierto
 * desde el principio:
 *
 *   ES EL MISMO CÓDIGO       Esto llama a `completarConFormulario`, la misma
 *                            función que corre cuando entra un mensaje nuevo.
 *                            No hay una segunda implementación de las reglas,
 *                            así que no hay nada que se pueda desincronizar.
 *
 *   NO HACE FALTA NINGUNA    Ni la llave de servicio en manos de nadie, ni
 *   CREDENCIAL               pegar un archivo largo en ningún lado.
 *
 * ============================================================================
 * SÓLO DIRECCIÓN
 * ============================================================================
 *
 * Toca fichas de todo el equipo de una sola vez. No es destructivo —sólo
 * rellena huecos— pero sigue siendo una acción sobre datos de otros, y esas
 * son de dirección, igual que editar programas.
 */

export interface ResultadoViejos {
  ok: boolean;
  /** Cuántas conversaciones con formulario se miraron en esta tanda. */
  revisadas: number;
  /** En cuántas se llenó al menos un campo. */
  completadas: number;
  /** Cuántas quedan para la próxima vez. */
  quedan: number;
  error: string | null;
}

const NADA: Omit<ResultadoViejos, "ok" | "error"> = {
  revisadas: 0,
  completadas: 0,
  quedan: 0,
};

/**
 * Cuántas conversaciones se procesan por vez.
 *
 * Cada una son tres o cuatro consultas, y esto corre dentro de una petición
 * web que tiene diez segundos para contestar. Con toda la historia de una vez
 * se pasaría del tiempo y no terminaría ninguna. Se hace una tanda, se ve el
 * resultado, y si quedan se vuelve a apretar —es el mismo trato que el botón
 * de los nombres de Meta—.
 */
const POR_TANDA = 25;

/**
 * Cuántos mensajes se leen para buscar formularios.
 *
 * Es un techo de seguridad, no un filtro: la consulta ya pide sólo los
 * entrantes que tienen dos puntos, que es lo mínimo que puede tener un
 * formulario. Sin tope, una bandeja de años se traería entera a la memoria del
 * servidor para descartar casi todo.
 */
const MENSAJES_A_MIRAR = 4000;

export async function completarFichasDePauta(): Promise<ResultadoViejos> {
  const supabase = await getServerClient();
  const usuario = await getUser();
  if (!supabase || !usuario) {
    return { ok: false, ...NADA, error: "Sesión no válida." };
  }

  const { data: esAdmin } = await supabase.rpc("es_admin");
  if (!esAdmin) {
    return { ok: false, ...NADA, error: "Sólo dirección puede completar fichas en lote." };
  }

  /*
   * Se escribe con la llave de servicio, igual que el webhook.
   *
   * Es exactamente el mismo trabajo que hace el webhook cuando entra un
   * formulario, sólo que disparado a mano y sobre lo que ya pasó. Hacerlo con
   * la sesión de quien aprieta obligaría a abrir la escritura sobre fichas de
   * otros para un caso que no es «esta persona edita su dato».
   */
  const admin = getAdminClient();
  if (!admin) {
    return { ok: false, ...NADA, error: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor." };
  }

  try {
    /*
     * Los mensajes entrantes que PODRÍAN ser un formulario.
     *
     * El filtro de la base es a propósito grueso —tiene dos puntos— porque
     * quien decide de verdad es `leerFormulario`, que es el mismo lector que
     * usa el webhook. Un filtro fino acá sería una tercera copia de las reglas.
     *
     * Del más viejo al más nuevo: si alguien completó la pauta dos veces, vale
     * el primero, que es el que la ficha habría tomado cuando entró.
     */
    const { data: mensajes, error } = await admin
      .from("mensajes")
      .select("conversacion_id, texto, creado_en")
      .eq("direccion", "entrante")
      .not("texto", "is", null)
      .like("texto", "%:%")
      .order("creado_en", { ascending: true })
      .limit(MENSAJES_A_MIRAR);

    if (error) return { ok: false, ...NADA, error: error.message };

    /** El formulario más viejo de cada conversación. */
    const primeroDe = new Map<number, string>();
    for (const m of (mensajes ?? []) as unknown as Record<string, unknown>[]) {
      const id = m.conversacion_id == null ? null : Number(m.conversacion_id);
      if (id == null || primeroDe.has(id)) continue;

      const texto = m.texto == null ? null : String(m.texto);
      if (leerFormulario(texto)) primeroDe.set(id, texto as string);
    }

    const todas = [...primeroDe.entries()];
    const tanda = todas.slice(0, POR_TANDA);

    let completadas = 0;
    for (const [conversacionId, texto] of tanda) {
      const r = await completarConFormulario(admin, conversacionId, texto);
      if (r.campos.length > 0) completadas += 1;
    }

    if (completadas > 0) revalidatePath("/");

    /*
     * «Quedan» cuenta las que no entraron en esta tanda, no las que faltan por
     * completar: las de esta tanda que no cambiaron nada ya estaban al día y no
     * van a cambiar apretando de nuevo.
     */
    return {
      ok: true,
      revisadas: tanda.length,
      completadas,
      quedan: Math.max(0, todas.length - tanda.length),
      error: null,
    };
  } catch (e) {
    return {
      ok: false,
      ...NADA,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
