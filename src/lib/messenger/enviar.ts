import "server-only";

import {
  limpio,
  motivoDelPerfil,
  perfilPorConversacion,
  sinPerfil,
  type PerfilMeta,
} from "@/lib/meta/perfil";

/**
 * Mandar y recibir por Messenger.
 *
 * ============================================================================
 * MESSENGER ES EL HERMANO FÁCIL
 * ============================================================================
 *
 * Después de la vuelta que dio Instagram —dos Graph, dos modelos de login, dos
 * tipos de token— Messenger no tiene nada de eso. Hay un solo camino:
 * `graph.facebook.com`, el token DE PÁGINA, y el PSID de la persona.
 *
 * De hecho es el mismo token que ya usa Instagram, porque la mensajería de
 * Instagram con Facebook Login viaja por la Página. Por eso las variables de
 * Messenger se caen a las de Instagram cuando no están: hoy valen lo mismo, y
 * obligar a cargar dos veces el mismo valor es una variable más donde pegar mal.
 *
 * ============================================================================
 * LA VENTANA, Y POR QUÉ NO HAY PLANTILLAS
 * ============================================================================
 *
 * Igual que Instagram: 24 horas para respuestas automáticas, siete días cuando
 * contesta una persona del equipo —la etiqueta `HUMAN_AGENT`—. Y no hay
 * plantillas aprobadas con que reabrir una conversación vencida. Si la persona
 * no vuelve a escribir, no hay forma de escribirle primero.
 */

/**
 * La versión de Graph.
 *
 * Aparte de la de Instagram y la de WhatsApp a propósito: son tres integraciones
 * y no tienen por qué subir de versión el mismo día.
 */
const VERSION = "v21.0";

/**
 * A qué servidor le hablamos.
 *
 * ----------------------------------------------------------------------------
 * POR QUÉ SÓLO SE ACEPTA UNA DIRECCIÓN LOCAL
 * ----------------------------------------------------------------------------
 *
 * Porque acá viaja el token de Página de la escuela. Una variable que decida a
 * dónde se manda es, mal puesta —o puesta por quien no debía—, una forma de
 * entregarle esa credencial a otro servidor.
 *
 * Aceptar sólo `127.0.0.1` o `localhost` cierra eso del todo: el destino tiene
 * que ser la misma máquina donde ya corre el CRM, así que no hay nada que
 * llevarse. Cualquier otro valor se ignora en silencio y se usa el de Meta, que
 * es lo correcto en producción. Es la misma regla que WhatsApp e Instagram.
 */
function base(): string {
  const propuesta = process.env.MESSENGER_GRAPH_URL;
  if (propuesta && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(propuesta.trim())) {
    return `${propuesta.trim()}/${VERSION}`;
  }
  return `https://graph.facebook.com/${VERSION}`;
}

/**
 * El token de Página.
 *
 * Se cae al de Instagram porque es el mismo: con Facebook Login for Business, la
 * mensajería de Instagram usa el token de la Página, no uno propio. Ver el
 * encabezado.
 */
const elToken = (): string | undefined =>
  process.env.MESSENGER_TOKEN ?? process.env.INSTAGRAM_TOKEN;

/**
 * El id de la Página.
 *
 * Se cae a `INSTAGRAM_ACCOUNT_ID` por la misma razón, y hay que decir una cosa
 * incómoda: esa variable, con Facebook Login, GUARDA EL ID DE LA PÁGINA aunque
 * el nombre diga otra cosa. Está explicado en `instagram/enviar.ts`, con la
 * prueba que lo demuestra.
 *
 * O sea que hoy el respaldo funciona porque las dos apuntan a lo mismo. El día
 * que Meta habilite el camino de la Instagram Platform y `INSTAGRAM_ACCOUNT_ID`
 * pase a llevar el id de la cuenta de Instagram, este respaldo deja de servir y
 * hay que cargar `MESSENGER_PAGE_ID`. Queda dicho acá para que ese día se
 * encuentre leyendo, y no probando.
 */
const laPagina = (): string | undefined =>
  process.env.MESSENGER_PAGE_ID ?? process.env.INSTAGRAM_ACCOUNT_ID;

export interface ResultadoMsn {
  ok: boolean;
  /** El `mid` que le puso Meta al mensaje. Sirve para seguirle el estado. */
  mid: string | null;
  error: string | null;
}

/**
 * ¿Está configurado el canal en el servidor?
 *
 * Distinto de que el CRM sepa hablar Messenger —eso lo dice `canales.ts`—: esto
 * es si están puestas las credenciales. La bandeja necesita las dos cosas para
 * decidir si el cuadro de escribir se habilita o se explica por qué no.
 */
export const hayMessenger = (): boolean => Boolean(elToken() && laPagina());

/**
 * Le escribe a una persona por Messenger.
 *
 * `psid` es el identificador de esa persona frente a ESTA página, el mismo que
 * quedó guardado en `conversaciones.identificador`. No es un número de teléfono,
 * no es su perfil de Facebook, y no sirve en ninguna otra página.
 */
export async function enviarTextoMsn(psid: string, texto: string): Promise<ResultadoMsn> {
  return mandar(psid, { text: texto });
}

/**
 * Manda una foto, un video, un audio o un documento.
 *
 * Igual que en WhatsApp e Instagram va por enlace y no subiendo los bytes: el
 * servidor le pasa a Meta una dirección firmada del bucket y Meta la busca por
 * su cuenta.
 */
export async function enviarAdjuntoMsn(
  psid: string,
  enlace: string,
  clase: "image" | "video" | "audio" | "file",
): Promise<ResultadoMsn> {
  return mandar(psid, {
    attachment: {
      type: clase,
      payload: {
        url: enlace,
        // Sin copia en Meta: cada cotización que se manda es distinta, y dejar
        // archivos de los clientes en Meta es dejar datos donde no hacen falta.
        is_reusable: false,
      },
    },
  });
}

/** Qué clase de adjunto es, según su tipo de archivo. */
export function claseDeAdjuntoMsn(mime: string | null): "image" | "video" | "audio" | "file" {
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "file";
}

/** El envío en sí. Uno solo para texto y adjuntos: a Meta le va el mismo cuerpo. */
async function mandar(psid: string, mensaje: unknown): Promise<ResultadoMsn> {
  const token = elToken();
  const pagina = laPagina();

  if (!token || !pagina) {
    return { ok: false, mid: null, error: "Messenger no está configurado en el servidor." };
  }

  try {
    const r = await fetch(`${base()}/${pagina}/messages`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        recipient: { id: psid },
        message: mensaje,
        /*
         * La etiqueta que abre los siete días.
         *
         * Sin esto la ventana son 24 horas y un mensaje del día tres se rechaza
         * aunque Meta todavía lo permitiera. En esta bandeja siempre contesta
         * una persona del equipo, así que la etiqueta dice la verdad, que es la
         * condición que pone Meta para aceptarla.
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
      error: e instanceof Error ? e.message : "No se pudo contactar a Messenger.",
    };
  }
}

/**
 * Traduce el error de Meta a algo que se pueda hacer.
 *
 * Los tres que van a aparecer de verdad, con lo que hay que hacer en cada uno.
 * El resto vuelve tal cual: inventarle una explicación a un error que no
 * conocemos sería peor que mostrar el texto de Meta.
 */
function explicar(
  error: { message?: string; code?: number; error_subcode?: number } | undefined,
  estado: number,
): string {
  if (error?.error_subcode === 2534022 || error?.code === 10) {
    return (
      "Pasaron más de siete días desde el último mensaje de esta persona. " +
      "Messenger ya no deja escribirle: hay que esperar a que vuelva a escribir. " +
      "A diferencia de WhatsApp, no hay plantillas para reabrir la conversación."
    );
  }

  if (error?.code === 190 || estado === 401) {
    return (
      "Meta rechazó el token de Página. O venció —si se generó uno de usuario " +
      "en vez de uno de Página, vencen en horas— o le quitaron el permiso " +
      "«pages_messaging» a la aplicación."
    );
  }

  /*
   * El 3 es el que confunde, y ya nos pasó con Instagram.
   *
   * No dice «te falta un permiso» ni «el token está mal»: dice que la aplicación
   * no puede hacer esta llamada, y la causa casi siempre es que está en modo
   * desarrollo o sin Acceso avanzado. Sin esta traducción, quien lo lea va a
   * revisar el token una y otra vez, que es lo único que NO es.
   */
  if (error?.code === 3) {
    return (
      "Meta no le permite a la aplicación mandar este mensaje. Casi siempre es " +
      "que la app está en modo Desarrollo —ahí sólo se le puede escribir a quien " +
      "tenga un rol en ella— o que falta el Acceso avanzado a «pages_messaging». " +
      "El token no tiene nada que ver."
    );
  }

  return error?.message ?? `Messenger devolvió un error (${estado}).`;
}

/**
 * El nombre de esa persona, preguntándoselo a Meta.
 *
 * ============================================================================
 * SON DOS CAMINOS, Y EL SEGUNDO ES EL QUE FUNCIONA
 * ============================================================================
 *
 * `GET /{psid}?fields=name` es el camino documentado y acá DEVUELVE ERROR
 * SIEMPRE. Medido el 22 de septiembre de 2026 contra tres personas que le habían
 * escrito a la Página esa misma madrugada, con el token de Página bueno:
 *
 *     (#100, subcódigo 33) Object with ID '29566976779558028' does not exist,
 *     cannot be loaded due to missing permissions, or does not support this
 *     operation
 *
 * No es el token ni un permiso pendiente: un PSID no es un objeto que se pueda
 * leer suelto. Por eso se intenta igual —si algún día Meta lo habilita, es una
 * llamada más barata— y cuando falla se pregunta por la CONVERSACIÓN, que sí
 * contesta con el nombre. El porqué está escrito en `meta/perfil.ts`.
 *
 * Messenger da nombre y apellido pero NO da @usuario: en Facebook la gente no
 * tiene arroba. Se devuelve null ahí a propósito, en vez de inventar una con el
 * nombre: la bandeja muestra la arroba tal cual cuando existe, y una inventada
 * se leería como si fuera el perfil real de esa persona.
 *
 * Que no se pueda averiguar el nombre no puede costar el mensaje: el hilo se
 * abre igual y el nombre se completa la próxima vez que escriba.
 */
export async function perfilDeMsn(psid: string): Promise<PerfilMeta> {
  const token = elToken();
  const pagina = laPagina();
  if (!token) {
    return sinPerfil("Falta MESSENGER_TOKEN (o INSTAGRAM_TOKEN) en el servidor.");
  }

  try {
    const r = await fetch(`${base()}/${psid}?fields=name`, {
      headers: { authorization: `Bearer ${token}` },
    });

    const cuerpo = (await r.json().catch(() => null)) as
      | { name?: string; error?: { code?: number; message?: string } }
      | null;

    if (!r.ok) {
      const motivo = motivoDelPerfil("Messenger", r.status, cuerpo);

      /*
       * El camino que de verdad contesta.
       *
       * Se guarda el motivo del primero por si el segundo tampoco puede: el
       * error útil para entender qué pasa es casi siempre el de arriba.
       */
      if (pagina) {
        const porHilo = await perfilPorConversacion(
          "Messenger",
          base(),
          token,
          pagina,
          "messenger",
          psid,
        );
        if (porHilo.nombre || porHilo.usuario) return porHilo;
      }

      console.warn(`[messenger] no se pudo leer el perfil de ${psid}: ${motivo}`);
      return sinPerfil(motivo);
    }

    // Messenger no entrega @usuario: el PSID es lo único que identifica a la
    // persona frente a esta página. Poner algo en `usuario` sería inventarlo.
    return { nombre: limpio(cuerpo?.name), usuario: null, motivo: null };
  } catch (e) {
    const motivo = `No se pudo hablar con Meta para leer el perfil: ${
      e instanceof Error ? e.message : String(e)
    }`;
    console.warn(`[messenger] ${motivo}`);
    return sinPerfil(motivo);
  }
}
