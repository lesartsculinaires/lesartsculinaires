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
 * No es un techo técnico: WhatsApp acepta 100 MB y el camino nuevo no tiene
 * otro límite. Es una decisión sobre el espacio total, porque lo que sale por
 * el chat se guarda para siempre —es la única copia de lo que se le mandó al
 * cliente—, y en el plan gratuito de Supabase hay 1 GB para todo. Veinte megas
 * está muy por encima de lo que pesa de verdad una lista de precios o un
 * temario, que andan entre uno y diez.
 *
 * Antes eran 4 MB y eso sí era un techo: el archivo pasaba por la función de
 * Netlify y ese cuerpo se corta en 6. Ahora el navegador sube derecho al
 * bucket y el servidor sólo maneja la ruta.
 *
 * ESTE NÚMERO TIENE UN GEMELO: `file_size_limit` en la migración
 * `20260921120000_adjuntos_grandes.sql`. Se cambian juntos o no se cambia
 * ninguno; si sólo se toca éste, el archivo se elige en la pantalla y después
 * rebota al subir, con el error del bucket y no con el nuestro. Y hay un
 * tercero afuera: el límite global del proyecto, en Supabase → Storage →
 * Settings, que el del bucket no puede pasar.
 */
export const TOPE_DOCUMENTO_BYTES = 20 * 1024 * 1024;

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
