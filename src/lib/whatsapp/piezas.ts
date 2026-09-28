import { huecosDe, type Hueco } from "@/lib/whatsapp/huecos";

/**
 * Qué exige una plantilla, además de su texto.
 *
 * ============================================================================
 * POR QUÉ ESTE ARCHIVO EXISTE
 * ============================================================================
 *
 * Porque el CRM mandaba sólo el cuerpo, y Meta rechazaba la campaña entera con
 * `(#131008) Required parameter is missing`. Cinco de cinco, siempre igual.
 *
 * Una plantilla de WhatsApp no es sólo texto. Tiene hasta cuatro piezas, y las
 * que llevan dato hay que mandarlas EN CADA ENVÍO:
 *
 *   HEADER    Encabezado. Puede ser texto —con o sin huecos— o una IMAGEN, un
 *             video o un documento. Si es de archivo, cada envío tiene que
 *             traer ese archivo.
 *   BODY      El texto. Es lo único que el CRM armaba.
 *   FOOTER    Una línea al pie. Nunca lleva dato: no hay nada que mandar.
 *   BUTTONS   Botones. Los de «ir a una dirección» pueden tener una parte
 *             variable al final, y ésa también se manda por envío.
 *
 * Falta una sola de ésas y Meta no manda el mensaje. No avisa cuál: dice
 * «falta un parámetro» y nada más, que es exactamente lo que dejó a la escuela
 * revisando teléfonos que estaban bien.
 *
 * ============================================================================
 * QUÉ SE LEE, Y DE DÓNDE
 * ============================================================================
 *
 * De `plantillas.payload`, que guarda tal cual lo que devuelve Meta al
 * sincronizar. Estaba ahí desde el primer día —el comentario de la migración
 * dice «para no perder los botones y encabezados que hoy no se usan»— y nunca
 * se había leído. No hace falta migración ni volver a sincronizar: el dato ya
 * está.
 */

/** Lo que puede ser un encabezado. */
export type FormatoEncabezado = "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION";

/** Un botón que pide un dato en cada envío. */
export interface BotonConDato {
  /**
   * Qué lugar ocupa entre los botones.
   *
   * Meta lo identifica por posición, no por nombre, y cuenta TODOS los botones
   * —incluidos los que no llevan dato—. Numerar sólo los variables pondría el
   * dato en el botón equivocado.
   */
  indice: number;
  /** Cómo se le pide a quien manda: el texto del botón. */
  etiqueta: string;
  /**
   * Qué clase de botón es, porque no se mandan igual.
   *
   *   url       La parte variable del final de la dirección, como texto.
   *   catalogo  El SKU de un producto del catálogo de Meta, que WhatsApp usa
   *             de miniatura del botón. Va con otra forma —una «acción»— y no
   *             como texto.
   */
  clase: "url" | "catalogo";
}

/** Todo lo que hay que darle a una plantilla para poder mandarla. */
export interface QuePide {
  encabezado: {
    formato: FormatoEncabezado;
    /** Los huecos del encabezado de texto. Vacío en los de archivo. */
    huecos: Hueco[];
    /** El encabezado es una imagen, un video o un documento. */
    esArchivo: boolean;
    /**
     * La imagen que YA quedó aprobada en Meta, cuando se puede reusar.
     *
     * ========================================================================
     * POR QUÉ ESTO EXISTE
     * ========================================================================
     *
     * Meta exige el archivo del encabezado en cada envío: la plantilla guarda
     * el diseño, no la foto. Eso es cierto y no cambia.
     *
     * Pero al aprobar la plantilla Meta se queda con la imagen de muestra, y
     * cuando se piden las plantillas la devuelve en `example.header_handle`.
     * En las versiones actuales de la API eso es una dirección de su propio
     * CDN, pública y que Meta puede bajar sin problema.
     *
     * Si está, el CRM la usa sola y no le pide nada a nadie: es exactamente lo
     * que espera quien mira la plantilla en Meta y ve la foto ahí puesta.
     * Pedirle la imagen de nuevo, para mandar la misma, es trabajo inventado —y
     * es de donde salió el «Media upload error»: al no tenerla a mano, se pegó
     * una dirección que Meta no podía bajar—.
     *
     * Cuando `header_handle` trae la forma vieja —un identificador de subida
     * como `4::aW1n…`, que no es una dirección— esto queda en null y entonces
     * sí hay que subir la imagen.
     */
    imagenAprobada: string | null;
  } | null;
  /** Los huecos del cuerpo. Es lo único que el CRM sabía pedir. */
  cuerpo: Hueco[];
  botones: BotonConDato[];
}

export const NADA_MAS: QuePide = { encabezado: null, cuerpo: [], botones: [] };

const obj = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;

const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const texto = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

/**
 * La imagen de muestra que Meta guardó al aprobar la plantilla.
 *
 * ============================================================================
 * LAS DOS FORMAS DE `header_handle`, Y POR QUÉ SÓLO SIRVE UNA
 * ============================================================================
 *
 * Meta devuelve el encabezado de archivo con un `example.header_handle`, y ahí
 * puede venir una de dos cosas:
 *
 *   UNA DIRECCIÓN     `https://scontent.whatsapp.net/…`. Es su propio CDN,
 *                     público, y Meta lo puede bajar sin permiso. Sirve tal
 *                     cual como imagen del envío.
 *
 *   UN IDENTIFICADOR  `4::aW1n…`. Es el comprobante de la subida que se hizo al
 *                     CREAR la plantilla, y no es una dirección: mandarlo como
 *                     si lo fuera termina en «Media upload error», que es
 *                     exactamente el error que se está arreglando.
 *
 * Por eso se exige que empiece con http. Distinguir por la forma y no por la
 * versión de la API es lo que hace que esto siga andando cuando Meta cambie.
 *
 * `header_url` es la otra clave con que aparece según la versión; se miran las
 * dos porque la que falte devuelve null y no cuesta nada.
 */
function laDeMeta(ejemplo: unknown): string | null {
  const e = obj(ejemplo);
  if (!e) return null;

  const candidatos = [...lista(e.header_handle), ...lista(e.header_url)];

  for (const c of candidatos) {
    const dir = texto(c);
    if (dir && /^https?:\/\//i.test(dir)) return dir;
  }

  return null;
}

/**
 * Lee la definición que dio Meta y dice qué hace falta para mandarla.
 *
 * Nunca lanza y nunca inventa: una plantilla que no se pueda leer devuelve
 * «nada más», que deja al CRM comportándose como antes —mandando sólo el
 * cuerpo— en vez de bloquear un envío por no haber entendido un formato nuevo.
 */
export function quePide(
  payload: unknown,
  /**
   * El texto del cuerpo, como respaldo.
   *
   * ==========================================================================
   * POR QUÉ HACE FALTA, Y QUÉ SE ROMPÍA SIN ESTO
   * ==========================================================================
   *
   * `payload` puede faltar: una plantilla sincronizada con una versión vieja
   * del CRM, o una fila cargada a mano. Sin respaldo, esa plantilla decía «no
   * pide nada» —ni siquiera los huecos del texto— y el envío salía SIN
   * parámetros. Meta lo rechazaba por la cuenta, y la pantalla no pedía ningún
   * dato, así que no había forma de darse cuenta mirando.
   *
   * Es peor que el problema original: antes los huecos del cuerpo se sacaban de
   * esta misma columna y siempre estaban. La columna `cuerpo` es lo que había
   * antes de todo esto y lo que sigue habiendo siempre, así que se usa cuando el
   * payload no alcanza.
   */
  cuerpo?: string | null,
): QuePide {
  const p = obj(payload);
  if (!p) {
    return { encabezado: null, cuerpo: huecosDe(cuerpo ?? null), botones: [] };
  }

  const salida: QuePide = { encabezado: null, cuerpo: [], botones: [] };

  for (const c of lista(p.components)) {
    const parte = obj(c);
    const tipo = texto(parte?.type)?.toUpperCase();
    if (!parte || !tipo) continue;

    if (tipo === "BODY") {
      salida.cuerpo = huecosDe(texto(parte.text));
      continue;
    }

    if (tipo === "HEADER") {
      // Sin formato declarado, Meta asume texto.
      const formato = (texto(parte.format)?.toUpperCase() ?? "TEXT") as FormatoEncabezado;
      const esArchivo =
        formato === "IMAGE" || formato === "VIDEO" || formato === "DOCUMENT";

      salida.encabezado = {
        formato,
        huecos: esArchivo ? [] : huecosDe(texto(parte.text)),
        esArchivo,
        imagenAprobada: esArchivo ? laDeMeta(parte.example) : null,
      };
      continue;
    }

    if (tipo === "BUTTONS") {
      lista(parte.buttons).forEach((b, i) => {
        const boton = obj(b);
        const clase = texto(boton?.type)?.toUpperCase();

        /*
         * ------------------------------------------------------------------
         * EL BOTÓN DE CATÁLOGO ES EL QUE TUMBÓ `catalogo_2026`
         * ------------------------------------------------------------------
         *
         * Es un botón sin dirección: abre el catálogo de la empresa dentro de
         * WhatsApp. Parece que no llevara nada, y por eso se pasa por alto.
         *
         * Pero Meta EXIGE mandarle una «acción» con el SKU de un producto del
         * catálogo, que es el que usa de miniatura. Sin eso rechaza el mensaje
         * entero con «falta un parámetro» —el mismo 131008 de siempre— y ni el
         * CRM viejo ni la primera versión de este archivo lo mandaban: sólo se
         * miraban los botones de dirección con `{{...}}`.
         */
        if (clase === "CATALOG") {
          salida.botones.push({
            indice: i,
            etiqueta: texto(boton?.text) ?? "Ver catálogo",
            clase: "catalogo",
          });
          return;
        }

        /*
         * De los de dirección, sólo los que tienen parte variable.
         *
         * Un botón de «respuesta rápida», uno de «llamar» o uno de dirección
         * fija viaja dentro de la plantilla y no lleva nada por envío. Pedir un
         * dato para ésos haría mandar un parámetro de más, y Meta rechaza por
         * la cuenta igual que por la falta.
         */
        if (clase !== "URL") return;
        if (huecosDe(texto(boton?.url)).length === 0) return;

        salida.botones.push({
          indice: i,
          etiqueta: texto(boton?.text) ?? `Botón ${i + 1}`,
          clase: "url",
        });
      });
    }
  }

  /*
   * Si el payload no traía BODY, se usa el texto de la columna.
   *
   * Pasa con payloads guardados a medias. Que la plantilla siga pidiendo sus
   * huecos es lo que evita mandarla sin datos.
   */
  if (salida.cuerpo.length === 0) salida.cuerpo = huecosDe(cuerpo ?? null);

  return salida;
}

/**
 * Lo que el CRM todavía no puede darle a esta plantilla.
 *
 * ----------------------------------------------------------------------------
 * POR QUÉ SE AVISA ANTES Y NO SE INTENTA
 * ----------------------------------------------------------------------------
 *
 * Porque intentarlo es mandarle trescientas peticiones a Meta que van a fallar
 * todas, y muchos errores seguidos le bajan la calificación al número de la
 * escuela. Además el error que devuelve —«falta un parámetro»— no dice cuál,
 * así que quien lo lea va a terminar revisando teléfonos.
 *
 * Devuelve null cuando la plantilla se puede mandar con lo que hay.
 */
export function loQueFalta(pide: QuePide, dio: DatosDeLaPlantilla): string | null {
  if (pide.encabezado?.esArchivo && !dio.archivoEncabezado) {
    const comoSeLlama: Record<string, string> = {
      IMAGE: "una imagen",
      VIDEO: "un video",
      DOCUMENT: "un documento",
    };
    return (
      `Esta plantilla lleva ${comoSeLlama[pide.encabezado.formato] ?? "un archivo"} de ` +
      "encabezado. Hay que subirla con el botón «Subir imagen» antes de mandarla: " +
      "la que se le subió a Meta al crear la plantilla es sólo la muestra de la revisión, " +
      "y no viaja con el mensaje."
    );
  }

  if (pide.encabezado?.formato === "LOCATION") {
    return (
      "Esta plantilla lleva una ubicación en el encabezado, y el CRM todavía no sabe " +
      "mandarla. Usá otra plantilla."
    );
  }

  const faltanEncabezado = (pide.encabezado?.huecos.length ?? 0) - dio.encabezado.length;
  if (faltanEncabezado > 0) {
    return `Faltan ${faltanEncabezado} ${faltanEncabezado === 1 ? "dato" : "datos"} del encabezado.`;
  }

  const faltanCuerpo = pide.cuerpo.length - dio.cuerpo.length;
  if (faltanCuerpo > 0) {
    return `Faltan ${faltanCuerpo} ${faltanCuerpo === 1 ? "dato" : "datos"} de la plantilla.`;
  }

  const faltanBotones = pide.botones.length - dio.botones.length;
  if (faltanBotones > 0) {
    return `Faltan ${faltanBotones} ${faltanBotones === 1 ? "dato" : "datos"} de los botones.`;
  }

  /*
   * El del catálogo, con su explicación completa.
   *
   * Es el único dato que no se saca de ningún lado del CRM: sale del catálogo
   * de Meta, que la escuela tiene que tener conectado a su cuenta de WhatsApp.
   * Decir sólo «falta un dato» mandaría a buscarlo donde no está.
   */
  const catalogo = pide.botones.findIndex((b) => b.clase === "catalogo");
  if (catalogo >= 0 && !(dio.botones[catalogo] ?? "").trim()) {
    return (
      "Esta plantilla lleva un botón de catálogo, y WhatsApp exige el código (SKU) de un " +
      "producto para usarlo de miniatura. Sale del catálogo de Meta Commerce que esté " +
      "conectado a la cuenta de WhatsApp; sin catálogo conectado, esta plantilla no se " +
      "puede mandar desde ningún lado."
    );
  }

  return null;
}

/** Lo que quien manda llenó, para cada pieza. */
export interface DatosDeLaPlantilla {
  /** Los huecos del encabezado de texto, en orden. */
  encabezado: string[];
  /** Los huecos del cuerpo, en orden. */
  cuerpo: string[];
  /** La parte variable de cada botón de dirección, en orden. */
  botones: string[];
  /** La dirección del archivo, cuando el encabezado es imagen/video/documento. */
  archivoEncabezado?: string | null;
  /** El nombre con que se muestra un documento de encabezado. */
  nombreArchivo?: string | null;
}

/**
 * El bloque `components` que va en el envío.
 *
 * ============================================================================
 * EL ORDEN Y LA FORMA LOS PONE META, NO NOSOTROS
 * ============================================================================
 *
 * Cada pieza va con su `type` en minúscula, y los parámetros en el mismo orden
 * en que aparecen en la plantilla. Una pieza sin datos NO se manda: mandarla
 * vacía es un error igual que no mandarla.
 *
 * `parameter_name` sólo cuando la plantilla usa nombres —`{{order_id}}`— y
 * nunca cuando usa posiciones. Es el mismo criterio que ya usaba el cuerpo; lo
 * que cambia es que ahora vale para las tres piezas.
 */
export function componentesPara(
  pide: QuePide,
  dio: DatosDeLaPlantilla,
): { type: string; [k: string]: unknown }[] | undefined {
  const partes: { type: string; [k: string]: unknown }[] = [];

  if (pide.encabezado?.esArchivo && dio.archivoEncabezado) {
    const clase = pide.encabezado.formato.toLowerCase();
    partes.push({
      type: "header",
      parameters: [
        {
          type: clase,
          [clase]: {
            link: dio.archivoEncabezado,
            // Sólo los documentos llevan nombre; en una imagen Meta lo rechaza.
            ...(pide.encabezado.formato === "DOCUMENT" && dio.nombreArchivo
              ? { filename: dio.nombreArchivo }
              : {}),
          },
        },
      ],
    });
  } else if (pide.encabezado && pide.encabezado.huecos.length > 0) {
    partes.push({
      type: "header",
      parameters: comoLosQuiereMeta(pide.encabezado.huecos, dio.encabezado),
    });
  }

  if (pide.cuerpo.length > 0) {
    partes.push({
      type: "body",
      parameters: comoLosQuiereMeta(pide.cuerpo, dio.cuerpo),
    });
  }

  /*
   * Un componente por botón, con su índice.
   *
   * Meta los identifica por posición dentro de la plantilla, no por orden de
   * aparición acá: por eso va `index` y no vale con mandarlos ordenados.
   */
  pide.botones.forEach((b, i) => {
    const valor = dio.botones[i];
    if (valor == null) return;

    /*
     * El de catálogo va con una «acción», no con un texto.
     *
     * `thumbnail_product_retailer_id` es el SKU de un producto del catálogo que
     * la escuela tenga conectado en Meta: WhatsApp lo usa de miniatura del
     * botón. Es lo que Meta pide y lo que faltaba.
     */
    if (b.clase === "catalogo") {
      partes.push({
        type: "button",
        sub_type: "catalog",
        index: String(b.indice),
        parameters: [
          { type: "action", action: { thumbnail_product_retailer_id: valor } },
        ],
      });
      return;
    }

    partes.push({
      type: "button",
      sub_type: "url",
      index: String(b.indice),
      parameters: [{ type: "text", text: valor }],
    });
  });

  return partes.length > 0 ? partes : undefined;
}

/**
 * Los parámetros de una pieza, con o sin nombre según cómo esté escrita.
 *
 * Con `{{1}}` va la lista y el orden manda. Con `{{order_id}}` va el nombre al
 * lado de cada valor. Mezclarlos es lo que Meta rechaza, y no se pueden mezclar
 * dentro de una misma plantilla: Meta no deja crearla así.
 */
function comoLosQuiereMeta(
  huecos: readonly Hueco[],
  valores: readonly string[],
): Record<string, string>[] {
  const conNombre = huecos.some((h) => !/^\d+$/.test(h.clave));

  return huecos.map((h, i) => ({
    type: "text",
    ...(conNombre ? { parameter_name: h.clave } : {}),
    text: valores[i] ?? "",
  }));
}

/**
 * Cómo se le cuenta a una persona qué necesita esta plantilla.
 *
 * Para la pantalla de Plantillas y para la de envío: quien va a mandar tiene
 * que poder saber, antes de marcar a trescientos, si esa plantilla se puede
 * mandar desde acá.
 */
export function comoSeLee(pide: QuePide): string[] {
  const partes: string[] = [];

  if (pide.encabezado?.esArchivo) {
    const como: Record<string, string> = {
      IMAGE: "una imagen de encabezado",
      VIDEO: "un video de encabezado",
      DOCUMENT: "un documento de encabezado",
    };
    partes.push(como[pide.encabezado.formato] ?? "un archivo de encabezado");
  } else if (pide.encabezado && pide.encabezado.huecos.length > 0) {
    const n = pide.encabezado.huecos.length;
    partes.push(`${n} ${n === 1 ? "dato" : "datos"} en el encabezado`);
  }

  if (pide.cuerpo.length > 0) {
    const n = pide.cuerpo.length;
    partes.push(`${n} ${n === 1 ? "dato" : "datos"} en el texto`);
  }

  if (pide.botones.some((b) => b.clase === "catalogo")) {
    partes.push("el código de un producto del catálogo de Meta");
  }

  const deDireccion = pide.botones.filter((b) => b.clase === "url").length;
  if (deDireccion > 0) {
    partes.push(
      `${deDireccion} ${deDireccion === 1 ? "dato" : "datos"} en ` +
        `${deDireccion === 1 ? "el botón" : "los botones"} de dirección`,
    );
  }

  return partes;
}

/**
 * Todo lo que hay que pedirle a quien manda, en una sola lista y en orden.
 *
 * ============================================================================
 * POR QUÉ UNA LISTA PLANA Y NO TRES
 * ============================================================================
 *
 * Porque quien manda no piensa en piezas: ve casillas y las llena. Y porque el
 * envío ya guarda lo que se puso en `envios.valores`, que es una lista: partirla
 * en tres obligaría a migrar esa columna y a reescribir el historial de las
 * campañas viejas para algo que no cambia lo que se ve.
 *
 * El orden es el mismo que Meta espera —encabezado, cuerpo, botones— así que
 * `repartirValores` lo deshace sin ambigüedad.
 */
export interface Pedido {
  /** Cómo se le pide a quien manda. */
  etiqueta: string;
  /** De qué pieza es, para poder agruparlas en la pantalla. */
  pieza: "encabezado" | "cuerpo" | "boton";
  /**
   * Es la dirección de un archivo, no un texto.
   *
   * La pantalla lo usa para pedir un enlace en vez de una palabra, y para no
   * ofrecer «el nombre del cliente», que en una imagen no significa nada.
   */
  esArchivo: boolean;
  /**
   * Se puede mandar sin llenarlo.
   *
   * Hoy es un solo caso: la imagen del encabezado cuando Meta ya tiene una
   * aprobada y el CRM la puede reusar. La casilla se sigue ofreciendo —porque a
   * veces se quiere mandar OTRA imagen— pero no frena el envío.
   *
   * El pedido NO se saca de la lista aunque no haga falta. `pedidosDe` y
   * `repartirValores` son inversos y se cuentan por posición: sacando uno de un
   * lado y no del otro, el nombre del cliente terminaría en el botón y la fecha
   * en el texto, sin que nada falle. Se marca, no se quita.
   */
  opcional: boolean;
  /** Lo que se va a mandar si se deja en blanco. Hoy, la imagen ya aprobada. */
  porOmision: string | null;
}

export function pedidosDe(pide: QuePide): Pedido[] {
  const salida: Pedido[] = [];

  if (pide.encabezado?.esArchivo) {
    /*
     * Se nombra la COSA, no su dirección.
     *
     * Decía «Dirección de la imagen del encabezado», de cuando había que pegar
     * un enlace. Ahora hay un botón que sube el archivo, y pedir una dirección
     * describe el camino de atrás como si fuera el principal.
     */
    const como: Record<string, string> = {
      IMAGE: "La imagen del encabezado",
      VIDEO: "El video del encabezado",
      DOCUMENT: "El documento del encabezado",
    };
    salida.push({
      etiqueta: como[pide.encabezado.formato] ?? "El archivo del encabezado",
      pieza: "encabezado",
      esArchivo: true,
      // Si Meta ya tiene la imagen aprobada, no hay nada que pedir: se manda
      // ésa. La casilla queda por si se quiere mandar otra.
      opcional: pide.encabezado.imagenAprobada != null,
      porOmision: pide.encabezado.imagenAprobada,
    });
  } else {
    for (const h of pide.encabezado?.huecos ?? []) {
      salida.push({
        etiqueta: `Encabezado — ${h.etiqueta}`,
        pieza: "encabezado",
        esArchivo: false,
        opcional: false,
        porOmision: null,
      });
    }
  }

  for (const h of pide.cuerpo) {
    salida.push({
      etiqueta: h.etiqueta,
      pieza: "cuerpo",
      esArchivo: false,
      opcional: false,
      porOmision: null,
    });
  }

  for (const b of pide.botones) {
    salida.push({
      etiqueta:
        b.clase === "catalogo"
          ? `Botón «${b.etiqueta}» — el código (SKU) del producto que se ve de miniatura`
          : `Botón «${b.etiqueta}» — la parte variable de su dirección`,
      pieza: "boton",
      esArchivo: false,
      opcional: false,
      porOmision: null,
    });
  }

  return salida;
}

/**
 * Deshace la lista plana y la devuelve por piezas.
 *
 * El inverso exacto de `pedidosDe`, y por eso los dos viven acá: separados, uno
 * cambiaría sin el otro y los datos irían a la pieza equivocada —el nombre del
 * cliente en el botón, la fecha en el texto— sin que nada fallara.
 */
export function repartirValores(pide: QuePide, planos: readonly string[]): DatosDeLaPlantilla {
  let i = 0;

  /*
   * La imagen: lo que se eligió, y si no, la que Meta ya tiene aprobada.
   *
   * El respaldo va ACÁ y en ningún otro lado. `repartirValores` es el único
   * paso por el que pasan todos los caminos —el hilo, el chat nuevo, cada tanda
   * del envío masivo— así que poniéndolo acá las tres pantallas mandan lo
   * mismo. Repartido entre ellas, una se olvidaría y esa plantilla volvería a
   * pedir una imagen que no hace falta.
   */
  const puesta = pide.encabezado?.esArchivo ? (planos[i++] ?? "") : "";
  const archivoEncabezado = pide.encabezado?.esArchivo
    ? puesta.trim() !== ""
      ? puesta
      : (pide.encabezado.imagenAprobada ?? null)
    : null;

  const encabezado = pide.encabezado?.esArchivo
    ? []
    : (pide.encabezado?.huecos ?? []).map(() => planos[i++] ?? "");

  const cuerpo = pide.cuerpo.map(() => planos[i++] ?? "");
  const botones = pide.botones.map(() => planos[i++] ?? "");

  return { encabezado, cuerpo, botones, archivoEncabezado };
}
