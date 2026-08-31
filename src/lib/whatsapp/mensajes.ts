/**
 * Lectura del webhook de Meta.
 *
 * Va aparte y sin dependencias del servidor para poder probarlo con cargas
 * reales sin levantar nada. El formato de Meta es hondo y lleno de arreglos
 * que a veces vienen y a veces no, así que cada acceso asume lo mínimo.
 */

export interface MensajeEntrante {
  /** Id del mensaje en Meta. Es lo que evita guardar dos veces un reintento. */
  waId: string;
  /** Teléfono de quien escribe, sólo dígitos y con código de país. */
  telefono: string;
  nombrePerfil: string | null;
  tipo: string;
  /** Texto plano. Nulo cuando el mensaje es una foto, un audio o similar. */
  texto: string | null;
  enviadoEn: Date;
  /**
   * El archivo adjunto, cuando el mensaje es una foto, un audio o un
   * documento. Nulo para los de texto.
   */
  media: MediaEntrante | null;
  /** El objeto tal cual vino, para no perder lo que hoy no se usa. */
  crudo: unknown;
}

/**
 * Lo que hace falta para ir a buscar el archivo.
 *
 * Meta no manda el archivo: manda un id con el que hay que pedirlo aparte, y
 * lo borra a los treinta días. Por eso esto se resuelve apenas llega el
 * mensaje y no cuando alguien abre el hilo: para entonces la captura de la
 * transferencia puede haber dejado de existir.
 */
export interface MediaEntrante {
  id: string;
  mime: string | null;
  /** Nombre original, sólo lo traen los documentos. */
  nombre: string | null;
}

/** Aviso de que un mensaje que mandamos cambió de estado. */
export interface EstadoSaliente {
  waId: string;
  estado: string;
  error: string | null;
}

/**
 * El cliente reaccionó a un mensaje, o le sacó la reacción.
 *
 * Meta las manda dentro de `messages`, con `type: "reaction"`, así que sin
 * separarlas entrarían a la bandeja como un mensaje más: una burbuja vacía que
 * dice «Mensaje» y no significa nada. Salen por su propia puerta.
 *
 * Quitar una reacción llega igual que ponerla pero sin emoji —o con la cadena
 * vacía—, y por eso `emoji` puede ser null: es la diferencia entre «puso ❤️» y
 * «sacó lo que había».
 */
export interface ReaccionEntrante {
  /** Id del aviso en sí. Distinto del mensaje al que reacciona. */
  waId: string;
  telefono: string;
  /** El mensaje sobre el que reaccionó. */
  sobreWaId: string;
  /** Null cuando lo que hizo fue sacarla. */
  emoji: string | null;
  cuando: Date;
}

const texto = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;

const obj = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;

const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * Saca los mensajes entrantes y los cambios de estado de una carga del
 * webhook.
 *
 * Una sola llamada puede traer varias entradas, varios cambios y varios
 * mensajes: Meta agrupa cuando llegan juntos. Lo que no se entiende se salta
 * en silencio en vez de tumbar la petición — si el webhook devuelve error,
 * Meta reintenta y termina desactivándolo.
 */
export function leerWebhook(carga: unknown): {
  mensajes: MensajeEntrante[];
  estados: EstadoSaliente[];
  reacciones: ReaccionEntrante[];
} {
  const mensajes: MensajeEntrante[] = [];
  const estados: EstadoSaliente[] = [];
  const reacciones: ReaccionEntrante[] = [];

  const raiz = obj(carga);
  if (!raiz) return { mensajes, estados, reacciones };

  for (const entrada of lista(raiz.entry)) {
    for (const cambio of lista(obj(entrada)?.changes)) {
      const valor = obj(obj(cambio)?.value);
      if (!valor) continue;

      // Los nombres de perfil vienen en un arreglo aparte, emparejados por
      // teléfono. Se indexan primero para no recorrerlo por cada mensaje.
      const nombres = new Map<string, string>();
      for (const c of lista(valor.contacts)) {
        const contacto = obj(c);
        const wa = texto(contacto?.wa_id);
        const nombre = texto(obj(contacto?.profile)?.name);
        if (wa && nombre) nombres.set(wa, nombre);
      }

      for (const m of lista(valor.messages)) {
        const msg = obj(m);
        const waId = texto(msg?.id);
        const de = texto(msg?.from);
        if (!msg || !waId || !de) continue;

        const tipo = texto(msg.type) ?? "desconocido";
        const marca = texto(msg.timestamp);
        const cuando = marca ? new Date(Number(marca) * 1000) : new Date();

        /*
         * Las reacciones salen por su propia puerta.
         *
         * Vienen adentro de `messages` como cualquier otro, pero no son un
         * mensaje: no tienen texto ni archivo, y guardarlas en la tabla de
         * mensajes dejaría en el hilo una burbuja vacía por cada corazón. Se
         * devuelven aparte y quien las use decide dónde van.
         */
        if (tipo === "reaction") {
          const r = obj(msg.reaction);
          const sobre = texto(r?.message_id);
          if (sobre) {
            reacciones.push({
              waId,
              telefono: de.replace(/\D/g, ""),
              sobreWaId: sobre,
              // Sin emoji —o vacío— es que la sacó, no que puso una vacía.
              emoji: texto(r?.emoji),
              cuando,
            });
          }
          continue;
        }

        mensajes.push({
          waId,
          telefono: de.replace(/\D/g, ""),
          nombrePerfil: nombres.get(de) ?? null,
          tipo,
          texto: leerTexto(msg, tipo),
          media: leerMedia(msg, tipo),
          // Meta manda segundos desde epoch, no milisegundos.
          enviadoEn: cuando,
          crudo: m,
        });
      }

      for (const s of lista(valor.statuses)) {
        const est = obj(s);
        const waId = texto(est?.id);
        const estado = texto(est?.status);
        if (!waId || !estado) continue;

        const primerError = obj(lista(est?.errors)[0]);
        estados.push({
          waId,
          estado,
          error: texto(primerError?.title) ?? texto(primerError?.message),
        });
      }
    }
  }

  return { mensajes, estados, reacciones };
}

/**
 * El texto legible de un mensaje, según su tipo.
 *
 * Los que no traen texto devuelven null y la bandeja los muestra por su tipo.
 * Es mejor que inventar una descripción: quien atiende necesita saber que
 * llegó una foto, no leer «[imagen]» y creer que eso era el mensaje.
 */
function leerTexto(msg: Record<string, unknown>, tipo: string): string | null {
  switch (tipo) {
    case "text":
      return texto(obj(msg.text)?.body);
    // Los botones y listas de un menú llegan como respuestas interactivas.
    case "interactive": {
      const inter = obj(msg.interactive);
      return (
        texto(obj(inter?.button_reply)?.title) ?? texto(obj(inter?.list_reply)?.title)
      );
    }
    case "button":
      return texto(obj(msg.button)?.text);
    // Las fotos y videos pueden traer pie de foto, y muchas veces ahí va lo
    // que la persona quería decir.
    case "image":
    case "video":
    case "document":
      return texto(obj(msg[tipo])?.caption);
    default:
      return null;
  }
}

/**
 * El id del archivo, para los tipos que traen uno.
 *
 * Los cinco tipos con archivo lo guardan bajo una clave con su propio nombre
 * —`image.id`, `audio.id`…— y con la misma forma, así que se lee una sola vez.
 */
function leerMedia(msg: Record<string, unknown>, tipo: string): MediaEntrante | null {
  if (!CON_ARCHIVO.has(tipo)) return null;

  const cuerpo = obj(msg[tipo]);
  const id = texto(cuerpo?.id);
  if (!id) return null;

  return {
    id,
    mime: texto(cuerpo?.mime_type),
    nombre: texto(cuerpo?.filename),
  };
}

/** Los tipos de mensaje que traen un archivo aparte. */
export const CON_ARCHIVO = new Set(["image", "video", "audio", "document", "sticker"]);

/** Cómo se muestra en la lista un mensaje que no trae texto. */
export function resumen(tipo: string, texto: string | null): string {
  if (texto) return texto;
  const etiquetas: Record<string, string> = {
    image: "Foto",
    video: "Video",
    audio: "Nota de voz",
    document: "Documento",
    sticker: "Sticker",
    location: "Ubicación",
    contacts: "Contacto compartido",
  };
  return etiquetas[tipo] ?? "Mensaje";
}
