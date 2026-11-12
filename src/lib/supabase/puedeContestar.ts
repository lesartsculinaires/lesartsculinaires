import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ¿Quien pide puede escribirle a un cliente? (12/11/2026)
 *
 * No, si su rol tiene «solo sus envíos» (en HC, «Asesores»): arma envíos
 * masivos, pero los chats los atienden las asesoras de ventas. Ver la
 * migración 20261203120000_solo_sus_envios. Las notas internas sí.
 *
 * Se pregunta en cada acción que le escribe al cliente: los envíos masivos
 * guardan sus mensajes igual que una respuesta, así que la base no puede
 * distinguirlos y el freno tiene que estar acá. Sin la migración, contesta
 * que sí, como siempre.
 */
export const NO_CONTESTA =
  "Tu rol no contesta chats: los atienden las asesoras de ventas. Puedes dejar una nota interna para el equipo.";

export async function puedeContestar(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc("puede_contestar");
  if (error) return true;
  return data !== false;
}
