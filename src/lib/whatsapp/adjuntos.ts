/**
 * Qué se puede adjuntar en un chat de WhatsApp.
 *
 * Vive aparte de `enviar.ts` a propósito: ese módulo lleva `server-only`
 * porque ahí está el token, y la pantalla del Inbox necesita esta lista para
 * armar el selector de archivos. Sin esta separación habría que escribir los
 * tipos dos veces —una en el `accept` del navegador y otra en la comprobación
 * del servidor— y el día que se agregara uno, el selector ofrecería algo que
 * el servidor rechaza.
 *
 * No hay nada secreto acá, así que puede viajar al navegador sin problema.
 */

/**
 * Los tipos de documento que acepta Meta.
 *
 * La lista es cerrada del lado de ellos: un archivo fuera de esto se rechaza
 * al subirlo, con un error que habla de «type» y no dice cuál era el problema.
 * Vale más comprobarlo antes y decir qué se puede mandar.
 */
export const DOCUMENTOS_ACEPTADOS: Readonly<Record<string, string>> = {
  "application/pdf": "PDF",
  "application/msword": "Word",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
  "application/vnd.ms-excel": "Excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
  "application/vnd.ms-powerpoint": "PowerPoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint",
  "text/plain": "Texto",
};

/** Las fotos que acepta Meta, y que además se ven en el visor. */
export const IMAGENES_ACEPTADAS = ["image/jpeg", "image/png", "image/webp"];

/**
 * Lo que va en el `accept` del selector de archivos.
 *
 * Además de los tipos van las extensiones. No es redundante: Windows manda
 * algunos .docx y .xlsx con el tipo en blanco o con uno genérico, y entonces
 * un `accept` de puros tipos los muestra en gris y no se pueden elegir.
 */
export const ACEPTA_ADJUNTOS = [
  ...IMAGENES_ACEPTADAS,
  ...Object.keys(DOCUMENTOS_ACEPTADOS),
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
].join(",");

/**
 * Tope para documentos, y este es nuestro, no de WhatsApp.
 *
 * Meta acepta hasta 100 MB en un documento, muchísimo más que esto. El que
 * manda es el alojamiento: el archivo viaja dentro del cuerpo de la petición a
 * la función de Netlify, y ese cuerpo tiene un techo de 6 MB. Pasado eso la
 * petición se corta antes de llegar al código, así que no hay forma de dar un
 * error que se entienda; por eso se corta acá, con margen para lo que el
 * formulario agrega alrededor del archivo.
 *
 * Para mandar cosas más grandes hay que cambiar el camino: que el navegador
 * suba el archivo directo al balde de Supabase y que el servidor lo lea de
 * ahí, sin pasarlo por la función. Es otro trabajo, no un número más grande.
 */
export const TOPE_DOCUMENTO_BYTES = 4 * 1024 * 1024;

/** «PDF, Word, Excel, PowerPoint o Texto», sin repetir. */
export function tiposQueSePueden(): string {
  const nombres = [...new Set(Object.values(DOCUMENTOS_ACEPTADOS))];
  return nombres.slice(0, -1).join(", ") + " o " + nombres[nombres.length - 1];
}

/** ¿Es un documento de los que Meta deja mandar? */
export const esDocumentoAceptado = (mime: string): boolean =>
  mime.split(";")[0].trim() in DOCUMENTOS_ACEPTADOS;
