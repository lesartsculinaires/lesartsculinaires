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

/**
 * El cliente contestó a la solicitud de permiso para llamarlo.
 *
 * WhatsApp no deja llamarle a nadie sin que lo haya aceptado antes. La
 * solicitud se le manda como un mensaje con un botón, y esto es lo que llega
 * cuando aprieta.
 *
 * Sale por su propia puerta, igual que las reacciones, porque no es un mensaje
 * que la persona escribió: dejarlo caer en el hilo como uno más pondría una
 * burbuja vacía que dice «Mensaje» y no significa nada.
 */
export interface PermisoDeLlamada {
  waId: string;
  telefono: string;
  /** `true` si aceptó que lo llamemos. */
  acepto: boolean;
  /**
   * Hasta cuándo vale, según Meta. Nulo cuando no lo manda —o cuando dijo que
   * no—, y ahí el CRM no inventa un plazo: sin fecha, no se puede llamar.
   */
  vence: Date | null;
  cuando: Date;
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
  permisos: PermisoDeLlamada[];
} {
  const mensajes: MensajeEntrante[] = [];
  const estados: EstadoSaliente[] = [];
  const reacciones: ReaccionEntrante[] = [];
  const permisos: PermisoDeLlamada[] = [];

  const raiz = obj(carga);
  if (!raiz) return { mensajes, estados, reacciones, permisos };

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

        /*
         * La respuesta al pedido de permiso para llamar.
         *
         * Se saca de la fila antes de que entre como mensaje: aparte de no
         * significar nada como burbuja, es lo único que le dice al CRM si a
         * esta persona se le puede llamar o no, y eso hay que guardarlo en el
         * hilo y no en la lista de mensajes.
         *
         * Se anota igual en el hilo, pero con texto propio —ver `leerTexto`—
         * porque «aceptó que la llamemos» es justo lo que quiere ver quien
         * abre la conversación al otro día.
         */
        const permiso = leerPermiso(msg, tipo);
        if (permiso) {
          permisos.push({
            waId,
            telefono: de.replace(/\D/g, ""),
            acepto: permiso.acepto,
            vence: permiso.vence,
            cuando,
          });
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

  return { mensajes, estados, reacciones, permisos };
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

      /*
       * La respuesta al permiso de llamada no trae título: trae un «accept» o
       * un «reject» en inglés y nada más. Sin esto quedaría en el hilo una
       * burbuja vacía justo en el momento más importante de la conversación
       * —cuando la persona acepta que la llamen— y quien abriera el chat al
       * otro día no tendría forma de saber que puede llamarla.
       */
      const permiso = leerPermiso(msg, tipo);
      if (permiso) {
        return permiso.acepto
          ? "Aceptó que lo llamemos por WhatsApp"
          : "No aceptó que lo llamemos por WhatsApp";
      }

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

    /*
     * ------------------------------------------------------------------------
     * LOS QUE ANTES QUEDABAN EN UNA BURBUJA QUE DECÍA «Mensaje»
     * ------------------------------------------------------------------------
     *
     * Todo lo que no estuviera acá arriba caía en `default: null`, y en el hilo
     * salía una burbuja con la palabra «Mensaje» y la hora. Para quien atiende
     * eso es peor que nada: sabe que la persona mandó algo, no sabe qué, y no
     * tiene forma de averiguarlo.
     *
     * El contenido nunca se perdió —el JSON entero se guarda en
     * `mensajes.payload` desde el primer día— así que esto es leer lo que ya
     * estaba ahí.
     */

    /*
     * «Abrió el chat», de alguien que llegó por un anuncio.
     *
     * WhatsApp lo manda cuando una persona entra a la conversación desde un
     * anuncio o un enlace y todavía no escribió nada. No trae texto porque no
     * hay texto: el hecho ES que abrió el chat, y para ventas es justamente el
     * momento de contestar primero.
     */
    case "request_welcome":
      return deDondeVino(msg) ?? "Abrió el chat";

    // Un pedido del catálogo de WhatsApp.
    case "order": {
      const pedido = obj(msg.order);
      const cuantos = lista(pedido?.product_items).length;
      const nota = texto(pedido?.text);
      const cabeza =
        cuantos > 0
          ? `Pedido del catálogo: ${cuantos} ${cuantos === 1 ? "producto" : "productos"}`
          : "Pedido del catálogo";
      return nota ? `${cabeza} — ${nota}` : cabeza;
    }

    // Una ubicación: el nombre y la dirección valen mucho más que «Ubicación».
    case "location": {
      const donde = obj(msg.location);
      const partes = [texto(donde?.name), texto(donde?.address)].filter(Boolean);
      return partes.length > 0 ? `📍 ${partes.join(" — ")}` : null;
    }

    // Uno o varios contactos compartidos, por su nombre.
    case "contacts": {
      const nombres = lista(msg.contacts)
        .map((c) => texto(obj(obj(c)?.name)?.formatted_name))
        .filter((n): n is string => Boolean(n));
      return nombres.length > 0 ? `Contacto: ${nombres.join(", ")}` : null;
    }

    /*
     * Avisos de WhatsApp, no de la persona.
     *
     * «Fulano cambió de número» es el caso que importa: sin esto el hilo
     * seguiría al mismo contacto sin que nadie se entere de que el teléfono
     * guardado en la ficha ya no sirve.
     */
    case "system":
      return texto(obj(msg.system)?.body);

    /*
     * Los que Meta misma no pudo entregar enteros.
     *
     * Llegan con `type: "unknown"` y un error adentro que explica por qué —un
     * tipo de mensaje que la cuenta no soporta, por ejemplo—. Decirlo es mejor
     * que una burbuja muda: quien atiende sabe que tiene que pedirle a la
     * persona que lo mande de otra forma.
     */
    /*
     * `unsupported` es el que manda Meta de verdad; `unknown` está por las
     * dudas.
     *
     * Acá esto decía sólo `unknown`, que es como lo nombra parte de la
     * documentación. La base de la escuela mostró que lo que llega es
     * `unsupported`, con el error 131051 adentro. O sea que el arreglo no
     * disparaba justo en los mensajes que lo motivaron.
     *
     * Van los dos nombres: cuál de ellos use Meta no es algo que este código
     * pueda decidir, y equivocarse cuesta una burbuja muda.
     */
    case "unsupported":
    case "unknown": {
      const err = obj(lista(msg.errors)[0]);
      const titulo = texto(err?.title);
      /*
       * El caso real es el 131051: «mensaje de un tipo que no se soporta». Le
       * pasa a las encuestas, los mensajes efímeros y los eventos, que la API
       * de negocios no recibe. Vale la pena decirlo en castellano, porque lo
       * que hay que hacer es concreto: pedirle a la persona que lo reenvíe
       * como texto o como foto.
       */
      const codigo = err?.code;
      if (codigo === 131051 || Number(codigo) === 131051) {
        return "La persona mandó algo que WhatsApp no deja recibir acá (una encuesta, un mensaje que se borra solo o algo parecido). Hay que pedirle que lo reenvíe como texto o como foto.";
      }
      return titulo
        ? `No se pudo recibir este mensaje (${titulo})`
        : "No se pudo recibir este mensaje";
    }

    /*
     * Una reacción guardada como mensaje.
     *
     * No debería existir: las reacciones salen por su propia puerta más
     * arriba y no entran en la tabla de mensajes. Pero en la base de la
     * escuela hay cinco de antes de que eso existiera, y cada una es una
     * burbuja vacía en medio de una conversación.
     *
     * Se leen para que digan qué son. Las nuevas siguen sin entrar.
     */
    case "reaction": {
      const emoji = texto(obj(msg.reaction)?.emoji);
      return emoji ? `Reaccionó con ${emoji}` : "Quitó su reacción";
    }

    default:
      return null;
  }
}

/**
 * De dónde vino esta persona, cuando llegó por un anuncio.
 *
 * WhatsApp adjunta un bloque `referral` a los mensajes de quien entró desde un
 * anuncio de Facebook o Instagram, o desde un enlace publicado en otro lado
 * —incluido TikTok—. Trae el titular del anuncio y la dirección de origen.
 *
 * Se usa SÓLO cuando el mensaje no trae texto propio. Si la persona escribió
 * algo, lo que se muestra es lo que escribió: pegarle el nombre del anuncio a
 * sus palabras sería ponerle en la boca algo que no dijo.
 */
function deDondeVino(msg: Record<string, unknown>): string | null {
  const ref = obj(msg.referral);
  if (!ref) return null;

  const titular = texto(ref.headline) ?? texto(ref.body);
  const clase = texto(ref.source_type)?.toLowerCase();
  const donde = clase === "ad" ? "un anuncio" : clase === "post" ? "una publicación" : "un enlace";

  return titular
    ? `Abrió el chat desde ${donde}: «${titular}»`
    : `Abrió el chat desde ${donde}`;
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

/**
 * ¿Este mensaje es la respuesta al pedido de permiso para llamar?
 *
 * Devuelve null para todo lo demás, que es casi todo. La fecha de vencimiento
 * viene en segundos desde epoch, como todas las de Meta; si no viene, se
 * devuelve null y NO se inventa un plazo: un permiso sin fecha es un permiso
 * que no se puede comprobar, y llamar creyendo que se puede es peor que no
 * llamar.
 */
function leerPermiso(
  msg: Record<string, unknown>,
  tipo: string,
): { acepto: boolean; vence: Date | null } | null {
  if (tipo !== "interactive") return null;

  const inter = obj(msg.interactive);
  if (texto(inter?.type) !== "call_permission_reply") return null;

  const cuerpo = obj(inter?.call_permission_reply);
  const respuesta = texto(cuerpo?.response)?.toLowerCase();
  if (!respuesta) return null;

  const marca = cuerpo?.expiration_timestamp;
  const segundos =
    typeof marca === "number" ? marca : typeof marca === "string" ? Number(marca) : NaN;

  return {
    acepto: respuesta === "accept" || respuesta === "accepted",
    vence: Number.isFinite(segundos) && segundos > 0 ? new Date(segundos * 1000) : null,
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
    order: "Pedido del catálogo",
    request_welcome: "Abrió el chat",
    system: "Aviso de WhatsApp",
    unknown: "Mensaje que no se pudo recibir",
    unsupported: "Mensaje que WhatsApp no deja recibir acá",
    reaction: "Reacción",
  };
  return etiquetas[tipo] ?? sinNombre(tipo);
}

/**
 * El último recurso, cuando llega un tipo que este código no conoce.
 *
 * Antes decía «Mensaje» a secas, y eso es lo peor que puede decir: quien
 * atiende ve que la persona mandó algo, no sabe qué, y no tiene ni cómo
 * averiguarlo ni qué pedirle a quien mantiene el CRM.
 *
 * Nombrar el tipo no lo arregla, pero lo hace reportable: «me llega uno que
 * dice location_share» es un pedido que se puede resolver en un rato. Meta
 * agrega tipos nuevos cada tanto, así que esto va a volver a pasar.
 *
 * El contenido no se pierde igual: el JSON entero queda en `mensajes.payload`.
 */
const sinNombre = (tipo: string): string =>
  tipo && tipo !== "desconocido" ? `Mensaje de tipo «${tipo}»` : "Mensaje";
