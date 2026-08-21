"use server";

import { revalidatePath } from "next/cache";

import { getServerClient, getUser } from "@/lib/supabase/server";

/**
 * Posponer un recordatorio de reserva.
 *
 * Es por persona: la fila lleva quién pospuso. Dos asesores pueden estar
 * mirando la misma ficha —uno la atiende, la gerencia la supervisa— y que uno
 * diga «más tarde» no tiene por qué callarle el aviso al otro.
 */

export interface Resultado {
  ok: boolean;
  error: string | null;
  /** La tabla no existe: falta correr la migración. */
  faltaMigracion: boolean;
}

const FALTA = "42P01"; // relation does not exist

/**
 * El error, dicho de manera que se pueda hacer algo con él.
 *
 * PostgREST contesta con el cuerpo vacío cuando la tabla no existe, así que un
 * mensaje en blanco significa exactamente eso y no «salió todo bien». Sin esta
 * traducción el botón no haría nada y no habría forma de saber por qué.
 */
function explicar(codigo: string | undefined, mensaje: string | undefined): Resultado {
  if (codigo === FALTA || !mensaje) {
    return {
      ok: false,
      faltaMigracion: true,
      error:
        "Falta correr la migración 20260905120000_recordatorio_reserva.sql en Supabase.",
    };
  }
  return { ok: false, faltaMigracion: false, error: mensaje };
}

/** Cuántos días como máximo se puede posponer. Más que eso es archivarlo. */
const TOPE_DIAS = 30;

export async function posponerRecordatorio(
  oportunidadId: number,
  dias: number,
): Promise<Resultado> {
  const supabase = await getServerClient();
  const user = await getUser();
  if (!supabase || !user) {
    return { ok: false, error: "Sesión vencida. Volvé a entrar.", faltaMigracion: false };
  }

  // El número viene del navegador, así que se acota acá. Un «posponer 90000
  // días» silenciaría el aviso para siempre sin que nadie lo haya decidido.
  const cuantos = Math.min(Math.max(Math.round(dias), 1), TOPE_DIAS);
  const hasta = new Date();
  hasta.setDate(hasta.getDate() + cuantos);

  const { error } = await supabase.from("recordatorios_pospuestos").upsert(
    {
      oportunidad_id: oportunidadId,
      usuario_id: user.id,
      hasta: hasta.toISOString(),
    },
    { onConflict: "oportunidad_id,usuario_id" },
  );

  if (error) return explicar(error.code, error.message);

  revalidatePath("/");
  return { ok: true, error: null, faltaMigracion: false };
}

/** Volver a ver un aviso que se había pospuesto. */
export async function retomarRecordatorio(oportunidadId: number): Promise<Resultado> {
  const supabase = await getServerClient();
  const user = await getUser();
  if (!supabase || !user) {
    return { ok: false, error: "Sesión vencida. Volvé a entrar.", faltaMigracion: false };
  }

  const { error } = await supabase
    .from("recordatorios_pospuestos")
    .delete()
    .eq("oportunidad_id", oportunidadId)
    .eq("usuario_id", user.id);

  if (error) return explicar(error.code, error.message);

  revalidatePath("/");
  return { ok: true, error: null, faltaMigracion: false };
}
