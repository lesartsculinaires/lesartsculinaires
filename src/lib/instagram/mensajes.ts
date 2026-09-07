/**
 * Lectura del webhook de Instagram.
 *
 * El gemelo de `src/lib/whatsapp/mensajes.ts`: va aparte y sin dependencias del
 * servidor para poder probarlo con cargas reales sin levantar nada.
 *
 * ============================================================================
 * ES OTRO FORMATO, NO EL MISMO CON OTRO NOMBRE
 * ============================================================================
 *
 * Los dos son de Meta y los dos llegan a un webhook firmado, pero adentro no se
 * parecen. En WhatsApp los mensajes cuelgan de `entry[].changes[].value.messages`
 * y quien escribe está en `from`. En Instagram cuelgan de `entry[].messaging[]`
 * y quien escribe está en `sender.id`.
 *
 * Tres diferencias importan de verdad, y las tres han roto integraciones ajenas:
 *
 *   LA HORA VIENE EN MILISEGUNDOS   WhatsApp manda segundos desde epoch;
 *                                   Instagram, milisegundos. Multiplicar por
 *                                   mil como en WhatsApp pone los mensajes en
 *                                   el año 57.000 y la bandeja se ordena al
 *                                   revés. Acá NO se multiplica.
 *
 *   EL ARCHIVO VIENE COMO URL       WhatsApp manda un id con el que hay que
 *                                   pedir el archivo aparte. Instagram manda
 *                                   la URL directa, firmada y con vencimiento
 *                                   corto: hay que bajarla cuando llega, no
 *                                   cuando alguien abre el hilo.
 *
 *   LOS PROPIOS MENSAJES VUELVEN    Si alguien contesta desde la aplicación de
 *                                   Instagram en su teléfono, Meta manda ese
 *                                   mensaje de vuelta marcado `is_echo`. Es
 *                                   una ventaja —el hilo del CRM queda igual
 *                                   que el real— pero hay que guardarlo como
 *                                   SALIENTE y sin subir el contador de sin
 *                                   leer, o la bandeja mostraría pendientes
 *                                   que ya se contestaron.
 *
 * ============================================================================
 * NO HAY TELÉFONO, HAY IGSID
 * ============================================================================
 *
 * Meta no entrega el número ni el correo de quien escribe por Instagram. Lo que
 * hay es un IGSID: un número largo que identifica a esa persona FRENTE A ESTA
 * CUENTA y a ninguna otra. Es lo que va en `conversaciones.identificador`, y el
 * porqué de que no vaya en `telefono` está escrito en la migración
 * `20261024120000_instagram.sql`.
 */

/** Un mensaje que entró por Instagram. */
export interface MensajeIg {
  /** El `mid` de Meta. Es lo que evita guardar dos veces un reintento. */
  mid: string;
  /** El IGSID de la persona: quien escribió, o a quien le escribimos. */
  igsid: string;
  /**
   * Lo mandamos nosotros y vuelve por el webhook.
   *
   * Pasa cuando alguien del equipo contesta desde la aplicación de Instagram en
   * lugar de hacerlo desde el CRM. Va al hilo como saliente y no cuenta como
   * pendiente: ya está contestado.
   */
  esEco: boolean;
  tipo: string;
  /** Texto plano. Nulo cuando es una foto, un audio o un compartido. */
  texto: string | null;
  enviadoEn: Date;
  /** El adjunto, con su URL ya firmada por Meta. Nulo en los de texto. */
  media: MediaIg | null;
  /** El objeto tal cual vino, para no perder lo que hoy no se usa. */
  crudo: unknown;
}

/**
 * Un adjunto de Instagram.
 *
 * A diferencia de WhatsApp, acá viene la URL y no un id. Está firmada y vence
 * en minutos, así que se baja apenas llega el mensaje: para cuando alguien abra
 * el hilo, el enlace ya no sirve.
 */
export interface MediaIg {
  /** De dónde bajarlo. Vence rápido. */
  url: string;
  /** `image`, `video`, `audio`, `file`, `share`, `story_mention`… */
  clase: string;
}

/**
 * Reacción a un mensaje.
 *
 * Igual que en WhatsApp sale por su propia puerta: no es un mensaje, y meterla
 * en el hilo dejaría una burbuja vacía por cada corazón.
 */
export interface ReaccionIg {
  igsid: string;
  /** El mensaje sobre el que reaccionó. */
  sobreMid: string;
  /** Null cuando lo que hizo fue sacarla. */
  emoji: string | null;
  cuando: Date;
}

/** La persona leyó hasta acá. */
export interface LecturaIg {
  igsid: string;
  /** El último mensaje que vio, cuando Meta lo dice. */
  hastaMid: string | null;
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
 * Saca de una carga del webhook lo que la bandeja necesita.
 *
 * Lo que no se entiende se salta en silencio en vez de tumbar la petición: si
 * el webhook devuelve error, Meta reintenta y termina desactivándolo, y por un
 * mensaje raro se perderían todos los demás.
 */
export function leerWebhookIg(carga: unknown): {
  mensajes: MensajeIg[];
  reacciones: ReaccionIg[];
  lecturas: LecturaIg[];
} {
  const mensajes: MensajeIg[] = [];
  const reacciones: ReaccionIg[] = [];
  const lecturas: LecturaIg[] = [];

  const raiz = obj(carga);
  if (!raiz) return { mensajes, reacciones, lecturas };

  for (const e of lista(raiz.entry)) {
    const entrada = obj(e);
    if (!entrada) continue;

    /*
     * `messaging` es el nombre en la ruta de Facebook Login; `standby`, el de
     * las conversaciones que en ese momento maneja otra aplicación (el
     * «handover protocol» de Meta).
     *
     * Se leen las dos. Si la escuela tiene también un bot de respuestas
     * automáticas conectado a la misma cuenta, las conversaciones que ese bot
     * esté atendiendo llegan por `standby`: sin leerlas, esos mensajes no
     * aparecerían en la bandeja y quien atiende no vería la mitad del hilo.
     */
    for (const s of [...lista(entrada.messaging), ...lista(entrada.standby)]) {
      const sobre = obj(s);
      if (!sobre) continue;

      const emisor = texto(obj(sobre.sender)?.id);
      const destino = texto(obj(sobre.recipient)?.id);
      if (!emisor || !destino) continue;

      /*
       * La hora, en milisegundos.
       *
       * Ver el comentario de arriba: acá NO se multiplica por mil. Si falta o
       * no es un número, se usa la de ahora en vez de descartar el mensaje —un
       * mensaje con la hora aproximada sirve; uno perdido, no—.
       */
      const marca = Number(sobre.timestamp);
      const cuando =
        Number.isFinite(marca) && marca > 0 ? new Date(marca) : new Date();

      // La reacción antes que el mensaje: viene en su propia clave y no
      // trae `message`, así que si no se saca acá se pierde.
      const reaccion = obj(sobre.reaction);
      if (reaccion) {
        const sobreMid = texto(reaccion.mid);
        if (sobreMid) {
          reacciones.push({
            igsid: emisor,
            sobreMid,
            // `unreact` es sacarla. Meta manda el emoji igual, así que sin
            // mirar la acción una reacción quitada se guardaría como puesta.
            emoji: texto(reaccion.action) === "unreact" ? null : texto(reaccion.emoji),
            cuando,
          });
        }
        continue;
      }

      const leido = obj(sobre.read);
      if (leido) {
        lecturas.push({ igsid: emisor, hastaMid: texto(leido.mid), cuando });
        continue;
      }

      const mensaje = obj(sobre.message);
      if (!mensaje) continue;

      const mid = texto(mensaje.mid);
      if (!mid) continue;

      const esEco = mensaje.is_echo === true;

      /*
       * De quién es el hilo.
       *
       * En un mensaje normal, de quien escribió. En un eco —uno nuestro que
       * vuelve— el emisor es la cuenta de la escuela, así que la persona es el
       * DESTINATARIO. Tomar siempre el emisor abriría un hilo con la escuela
       * misma cada vez que alguien contesta desde el teléfono.
       */
      const igsid = esEco ? destino : emisor;

      const media = leerAdjunto(mensaje);

      mensajes.push({
        mid,
        igsid,
        esEco,
        tipo: media?.clase ?? "text",
        texto: texto(mensaje.text),
        enviadoEn: cuando,
        media,
        crudo: s,
      });
    }
  }

  return { mensajes, reacciones, lecturas };
}

/**
 * El adjunto, si lo hay.
 *
 * Instagram manda un arreglo pero un mensaje trae uno solo: mandar tres fotos
 * son tres mensajes, cada uno con su `mid`. Se toma el primero y se ignora el
 * resto —hoy no existe— en vez de inventar una estructura para algo que Meta
 * no produce.
 *
 * Los tipos que no son un archivo —`share` de una publicación,
 * `story_mention`, `location`— traen igual una URL, y esa URL es lo que hay que
 * mostrar: quien atiende necesita ver a qué publicación se refiere el mensaje
 * «me interesa este curso».
 */
function leerAdjunto(mensaje: Record<string, unknown>): MediaIg | null {
  const primero = obj(lista(mensaje.attachments)[0]);
  if (!primero) return null;

  const url = texto(obj(primero.payload)?.url);
  const clase = texto(primero.type) ?? "file";
  if (!url) return null;

  return { url, clase };
}

/**
 * Cómo se muestra en la lista un mensaje que no trae texto.
 *
 * El gemelo de `resumen` en WhatsApp, con los tipos que sí existen en
 * Instagram. `story_mention` y `story_reply` son los dos que no tienen
 * equivalente y son los más comunes: alguien nos etiqueta en su historia, o
 * contesta a una nuestra. Decir «Mensaje» ahí perdería justo lo que hace falta
 * saber para contestar bien.
 */
export function resumenIg(tipo: string, cuerpo: string | null): string {
  const etiquetas: Record<string, string> = {
    image: "Foto",
    video: "Video",
    audio: "Nota de voz",
    file: "Archivo",
    share: "Compartió una publicación",
    story_mention: "Te mencionó en su historia",
    story_reply: "Respondió a tu historia",
    location: "Ubicación",
    fallback: "Mensaje",
  };

  const etiqueta = etiquetas[tipo];

  // Con texto y con adjunto —una foto con pie— se dicen las dos cosas: el pie
  // suele ser el mensaje de verdad y la etiqueta explica qué lo acompaña.
  if (cuerpo && etiqueta && tipo !== "fallback") return `${etiqueta}: ${cuerpo}`;
  if (cuerpo) return cuerpo;
  return etiqueta ?? "Mensaje";
}

/** Los tipos de adjunto que son un archivo que se puede bajar y guardar. */
export const ARCHIVO_IG = new Set(["image", "video", "audio", "file"]);
