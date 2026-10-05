import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Alguien quitó la aplicación desde su configuración de Facebook.
 *
 * ============================================================================
 * QUÉ SIGNIFICA ESTO, Y QUÉ NO
 * ============================================================================
 *
 * Significa «dejá de usar mi token». NO significa «borrá mis datos» —eso es el
 * otro aviso de Meta, el de eliminación, que tiene su propia tabla y su propio
 * código de confirmación—.
 *
 * Por eso acá no se borra ni un mensaje ni una conversación. Confundir los dos
 * avisos sería destruir el historial de la escuela por un pedido que no lo
 * pidió, y encima sin forma de deshacerlo.
 *
 * ============================================================================
 * EL IDENTIFICADOR PUEDE SER DOS COSAS DISTINTAS
 * ============================================================================
 *
 * Y no vienen marcadas, así que se prueban las dos:
 *
 *   ES EL NEGOCIO       La escuela —u otra cuenta conectada desde la pantalla
 *                       de Canales— desconectó la aplicación. Lo que hay que
 *                       hacer es dejar de usar ese token: se apaga la
 *                       credencial y se vacía, porque un token que ya no se
 *                       puede usar no tiene por qué seguir guardado.
 *
 *   ES UNA PERSONA      Alguien que escribió por Instagram quitó la aplicación.
 *                       Se cierra su conversación y se apaga el agente, que es
 *                       lo único que podría volver a escribirle solo.
 *
 * Las dos se intentan siempre y cada una informa cuántas filas tocó. Adivinar
 * cuál es por la forma del identificador sería frágil —los dos son números
 * largos— y equivocarse dejaría el pedido sin atender sin que nadie se entere.
 */

export interface LoRevocado {
  /** Credenciales de negocio apagadas. */
  credenciales: number;
  /** Conversaciones de personas cerradas. */
  conversaciones: number;
  /** Lo que no se pudo hacer, para que el llamador lo registre. */
  problemas: string[];
}

/**
 * Apaga lo que corresponda para este identificador de Instagram.
 *
 * Nunca lanza: Meta reintenta cuando recibe un error y, si insiste, desactiva
 * el aviso. Perder la integración entera porque una de las dos consultas falló
 * sería cambiar un problema chico por uno grande. Lo que salió mal viaja en
 * `problemas` y el llamador lo deja en el registro.
 */
export async function revocarCuentaDeInstagram(
  admin: SupabaseClient,
  instagramUserId: string,
): Promise<LoRevocado> {
  const quien = String(instagramUserId ?? "").trim();
  if (quien === "") {
    return { credenciales: 0, conversaciones: 0, problemas: ["llegó sin identificador"] };
  }

  const problemas: string[] = [];

  /*
   * 1. El negocio que desconectó la aplicación.
   *
   * `access_token` se vacía además de apagar la fila. Apagarla sola dejaría el
   * token guardado para siempre: ya no sirve —Meta lo invalida al desautorizar—
   * y seguir almacenando una credencial muerta es guardar un riesgo sin ninguna
   * contrapartida. La fila se conserva para que quede el registro de que esa
   * cuenta estuvo conectada.
   *
   * `.select("id")` es lo que hace que se pueda contar: sin él, un `update` de
   * supabase-js no devuelve las filas y no habría forma de saber si tocó algo.
   */
  let credenciales = 0;
  try {
    const { data, error } = await admin
      .from("canal_credenciales")
      .update({ activo: false, access_token: "", actualizado_en: new Date().toISOString() })
      .eq("ig_business_account_id", quien)
      .select("id");

    if (error) problemas.push(`canal_credenciales: ${error.message}`);
    else credenciales = (data ?? []).length;
  } catch (e) {
    problemas.push(`canal_credenciales: ${e instanceof Error ? e.message : String(e)}`);
  }

  /*
   * 2. La persona que escribió por Instagram.
   *
   * `agente_activo` en falso es la parte que de verdad cambia algo: es lo único
   * que podría volver a escribirle por su cuenta a alguien que acaba de pedir
   * que lo dejen en paz.
   *
   * Se filtra por canal además de por identificador. Un identificador de
   * Instagram no significa nada en otro canal, pero el mismo número podría
   * existir como teléfono o como PSID, y cerrar la conversación equivocada le
   * pasa el problema a otra persona.
   */
  let conversaciones = 0;
  try {
    const { data, error } = await admin
      .from("conversaciones")
      .update({ estado: "cerrada", agente_activo: false })
      .eq("canal", "instagram")
      .eq("identificador", quien)
      .select("id");

    if (error) problemas.push(`conversaciones: ${error.message}`);
    else conversaciones = (data ?? []).length;
  } catch (e) {
    problemas.push(`conversaciones: ${e instanceof Error ? e.message : String(e)}`);
  }

  /*
   * 3. Queda anotado en Actividad.
   *
   * `actor_id` va nulo a propósito, y no es un descuido: la tabla lo dice en su
   * propio esquema —«nulo cuando escribió una integración con la llave de
   * servicio»—. Acá no hubo una persona del equipo; hubo un aviso de Meta.
   *
   * Se anota SIEMPRE, incluso cuando no se tocó ninguna fila. Un desautorizar
   * que no encontró nada es justamente lo que uno quiere poder ver después: o
   * llegó un identificador que no conocemos, o ya se había atendido.
   */
  try {
    const { error } = await admin.from("actividad").insert({
      entidad: "canal",
      accion: "desautorizo",
      campos: {
        canal: "instagram",
        identificador: quien,
        credenciales_apagadas: credenciales,
        conversaciones_cerradas: conversaciones,
        ...(problemas.length > 0 ? { problemas } : {}),
      },
      actor_id: null,
    });
    if (error) problemas.push(`actividad: ${error.message}`);
  } catch (e) {
    problemas.push(`actividad: ${e instanceof Error ? e.message : String(e)}`);
  }

  return { credenciales, conversaciones, problemas };
}
