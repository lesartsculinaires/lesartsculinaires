import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Buscar una solicitud de eliminación por su código.
 *
 * ============================================================================
 * ESTO LO CONSULTA CUALQUIERA, SIN SESIÓN
 * ============================================================================
 *
 * La página de estado es pública: la abre quien pidió el borrado, con el código
 * que le dio Facebook, y es lo que Meta entra a mirar durante la revisión. Así
 * que todo acá está escrito pensando en que del otro lado puede haber cualquiera.
 *
 * De ahí las tres reglas:
 *
 *   SÓLO POR CÓDIGO EXACTO   Nunca se lista, nunca se busca por identificador,
 *                            nunca se devuelve más de una fila. Lo único que se
 *                            puede preguntar es «¿cómo va ESTE pedido?».
 *
 *   EL IDENTIFICADOR NO      `identificador` guarda el IGSID de esa persona y no
 *   SALE DE LA BASE          se selecciona. No alcanza con no mostrarlo: si
 *                            viaja hasta el servidor de la página, basta un
 *                            descuido para publicarlo.
 *
 *   EL FORMATO SE COMPRUEBA  Un código que no tiene la forma de un código no
 *   ANTES DE CONSULTAR       llega a la base. No es por rendimiento: es para que
 *                            nadie pueda usar esta puerta pública para tantear
 *                            la base con lo que se le ocurra.
 */

/**
 * Cómo es un código: dieciséis hexadecimales en mayúscula.
 *
 * Son los que genera el callback —ocho bytes al azar—. Dieciséis dan 2^64
 * posibilidades: no se adivina probando, que es lo único que alguien podría
 * intentar contra una página sin sesión.
 */
const FORMATO = /^[0-9A-F]{16}$/;

/** Cuántos bytes hay que sortear para que salgan esos dieciséis caracteres. */
export const BYTES_DEL_CODIGO = 8;

export const esCodigoValido = (codigo: string): boolean => FORMATO.test(codigo);

/**
 * El estado del pedido, con las claves que usa la página.
 *
 * `sin_datos` se dice `completed` a propósito, y no es sólo por simplificar:
 * distinguirlo confirmaría si esa persona habló alguna vez con la escuela, que
 * es un dato suyo y no hace falta para contestar lo que vino a preguntar. Para
 * quien consulta el resultado es el mismo: no conservamos nada suyo.
 */
const COMO_SE_DICE: Record<string, string> = {
  pendiente: "pending",
  completada: "completed",
  parcial: "partial",
  sin_datos: "completed",
};

export interface SolicitudPublica {
  status: string;
  requested_at: string | null;
  completed_at: string | null;
  /**
   * Las notas internas.
   *
   * Viajan porque la forma del objeto las incluye y sirven para diagnosticar,
   * pero LA PÁGINA NO LAS DIBUJA: dicen cosas como «queda la ficha 482 por
   * decidir», que es un número de nuestro sistema y no un dato de quien
   * consulta. Lo que se le muestra es el estado dicho en palabras.
   */
  notes: string | null;
}

const texto = (v: unknown): string | null => {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? null : s;
};

/**
 * La solicitud con ese código, o null.
 *
 * Null significa lo mismo en todos los casos —no existe, el código está mal
 * escrito, la consulta falló— y es a propósito: la página dice «no encontramos
 * esa solicitud» y no hay forma de distinguir desde afuera cuál de los tres
 * fue. Contestar distinto a «no existe» y a «está mal escrito» es lo que
 * convierte una página de consulta en una herramienta para tantear.
 */
export async function buscarSolicitud(
  admin: SupabaseClient,
  codigo: string,
): Promise<SolicitudPublica | null> {
  if (!esCodigoValido(codigo)) return null;

  try {
    const { data, error } = await admin
      .from("solicitudes_eliminacion")
      .select("estado, solicitado_en, completada_en, notas")
      .eq("codigo_confirmacion", codigo)
      .maybeSingle();

    if (error || !data) return null;

    const fila = data as Record<string, unknown>;
    const estado = String(fila.estado ?? "pendiente");

    return {
      status: COMO_SE_DICE[estado] ?? "pending",
      requested_at: texto(fila.solicitado_en),
      completed_at: texto(fila.completada_en),
      notes: texto(fila.notas),
    };
  } catch {
    return null;
  }
}
