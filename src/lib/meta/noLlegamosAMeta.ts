/**
 * Cuando la llamada a Meta no llega a hacerse, dicho para quien lo lee.
 *
 * ============================================================================
 * LO QUE APARECÍA EN LA PANTALLA
 * ============================================================================
 *
 *     Mandar
 *     fetch failed
 *
 * Dos palabras en inglés debajo del botón, que es lo que Node escribe cuando no
 * puede abrir la conexión. Para quien está escribiéndole a un cliente eso no es
 * un mensaje: no dice quién falló, ni si el mensaje salió, ni qué hacer.
 *
 * Y la pregunta que deja sin contestar es la peor de todas: ¿llegó o no llegó?
 * Si no se sabe, lo que hace cualquiera es mandarlo de nuevo, y ahí el cliente
 * recibe el mismo mensaje dos veces. Por eso lo primero que se dice es que NO
 * salió.
 *
 * ============================================================================
 * NO ES LO MISMO QUE UN ERROR DE META
 * ============================================================================
 *
 * Un error de Meta —token vencido, plantilla pausada, número sin WhatsApp— lo
 * traduce `explicar`, y ésos llegaron hasta Meta y volvieron con una respuesta.
 * Esto es lo otro: la petición no llegó a salir de nuestro servidor, o salió y
 * nadie contestó. Son distintos y se arreglan distinto, así que se dicen
 * distinto.
 */

/** Los fallos de red, tal como los nombra Node. */
const ES_DE_RED =
  /fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|network|socket hang up|terminated/i;

/** Lo que se escribe cuando la llamada se abandonó por tiempo. */
const ES_TIEMPO = /abort|timeout|timed out/i;

/**
 * Qué decir cuando la llamada a Meta ni siquiera obtuvo respuesta.
 *
 * `canal` sale en el texto porque la misma pantalla maneja los tres y «no se
 * pudo hablar con Meta» no dice si lo que falló fue WhatsApp o Instagram.
 *
 * Lo que no se reconoce se muestra agregado al final, entre paréntesis: puede
 * no significar nada para quien lo lee, pero es lo que hace que un caso raro se
 * pueda diagnosticar sin volver a reproducirlo.
 */
export function noLlegamosAMeta(e: unknown, canal = "WhatsApp"): string {
  const crudo = e instanceof Error ? e.message : String(e ?? "");

  if (ES_TIEMPO.test(crudo)) {
    return (
      `${canal} tardó demasiado en contestar y el mensaje NO salió. ` +
      "Probá de nuevo en un momento; si sigue igual, puede ser una caída de Meta."
    );
  }

  if (crudo === "" || ES_DE_RED.test(crudo)) {
    return (
      `No se pudo conectar con ${canal} y el mensaje NO salió. ` +
      "Suele ser una caída de Meta o de internet, y se arregla volviendo a intentar. " +
      "Si pasa con todos los mensajes y dura, avisá: puede faltar configuración en el servidor."
    );
  }

  return `No se pudo mandar por ${canal} y el mensaje NO salió (${crudo}).`;
}
