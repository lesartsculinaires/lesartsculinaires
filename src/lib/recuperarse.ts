/**
 * Qué hacer cuando la pantalla revienta, en vez de dejarla en blanco.
 *
 * ============================================================================
 * LA PANTALLA BLANCA DEL 10 DE OCTUBRE
 * ============================================================================
 *
 * «Application error: a client-side exception has occurred while loading
 * crm-les-arts.netlify.app». Es lo que Next.js pinta cuando algo falla al
 * dibujar y no hay nadie que lo ataje. El CRM no tenía a nadie: ni `error.tsx`
 * ni `global-error.tsx`. Así que cualquier falla dejaba la pantalla muerta hasta
 * que alguien apretara F5, y se perdía lo que estaba haciendo.
 *
 * La falla que más pega es un refresco que llega CORTADO. El CRM se refresca
 * solo —cada minuto y con cada cambio que hace otra persona— y cada refresco
 * es una respuesta larga que llega de a pedazos mientras el servidor junta los
 * datos. Si se corta a la mitad, el navegador se queda con medio dibujo y
 * revienta. Reproducido en el banco: una respuesta cortada a los seis segundos
 * da exactamente esa pantalla, con «network error» en la consola.
 *
 * Y se corta por dos motivos, los dos más probables cuanta más gente trabaja:
 *
 *   LA BASE LENTA      Netlify corta toda respuesta a los sesenta segundos. El
 *                      10 de octubre entre las 10:32 y las 10:42 la base tardaba
 *                      de tres a siete segundos por consulta, y la portada
 *                      encadenaba nueve.
 *
 *   UN MICROCORTE      La red de la oficina parpadea un segundo justo mientras
 *                      llega el refresco. Cada pestaña recibe el embudo entero
 *                      —2,3 MB— varias veces por minuto: hay muchas ocasiones.
 *
 * ============================================================================
 * LO QUE SE HACE AHORA
 * ============================================================================
 *
 * Se vuelve a pedir, solo, a los pocos segundos. Casi siempre alcanza: el
 * corte fue de un instante. Si falla otra vez se espera un poco más, y si en
 * dos minutos ya falló cuatro veces se deja de insistir y se ofrecen los
 * botones: ahí no es un parpadeo, y reintentar en bucle no ayuda a nadie.
 *
 * Lo que no se puede reintentar es una pieza del programa que ya no existe
 * —pasa con una pestaña abierta de antes de un despliegue—: ahí la única
 * salida es recargar la página entera, y se hace sin preguntar.
 */

export type QueHacer = "reintentar" | "recargar";

/** Cuánto esperar antes de cada reintento automático. */
export const ESPERAS_MS = [1_500, 4_000, 10_000] as const;

/** El plazo en que se cuentan las fallas para decidir si se insiste. */
export const VENTANA_MS = 2 * 60_000;

/**
 * ¿Se arregla volviendo a pedir, o hay que recargar entera la página?
 *
 * Las piezas del programa que faltan no vuelven pidiéndolas de nuevo: el
 * servidor ya tiene otra versión y esa pieza no está más. Los nombres son los
 * que usan webpack y el navegador; se miran nombre y mensaje porque según el
 * navegador llega en uno o en el otro.
 */
export function queHacerConElError(error: unknown): QueHacer {
  const nombre = error instanceof Error ? error.name : "";
  const mensaje = error instanceof Error ? error.message : String(error ?? "");
  const texto = `${nombre} ${mensaje}`;

  if (
    /ChunkLoadError/i.test(texto) ||
    /Loading (CSS )?chunk [\w-]+ failed/i.test(texto) ||
    /Failed to fetch dynamically imported module/i.test(texto) ||
    /Importing a module script failed/i.test(texto)
  ) {
    return "recargar";
  }
  return "reintentar";
}

/**
 * Cuánto esperar antes del próximo intento, o `null` si ya no conviene.
 *
 * `fallas` son los momentos de las fallas anteriores, incluida la de ahora.
 * Se cuentan sólo las de los últimos dos minutos: alguien que tuvo un corte a
 * la mañana y otro a la tarde merece el reintento rápido las dos veces.
 */
export function proximoIntento(fallas: readonly number[], ahora: number): number | null {
  const recientes = fallas.filter((t) => ahora - t <= VENTANA_MS).length;
  if (recientes === 0) return ESPERAS_MS[0];
  if (recientes > ESPERAS_MS.length) return null;
  return ESPERAS_MS[recientes - 1];
}

/** Lo que se le cuenta al servidor de cada falla. */
export interface ReporteDeError {
  mensaje: string;
  nombre: string | null;
  pila: string | null;
  digest: string | null;
  url: string | null;
  modulo: string | null;
  donde: "pagina" | "raiz";
  /** Cuántas veces había fallado ya en los últimos dos minutos. */
  intento: number;
}

const TOPES = { mensaje: 1_000, nombre: 120, pila: 4_000, digest: 120, url: 500, modulo: 80 };

const texto = (v: unknown, tope: number): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.slice(0, tope) : null;

/**
 * Deja un reporte que llegó del navegador en algo que se pueda guardar.
 *
 * Viene de afuera: cualquiera con sesión puede mandar lo que quiera a esa
 * dirección. Por eso se recorta cada campo y se descarta lo que no es texto,
 * en vez de guardar tal cual lo que llegó.
 */
export function limpiarReporte(crudo: unknown): ReporteDeError | null {
  if (typeof crudo !== "object" || crudo === null) return null;
  const r = crudo as Record<string, unknown>;
  const mensaje = texto(r.mensaje, TOPES.mensaje);
  if (!mensaje) return null;
  const intento = Number(r.intento);
  return {
    mensaje,
    nombre: texto(r.nombre, TOPES.nombre),
    pila: texto(r.pila, TOPES.pila),
    digest: texto(r.digest, TOPES.digest),
    url: texto(r.url, TOPES.url),
    modulo: texto(r.modulo, TOPES.modulo),
    donde: r.donde === "raiz" ? "raiz" : "pagina",
    intento: Number.isFinite(intento) ? Math.max(0, Math.min(99, Math.trunc(intento))) : 0,
  };
}
