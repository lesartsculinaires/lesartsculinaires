/**
 * Leer lo que manda Messenger.
 *
 * ============================================================================
 * POR QUÉ ESTE ARCHIVO ES CORTO
 * ============================================================================
 *
 * Porque Messenger e Instagram mandan la MISMA carga. Los dos cuelgan de
 * `entry[].messaging[]`, con el mismo `mid`, los mismos ecos, las mismas
 * reacciones y los mismos adjuntos. La lectura ya está escrita y probada en
 * `instagram/mensajes.ts`, y se reusa entera.
 *
 * Escribir una copia para cambiarle el nombre a un campo habría duplicado el
 * recorrido del JSON —que es la parte con trampas: los ecos, los tipos raros,
 * los adjuntos sin URL— para ganar nada.
 *
 * ============================================================================
 * LO ÚNICO DISTINTO
 * ============================================================================
 *
 * El identificador de la persona. En Instagram es el IGSID; en Messenger es el
 * PSID —«Page-Scoped ID»—, que es el id de esa persona FRENTE A ESTA PÁGINA y a
 * ninguna otra. La misma persona escribiéndole a otra página tiene otro PSID.
 *
 * Los dos van a `conversaciones.identificador`, y no se pueden cruzar: la
 * unicidad de la tabla es `(canal, identificador)`.
 *
 * Y los tipos de mensaje: Messenger no tiene menciones en historias, pero sí
 * tiene cosas que Instagram no, como los botones de una plantilla.
 */

export {
  leerWebhookIg as leerWebhookMsn,
  type MensajeIg as MensajeMsn,
  type ReaccionIg as ReaccionMsn,
  type LecturaIg as LecturaMsn,
  type MediaIg as MediaMsn,
} from "@/lib/instagram/mensajes";

/**
 * Cómo se muestra en la lista un mensaje que no trae texto.
 *
 * El gemelo de `resumenIg`, con los tipos que sí existen en Messenger. Se
 * escribe aparte y no se reusa el de Instagram porque las etiquetas mienten al
 * cruzarse: «Te mencionó en su historia» no existe en Messenger, y «Compartió
 * una publicación» significa cosas distintas en cada red.
 */
export function resumenMsn(tipo: string, cuerpo: string | null): string {
  const etiquetas: Record<string, string> = {
    image: "Foto",
    video: "Video",
    audio: "Nota de voz",
    file: "Archivo",
    // Messenger manda `fallback` cuando lo compartido no se puede representar
    // —un enlace con vista previa, por ejemplo—. Suele venir con texto.
    fallback: "Enlace",
    share: "Compartió algo",
    location: "Ubicación",
    template: "Mensaje con botones",
    // Las pegatinas de Messenger llegan como adjunto de imagen, pero cuando
    // vienen marcadas se dicen por su nombre: un «Foto» suelto hace que alguien
    // abra el hilo esperando una foto de verdad.
    sticker: "Sticker",
  };

  const etiqueta = etiquetas[tipo];

  // Con texto y con adjunto —una foto con pie— se dicen las dos cosas: el pie
  // suele ser el mensaje de verdad y la etiqueta explica qué lo acompaña.
  if (cuerpo && etiqueta && tipo !== "fallback") return `${etiqueta}: ${cuerpo}`;
  if (cuerpo) return cuerpo;
  return etiqueta ?? "Mensaje";
}

/**
 * Los tipos de adjunto que son un archivo que se puede bajar y guardar.
 *
 * `fallback` y `template` quedan afuera aunque traigan URL: no hay un archivo
 * del otro lado, hay una página web. Bajarla guardaría un HTML en el bucket.
 */
export const ARCHIVO_MSN = new Set(["image", "video", "audio", "file"]);
