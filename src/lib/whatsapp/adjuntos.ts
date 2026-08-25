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
 * Tope para documentos.
 *
 * Los 50 MB son los del bucket, que es hoy el eslabón más bajo: Meta acepta
 * 100 y el camino ya no tiene otro techo. Antes eran 4 MB y no porque WhatsApp
 * lo pidiera, sino porque el archivo pasaba por la función de Netlify y ese
 * cuerpo se corta en 6; ahora el navegador sube derecho al bucket y el
 * servidor sólo maneja la ruta.
 *
 * Si algún día hicieran falta más, hay que subir dos cosas a la vez: el tope
 * del bucket —en la migración— y el límite global de subida del proyecto, que
 * se toca en Supabase, en Storage → Settings. El del bucket no puede pasar al
 * global, así que cambiar uno solo no hace nada.
 */
export const TOPE_DOCUMENTO_BYTES = 50 * 1024 * 1024;

/** El bucket donde vive todo lo del chat, en las dos direcciones. */
export const BALDE_WHATSAPP = "whatsapp";

/**
 * La carpeta de lo que mandamos nosotros.
 *
 * Aparte de «wa/», que es lo que manda el cliente, porque son las dos únicas
 * carpetas del bucket y sólo esta se puede escribir desde el navegador. La
 * política de Supabase mira exactamente este nombre; cambiarlo acá sin cambiar
 * la migración deja las subidas rebotando con un error de permisos.
 */
export const CARPETA_SALIENTE = "saliente";

/** «PDF, Word, Excel, PowerPoint o Texto», sin repetir. */
export function tiposQueSePueden(): string {
  const nombres = [...new Set(Object.values(DOCUMENTOS_ACEPTADOS))];
  return nombres.slice(0, -1).join(", ") + " o " + nombres[nombres.length - 1];
}

/** ¿Es un documento de los que Meta deja mandar? */
export const esDocumentoAceptado = (mime: string): boolean =>
  mime.split(";")[0].trim() in DOCUMENTOS_ACEPTADOS;
