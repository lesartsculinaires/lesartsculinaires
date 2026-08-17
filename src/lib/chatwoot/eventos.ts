/**
 * Lectura de los webhooks de Chatwoot.
 *
 * Va aparte y sin dependencias del servidor para poder probarlo con cargas
 * reales. Cada acceso asume lo mínimo: los campos opcionales de Chatwoot
 * cambian entre versiones y entre canales, y un campo que falta no puede
 * tumbar la ruta.
 */

/** Un mensaje que hay que guardar en el CRM. */
export interface MensajeChatwoot {
  chatwootId: number;
  conversacionId: number;
  contactoId: number | null;
  inboxId: number | null;
  /** Sólo dígitos. Vacío cuando Chatwoot no lo manda. */
  telefono: string;
  nombre: string | null;
  correo: string | null;
  direccion: "entrante" | "saliente";
  /** Nota interna del equipo: el cliente no la ve. */
  privado: boolean;
  tipo: string;
  texto: string | null;
  creadoEn: Date;
  /** open / pending / resolved */
  estadoConversacion: string | null;
}

const txt = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

const obj = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;

/**
 * Chatwoot manda `message_type` como entero (0 entrante, 1 saliente) en unas
 * versiones y como texto (`"incoming"`) en otras. Se aceptan las dos.
 */
function direccionDe(v: unknown): "entrante" | "saliente" {
  if (typeof v === "number") return v === 0 ? "entrante" : "saliente";
  const s = String(v ?? "").toLowerCase();
  return s === "incoming" || s === "0" ? "entrante" : "saliente";
}

/**
 * Los datos del contacto pueden venir en `sender`, o en
 * `conversation.meta.sender` según el evento. Se prueba en ese orden.
 */
function contactoDe(raiz: Record<string, unknown>): Record<string, unknown> | null {
  const remitente = obj(raiz.sender);
  if (remitente && txt(remitente.type) !== "user") return remitente;

  const meta = obj(obj(raiz.conversation)?.meta);
  return obj(meta?.sender) ?? remitente;
}

/**
 * Lee un `message_created`.
 *
 * Devuelve null cuando el evento no es un mensaje aprovechable —otro tipo de
 * evento, o sin los ids mínimos—; el que llama responde 200 igual, porque un
 * evento que no supimos leer no vale perder la integración.
 */
export function leerMensaje(carga: unknown): MensajeChatwoot | null {
  const raiz = obj(carga);
  if (!raiz) return null;

  const evento = txt(raiz.event);
  if (evento !== "message_created" && evento !== "message_updated") return null;

  const chatwootId = num(raiz.id);
  const conversacion = obj(raiz.conversation);
  const conversacionId = num(conversacion?.id);
  if (chatwootId == null || conversacionId == null) return null;

  const contacto = contactoDe(raiz);
  const telefono = (txt(contacto?.phone_number) ?? "").replace(/\D/g, "");

  const marca = num(raiz.created_at);

  return {
    chatwootId,
    conversacionId,
    contactoId: num(contacto?.id),
    inboxId: num(conversacion?.inbox_id) ?? num(obj(raiz.inbox)?.id),
    telefono,
    nombre: txt(contacto?.name),
    correo: txt(contacto?.email),
    direccion: direccionDe(raiz.message_type),
    privado: raiz.private === true,
    tipo: txt(raiz.content_type) ?? "text",
    texto: txt(raiz.content),
    // Chatwoot manda segundos desde epoch, no milisegundos.
    creadoEn: marca != null ? new Date(marca * 1000) : new Date(),
    estadoConversacion: txt(conversacion?.status),
  };
}

/** Cambio de estado de una conversación (abierta, pendiente, resuelta). */
export interface EstadoChatwoot {
  conversacionId: number;
  estado: string;
}

export function leerEstado(carga: unknown): EstadoChatwoot | null {
  const raiz = obj(carga);
  if (txt(raiz?.event) !== "conversation_status_changed") return null;

  // Según la versión, los datos van en la raíz o dentro de `conversation`.
  const conv = obj(raiz?.conversation) ?? raiz;
  const id = num(conv?.id);
  const estado = txt(conv?.status);
  return id != null && estado ? { conversacionId: id, estado } : null;
}

/**
 * Cómo se muestra en la lista un mensaje sin texto.
 *
 * No se inventa una descripción del contenido: quien atiende necesita saber
 * que llegó una foto, no leer algo que parezca lo que la persona escribió.
 */
export function resumen(tipo: string, texto: string | null): string {
  if (texto) return texto;
  const etiquetas: Record<string, string> = {
    image: "Foto",
    video: "Video",
    audio: "Nota de voz",
    file: "Archivo",
    location: "Ubicación",
    contact: "Contacto compartido",
    sticker: "Sticker",
  };
  return etiquetas[tipo] ?? "Mensaje";
}
