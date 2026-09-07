import "server-only";

import { componentesDe } from "@/lib/whatsapp/huecos";

import {
  TOPE_DOCUMENTO_BYTES,
  esDocumentoAceptado,
  tiposQueSePueden,
} from "@/lib/whatsapp/adjuntos";

/**
 * Envío por la API de Meta.
 *
 * El token vive sólo acá, en el servidor, y sin el prefijo `NEXT_PUBLIC_`: si
 * llegara al navegador, cualquiera que abriera el inspector podría mandar
 * mensajes desde el número de la escuela.
 */

const VERSION = "v21.0";

export interface ResultadoEnvio {
  ok: boolean;
  /** Id que le puso Meta al mensaje; sirve para seguirle el estado. */
  waId: string | null;
  error: string | null;
}

export const hayWhatsapp = (): boolean =>
  Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

export async function enviarTexto(
  telefono: string,
  texto: string,
): Promise<ResultadoEnvio> {
  const token = process.env.WHATSAPP_TOKEN;
  const numero = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !numero) {
    return { ok: false, waId: null, error: "WhatsApp no está configurado en el servidor." };
  }

  try {
    const r = await fetch(`https://graph.facebook.com/${VERSION}/${numero}/messages`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: telefono,
        type: "text",
        text: { preview_url: false, body: texto },
      }),
    });

    const cuerpo = (await r.json().catch(() => null)) as
      | { messages?: { id?: string }[]; error?: { message?: string; code?: number } }
      | null;

    if (!r.ok) {
      return { ok: false, waId: null, error: explicar(cuerpo?.error, r.status) };
    }

    return { ok: true, waId: cuerpo?.messages?.[0]?.id ?? null, error: null };
  } catch (e) {
    return {
      ok: false,
      waId: null,
      error: e instanceof Error ? e.message : "No se pudo contactar a WhatsApp.",
    };
  }
}

/**
 * Tope de Meta para una imagen. No es el nuestro: es el de ellos, y mandarles
 * algo más grande falla del otro lado.
 */
export const TOPE_IMAGEN_BYTES = 5 * 1024 * 1024;

/**
 * Manda un documento: un PDF, una planilla, una presentación.
 *
 * ------------------------------------------------------------------------
 * POR QUÉ UN ENLACE Y NO EL ARCHIVO
 * ------------------------------------------------------------------------
 *
 * Meta acepta las dos formas: subirle los bytes y quedarse con un id, o darle
 * una dirección y que él la busque. Antes se le subían los bytes, y eso
 * obligaba a que el archivo entero pasara por el servidor: entraba por la
 * petición, se guardaba en memoria y salía otra vez para Meta. Con 4 MB
 * andaba; con veinte o más no, porque la función tiene diez segundos para
 * contestar y decenas de megas de ida y vuelta no entran siempre en diez.
 *
 * Con el enlace el servidor no toca los bytes ni una vez. Le pasa a Meta una
 * dirección firmada del bucket y Meta la busca por su cuenta, así que mandar
 * veinte megas le cuesta lo mismo que mandar veinte kilos.
 *
 * Lo que se paga: durante los minutos que dura la firma, cualquiera que tenga
 * esa dirección puede bajar el archivo. Es una cadena larga e imposible de
 * adivinar, caduca sola y esto es lo que nosotros le mandamos al cliente —una
 * lista de precios, un temario—, no lo que el cliente nos manda a nosotros.
 * Los comprobantes que llegan siguen sin ser accesibles desde afuera.
 *
 * ------------------------------------------------------------------------
 *
 * `filename` es lo que distingue esto de una foto: sin eso el cliente recibe
 * la lista de precios llamada «document.pdf», que en su teléfono no se
 * distingue de nada.
 */
export async function enviarDocumento(
  telefono: string,
  archivo: { enlace: string; mime: string; nombre: string; bytes: number },
  pie: string,
): Promise<ResultadoEnvio> {
  if (!esDocumentoAceptado(archivo.mime)) {
    return {
      ok: false,
      waId: null,
      error: `WhatsApp no acepta este tipo de archivo. Se pueden mandar ${tiposQueSePueden()}.`,
    };
  }

  if (archivo.bytes > TOPE_DOCUMENTO_BYTES) {
    return {
      ok: false,
      waId: null,
      error:
        `El archivo pesa más de ${TOPE_DOCUMENTO_BYTES / 1024 / 1024} MB, que es el tope. ` +
        "Mandá una versión más liviana o pasale un enlace de descarga.",
    };
  }

  return mandar(telefono, {
    type: "document",
    document: {
      link: archivo.enlace,
      filename: archivo.nombre,
      ...(pie.trim() ? { caption: pie.trim() } : {}),
    },
  });
}

/**
 * Manda una foto.
 *
 * Mismo camino que el documento —un enlace firmado, no los bytes— con dos
 * diferencias: el tope es el de Meta para imágenes, más bajo que el de
 * documentos, y no lleva `filename`, que en una foto Meta rechaza.
 */
export async function enviarImagen(
  telefono: string,
  archivo: { enlace: string; mime: string; nombre: string; bytes: number },
  pie: string,
): Promise<ResultadoEnvio> {
  if (archivo.bytes > TOPE_IMAGEN_BYTES) {
    return {
      ok: false,
      waId: null,
      error: `WhatsApp no acepta imágenes de más de ${TOPE_IMAGEN_BYTES / 1024 / 1024} MB.`,
    };
  }

  return mandar(telefono, {
    type: "image",
    image: pie.trim()
      ? { link: archivo.enlace, caption: pie.trim() }
      : { link: archivo.enlace },
  });
}

/**
 * Le pasa a Meta un mensaje ya armado.
 *
 * Una sola llamada: antes eran dos —subir y después mandar— y el paso de subir
 * se fue con el cambio al enlace. Lo comparten la foto, el documento y
 * cualquier cosa que se agregue mañana; lo único que cada uno pone es su
 * pedazo del cuerpo.
 */
async function mandar(
  telefono: string,
  cuerpoDelMensaje: Record<string, unknown>,
): Promise<ResultadoEnvio> {
  const token = process.env.WHATSAPP_TOKEN;
  const numero = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !numero) {
    return { ok: false, waId: null, error: "WhatsApp no está configurado en el servidor." };
  }

  try {
    const r = await fetch(`https://graph.facebook.com/${VERSION}/${numero}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: telefono,
        ...cuerpoDelMensaje,
      }),
    });

    const cuerpo = (await r.json().catch(() => null)) as
      | { messages?: { id?: string }[]; error?: { message?: string; code?: number } }
      | null;

    if (!r.ok) return { ok: false, waId: null, error: explicar(cuerpo?.error, r.status) };

    return { ok: true, waId: cuerpo?.messages?.[0]?.id ?? null, error: null };
  } catch (e) {
    return {
      ok: false,
      waId: null,
      error: e instanceof Error ? e.message : "No se pudo contactar a WhatsApp.",
    };
  }
}

/**
 * Tope de Meta para audio. Un minuto de nota de voz pesa unos 100 KB, así que
 * dieciséis megas son horas: nunca va a ser el límite que moleste.
 */
export const TOPE_AUDIO_BYTES = 16 * 1024 * 1024;

/**
 * Manda una nota de voz.
 *
 * ------------------------------------------------------------------------
 * EL TIPO ES LA MITAD DEL ASUNTO
 * ------------------------------------------------------------------------
 *
 * Meta acepta varios formatos de audio, pero el que WhatsApp muestra como nota
 * de voz —con la ondita y el botón de reproducir adentro del globo— es Ogg con
 * Opus. Los demás llegan como un archivo adjunto de audio: se pueden escuchar,
 * pero no es lo mismo, y del lado del cliente parece que le mandaron un archivo
 * en vez de hablarle.
 *
 * Por eso el navegador re-empaqueta lo que grabó antes de subirlo (ver
 * `src/lib/audio/ogg.ts`) y acá se comprueba que lo que llega sea eso. Un audio
 * de otro tipo se rechaza antes de mandarlo: mandarlo igual daría un mensaje
 * que el cliente no puede escuchar y nadie de este lado se enteraría.
 *
 * No lleva `caption`: Meta no acepta pie en los audios. Lo que se quiera decir
 * va en un mensaje aparte.
 */
export async function enviarAudio(
  telefono: string,
  archivo: { enlace: string; mime: string; bytes: number },
): Promise<ResultadoEnvio> {
  const tipo = archivo.mime.split(";")[0].trim();

  if (tipo !== "audio/ogg") {
    return {
      ok: false,
      waId: null,
      error:
        "Para que llegue como nota de voz el audio tiene que ser Ogg con Opus, " +
        `y éste es «${tipo}».`,
    };
  }

  if (archivo.bytes > TOPE_AUDIO_BYTES) {
    return {
      ok: false,
      waId: null,
      error: `WhatsApp no acepta audios de más de ${TOPE_AUDIO_BYTES / 1024 / 1024} MB.`,
    };
  }

  return mandar(telefono, { type: "audio", audio: { link: archivo.enlace } });
}

/**
 * Reacciona a un mensaje, o le saca la reacción.
 *
 * ------------------------------------------------------------------------
 * ES UN MENSAJE, AUNQUE NO LO PAREZCA
 * ------------------------------------------------------------------------
 *
 * Para Meta una reacción es un mensaje más: viaja por la misma ruta, devuelve
 * su propio id y —lo que importa— vive bajo la misma ventana de 24 horas. Un
 * corazón sobre un mensaje de hace tres días se rechaza igual que un «hola».
 *
 * Quitar la reacción es mandar la cadena vacía, no borrar nada. Meta lo dice
 * así y es lo que hace la aplicación del teléfono: por eso `emoji` acepta null
 * y se traduce a `""`.
 *
 * `sobreWaId` es el id que Meta le puso al mensaje al que se reacciona, no el
 * id nuestro de la tabla. Un mensaje sin `wa_id` —una nota interna, o uno cuyo
 * envío falló— no se puede reaccionar, y eso se decide antes de llegar acá.
 */
export async function enviarReaccion(
  telefono: string,
  sobreWaId: string,
  emoji: string | null,
): Promise<ResultadoEnvio> {
  return mandar(telefono, {
    type: "reaction",
    reaction: { message_id: sobreWaId, emoji: emoji ?? "" },
  });
}

/**
 * Manda una plantilla aprobada.
 *
 * Es la única forma de escribirle a alguien cuando pasaron 24 horas desde su
 * último mensaje. Va aparte de `enviarTexto` porque el cuerpo que espera Meta
 * es otro: no se manda el texto sino el nombre de la plantilla, su idioma y
 * los valores que van en los huecos, en orden.
 */
export async function enviarPlantilla(
  telefono: string,
  nombre: string,
  idioma: string,
  valores: string[],
  /**
   * El cuerpo de la plantilla, para saber cómo marca sus huecos.
   *
   * Hace falta porque el formato de los parámetros depende de eso y no hay
   * otra manera de averiguarlo: `{{1}}` va como lista, `{{order_id}}` va con
   * el nombre al lado. Sin el cuerpo se cae a lo posicional, que es lo que
   * hacía antes.
   */
  cuerpo?: string | null,
): Promise<ResultadoEnvio> {
  const token = process.env.WHATSAPP_TOKEN;
  const numero = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !numero) {
    return { ok: false, waId: null, error: "WhatsApp no está configurado en el servidor." };
  }

  /*
   * Los huecos, con el formato que use ESTA plantilla.
   *
   * Antes se armaban acá a mano, siempre como lista posicional. Con una
   * plantilla que usa nombres —`{{order_id}}`, que es la que tiene cargada la
   * escuela— eso llegaba mal a Meta y el envío se rechazaba. Ahora lo decide
   * `componentesDe` mirando el cuerpo, que es el único lugar donde se sabe.
   *
   * `cuerpo` puede venir nulo cuando la plantilla se guardó antes de que se
   * sincronizara el texto; ahí se cae a lo de antes, que es lo que había.
   */
  const componentes = cuerpo
    ? componentesDe(cuerpo, valores)
    : valores.length > 0
      ? [{ type: "body", parameters: valores.map((v) => ({ type: "text", text: v })) }]
      : undefined;

  try {
    const r = await fetch(`https://graph.facebook.com/${VERSION}/${numero}/messages`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: telefono,
        type: "template",
        template: {
          name: nombre,
          language: { code: idioma },
          ...(componentes ? { components: componentes } : {}),
        },
      }),
    });

    const cuerpo = (await r.json().catch(() => null)) as
      | { messages?: { id?: string }[]; error?: { message?: string; code?: number } }
      | null;

    if (!r.ok) return { ok: false, waId: null, error: explicar(cuerpo?.error, r.status) };

    return { ok: true, waId: cuerpo?.messages?.[0]?.id ?? null, error: null };
  } catch (e) {
    return {
      ok: false,
      waId: null,
      error: e instanceof Error ? e.message : "No se pudo contactar a WhatsApp.",
    };
  }
}

/**
 * Traduce el error de Meta a algo accionable.
 *
 * ============================================================================
 * POR QUÉ VALE LA PENA UNA TABLA TAN LARGA
 * ============================================================================
 *
 * Porque el mensaje crudo de Meta casi nunca dice qué hacer, y en un envío
 * masivo eso se multiplica por trescientos. La escuela mandó cinco mensajes y
 * fallaron los cinco; lo que vio fue «no llegaron», y con eso no se puede
 * arreglar nada: no se sabe si el problema son los números, la plantilla, el
 * token o la cuenta.
 *
 * ============================================================================
 * LO QUE SEPARA UN FALLO DE UNA CAMPAÑA CAÍDA
 * ============================================================================
 *
 * Hay dos familias, y confundirlas cuesta tiempo:
 *
 *   ES DE ESTE NÚMERO     131026, 131052. Alguien no tiene WhatsApp. Falla uno
 *                         y los demás salen igual. No hay nada que arreglar.
 *
 *   ES DE LA CUENTA O DE  131042, 132015, 133010, 190, 132000, 132001. Falla
 *   LA PLANTILLA          el 100%, siempre. Reintentar no sirve: hay que
 *                         tocar algo en Meta.
 *
 * Por eso `esDeLaCuenta` existe abajo: es lo que le permite al envío cortar y
 * decirlo en vez de marcar a trescientas personas como «no llegó» y dejar a
 * quien mandó pensando que su base de teléfonos está mal.
 */
function explicar(
  error: { message?: string; code?: number; error_subcode?: number } | undefined,
  estado: number,
): string {
  const codigo = error?.code;

  /*
   * 131042: falta la forma de pago. El que más aparece al empezar a mandar.
   *
   * WhatsApp deja mandar gratis mientras se contesta a alguien, y cobra por
   * las conversaciones que inicia la empresa —que es exactamente lo que es un
   * envío masivo—. Sin tarjeta cargada en la cuenta de WhatsApp Business,
   * TODOS los envíos fallan y ninguno llega, aunque el token y la plantilla
   * estén perfectos.
   *
   * Se dice primero porque es el que más se confunde con «los números están
   * mal»: el síntoma es idéntico —cero entregados— y la causa no tiene nada
   * que ver con los teléfonos.
   */
  if (codigo === 131042) {
    return (
      "La cuenta de WhatsApp no tiene forma de pago activa, y Meta cobra los mensajes " +
      "que inicia la empresa —que es lo que es un envío masivo—. Hay que cargar una " +
      "tarjeta en Meta Business Suite → Facturación, en la cuenta de WhatsApp Business. " +
      "Hasta que eso esté, ningún envío masivo va a salir."
    );
  }

  if (codigo === 190 || estado === 401) {
    return "El token de WhatsApp venció o es inválido. Hay que renovarlo en Meta.";
  }

  /*
   * 133010 / 131031: la cuenta o el número están restringidos.
   *
   * Pasa cuando Meta le baja la calificación al número, o cuando la cuenta
   * quedó sin verificar. No se arregla desde el CRM y tampoco reintentando.
   */
  if (codigo === 133010 || codigo === 131031) {
    return (
      "Meta tiene restringida la cuenta o el número de la escuela, así que no deja " +
      "mandar. Se ve el motivo en WhatsApp Manager → Información general; suele ser la " +
      "calificación de calidad del número o una verificación pendiente del negocio."
    );
  }

  // 132015: la plantilla está pausada por mala calidad. Sigue figurando como
  // aprobada, así que desde el CRM no se distingue de una que anda.
  if (codigo === 132015) {
    return (
      "Meta pausó esa plantilla por baja calidad: la gente que la recibió la reportó o " +
      "bloqueó el número. Sigue figurando como aprobada pero no se puede mandar. Hay que " +
      "usar otra, o esperar a que Meta la reactive."
    );
  }

  // 132016: deshabilitada del todo, que es el paso siguiente al pausado.
  if (codigo === 132016) {
    return "Meta deshabilitó esa plantilla y ya no se puede mandar. Hay que crear otra.";
  }

  if (codigo === 132001) {
    return "Meta no encuentra esa plantilla en ese idioma. Puede que la hayan borrado o cambiado; probá sincronizar.";
  }

  if (codigo === 132000) {
    return (
      "La plantilla espera otra cantidad de datos de los que se le mandaron. Suele pasar " +
      "cuando se editó en Meta y el CRM tiene la versión vieja: sincronizá las plantillas " +
      "y volvé a intentar."
    );
  }

  // 132012: el dato en sí. Meta no acepta saltos de línea, tabulaciones ni
  // cuatro espacios seguidos dentro de un hueco.
  if (codigo === 132012) {
    return (
      "Uno de los datos que se puso en la plantilla tiene un formato que Meta no acepta: " +
      "no se pueden usar saltos de línea, tabulaciones ni varios espacios seguidos dentro " +
      "de un hueco."
    );
  }

  /*
   * 130472 y 131049: Meta frenó el mensaje a propósito.
   *
   * No es un error de la escuela. Meta limita cuántos mensajes de promoción
   * recibe una persona por día, y a los que pasan del tope no los entrega. En
   * un envío masivo aparece en algunos y no en otros, y la única lectura útil
   * es que a esa persona hay que escribirle otro día.
   */
  if (codigo === 130472 || codigo === 131049) {
    return (
      "Meta no entregó este mensaje para no saturar a esta persona: recibió demasiados " +
      "mensajes de promoción en poco tiempo. No es un error de la escuela; a esta persona " +
      "conviene escribirle otro día."
    );
  }

  if (codigo === 131047) {
    return "Pasaron más de 24 horas desde el último mensaje de esta persona. WhatsApp ya no deja escribirle libremente; hay que esperar a que escriba o usar una plantilla aprobada.";
  }

  if (codigo === 131026) {
    return "Ese número no tiene WhatsApp o no puede recibir mensajes.";
  }

  // 131052: el número existe pero está mal escrito para Meta —le falta el
  // código de país, o le sobra algo—.
  if (codigo === 131052) {
    return "Meta no reconoce ese número. Suele faltarle el código de país (503) o tener dígitos de más.";
  }

  if (codigo === 131056) {
    return "Se le mandó demasiado seguido a esta misma persona. Hay que esperar un rato antes de reintentar.";
  }

  if (codigo === 80007 || codigo === 4 || estado === 429) {
    return "Se llegó al tope de mensajes que Meta deja mandar por ahora. Hay que esperar y reanudar el envío.";
  }

  return error?.message ?? `WhatsApp respondió con error ${estado}.`;
}

/**
 * ¿Este fallo es de la cuenta y no de este número?
 *
 * ----------------------------------------------------------------------------
 * ES LO QUE EVITA MARCAR A TRESCIENTAS PERSONAS COMO «NO LLEGÓ»
 * ----------------------------------------------------------------------------
 *
 * Cuando falta la forma de pago o la plantilla está pausada, van a fallar los
 * trescientos: el primero ya lo dice todo. Sin esto, el envío sigue adelante,
 * gasta trescientas llamadas a Meta, y termina con una lista de trescientos
 * «no llegaron» que hace parecer que el problema es la base de teléfonos.
 *
 * Con esto el envío corta en el primero, deja al resto en «pendiente» —así se
 * reanuda cuando el problema se arregle, sin volver a mandarle a nadie— y
 * muestra qué hay que tocar.
 *
 * Se decide por el texto y no por el código porque el código ya se perdió: lo
 * que viaja hasta acá es la frase de `explicar`. Se comparan trozos que sólo
 * aparecen en esas frases, no palabras sueltas.
 */
export function esDeLaCuenta(error: string | null | undefined): boolean {
  const t = String(error ?? "");
  return (
    /forma de pago activa/.test(t) ||
    /token de WhatsApp/i.test(t) ||
    /restringida la cuenta/.test(t) ||
    /pausó esa plantilla/.test(t) ||
    /deshabilitó esa plantilla/.test(t) ||
    /no encuentra esa plantilla/.test(t) ||
    /espera otra cantidad de datos/.test(t) ||
    /formato que Meta no acepta/.test(t)
  );
}
