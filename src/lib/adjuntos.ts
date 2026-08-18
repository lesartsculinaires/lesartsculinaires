/**
 * Reglas de los archivos adjuntos.
 *
 * Vive fuera del componente y fuera del servidor porque los dos tienen que
 * aplicar lo mismo: el navegador para avisar antes de subir 10 MB por una
 * conexión de celular, y el servidor porque un navegador puede mentir.
 */

/** Lo que ya está guardado, tal como lo muestra la ficha. */
export interface Adjunto {
  id: number;
  nombre: string;
  tipoMime: string | null;
  tamanoBytes: number | null;
  creadoEn: string;
  /** Enlace firmado, temporal. Null si no se pudo generar. */
  url: string | null;
  /** Si lo subió quien está mirando: sólo esa persona (o un admin) lo quita. */
  propio: boolean;
}

/**
 * 15 MB, el mismo tope que el balde.
 *
 * Da para una foto de celular sin comprimir y para un PDF escaneado de varias
 * páginas. Más que eso casi siempre es un video, y para eso no es esto.
 */
export const TOPE_BYTES = 15 * 1024 * 1024;

/**
 * Lo que se puede subir.
 *
 * Es una lista blanca, no una negra: se nombra lo que sirve —fotos, PDF, texto
 * y los archivos de Office— en vez de intentar adivinar todo lo que podría
 * hacer daño. Lo que queda afuera es lo que se ejecuta: un .exe, un .sh, un
 * .apk. Nada de eso es documentación de un cliente, y una lista negra siempre
 * se olvida de alguno.
 *
 * HEIC entra porque es lo que manda un iPhone sin tocar nada.
 */
export const TIPOS: readonly string[] = [
  // Fotos y capturas.
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  // Documentos.
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/rtf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

/**
 * Para el `accept` del selector de archivos.
 *
 * Van también las extensiones sueltas: Windows no siempre le dice al navegador
 * el tipo del .heic ni del .csv, y sin ellas esos archivos aparecerían en gris
 * en el selector aunque después sí se acepten.
 */
export const ACEPTA = [...TIPOS, ".heic", ".heif", ".csv", ".txt", ".rtf"].join(",");

/** Qué está mal con este archivo, o null si está bien. */
export function revisar(f: { name: string; size: number; type: string }): string | null {
  if (f.size === 0) return `«${f.name}» está vacío.`;
  if (f.size > TOPE_BYTES) {
    return `«${f.name}» pesa ${peso(f.size)}. El tope es ${peso(TOPE_BYTES)}.`;
  }
  // Algunos navegadores no reconocen el HEIC del iPhone y mandan el tipo
  // vacío. Rechazarlo por eso dejaría afuera justo las fotos que más se
  // suben, así que se decide por la extensión cuando no hay tipo.
  const tipo = f.type || porExtension(f.name);
  if (!tipo) return `No se reconoce el tipo de «${f.name}».`;
  if (!TIPOS.includes(tipo)) {
    return `«${f.name}» no es una foto ni un documento (${tipo}).`;
  }
  return null;
}

/** El tipo que corresponde a la extensión, para cuando el navegador no opina. */
export function porExtension(nombre: string): string {
  const ext = nombre.toLowerCase().split(".").pop() ?? "";
  const mapa: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
    pdf: "application/pdf",
    txt: "text/plain",
    csv: "text/csv",
    rtf: "application/rtf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
  return mapa[ext] ?? "";
}

/** 1536 → "1.5 MB". */
export function peso(bytes: number | null | undefined): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/** Para decidir si se puede mostrar una miniatura. */
export const esImagen = (tipo: string | null | undefined): boolean =>
  Boolean(tipo?.startsWith("image/"));

/**
 * Dónde guardar el archivo dentro del balde.
 *
 * El nombre original NO se usa acá. Las llaves del almacenamiento no llevan
 * bien los acentos ni los paréntesis, y «comprobante (1).png» aparece diez
 * veces al día; con un identificador al azar nunca hay choque ni carácter
 * raro. El nombre de verdad queda guardado en la fila, que es donde se lee.
 */
export function rutaPara(oportunidadId: number, nombre: string): string {
  const ext = nombre.toLowerCase().split(".").pop() ?? "";
  const limpia = /^[a-z0-9]{1,5}$/.test(ext) ? `.${ext}` : "";
  const azar =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${oportunidadId}/${azar}${limpia}`;
}

/** El nombre recortado, para que la lista no se desarme con un nombre larguísimo. */
export function nombreCorto(nombre: string, tope = 42): string {
  if (nombre.length <= tope) return nombre;
  const ext = nombre.includes(".") ? `.${nombre.split(".").pop()}` : "";
  return `${nombre.slice(0, tope - ext.length - 1)}…${ext}`;
}
