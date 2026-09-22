/**
 * El perfil de quien escribe por Instagram o por Messenger, y por qué a veces
 * no se puede averiguar.
 *
 * ============================================================================
 * POR QUÉ ESTE ARCHIVO EXISTE
 * ============================================================================
 *
 * En WhatsApp el nombre viene DENTRO del webhook. En Instagram y en Messenger
 * no viene nada: la carga trae el identificador de la persona y el texto. El
 * nombre hay que ir a pedirlo a Meta en una consulta aparte, y esa consulta
 * puede fallar por motivos que no tienen nada que ver con el mensaje —falta de
 * permisos, revisión de Meta sin aprobar, token vencido—.
 *
 * Durante un tiempo eso se resolvió devolviendo `null` y siguiendo. Está bien
 * que siga —el mensaje vale más que el nombre—, pero callarse POR QUÉ falló
 * dejó a la escuela mirando hilos titulados con diecisiete dígitos sin ninguna
 * forma de saber si era un problema de Meta, del token o del CRM.
 *
 * Así que ahora el motivo viaja junto al perfil: se registra en el servidor y
 * se puede mostrar en pantalla cuando alguien pregunta «¿y por qué sale el
 * número?». Un `motivo` no vacío significa exactamente eso: se preguntó y Meta
 * dijo que no.
 */

/** Lo que se sabe de una persona de Instagram o Messenger. */
export interface PerfilMeta {
  /** Su nombre visible, si Meta lo entrega. */
  nombre: string | null;
  /** Su @usuario. Messenger no lo entrega nunca y acá va `null`. */
  usuario: string | null;
  /**
   * Por qué no se pudo averiguar, en una línea que se le puede mostrar a
   * alguien que no es programador. `null` cuando la consulta salió bien, aunque
   * haya venido vacía.
   */
  motivo: string | null;
}

/** Un perfil vacío con su explicación. */
export const sinPerfil = (motivo: string | null): PerfilMeta => ({
  nombre: null,
  usuario: null,
  motivo,
});

/** Texto que no sirve como nombre: vacío, espacios, o directamente no es texto. */
export const limpio = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

/**
 * Traduce el error de Meta a una línea que explique qué hacer.
 *
 * ----------------------------------------------------------------------------
 * POR QUÉ SE TRADUCE Y NO SE MUESTRA CRUDO
 * ----------------------------------------------------------------------------
 *
 * Porque el crudo es «(#10) Application does not have permission for this
 * action», que le dice a quien lo lee que algo falló pero no que hay un trámite
 * pendiente en Meta y que no es culpa suya ni del CRM.
 *
 * Los códigos son los mismos que ya traduce el envío —ver `instagram/enviar.ts`,
 * `porQueFallo`—, pero el desenlace es otro: acá no se perdió un mensaje, sólo
 * un nombre, y la recomendación es distinta.
 *
 * El mensaje crudo se conserva al final. Cuando el código no es ninguno de los
 * conocidos, es lo único que hay para buscar.
 */
export function motivoDelPerfil(
  canal: string,
  estado: number,
  cuerpo: { error?: { code?: number; error_subcode?: number; message?: string } } | null,
): string {
  const error = cuerpo?.error;
  const crudo = limpio(error?.message);

  if (error?.code === 190) {
    return (
      `El token de ${canal} no sirve para consultar perfiles: está vencido o es de otra cuenta. ` +
      (crudo ?? "")
    ).trim();
  }

  if (error?.code === 10 || error?.code === 200 || error?.code === 3 || estado === 403) {
    return (
      `Meta todavía no le permite a la aplicación leer el nombre de quien escribe por ${canal}. ` +
      "Es el mismo permiso que falta para contestar: hasta que la aplicación pase a modo Live " +
      "con Acceso Avanzado, los hilos entran sin nombre. " +
      (crudo ?? "")
    ).trim();
  }

  if (error?.code === 100) {
    return (
      `Meta no reconoce a esa persona como alguien que le escribió a esta cuenta de ${canal}. ` +
      (crudo ?? "")
    ).trim();
  }

  return crudo ?? `${canal} respondió con error ${estado} al preguntar por el perfil.`;
}
