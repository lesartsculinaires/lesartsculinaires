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
 * Los videos que acepta Meta: MP4 y 3GP, con video H.264 y audio AAC.
 *
 * El .mov que graba un iPhone sin tocar nada NO entra —WhatsApp lo rechaza—:
 * se avisa antes de subirlo y se dice cómo arreglarlo.
 */
export const VIDEOS_ACEPTADOS = ["video/mp4", "video/3gpp"];

/**
 * Tope de WhatsApp para un video: 16 MB. Es de ellos, no nuestro (los de más
 * peso no se pueden mandar por el chat: van por un enlace de YouTube o Drive).
 * El bucket deja 20 MB y se queda en 20 porque también guarda documentos.
 */
export const TOPE_VIDEO_BYTES = 16 * 1024 * 1024;

/** ¿Es un video de los que se pueden mandar? Por tipo, o por extensión si el tipo viene vacío. */
export const esVideoAceptado = (mime: string, nombre = ""): boolean => {
  const tipo = mime.split(";")[0].trim();
  if (tipo) return VIDEOS_ACEPTADOS.includes(tipo);
  return /\.(mp4|3gp)$/i.test(nombre);
};

/** Qué está mal con este video, o null si se puede mandar. */
export function revisarVideo(f: { name: string; size: number; type: string }): string | null {
  const esVideo = f.type.startsWith("video/") || /\.(mp4|3gp|mov|avi|mkv|wmv|webm)$/i.test(f.name);
  if (!esVideo) return null;
  if (!esVideoAceptado(f.type, f.name)) {
    return (
      `«${f.name}» no es un video que WhatsApp acepte. Tiene que ser MP4 (o 3GP). ` +
      "Si es de un iPhone, en Ajustes → Cámara → Formatos elegí «Más compatible», " +
      "o convertilo a MP4 antes de subirlo."
    );
  }
  if (f.size > TOPE_VIDEO_BYTES) {
    return (
      `«${f.name}» pesa ${(f.size / 1024 / 1024).toFixed(1)} MB y WhatsApp deja mandar videos ` +
      `de hasta ${TOPE_VIDEO_BYTES / 1024 / 1024} MB. Comprimilo, o subilo a YouTube o ` +
      "Google Drive y mandá el enlace como mensaje."
    );
  }
  return null;
}

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
  ...VIDEOS_ACEPTADOS,
  // Los videos de iPhone (.mov) se ofrecen a propósito: así se pueden elegir y
  // se explica por qué no sirven, en vez de verse en gris sin motivo.
  ".mp4",
  ".3gp",
  ".mov",
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
