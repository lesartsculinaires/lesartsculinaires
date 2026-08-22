"use server";

import { revalidatePath } from "next/cache";

import { hoyEnSalvador, siguienteMes, sumarDias } from "@/lib/seguimientos";
import { getServerClient } from "@/lib/supabase/server";

/**
 * Lo que se puede hacer con un seguimiento ya anotado.
 *
 * Son tres cosas y ninguna más: darlo por atendido, correrlo unos días y
 * borrarlo. Editarlo a mano no está —para eso se escribe otra nota, que además
 * deja dicho por qué cambió— y esa es la razón de que la bitácora siga siendo
 * la única fuente de lo que se acordó con el cliente.
 */

export interface ResultadoSeguimiento {
  ok: boolean;
  error: string | null;
  /** La tabla no existe: falta correr la migración. */
  faltaMigracion: boolean;
}

const bien: ResultadoSeguimiento = { ok: true, error: null, faltaMigracion: false };

const ARCHIVO = "20260911120000_seguimientos.sql";

/**
 * El error, dicho de manera que se pueda hacer algo con él.
 *
 * PostgREST contesta con el cuerpo vacío cuando la tabla no existe, así que un
 * mensaje en blanco significa eso y no «salió todo bien». Sin esta traducción
 * el botón no haría nada y no habría forma de saber por qué.
 */
function explicar(codigo?: string, mensaje?: string): ResultadoSeguimiento {
  if (codigo === "42P01" || codigo === "PGRST205" || !mensaje) {
    return {
      ok: false,
      faltaMigracion: true,
      error: `Falta correr la migración ${ARCHIVO} en Supabase.`,
    };
  }
  return { ok: false, faltaMigracion: false, error: mensaje };
}

const sinSesion: ResultadoSeguimiento = {
  ok: false,
  error: "Sesión vencida. Volvé a entrar.",
  faltaMigracion: false,
};

/**
 * «Ya lo llamé».
 *
 * Uno de una sola vez se cierra. Uno mensual no: salta al mes que viene, que
 * es justamente lo que el cliente pidió cuando dijo «llamame todos los 15».
 * Cerrarlo obligaría al asesor a volver a escribir la nota cada mes, y esa es
 * la tarea que esto vino a sacar del medio.
 *
 * El salto se cuenta desde la fecha que tenía, no desde hoy: si el del 15 se
 * atiende recién el 19, el siguiente sigue siendo el 15 y no el 19.
 */
export async function marcarSeguimientoHecho(id: number): Promise<ResultadoSeguimiento> {
  const supabase = await getServerClient();
  if (!supabase) return sinSesion;

  const { data, error: leyendo } = await supabase
    .from("seguimientos")
    .select("proxima, dia_del_mes")
    .eq("id", id)
    .maybeSingle();

  if (leyendo) return explicar(leyendo.code, leyendo.message);
  if (!data) return { ok: false, error: "Ese recordatorio ya no está.", faltaMigracion: false };

  const dia = data.dia_del_mes == null ? null : Number(data.dia_del_mes);

  const { error } = await supabase
    .from("seguimientos")
    .update(
      dia == null
        ? { hecho_en: new Date().toISOString() }
        : { proxima: siguienteMes(dia, String(data.proxima)) },
    )
    .eq("id", id);

  if (error) return explicar(error.code, error.message);

  revalidatePath("/");
  return bien;
}

/** Cuántos días como máximo se puede correr uno. Más que eso es borrarlo. */
const TOPE_DIAS = 60;

/**
 * Correrlo unos días.
 *
 * A diferencia de las reservas —donde posponer es por persona, porque el aviso
 * lo miran el asesor y la gerencia a la vez— acá se mueve la fecha de verdad.
 * Es lo correcto: un seguimiento es un compromiso con el cliente, y si se
 * corrió al jueves, se corrió al jueves para todo el mundo.
 */
export async function posponerSeguimiento(
  id: number,
  dias: number,
): Promise<ResultadoSeguimiento> {
  const supabase = await getServerClient();
  if (!supabase) return sinSesion;

  // El número viene del navegador, así que se acota acá.
  const cuantos = Math.min(Math.max(Math.round(dias), 1), TOPE_DIAS);

  // Desde hoy y no desde la fecha que tenía: «recordámelo en tres días» dicho
  // sobre uno vencido hace un mes significa tres días desde ahora.
  const { error } = await supabase
    .from("seguimientos")
    .update({ proxima: sumarDias(hoyEnSalvador(), cuantos) })
    .eq("id", id);

  if (error) return explicar(error.code, error.message);

  revalidatePath("/");
  return bien;
}

/**
 * Borrarlo.
 *
 * Existe por una razón concreta: el CRM lee la nota solo, y a veces va a leer
 * mal. Sin manera de sacar el que salió torcido, la lista se llena de fechas
 * equivocadas y deja de mirarse. La nota queda igual donde estaba.
 */
export async function borrarSeguimiento(id: number): Promise<ResultadoSeguimiento> {
  const supabase = await getServerClient();
  if (!supabase) return sinSesion;

  const { error } = await supabase.from("seguimientos").delete().eq("id", id);
  if (error) return explicar(error.code, error.message);

  revalidatePath("/");
  return bien;
}
