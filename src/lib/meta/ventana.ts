/**
 * Cómo se le habla a Meta según cuánto hace que la persona escribió.
 *
 * ============================================================================
 * EL ERROR QUE ESTO VIENE A ARREGLAR
 * ============================================================================
 *
 * La escuela no podía contestar NINGÚN mensaje de Messenger. Meta rechazaba
 * todos con:
 *
 *     (#100) No se puede agregar la etiqueta "HUMAN_AGENT" a los mensajes sin
 *     aprobación previa.
 *
 * El CRM le ponía la etiqueta `HUMAN_AGENT` a todos los envíos, siempre. Esa
 * etiqueta es un permiso que Meta da por App Review, y la aplicación de la
 * escuela no lo tiene. Así que el envío se caía incluso un minuto después de
 * que el cliente escribiera, que es cuando no hacía ninguna falta.
 *
 * ============================================================================
 * PARA QUÉ SIRVE LA ETIQUETA, Y CUÁNDO HACE FALTA DE VERDAD
 * ============================================================================
 *
 * Sólo para ESTIRAR la ventana. Meta deja contestar libremente durante 24 horas
 * desde el último mensaje de la persona; `HUMAN_AGENT` lleva eso a siete días,
 * y existe porque del otro lado contesta alguien del equipo y no un robot.
 *
 * Dentro de las 24 horas alcanza con `messaging_type: "RESPONSE"`, que no pide
 * ningún permiso especial. Es lo que se manda ahora mientras la ventana esté
 * abierta, y es lo que devuelve la capacidad de contestar sin esperar a Meta.
 *
 * Pasadas las 24 horas la etiqueta es la ÚNICA forma de escribir, así que ahí
 * sí se manda. Si Meta la rechaza, el mensaje de error dice qué permiso falta,
 * que es una respuesta accionable en vez de un texto en inglés.
 *
 * ============================================================================
 * QUÉ PASA CUANDO NO SE SABE
 * ============================================================================
 *
 * Sin fecha del último mensaje entrante se supone la ventana ABIERTA, o sea
 * `RESPONSE`. Es la suposición correcta por cómo fallan las dos:
 *
 *   SUPONER ABIERTA Y ESTAR CERRADA    Meta contesta «pasó la ventana», que el
 *                                      CRM ya traduce a «hay que esperar a que
 *                                      vuelva a escribir». Se entiende.
 *
 *   SUPONER CERRADA Y ESTAR ABIERTA    Se manda la etiqueta sin necesidad, y
 *                                      hoy eso REBOTA. Se pierde un mensaje
 *                                      que se podía mandar.
 */

/**
 * Las horas que Meta deja contestar sin ningún permiso extra.
 *
 * Es una constante de la plataforma, no una decisión nuestra.
 */
export const HORAS_SIN_ETIQUETA = 24;

/** El sobre del envío: lo que va al lado del mensaje en el cuerpo del POST. */
export type SobreDeEnvio =
  | { messaging_type: "RESPONSE" }
  | { messaging_type: "MESSAGE_TAG"; tag: "HUMAN_AGENT" };

/**
 * Con qué sobre sale este mensaje.
 *
 * `ultimoEntranteEn` es cuándo escribió la persona por última vez. Null cuando
 * no se sabe: ver arriba por qué eso se trata como ventana abierta.
 */
export function sobreDeEnvio(
  ultimoEntranteEn: string | null | undefined,
  ahora: Date = new Date(),
): SobreDeEnvio {
  if (dentroDeLaVentana(ultimoEntranteEn, ahora)) return { messaging_type: "RESPONSE" };
  return { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" };
}

/** ¿Escribió hace menos de 24 horas? */
export function dentroDeLaVentana(
  ultimoEntranteEn: string | null | undefined,
  ahora: Date = new Date(),
): boolean {
  if (!ultimoEntranteEn) return true;

  const cuando = new Date(ultimoEntranteEn);
  // Una fecha que no se entiende se trata como «no se sabe», no como vieja:
  // el mismo razonamiento de arriba.
  if (Number.isNaN(cuando.getTime())) return true;

  const horas = (ahora.getTime() - cuando.getTime()) / 3_600_000;
  return horas < HORAS_SIN_ETIQUETA;
}

/**
 * ¿Este error de Meta es el del permiso que falta?
 *
 * El código 100 lo usa Meta para muchas cosas, así que no alcanza con él: se
 * pide además que el texto nombre la etiqueta. Con el código solo se
 * traduciría mal cualquier otro error de parámetros.
 */
export const esFaltaDePermisoHumanAgent = (
  error: { message?: string; code?: number } | undefined,
): boolean =>
  error?.code === 100 && /HUMAN_AGENT/i.test(error?.message ?? "");

/** Lo que hay que hacer cuando falta ese permiso, dicho para quien atiende. */
export const FALTA_HUMAN_AGENT =
  "Pasaron más de 24 horas desde el último mensaje de esta persona. Para " +
  "contestar hasta los siete días, Meta pide el permiso «Human Agent», que la " +
  "aplicación todavía no tiene aprobado: se solicita en el panel de Meta, en " +
  "App Review → Permissions and Features. Mientras tanto hay que esperar a que " +
  "la persona vuelva a escribir.";
