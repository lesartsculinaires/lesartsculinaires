import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fechaLarga } from "@/lib/format";
import {
  detalleDe,
  detectarSeguimiento,
  hoyEnSalvador,
  loQueSeEntendio,
} from "@/lib/seguimientos";

/**
 * Si una nota pedía un recordatorio, dejarlo anotado.
 *
 * ------------------------------------------------------------------------
 * POR QUÉ VIVE ACÁ Y NO DENTRO DE UNA ACCIÓN
 * ------------------------------------------------------------------------
 *
 * Porque ahora hay dos puertas por las que entra una nota: la ficha del
 * cliente y la nota interna de la bandeja. Las dos tienen que hacer lo mismo,
 * y una copia en cada lado se desincroniza sola: se agrega una palabra nueva
 * en una y la otra se queda vieja sin que nadie lo note.
 *
 * ------------------------------------------------------------------------
 * POR QUÉ NO ES UN TRIGGER DE LA BASE
 * ------------------------------------------------------------------------
 *
 * Leer «el 15 de cada mes», «pasado mañana» o «recuperación» es trabajo de
 * texto en español, con tildes, plurales y meses cortos. Eso se escribe y se
 * prueba mucho mejor en TypeScript. La lógica entera vive en
 * `@/lib/seguimientos`, probada línea por línea; acá queda nada más el viaje a
 * la base.
 *
 * ------------------------------------------------------------------------
 * SI FALLA, NO SE CAE LA NOTA
 * ------------------------------------------------------------------------
 *
 * La nota es lo que la persona vino a hacer y ya está guardada cuando esto
 * corre. Perderla porque el recordatorio no se pudo crear sería cambiar un
 * problema chico por uno grande. Pero tampoco se calla: se devuelve la frase
 * para que quien escribió se entere hoy y no el día que el cliente no recibió
 * la llamada.
 *
 * Devuelve qué se entendió —«Recuperación anotada: llamalo el 3 de
 * septiembre»— o nulo cuando la nota no pedía nada, que es el caso de la
 * enorme mayoría.
 */
export async function anotarSeguimientoDeNota(
  supabase: SupabaseClient,
  oportunidadId: number,
  texto: string,
  notaId: number | null,
  autorId: string | null,
): Promise<string | null> {
  const visto = detectarSeguimiento(texto, hoyEnSalvador());
  if (!visto) return null;

  const mensual = visto.cuando?.clase === "mensual" ? visto.cuando : null;

  const { error } = await supabase.from("seguimientos").insert({
    oportunidad_id: oportunidadId,
    nota_id: notaId,
    tipo: visto.tipo,
    detalle: detalleDe(texto),
    proxima: visto.proxima,
    dia_del_mes: mensual?.dia ?? null,
    dia_hasta: mensual?.hasta ?? null,
    creado_por: autorId,
  });

  if (error) {
    /*
     * Un tipo que la base todavía no acepta se explica con su archivo.
     *
     * Pasa mientras el código está desplegado y el SQL no: la nota dice
     * «recuperación», la aplicación lo entiende, y la restricción de la tabla
     * lo rechaza. Sin este mensaje, el asesor vería un error de base de datos
     * en crudo y no sabría que sólo falta correr una migración.
     */
    if (error.code === "23514" || /violates check constraint/i.test(error.message ?? "")) {
      return (
        "La nota quedó guardada, pero el recordatorio no: falta correr la migración " +
        "20261006120000_seguimiento_recuperacion.sql en Supabase."
      );
    }

    return error.code === "PGRST205" || error.code === "42P01" || !error.message
      ? "La nota quedó guardada, pero el recordatorio no: falta correr la migración 20260911120000_seguimientos.sql."
      : "La nota quedó guardada, pero el recordatorio no se pudo crear: " + error.message;
  }

  return loQueSeEntendio(visto, fechaLarga);
}
