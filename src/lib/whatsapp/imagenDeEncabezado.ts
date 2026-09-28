/**
 * La imagen que lleva una plantilla en el encabezado: subirla, no pegar un enlace.
 *
 * ============================================================================
 * QUÉ PROBLEMA RESUELVE
 * ============================================================================
 *
 * Una plantilla con encabezado de imagen —la del workshop de la escuela— exige
 * la imagen EN CADA ENVÍO. La que se subió al editor de Meta es sólo la muestra
 * para que la revisen: no viaja con la plantilla.
 *
 * La primera versión pedía la dirección de la imagen, escrita a mano. Eso
 * supone tener la foto publicada en algún lado con un enlace directo, que no es
 * algo que una asesora tenga. Ahora se elige el archivo y el CRM se encarga.
 *
 * ============================================================================
 * POR QUÉ SE GUARDA LA RUTA Y NO LA DIRECCIÓN
 * ============================================================================
 *
 * Porque el bucket es privado, y así se queda. Meta necesita poder bajar la
 * imagen, así que hace falta una dirección pública —pero no hace falta que sea
 * PERMANENTE—: se le firma una que caduca, Meta la baja mientras contesta la
 * llamada, y después esa dirección no le sirve a nadie. Es exactamente lo que
 * ya hace el Inbox con las fotos que manda una asesora.
 *
 * Entonces lo que se guarda en el envío es la ruta dentro del bucket, marcada
 * con `subida:` para distinguirla de un enlace pegado a mano. La firma se hace
 * en el último momento, del lado del servidor.
 *
 * ESO IMPORTA DE VERDAD EN EL ENVÍO MASIVO. Una campaña de trescientos sale por
 * tandas y puede quedar a medias horas —o días— si Meta corta. Si en
 * `envios.valores` se hubiera guardado una dirección firmada, la campaña se
 * moriría a los cinco minutos y el resto de la lista fallaría con un error que
 * no menciona ninguna firma. Con la ruta guardada, cada tanda firma la suya.
 */

/**
 * La marca que distingue una ruta del bucket de un enlace escrito a mano.
 *
 * Se eligió una marca explícita en vez de adivinar por la forma —«¿empieza con
 * http?»— porque el valor viaja por `envios.valores`, que es una columna de
 * texto libre y vieja: adivinar convertiría en subida cualquier cosa que un
 * día se escribiera distinta.
 */
export const MARCA_DE_SUBIDA = "subida:";

/** Dónde viven, dentro de «saliente/». Una carpeta propia para poder mirarlas. */
export const CARPETA_DE_PLANTILLAS = "plantillas";

/**
 * Lo que acepta Meta en el encabezado de una plantilla.
 *
 * Es más angosto que lo que acepta el chat: en un encabezado de plantilla sólo
 * entran JPG y PNG. El webp se puede mandar por el chat pero acá lo rechaza, y
 * el error no dice por qué, así que se filtra antes de subir.
 */
export const IMAGENES_DE_ENCABEZADO = ["image/jpeg", "image/png"];

/** Lo que va en el `accept` del selector. Con extensiones, por Windows. */
export const ACEPTA_ENCABEZADO = [...IMAGENES_DE_ENCABEZADO, ".jpg", ".jpeg", ".png"].join(",");

/**
 * Tope de Meta para la imagen de un encabezado: 5 MB.
 *
 * No es nuestro: es de ellos, y pasarlo hace fallar el envío y no la subida, o
 * sea en el peor momento —con la campaña ya empezada—. Por eso se comprueba en
 * la pantalla, antes de subir nada.
 */
export const TOPE_ENCABEZADO_BYTES = 5 * 1024 * 1024;

/** Marca una ruta del bucket como subida, para guardarla entre los valores. */
export const comoSubida = (ruta: string): string => `${MARCA_DE_SUBIDA}${ruta}`;

/** ¿Este valor es una imagen que se subió, en vez de un enlace pegado? */
export const esSubida = (valor: string | null | undefined): boolean =>
  typeof valor === "string" && valor.startsWith(MARCA_DE_SUBIDA);

/** La ruta dentro del bucket, o null si el valor no es una subida. */
export const rutaDeSubida = (valor: string | null | undefined): string | null =>
  esSubida(valor) ? (valor as string).slice(MARCA_DE_SUBIDA.length) : null;

/**
 * Lo mínimo que se le pide a un cliente de Supabase para poder firmar.
 *
 * Se describe por su forma y no se importa el tipo de Supabase para que esta
 * función se pueda probar con un doble, sin levantar nada. Firmar es la parte
 * que más callada falla —devuelve una dirección que Meta no puede bajar— así
 * que conviene que tenga prueba.
 */
export interface Firmante {
  storage: {
    from(balde: string): {
      createSignedUrl(
        ruta: string,
        segundos: number,
      ): Promise<{
        data: { signedUrl: string } | null;
        error: { message: string } | null;
      }>;
    };
  };
}

/**
 * Cuánto dura la firma.
 *
 * Meta baja la imagen mientras contesta la llamada —un par de segundos—, así
 * que con un minuto alcanzaría. Se dan diez porque una tanda de envío masivo
 * son cien mensajes seguidos y la misma firma se usa para todos: que la última
 * del lote se caiga por tiempo sería un fallo intermitente, de los que no se
 * reproducen mirando.
 *
 * Sigue siendo muy menos que lo que dura un descuido, que es lo que esta
 * caducidad protege.
 */
export const MINUTOS_DE_FIRMA = 10;

export type Firmada =
  | { ok: true; enlace: string }
  | { ok: false; error: string };

/**
 * La dirección que se le da a Meta para que baje la imagen.
 *
 * Un enlace pegado a mano vuelve tal cual: ya es público y no hay nada que
 * firmar. Una subida se firma contra el bucket.
 */
export async function enlaceParaMeta(
  cliente: Firmante,
  balde: string,
  valor: string,
): Promise<Firmada> {
  const ruta = rutaDeSubida(valor);
  if (ruta == null) return { ok: true, enlace: valor };

  const { data, error } = await cliente.storage
    .from(balde)
    .createSignedUrl(ruta, MINUTOS_DE_FIRMA * 60);

  if (error || !data?.signedUrl) {
    return {
      ok: false,
      error:
        "No se pudo preparar la imagen del encabezado" +
        (error?.message ? `: ${error.message}` : "") +
        ". Probá subirla de nuevo.",
    };
  }

  return { ok: true, enlace: data.signedUrl };
}

/**
 * Cómo se nombra una subida en la pantalla.
 *
 * La ruta cruda —«saliente/plantillas/9f3e…»— no le dice nada a nadie y encima
 * se vería dentro de la vista previa del mensaje. Donde haya que mostrar el
 * valor, se muestra esto.
 */
export const comoSeLlama = (valor: string): string =>
  esSubida(valor) ? "la imagen subida" : valor;
