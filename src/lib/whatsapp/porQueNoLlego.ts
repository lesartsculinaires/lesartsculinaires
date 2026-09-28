/**
 * Lo que Meta escribe cuando un mensaje no llega, dicho en castellano.
 *
 * ============================================================================
 * POR QUÉ HACE FALTA
 * ============================================================================
 *
 * El error de un envío que falla en el momento ya se traduce —en
 * `enviar.ts`—, pero hay una segunda familia que no pasaba por ahí: la de los
 * mensajes que Meta ACEPTA y después no entrega. Ésos llegan por el webhook de
 * estados, se guardan en `mensajes.error` tal como vienen, y la bandeja los
 * muestra crudos debajo de la burbuja.
 *
 * Así fue como en el hilo de la escuela quedó escrito «Media upload error», en
 * inglés y sin ninguna pista de qué hacer. Es de los errores más claros que
 * hay una vez que se sabe qué significa —Meta no pudo bajar la imagen del
 * encabezado— y de los más opacos cuando no.
 *
 * Lo que no se reconoce se muestra tal cual. Es a propósito: inventar una
 * traducción para algo que no se entendió sería peor que el inglés.
 */

/**
 * Traduce lo que Meta dijo, o lo devuelve igual si no se reconoce.
 *
 * Se compara sobre el texto porque es lo único que guarda el webhook de
 * estados: el código viene en el error de envío, no acá.
 */
export function porQueNoLlego(loQueDijoMeta: string | null | undefined): string | null {
  const dice = (loQueDijoMeta ?? "").trim();
  if (dice === "") return null;

  /*
   * «Media upload error» — el de la plantilla con imagen.
   *
   * Meta aceptó el mensaje, fue a bajar la imagen del encabezado por la
   * dirección que se le dio, y no pudo. Las tres razones, en orden de cuán
   * seguido pasan:
   *
   *   LA DIRECCIÓN NO ES PÚBLICA   Un enlace de Drive, de Dropbox o de un
   *                                panel que pide sesión. Se abre en el
   *                                navegador de quien lo pegó —que ya tiene la
   *                                sesión— y no se abre para Meta.
   *   CADUCÓ                       Una dirección firmada que venció antes de
   *                                que Meta la fuera a buscar.
   *   NO ES UNA IMAGEN             La dirección lleva a una página que muestra
   *                                la imagen, no al archivo.
   */
  if (/media upload error/i.test(dice)) {
    return (
      "Meta no pudo bajar la imagen del encabezado. Suele pasar cuando la dirección no es " +
      "pública —un enlace de Drive o similar—. Con el botón «Subir imagen» el CRM la sube y " +
      "le arma a Meta una dirección que sí puede bajar."
    );
  }

  if (/media download error/i.test(dice)) {
    return "Meta no pudo bajar el archivo de este mensaje. Probá mandarlo de nuevo subiéndolo desde el CRM.";
  }

  if (/re-?engagement message/i.test(dice)) {
    return (
      "Pasaron más de 24 horas desde el último mensaje de esta persona, así que WhatsApp no " +
      "entregó éste. Hay que escribirle con una plantilla aprobada."
    );
  }

  if (/template.*(paused|disabled)/i.test(dice)) {
    return "Meta pausó esa plantilla por la reacción de la gente, y no la entrega hasta que la revisen.";
  }

  return dice;
}
