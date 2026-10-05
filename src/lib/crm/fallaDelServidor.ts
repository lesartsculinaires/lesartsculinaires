/**
 * Cuando una llamada al servidor no contesta lo que tenía que contestar.
 *
 * ============================================================================
 * LO QUE VEÍA EL EQUIPO DE VENTAS
 * ============================================================================
 *
 *     No se pudo guardar el último cambio: An unexpected response was received
 *     from the server.. Lo que ves sigue actualizado, pero todavía no está
 *     guardado.
 *
 * En inglés, con dos puntos seguidos, y sin decir qué hacer. Esa frase la
 * escribe Next cuando una acción del servidor devuelve algo que el navegador no
 * puede interpretar, y en la práctica son dos situaciones:
 *
 *   SE DESPLEGÓ UNA VERSIÓN   La pestaña quedó abierta con la compilación
 *   NUEVA                     anterior. Las acciones del servidor se nombran
 *                             con un identificador que cambia en cada
 *                             despliegue, así que las de esa pestaña ya no
 *                             existen del otro lado.
 *
 *   SE VENCIÓ LA SESIÓN       El middleware manda la petición al login, y una
 *                             pantalla de login no es una respuesta válida para
 *                             una acción.
 *
 * Las dos se arreglan igual —recargando— y ninguna de las dos significa que lo
 * que se hizo se haya perdido. Decir eso es lo único que esa frase tenía que
 * hacer y no hacía.
 */

/** Lo que hay que decirle a quien está trabajando, y si conviene recargar. */
export interface FallaDelServidor {
  dice: string;
  /** Recargar la página lo arregla. La pantalla puede ofrecer el botón. */
  recargar: boolean;
}

/** El texto de lo que haya venido, sea Error o cualquier otra cosa. */
const texto = (e: unknown): string => (e instanceof Error ? e.message : String(e ?? ""));

/**
 * Reconocer la familia por el texto y no por el tipo.
 *
 * Lo que llega acá es la frase de Next, que no trae código ni clase propia. Se
 * comparan trozos que sólo aparecen en esos mensajes; lo que no se reconoce se
 * devuelve tal cual, porque inventarle una explicación a algo que no se entendió
 * manda a buscar el problema donde no está.
 */
export function porQueFalloElServidor(e: unknown): FallaDelServidor {
  const dice = texto(e);

  if (/unexpected response was received|Failed to find Server Action|Connection closed/i.test(dice)) {
    return {
      dice:
        "El CRM se actualizó —o venció la sesión— mientras tenías esta pestaña abierta, " +
        "así que el servidor ya no entiende lo que le pide esta pantalla. Recargá y seguí: " +
        "no se perdió nada.",
      recargar: true,
    };
  }

  if (/Failed to fetch|NetworkError|Load failed|network error|ERR_INTERNET/i.test(dice)) {
    return {
      dice: "Se cortó la conexión con el servidor. Esperá un momento y volvé a intentar.",
      recargar: false,
    };
  }

  return { dice, recargar: false };
}
