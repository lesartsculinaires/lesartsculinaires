import "server-only";

/**
 * Envío por la API de mensajes de Instagram.
 *
 * El gemelo de `src/lib/whatsapp/enviar.ts`. El token vive sólo acá, en el
 * servidor, y sin el prefijo `NEXT_PUBLIC_`: si llegara al navegador,
 * cualquiera que abriera el inspector podría escribir desde la cuenta de la
 * escuela.
 *
 * ============================================================================
 * LO QUE ACÁ NO HAY, Y NO ES QUE FALTE ESCRIBIRLO
 * ============================================================================
 *
 * NO HAY PLANTILLAS. Es la diferencia más grande con WhatsApp y la que más
 * cambia cómo se trabaja. En WhatsApp, pasada la ventana, todavía se puede
 * escribir primero con algo aprobado por Meta. En Instagram no existe nada
 * parecido: pasada la ventana, no hay forma de escribir primero. Hay que
 * esperar a que la persona vuelva a escribir.
 *
 * Por eso `canales.ts` dice `plantillas: "no"` para Instagram, y por eso la
 * bandeja esconde ese botón en los hilos de Instagram en vez de ofrecerlo y
 * fallar.
 *
 * ============================================================================
 * LA VENTANA ES DE SIETE DÍAS, NO DE VEINTICUATRO HORAS
 * ============================================================================
 *
 * Meta abre 24 horas para respuestas automáticas y hasta siete días cuando
 * contesta una persona de verdad, que es lo que llaman «human agent». En esta
 * bandeja siempre contesta una persona, así que corresponde la de siete días
 * —y hay que PEDIRLA: es la etiqueta `HUMAN_AGENT` en el envío—.
 *
 * Sin esa etiqueta, un mensaje del día tres se rechaza aunque el plazo esté
 * abierto, y la asesora vería un error donde en realidad todavía se podía
 * contestar.
 */

/*
 * La versión de Graph.
 *
 * Aparte de la de WhatsApp —que está en `whatsapp/enviar.ts`— a propósito. Son
 * dos integraciones distintas y no tienen por qué subir de versión el mismo
 * día: atar las dos a una constante compartida obligaría a probar WhatsApp
 * entero cada vez que Instagram necesite algo nuevo.
 */
const VERSION = "v21.0";

/**
 * A qué Graph le hablamos: Meta tiene DOS Instagram y no son intercambiables.
 *
 * ============================================================================
 * LOS DOS MODELOS
 * ============================================================================
 *
 * Meta ofrece dos formas de conectar la mensajería de Instagram, y cada una
 * tiene su propio servidor, su propio tipo de token y su propia forma de
 * configurarse:
 *
 *   FACEBOOK LOGIN FOR BUSINESS   `graph.facebook.com`, token DE PÁGINA, y hay
 *                                 que vincular una página de Facebook. El token
 *                                 no expira.
 *
 *   INSTAGRAM BUSINESS LOGIN      `graph.instagram.com`, token DE INSTAGRAM, y
 *                                 no hace falta ninguna página. El token expira
 *                                 a los 60 días y hay que renovarlo.
 *
 * Los dos mandan el MISMO webhook —por eso recibir funciona con cualquiera—,
 * pero para responder hay que pegarle al servidor que corresponde. Con el
 * equivocado, Meta contesta «Invalid OAuth 2.0 Access Token» aunque el token
 * esté perfecto.
 *
 * ============================================================================
 * POR QUÉ ES UNA VARIABLE Y NO SE ADIVINA
 * ============================================================================
 *
 * Se pensó en probar uno y, si falla, probar el otro. No se hizo: un token de
 * verdad vencido daría exactamente el mismo error que un servidor equivocado, y
 * el reintento convertiría «hay que renovar el token» en «probé los dos y
 * ninguno anda», que es peor para quien lo tenga que arreglar.
 *
 * Por omisión `facebook`, que es como estaba antes de que esto existiera: quien
 * ya lo tenía andando no tiene que tocar nada.
 */
const base = (): string =>
  (process.env.INSTAGRAM_API ?? "").trim().toLowerCase() === "instagram"
    ? `https://graph.instagram.com/${VERSION}`
    : `https://graph.facebook.com/${VERSION}`;

export interface ResultadoIg {
  ok: boolean;
  /** El `mid` que le puso Meta al mensaje. Sirve para seguirle el estado. */
  mid: string | null;
  error: string | null;
}

/**
 * ¿Está configurado el canal en el servidor?
 *
 * Distinto de que el CRM sepa hablar Instagram —eso lo dice `canales.ts`—:
 * esto es si están puestas las credenciales. La bandeja necesita las dos cosas
 * para decidir si el cuadro de escribir se habilita o se explica por qué no.
 */
export const hayInstagram = (): boolean =>
  Boolean(process.env.INSTAGRAM_TOKEN && process.env.INSTAGRAM_ACCOUNT_ID);

/**
 * Le escribe a una persona por Instagram.
 *
 * `igsid` es el identificador de esa persona frente a esta cuenta, el mismo que
 * quedó guardado en `conversaciones.identificador`. No es un número de teléfono
 * y no sirve en ninguna otra cuenta.
 */
export async function enviarTextoIg(igsid: string, texto: string): Promise<ResultadoIg> {
  return mandar(igsid, { text: texto });
}

/**
 * Manda una foto, un video o un documento.
 *
 * Igual que en WhatsApp va por enlace y no subiendo los bytes: el servidor le
 * pasa a Meta una dirección firmada del bucket y Meta la busca por su cuenta,
 * así que mandar veinte megas le cuesta lo mismo que mandar veinte kilos. El
 * razonamiento completo está en `whatsapp/enviar.ts`.
 *
 * `clase` es lo que Meta llama el tipo del adjunto: `image`, `video`, `audio`
 * o `file`. No lo adivina del mime, así que se lo decide quien llama —que es
 * quien sabe qué está mandando— con `claseDeAdjunto`.
 */
export async function enviarAdjuntoIg(
  igsid: string,
  enlace: string,
  clase: "image" | "video" | "audio" | "file",
): Promise<ResultadoIg> {
  return mandar(igsid, {
    attachment: {
      type: clase,
      payload: {
        url: enlace,
        /*
         * `is_reusable: false`.
         *
         * Con `true`, Meta se queda con una copia y devuelve un id para
         * reutilizarlo. No sirve acá: cada cotización que se manda es distinta,
         * y guardar copias de los archivos de los clientes en Meta es dejar
         * datos de la escuela donde no hacen falta.
         */
        is_reusable: false,
      },
    },
  });
}

/**
 * Qué clase de adjunto es, según su tipo de archivo.
 *
 * Instagram sólo reconoce cuatro, y lo que no cae en las tres primeras va como
 * `file`. Mandar un PDF marcado como `image` no se rechaza: se entrega roto, y
 * el cliente recibe una foto que no se abre.
 */
export function claseDeAdjunto(mime: string | null): "image" | "video" | "audio" | "file" {
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "file";
}

/**
 * El envío en sí.
 *
 * Uno solo para texto y adjuntos porque a Meta le va el mismo cuerpo con la
 * clave `message` cambiada. Lo que no cambia es lo importante: el destinatario,
 * la etiqueta de agente humano, y el manejo del error.
 */
async function mandar(igsid: string, mensaje: unknown): Promise<ResultadoIg> {
  const token = process.env.INSTAGRAM_TOKEN;
  const cuenta = process.env.INSTAGRAM_ACCOUNT_ID;

  if (!token || !cuenta) {
    return {
      ok: false,
      mid: null,
      error: "Instagram no está configurado en el servidor.",
    };
  }

  try {
    const r = await fetch(`${base()}/${cuenta}/messages`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        recipient: { id: igsid },
        message: mensaje,
        /*
         * La etiqueta que abre los siete días.
         *
         * Ver el encabezado: sin esto, la ventana son 24 horas y un mensaje
         * del día tres se rechaza aunque Meta todavía lo permitiera. En esta
         * bandeja siempre contesta una persona del equipo, así que la etiqueta
         * dice la verdad —que es la condición que pone Meta para aceptarla—.
         */
        messaging_type: "MESSAGE_TAG",
        tag: "HUMAN_AGENT",
      }),
    });

    const cuerpo = (await r.json().catch(() => null)) as
      | { message_id?: string; error?: { message?: string; code?: number; error_subcode?: number } }
      | null;

    if (!r.ok) return { ok: false, mid: null, error: explicar(cuerpo?.error, r.status) };

    return { ok: true, mid: cuerpo?.message_id ?? null, error: null };
  } catch (e) {
    return {
      ok: false,
      mid: null,
      error: e instanceof Error ? e.message : "No se pudo contactar a Instagram.",
    };
  }
}

/**
 * Traduce el error de Meta a algo que se pueda hacer.
 *
 * El 10 con subcódigo 2534022 es el que más va a aparecer y el más confuso
 * crudo: se acabó la ventana. En WhatsApp ahí se ofrece una plantilla; acá no
 * hay ninguna que ofrecer, y el mensaje tiene que decir eso, porque si no
 * alguien se va a quedar buscando el botón que no existe.
 */
function explicar(
  error: { message?: string; code?: number; error_subcode?: number } | undefined,
  estado: number,
): string {
  if (error?.error_subcode === 2534022 || error?.code === 10) {
    return (
      "Pasaron más de siete días desde el último mensaje de esta persona. " +
      "Instagram ya no deja escribirle: hay que esperar a que vuelva a escribir. " +
      "A diferencia de WhatsApp, no hay plantillas para reabrir la conversación."
    );
  }
  /*
   * El 190 tiene DOS causas y se parecen tanto que confunden a cualquiera.
   *
   * La obvia es que el token venció. La otra, mucho menos obvia, es que el
   * token esté perfecto pero se lo esté mandando al Graph equivocado: Meta
   * tiene dos Instagram —ver `base()` acá arriba— y un token de Instagram
   * contra `graph.facebook.com` devuelve exactamente este mismo error que un
   * token vencido.
   *
   * Pasó de verdad al conectar la cuenta de la escuela. Por eso el mensaje
   * nombra las dos y dice contra cuál se está hablando: sin ese dato, quien lo
   * lea va a renovar el token una y otra vez sin que cambie nada.
   */
  if (error?.code === 190 || estado === 401) {
    const contra = base().includes("graph.instagram.com")
      ? "graph.instagram.com (Instagram Business Login)"
      : "graph.facebook.com (Facebook Login for Business)";
    return (
      `Instagram rechazó el token. Se está hablando contra ${contra}. ` +
      "O el token venció y hay que renovarlo en Meta, o es de la OTRA forma de " +
      "conectar Instagram: en ese caso hay que cambiar la variable INSTAGRAM_API " +
      "(«facebook» o «instagram»), no el token."
    );
  }
  /*
   * 100 con subcódigo 2534014: el IGSID no existe o no es de esta cuenta.
   *
   * Vale la pena distinguirlo porque suele significar algo concreto: la
   * persona borró su cuenta, o el hilo se guardó con el identificador de OTRA
   * cuenta de Instagram. Un IGSID sólo sirve frente a la cuenta que lo emitió.
   */
  if (error?.error_subcode === 2534014) {
    return (
      "Instagram no reconoce a esta persona. Puede que haya borrado su cuenta, " +
      "o que este hilo sea de otra cuenta de Instagram distinta a la conectada."
    );
  }
  if (error?.code === 200 || estado === 403) {
    return (
      "La aplicación no tiene permiso para mandar mensajes por Instagram. " +
      "Faltan los permisos de mensajería o la revisión de Meta todavía no está aprobada."
    );
  }
  return error?.message ?? `Instagram respondió con error ${estado}.`;
}

/**
 * El nombre y el @usuario de una persona.
 *
 * ----------------------------------------------------------------------------
 * POR QUÉ ES UNA CONSULTA APARTE
 * ----------------------------------------------------------------------------
 *
 * En WhatsApp el nombre de perfil viene DENTRO del webhook, junto al mensaje.
 * En Instagram no viene nada: el webhook trae el IGSID y el texto, y punto. Sin
 * esta consulta, la bandeja mostraría hilos titulados con un número de
 * diecisiete dígitos, y la ficha del cliente se llamaría igual.
 *
 * Se hace una sola vez, cuando el hilo es nuevo. Es una llamada más a Meta y
 * hay que pagarla una vez por persona, no una por mensaje.
 *
 * ----------------------------------------------------------------------------
 * PUEDE NO DEVOLVER NADA, Y ESO NO ES UN ERROR
 * ----------------------------------------------------------------------------
 *
 * Meta entrega el @usuario sólo si la persona no lo tiene restringido. Cuando
 * no lo entrega se sigue igual con lo que haya: primero el nombre, después el
 * @usuario, y si no hay ninguno «Contacto de Instagram». Lo que nunca se usa de
 * nombre es el IGSID, que no le dice nada a nadie.
 */
export async function perfilDe(
  igsid: string,
): Promise<{ nombre: string | null; usuario: string | null }> {
  const token = process.env.INSTAGRAM_TOKEN;
  if (!token) return { nombre: null, usuario: null };

  try {
    const r = await fetch(
      `${base()}/${igsid}?fields=name,username`,
      { headers: { authorization: `Bearer ${token}` } },
    );

    if (!r.ok) return { nombre: null, usuario: null };

    const cuerpo = (await r.json().catch(() => null)) as
      | { name?: string; username?: string }
      | null;

    const limpio = (v: unknown) =>
      typeof v === "string" && v.trim() !== "" ? v.trim() : null;

    return { nombre: limpio(cuerpo?.name), usuario: limpio(cuerpo?.username) };
  } catch {
    // Que no se pueda averiguar el nombre no puede costar el mensaje. El hilo
    // se abre igual y el nombre se completa la próxima vez que escriba.
    return { nombre: null, usuario: null };
  }
}
