/**
 * Los errores de Supabase, dichos de una forma que sirva.
 *
 * ============================================================================
 * POR QUÉ EXISTE ESTO
 * ============================================================================
 *
 * Porque el CRM lo usan asesoras de ventas, no gente que administra bases de
 * datos. «JWT issued at future» en una barra amarilla no le dice a nadie qué
 * pasó, si perdió algo, ni qué hacer. Deja a la persona mirando una pantalla
 * con cero leads y pensando que se borraron.
 *
 * Y el costo de eso no es el susto: es la llamada a dirección, el rato que se
 * pierde revisando, y la desconfianza que queda después aunque haya sido un
 * segundo de desfase entre dos relojes.
 *
 * La regla es la de siempre: decir qué pasó, si hay algo perdido, y qué hacer.
 * Cuando no se reconoce el error se devuelve tal cual —inventar una
 * explicación amable sería peor que el texto en inglés—.
 */

/** Un error traducido, con lo que corresponde hacer. */
export interface Explicado {
  texto: string;
  /** ¿Se arregla solo volviendo a intentar? Decide si se ofrece reintentar. */
  reintentable: boolean;
}

export function enCastellano(error: string | null): Explicado | null {
  if (!error) return null;
  const e = error.toLowerCase();

  /*
   * El reloj desfasado.
   *
   * Cada token lleva la hora en que se emitió, y quien lo recibe comprueba que
   * no sea futura. Cuando el reloj del que comprueba va unos segundos
   * atrasado, rechaza un token que es perfectamente válido.
   *
   * Se reintenta solo antes de llegar acá —ver `server.ts`—, así que si el
   * aviso aparece es porque el desfase duró más que los reintentos. Igual se
   * arregla solo: lo que hay que hacer es volver a cargar.
   */
  if (/issued at future|jwtissuedatfuture|not yet valid/.test(e)) {
    return {
      texto:
        "Los relojes de Supabase se desfasaron unos segundos y rechazaron la " +
        "consulta. No se perdió nada y no hay nada mal configurado: esperá un " +
        "momento y apretá Actualizar.",
      reintentable: true,
    };
  }

  // La sesión venció de verdad. Reintentar no sirve: hay que entrar de nuevo.
  if (/jwt expired|token is expired|invalid jwt|jwsinvalidsignature/.test(e)) {
    return {
      texto: "La sesión venció. Cerrá sesión y volvé a entrar.",
      reintentable: false,
    };
  }

  // Falta correr una migración: la tabla o la columna todavía no existen.
  if (/pgrst205|does not exist|could not find the (table|column)/.test(e)) {
    return {
      texto:
        "La base todavía no tiene algo que esta pantalla necesita. Falta correr " +
        "una migración pendiente en Supabase.",
      reintentable: false,
    };
  }

  // Supabase no contestó. Pasa con el proyecto pausado o un corte de red.
  if (/fetch failed|network|econnrefused|timeout|etimedout/.test(e)) {
    return {
      texto:
        "No se pudo hablar con la base. Puede ser un corte momentáneo: " +
        "esperá un momento y apretá Actualizar.",
      reintentable: true,
    };
  }

  return { texto: error, reintentable: true };
}
