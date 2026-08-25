/**
 * En qué anda un mensaje que mandamos: los tildes de WhatsApp.
 *
 * ------------------------------------------------------------------------
 * POR QUÉ NO ALCANZA CON MIRAR EL TEXTO
 * ------------------------------------------------------------------------
 *
 * `mensajes.estado` guarda dos vocabularios mezclados, y no por descuido:
 *
 *   «enviado»    lo escribimos nosotros al insertar la fila, antes de que
 *                Meta diga nada.
 *   «sent», «delivered», «read», «failed»
 *                los manda Meta en sus acuses y se guardan tal cual llegan.
 *
 * Por eso en la pantalla se leía «enviado» primero y «delivered» un segundo
 * después. Traducir en el momento de guardar sería peor: perdería el valor
 * original que devolvió Meta, que es lo que sirve para entender un acuse raro.
 * Se traduce al mostrar, que es donde importa.
 *
 * ------------------------------------------------------------------------
 * QUÉ SIGNIFICA CADA TILDE
 * ------------------------------------------------------------------------
 *
 * La convención de WhatsApp, que es la que la gente ya sabe leer:
 *
 *   ✓     salió de acá, todavía no llegó al teléfono
 *   ✓✓    llegó al teléfono
 *   ✓✓    en otro color: lo abrió
 *   ✗     no se pudo entregar
 *
 * Un estado que no se reconoce no dibuja nada. Es a propósito: inventarle un
 * tilde a algo que no se entendió es peor que no mostrar nada, porque el tilde
 * se lee como una afirmación sobre un mensaje que le llegó —o no— a un cliente.
 */

export type Acuse = "enviado" | "entregado" | "leido" | "fallo";

/** Cómo se dice cada uno, para el rótulo hablado y el globito. */
export const COMO_SE_DICE: Readonly<Record<Acuse, string>> = {
  enviado: "Enviado",
  entregado: "Entregado",
  leido: "Leído",
  fallo: "No se pudo entregar",
};

/** Cuántos tildes lleva cada uno. El fallo no lleva: lleva una cruz. */
export const CUANTOS_TILDES: Readonly<Record<Acuse, number>> = {
  enviado: 1,
  entregado: 2,
  leido: 2,
  fallo: 0,
};

const POR_NOMBRE: Readonly<Record<string, Acuse>> = {
  // Nuestro, al guardar.
  enviado: "enviado",
  // De Meta.
  sent: "enviado",
  delivered: "entregado",
  entregado: "entregado",
  read: "leido",
  leido: "leido",
  failed: "fallo",
  fallido: "fallo",
  error: "fallo",
};

/**
 * El acuse de un estado guardado, o nulo si no se reconoce.
 *
 * Saca tildes y mayúsculas antes de comparar: «Leído» y «leido» son lo mismo,
 * y de qué lado venga el valor no debería importar.
 */
export function acuseDe(estado: string | null | undefined): Acuse | null {
  if (!estado) return null;
  const plano = estado
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return POR_NOMBRE[plano] ?? null;
}
