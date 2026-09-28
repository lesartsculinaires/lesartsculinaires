import "server-only";

import { BALDE_WHATSAPP } from "@/lib/whatsapp/adjuntos";
import { carpetaDePlantilla, rutaDeSubida } from "@/lib/whatsapp/imagenDeEncabezado";
import { subirImagenAMeta, type Subida } from "@/lib/whatsapp/subirAMeta";

/**
 * De lo que la pantalla guardó, al identificador que quiere Meta.
 *
 * ============================================================================
 * EL ÚLTIMO PASO ANTES DE MANDAR, Y POR QUÉ ES ESTE
 * ============================================================================
 *
 * La pantalla guarda una de dos cosas: la ruta de una imagen que se subió al
 * bucket —marcada con `subida:`— o una dirección. Meta no quiere ninguna de las
 * dos: quiere la imagen.
 *
 * Antes se le daba la dirección y Meta iba a buscarla. Eso falló en producción
 * de la peor forma: Meta ACEPTA el mensaje, después no puede bajar la imagen, y
 * en el hilo queda «No se pudo entregar · Media upload error» sin que nadie
 * pueda hacer nada. Falló incluso con la dirección de la imagen que Meta tenía
 * aprobada de esa misma plantilla —su propio CDN no la vuelve a servir—.
 *
 * Ahora este módulo consigue los BYTES, vengan de donde vengan, se los sube a
 * Meta y devuelve el identificador. El envío deja de depender de que Meta
 * alcance ningún servidor, y si algo falla, falla acá: antes de mandarle nada a
 * nadie, y con algo que se puede explicar.
 *
 * ============================================================================
 * LOS TRES ORÍGENES
 * ============================================================================
 *
 *   UNA SUBIDA        `subida:saliente/plantillas/…`. Se baja del bucket con la
 *                     sesión de quien manda, que es la única que puede leerla.
 *
 *   UNA DIRECCIÓN     Pegada a mano, o la que Meta guardó al aprobar la
 *                     plantilla. Se baja desde el servidor. Que el servidor
 *                     pueda bajarla no garantiza que Meta pudiera —de hecho no
 *                     podía— y por eso igual se sube.
 *
 *   NADA              La plantilla no lleva archivo de encabezado. No se hace
 *                     ninguna llamada: la mayoría de las plantillas de la
 *                     escuela son así y no tienen por qué pagar este camino.
 */

/** Lo mínimo que se le pide a un cliente de Supabase para usar el bucket. */
export interface Archivero {
  storage: {
    from(balde: string): {
      download(ruta: string): Promise<{
        data: Blob | null;
        error: { message: string } | null;
      }>;
      upload(
        ruta: string,
        cuerpo: ArrayBuffer | Blob,
        opciones?: { contentType?: string; upsert?: boolean },
      ): Promise<{ error: { message: string } | null }>;
    };
  };
}

export type Resuelta =
  | {
      ok: true;
      /** Con qué la conoce Meta. Null cuando la plantilla no lleva archivo. */
      id: string | null;
      /**
       * Dónde quedó la copia, dentro del bucket.
       *
       * ======================================================================
       * PARA QUÉ SE GUARDA UNA COPIA SI META YA LA TIENE
       * ======================================================================
       *
       * Para que el hilo la muestre. El identificador de Meta sirve para
       * mandar y para nada más: no se puede dibujar. Sin una copia nuestra, la
       * asesora manda la plantilla del workshop, el cliente recibe la imagen…
       * y en el CRM la burbuja sale con el texto solo. Se ve como si la imagen
       * no hubiera salido.
       *
       * Y de paso es la que se reusa la próxima vez, así que la imagen que
       * vino de Meta queda guardada y deja de depender de que su CDN la sirva.
       */
      ruta: string | null;
      /** El tipo de la copia, para poder dibujarla. */
      mime: string | null;
    }
  | { ok: false; error: string };

/**
 * Quién sube la imagen.
 *
 * Va como parámetro con su valor de siempre puesto para poder probar los
 * finales que en producción aparecieron una sola vez y a destiempo —la
 * dirección que no se deja bajar, el Drive que devuelve una página— sin hablar
 * con Meta. Quien lo llama de verdad no pasa nada y usa el de siempre.
 */
export type Subidor = (bytes: ArrayBuffer, mime: string) => Promise<Subida>;

/**
 * Cuánto se espera por la imagen antes de rendirse.
 *
 * La función tiene diez segundos para contestar. Bajar y subir cinco megas son
 * un par de segundos; si algo tarda más que esto, es que no va a venir, y vale
 * más decirlo que quedarse hasta que el servidor corte —porque ahí el corte no
 * explica nada—.
 */
const ESPERA_MS = 6000;

export async function encabezadoParaMeta(
  cliente: Archivero,
  /** Lo que guardó la pantalla: una ruta marcada, una dirección, o vacío. */
  valor: string | null | undefined,
  /** De qué plantilla es, para saber en qué carpeta guardar la copia. */
  plantillaId: string,
  subir: Subidor = subirImagenAMeta,
): Promise<Resuelta> {
  const puesto = (valor ?? "").trim();
  if (puesto === "") return { ok: true, id: null, ruta: null, mime: null };

  const yaEstaba = rutaDeSubida(puesto);

  const traida =
    yaEstaba != null ? await delBucket(cliente, yaEstaba) : await deLaDireccion(puesto);
  if (!traida.ok) return traida;

  const subida = await subir(traida.bytes, traida.mime);
  if (!subida.ok) return subida;

  /*
   * Si la imagen vino de una dirección, se guarda una copia.
   *
   * Es lo que permite dibujarla en el hilo —el identificador de Meta no se
   * puede mostrar— y lo que hace que la próxima vez salga sola en vez de
   * volver a depender de que esa dirección siga andando.
   *
   * Que la copia falle NO frena el envío: el mensaje ya se puede mandar y
   * perderlo por no haber podido archivar una foto sería cambiar un problema
   * chico por uno grande. Lo que se pierde es la miniatura del hilo.
   */
  const ruta =
    yaEstaba ?? (await guardarCopia(cliente, plantillaId, traida.bytes, traida.mime));

  return { ok: true, id: subida.id, ruta, mime: traida.mime };
}

async function guardarCopia(
  cliente: Archivero,
  plantillaId: string,
  bytes: ArrayBuffer,
  mime: string,
): Promise<string | null> {
  if (plantillaId === "") return null;

  const ruta = `${carpetaDePlantilla(plantillaId)}/${crypto.randomUUID()}`;
  try {
    const { error } = await cliente.storage
      .from(BALDE_WHATSAPP)
      .upload(ruta, bytes, { contentType: mime, upsert: false });
    return error ? null : ruta;
  } catch {
    return null;
  }
}

type Traida =
  | { ok: true; bytes: ArrayBuffer; mime: string }
  | { ok: false; error: string };

async function delBucket(cliente: Archivero, ruta: string): Promise<Traida> {
  try {
    const { data, error } = await cliente.storage.from(BALDE_WHATSAPP).download(ruta);

    if (error || !data) {
      return {
        ok: false,
        error:
          "No se pudo leer la imagen que se había subido" +
          (error?.message ? `: ${error.message}` : "") +
          ". Probá subirla de nuevo.",
      };
    }

    return { ok: true, bytes: await data.arrayBuffer(), mime: data.type || "image/jpeg" };
  } catch (e) {
    return {
      ok: false,
      error: `No se pudo leer la imagen subida: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

async function deLaDireccion(direccion: string): Promise<Traida> {
  if (!/^https?:\/\//i.test(direccion)) {
    return {
      ok: false,
      error:
        "La imagen del encabezado no es una dirección válida. Usá el botón «Subir imagen» " +
        "para elegir el archivo.",
    };
  }

  try {
    const r = await fetch(direccion, { signal: AbortSignal.timeout(ESPERA_MS) });

    if (!r.ok) {
      /*
       * Acá cae la imagen aprobada en Meta cuando su CDN no la vuelve a servir.
       *
       * Es el caso que dejó a la escuela sin poder mandar la plantilla del
       * workshop, y el mensaje tiene que decir el siguiente paso: la imagen
       * existe y está aprobada, pero hay que darle una copia al CRM. No alcanza
       * con «no se pudo».
       */
      return {
        ok: false,
        error:
          `No se pudo traer la imagen del encabezado (el servidor contestó ${r.status}). ` +
          "Si es la imagen que quedó guardada en Meta al aprobar la plantilla, Meta no " +
          "siempre la deja volver a bajar: subila una vez con el botón «Subir imagen» y el " +
          "CRM se encarga del resto.",
      };
    }

    const mime = (r.headers.get("content-type") ?? "").split(";")[0].trim();
    if (mime !== "" && !mime.startsWith("image/")) {
      return {
        ok: false,
        error:
          `Esa dirección no lleva a una imagen sino a «${mime}». Suele pasar con un enlace ` +
          "de Drive, que abre una página y no el archivo.",
      };
    }

    return { ok: true, bytes: await r.arrayBuffer(), mime: mime || "image/jpeg" };
  } catch (e) {
    const porQue = e instanceof Error && e.name === "TimeoutError" ? "tardó demasiado" : "falló";
    return {
      ok: false,
      error:
        `La descarga de la imagen del encabezado ${porQue}. Subila con el botón ` +
        "«Subir imagen» para no depender de esa dirección.",
    };
  }
}
